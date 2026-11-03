# GRIDTECH contestant packet v6.0.1 (V2)

> **V2 changes:** 4-hour battery CAPEX 1,744 → 1,220 USD/kW (−30%), battery maximum 12 → 53 MW (the most the 8-acre site allows), and grid charging allowed (behind the meter, no export). **v6.0.1:** wind contract price 35 → 45 USD/MWh. All other resource prices are unchanged. See `examples/MODEL_RULES.md` §4, §6 and §8.

Start here. For a one-page summary of what is required vs. optional, which file to use for what, and a glossary, see `BUILD_CHECKLIST.md`.

Build your own energy-portfolio recommendation algorithm and a usable interface for the customer in `Problem_Statement.md` (the text companion to the unchanged released PDF). Your product must address speed to power, cost and environmental performance, and demonstrate how a changed customer priority affects its recommendation.

## 1. Set up your coding environment
Extract this folder and open your terminal here. For Claude Code, launch your installed `claude` command from this directory; `CLAUDE.md` provides navigation and common-rule reminders. Event staff provide authentication and tokens. No data-source account or live API is required.

Use Python 3.10 or newer for the supplied utilities. If NumPy and pandas are already installed at the required versions, no installation is needed. Otherwise:

macOS/Linux:
```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r starter/requirements.txt
```
Windows PowerShell:
```powershell
py -3 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r starter/requirements.txt
```
If activation is restricted, use the virtual environment's Python executable directly. Package installation requires access to a configured package source unless dependencies are preinstalled. The data itself works offline. The packet does not install a solver or interface framework; any language or framework is welcome.

## 2. Read the rules and main inputs
Read `examples/MODEL_RULES.md` for the common physical and cost conventions, then inspect the main files below. `data/data_dictionary.csv` explains each column, JSON setting and submitted field, with units and provenance. You do not need to load all documentation into AI context at once.

| File | What it is and how to use it |
| --- | --- |
| `data/timeline_default.csv` | Main ready-to-use hourly input: 87,600 chronological intervals with default commissioning demand, tiers, grid limits, stress events, prices and renewable profiles. Start here. |
| `data/resource_options.csv` | The authoritative seven energy-resource offers: capacity blocks/maxima, availability dates, costs, heat rates, emissions, battery parameters and land footprints. |
| `data/reference_hourly.csv` | The 8,760-hour mature reference year used to expand the timeline and evaluate alternative initial-service dates. It is not a second campus case. |
| `data/commissioning_ramp.csv` | The prescribed relative-month demand fractions: one-third at initial service, rising to full demand over ten model months (relative months 0–10). |
| `data/grid_connection_schedule.csv` | Mandatory base grid upgrades: 0 MW initially, 25 MW from month 18, 50 MW from month 24 and 75 MW from month 30. |
| `data/case.json` | Common site, timing, horizon, land and accounting settings. |
| `data/price_trajectory.json` | Smooth real-terms paths applied to merchant wholesale price (+5%/yr), Henry Hub gas (+3%/yr) and grid CO2 (−3%/yr) over the 120-month horizon, with rationale and sources. Already included in `timeline_default.csv`. |
| `data/response_parameters.json` | Shared Tier 1/Tier 2 response, remote-capacity, energy, cost and emissions assumptions. |
| `data/stress_events.csv` | Seven reference-year event windows, notice and campus import restrictions; their pattern repeats with the reference year. Events are already flagged hour by hour in both hourly files. |
| `data/data_dictionary.csv` | Human-readable field definitions and units. Filter by filename or field when you need an explanation. |
| `data/source_register.csv` | Public sources and their limitations. Prepared core inputs are already supplied. |
| `data/assumptions_register.csv` | Fictional benchmark choices and rationale, distinguishing assumptions from measured observations. |

The default customer starts at month 20 with 25 MW equivalent peak demand and reaches the mature 75 MW peak/69 MW mean profile at month 30. The horizon ends at month 120. A model month is 730 hours; the historical reference year repeats ten times. These are transparent screening assumptions, not a future calendar or price forecast. Demand already includes cooling.

The first two files let you begin modeling immediately. The reference year and ramp support alternative start dates. For alternative initial-service months, reconstruct chronological inputs from `reference_hourly.csv`, `commissioning_ramp.csv` and the documented clock, profile and grid rules in `MODEL_RULES.md`. You may do this yourself, or import the checker's `prepare_inputs()` function, which builds the same 87,600-hour table for any opening month and grid delay (it builds inputs only; it does not dispatch or choose a portfolio, and it applies the price and grid-CO2 trajectory in `data/price_trajectory.json`, which a hand-built table must also apply):
```python
import sys; sys.path.insert(0, 'starter')
from check_submission import prepare_inputs
ctx = prepare_inputs({'initial_service_month': 14, 'grid_delay_months': 0, 'capacities_mw': {}})
timeline = ctx['frame']  # same columns as data/timeline_default.csv
```
For `initial_service_month: 20` and zero delay, `ctx['frame']` matches `timeline_default.csv` exactly.

## 3. Understand the energy-resource choices
Choose any feasible subset; no energy resource is mandatory. Solar and wind contracts and future nuclear supply deliver through the grid. Gas turbines, gas engines, natural-gas fuel cells and batteries are onsite. The battery stores electricity rather than generating new energy. Merchant electricity is available within the same import limit as offsite contracts.

| Energy resource | Capacity increment | Maximum offer | Available month |
| --- | --- | --- | --- |
| Utility solar contract | 5 MW | 150 MW | 24 |
| Wind contract | 5 MW | 200 MW | 12 |
| Four-hour battery | 1 MW | 53 MW / 212 MWh (fills the 8-acre site alone) | 14 |
| Gas turbine | 25 MW | 100 MW (75 MW fits within the 8-acre land limit) | 18 |
| Gas engine | 5 MW | 60 MW | 16 |
| Natural-gas fuel cell | 5 MW | 30 MW | 14 |
| Future nuclear physical PPA | 5 MW | 25 MW | 60 |

The three gas options have different efficiencies, costs, increments and dates, and all emit CO2. The fuel cell is not zero-carbon hydrogen. Nuclear is a delayed offsite physical supply offer; it neither expands the connection nor provides onsite backup. Eight usable acres are reserved for selected onsite equipment under the supplied footprint assumptions.

## 4. Build your product
Create `team_app/` for team code and `outputs/` for generated results, or equivalent team-owned folders. Keep the supplied input files, rules and checking utilities unchanged. Choose your own search, dispatch and preference logic. Transparent heuristics and limited searches are acceptable if their limitations are clear.

Performance tip: the horizon is 87,600 hours. Hour-by-hour calculations vectorized over the timeline (for example with NumPy) run in well under a second per portfolio, while a single optimization model covering every hour at once can be very slow to build and solve. Test your approach on a small sample before scaling up.

Inspect file headers, small samples and computed summaries. Do not paste or print the full timeline into AI context. A useful first request to Claude Code is:
> Read CLAUDE.md, README.md, examples/MODEL_RULES.md and SUBMISSION_FORMAT.md. Inspect input headers and a small sample. Summarize the required inputs and outputs, then help us plan our implementation without changing the benchmark inputs or prescribing our method.

The required comparison uses the supplied base inputs and `grid_delay_months=0`. Exploring other nonnegative integer grid delays is optional. Detailed startup/ramp/outage constraints, optimized staged investment, remote-network scheduling and further uncertainty models are optional extensions requiring disclosed additional assumptions. You do not need to build these to complete the core task.

MW measures power; one hour at 1 MW is 1 MWh. Battery state of charge is internal stored MWh at the end of the hour. All offsite delivery and merchant purchases share the grid cap; battery energy must be conserved; protected demand must remain served locally. See MODEL_RULES.md for the complete rules.

## 5. Export and submit
Read `SUBMISSION_FORMAT.md`; the files in `examples/` show structure only. After generating your own results:
```sh
python starter/check_submission.py outputs/portfolio.json outputs/dispatch.csv > outputs/check_results.json
```
If a check fails, `check_results.json` will be empty and the reason (`SUBMISSION CHECK FAILED: ...`) is printed in the terminal. If the message says data files differ from the released packet, re-extract the original zip; the supplied inputs must stay unchanged.

`check_submission.py` validates the finished JSON/CSV submission and, only after passing physical checks, prints annual and horizon **common benchmark accounting** (not competition rankings). Read `outputs/check_results.json` or summarize the results in your own product. No optimizer, dispatch generator or report generator is included; the checker internally reconstructs inputs and costs to verify submissions, and its `prepare_inputs()` function may be imported to build inputs (see section 2). Its readable source necessarily exposes some calculation logic and may be inspected, but it is not a solution template. `starter/requirements.txt` lists its dependencies.

Submit the runnable product/code, method README, readable summary and JSON/CSV results by the deadline in the released prompt. Show a recommendation and a change in customer priority; no separate alternative-portfolio submission is required. Local execution is acceptable.

## Sources and limitations
Electricity prices are an ERCOT LZ_SOUTH regional proxy plus an assumed service adder, not a verified campus node. Gas prices use historical monthly Henry Hub plus an assumed delivered adder. Renewable profiles are derived from regional historical generation and capacity, not a single-plant forecast. Grid CO2 is an annual-average factor, not hourly or marginal emissions. The 2023 hourly shapes repeat each model year, but merchant wholesale prices, Henry Hub gas and grid CO2 follow a smooth real-terms trajectory (`data/price_trajectory.json`; constant 2023 USD): screening scenarios informed by EIA and ERCOT outlooks, not forecasts.

Campus demand and tiers, commercial offers, dates, footprint allowances, stress restrictions and service consequences are fictional exercise assumptions. Supporting historical workbooks and reconstruction materials are not required for the build; source references and the prepared values are provided here. Resource parameter notes and the assumption/source registers explain their provenance. A placeholder zero in an inapplicable catalog field is not an extra physical constraint; interpret it using the resource kind and field definitions.

The common model is a screening exercise; it does not certify real-world uptime or project economics.
