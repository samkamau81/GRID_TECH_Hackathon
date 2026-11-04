# PeakPower Approach Report

## Executive summary

PeakPower is an interactive screening tool for planning power supply for a fictional data-center campus in Williamson County, Texas. Its frontend, in `peak-power/` (introduction page `peak-power/index.html`, prototype `peak-power/prototype.html`), contains the interface, benchmark reference data, a library of candidate plans, and the browser-side hourly simulation. The app follows a three-step workflow: decide when and how to open, review a proposed plant, then inspect and operate the selected plan through live forecasts and event scenarios.

PeakPower makes cost, carbon, service timing, grid limits, and operational response visible together. It is a scenario tool built from benchmark assumptions; it is not a real project quote or a guarantee of uptime.

## Product aspects

1. **Opening and service plan.** Set the campus opening month, full-campus deadline, grid connection timing, wind and solar contract timing, demand growth, weather case, and grid-stress case. PeakPower shows the phased grid import schedule and campus load milestones.
2. **Portfolio and plant design.** Review combinations of grid-delivered wind, solar and nuclear supply with onsite gas turbines, gas engines, fuel cells and a four-hour battery. Supply contracts and merchant imports share the grid connection limit; onsite resources follow their availability, capacity and footprint constraints.
3. **Cost, carbon and business case.** Compare decision cost, cost per MWh, emissions intensity, clean-energy share, contract payments, fuel and equipment costs, and optional tenant revenue or operating margins. Carbon caps and service deadlines can narrow the candidate plans.
4. **Dispatch and flexibility.** Replay hourly demand against available grid imports and generation. The model accounts for battery charging and discharge, movable Tier 1 work, pausable Tier 2 work, and protected Tier 0 load. The UI distinguishes work relocation from interruption and shows the consequences of operator actions.
5. **Live operations.** Inspect site flows, equipment status, alerts, and a 72-hour forecast. Simulate grid or equipment events, weather and demand changes, or backup-generator use to see how the plan responds.
6. **Review and explanation.** The three screens present the opening decision, board-level plant results, and live operation. Charts and summaries expose assumptions, service dates, costs, carbon, stress response, and limitations.

## Implemented approach

PeakPower embeds the benchmark reference-year time series and resource catalog in its data scripts (`peak-power/js/data/`). It also includes **384 pre-simulated candidate plans**, regenerated for the symposium packet (v6.0.1, "V2") and replayed through the packet's official checker: all 384 pass. For a selected scenario, its browser-side engine reconstructs the full 87,600-hour horizon and re-dispatches the chosen capacities using transparent operating rules. The page then summarizes energy flows, costs, emissions, service outcomes, and alerts for the selected plan and its alternatives.

The benchmark horizon is 120 model months. It uses the packet’s fictional Texas campus profile, hourly load tiers, wind and solar shapes, electricity and gas prices, resource availability, grid limits, and recurring stress events. Mature load is 75 MW peak and 69 MW average. The reference grid schedule increases import capacity from 0 to 25, 50 and 75 MW at months 18, 24 and 30. Prices are screening assumptions in constant 2023 dollars; the model does not discount costs. The packet inputs are regional proxies and repeated reference-year shapes, not site forecasts.

Dispatch follows rule-based hourly logic rather than a global optimization solver. Wind, solar, and nuclear supply use the shared grid connection; merchant power fills eligible remaining imports. Onsite equipment and storage support the balance. Under the symposium (V2) rules the 4-hour battery may charge from any source (merchant grid, offsite contracts or onsite gas), behind the meter only; discharge earns clean credit in proportion to the clean share of that year's charging, so grid-charged energy earns none. During stress periods, the selected flexibility policy determines whether movable work can relocate and batch work can pause, while protected load remains served locally. The packet accounting includes capacity, contract, fuel, merchant-power, relocation, and interruption costs, plus local and remote emissions. Contract costs apply to available generation even when energy is curtailed. The packet does not allow power sales back to the grid.

The page also labels optional extensions separately from the packet benchmark: tenant-revenue models, annual demand growth, alternate weather years, contract delays, forecast events, and a rented generator priced at $350/MWh with an assumed 0.74 t CO₂/MWh. These extensions are scenario assumptions, not observations from the benchmark.

## Workflow flowchart

```mermaid
flowchart TD
    A[Set opening, deadline, grid and scenario inputs] --> B[Load embedded hourly benchmark data and resource catalog]
    B --> C[Load 384 checker-passed starting plans (V2)]
    C --> D[Filter and rank plans against the selected targets]
    D --> E[Rebuild the 120-month, 87,600-hour scenario]
    E --> F[Dispatch grid supply, contracts, onsite resources and battery]
    F --> G[Apply stress policy: serve, relocate or pause eligible load]
    G --> H[Calculate service, cost, carbon, clean share and revenue]
    H --> I[Review plans, alerts, trade-offs and select a plant]
    I --> J[Inspect live flows and the 72-hour forecast]
    J --> K{Simulate an operating event?}
    K -- Yes --> L[Apply grid, equipment, weather or load event]
    L --> E
    K -- No --> M[Review the operating result]
```

## Software structure and run instructions

- **Canonical frontend:** `peak-power/` (see `peak-power/README.md`; the original single file is kept in `backup/PeakPower.original.html`). The Python server returns the introduction page `peak-power/index.html` at `/` and `/index.html`, the prototype at `/prototype.html`, and serves its `/css/*` and `/js/*` files.
- **Data Center Explorer:** `peak-power/data-centers.html`, an interactive world and United States map of data centers built from `data/data_centers.zip` (an OpenStreetMap-derived extract). `scripts/process_data_centers.py` validates it and writes `peak-power/data/processed/data-centers.geojson`; see `peak-power/README.md` for how to refresh it. The page has no power-capacity data because the dataset has none.
- **Python backend:** `data/Symposium_Packet/team_app/server.py` exposes health, recommendation, policy-comparison, and grid-delay endpoints. `engine.py` provides the benchmark recommendation logic and command-line entry point. This service is available separately; the current HTML runs its embedded browser engine and does not call the Python API.
- **Python API model:** the separate Python engine evaluates a documented 14-portfolio candidate set against the supplied checker. Its recommendation endpoint can use the validated default output files. It searches 14 base portfolios x 4 battery sizes (0, 15, 30, 53 MW) with a greedy daily battery-arbitrage heuristic, not an optimizer. This is a distinct implementation from the HTML’s 384-plan library and should not be presented as if it powers the browser page.

Run from the repository root with Python 3.10 or newer:

```powershell
python -m pip install -r data/Symposium_Packet/starter/requirements.txt
python data/Symposium_Packet/team_app/server.py
```

The local server binds to `127.0.0.1:8000` by default. The browser page is self-contained; the server is used to serve the canonical file and make the separate Python API available.

## Symposium packet (V2)

The app runs on `data/Symposium_Packet` (files labelled v6.0.1 "V2"; the folder it came from was named packet_v6.6.1, so confirm the version label with the organizers). The previous packet is kept in `data/Contestant_Packet` for comparison. Differences that matter: battery grid charging allowed, battery maximum 53 MW (was 12), battery CAPEX $1,220/kW (was $1,744), wind contract $45/MWh (was $35), and a new optional `battery_4h_clean_charge_mw` dispatch column.

- **Browser catalog and hourly data:** `python scripts/build_reference_data.py` regenerates them from the packet files (nothing typed by hand).
- **Browser plan library:** `node scripts/build_plan_library.mjs` rebuilds the 384 plans (about 11 minutes on 4 cores); `python scripts/verify_plan_library.py --all` replays them through the official checker.
- **Python outputs:** `python data/Symposium_Packet/team_app/run.py --compare-policies` rewrites `data/Symposium_Packet/outputs/`.
- **What the V2 results show:** in the limited search the lowest-cost strict-policy portfolio is still battery-free (about $283M; the old packet's best was $259M, mostly because wind rose from $35 to $45/MWh), because the battery's capital cost exceeds the savings from shifting power. The lowest-carbon portfolio uses a 30 MW battery charged from surplus clean energy (about 61 kg CO2/MWh).

## Limitations

- The site, commercial offers, and operating scenarios are fictional benchmark assumptions for Texas.
- The benchmark uses regional proxy data and repeats reference-year shapes across the horizon; results are not forecasts.
- The HTML plan library is finite (battery plans use 30 MW), and dispatch is rule-based, including the battery (price thresholds in the browser, greedy daily arbitrage in Python); a true optimizer could find more value in storage. Results are screening comparisons, not proof of a globally optimal portfolio.
- Equipment outages, startups, gas delivery and other real-world operating constraints are simplified or represented only in optional scenarios.
- The frontend and Python API currently run separate calculation paths. The frontend's calculation code is preserved unchanged; its browser-side results do not come from the Python endpoints.
