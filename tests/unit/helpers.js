// Shared test helpers: synthetic but physically shaped weather series, built through the real climate-stats module.
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const ROOT = path.resolve(__dirname, '..', '..');
const js = (f) => require(path.join(ROOT, 'peak-power', 'js', f));
const Climate = js('climate-stats.js');

/* Hourly series for `years` calendar years starting at `startYear`: annual sine (coldest mid-January) plus a daily cycle. */
function hourlySeries({ mean = 15, annualAmp = 10, dailyAmp = 5, rh = 50, startYear = 2021, years = 3, perYearMean = null, windMph = 8 } = {}) {
  const time = [], t = [], r = [], w = [];
  for (let y = 0; y < years; y++) {
    const year = startYear + y;
    const days = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
    const base = perYearMean ? perYearMean[y] : mean;
    for (let d = 0; d < days; d++) {
      const date = new Date(Date.UTC(year, 0, 1 + d)).toISOString().slice(0, 10);
      for (let h = 0; h < 24; h++) {
        time.push(`${date}T${String(h).padStart(2, '0')}:00`);
        const annual = -Math.cos(2 * Math.PI * (d - 15) / days) * annualAmp;      // minimum around 15 January
        const daily = -Math.cos(2 * Math.PI * (h - 3) / 24) * dailyAmp;            // minimum around 03:00
        t.push(base + annual + daily); r.push(rh); w.push(windMph);
      }
    }
  }
  return { time, temperature_2m: t, relative_humidity_2m: r, wind_speed_10m: w };
}
const syntheticClimate = (opts) => Climate.summarize(hourlySeries(opts));

/* A climate whose hours all sit in one bin centred on `centerC` (for exact hand calculations). */
function pointClimate(dbCenterC, wbCenterC) {
  return { hist: { minC: dbCenterC - 0.5, binC: 1, db: [8760], wb: wbCenterC === undefined ? null : [8760], wbMinC: wbCenterC - 0.5 } };
}
module.exports = { ROOT, js, hourlySeries, syntheticClimate, pointClimate, Climate, readJson: (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) };
