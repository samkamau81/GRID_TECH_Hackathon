/* Open-Meteo weather for the Data Center Climate Explorer: current conditions for a point, and place search.

   Endpoints (checked against https://open-meteo.com/en/docs and the live API):
     forecast   https://api.open-meteo.com/v1/forecast            current conditions (model values, refreshed every 15 minutes)
     geocoding  https://geocoding-api.open-meteo.com/v1/search    place name to coordinates

   LICENCE: the free Open-Meteo API is for NON-COMMERCIAL use only; the data is CC BY 4.0 and must be attributed to Open-Meteo.
   Commercial use needs a paid plan, and a paid key must never be put in browser code (route requests through a server).
   The free tier allows 600 calls/minute, 5,000/hour and 10,000/day.

   Protection built in: weather is only fetched when the caller asks (never for every marker), responses are cached
   (current conditions 10 minutes, place search 24 hours), identical in-flight requests are shared, a client-side cap keeps
   requests well under the per-minute limit, an HTTP 429 pauses all requests for a minute, and every request has a timeout. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ClimateWeather = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var URLS = { forecast: 'https://api.open-meteo.com/v1/forecast', geocoding: 'https://geocoding-api.open-meteo.com/v1/search' };
  var CURRENT_VARS = ['temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'weather_code', 'wind_speed_10m', 'precipitation', 'is_day'];
  var TTL = { current: 10 * 60e3, geocode: 24 * 3600e3 };
  var MAX_PER_MINUTE = 30;          // our own ceiling, far below the 600/minute the API allows
  var COOLDOWN_MS = 60e3;           // pause after an HTTP 429
  var TIMEOUT_MS = 10e3;
  var MAX_CACHE = 200;

  function WeatherError(message, code) { var e = new Error(message); e.name = 'WeatherError'; e.code = code; return e; }

  // WMO weather interpretation codes used by Open-Meteo: [description, day icon, night icon].
  var WMO = {
    0: ['Clear sky', '☀️', '🌙'], 1: ['Mainly clear', '🌤️', '🌙'], 2: ['Partly cloudy', '⛅', '☁️'], 3: ['Overcast', '☁️', '☁️'],
    45: ['Fog', '🌫️', '🌫️'], 48: ['Rime fog', '🌫️', '🌫️'],
    51: ['Light drizzle', '🌦️', '🌧️'], 53: ['Moderate drizzle', '🌦️', '🌧️'], 55: ['Dense drizzle', '🌧️', '🌧️'],
    56: ['Light freezing drizzle', '🌧️', '🌧️'], 57: ['Dense freezing drizzle', '🌧️', '🌧️'],
    61: ['Slight rain', '🌦️', '🌧️'], 63: ['Moderate rain', '🌧️', '🌧️'], 65: ['Heavy rain', '🌧️', '🌧️'],
    66: ['Light freezing rain', '🌧️', '🌧️'], 67: ['Heavy freezing rain', '🌧️', '🌧️'],
    71: ['Slight snow', '🌨️', '🌨️'], 73: ['Moderate snow', '🌨️', '🌨️'], 75: ['Heavy snow', '❄️', '❄️'], 77: ['Snow grains', '🌨️', '🌨️'],
    80: ['Slight rain showers', '🌦️', '🌧️'], 81: ['Moderate rain showers', '🌧️', '🌧️'], 82: ['Violent rain showers', '⛈️', '⛈️'],
    85: ['Slight snow showers', '🌨️', '🌨️'], 86: ['Heavy snow showers', '❄️', '❄️'],
    95: ['Thunderstorm', '⛈️', '⛈️'], 96: ['Thunderstorm with slight hail', '⛈️', '⛈️'], 99: ['Thunderstorm with heavy hail', '⛈️', '⛈️']
  };
  /* Description and icon for a weather code, or null when the code is missing or unknown (nothing is guessed). */
  function describe(code, isDay) {
    var w = WMO[code];
    if (!w) return null;
    return { text: w[0], icon: isDay === 0 ? w[2] : w[1] };
  }

  // ------------------------------------------------------------------ plumbing
  var cache = {};        // key -> { at, value }
  var inflight = {};     // key -> Promise
  var sent = [];         // timestamps of recent requests
  var pausedUntil = 0;

  function cacheGet(key, ttl, now) {
    var hit = cache[key];
    if (hit && now - hit.at < ttl) return hit.value;
    if (hit) delete cache[key];
    return undefined;
  }
  function cachePut(key, value, now) {
    var keys = Object.keys(cache);
    if (keys.length >= MAX_CACHE) delete cache[keys[0]];   // oldest first: insertion order
    cache[key] = { at: now, value: value };
  }

  function guard(now) {
    if (now < pausedUntil) throw WeatherError('The weather service asked us to slow down. Try again in a minute.', 'rate_limit');
    sent = sent.filter(function (t) { return now - t < 60e3; });
    if (sent.length >= MAX_PER_MINUTE) throw WeatherError('Too many weather requests in the last minute. Try again shortly.', 'throttled');
    sent.push(now);
  }

  function request(url, fetchImpl) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT_MS) : null;
    return Promise.resolve().then(function () { return (fetchImpl || fetch)(url, ctl ? { signal: ctl.signal } : undefined); })
      .then(function (res) {
        if (res.status === 429) { pausedUntil = Date.now() + COOLDOWN_MS; throw WeatherError('The weather service is rate limiting requests.', 'rate_limit'); }
        if (!res.ok) throw WeatherError('Open-Meteo error ' + res.status, 'http');
        return res.json();
      })
      .catch(function (err) {
        if (err && err.name === 'WeatherError') throw err;
        throw WeatherError(err && err.name === 'AbortError' ? 'The weather service did not respond in time.' : 'The weather service could not be reached.', 'network');
      })
      .then(function (v) { if (timer) clearTimeout(timer); return v; }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  function once(key, work) {
    if (inflight[key]) return inflight[key];
    var p = work().then(function (v) { delete inflight[key]; return v; }, function (e) { delete inflight[key]; throw e; });
    inflight[key] = p;
    return p;
  }

  // ------------------------------------------------------------------ current weather
  function validCoords(lat, lng) {
    return typeof lat === 'number' && typeof lng === 'number' && isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  }

  /* Current conditions for a point, in US units (°F, mph, inches). Resolves to
       { temperature, apparentTemperature, humidity, windSpeed, precipitation, weatherCode, isDay, condition, icon, time, timezone, units, cached }
     where a value Open-Meteo did not return is null. Rejects with a WeatherError (code: invalid, rate_limit, throttled, http, network, format). */
  function getCurrentWeather(lat, lng, fetchImpl, nowMs) {
    lat = Number(lat); lng = Number(lng);
    if (!validCoords(lat, lng)) return Promise.reject(WeatherError('This location has no valid coordinates.', 'invalid'));
    var now = nowMs === undefined ? Date.now() : nowMs;
    var key = 'c:' + lat.toFixed(2) + ',' + lng.toFixed(2);   // ~1 km: finer than the 1-11 km model grid
    var hit = cacheGet(key, TTL.current, now);
    if (hit) return Promise.resolve(Object.assign({}, hit, { cached: true }));
    return once(key, function () {
      guard(now);
      var url = new URL(URLS.forecast);
      url.search = new URLSearchParams({
        latitude: lat.toFixed(4), longitude: lng.toFixed(4), current: CURRENT_VARS.join(','),
        temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch', timezone: 'auto'
      }).toString();
      return request(url, fetchImpl).then(function (data) {
        var c = data && data.current;
        if (!c || typeof c !== 'object') throw WeatherError('The weather service returned no current conditions.', 'format');
        var u = data.current_units || {};
        var pick = function (v) { return typeof v === 'number' && isFinite(v) ? v : null; };
        var cond = describe(c.weather_code, c.is_day);
        var out = {
          temperature: pick(c.temperature_2m), apparentTemperature: pick(c.apparent_temperature), humidity: pick(c.relative_humidity_2m),
          windSpeed: pick(c.wind_speed_10m), precipitation: pick(c.precipitation), weatherCode: pick(c.weather_code), isDay: pick(c.is_day),
          condition: cond ? cond.text : null, icon: cond ? cond.icon : null,
          time: typeof c.time === 'string' ? c.time : null, timezone: data.timezone_abbreviation || data.timezone || null, timezoneName: data.timezone || null,
          units: { temperature: u.temperature_2m || '°F', wind: u.wind_speed_10m || 'mp/h', precipitation: u.precipitation || 'inch', humidity: u.relative_humidity_2m || '%' },
          cached: false
        };
        cachePut(key, out, now);
        return out;
      });
    });
  }

  // ------------------------------------------------------------------ place search
  /* Places matching a name, as [{ name, admin1, country, countryCode, lat, lng }]. `countryCode` (e.g. 'US') narrows the search. */
  function searchPlaces(query, opts, fetchImpl, nowMs) {
    query = String(query || '').trim();
    if (query.length < 2) return Promise.resolve([]);
    opts = opts || {};
    var now = nowMs === undefined ? Date.now() : nowMs;
    var key = 'g:' + (opts.countryCode || '') + ':' + query.toLowerCase();
    var hit = cacheGet(key, TTL.geocode, now);
    if (hit) return Promise.resolve(hit);
    return once(key, function () {
      guard(now);
      var params = { name: query, count: '6', language: 'en', format: 'json' };
      if (opts.countryCode) params.countryCode = opts.countryCode;
      var url = new URL(URLS.geocoding);
      url.search = new URLSearchParams(params).toString();
      return request(url, fetchImpl).then(function (data) {
        var list = (data && Array.isArray(data.results) ? data.results : []).filter(function (r) { return validCoords(r.latitude, r.longitude); }).map(function (r) {
          return { name: r.name, admin1: r.admin1 || '', country: r.country || '', countryCode: r.country_code || '', lat: r.latitude, lng: r.longitude };
        });
        cachePut(key, list, now);
        return list;
      });
    });
  }

  function reset() { cache = {}; inflight = {}; sent = []; pausedUntil = 0; }

  return { getCurrentWeather: getCurrentWeather, searchPlaces: searchPlaces, describe: describe, reset: reset, TTL: TTL, URLS: URLS, CURRENT_VARS: CURRENT_VARS };
});
