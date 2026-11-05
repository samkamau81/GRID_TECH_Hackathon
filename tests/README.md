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
    node tests/e2e/prototype-portfolio.e2e.mjs      # about 2 minutes: the portfolio is simulated in the browser

Node 22 or newer and Chrome or Edge (set `CHROME_PATH` if it is not found). The suites serve `peak-power/` on a free local
port themselves. Open-Meteo is mocked, so these tests use none of the free allowance; map tiles need internet access.

- **climate-explorer**: exactly three tabs on every page and no Investment Intelligence text; the explorer loads; summary counts equal the
  geojson; US view and Texas filter counts; no weather request on load; a data center popup shows weather with correct units, one request
  per selection; map click and place search show weather; an API failure keeps facility information and shows a weather-unavailable
  message; no horizontal scroll and visible tabs at 390 px.
- **prototype-portfolio**: the migrated Prototype: three-tab navigation; four project cards with all nine dimensions; the timeline; switching projects;
  Find a site (254 Texas counties, 3,142 US counties, unique five-digit FIPS codes, layer recolouring, county detail, "Not graded" for energy outside
  Texas, the source list); What changed and what to watch (first visit, stored snapshot, return visit); the four steps open on the V2 data (53 MW
  battery limit, $45 wind); no JS errors at 1400 and 390 px.
- **Archived** (`tests/archive/`): `prototype-v2.e2e.mjs` and `prototype-regression.e2e.mjs` test the previous prototype and are no longer expected to pass.

## Scripts that check the data

    python scripts/verify_plan_library.py --all     # replay every library plan through the official checker (about 25 minutes)
