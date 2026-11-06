def patch(path, pairs):
    s = open(path, encoding='utf8', newline='').read()
    crlf = '\r\n' in s
    s = s.replace('\r\n', '\n')
    for old, new in pairs:
        assert s.count(old) == 1, (path, old[:80])
        s = s.replace(old, new)
    if crlf:
        s = s.replace('\n', '\r\n')
    open(path, 'w', encoding='utf8', newline='').write(s)

# ---- lib.mjs: archive mock
patch('tests/e2e/lib.mjs', [
 ("export function openMeteoMocks({ onCurrent, onGeocode, failCurrent } = {}) {",
  "export function openMeteoMocks({ onCurrent, onGeocode, failCurrent, onArchive, failArchive } = {}) {"),
 ("  return [\n    { re: /api\.open-meteo\.com\/v1\/forecast/,",
  """  // three years of hourly temperature (seasonal and daily swing) and a constant 60% humidity: a Moderate cooling climate
  const archive = () => { const time = [], t = [], h = []; for (let i = 0; i < 24 * 1095; i++) { const d = new Date(Date.UTC(2023, 0, 1, i)), doy = i / 24, hr = i % 24;
    time.push(d.toISOString().slice(0, 13) + ':00'); t.push(Math.round((58 + 24 * Math.sin(2 * Math.PI * ((doy % 365.25) - 110) / 365.25) - 8 * Math.cos(2 * Math.PI * hr / 24)) * 10) / 10); h.push(60); }
    return { latitude: 39.05, longitude: -77.53, timezone: 'America/New_York', hourly_units: { time: 'iso8601', temperature_2m: '\u00b0F', relative_humidity_2m: '%' }, hourly: { time, temperature_2m: t, relative_humidity_2m: h } }; };
  return [
    { re: /archive-api\.open-meteo\.com/, pattern: '*archive-api.open-meteo.com*', handler: async (u) => { onArchive && onArchive(u); return failArchive ? { status: 500, body: { error: true } } : { body: archive() }; } },
    { re: /api\.open-meteo\.com\/v1\/forecast/,"""),
])

# ---- climate-explorer e2e: popup keeps facility info, weather and the point selection live in the site brief
patch('tests/e2e/climate-explorer.e2e.mjs', [
 ("""  // data center popup with weather
  await p.ev(`(() => { const m = window.__maps[0]; let done = false; m.eachLayer(function walk(l) { if (!done && l instanceof L.CircleMarker && l.getPopup()) { done = true; l.openPopup(); } }); })()`);
  ok(await p.waitFor(`document.querySelector('.leaflet-popup .wx dd')`), 'data center popup shows weather');
  const pop = await p.ev(`document.querySelector('.leaflet-popup').innerText.replace(/\\s+/g,' ')`);
  ok(/Current local weather/.test(pop) && /53\.4 °F/.test(pop) && /7\.2 mph/.test(pop) && /61 %/.test(pop) && /Overcast/.test(pop), `popup values and units from the API response (${pop.slice(0, 160)}...)`);
  ok(/Coordinates/.test(pop) && /Open-Meteo/.test(pop), 'popup shows coordinates and Open-Meteo attribution');
  ok(calls.current.length === 1, 'exactly one weather request for one selection');""",
  """  // data center: the popup keeps the facility details, the site brief opens beside the map and holds the weather
  await p.ev(`(() => { const m = window.__maps[0]; let done = false; m.eachLayer(function walk(l) { if (!done && l instanceof L.CircleMarker && l.getPopup()) { done = true; l.fire('click'); l.openPopup(); } }); })()`);
  ok(await p.waitFor(`document.querySelector('.leaflet-popup h3') && document.querySelector('.leaflet-popup dl')`), 'data center popup shows the facility details');
  ok(await p.waitFor(`!document.getElementById('brief').hidden && document.getElementById('brief-title').textContent.length > 0`), 'data center click opens the site brief');
  ok(calls.current.length === 0, 'weather is not requested until the weather section is opened');
  await p.ev(`document.querySelector('#brief details.wxd summary').click()`);
  ok(await p.waitFor(`document.querySelector('#brief .wx dd')`), 'site brief shows current weather when opened');
  const pop = await p.ev(`document.querySelector('#brief .wxd').innerText.replace(/\\s+/g,' ')`);
  ok(/Current local weather/.test(pop) && /53\.4 °F/.test(pop) && /7\.2 mph/.test(pop) && /61 %/.test(pop) && /Overcast/.test(pop), `weather values and units from the API response (${pop.slice(0, 160)}...)`);
  ok(/Open-Meteo/.test(pop), 'weather shows the Open-Meteo attribution');
  ok(calls.current.length === 1, 'exactly one weather request for one selection');"""),
 ("""  await p.ev(`(() => { const m = window.__maps[0]; m.closePopup(); m.fire('click', { latlng: L.latLng(31.0, -97.5) }); })()`);
  ok(await p.waitFor(`document.querySelector('.leaflet-popup .wx dd') && /Selected location/.test(document.querySelector('.leaflet-popup').innerText)`), 'map click shows weather for the selected point');""",
  """  await p.ev(`(() => { const m = window.__maps[0]; m.closePopup(); m.fire('click', { latlng: L.latLng(31.0, -97.5) }); })()`);
  ok(await p.waitFor(`/Selected location/.test(document.getElementById('brief-title').textContent) && /31\\.0000, -97\\.5000/.test(document.getElementById('brief-coords').textContent)`), 'map click opens the site brief for the selected point');"""),
 ("""  await p.click('#wx-results button');
  ok(await p.waitFor(`/Ashburn/.test(document.querySelector('.leaflet-popup')?.innerText || '') && document.querySelector('.leaflet-popup .wx dd')`), 'chosen place shows weather');""",
  """  await p.click('#wx-results button');
  ok(await p.waitFor(`/Ashburn/.test(document.getElementById('brief-title').textContent)`), 'chosen place opens its site brief');"""),
 ("""  await f.ev(`(() => { const m = window.__maps[0]; let done = false; m.eachLayer(function (l) { if (!done && l instanceof L.CircleMarker && l.getPopup()) { done = true; l.openPopup(); } }); })()`);
  ok(await f.waitFor(`/Weather unavailable/.test(document.querySelector('.leaflet-popup .wx')?.innerText || '')`), 'API failure shows a clear weather-unavailable message');
  ok(await f.ev(`!!document.querySelector('.leaflet-popup h3') && !!document.querySelector('.leaflet-popup dl')`), 'facility information stays visible when weather fails');""",
  """  await f.ev(`(() => { const m = window.__maps[0]; let done = false; m.eachLayer(function (l) { if (!done && l instanceof L.CircleMarker && l.getPopup()) { done = true; l.fire('click'); l.openPopup(); } }); })()`);
  await f.waitFor(`!document.getElementById('brief').hidden`);
  await f.ev(`document.querySelector('#brief details.wxd summary').click()`);
  ok(await f.waitFor(`/Weather unavailable/.test(document.querySelector('#brief .wx')?.innerText || '')`), 'API failure shows a clear weather-unavailable message');
  ok(await f.ev(`!!document.querySelector('.leaflet-popup h3') && !!document.querySelector('.leaflet-popup dl') && document.getElementById('brief-title').textContent.length > 0`), 'facility information stays visible when weather fails');"""),
])
print('tests patched')
