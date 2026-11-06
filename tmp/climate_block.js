
  // ------------------------------------------------------------------ cooling climate (history)
  /* WHAT THIS IS: how hard the local climate makes it to cool a data hall, from three full years of hourly temperature and humidity (ERA5
     reanalysis through Open-Meteo, about 10 km grid; model values, not a weather station at the site). It describes the CLIMATE, not a cooling design:
     it does not say what a given chiller plant would use. Hot-hour counts and percentiles are per year, averaged over the years returned.

     Wet-bulb temperature is calculated from air temperature and relative humidity with Stull (2011), accurate to about 1 C for humidity 5-99% and
     temperature -20 to 50 C. It is a screening number: it sets how far evaporative cooling can chill water, so many humid hours mean less cooling
     capacity and more mechanical help. */
  var COOL_BELOW_F = 65;          // below this, outside air does most of the cooling (free cooling / economiser hours)
  var HOT_F = 95;                 // dry-bulb hours at or above this stress air-cooled chillers
  var HUMID_WB_F = 75;            // wet-bulb hours at or above this limit evaporative cooling
  var BAND_HOT_F = 85;            // heavy mechanical cooling band
  /* Screening grade for cooling climate: Mild / Moderate / Demanding. Team assumption, shown to the user; tune here. */
  var CLIMATE_RULES = {
    mild: { freeMin: 0.55, humidMax: 300, hotMax: 100 },                 // all three must hold
    demanding: { freeBelow: 0.35, humidAbove: 1500, hotAbove: 1000 }     // any one is enough
  };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function wetBulbF(tF, rh) {
    var t = (tF - 32) * 5 / 9, h = Math.max(5, Math.min(99, rh));
    var tw = t * Math.atan(0.151977 * Math.sqrt(h + 8.313659)) + Math.atan(t + h) - Math.atan(h - 1.676331) +
      0.00391838 * Math.pow(h, 1.5) * Math.atan(0.023101 * h) - 4.686035;
    return tw * 9 / 5 + 32;
  }
  function percentile(sorted, p) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))] : null; }
  function whole(v) { return Math.round(v).toLocaleString('en-US'); }

  /* grade: 0 Mild, 1 Moderate, 2 Demanding; `why` is plain sentences naming the numbers that decided it. */
  function gradeClimate(c) {
    var R = CLIMATE_RULES, why = [];
    if (c.free < R.demanding.freeBelow) why.push('only ' + Math.round(c.free * 100) + '% of hours are below ' + COOL_BELOW_F + ' °F');
    if (c.humidHours > R.demanding.humidAbove) why.push(whole(c.humidHours) + ' hours a year are humid enough (wet-bulb ≥ ' + HUMID_WB_F + ' °F) to limit evaporative cooling');
    if (c.hotHours > R.demanding.hotAbove) why.push(whole(c.hotHours) + ' hours a year reach ' + HOT_F + ' °F or more');
    if (why.length) return { grade: 2, why: why };
    if (c.free >= R.mild.freeMin && c.humidHours <= R.mild.humidMax && c.hotHours <= R.mild.hotMax) {
      return { grade: 0, why: [Math.round(c.free * 100) + '% of hours are below ' + COOL_BELOW_F + ' °F, with few hot or humid hours'] };
    }
    var m = [];
    if (c.free < R.mild.freeMin) m.push('free cooling covers ' + Math.round(c.free * 100) + '% of hours');
    if (c.humidHours > R.mild.humidMax) m.push(whole(c.humidHours) + ' humid hours a year');
    if (c.hotHours > R.mild.hotMax) m.push(whole(c.hotHours) + ' hours a year at ' + HOT_F + ' °F or more');
    return { grade: 1, why: [m.join('; ')] };
  }

  /* Turn hourly series (time 'YYYY-MM-DDTHH:MM' local, temperature in F, relative humidity in %) into the cooling-climate summary.
     Missing hours (null) are skipped; "hours a year" is the share of valid hours times 8,760, so a partly missing year does not understate it. */
  function summarizeClimate(time, temp, rh) {
    var n = 0, cool = 0, mid = 0, hot = 0, hotH = 0, humidH = 0, temps = [], wbs = [];
    var years = {}, dayT = {}, monthSum = new Array(12).fill(0), monthN = new Array(12).fill(0);
    for (var i = 0; i < time.length; i++) {
      var t = temp[i], h = rh[i];
      if (typeof t !== 'number' || !isFinite(t) || typeof h !== 'number' || !isFinite(h)) continue;
      var w = wetBulbF(t, h);
      n++; temps.push(t); wbs.push(w);
      if (t < COOL_BELOW_F) cool++; else if (t < BAND_HOT_F) mid++; else hot++;
      if (t >= HOT_F) hotH++;
      if (w >= HUMID_WB_F) humidH++;
      var day = time[i].slice(0, 10), mo = parseInt(time[i].slice(5, 7), 10) - 1;
      years[time[i].slice(0, 4)] = 1;
      var d = dayT[day] || (dayT[day] = { s: 0, n: 0, mo: mo }); d.s += t; d.n++;
      monthSum[mo] += t; monthN[mo]++;
    }
    if (!n) return null;
    var dayKeys = Object.keys(dayT), cddTotal = 0, monthCdd = new Array(12).fill(0);
    dayKeys.forEach(function (k) { var d = dayT[k], v = Math.max(0, d.s / d.n - COOL_BELOW_F); cddTotal += v; monthCdd[d.mo] += v; });
    var yrs = Math.max(0.5, dayKeys.length / 365.25);
    temps.sort(function (a, b) { return a - b; }); wbs.sort(function (a, b) { return a - b; });
    var out = {
      years: Object.keys(years).length, hours: n,
      cdd: cddTotal / yrs,
      p95: percentile(temps, 0.95), p95Wb: percentile(wbs, 0.95),
      hotHours: hotH / n * 8760, humidHours: humidH / n * 8760,
      free: cool / n, bands: { cool: cool / n, mid: mid / n, hot: hot / n },
      monthCdd: monthCdd.map(function (v) { return v / yrs; }),
      monthTemp: monthSum.map(function (v, k) { return monthN[k] ? v / monthN[k] : null; })
    };
    var g = gradeClimate(out); out.grade = g.grade; out.why = g.why;
    return out;
  }

  function lastFullYears(nowMs) {
    var d = new Date(nowMs), y = d.getUTCFullYear();
    var end = (d.getUTCMonth() === 0 && d.getUTCDate() < 10) ? y - 2 : y - 1;   // the reanalysis lags a few days
    return { start: end - 2, end: end };
  }

  var store = null;
  try { store = typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { store = null; }
  function storeGet(key, ttl, now) {
    try {
      if (!store) return undefined;
      var raw = store.getItem(key); if (!raw) return undefined;
      var o = JSON.parse(raw);
      return o && now - o.at < ttl ? o.v : undefined;
    } catch (e) { return undefined; }
  }
  function storePut(key, v, now) { try { if (store) store.setItem(key, JSON.stringify({ at: now, v: v })); } catch (e) { /* storage full or blocked: the cache is only an optimisation */ } }

  /* Three-year cooling-climate summary for a point (see summarizeClimate). The 0.7 MB download happens once per ~0.1 degree cell; the small
     summary is cached in memory and in localStorage for 90 days. Rejects with a WeatherError like the other calls. */
  function getClimateHistory(lat, lng, fetchImpl, nowMs) {
    lat = Number(lat); lng = Number(lng);
    if (!validCoords(lat, lng)) return Promise.reject(WeatherError('This location has no valid coordinates.', 'invalid'));
    var now = nowMs === undefined ? Date.now() : nowMs;
    var yrs = lastFullYears(now);
    var key = 'h:' + yrs.end + ':' + lat.toFixed(1) + ',' + lng.toFixed(1);
    var hit = cacheGet(key, TTL.climate, now);
    if (hit) return Promise.resolve(Object.assign({}, hit, { cached: true }));
    var kept = storeGet('pp-climate-' + key, TTL.climate, now);
    if (kept) { cachePut(key, kept, now); return Promise.resolve(Object.assign({}, kept, { cached: true })); }
    return once(key, function () {
      guard(now);
      var url = new URL(URLS.archive);
      url.search = new URLSearchParams({
        latitude: lat.toFixed(2), longitude: lng.toFixed(2), start_date: yrs.start + '-01-01', end_date: yrs.end + '-12-31',
        hourly: 'temperature_2m,relative_humidity_2m', temperature_unit: 'fahrenheit', timezone: 'auto'
      }).toString();
      return request(url, fetchImpl, ARCHIVE_TIMEOUT_MS).then(function (data) {
        var h = data && data.hourly;
        if (!h || !Array.isArray(h.time) || !Array.isArray(h.temperature_2m) || !Array.isArray(h.relative_humidity_2m)) throw WeatherError('The weather service returned no climate history.', 'format');
        var s = summarizeClimate(h.time, h.temperature_2m, h.relative_humidity_2m);
        if (!s) throw WeatherError('The weather service returned no usable climate history for this location.', 'format');
        s.period = yrs.start + '–' + yrs.end; s.cached = false;
        cachePut(key, s, now); storePut('pp-climate-' + key, s, now);
        return s;
      });
    });
  }
