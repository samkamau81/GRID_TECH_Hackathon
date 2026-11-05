/* Open-Meteo weather for the Data Center Climate Explorer: current conditions for a point, place search, and a 3-year cooling-climate summary.

   Endpoints (checked against https://open-meteo.com/en/docs and the live API):
     forecast   https://api.open-meteo.com/v1/forecast            current conditions (model values, refreshed every 15 minutes)
     geocoding  https://geocoding-api.open-meteo.com/v1/search    place name to coordinates
     archive    https://archive-api.open-meteo.com/v1/archive     hourly temperature and humidity for the last 3 full years (ERA5 reanalysis)

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

  var URLS = { forecast: 'https://api.open-meteo.com/v1/forecast', geocoding: 'https://geocoding-api.open-meteo.com/v1/search', archive: 'https://archive-api.open-meteo.com/v1/archive' };
  var CURRENT_VARS = ['temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'weather_code', 'wind_speed_10m', 'precipitation', 'is_day'];
  var TTL = { current: 10 * 60e3, geocode: 24 * 3600e3, climate: 90 * 24 * 3600e3 };
  var MAX_PER_MINUTE = 30;          // our own ceiling, far below the 600/minute the API allows
  var COOLDOWN_MS = 60e3;           // pause after an HTTP 429
  var TIMEOUT_MS = 10e3;
  var ARCHIVE_TIMEOUT_MS = 25e3;    // three years of hourly values is about 0.7 MB before compression
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

  function request(url, fetchImpl, timeoutMs) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs || TIMEOUT_MS) : null;
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
    var p = Promise.resolve().then(work).then(function (v) { delete inflight[key]; return v; }, function (e) { delete inflight[key]; throw e; });
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

  function reset() { cache = {}; inflight = {}; sent = []; pausedUntil = 0; }

  return { getCurrentWeather: getCurrentWeather, searchPlaces: searchPlaces, getClimateHistory: getClimateHistory, summarizeClimate: summarizeClimate, gradeClimate: gradeClimate,
    wetBulbF: wetBulbF, describe: describe, reset: reset, TTL: TTL, URLS: URLS, CURRENT_VARS: CURRENT_VARS, CLIMATE_RULES: CLIMATE_RULES, MONTHS: MONTHS,
    CLIMATE_LIMITS: { coolBelowF: COOL_BELOW_F, hotF: HOT_F, humidWbF: HUMID_WB_F, bandHotF: BAND_HOT_F } };
});
