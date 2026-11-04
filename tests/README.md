# Tests

## Unit tests (no network, no browser)

    node --test tests/unit/*.test.js
    python -m unittest tests/unit/test_python_engine.py

Node 20 or newer.

| File | Covers |
|---|---|
| `engine-v2.test.js` | the browser engine on the V2 battery rules: catalogue values, hourly balance and import cap, SOC continuity and bounds, power and cycle limits, grid charging, the clean-credit identity, and no change for plans without a battery |
| `test_python_engine.py` | the Python backend against the packet's own checker: V2 packet detected, battery dispatch accepted, grid charging earns no clean credit, clean charge never exceeds total charge, zero battery columns, land limit enforced |
| `climate-weather.test.js` | request parameters and units, response mapping, missing values stay null, weather codes, 10-minute cache and expiry, de-duplication, invalid coordinates, HTTP/429/network/format errors, the client-side throttle, place search |

## Browser tests (headless Chrome or Edge)

    node tests/e2e/climate-explorer.e2e.mjs
    node tests/e2e/prototype-v2.e2e.mjs

Node 22 or newer and Chrome or Edge (set `CHROME_PATH` if it is not found). The suites serve `peak-power/` on a free local
port themselves. Open-Meteo is mocked, so these tests use none of the free allowance; map tiles need internet access.

- **climate-explorer**: exactly three tabs on every page and no Investment Intelligence text; the explorer loads; summary counts equal the
  geojson; US view and Texas filter counts; no weather request on load; a data center popup shows weather with correct units, one request
  per selection; map click and place search show weather; an API failure keeps facility information and shows a weather-unavailable
  message; no horizontal scroll and visible tabs at 390 px.
- **prototype-v2**: the prototype on the symposium packet at 1400 and 390 px: the 384-plan library and V2 catalogue are loaded, every plan fits the 8-acre site,
  steps 1 to 3 open and render, the chosen plan has a finite cost, and there are no JS errors. (`prototype-regression.e2e.mjs` compares against the original
  single-file build, which has the previous packet's numbers, so it is kept for history but is no longer expected to pass.)

## Scripts that check the data

    python scripts/verify_plan_library.py --all     # replay every library plan through the official checker (about 25 minutes)
