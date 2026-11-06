def patch(path, pairs):
    s = open(path, encoding='utf8', newline='').read()
    crlf = '\r\n' in s
    s = s.replace('\r\n', '\n')
    for old, new in pairs:
        assert s.count(old) == 1, (path, old[:70])
        s = s.replace(old, new)
    if crlf:
        s = s.replace('\n', '\r\n')
    open(path, 'w', encoding='utf8', newline='').write(s)

readme_add = '''## Site brief, county grades and power plants (Explorer)

Click the map, a data center or a search result and the **site brief** opens beside the map (a drawer over its right edge on mid-size screens,
under it on phones). It answers an investor's questions in this order:

1. **Verdict.** The Prototype's *Find a site* overall grade for the county, plus Time to power, Natural hazard, Policy and Cooling climate.
2. **What this means for a 75 MW plan.** The county's Time-to-power grade picks a grid-delay case (screening assumption: Good = on time, Moderate = 6
   months late, Bad = 12 months late; not graded = no case). The numbers are the **Prototype's own engine** for the packet case with that delay
   (`delayCase()` in `js/prototype.js`). Finding: a late grid mostly costs time and revenue (about 6 months of service and about $48M of 10-year profit per
   6 months late), not power price (under $0.50/MWh) or carbon (about +3 kg/MWh). Profit is labelled a business assumption. These are ERCOT (Texas) packet-case
   results: they show how much timing matters, not a county's electricity price or grid emissions, which are not modelled outside Texas.
3. **Power around here.** EIA-860 (2024) plants within 50 miles: operating capacity by fuel, zero-carbon share of nameplate, planned capacity and the five
   largest plants. Nameplate is supply, not headroom, and a wind or solar MW makes far fewer MWh than a gas MW, so read the share as grid carbon context only.
4. **Cooling climate.** Three full years of hourly temperature and humidity (Open-Meteo archive, ERA5): cooling degree days (base 65 F), 95th-percentile
   temperature, hours at 95 F or more, humid hours (wet-bulb at least 75 F, from Stull 2011), share of hours below 65 F, hours by cooling need and degree days by month.
   Graded Mild / Moderate / Demanding by `CLIMATE_RULES` in `js/climate-weather.js` (a team screening assumption, shown in the panel). Works worldwide.
5. **All eight Prototype factors** with a one-line reason each, and the weather now (fetched only when opened).

Two map overlays: **County grades** (3,106 contiguous-US counties coloured by any Prototype grade) and **Power plants** (14,518 EIA-860 plants, sized by MW, small
ones appear as you zoom). Their data loads only when first needed (about 0.1 MB of outlines and 0.2 MB of grades gzipped, plus 0.3 MB of plants).

**Data files and how to rebuild them**

| File | Built by | Source |
|---|---|---|
| `js/data/site-grades.js` | `node scripts/build_site_grades.mjs` (headless Chrome, about a minute) | Reads grades, facts and the delay cases from the Prototype's own code through a read-only hook (`window.PEAKPOWER_PROTOTYPE_API`), so the pages cannot disagree. |
| `data/processed/county-outlines.json` | `python -I scripts/build_county_outlines.py` | The Prototype's county map, converted back to latitude/longitude (it is a standard Albers layout; round trip checked). |
| `data/processed/eia860-plants.json` | `python -I scripts/build_eia860.py <zip>` (see the script header) | EIA-860 2024. |

Re-run `build_site_grades.mjs` after any change to the grading code or engine inputs; `tests/e2e/site-overlay.e2e.mjs` fails if the file is stale.

**Limits.** County outlines are generalised (about 5 km), so a point within a few km of a county line may land in the neighbour (the brief says when it is
near a line). Alaska and Hawaii have no county layer (their plants and climate still work). Climate is a model grid (about 10 km), not a site measurement, and
describes the climate, not a cooling design. Open-Meteo's free API is non-commercial only; keep the attribution.

'''
patch('peak-power/README.md', [
 ("## Data Center Climate Explorer (map and data)\n", readme_add + "## Data Center Climate Explorer (map and data)\n"),
 ("│   ├── theme.css           Brand theme",
  "│   ├── site-brief.css      Site brief panel and overlay controls (Explorer)\n│   ├── theme.css           Brand theme"),
])
patch('tests/README.md', [
 ("| `climate-weather.test.js` |",
  "| `site-brief.test.js` | county lookup on real outlines, every county has grades and facts, nearby-plant sums and ranking, zero-carbon share, factor facts, the delay scenario, the cooling-climate summary and its Mild/Moderate/Demanding rule, Stull wet-bulb, climate history request shape, caching and errors |\n| `climate-weather.test.js` |"),
 ("- **prototype-portfolio**:",
  "- **site-overlay** (`node tests/e2e/site-overlay.e2e.mjs`, about a minute): county grades and power plant layers, the site brief for Ashburn VA, Austin TX and a non-US point (grade, plan impact, nearby power, climate), cached history, failure and retry, mobile stacking, and a staleness check that every exported county grade and the 6-month delay case equal what the Prototype computes now.\n- **prototype-portfolio**:"),
])
patch('docs/DATA_GAPS.md', [
 ("The Data Center Climate Explorer fetches current weather on demand from Open-Meteo.",
  "The Data Center Climate Explorer fetches current weather and a three-year cooling-climate summary (ERA5 via Open-Meteo) on demand."),
])
print('docs patched')
