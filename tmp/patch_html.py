p = 'peak-power/data-centers.html'
s = open(p, encoding='utf8', newline='').read()
crlf = '\r\n' in s
s = s.replace('\r\n', '\n')

def sub(old, new):
    global s
    assert s.count(old) == 1, old[:70]
    s = s.replace(old, new)

sub('<meta name="description" content="Explore data center infrastructure and local weather conditions across the United States and around the world.">',
    '<meta name="description" content="Screen a data center site: the Prototype\'s county grade, what a late grid connection does to a 75 MW plan, nearby power plants and the cooling climate.">')
sub('<link rel="stylesheet" href="css/data-centers.css">\n', '<link rel="stylesheet" href="css/data-centers.css">\n<link rel="stylesheet" href="css/site-brief.css">\n')
sub('<p class="eyebrow">Energy infrastructure · Weather</p>', '<p class="eyebrow">Energy infrastructure · Site screening</p>')
sub('''<p class="lede">Explore data center infrastructure and local weather conditions across the United States and around the world. Select a data center, click the map, or search for a place to see its current weather. The data comes from an OpenStreetMap-derived dataset, so it shows facilities that have been mapped, not a complete census, and it contains no power-capacity figures.</p>''',
    '''<p class="lede">Screen a site in three clicks. Click anywhere in the United States, pick a data center, or search a place to open its <strong>site brief</strong>: the Prototype&rsquo;s county grade, what a late grid connection does to a 75&nbsp;MW plan, the power plants nearby, and how hard the climate is to cool. Turn on <strong>County grades</strong> or <strong>Power plants</strong> to see them across the map. The data centers are OpenStreetMap-mapped facilities, not a complete census, with no power-capacity figures.</p>''')
sub('''      <p class="status" id="status" role="status" aria-live="polite">Loading data…</p>
    </div>''', '''      <div class="seg" role="group" aria-label="Map overlays">
        <button type="button" id="ov-counties" aria-pressed="false" title="Colour US counties by the Prototype's site grades">County grades</button>
        <button type="button" id="ov-plants" aria-pressed="false" title="Show US power plants from the EIA-860 survey">Power plants</button>
      </div>
      <label class="ov-layer" id="ov-layer-wrap" hidden>Grade by <select id="ov-layer" aria-label="Which grade to colour counties by"></select></label>
      <p class="status" id="status" role="status" aria-live="polite">Loading data…</p>
    </div>
    <p class="ov-status" id="ov-status" role="status" aria-live="polite"></p>
    <p class="brief-hint" id="brief-hint">Click the map, a data center or a county to open its site brief. Overlays and the brief cover the contiguous US; the cooling climate works anywhere.</p>''')
sub('''      <div class="map-wrap">
        <div id="map" role="region" aria-label="Interactive map of data centers" tabindex="-1"></div>
        <div class="map-overlay" id="map-overlay" role="status">
          <div class="spinner" aria-hidden="true"></div><p>Loading data centers…</p>
        </div>
      </div>''', '''      <div class="map-stage" id="map-stage">
        <div class="map-wrap">
          <div id="map" role="region" aria-label="Interactive map of data centers" tabindex="-1"></div>
          <div class="map-overlay" id="map-overlay" role="status">
            <div class="spinner" aria-hidden="true"></div><p>Loading data centers…</p>
          </div>
        </div>
        <aside class="brief panel" id="brief" aria-label="Site brief" hidden>
          <header class="brief-head">
            <div class="brief-titles">
              <p class="eyebrow">Site brief</p>
              <h2 id="brief-title" tabindex="-1">Selected location</h2>
              <p class="brief-sub" id="brief-sub"></p>
              <p class="brief-coords" id="brief-coords"></p>
            </div>
            <button type="button" class="brief-close" id="brief-close" aria-label="Close the site brief">&times;</button>
          </header>
          <div class="brief-body" id="brief-body" aria-live="polite"></div>
          <p class="brief-foot"><a href="prototype.html">Open the Prototype</a> to plan finance and energy for a project.</p>
        </aside>
      </div>''')
sub('Weather data by <a href="https://open-meteo.com/">Open-Meteo.com</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>; free API, non-commercial use).</p>',
    'Weather and climate data by <a href="https://open-meteo.com/">Open-Meteo.com</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>; free API, non-commercial use). Power plants: <a href="https://www.eia.gov/electricity/data/eia860/">U.S. EIA-860</a> survey.</p>')
sub('<script src="js/climate-weather.js"></script>\n', '<script src="js/climate-weather.js"></script>\n<script src="js/site-brief.js"></script>\n<script src="js/site-panel.js"></script>\n')
if crlf:
    s = s.replace('\n', '\r\n')
open(p, 'w', encoding='utf8', newline='').write(s)
print('html patched')
