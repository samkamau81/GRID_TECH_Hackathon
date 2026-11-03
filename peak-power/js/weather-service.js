/* Open-Meteo weather service: current conditions, multi-year hourly history summarised for long-term suitability, and place search.

   Endpoints (verified against https://open-meteo.com/en/docs and the live API):
     forecast   https://api.open-meteo.com/v1/forecast                    current conditions (operational context only)
     archive    https://archive-api.open-meteo.com/v1/archive             ERA5 reanalysis history (about 25 km, hourly, about 5-day delay)
     geocoding  https://geocoding-api.open-meteo.com/v1/search            place names to coordinates

   LICENCE AND LIMITS: the free Open-Meteo API is for NON-COMMERCIAL use only, data is CC BY 4.0 (attribute Open-Meteo), and the free
   tier allows 600 calls/minute, 5,000/hour and 10,000/day. A request spanning more than 14 days or using more than 10 variables
   counts as several calls; the published examples fit  weight = max(1, variables/10) x max(1, days/14)  per location, which this
   service assumes. Commercial use needs a paid plan; do not put a paid API key in browser code (route requests through a server).

   Protection built in: a persistent usage ledger with a safety margin, in-flight de-duplication, caching (history 30 days,
   current conditions 10 minutes), retry with backoff for network and server errors, and a hard stop when the API reports a limit.
   A request that would exceed the budget is refused locally (BudgetError) so the caller can fall back to precomputed data. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./climate-stats.js'));
  else root.PeakPowerWeather = factory(root.PeakPowerClimate);
})(typeof self !== 'undefined' ? self : this, function (Climate) {
  'use strict';

  var URLS = { forecast: 'https://api.open-meteo.com/v1/forecast', archive: 'https://archive-api.open-meteo.com/v1/archive', geocoding: 'https://geocoding-api.open-meteo.com/v1/search' };
  var CURRENT_VARS = 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,wet_bulb_temperature_2m';
  var HISTORY_VARS = ['temperature_2m', 'relative_humidity_2m', 'wet_bulb_temperature_2m', 'wind_speed_10m'];
  var LIMITS = { perMinute: 600, perHour: 5000, perDay: 10000 };
  var SAFETY = 0.8;                     // use at most 80 % of each limit
  var TTL = { history: 30 * 864e5, current: 10 * 60e3, geocode: 864e5 };

  /* The reference implementation supplied with the brief, unchanged apart from one verified extra variable (wet-bulb). */
  async function getWeather(lat, lng, fetchImpl) {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({
      latitude: lat,
      longitude: lng,
      current: CURRENT_VARS,
      temperature_unit: 'fahrenheit',
      wind_speed_unit: 'mph'
    });
    const response = await (fetchImpl || fetch)(url);
    if (!response.ok) {
      throw new Error(`Open-Meteo error ${response.status}`);
    }
    const data = await response.json();
    return data.current;
  }

  function WeatherError(message, code, extra) {
    var e = new Error(message); e.name = 'WeatherError'; e.code = code;
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }

  /* Estimated API-call weight of one request (see the note at the top). */
  function callWeight(days, variables, locations) {
    return Math.max(1, variables / 10) * Math.max(1, days / 14) * (locations || 1);
  }

  /* The last `n` complete calendar years, e.g. [2023, 2024, 2025] in 2026. */
  function historyYears(n, today) {
    var last = (today || new Date()).getUTCFullYear() - 1, out = [];
    for (var i = n - 1; i >= 0; i--) out.push(last - i);
    return out;
  }
  var daysBetween = function (a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1; };
  var key2 = function (lat, lng) { return (Math.round(lat * 100) / 100).toFixed(2) + ',' + (Math.round(lng * 100) / 100).toFixed(2); };

  /* The WMO weather interpretation codes Open-Meteo returns. */
  var WMO = { 0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle',
    56: 'Freezing drizzle', 57: 'Dense freezing drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Heavy freezing rain', 71: 'Light snow',
    73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Light rain showers', 81: 'Rain showers', 82: 'Violent rain showers', 85: 'Light snow showers', 86: 'Heavy snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Severe thunderstorm with hail' };
  var describeCode = function (c) { return WMO[c] || 'Unknown conditions'; };

  /* opts: { fetchImpl, storage ({getItem,setItem,removeItem} or null), now (ms clock), sleep (ms -> promise), years, retries, urls } */
  function create(opts) {
    var o = opts || {};
    var doFetch = o.fetchImpl || (typeof fetch === 'function' ? fetch.bind(typeof self !== 'undefined' ? self : undefined) : null);
    var now = o.now || function () { return Date.now(); };
    var sleep = o.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var storage = o.storage === undefined ? (typeof localStorage !== 'undefined' ? localStorage : null) : o.storage;
    var urls = Object.assign({}, URLS, o.urls || {});
    var nYears = o.years || 3, retries = o.retries === undefined ? 2 : o.retries;
    var stats = { requests: 0, cacheHits: 0 };
    var inflight = {}, memory = {}, blockedUntil = 0, blockedReason = '';

    // ---- storage helpers (every access guarded: private windows and quota errors must never break the page)
    var read = function (k) { try { var v = storage && storage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
    var write = function (k, v) { try { if (storage) storage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

    // ---- usage ledger
    var LEDGER_KEY = 'pp.om.ledger';
    var ledger = (read(LEDGER_KEY) || []).filter(function (e) { return e[0] > now() - 864e5; });
    var used = function (ms) { var t = now() - ms; return ledger.reduce(function (a, e) { return e[0] > t ? a + e[1] : a; }, 0); };
    function budget() {
      return { usedMinute: used(6e4), usedHour: used(36e5), usedDay: used(864e5), limits: LIMITS, safety: SAFETY,
               allowedHour: LIMITS.perHour * SAFETY, allowedDay: LIMITS.perDay * SAFETY, blockedUntil: blockedUntil > now() ? blockedUntil : 0, blockedReason: blockedReason,
               requests: stats.requests, cacheHits: stats.cacheHits };
    }
    function reserve(weight) {
      if (blockedUntil > now()) throw WeatherError('Open-Meteo reported its ' + blockedReason + ' limit; try again in ' + Math.ceil((blockedUntil - now()) / 60000) + ' min.', 'rate-limit', { retryAt: blockedUntil });
      var caps = [{ ms: 6e4, cap: LIMITS.perMinute * SAFETY, name: 'minute' }, { ms: 36e5, cap: LIMITS.perHour * SAFETY, name: 'hour' }, { ms: 864e5, cap: LIMITS.perDay * SAFETY, name: 'day' }];
      for (var i = 0; i < caps.length; i++) {
        var c = caps[i], inUse = used(c.ms);
        if (inUse + weight > c.cap) {
          throw WeatherError('This request would use about ' + Math.round(weight) + ' of the free Open-Meteo allowance (' + Math.round(inUse) + ' of ' + Math.round(c.cap) + ' used this ' + c.name + '). Using stored data instead.', 'budget', { window: c.name });
        }
      }
      ledger.push([now(), weight]); write(LEDGER_KEY, ledger);
    }

    // ---- one HTTP call with retry/backoff, local accounting and limit detection
    async function http(url, weight) {
      reserve(weight);
      var lastErr;
      for (var attempt = 0; attempt <= retries; attempt++) {
        if (attempt) await sleep(500 * Math.pow(2, attempt - 1));
        var res;
        try { stats.requests++; res = await doFetch(url); }
        catch (e) { lastErr = WeatherError('Network error: ' + (e && e.message || e), 'network'); continue; }
        var body = null;
        try { body = await res.json(); } catch (e) { body = null; }
        var reason = body && body.reason ? String(body.reason) : '';
        if (res.status === 429 || /limit/i.test(reason)) {
          var kind = /minut/i.test(reason) ? 'minute' : /day|daily/i.test(reason) ? 'day' : 'hour';
          blockedUntil = now() + (kind === 'minute' ? 70e3 : kind === 'hour' ? 15 * 60e3 : 60 * 60e3); blockedReason = kind;
          throw WeatherError('Open-Meteo says the ' + kind + 'ly request limit has been reached (' + (reason || 'HTTP ' + res.status) + ').', 'rate-limit', { retryAt: blockedUntil });
        }
        if (res.status >= 500) { lastErr = WeatherError('Open-Meteo server error ' + res.status, 'http', { status: res.status }); continue; }
        if (!res.ok || (body && body.error)) throw WeatherError('Open-Meteo error ' + res.status + (reason ? ': ' + reason : ''), 'http', { status: res.status });
        if (!body) throw WeatherError('Open-Meteo returned an unreadable response.', 'parse');
        return body;
      }
      throw lastErr;
    }
    function once(k, fn) {   // concurrent identical requests share one call
      if (inflight[k]) return inflight[k];
      inflight[k] = fn().then(function (v) { delete inflight[k]; return v; }, function (e) { delete inflight[k]; throw e; });
      return inflight[k];
    }

    // ---- current conditions
    function getCurrent(lat, lng) {
      var k = 'cur:' + key2(lat, lng), hit = memory[k];
      if (hit && now() - hit.t < TTL.current) { stats.cacheHits++; return Promise.resolve(hit.v); }
      return once(k, async function () {
        var url = new URL(urls.forecast);
        url.search = new URLSearchParams({ latitude: lat, longitude: lng, current: CURRENT_VARS, temperature_unit: 'fahrenheit', wind_speed_unit: 'mph' });
        var d = await http(url.toString(), 1);
        if (!d.current) throw WeatherError('Open-Meteo returned no current conditions.', 'parse');
        var v = { current: d.current, units: d.current_units || {}, description: describeCode(d.current.weather_code), elevationM: d.elevation, fetchedAt: now() };
        memory[k] = { t: now(), v: v };
        return v;
      });
    }

    /* Current conditions for several places in ONE request (Open-Meteo accepts comma-separated coordinates; each location counts as
       one call). Returns results in the same order as `points` ([{lat, lon}]); places already cached are not requested again. */
    async function getCurrentBatch(points) {
      var out = new Array(points.length), todo = [];
      points.forEach(function (p, i) {
        var hit = memory['cur:' + key2(p.lat, p.lon)];
        if (hit && now() - hit.t < TTL.current) { stats.cacheHits++; out[i] = hit.v; } else todo.push(i);
      });
      if (!todo.length) return out;
      var url = new URL(urls.forecast);
      url.search = new URLSearchParams({ latitude: todo.map(function (i) { return points[i].lat; }).join(','), longitude: todo.map(function (i) { return points[i].lon; }).join(','),
        current: CURRENT_VARS, temperature_unit: 'fahrenheit', wind_speed_unit: 'mph' });
      var d = await http(url.toString(), todo.length);
      var list = Array.isArray(d) ? d : [d];          // one location returns an object, several return an array
      if (list.length !== todo.length) throw WeatherError('Open-Meteo returned ' + list.length + ' locations for ' + todo.length + ' requested.', 'parse');
      todo.forEach(function (i, j) {
        if (!list[j] || !list[j].current) throw WeatherError('Open-Meteo returned no current conditions for one location.', 'parse');
        var v = { current: list[j].current, units: list[j].current_units || {}, description: describeCode(list[j].current.weather_code), elevationM: list[j].elevation, fetchedAt: now() };
        memory['cur:' + key2(points[i].lat, points[i].lon)] = { t: now(), v: v };
        out[i] = v;
      });
      return out;
    }

    // ---- history, summarised for long-term suitability (a single day is never used for that)
    function getHistory(lat, lng, hopts) {
      var years = historyYears((hopts && hopts.years) || nYears, o.today && new Date(o.today()));
      var start = years[0] + '-01-01', end = years[years.length - 1] + '-12-31';
      var k = 'hist:' + key2(lat, lng) + ':' + years[0] + '-' + years[years.length - 1], sk = 'pp.om.' + k;
      var mem = memory[k], stored = mem || read(sk);
      if (stored && now() - stored.t < TTL.history) { stats.cacheHits++; memory[k] = stored; return Promise.resolve(Object.assign({}, stored.v, { source: 'cache' })); }
      return once(k, async function () {
        var url = new URL(urls.archive);
        url.search = new URLSearchParams({ latitude: lat, longitude: lng, start_date: start, end_date: end, hourly: HISTORY_VARS.join(','), timezone: 'auto', wind_speed_unit: 'mph' });
        var weight = callWeight(daysBetween(start, end), HISTORY_VARS.length);
        var d = await http(url.toString(), weight);
        if (!d.hourly || !d.hourly.time) throw WeatherError('Open-Meteo returned no hourly history for this location.', 'parse');
        var v = { summary: Climate.summarize(d.hourly), years: years, apiLatitude: d.latitude, apiLongitude: d.longitude, elevationM: d.elevation, timezone: d.timezone, callWeight: weight, fetchedAt: now() };
        memory[k] = { t: now(), v: v };
        if (!write(sk, memory[k])) { /* storage full or unavailable: the in-memory copy still works for this session */ }
        trimIndex(sk);
        return Object.assign({}, v, { source: 'live' });
      });
    }
    function trimIndex(sk) {   // keep at most 40 stored histories (about 3 KB each)
      var idx = (read('pp.om.index') || []).filter(function (x) { return x !== sk; }); idx.push(sk);
      while (idx.length > 40) { try { storage.removeItem(idx.shift()); } catch (e) { idx.shift(); } }
      write('pp.om.index', idx);
    }

    // ---- place search (United States only)
    function geocode(query) {
      var q = String(query || '').trim();
      if (q.length < 2) return Promise.resolve([]);
      var k = 'geo:' + q.toLowerCase(), hit = memory[k];
      if (hit && now() - hit.t < TTL.geocode) { stats.cacheHits++; return Promise.resolve(hit.v); }
      return once(k, async function () {
        var url = new URL(urls.geocoding);
        url.search = new URLSearchParams({ name: q, count: 8, language: 'en', format: 'json', countryCode: 'US' });
        var d = await http(url.toString(), 1);
        var v = (d.results || []).filter(function (r) { return r.country_code === 'US'; })
          .map(function (r) { return { name: r.name, admin1: r.admin1 || '', lat: r.latitude, lon: r.longitude, label: r.name + (r.admin1 ? ', ' + r.admin1 : '') }; });
        memory[k] = { t: now(), v: v };
        return v;
      });
    }

    return { getCurrent: getCurrent, getCurrentBatch: getCurrentBatch, getHistory: getHistory, geocode: geocode, budget: budget };
  }

  return { URLS: URLS, LIMITS: LIMITS, SAFETY: SAFETY, CURRENT_VARS: CURRENT_VARS, HISTORY_VARS: HISTORY_VARS, getWeather: getWeather, create: create,
           callWeight: callWeight, historyYears: historyYears, describeCode: describeCode };
});
