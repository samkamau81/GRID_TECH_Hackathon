# GRIDTECH build checklist v6.0.1 (V2)

A one-page map of what you must build, what is optional, which files you need, and what the key terms mean. `Problem_Statement.md`, `examples/MODEL_RULES.md` and `SUBMISSION_FORMAT.md` remain the authoritative rules; this page only organizes them.

## 1. Required vs. optional

### Required: every team, by 5:00 p.m.

| # | Your product must... | Where it is defined |
|---|---|---|
| R1 | Let a customer express priorities for **speed to power, cost and environmental performance**, and tell preferences ("earlier is better") apart from hard requirements ("must open by month 24"). | Problem Statement p.1; Examples 1–3 |
| R2 | Select and size a portfolio from the seven catalog resources (any subset), within block sizes, maxima, availability dates and the **8-acre** onsite land limit (which caps the gas turbine at 75 MW). | MODEL_RULES §2 |
| R3 | Run an hourly operating schedule (dispatch) for **all 87,600 hours** (months 0–120) of the base case: `grid_delay_months = 0`, with the commissioning ramp and staged grid upgrades applied as they occur. | MODEL_RULES §1–3 |
| R4 | Respect the reduced grid-import limit during **stress events**, keep **Tier 0** served locally, and use Tier 1 relocation / Tier 2 interruption only inside event hours and within their limits. | MODEL_RULES §3 |
| R5 | Report initial-service and full-demand months, capacities, local energy cost, relocation cost, interruption consequence, total decision cost, $/MWh, CO2 (local, remote, combined), combined kg CO2/MWh, clean share, and relocated/interrupted MWh, for the horizon and per model year. | MODEL_RULES §5–6 |
| R6 | Demonstrate in the interface how **changing a customer priority** changes the recommendation (or explain why it does not), and show how the portfolio behaves during stress periods. | Problem Statement "Demonstrate your product" |
| R7 | Submit: runnable product/code with run instructions, short method README (inputs, logic, valuations, simplifications, AI/software disclosure), a readable results summary, and `portfolio.json` + `dispatch.csv` that pass `starter/check_submission.py`. Recommended pair at the top of your Submission Folder; alternatives/extensions in labeled subfolders.| SUBMISSION_FORMAT.md |

> **Speed to power and opening dates.** The only timing decision is `initial_service_month` (full demand is always that month + 10). To show a speed trade-off you will usually evaluate at least one opening date other than the default month 20. `timeline_default.csv` is valid **only** for month 20; for other dates, rebuild inputs from `reference_hourly.csv` or use the checker's `prepare_inputs()` (see §2).

### Optional: only after the core works

| Optional extension | Notes |
|---|---|
| Zero Tier 2 interruption as a customer requirement (Example 4) | All teams must still meet stress-event import limits. |
| Grid-connection delay sensitivity (Example 5) | Any nonnegative integer `grid_delay_months`; state the values tested. |
| Willingness-to-pay / premium thresholds (Example 6) | Label as a customer valuation, separate from common costs. |
| Staged capacity additions (Example 7) | Cannot be expressed in `portfolio.json`; submit separately alongside a checked upfront-capacity result. |
| Startup/ramping/minimum output, outages, degradation, gas-delivery limits, other uncertainty | Disclose every added assumption. |

**Not required:** a separate alternative-portfolio submission, a provably optimal answer, a chatbot, polished visual design, deployment.

## 2. Data key: which file do I need?

| If you want to... | Load | Notes |
|---|---|---|
| Start modeling the default customer (opens month 20) | `data/timeline_default.csv` | 87,600 rows, everything hourly already expanded: demand by tier, grid limits, stress flags, prices, renewable profiles. |
| Get resource sizes, dates, costs, heat rates, emissions, land | `data/resource_options.csv` | One row per resource; the `option_id` values are the keys used in `portfolio.json` and the dispatch column names. |
| Get relocation/interruption limits and prices, remote CO2 | `data/response_parameters.json` | Remote capacity 12 MW electricity; relocation $123.50/local MWh; interruption $1,000/MWh. |
| Get discount rate, land limit, horizon, clock settings | `data/case.json` | Also the default dates and accounting rules in words. |
| Model a different opening month | `data/reference_hourly.csv` + `data/commissioning_ramp.csv` + `data/grid_connection_schedule.csv` | Expand with the clock rules in MODEL_RULES §1, or import `prepare_inputs()` from `starter/check_submission.py`, which builds it for any opening month (example in README §2). |
| See when and why stress events happen | `data/stress_events.csv` | Already flagged hour by hour in both hourly files; you do not need to apply it yourself. |
| Look up a column or unit | `data/data_dictionary.csv` | Filter by `file` and `column`. |
| Check provenance (real data vs. fictional assumption) | `data/source_register.csv`, `data/assumptions_register.csv` | Documentation only; not needed in code. |
| Check your finished export | `starter/check_submission.py` | Prints JSON on success. On failure it prints `SUBMISSION CHECK FAILED: <reason>` to the terminal, and the redirected `check_results.json` will be empty. If it says data files differ from the released packet, re-extract the zip. |

How the files fit together:

```
reference_hourly.csv (8,760 h, one historical year)
   × commissioning_ramp.csv (demand fraction by months since opening)
   + grid_connection_schedule.csv (import cap by development month)
   + stress flags (from stress_events.csv)
   repeated 10× → timeline_default.csv (87,600 h, opening month 20 only)

resource_options.csv + case.json + response_parameters.json → costs, limits, emissions
your dispatch → portfolio.json + dispatch.csv → check_submission.py → common accounting JSON
```

## 3. Glossary

| Term | Meaning in this packet |
|---|---|
| model_hour | 0 to 87,599. The primary key of every hourly row you submit. |
| development month | `floor(model_hour / 730)`. Months count from hypothetical development start, not calendar months. |
| reference_hour | `model_hour mod 8,760`: which hour of the 2023 reference year is being reused. |
| initial service month | First month with demand (one-third of mature load). Integer 14–109. Default 20. |
| full-demand month | Initial service month + 10. Not a separate choice. |
| ordinary / effective grid limit | Import cap from the grid schedule / the same cap × 0.6 during stress events. |
| stress event | One of seven 3–7 hour windows (Aug–Sep) repeating every model year; import cap drops to 60%. |
| Tier 0 / Tier 1 / Tier 2 | Protected (always served locally) / relocatable to a remote site during events / interruptible during events. The three sum to total demand. |
| relocated (local-equivalent) MW | Tier 1 demand moved away. The remote site uses 1.05× this as electricity. |
| interrupted (`tier2_curtailed_mw`) | Customer demand cancelled. Not the same as curtailing surplus generation. |
| merchant (`grid_mw`) | Residual electricity bought from the grid at hourly price + $20 adder. Shares the import cap with all offsite contracts. |
| available-generation contract | Solar, wind and nuclear: you pay for all energy they *could* produce, used or curtailed. |
| commitment start | `max(initial_service_month, available_month)`: when a resource's charges and output begin; charges then continue to month 120. |
| capacity charge | Annualized CAPEX (CRF at 8%) + fixed O&M, charged per available hour. |
| total decision cost | Local energy cost + relocation cost + interruption consequence. |
| combined electricity intensity | 1000 × (local + remote CO2 t) ÷ (local served MWh + remote MWh). The metric for the "100 kg CO2/MWh" example. |
| clean share | (Clean contract dispatch − clean battery charge + battery discharge × annual clean share of charging) ÷ local served MWh. |
| SOC | Battery stored energy (MWh) at the end of each hour; starts and ends at 0 and carries across months and years. |
