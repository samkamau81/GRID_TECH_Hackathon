'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { js, hourlySeries } = require('./helpers.js');
const W = js('weather-service.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ± ${tol}, got ${a}`);
const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);      // 1 November 2026

function memStorage() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m }; }
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const fail = (status, body) => ({ ok: false, status, json: async () => body || {} });
function harness(handler, extra = {}) {
  const calls = [], clock = { t: T0 };
  const fetchImpl = async (url) => { calls.push(String(url)); return handler(String(url), calls.length); };
  const svc = W.create({ fetchImpl, storage: memStorage(), now: () => clock.t, sleep: async () => {}, today: () => clock.t, ...extra });
  return { svc, calls, clock };
}
// A year of hourly data, shaped like the archive API's response
function archiveBody(years = 3) {
  const h = hourlySeries({ mean: 14, annualAmp: 10, years, startYear: 2023, windMph: 9 });
  return { latitude: 39.05, longitude: -77.53, elevation: 92, timezone: 'America/New_York', hourly: { time: h.time, temperature_2m: h.temperature_2m, relative_humidity_2m: h.relative_humidity_2m,
    wet_bulb_temperature_2m: h.temperature_2m.map((t) => t - 4), wind_speed_10m: h.wind_speed_10m } };
}
const currentBody = { elevation: 92, current_units: { temperature_2m: '°F' }, current: { time: '2026-11-01T14:30', temperature_2m: 53, apparent_temperature: 51.3, weather_code: 3, wind_speed_10m: 0.9, relative_humidity_2m: 74, wet_bulb_temperature_2m: 47 } };

test('getWeather (the supplied implementation) builds the documented request and returns data.current', async () => {
  let seen;
  const out = await W.getWeather(39.04, -77.49, async (u) => { seen = u; return ok(currentBody); });
  assert.deepEqual(out, currentBody.current);
  const p = new URL(String(seen));
  assert.equal(p.origin + p.pathname, 'https://api.open-meteo.com/v1/forecast');
  assert.equal(p.searchParams.get('latitude'), '39.04');
  assert.equal(p.searchParams.get('longitude'), '-77.49');
  assert.equal(p.searchParams.get('temperature_unit'), 'fahrenheit');
  assert.equal(p.searchParams.get('wind_speed_unit'), 'mph');
  ['temperature_2m', 'apparent_temperature', 'weather_code', 'wind_speed_10m', 'relative_humidity_2m'].forEach((v) => assert.ok(p.searchParams.get('current').split(',').includes(v), v));
});

test('getWeather throws the specified error on a failed response', async () => {
  await assert.rejects(() => W.getWeather(1, 2, async () => fail(503)), { message: 'Open-Meteo error 503' });
});

test('call weight follows the published fractional-call rule', () => {
  near(W.callWeight(1096, 4), 1096 / 14, 1e-9, 'three years, four variables');
  near(W.callWeight(1826, 4), 1826 / 14, 1e-9, 'five years');
  assert.equal(W.callWeight(1, 4), 1, 'a short request counts as one call');
  near(W.callWeight(14, 15), 1.5, 1e-12, 'the example on the pricing page: 2 weeks, 15 variables = 1.5 calls');
  near(W.callWeight(28, 15), 3, 1e-12, 'the example on the pricing page: 4 weeks = 3.0 calls');
  near(W.callWeight(14, 4, 10), 10, 1e-12, 'ten locations');
});

test('history window is the last N complete calendar years', () => {
  assert.deepEqual(W.historyYears(3, new Date(Date.UTC(2026, 10, 1))), [2023, 2024, 2025]);
  assert.deepEqual(W.historyYears(5, new Date(Date.UTC(2026, 0, 1))), [2021, 2022, 2023, 2024, 2025]);
  assert.deepEqual(W.historyYears(3, new Date(Date.UTC(2027, 0, 2))), [2024, 2025, 2026]);
});

test('weather codes are described, unknown ones are admitted', () => {
  assert.equal(W.describeCode(0), 'Clear sky');
  assert.equal(W.describeCode(95), 'Thunderstorm');
  assert.equal(W.describeCode(12345), 'Unknown conditions');
});

test('current conditions: request, units and description', async () => {
  const { svc, calls } = harness(() => ok(currentBody));
  const r = await svc.getCurrent(39.04, -77.49);
  assert.equal(r.current.temperature_2m, 53);
  assert.equal(r.description, 'Overcast');
  const u = new URL(calls[0]);
  assert.equal(u.searchParams.get('temperature_unit'), 'fahrenheit');
  assert.ok(u.searchParams.get('current').includes('wet_bulb_temperature_2m'));
});

test('current conditions are cached for ten minutes only', async () => {
  const { svc, calls, clock } = harness(() => ok(currentBody));
  await svc.getCurrent(39.04, -77.49); await svc.getCurrent(39.041, -77.489);
  assert.equal(calls.length, 1, 'nearby coordinates share the cache entry');
  clock.t += 11 * 60e3;
  await svc.getCurrent(39.04, -77.49);
  assert.equal(calls.length, 2, 'refetched after the cache expires');
});

test('history request uses the documented archive parameters and returns a climate summary', async () => {
  const { svc, calls } = harness(() => ok(archiveBody(3)));
  const r = await svc.getHistory(39.04, -77.49);
  const u = new URL(calls[0]);
  assert.equal(u.origin + u.pathname, 'https://archive-api.open-meteo.com/v1/archive');
  assert.equal(u.searchParams.get('start_date'), '2023-01-01');
  assert.equal(u.searchParams.get('end_date'), '2025-12-31');
  assert.equal(u.searchParams.get('hourly'), 'temperature_2m,relative_humidity_2m,wet_bulb_temperature_2m,wind_speed_10m');
  assert.equal(u.searchParams.get('timezone'), 'auto');
  assert.equal(u.searchParams.get('wind_speed_unit'), 'mph');
  assert.deepEqual(r.years, [2023, 2024, 2025]);
  assert.equal(r.source, 'live');
  assert.equal(r.summary.hours, 3 * 365 * 24 + 24, '2024 is a leap year');
  near(r.summary.tempC.mean, 14, 0.2);
  assert.equal(r.summary.wetBulbC.computedShare, 0, 'the API wet-bulb is used, not the fallback formula');
  near(r.summary.windMph.mean, 9, 1e-9);
  near(r.callWeight, 1096 / 14, 1e-9);
});

test('history is cached for 30 days, keyed by rounded coordinates', async () => {
  const { svc, calls, clock } = harness(() => ok(archiveBody(3)));
  const a = await svc.getHistory(39.0412, -77.4909);
  const b = await svc.getHistory(39.0449, -77.4851);
  assert.equal(calls.length, 1, 'both round to 39.04, -77.49');
  assert.equal(b.source, 'cache');
  assert.deepEqual(b.summary, a.summary);
  await svc.getHistory(40.0, -77.49);
  assert.equal(calls.length, 2, 'a different place is a different entry');
  clock.t += 31 * 864e5;
  await svc.getHistory(39.04, -77.49);
  assert.equal(calls.length, 3, 'expired after 30 days');
});

test('the cache survives a reload through storage', async () => {
  const storage = memStorage(), clock = { t: T0 };
  const make = () => { const calls = []; const svc = W.create({ fetchImpl: async (u) => { calls.push(u); return ok(archiveBody(3)); }, storage, now: () => clock.t, sleep: async () => {}, today: () => clock.t }); return { svc, calls }; };
  const first = make(); await first.svc.getHistory(39.04, -77.49);
  const second = make(); const r = await second.svc.getHistory(39.04, -77.49);
  assert.equal(second.calls.length, 0);
  assert.equal(r.source, 'cache');
});

test('identical concurrent requests share a single call', async () => {
  const { svc, calls } = harness(() => ok(archiveBody(3)));
  await Promise.all([svc.getHistory(39.04, -77.49), svc.getHistory(39.04, -77.49), svc.getHistory(39.04, -77.49)]);
  assert.equal(calls.length, 1);
});

test('usage is recorded and exposed, weighted per request', async () => {
  const { svc } = harness(() => ok(archiveBody(3)));
  await svc.getHistory(39.04, -77.49);
  const b = svc.budget();
  near(b.usedHour, 1096 / 14, 1e-9);
  assert.equal(b.limits.perDay, 10000);
  assert.equal(b.requests, 1);
});

test('a request that would exceed the safe budget is refused locally, before any call', async () => {
  const storage = memStorage();
  storage.setItem('pp.om.ledger', JSON.stringify([[T0 - 60e3 * 5, 3950]]));        // 3,950 of the 4,000 allowed this hour already used
  const calls = [];
  const svc = W.create({ fetchImpl: async (u) => { calls.push(u); return ok(archiveBody(3)); }, storage, now: () => T0, sleep: async () => {}, today: () => T0 });
  await assert.rejects(() => svc.getHistory(39.04, -77.49), (e) => e.code === 'budget' && e.window === 'hour' && /stored data/.test(e.message));
  assert.equal(calls.length, 0, 'nothing was sent');
  await svc.getCurrent(39.04, -77.49).then(() => {}, () => {});                      // a 1-call request still fits
  assert.equal(calls.length, 1);
});

test('old ledger entries expire so the budget recovers', async () => {
  const storage = memStorage();
  storage.setItem('pp.om.ledger', JSON.stringify([[T0 - 2 * 36e5, 3990]]));          // two hours ago
  const svc = W.create({ fetchImpl: async () => ok(archiveBody(3)), storage, now: () => T0, sleep: async () => {}, today: () => T0 });
  await assert.doesNotReject(() => svc.getHistory(39.04, -77.49));
});

test('HTTP 429 stops further calls until the block expires', async () => {
  let n = 0;
  const { svc, calls, clock } = harness(() => (n++ === 0 ? fail(429, { error: true, reason: 'Hourly API request limit exceeded. Please try again in the next hour.' }) : ok(currentBody)));
  await assert.rejects(() => svc.getCurrent(39.04, -77.49), (e) => e.code === 'rate-limit' && e.retryAt > clock.t);
  await assert.rejects(() => svc.getCurrent(40.5, -77.49), (e) => e.code === 'rate-limit', 'blocked locally');
  assert.equal(calls.length, 1, 'no second call while blocked');
  assert.equal(svc.budget().blockedReason, 'hour');
  clock.t += 16 * 60e3;
  await assert.doesNotReject(() => svc.getCurrent(40.5, -77.49));
});

test('a limit message in the body is honoured even with a 200-class status', async () => {
  const { svc } = harness(() => ({ ok: false, status: 400, json: async () => ({ error: true, reason: 'Daily API request limit exceeded.' }) }));
  await assert.rejects(() => svc.getCurrent(39, -77), (e) => e.code === 'rate-limit');
  assert.ok(svc.budget().blockedUntil > 0);
});

test('server errors are retried with backoff, then reported', async () => {
  let n = 0;
  const { svc, calls } = harness(() => (++n < 3 ? fail(500) : ok(currentBody)));
  await svc.getCurrent(39.04, -77.49);
  assert.equal(calls.length, 3, 'two failures then success');
  const bad = harness(() => fail(502));
  await assert.rejects(() => bad.svc.getCurrent(39.04, -77.49), (e) => e.code === 'http' && /502/.test(e.message));
  assert.equal(bad.calls.length, 3, 'initial try plus two retries');
});

test('network failures are retried and then reported clearly', async () => {
  let n = 0;
  const { svc, calls } = harness(() => { if (++n < 2) throw new Error('offline'); return ok(currentBody); });
  await svc.getCurrent(39.04, -77.49);
  assert.equal(calls.length, 2);
  const down = harness(() => { throw new Error('offline'); });
  await assert.rejects(() => down.svc.getCurrent(39.04, -77.49), (e) => e.code === 'network' && /offline/.test(e.message));
});

test('a client error (bad coordinates) is not retried and carries the API reason', async () => {
  const { svc, calls } = harness(() => fail(400, { error: true, reason: 'Latitude must be in range of -90 to 90°. Given: 999.0.' }));
  await assert.rejects(() => svc.getCurrent(999, 0), (e) => e.code === 'http' && /Latitude must be in range/.test(e.message));
  assert.equal(calls.length, 1);
});

test('empty or malformed responses are errors, not zeros', async () => {
  await assert.rejects(() => harness(() => ok({})).svc.getCurrent(39, -77), (e) => e.code === 'parse');
  await assert.rejects(() => harness(() => ok({ latitude: 1 })).svc.getHistory(39, -77), (e) => e.code === 'parse');
  await assert.rejects(() => harness(() => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } })).svc.getCurrent(39, -77), (e) => e.code === 'parse');
});

test('place search returns US matches only and handles no results', async () => {
  const { svc, calls } = harness((u) => ok(/zzz/.test(u) ? { generationtime_ms: 0.1 } : { results: [
    { name: 'Springfield', admin1: 'Missouri', country_code: 'US', latitude: 37.22, longitude: -93.3 },
    { name: 'Springfield', admin1: 'England', country_code: 'GB', latitude: 51, longitude: 0 },
    { name: 'Springfield', country_code: 'US', latitude: 39.8, longitude: -89.64 }] }));
  const r = await svc.geocode('Springfield');
  assert.deepEqual(r.map((x) => x.label), ['Springfield, Missouri', 'Springfield']);
  assert.equal(new URL(calls[0]).searchParams.get('countryCode'), 'US');
  assert.deepEqual(await svc.geocode('zzzqq'), []);
  assert.deepEqual(await svc.geocode('a'), [], 'too short to search');
  assert.equal(calls.length, 2, 'the short query made no call');
  await svc.geocode('Springfield');
  assert.equal(calls.length, 2, 'cached');
});

test('unavailable storage (private window, quota) never breaks the service', async () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('denied'); } };
  const svc = W.create({ fetchImpl: async () => ok(archiveBody(3)), storage: broken, now: () => T0, sleep: async () => {}, today: () => T0 });
  const r = await svc.getHistory(39.04, -77.49);
  assert.equal(r.source, 'live');
  assert.equal((await svc.getHistory(39.04, -77.49)).source, 'cache', 'still cached in memory for the session');
});

test('batch current conditions: one request, comma-separated coordinates, results in order', async () => {
  const mk = (temp) => ({ elevation: 10, current_units: {}, current: { time: '2026-11-01T14:30', temperature_2m: temp, weather_code: 0, apparent_temperature: temp, wind_speed_10m: 1, relative_humidity_2m: 50 } });
  const { svc, calls } = harness(() => ok([mk(50), mk(60), mk(70)]));
  const pts = [{ lat: 39.04, lon: -77.49 }, { lat: 33.45, lon: -112.07 }, { lat: 45.6, lon: -121.18 }];
  const r = await svc.getCurrentBatch(pts);
  assert.equal(calls.length, 1);
  const u = new URL(calls[0]);
  assert.equal(u.searchParams.get('latitude'), '39.04,33.45,45.6');
  assert.equal(u.searchParams.get('longitude'), '-77.49,-112.07,-121.18');
  assert.deepEqual(r.map((x) => x.current.temperature_2m), [50, 60, 70]);
  near(svc.budget().usedHour, 3, 1e-9, 'three locations count as three calls');
});

test('batch: cached places are not requested again, and a single place returns an object', async () => {
  const mk = (temp) => ({ elevation: 10, current: { time: '2026-11-01T14:30', temperature_2m: temp, weather_code: 3 } });
  let reply = [mk(50), mk(60)];
  const { svc, calls } = harness(() => ok(reply));
  await svc.getCurrentBatch([{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }]);
  reply = mk(99);                                  // one uncached place: the API answers with an object, not an array
  const r = await svc.getCurrentBatch([{ lat: 1, lon: 2 }, { lat: 5, lon: 6 }]);
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[1]).searchParams.get('latitude'), '5', 'only the new place was requested');
  assert.deepEqual(r.map((x) => x.current.temperature_2m), [50, 99]);
  await svc.getCurrentBatch([{ lat: 1, lon: 2 }]);
  assert.equal(calls.length, 2, 'fully cached');
});

test('batch: a wrong number of results is an error, not a guess', async () => {
  const { svc } = harness(() => ok([{ current: { temperature_2m: 1 } }]));
  await assert.rejects(() => svc.getCurrentBatch([{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }]), (e) => e.code === 'parse');
});
