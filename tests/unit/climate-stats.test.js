'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Climate, hourlySeries } = require('./helpers.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ± ${tol}, got ${a}`);

test('unit conversions', () => {
  assert.equal(Climate.cToF(0), 32);
  assert.equal(Climate.cToF(100), 212);
  assert.equal(Climate.fToC(212), 100);
  assert.equal(Climate.fToC(-40), -40);
  near(Climate.kmhToMph(100), 62.1371, 1e-3);
  near(Climate.fToC(Climate.cToF(23.7)), 23.7, 1e-12, 'round trip');
});

test('threshold constants are the Fahrenheit values they claim to be', () => {
  near(Climate.cToF(Climate.CDD_BASE_C), 65, 1e-9);
  near(Climate.cToF(Climate.HEAT_95F_C), 95, 1e-9);
  near(Climate.cToF(Climate.HEAT_100F_C), 100, 1e-9);
});

test('wet-bulb (Stull 2011) matches published psychrometric values', () => {
  near(Climate.wetBulbStull(20, 50), 13.7, 0.2, '20 C / 50 %');          // Stull 2011 worked example
  near(Climate.wetBulbStull(20, 99), 20, 0.5, 'saturated air: wet-bulb is close to dry-bulb');
  near(Climate.wetBulbStull(30, 30), 18.6, 0.8, '30 C / 30 %');
  assert.ok(Climate.wetBulbStull(30, 30) < Climate.wetBulbStull(30, 60), 'drier air has a lower wet-bulb');
  assert.ok(Climate.wetBulbStull(30, 60) < 30, 'wet-bulb never exceeds dry-bulb here');
});

test('percentile uses linear interpolation', () => {
  const a = [1, 2, 3, 4, 5];
  assert.equal(Climate.percentile(a, 0), 1);
  assert.equal(Climate.percentile(a, 1), 5);
  assert.equal(Climate.percentile(a, 0.5), 3);
  assert.equal(Climate.percentile(a, 0.25), 2);
  assert.equal(Climate.percentile(a, 0.9), 4.6);
  assert.equal(Climate.percentile([], 0.5), null);
});

test('constant 20 C: mean, degree days, histogram and no heat days', () => {
  const s = Climate.summarize(hourlySeries({ mean: 20, annualAmp: 0, dailyAmp: 0, years: 2, startYear: 2021 }));   // 2021 and 2022, 365 days each
  assert.equal(s.hours, 2 * 365 * 24);
  assert.equal(s.tempC.mean, 20);
  assert.equal(s.annual.heatDays95F, 0);
  assert.equal(s.annual.heatDays100F, 0);
  // (20 C - 18.333 C) x 1.8 = 3.0 F-degree days per day, 365 days
  assert.equal(s.annual.cddF, 1095);
  assert.equal(s.annual.interannualStdC, null, 'fewer than 3 years: variability is not defined');
  const bin = Math.floor(20 - Climate.HIST_MIN_C);
  assert.equal(s.hist.db[bin], 8760, 'every hour in the 20 C bin, expressed per year');
  assert.equal(s.hist.db.reduce((a, b) => a + b, 0), 8760);
  assert.equal(s.wetBulbC.computedShare, 1, 'no wet-bulb supplied, so all values are computed');
});

test('extreme heat days are counted from the daily maximum, per year', () => {
  const h = hourlySeries({ mean: 20, annualAmp: 0, dailyAmp: 0, years: 2, startYear: 2021 });
  // five days in each year reach 36 C (96.8 F) for one hour; one of them reaches 38 C (100.4 F)
  const hot = (date, c) => { const i = h.time.indexOf(date + 'T15:00'); h.temperature_2m[i] = c; };
  ['2021-07-01', '2021-07-02', '2021-07-03', '2021-07-04', '2021-07-05', '2022-07-01', '2022-07-02', '2022-07-03', '2022-07-04', '2022-07-05'].forEach((d) => hot(d, 36));
  hot('2021-07-05', 38); hot('2022-07-05', 38);
  const s = Climate.summarize(h);
  assert.equal(s.annual.heatDays95F, 5);
  assert.equal(s.annual.heatDays100F, 1);
  assert.deepEqual(s.perYear.map((p) => p.heatDays95F), [5, 5]);
});

test('year-to-year variability is the sample standard deviation of the annual means', () => {
  const s = Climate.summarize(hourlySeries({ perYearMean: [10, 12, 14], annualAmp: 0, dailyAmp: 0, years: 3 }));
  assert.deepEqual(s.perYear.map((p) => p.meanC), [10, 12, 14]);
  assert.equal(s.annual.meanC, 12);
  assert.equal(s.annual.interannualStdC, 2);          // sqrt(((-2)^2 + 0 + 2^2) / 2) = 2
});

test('monthly means follow the seasons (northern hemisphere)', () => {
  const s = Climate.summarize(hourlySeries({ mean: 15, annualAmp: 10, dailyAmp: 0, years: 1 }));
  assert.ok(s.monthly.tempC[0] < 7 && s.monthly.tempC[6] > 23, 'January cold, July warm: ' + [s.monthly.tempC[0], s.monthly.tempC[6]]);
  assert.equal(s.monthly.tempC.length, 12);
  assert.equal(s.monthly.rh.length, 12);
});

test('a supplied wet-bulb series is used as is, and missing values fall back to the formula', () => {
  const h = hourlySeries({ mean: 25, annualAmp: 0, dailyAmp: 0, years: 1 });
  h.wet_bulb_temperature_2m = h.time.map(() => 17.5);
  let s = Climate.summarize(h);
  assert.equal(s.wetBulbC.mean, 17.5);
  assert.equal(s.wetBulbC.computedShare, 0);
  h.wet_bulb_temperature_2m[0] = null;
  s = Climate.summarize(h);
  assert.ok(s.wetBulbC.computedShare > 0 && s.wetBulbC.computedShare < 0.001);
});

test('wind statistics', () => {
  const s = Climate.summarize(hourlySeries({ years: 1, windMph: 12 }));
  assert.equal(s.windMph.mean, 12);
  assert.equal(s.windMph.p95, 12);
});

test('bad input is rejected, not silently summarised', () => {
  assert.throws(() => Climate.summarize({ time: ['2021-01-01T00:00'], temperature_2m: [] }), /same length/);
  assert.throws(() => Climate.summarize({ time: ['2021-01-01T00:00'], temperature_2m: [null] }), /no valid temperature/);
});

test('histogram folds out-of-range temperatures into the end bins', () => {
  const s = Climate.summarize({ time: ['2021-01-01T00:00', '2021-01-01T01:00'], temperature_2m: [-60, 70], relative_humidity_2m: [50, 50] });
  assert.equal(s.hist.db[0], 1);
  assert.equal(s.hist.db[Climate.HIST_BINS - 1], 1);
});
