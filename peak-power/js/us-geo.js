/* Small geographic helpers: which US state is a point in, great-circle distance, and facilities near a point.
   Used by the browser and by scripts/climate_preprocessing.mjs. No dependencies. Coordinates are (lon, lat) in GeoJSON order
   where a function takes a point, and (lat, lon) in the distance helpers. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PeakPowerGeo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EARTH_KM = 6371.0088;

  function haversineKm(lat1, lon1, lat2, lon2) {
    var r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function inRing(x, y, ring) {   // ray casting
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  var prepared = new WeakMap();
  function prepare(states) {   // bounding boxes once, so a lookup only tests the few outlines that could contain the point
    var p = prepared.get(states);
    if (p) return p;
    p = states.features.map(function (f) {
      var polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
      return { code: f.properties.code, name: f.properties.name, polys: polys.map(function (poly) {
        var xs = poly[0].map(function (c) { return c[0]; }), ys = poly[0].map(function (c) { return c[1]; });
        return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys), rings: poly };
      }) };
    });
    prepared.set(states, p);
    return p;
  }

  /* Postal code of the state containing (lon, lat), or null if the point is outside every outline (sea, Canada, Mexico).
     Outlines are simplified to about 2 km, so a point very close to a border can land on the wrong side. */
  function stateAt(lon, lat, states) {
    var list = prepare(states);
    for (var s = 0; s < list.length; s++) {
      for (var k = 0; k < list[s].polys.length; k++) {
        var p = list[s].polys[k];
        if (lon < p.x0 || lon > p.x1 || lat < p.y0 || lat > p.y1) continue;
        if (!inRing(lon, lat, p.rings[0])) continue;
        var inHole = false;
        for (var h = 1; h < p.rings.length; h++) if (inRing(lon, lat, p.rings[h])) { inHole = true; break; }
        if (!inHole) return list[s].code;
      }
    }
    return null;
  }

  function stateName(code, states) {
    var f = states.features.filter(function (x) { return x.properties.code === code; })[0];
    return f ? f.properties.name : code;
  }

  /* Number of points (objects with lat and lon) within `km` of a location. */
  function countWithin(points, lat, lon, km) {
    var n = 0;
    for (var i = 0; i < points.length; i++) if (haversineKm(lat, lon, points[i].lat, points[i].lon) <= km) n++;
    return n;
  }

  return { haversineKm: haversineKm, stateAt: stateAt, stateName: stateName, countWithin: countWithin, EARTH_KM: EARTH_KM };
});
