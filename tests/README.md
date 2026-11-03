# Tests

## Unit tests (no network, no browser)

    node --test tests/unit/*.test.js

Node 20 or newer.

| File | Covers |
|---|---|
| `climate-weather.test.js` | request parameters and units, response mapping, missing values stay null, weather codes, 10-minute cache and expiry, de-duplication, invalid coordinates, HTTP/429/network/format errors, the client-side throttle, place search |

## Browser tests (headless Chrome or Edge)

    node tests/e2e/climate-explorer.e2e.mjs
    node tests/e2e/prototype-regression.e2e.mjs

Node 22 or newer and Chrome or Edge (set `CHROME_PATH` if it is not found). The suites serve `peak-power/` on a free local
port themselves. Open-Meteo is mocked, so these tests use none of the free allowance; map tiles need internet access.

- **climate-explorer**: exactly three tabs on every page and no Investment Intelligence text; the explorer loads; summary counts equal the
  geojson; US view and Texas filter counts; no weather request on load; a data center popup shows weather with correct units, one request
  per selection; map click and place search show weather; an API failure keeps facility information and shows a weather-unavailable
  message; no horizontal scroll and visible tabs at 390 px.
- **prototype-regression**: the prototype against its original single-file version (`backup/PeakPower.original.html`) through a
  scripted walk of all three steps, comparing DOM, layout, styles and screenshots (`VIEWPORTS=1400x900` runs one width).
