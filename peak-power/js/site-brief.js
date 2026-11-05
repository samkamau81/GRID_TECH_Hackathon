/* Site brief logic for the Data Center Climate Explorer: pure functions, no DOM, so they can be unit-tested in Node.

   Inputs (all built from the Prototype or public data, see README):
     outlines  data/processed/county-outlines.json   county shapes in lat/lon (from the Prototype's own county map)
     grades    js/data/site-grades.js                the Prototype's county grades, key facts and its delay-case engine results
     plants    data/processed/eia860-plants.json     US power plants from the EIA-860 survey (nameplate MW, operating and planned)

   Nothing here re-implements the Prototype's grading. It only decodes what the Prototype computed. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SiteBrief = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var GROUPS = ['Gas', 'Coal', 'Nuclear', 'Hydro', 'Wind', 'Solar', 'Battery', 'Other'];
  var ZERO_CARBON = [2, 3, 4, 5];                    // nuclear, hydro, wind, solar (battery stores energy, it does not make it)
  var FACTORS = [['loc', 'Location'], ['en', 'Energy'], ['pol', 'Policy'], ['fib', 'Fiber'], ['water', 'Water'], ['haz', 'Natural hazard'], ['zon', 'Local zoning'], ['pwr', 'Time to power']];
  var GRADE_CLASS = ['g', 'm', 'b', 'n', 'x'];       // 0 Good, 1 Moderate, 2 Bad, 3 Not graded, 4 Excellent (the Prototype's digits)
  var EARTH_MI = 3958.8;
  // Screening assumption: how late the grid connection is for each Time-to-power grade (Good, Moderate, Bad). Not graded: no scenario.
  var DELAY_MONTHS = { 0: 0, 1: 6, 2: 12 };

  // ------------------------------------------------------------------ distance and nearby generation
  function rad(d) { return d * Math.PI / 180; }
  function haversineMi(lat1, lon1, lat2, lon2) {
    var dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * EARTH_MI * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function dominant(op) { var k = 0; for (var i = 1; i < op.length; i++) if (op[i] > op[k]) k = i; return k; }

  /* Plants within `miles` of a point. plants: [[lat, lon, state, name, op[8], pl[8]], ...] (MW nameplate by GROUPS).
     Returns { n, op, pl, top }: plant count, operating and planned MW by group, and the five largest operating plants (named ones only). */
  function nearbyPlants(plants, lat, lon, miles) {
    var op = new Array(8).fill(0), pl = new Array(8).fill(0), n = 0, top = [];
    var dLat = miles / 69, dLon = miles / (69 * Math.max(0.2, Math.cos(rad(lat))));
    for (var i = 0; i < plants.length; i++) {
      var p = plants[i];
      if (Math.abs(p[0] - lat) > dLat || Math.abs(p[1] - lon) > dLon) continue;
      var d = haversineMi(lat, lon, p[0], p[1]);
      if (d > miles) continue;
      n++;
      for (var g = 0; g < 8; g++) { op[g] += p[4][g]; pl[g] += p[5][g]; }
      var mw = sum(p[4]);
      if (p[3] && mw >= 50) top.push({ name: p[3], state: p[2], mw: mw, group: GROUPS[dominant(p[4])], miles: d });
    }
    top.sort(function (a, b) { return b.mw - a.mw; });
    return { n: n, op: op, pl: pl, top: top.slice(0, 5) };
  }

  /* Share of operating nameplate that is zero-carbon (nuclear, hydro, wind, solar). Batteries are left out of both sides.
     This is capacity, not energy or emissions: a wind farm's nameplate produces far less than a gas plant's over a year. */
  function zeroCarbonShare(op) {
    var total = 0, clean = 0;
    for (var g = 0; g < 8; g++) { if (g === 6) continue; total += op[g]; if (ZERO_CARBON.indexOf(g) >= 0) clean += op[g]; }
    return total > 0 ? clean / total : null;
  }

  // ------------------------------------------------------------------ county lookup
  /* Decode county-outlines.json into rings of [lon, lat] with bounding boxes. */
  function decodeOutlines(doc) {
    var scale = doc.scale, list = [];
    Object.keys(doc.c).forEach(function (f) {
      var rings = [], minLon = 1e9, minLat = 1e9, maxLon = -1e9, maxLat = -1e9;
      doc.c[f].forEach(function (flat) {
        var pts = new Float64Array(flat.length), x = 0, y = 0;
        for (var i = 0; i < flat.length; i += 2) {
          x += flat[i]; y += flat[i + 1];
          pts[i] = x / scale; pts[i + 1] = y / scale;
          if (pts[i] < minLon) minLon = pts[i]; if (pts[i] > maxLon) maxLon = pts[i];
          if (pts[i + 1] < minLat) minLat = pts[i + 1]; if (pts[i + 1] > maxLat) maxLat = pts[i + 1];
        }
        rings.push(pts);
      });
      list.push({ f: f, rings: rings, box: [minLon, minLat, maxLon, maxLat] });
    });
    return list;
  }
  function inRing(pts, lon, lat) {
    var inside = false, n = pts.length / 2;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var xi = pts[2 * i], yi = pts[2 * i + 1], xj = pts[2 * j], yj = pts[2 * j + 1];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  /* The county containing a point (even-odd across a county's rings, so islands and holes work), or the county whose outline is within ~8 km
     (flagged `near`) because the outlines are generalised, or null when the point is not in the contiguous US. */
  function findCounty(index, lat, lon) {
    var best = null, bestD = 0.08 * 0.08, i, k;
    for (i = 0; i < index.length; i++) {
      var c = index[i], b = c.box;
      if (lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3]) {
        var inside = false;
        for (k = 0; k < c.rings.length; k++) if (inRing(c.rings[k], lon, lat)) inside = !inside;
        if (inside) return { f: c.f, near: false };
      }
    }
    var cl = Math.cos(rad(lat));
    for (i = 0; i < index.length; i++) {
      var c2 = index[i];
      if (lon < c2.box[0] - 0.1 || lon > c2.box[2] + 0.1 || lat < c2.box[1] - 0.1 || lat > c2.box[3] + 0.1) continue;
      for (k = 0; k < c2.rings.length; k++) {
        var pts = c2.rings[k];
        for (var j = 0; j < pts.length; j += 2) {
          var dx = (pts[j] - lon) * cl, dy = pts[j + 1] - lat, d2 = dx * dx + dy * dy;
          if (d2 < bestD) { bestD = d2; best = c2.f; }
        }
      }
    }
    return best ? { f: best, near: true } : null;
  }

  // ------------------------------------------------------------------ grades and facts
  /* '010201030' -> { overall: 0, loc: 1, en: 0, ... } using the digit order documented in site-grades.js. */
  function parseGrades(code) {
    var out = { overall: +code[0] };
    FACTORS.forEach(function (f, i) { out[f[0]] = +code[i + 1]; });
    return out;
  }

  /* One short factual line per factor for a county, from the numbers the Prototype exported. */
  function factorFacts(G, fips) {
    var k = G.k[fips], st = G.states[fips.slice(0, 2)], grades = parseGrades(G.g[fips]);
    var name = k[0], dm = k[1], metro = G.metros[k[2]], fd = k[3], wp = k[4], hp = k[5], q = k[6] == null ? null : G.qreg[k[6]], z = k[7];
    var polText = ['No statewide pause or incentive freeze found in the sources reviewed',
      'Incentives frozen or narrowed, a moratorium proposed, or sources conflict', 'A statewide pause on data center permits is in effect'][st.g] || '';
    var facts = {
      loc: dm + ' mi to ' + metro,
      en: z == null ? 'Not graded outside Texas: the dispatch model covers ERCOT only' :
        z === 0 ? 'ERCOT load zone: deep gas and grid supply near demand' : z === 1 ? 'West Texas wind belt: congested transmission' : 'Outside ERCOT or on its edge',
      pol: polText,
      fib: fd == null ? 'No listed network facility nearby' : fd + ' mi to the nearest network facility',
      water: wp == null ? 'No water stress data' : wp < 0 ? 'Arid watershed: cooling water will be scarce' : wp + '% of available water already withdrawn',
      haz: hp == null ? 'No FEMA risk data' : 'Expected building loss is higher than in ' + hp + '% of US counties',
      zon: grades.zon === 1 ? 'A local pause on data centers is under consideration' : 'Not scored: needs county and city zoning data',
      pwr: !q ? 'No queue data' : (q.med == null || q.n < 15) ? 'Too few plants reached operation in the ' + q.name + ' area to measure a wait' :
        q.name + ' area: median ' + q.med + ' years from interconnection request to operation'
    };
    return { county: name, state: st, grades: grades, facts: facts, region: st.reg, queue: q };
  }

  /* The Prototype engine's result for the grid connection arriving late by the months implied by the county's Time-to-power grade, next to the
     on-time reference case. Returns null when the county has no Time-to-power grade. */
  function delayScenario(G, pwrGrade) {
    if (!(pwrGrade in DELAY_MONTHS)) return null;
    var months = DELAY_MONTHS[pwrGrade];
    var base = G.delay.filter(function (d) { return d.months === 0; })[0];
    var sc = G.delay.filter(function (d) { return d.months === months; })[0];
    if (!base || !sc) return null;
    return { months: months, base: base, scenario: sc, dOpen: sc.open - base.open, dProfit: sc.profit - base.profit, dPerMWh: sc.perMWh - base.perMWh, dKg: sc.kg - base.kg };
  }

  return { GROUPS: GROUPS, FACTORS: FACTORS, GRADE_CLASS: GRADE_CLASS, DELAY_MONTHS: DELAY_MONTHS, ZERO_CARBON: ZERO_CARBON,
    haversineMi: haversineMi, nearbyPlants: nearbyPlants, zeroCarbonShare: zeroCarbonShare, decodeOutlines: decodeOutlines, findCounty: findCounty,
    parseGrades: parseGrades, factorFacts: factorFacts, delayScenario: delayScenario };
});
