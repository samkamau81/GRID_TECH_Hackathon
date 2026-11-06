p = 'peak-power/js/climate-weather.js'
s = open(p, encoding='utf8', newline='').read()
crlf = '\r\n' in s
s = s.replace('\r\n', '\n')


def sub(old, new):
    global s
    assert s.count(old) == 1, ('anchor not found exactly once', old[:60])
    s = s.replace(old, new)


sub("/* Open-Meteo weather for the Data Center Climate Explorer: current conditions for a point, and place search.\n",
    "/* Open-Meteo weather for the Data Center Climate Explorer: current conditions for a point, place search, and a 3-year cooling-climate summary.\n")
sub("     geocoding  https://geocoding-api.open-meteo.com/v1/search    place name to coordinates\n",
    "     geocoding  https://geocoding-api.open-meteo.com/v1/search    place name to coordinates\n"
    "     archive    https://archive-api.open-meteo.com/v1/archive     hourly temperature and humidity for the last 3 full years (ERA5 reanalysis)\n")
sub("var URLS = { forecast: 'https://api.open-meteo.com/v1/forecast', geocoding: 'https://geocoding-api.open-meteo.com/v1/search' };",
    "var URLS = { forecast: 'https://api.open-meteo.com/v1/forecast', geocoding: 'https://geocoding-api.open-meteo.com/v1/search', archive: 'https://archive-api.open-meteo.com/v1/archive' };")
sub("var TTL = { current: 10 * 60e3, geocode: 24 * 3600e3 };",
    "var TTL = { current: 10 * 60e3, geocode: 24 * 3600e3, climate: 90 * 24 * 3600e3 };")
sub("var TIMEOUT_MS = 10e3;",
    "var TIMEOUT_MS = 10e3;\n  var ARCHIVE_TIMEOUT_MS = 25e3;    // three years of hourly values is about 0.7 MB before compression")
sub("function request(url, fetchImpl) {\n    var ctl = typeof AbortController === 'function' ? new AbortController() : null;\n    var timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT_MS) : null;",
    "function request(url, fetchImpl, timeoutMs) {\n    var ctl = typeof AbortController === 'function' ? new AbortController() : null;\n    var timer = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs || TIMEOUT_MS) : null;")

new = open('tmp/climate_block.js', encoding='utf8').read()
sub("  function reset() { cache = {}; inflight = {}; sent = []; pausedUntil = 0; }\n", new + "\n  function reset() { cache = {}; inflight = {}; sent = []; pausedUntil = 0; }\n")
sub("return { getCurrentWeather: getCurrentWeather, searchPlaces: searchPlaces, describe: describe, reset: reset, TTL: TTL, URLS: URLS, CURRENT_VARS: CURRENT_VARS };",
    "return { getCurrentWeather: getCurrentWeather, searchPlaces: searchPlaces, getClimateHistory: getClimateHistory, summarizeClimate: summarizeClimate, gradeClimate: gradeClimate,\n"
    "    wetBulbF: wetBulbF, describe: describe, reset: reset, TTL: TTL, URLS: URLS, CURRENT_VARS: CURRENT_VARS, CLIMATE_RULES: CLIMATE_RULES, MONTHS: MONTHS,\n"
    "    CLIMATE_LIMITS: { coolBelowF: COOL_BELOW_F, hotF: HOT_F, humidWbF: HUMID_WB_F, bandHotF: BAND_HOT_F } };")
if crlf:
    s = s.replace('\n', '\r\n')
open(p, 'w', encoding='utf8', newline='').write(s)
print('patched, crlf =', crlf)
