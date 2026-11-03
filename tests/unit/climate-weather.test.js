'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const W = require(path.join(__dirname, '..', '..', 'peak-power', 'js', 'climate-weather.js'));

const body = (over) => Object.assign({
  timezone: 'America/Chicago', timezone_abbreviation: 'CST',
  current_units: { temperature_2m: '°F', wind_speed_10m: 'mp/h', precipitation: 'inch', relative_humidity_2m: '%' },
  current: { time: '2026-11-01T14:30', temperature_2m: 61.2, apparent_temperature: 58.9, relative_humidity_2m: 44, weather_code: 2, wind_speed_10m: 9.5, precipitation: 0, is_day: 1 }
}, over || {});
const okFetch = (calls, payload) => async (url) => { calls.push(String(url)); return { ok: true, status: 200, json: async () => payload || body() }; };

test.beforeEach(() => W.reset());

test('requests US units and the documented current variables', async () => {
  const calls = [];
  await W.getCurrentWeather(30.5, -97.7, okFetch(calls));
  const u = new URL(calls[0]);
  assert.equal(u.origin + u.pathname, 'https://api.open-meteo.com/v1/forecast');
  assert.equal(u.searchParams.get('temperature_unit'), 'fahrenheit');
  assert.equal(u.searchParams.get('wind_speed_unit'), 'mph');
  assert.equal(u.searchParams.get('precipitation_unit'), 'inch');
  assert.equal(u.searchParams.get('timezone'), 'auto');
  assert.equal(u.searchParams.get('latitude'), '30.5000');
  for (const v of ['temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'weather_code', 'wind_speed_10m', 'precipitation']) {
    assert.ok(u.searchParams.get('current').split(',').includes(v), v);
  }
});

test('maps the response, including condition and icon', async () => {
  const w = await W.getCurrentWeather(30.5, -97.7, okFetch([]));
  assert.equal(w.temperature, 61.2);
  assert.equal(w.apparentTemperature, 58.9);
  assert.equal(w.humidity, 44);
  assert.equal(w.windSpeed, 9.5);
  assert.equal(w.condition, 'Partly cloudy');
  assert.equal(w.icon, '⛅');
  assert.equal(w.time, '2026-11-01T14:30');
  assert.equal(w.timezone, 'CST');
  assert.equal(w.cached, false);
});

test('missing values stay null and nothing is invented', async () => {
  const w = await W.getCurrentWeather(10, 10, okFetch([], body({ current: { time: '2026-11-01T14:30', temperature_2m: 70 } })));
  assert.equal(w.temperature, 70);
  assert.equal(w.humidity, null);
  assert.equal(w.windSpeed, null);
  assert.equal(w.condition, null);
  assert.equal(w.icon, null);
});

test('unknown weather code gives no description', () => {
  assert.equal(W.describe(12345), null);
  assert.equal(W.describe(0, 0).icon, '🌙');
  assert.equal(W.describe(0, 1).icon, '☀️');
});

test('caches for ten minutes, then refetches', async () => {
  const calls = [];
  const f = okFetch(calls);
  await W.getCurrentWeather(30.5, -97.7, f, 0);
  const again = await W.getCurrentWeather(30.5, -97.7, f, 9 * 60e3);
  assert.equal(calls.length, 1);
  assert.equal(again.cached, true);
  await W.getCurrentWeather(30.5, -97.7, f, 10 * 60e3 + 1);
  assert.equal(calls.length, 2);
});

test('simultaneous identical requests share one fetch', async () => {
  const calls = [];
  const f = okFetch(calls);
  await Promise.all([W.getCurrentWeather(1, 2, f), W.getCurrentWeather(1, 2, f), W.getCurrentWeather(1.001, 2.001, f)]);
  assert.equal(calls.length, 1);
});

test('rejects invalid coordinates without calling the API', async () => {
  const calls = [];
  for (const [la, lo] of [[91, 0], [0, 181], ['x', 1], [NaN, 1]]) {
    await assert.rejects(W.getCurrentWeather(la, lo, okFetch(calls)), (e) => e.code === 'invalid');
  }
  assert.equal(calls.length, 0);
});

test('HTTP errors are reported as WeatherError', async () => {
  await assert.rejects(W.getCurrentWeather(5, 5, async () => ({ ok: false, status: 500, json: async () => ({}) })), (e) => e.name === 'WeatherError' && e.code === 'http');
});

test('a 429 pauses further requests', async () => {
  const calls = [];
  const f = async (u) => { calls.push(u); return { ok: false, status: 429, json: async () => ({}) }; };
  await assert.rejects(W.getCurrentWeather(5, 5, f), (e) => e.code === 'rate_limit');
  await assert.rejects(W.getCurrentWeather(6, 6, f), (e) => e.code === 'rate_limit');
  assert.equal(calls.length, 1);
});

test('network failure and malformed bodies are handled', async () => {
  await assert.rejects(W.getCurrentWeather(7, 7, async () => { throw new TypeError('offline'); }), (e) => e.code === 'network');
  await assert.rejects(W.getCurrentWeather(8, 8, async () => ({ ok: true, status: 200, json: async () => ({}) })), (e) => e.code === 'format');
});

test('client-side throttle refuses bursts above 30 a minute', async () => {
  const f = okFetch([]);
  for (let i = 0; i < 30; i++) await W.getCurrentWeather(i, i, f, 1000);
  await assert.rejects(W.getCurrentWeather(40, 40, f, 1000), (e) => e.code === 'throttled');
  await W.getCurrentWeather(41, 41, f, 1000 + 61e3);   // the window has passed
});

test('place search: parameters, mapping, caching, short query', async () => {
  const calls = [];
  const f = async (url) => { calls.push(String(url)); return { ok: true, status: 200, json: async () => ({ results: [
    { name: 'Ashburn', admin1: 'Virginia', country: 'United States', country_code: 'US', latitude: 39.04, longitude: -77.48 },
    { name: 'Broken', latitude: null, longitude: 1 }] }) }; };
  const r = await W.searchPlaces('Ashburn', { countryCode: 'US' }, f);
  const u = new URL(calls[0]);
  assert.equal(u.origin + u.pathname, 'https://geocoding-api.open-meteo.com/v1/search');
  assert.equal(u.searchParams.get('name'), 'Ashburn');
  assert.equal(u.searchParams.get('countryCode'), 'US');
  assert.deepEqual(r, [{ name: 'Ashburn', admin1: 'Virginia', country: 'United States', countryCode: 'US', lat: 39.04, lng: -77.48 }]);
  await W.searchPlaces('ashburn', { countryCode: 'US' }, f);
  assert.equal(calls.length, 1);
  assert.deepEqual(await W.searchPlaces('a', {}, f), []);
  assert.deepEqual(await W.searchPlaces('Nowhere', {}, async () => ({ ok: true, status: 200, json: async () => ({}) })), []);
});
