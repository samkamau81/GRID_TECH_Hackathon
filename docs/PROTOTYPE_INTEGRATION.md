# Prototype migration: what changed, what was preserved

The Prototype tab is now the supplied Claude Artifact (`peak-power/Peak Power (Copy).html`, kept unchanged as the reference), split into the
project's file layout. It runs on the symposium packet (V2) data and engine. Approved choices: split into files, use V2 data, merge the
artifact's three engine extensions into the V2 engine, archive (not delete) the previous prototype.

## Files

| Action | File |
|---|---|
| Created | `css/prototype.css`, `js/prototype.js`, `js/data/site-counties.js` (split from the artifact by `scripts/split_prototype_artifact.py`) |
| Replaced | `prototype.html` (the artifact's markup, plus the three-tab site navigation and a footer naming the symposium packet) |
| Modified | `js/engine.js` (artifact's extensions merged into the V2 engine); `index.html` (one attribute: photo path fixed, see below); READMEs |
| Archived (moved, history kept) | previous prototype: `archive/prototype-v1/prototype.html`, `archive/prototype-v1/js/app/*.js` (15 files), `archive/prototype-v1/css/*.css` (7 files); old tests in `tests/archive/` |
| Unchanged | `Peak Power (Copy).html`, the Explorer, `js/data/reference-data.js`, `js/data/scenarios.js`, all source datasets |
| Added tests / docs | `tests/e2e/prototype-portfolio.e2e.mjs`; this file; `docs/DATA_GAPS.md` |

`index.html`: its Samwel photo path had been changed to `Claude Code Setup/peak-power/assets/images/samwel.jpg`, which is outside the served folder and caused the 404 reported earlier. It is back to `assets/images/samwel.jpg`. Nothing else on the Introduction page changed.

## Changes to the artifact's script (all in `scripts/split_prototype_artifact.py`, each must match exactly once)

1. Data now comes from `window.PEAKPOWER_REFERENCE`, `window.PEAKPOWER_SCENARIOS`, `window.PEAKPOWER_SITE_MAP` instead of embedded JSON blocks (3 lines).
2. Battery limit read from the catalogue (`max_mw`, 53 MW) in three places: layout planner, energy timeline, equipment-offer text. The artifact hard-coded 12 MW (the previous packet).
3. Footer states the symposium packet (V2) and that the battery never exports.

## Engine

The artifact's engine was the previous repository engine plus three additions. They are now in the V2 engine (`js/engine.js`): a work-flexibility scale (`sc.flex`), keep-on-campus and policy windows (`ctl.keep`, `ctl.pol`), and an "always pause" policy. Verified: results for plans using none of them are identical to the checkpointed engine (difference $0), and each extension changes results as intended. V2 battery rules (grid charging, clean-credit proportion) are retained.

## Feature-preservation checklist (supplied artifact vs migrated page)

| Feature in the artifact | Present | Checked by |
|---|---|---|
| Project selector and four projects (Williamson, Ellis, Milam, Nolan counties) | Yes | `prototype-portfolio.e2e.mjs` |
| Four steps: Portfolio, Project plan, Run the plant, Live Operations | Yes | same |
| Project cards with the nine dimensions: Location, Energy, Policy, Fiber, Land, Grid reliability, Water, Hazard, Time to power | Yes | same |
| "When each could open" timeline (Gantt) | Yes | same |
| Find a site: Texas and US county map (254 / 3,142 counties), county click and detail, eight map layers (Overall, Location, Energy, Policy, Fiber, Water, Hazard, Time to power) | Yes | same |
| Collapsible "Where these grades come from" source list and source links | Yes | same |
| "What changed and what to watch": Texas permit pause with "if the pause lifts" effect; since-last-visit comparison using the browser's `localStorage` (`pp_snap_v1`) | Yes | same (first visit, then return visit) |
| Project plan: finance (revenue models, opening-month ranking), energy (power sources timeline, gas and equipment, layout planner, limits and conditions) | Yes | opened and rendered; layout planner interactions not automated |
| Run the plant (board review) and Live Operations | Yes | opened and rendered |
| One-page project export and reset button | Yes (code unchanged) | not exercised by tests |
| Old prototype features missing from the artifact | None found: every function in the previous `js/app` files also exists in the artifact | function-name comparison |

The nine comparison dimensions are exactly the nine rows built by `projDims()` in the artifact. The brief's list of eight names merged Energy and Policy; the ninth is Energy availability as its own row. No dimension was added.

## Data classes used in the Prototype

| Class | Examples |
|---|---|
| Measured / published data | ERCOT 2023 hourly reference year (price, wind, solar, load); FEMA hazard index; WRI Aqueduct water stress; CAIDA facility locations; LBNL queue waits; US Census boundaries |
| Packet assumptions (CASE, fictional) | Resource offers and prices, response parameters, grid schedule, stress events, battery V2 rules, 75 MW campus |
| Team assumptions | Tenant revenue models and rates, grading thresholds, the Texas energy screen, gas and permit timelines, layout planner footprints |
| User-adjustable scenario inputs | Project settings, delay, carbon cap, weather year, demand growth, grid stress, acres |

## Packet mapping and conflicts

| Packet item (v6.0.1, V2) | Where it appears | Note |
|---|---|---|
| `reference_hourly.csv`, `resource_options.csv`, `case.json`, response parameters, ramp, grid schedule | `js/data/reference-data.js` (built by `scripts/build_reference_data.py`), `js/engine.js` | The artifact embedded the previous packet (v5.5.1); replaced with V2 as approved |
| Battery V2 rules and limits | Engine, catalogue, energy timeline, layout planner | The artifact's embedded battery (12 MW, $1,744/kW, clean-only charging) is superseded |
| Plan library | `js/data/scenarios.js` | 384 plans, each replayed through the official checker; battery plans use 30 MW |
| Packet land per MW | `LAND` constants in the artifact script | Match the catalogue; still a copy in code (see the parameter audit) |

Known behaviour inherited from the artifact: clicking a step tab does nothing until the project plan has been computed (a few seconds after opening a project).
