/* Climate statistics from an hourly weather series.
   Used unchanged by the browser (live location analysis) and by scripts/climate_preprocessing.mjs (precomputed map),
   so both always describe a location the same way. No dependencies. Temperatures are °C inside; wind is mph. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PeakPowerClimate = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HIST_MIN_C = -40;          // first bin covers [-40, -39) °C
  var HIST_BINS = 90;            // up to 50 °C; values outside are folded into the end bins
  var CDD_BASE_C = (65 - 32) / 1.8;   // US cooling-degree-day base: 65 °F
  var HEAT_95F_C = (95 - 32) / 1.8;
  var HEAT_100F_C = (100 - 32) / 1.8;

  var cToF = function (c) { return c * 1.8 + 32; };
  var fToC = function (f) { return (f - 32) / 1.8; };
  var kmhToMph = function (k) { return k * 0.621371192; };

  /* Wet-bulb temperature from dry-bulb (°C) and relative humidity (%), Stull (2011), J. Appl. Meteor. Climatol. 50.
     Accurate to about 1 °C for RH 5-99 % and T -20 to 50 °C at sea-level pressure. Only a fallback: Open-Meteo's own
     wet_bulb_temperature_2m is used whenever it is present. */
  function wetBulbStull(t, rh) {
    return t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) + Math.atan(t + rh) - Math.atan(rh - 1.676331) +
      0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) - 4.686035;
  }

  var finite = function (x) { return typeof x === 'number' && isFinite(x); };
  var round = function (x, d) { var m = Math.pow(10, d); return Math.round(x * m) / m; };

  function percentile(sortedAsc, p) {   // linear interpolation between closest ranks
    if (!sortedAsc.length) return null;
    var idx = (sortedAsc.length - 1) * p, lo = Math.floor(idx), hi = Math.ceil(idx);
    return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
  }
  function histIndex(c) {
    var i = Math.floor(c - HIST_MIN_C);
    return i < 0 ? 0 : (i >= HIST_BINS ? HIST_BINS - 1 : i);
  }

  /* hourly: { time: ['YYYY-MM-DDTHH:MM', ...] (local), temperature_2m: [°C], relative_humidity_2m: [%],
               wet_bulb_temperature_2m: [°C] (optional), wind_speed_10m: [mph] (optional) } */
  function summarize(hourly) {
    var time = hourly.time, T = hourly.temperature_2m, RH = hourly.relative_humidity_2m;
    var WB = hourly.wet_bulb_temperature_2m, W = hourly.wind_speed_10m;
    if (!time || !T || T.length !== time.length) throw new Error('summarize: time and temperature_2m must be the same length');

    var yearAcc = {}, daily = {}, monthT = [], monthRh = [], temps = [], wbs = [], winds = [];
    for (var m = 0; m < 12; m++) monthT.push([0, 0]), monthRh.push([0, 0]);
    var histDb = new Array(HIST_BINS).fill(0), histWb = new Array(HIST_BINS).fill(0);
    var sumT = 0, nT = 0, sumRh = 0, nRh = 0, sumWb = 0, nWb = 0, computedWb = 0, sumW = 0, nW = 0;

    for (var i = 0; i < time.length; i++) {
      var t = T[i];
      if (!finite(t)) continue;
      var s = time[i], year = +s.slice(0, 4), month = +s.slice(5, 7) - 1, day = s.slice(0, 10);
      sumT += t; nT++; temps.push(t);
      var ya = yearAcc[year] || (yearAcc[year] = { sum: 0, n: 0 });
      ya.sum += t; ya.n++;
      monthT[month][0] += t; monthT[month][1]++;
      var d = daily[day] || (daily[day] = { year: year, sum: 0, n: 0, max: -Infinity });
      d.sum += t; d.n++; if (t > d.max) d.max = t;
      histDb[histIndex(t)]++;
      var rh = RH ? RH[i] : null;
      if (finite(rh)) { sumRh += rh; nRh++; monthRh[month][0] += rh; monthRh[month][1]++; }
      var wb = WB ? WB[i] : null;
      if (!finite(wb) && finite(rh)) { wb = wetBulbStull(t, Math.min(99, Math.max(5, rh))); computedWb++; }
      if (finite(wb)) { sumWb += wb; nWb++; wbs.push(wb); histWb[histIndex(wb)]++; }
      var w = W ? W[i] : null;
      if (finite(w)) { sumW += w; nW++; winds.push(w); }
    }
    if (!nT) throw new Error('summarize: no valid temperature values');

    var years = Object.keys(yearAcc).map(Number).sort();
    var perYear = years.map(function (y) { return { year: y, meanC: yearAcc[y].sum / yearAcc[y].n, cddF: 0, heatDays95F: 0, heatDays100F: 0 }; });
    var byYear = {}; perYear.forEach(function (p) { byYear[p.year] = p; });
    Object.keys(daily).forEach(function (k) {
      var d = daily[k], p = byYear[d.year];
      if (d.n >= 20) p.cddF += Math.max(0, (d.sum / d.n - CDD_BASE_C) * 1.8);   // °C-degree days to °F-degree days
      if (d.max >= HEAT_95F_C) p.heatDays95F++;
      if (d.max >= HEAT_100F_C) p.heatDays100F++;
    });
    var avg = function (k) { return perYear.reduce(function (a, p) { return a + p[k]; }, 0) / perYear.length; };
    var meanOfYears = avg('meanC'), std = null;
    if (perYear.length >= 3) {   // sample standard deviation of the annual means; undefined for fewer than 3 years
      std = Math.sqrt(perYear.reduce(function (a, p) { return a + Math.pow(p.meanC - meanOfYears, 2); }, 0) / (perYear.length - 1));
    }

    temps.sort(function (a, b) { return a - b; }); wbs.sort(function (a, b) { return a - b; }); winds.sort(function (a, b) { return a - b; });
    var nYears = years.length;
    return {
      version: 1, years: years, hours: time.length, validHours: nT,
      tempC: { mean: round(sumT / nT, 2), min: round(temps[0], 1), max: round(temps[temps.length - 1], 1), p01: round(percentile(temps, 0.01), 1), p99: round(percentile(temps, 0.99), 1) },
      rhMean: nRh ? round(sumRh / nRh, 1) : null,
      wetBulbC: nWb ? { mean: round(sumWb / nWb, 2), p99: round(percentile(wbs, 0.99), 1), max: round(wbs[wbs.length - 1], 1), computedShare: round(computedWb / nWb, 4) } : null,
      windMph: nW ? { mean: round(sumW / nW, 1), p95: round(percentile(winds, 0.95), 1) } : null,
      monthly: {
        tempC: monthT.map(function (a) { return a[1] ? round(a[0] / a[1], 2) : null; }),
        rh: monthRh.map(function (a) { return a[1] ? round(a[0] / a[1], 1) : null; })
      },
      perYear: perYear.map(function (p) { return { year: p.year, meanC: round(p.meanC, 2), cddF: Math.round(p.cddF), heatDays95F: p.heatDays95F, heatDays100F: p.heatDays100F }; }),
      annual: {
        meanC: round(meanOfYears, 2), cddF: Math.round(avg('cddF')), heatDays95F: round(avg('heatDays95F'), 1), heatDays100F: round(avg('heatDays100F'), 1),
        interannualStdC: std === null ? null : round(std, 2)
      },
      // average hours per year in each 1 °C bin, for the cooling model
      hist: { minC: HIST_MIN_C, binC: 1, db: histDb.map(function (c) { return round(c / nYears, 1); }), wb: nWb ? histWb.map(function (c) { return round(c / nYears, 1); }) : null }
    };
  }

  return { summarize: summarize, wetBulbStull: wetBulbStull, percentile: percentile, cToF: cToF, fToC: fToC, kmhToMph: kmhToMph,
           HIST_MIN_C: HIST_MIN_C, HIST_BINS: HIST_BINS, CDD_BASE_C: CDD_BASE_C, HEAT_95F_C: HEAT_95F_C, HEAT_100F_C: HEAT_100F_C };
});
