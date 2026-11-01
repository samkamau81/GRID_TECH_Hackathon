# Peak Power

A data-center power-plant planning and operations simulator for a 75 MW campus in Williamson County, TX, with an
introduction page and a world map of data centers. It is a static site: plain HTML, CSS and JavaScript, no build
step and no framework.

| Page | File | What it is |
| --- | --- | --- |
| Introduction | `index.html` | Welcome page. Its **Next →** button opens the prototype. |
| Prototype | `prototype.html` | The planning and operations simulator. Runs entirely in the browser. |
| Data Center Explorer | `data-centers.html` | Interactive map of data centers worldwide, with a United States view. |

All three link to each other. The original single-file prototype is kept unchanged in
[`../backup/PeakPower.original.html`](../backup/PeakPower.original.html).

## Structure

```
peak-power/
├── index.html              Introduction page (entry point)
├── prototype.html          The prototype: markup only, plus script/style links
├── data-centers.html       Global Data Center Explorer
├── css/
│   ├── tokens.css          Colours, fonts, light/dark theme variables (shared by all pages)
│   ├── main.css            Shared by the introduction and explorer: base, navigation, buttons, footer
│   ├── landing.css         Introduction page
│   ├── data-centers.css    Explorer page
│   ├── reset.css, base.css, components.css, planning.css, plant-review.css,
│   │   live-operations.css, responsive.css    The prototype (responsive.css loads last)
├── js/
│   ├── landing.js          Introduction page: scroll reveals, nav state
│   ├── data-centers.js     Explorer: data loading, filters, statistics, map layers
│   ├── engine.js           Prototype: hour-by-hour dispatch and accounting engine
│   ├── data/               Prototype data: reference year and the 384 starting plans
│   └── app/                Prototype UI, one file per section (load order is in prototype.html; main.js last)
└── data/processed/
    ├── data-centers.geojson        What the explorer loads (generated, do not edit by hand)
    └── data-centers.report.json    Quality report from the last processing run
```

The processing script lives outside the served folder, at `../scripts/process_data_centers.py`, and the source
data at `../data/data_centers.zip` (never modified).

## Run locally

The introduction and prototype also work when opened straight from disk. The explorer loads its data with
`fetch`, which browsers block for files opened from disk, so serve the folder:

    python -m http.server 8000      # from inside peak-power/

then visit http://localhost:8000 (introduction), `/prototype.html` or `/data-centers.html`.

From the repository root, `python data/Contestant_Packet/team_app/server.py` serves the same folder (and the
separate Python API). To share it publicly, serve only this folder, for example `ngrok http 8000` after the command
above.

## Data Center Explorer

**Data.** `data/data_centers.zip` holds an OpenStreetMap-derived extract: `data_centers.csv` (4,802 mapped
facilities, 32 columns), `country_summary.csv` and `reported_totals.csv` (figures from an independent tracker).
It has coordinates for every record, but no power-capacity field. Only about a third of records have a city, and
under half of the US records have a state (821 of 1,789).

**What the page shows.** Summary cards, top-five lists, and a map with Global and United States views, three layers
(clusters, individual markers, density heatmap), region, country, US state, city, facility-type and name/operator
filters, a legend, popups and a reset-view button. Everything is computed in the browser from the processed file,
and the statistics follow the filters.

**What it does not claim.**
- Counts are OpenStreetMap-mapped facilities, not a census; the page shows the tracker's higher reported total beside them.
- There is no power or capacity figure. "Mapped footprint" is building area where recorded.
- The heatmap shows the density of mapped locations, not electricity use or demand.
- 968 US records have no state in the source. Their state is derived from their own coordinates using US Census
  state boundaries, checked against the 821 records that do have one (99.9% agree), and marked "inferred" in
  popups. Cities are never inferred. Switch inference off with `--no-state-inference`.

### Refresh the map when the data changes

1. Replace `data/data_centers.zip` with the new archive (same three CSV files and columns).
2. From the repository root run:

       python scripts/process_data_centers.py

   It validates the records (invalid or missing coordinates and duplicate IDs are dropped and listed in the report),
   writes `peak-power/data/processed/data-centers.geojson` and `data-centers.report.json`, and prints a summary.
   It uses only the Python standard library; the first run downloads the US state boundaries into
   `scripts/.cache/` (needs internet), later runs reuse them. The output is identical for identical input.
3. Reload the page. Counts, lists and the notes at the bottom of the page update themselves.

## Dependencies and external services

- **Fonts:** Google Fonts (system fallbacks offline).
- **Explorer only:** Leaflet 1.9.4, Leaflet.markercluster 1.5.3 and leaflet.heat 0.2.0 from cdnjs (pinned, with
  integrity hashes), and OpenStreetMap map tiles. The page needs internet access for these and shows a message if
  the map library cannot load.
- **Prototype:** none; it makes no network requests of its own.

## Notes and limitations

- The prototype's `js/app/` files are classic scripts that share global scope and must load in the order given in
  `prototype.html`. They were moved out of the original single file, not reformatted, so their behaviour is unchanged.
- Individual map markers are drawn on a canvas and cannot be reached with the Tab key. Keyboard users can pan and
  zoom the map, and use the lists, filters and toggles, but cannot open an individual marker's popup.
- Several US cities share a name across states, and the city filter matches by name; combine it with the state
  filter when that matters.
- The creators' roles and biographies on the introduction page are placeholders; add photos by replacing the
  initials avatars (see the comment in `index.html`).
- The prototype's old entry URL (`/index.html`) now shows the introduction page; the prototype is at `/prototype.html`.
- There is no automated test suite or build tooling in the project.
