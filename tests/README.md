# Tests

## Unit tests (no network, no browser)

    node --test tests/unit/*.test.js

Node 20 or newer. They cover every numerical module used by the Investment Intelligence page:

| File | Covers |
|---|---|
| `climate-stats.test.js` | unit conversions, wet-bulb formula against published values, degree days, extreme-heat days, year-to-year variability, histograms |
| `us-geo.test.js` | distances, point-in-state lookup for known places and outside the US |
| `cooling-model.test.js` | hand-calculated cooling ratio, calibration to the baseline PUE for every system, energy conservation, scaling with load and hours, monotonic behaviour in hotter climates, economizer and humidity behaviour, climate offset, invalid input |
| `scoring-engine.test.js` | normalisation and direction of every factor, percentile ranking, weights, missing-data behaviour (never assumed), partial / climate-only / insufficient results |
| `scenario-engine.test.js` | cost arithmetic, price precedence, multi-year sums, comparison deltas, sensitivity, state summaries and ranking; checks that no ROI/NPV/payback appears |
| `weather-service.test.js` | request parameters, call-weight rule, caching and expiry, de-duplication, the local budget refusal, HTTP 429 handling, retries, malformed responses, search, unavailable storage |
| `investment-data.test.js` | loading the processed files, the FEMA lookup and its failure modes, building a location |
| `investment-advisor.test.js` | every question type, that its numbers equal the engines', missing-evidence reporting, plain-text output |

## Browser tests (headless Chrome or Edge)

    node tests/e2e/investment-intelligence.e2e.mjs
    node tests/e2e/investment-intelligence-extra.e2e.mjs
    node tests/e2e/prototype-regression.e2e.mjs

Node 22 or newer and Chrome or Edge (set `CHROME_PATH` if it is not found). The suites serve `peak-power/` on a free local
port themselves, and need internet access only for map tiles. Weather and hazard APIs are mocked, so these tests do not
use any of the free Open-Meteo allowance, and the climate grid is served from a snapshot taken at the start of the run.

- **investment-intelligence**: the page's three modes and layers, a clicked location, the scenario controls, comparison,
  sensitivity, search, the advisor, and failure behaviour (exhausted budget, API limit, FEMA outage, missing data). Expected
  values are computed in Node by the same engines and compared with what the page displays.
- **investment-intelligence-extra**: layouts at five widths, text contrast in light and dark themes, keyboard operation, and
  a facility name containing HTML on both map pages (it must be shown as text and never run).
- **prototype-regression**: the prototype against `backup/PeakPower.original.html` at four widths through all three steps,
  comparing DOM, layout, computed styles, scroll size and screenshots.

`tests/e2e/lib.mjs` is the shared harness (static server, browser launcher, request mocks).
