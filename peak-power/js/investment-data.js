/* Data layer for Investment Intelligence: loads the processed files, looks up FEMA hazard data for a clicked point, counts nearby
   data centers, and assembles a location object the scenario engine can score.

   Nothing here fills a gap with a guess. If a source is unavailable for a point (FEMA offline, no county, state outside the EIA
   tables) the field is null and the scoring engine reports that factor as Not Assessed. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./us-geo.js'));
  else root.PeakPowerData = factory(root.PeakPowerGeo);
})(typeof self !== 'undefined' ? self : this, function (Geo) {
  'use strict';

  var FEMA_URL = 'https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Counties/FeatureServer/0/query';
  var FEMA_FIELDS = 'COUNTY,STATEABBRV,POPULATION,BUILDVALUE,EAL_VALB,RISK_RATNG,HWAV_RISKR,CFLD_RISKR,HRCN_RISKR,ERQK_RISKR,TRND_RISKR,WFIR_RISKR,DRGT_RISKR,NRI_VER';
  var NEARBY_KM = 100;
  var isNum = function (x) { return typeof x === 'number' && isFinite(x); };
  var key2 = function (lat, lon) { return lat.toFixed(2) + ',' + lon.toFixed(2); };

  /* opts: { fetchImpl, base (folder holding the processed files), femaUrl } */
  function create(opts) {
    var o = opts || {};
    var doFetch = o.fetchImpl || (typeof fetch === 'function' ? fetch.bind(typeof self !== 'undefined' ? self : undefined) : null);
    var base = o.base === undefined ? 'data/processed/' : o.base;
    var femaUrl = o.femaUrl || FEMA_URL;
    var femaCache = {}, loaded = null;

    async function getJson(name) {
      var res = await doFetch(base + name);
      if (!res.ok) throw new Error('Could not load ' + name + ' (HTTP ' + res.status + ')');
      return res.json();
    }

    /* Loads everything the page needs. The climate grid is optional: if it is absent the page still works for live locations. */
    async function load() {
      if (loaded) return loaded;
      var parts = await Promise.all([getJson('us-states.geojson'), getJson('us-reference.json'), getJson('data-centers.geojson'),
        getJson('climate-grid.json').catch(function () { return null; }), getJson('data-sources.json').catch(function () { return []; })]);
      var facilities = parts[2].features.map(function (f) { return Object.assign({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }, f.properties); });
      loaded = { states: parts[0], reference: parts[1], facilities: facilities, usFacilities: facilities.filter(function (f) { return f.iso2 === 'US'; }),
                 grid: parts[3], sources: parts[4], dcMeta: parts[2].metadata || {} };
      return loaded;
    }

    /* County hazard data for a point, from FEMA's National Risk Index. Returns null when FEMA has no county there, and
       { error } when the service cannot be reached; neither is ever replaced by a made-up value. */
    async function hazardAt(lat, lon) {
      var k = key2(lat, lon);
      if (femaCache[k]) return femaCache[k];
      var q = new URLSearchParams({ geometry: lon + ',' + lat, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
        outFields: FEMA_FIELDS, returnGeometry: 'false', f: 'json' });
      var result;
      try {
        var res = await doFetch(femaUrl + '?' + q.toString());
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var d = await res.json();
        if (d.error) throw new Error(d.error.message || 'service error');
        var a = d.features && d.features[0] && d.features[0].attributes;
        result = a && isNum(a.BUILDVALUE) && a.BUILDVALUE > 0 && isNum(a.EAL_VALB) ? {
          county: a.COUNTY, state: a.STATEABBRV, population: a.POPULATION, ealRate: a.EAL_VALB / a.BUILDVALUE, compositeRating: a.RISK_RATNG, nriVersion: a.NRI_VER,
          hazards: { 'Heat wave': a.HWAV_RISKR, 'Coastal flooding': a.CFLD_RISKR, Hurricane: a.HRCN_RISKR, Earthquake: a.ERQK_RISKR, Tornado: a.TRND_RISKR, Wildfire: a.WFIR_RISKR, Drought: a.DRGT_RISKR } } : null;
      } catch (e) {
        return { error: 'FEMA National Risk Index is not reachable (' + e.message + ')' };   // not cached: a later click may succeed
      }
      femaCache[k] = result;
      return result;
    }

    function nearby(lat, lon, km) {
      return loaded ? Geo.countWithin(loaded.usFacilities, lat, lon, km || NEARBY_KM) : null;
    }

    /* Assemble a location for the engine from a point and whatever has been learned about it. */
    function locationFromPoint(lat, lon, extra) {
      var e = extra || {}, ref = loaded && loaded.reference, state = loaded ? Geo.stateAt(lon, lat, loaded.states) : null;
      var s = state && ref && ref.eia.states[state];
      var hz = e.hazard && !e.hazard.error ? e.hazard : null;
      return { id: e.id || ('pt_' + key2(lat, lon)), label: e.label || (state ? Geo.stateName(state, loaded.states) + ' (' + lat.toFixed(2) + ', ' + lon.toFixed(2) + ')' : lat.toFixed(2) + ', ' + lon.toFixed(2)),
               lat: lat, lon: lon, state: state, climate: e.climate || null,
               priceCentsPerKwh: s && isNum(s.industrialCentsPerKwh) ? s.industrialCentsPerKwh : null,
               saidiMinutes: s && isNum(s.saidiMinutes) ? s.saidiMinutes : null,
               ealRate: hz && isNum(hz.ealRate) ? hz.ealRate : null,
               nearbyFacilities: nearby(lat, lon),
               hazard: e.hazard || null };
    }

    /* Nearest precomputed grid cell, for when live history cannot be fetched (budget or network). */
    function nearestCell(lat, lon) {
      if (!loaded || !loaded.grid) return null;
      var best = null;
      loaded.grid.cells.forEach(function (c) {
        var d = Geo.haversineKm(lat, lon, c.lat, c.lon);
        if (!best || d < best.km) best = { cell: c, km: d };
      });
      return best;
    }

    return { load: load, hazardAt: hazardAt, nearby: nearby, locationFromPoint: locationFromPoint, nearestCell: nearestCell, NEARBY_KM: NEARBY_KM, get data() { return loaded; } };
  }

  return { create: create, FEMA_URL: FEMA_URL, NEARBY_KM: NEARBY_KM };
});
