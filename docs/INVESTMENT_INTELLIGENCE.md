# Investment Intelligence: methodology, data and limits

The Investment Intelligence page (`peak-power/investment-intelligence.html`) explores how weather, climate, electricity
prices, grid reliability and natural-hazard exposure bear on where a US data center could be built. It extends Peak Power:
the introduction page, prototype and Data Center Explorer are unchanged apart from a navigation link (and, in the
Explorer, one tooltip fix; see "Security note").

**Status of the numbers.** The cooling model and the suitability score are illustrative engineering estimates. The model
has **not** been validated against measurements from real facilities, and the score weights are examples, not investment
preferences. The score is a screening comparison, **not a financial return forecast**: no ROI, NPV or payback is
calculated, because capital cost, revenue, operating cost, financing and a discount rate are not available.

## What the page does

| Area | Behaviour |
|---|---|
| Modes | **Existing Data Centers** (mapped facilities), **Weather & Climate** (seven modelled measures per grid cell), **Investment Suitability** (a modelled score per grid cell). United States by default, with a Global View of the existing facilities. |
| Click or search | Any US point (map click, place search, or "Analyze map centre" for keyboard users) gets: current weather, a 3-year hourly climate history summarised for long-term suitability, an estimated cooling and electricity cost, FEMA county hazard data, a suitability score with every factor shown, and a sensitivity table. |
| What-if scenario | IT load 5-200 MW, baseline PUE, cooling system, electricity price (state average or your own), operating hours, a uniform +0 to +3 °C climate assumption, horizon and yearly price change, and five score weights. Everything recalculates live. |
| Comparison | Up to four analysed locations side by side, with differences from the first. |
| State ranking | States ranked by the mean score of their grid cells under the current weights. |
| Advisor | Answers a fixed set of question types from the engines (see below). |
| Honesty features | Unassessed areas are blank, not low. Missing factors are "Not assessed", never assumed, and the score says how much of the weight it rests on. Measured, modelled and assumed values are tagged. |

## Architecture

Static pages, no build step. The numerical code is in dependency-free modules that run unchanged in the browser and in
Node, so the unit tests and the precomputation use exactly the code the page uses.

| File | Role |
|---|---|
| `js/climate-stats.js` | Hourly series to annual statistics: means, monthly means, extreme-heat days, cooling degree days, wet-bulb, wind, year-to-year variability, temperature histograms; unit conversions. |
| `js/cooling-model.js` | The temperature-dependent facility energy model. |
| `js/scoring-engine.js` | The interpretable weighted multi-criteria score. |
| `js/scenario-engine.js` | Runs cooling and scoring for a location; comparison, sensitivity and state summaries. |
| `js/weather-service.js` | Open-Meteo client: current weather, history, place search, caching, rate-limit tracking, retries. |
| `js/investment-data.js` | Loads the processed data, live FEMA lookup, nearby-facility counts, builds a location for the engines. |
| `js/investment-advisor.js` | Deterministic question answering over the engines. |
| `js/investment-panels.js` | DOM rendering (all text through `textContent`). |
| `js/investment-map.js` | Leaflet map, controls and the analysis flow. |
| `js/us-geo.js` | Point-in-state and distance helpers. |
| `css/investment.css` | Page styles, scoped to `body.ii` and `ii-` classes. Reuses `tokens.css` and `main.css`. |

The map uses Leaflet and Leaflet.markercluster, the same libraries as the Data Center Explorer.

## Data sources

Every dataset's source, date, units, resolution, licence and limitations are in
`peak-power/data/processed/data-sources.json` and appear on the page under "Data sources and methodology".

| Dataset | Used for | Resolution | Licence / terms |
|---|---|---|---|
| Data center locations (`data/data_centers.zip`, OpenStreetMap-derived) | Existing-facilities layer; nearby-facility count | facility | ODbL, © OpenStreetMap contributors |
| Open-Meteo Historical Weather API (ERA5) | Hourly temperature, humidity, wet-bulb, wind for the cooling model and climate statistics | about 25 km, hourly | CC BY 4.0; **free API for non-commercial use only** |
| Open-Meteo Forecast API | Current conditions (context only, never scored) | model grid | same |
| EIA Form EIA-861, 2025 final data | State average industrial price; state SAIDI/SAIFI | state | US government work |
| FEMA National Risk Index (December 2025) | County expected annual building loss rate and hazard ratings | county | US government data; not endorsed by FEMA |
| US Census cartographic boundaries, 1:500,000 | Point-in-state lookup (simplified to about 2 km) | state | public domain |

Deliberately **not** used:

- The FEMA composite risk score. It grows with the amount of property exposed, so it would penalise every large metro
  (Los Angeles, Harris, Cook, King and Maricopa counties all score about 100). The expected annual building loss *rate*
  per dollar of building value is used instead, ranked against all US counties.
- Any water-stress, fiber, transmission or interconnection data. None is integrated, so those factors are listed as
  not assessed and never scored.

**About the location dataset.** `data_centers.zip` has no status field, so existing and planned facilities cannot be
told apart, and a facility being mapped is not evidence that a new site there would be suitable. It has no capacity or
power field.

### Open-Meteo usage and licensing

The free Open-Meteo API is for non-commercial use (attribution under CC BY 4.0) with limits of 600 calls a minute,
5,000 an hour and 10,000 a day. Long date ranges count as several calls; the published examples fit
`weight = max(1, variables / 10) x max(1, days / 14)` per location, so a three-year history is about 78 calls. The page
and the preprocessing script both assume this rule and track their own use (a persistent ledger with an 80 % safety
margin), cache history for 30 days, de-duplicate identical requests, retry server errors with backoff, stop when the API
reports a limit, and fall back to the precomputed grid when the allowance runs low.

**Commercial or investor-facing production use requires an Open-Meteo paid plan, and a paid key must be kept on a
server, never in browser code.**

## The cooling model

Facility power is `P_total = P_IT x PUE`. The overhead `P_total - P_IT` is split rather than called "cooling":

- electrical losses (UPS, transformers): 6 % of IT power; they also become heat to be removed;
- auxiliary load (lighting, security, controls): 2 % of IT power;
- cooling: `scale x ( fixed + Q x ( e x econOverhead + (1 - e) / COP ) )` per unit of IT power, hour by hour, where
  `Q = 1.06` is the heat to remove, `e` is the share that free cooling can carry at the outdoor temperature, and `COP`
  of the mechanical plant falls as the driver temperature rises. The driver is the outdoor dry-bulb or wet-bulb
  temperature, depending on the technology.

`scale` is chosen so the model reproduces the user's baseline PUE at a reference outdoor condition (20 °C dry-bulb /
14 °C wet-bulb, a mild day). Hotter or colder climates then move PUE away from that baseline. The calculation runs over a
1 °C temperature histogram of the history (about 8,760 hours a year), and a climate assumption shifts the histogram by a
uniform offset. Operating hours below 8,760 scale energy linearly (hours assumed spread evenly through the year).

Not modelled: water use, part-load behaviour, humidity control, altitude, heat reuse, and IT load changing over time.
Treating all overhead as cooling would overstate cooling, which is why losses and auxiliary load are separated.

The parameters are round-number assumptions in the usual range for each technology, not manufacturer data:

| Cooling system | Driven by | COP at reference | Free cooling (full → none) | Always-on fans/pumps | Free-cooling overhead |
|---|---|---|---|---|---|
| Air-cooled chillers (`air-chiller`) | dry-bulb | 3.5 at 25 °C, −2.5 %/°C (bounds 1.8–6) | none | 5 % of IT | 0 % of heat moved |
| Air-cooled chillers + free-cooling economizer (`air-chiller-econ`) | dry-bulb | 3.5 at 25 °C, −2.5 %/°C (bounds 1.8–6) | 5 → 15 °C | 5 % of IT | 6 % of heat moved |
| Water-cooled chillers + cooling towers (`water-chiller`) | wet-bulb | 6 at 18 °C, −3.0 %/°C (bounds 3–9) | none | 4 % of IT | 0 % of heat moved |
| Water-cooled chillers + towers with water-side economizer (`water-chiller-econ`) | wet-bulb | 6 at 18 °C, −3.0 %/°C (bounds 3–9) | 8 → 16 °C | 4 % of IT | 5 % of heat moved |
| Evaporative free-air cooling + mechanical trim (`free-air-evap`) | wet-bulb | 4 at 20 °C, −3.0 %/°C (bounds 2.2–6) | 16 → 22 °C | 3 % of IT | 7 % of heat moved |
| Direct-to-chip liquid cooling + dry coolers (`liquid-dry`) | dry-bulb | 4 at 30 °C, −2.0 %/°C (bounds 2.5–7) | 28 → 40 °C | 3 % of IT | 5 % of heat moved |

## The suitability score

Each factor is scaled linearly to 0-100 between a "best" and a "worst" anchor, then combined with the weights. Weights
are renormalised over the factors that could be assessed, so a missing factor is never silently treated as good or bad.

- **All five assessed**: reported as complete. (Water, infrastructure access and power availability are never assessed.)
- **At least half the weight assessed, climate included**: reported as a partial assessment, with the share shown.
- **Too little assessed**: only the climate factor is scored, and it is labelled climate-only.
- **No climate data**: no score.

| Factor | Default weight | Preference | Best → worst anchor | Source |
|---|---|---|---|---|
| Climate & cooling efficiency | 25 % | lower is better | 0.08 → 0.3 cooling kWh per IT kWh | Open-Meteo history (ERA5) through the cooling model |
| Electricity economics | 25 % | lower is better | 6 → 20 ¢/kWh | EIA Form EIA-861 (state average industrial price) or the price you enter |
| Grid reliability | 25 % | lower is better | 60 → 300 minutes/yr | EIA Form EIA-861 reliability file (state SAIDI, without major event days) |
| Environmental risk | 15 % | lower is better | 0 → 100 percentile of US counties | FEMA National Risk Index (county expected annual building loss rate) |
| Market & connectivity | 10 % | higher is better | 100 → 0 mapped facilities within 100 km | Data center dataset (OpenStreetMap-derived) |

The climate factor uses the model's physical cooling energy per kWh of IT load *before* the baseline-PUE calibration, so
it is in the same units for every cooling system and your PUE setting changes cost but not the climate score. The market
factor assumes more nearby mapped facilities is better (an established ecosystem); that is an assumption, since
concentration can also mean grid congestion. Anchors are round numbers chosen for illustration, and the weights are
example weights, not validated preferences.

## The precomputed map grid

`scripts/climate_preprocessing.mjs` computes the climate statistics and FEMA data for a grid of cells over the contiguous
US (3 degree spacing, plus one interior point for each small state with no cell centre), using the same
`climate-stats.js` as the page. A cell's price and reliability come from the state at its centre, so cells straddling a
state line are approximations. The grid is coarse (about 300 km): it shows regional patterns, not site conditions, and
areas without a cell are simply not assessed.

## The Advisor

It recognises these question types: favorable cooling climates; comparing two states; lowest cooling costs; the effect of
a price increase; building N MW in one state instead of another; highest suitability; a profile of one state; and
explaining the selected location's score. It runs the engines and phrases the result, tags every statement as measured,
modelled or assumed, and lists what is missing. **No language model is connected**, and unrecognised questions get the
help list. An LLM could later be added *server-side* to rephrase these structured answers; it must never supply numbers,
and no API key may ever be placed in browser code.

## Refreshing the data

    python scripts/us_reference_data.py          # state outlines, EIA prices and reliability, FEMA distribution, data-sources.json
    node scripts/climate_preprocessing.mjs       # weather history + FEMA for the grid; resumable; about 2 hours on the free tier
    node scripts/climate_preprocessing.mjs --status
    python scripts/process_data_centers.py       # data center locations from data/data_centers.zip

Run `us_reference_data.py` again after the grid changes so `data-sources.json` records the history window. The grid
script spreads its calls to stay inside the free tier; it can be interrupted and resumed (`--day-budget` raises the
24-hour cap, default 8,500 of the 10,000 allowed).

## Tests

    node --test tests/unit/*.test.js                       # numerical models and services: no network, no browser
    node tests/e2e/investment-intelligence.e2e.mjs         # the page in headless Chrome, with mocked APIs
    node tests/e2e/investment-intelligence-extra.e2e.mjs   # layouts, contrast, keyboard, HTML-injection checks
    node tests/e2e/prototype-regression.e2e.mjs            # the prototype against its original single-file version

The browser tests need Chrome or Edge (set `CHROME_PATH` if it is not found). They compare what the page shows with values
computed independently in Node by the same engines.

## Known limitations

- The cooling model and the score are unvalidated; treat results as estimates for exploration.
- Three years of weather is short for climate work; year-to-year variability rests on three annual means.
- ERA5 is a reanalysis (a modelled estimate on a 25 km grid), not station data, and is not suitable for design-day extremes.
- The climate assumption is a uniform temperature offset, not a projection.
- Electricity price is a state average, not a negotiated large-load tariff; SAIDI measures outages, not spare capacity.
- Environmental risk covers natural hazards at county resolution only.
- Water, infrastructure access and power availability are not assessed.
- The grid is coarse, and the advisor understands only a fixed set of questions.
- Individual map markers cannot be reached with the Tab key; keyboard users can search, analyse the map centre, and use
  the lists and tables.

## Security note

Names and URLs in the data come from OpenStreetMap contributors and API responses and are untrusted; all of it is shown
with `textContent`. While building this page it turned out that the Data Center Explorer returned facility names as
*strings* from its tooltip function, which Leaflet parses as HTML. That is fixed (tooltips now return elements) and
covered by a test that uses a hostile facility name. No record in the current data contains markup, so nothing was
exploitable.
