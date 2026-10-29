# PeakPower Integrated Build Handoff

This is the single implementation handoff for PeakPower. It combines the backend MVP brief and the product/front-end design requirements so the team can build from one shared file. The source backend brief and Product Design Doc remain unchanged in the parent `GRID_Hackathon` folder.

## Agreed implementation order

**Build and validate the backend baseline first; connect the dashboard after the backend input/output contract and real result shape are stable.** This follows the backend MVP brief and the team's selected sequence.

1. Read the contestant packet rules and agree the backend input/output contract.
2. Produce the official month-20, zero-grid-delay baseline over all 87,600 hourly intervals, and pass the unchanged packet checker.
3. Add the backend comparison and monthly/stress-event outputs described below.
4. Connect the dashboard to computed backend results. UI layout and component planning can happen earlier, but any temporary sample state must be labeled as sample data and must not be presented as a benchmark result.
5. Keep the Method & Assumptions page and written methodology synchronized with the implemented calculations.

## Source content

The full source content from both supplied files is retained below. Added integration notes above establish the agreed build order and explain how the front end should consume backend outputs; no source requirements have been intentionally removed.

---

## Backend MVP brief

# PeakPower backend MVP build brief

## Goal

Build the backend for this customer question: **Can we meet our campus opening and expansion targets with the available grid connection, and what does flexibility change?**

Return real, reproducible calculations that a basic dashboard can display. Use the existing backend and team stack where available. This brief defines the first implementation scope; the earlier longer handoff is background rather than an instruction to implement every feature now. Supply this brief together with the final contestant packet v5.5.1. No optimal portfolio results have been produced in the planning work.

## First working journey

1. Load a site profile and the customer's development assumptions.
2. Calculate a feasible resource portfolio and its full hourly operation.
3. Compare the same project with different flexibility permissions.
4. Test a grid delay against the selected portfolio, with capacities locked.
5. Return summary metrics, monthly development data, hourly event data and downloadable results.

Use the packet campus as the first validated site profile. Put site data behind a replaceable loader so other locations can be added later. Do not generate a PJM comparison by relabeling Texas inputs.

## Inputs

| Field | First version behavior |
|---|---|
| Site profile | Packet benchmark initially; identify source and assumptions |
| Initial service month | Default 20; integer 14–109 for the official commissioning ramp |
| Demand | Default packet hourly tiers; support a positive customer demand multiplier as the first adjustable forecast input |
| Ramp | Official ramp initially: one-third demand at opening, full demand ten months later |
| Flexibility | Three comparison policies: no relocation/no interruption; relocation allowed/no interruption; relocation and interruption allowed under packet rules |
| Grid delay | Nonnegative integer months; default zero; shifts positive grid milestones only |
| Cost premium | Optional customer premium for an additional lower-emissions search after minimum-cost evaluation works |
| Carbon ceiling | Optional primary combined kg CO2/MWh hard ceiling |
| Commercial inputs | Optional supplied monthly billable occupied IT MW and price per IT MW-month; return revenue as unavailable when absent |

Changing the demand multiplier creates a custom analysis. Scale all tier demand consistently and preserve the original inputs. Arbitrary custom upload and ramp shapes can follow after this adjustable scenario works. Do not let the optimizer reduce demand or change its tier classification to improve results. Extra customer duration limits can follow; they must not expand the packet's response eligibility.

## Calculation behavior

- First get one official baseline result working over all 87,600 hours. Read the packet rules, catalog and export schemas. The supplied checker prepares inputs and checks results; it does not select or dispatch a portfolio.
- Find the lowest-cost feasible candidate using the team's implemented solver or a transparent limited search. Respect the complete common physical and accounting rules. Label limited searches and solver termination honestly; do not claim proven optimality without evidence.
- Compare the three flexibility policies at identical demand, opening date and grid assumptions. Return total-cost and emissions differences, resource-capacity changes and relocation/interruption quantities. If a policy has no feasible result, report the established status rather than inventing a saving.
- For speed comparisons, evaluate a declared list of requested initial-service months. Rebuild the timeline for each. Derive official full demand as initial service plus ten months. Do not claim an earliest feasible date unless the search establishes it.
- For a grid-delay stress test, keep selected capacities fixed and recalculate operation. A redesign with new capacities is a separate action. Do not introduce hidden unmet load into a valid result.
- Once the cost workflow works, optionally find a lower-emissions candidate within the chosen premium using the same demand and service requirements. Distinct runs may produce the same portfolio; deduplicate results.
- Use hourly calculations for adequacy and storage. Monthly data is a display aggregation, not a replacement for the hourly model.

## What the backend returns

Expose one callable comparison function first. Wrap it in the team's API once its output is stable; do not change frameworks just for this brief.

| Result group | Required contents |
|---|---|
| Run metadata | Run ID, complete inputs, site/source ID, official/custom label, method, runtime, status, solver gap if available and validation status |
| Candidate plans | Policy, capacities by catalog resource ID, opening/full-demand months, land use and budget/ceiling settings |
| Horizon and annual metrics | Common cost breakdown, requested/local served/remote MWh, relocated/interrupted MWh, local/remote/combined CO2, primary kg CO2/MWh and clean share |
| Comparisons | Cost and emissions differences versus a named comparable baseline; capacity and service differences |
| Monthly series | Requested demand peak and energy, ordinary/effective grid limits, resource availability, generation by source, battery use, service response, costs and emissions |
| Stress-event series | Model hour, event ID, notice, demand, grid limit, imports by source, onsite output, battery charge/discharge/SOC, relocation and interruption |
| Failure information | Clear distinction between invalid inputs, no feasible incumbent, proven infeasibility and execution failure; diagnostic hours/constraints where established |
| Exports | Official portfolio.json, dispatch.csv, checker results and readable result summary; custom analyses separately labeled |

Keep full hourly dispatch separate from the small comparison response so the frontend can request or read only a selected event window. Store a configuration fingerprint and avoid rerunning identical completed jobs. An initial file-based result interface is acceptable for the MVP.

## Cost and revenue labels

Keep the common accounting breakdown: annualized fixed equipment charges, available-generation contract payments, gas operating cost, merchant electricity cost, relocation cost and interruption consequence. Their common total is benchmark decision cost, not cash-flow NPV.

Show local energy cost per local served MWh and total decision cost per requested MWh with explicit denominators. If showing upfront equipment CAPEX, label it a catalog equipment-cost estimate, not a complete installed project budget. Do not add it to annualized equipment charges. Unknown connection and installation costs are unavailable, not zero.

Market value categories are energy-purchase savings, peak-tariff savings, demand-response/capacity payments and ancillary-service payments. Only quantify a category when its prices, rules, eligibility and feasible commitments are implemented. Keep savings separate from payments and avoid double counting constrained battery capacity. The packet has no exports, no merchant/gas battery charging and no ancillary/DR payment dataset; market payments and tariff savings therefore remain **not estimated** in the first version. Cost differences from valid packet dispatch can be calculated.

If commercial inputs are supplied, monthly revenue is supplied billable occupied IT MW times price per IT MW-month. Do not infer billable IT MW from facility power demand. Show gross customer revenue and energy expenditure separately; do not call their difference project profit or ROI without the remaining development and operating costs. If revenue is missing, report incremental energy costs for earlier service and the additional earnings required to cover that increment.

## Interconnection boundary

Calculate whether a plan works within supplied grid access and whether it can operate before full grid capacity arrives. Do not predict a utility approval date or automatically move grid milestones earlier because BESS or flexibility is selected. The official no-import period can test onsite hourly adequacy, but it does not certify an islandable electrical design. The packet battery starts empty and needs actual clean imports to charge, so it cannot provide initial off-grid energy. Private microgrid offers, islanding controls, outages and fuel constraints require separately disclosed extensions.

## Definition of done

1. A reproducible default-month-20, zero-delay official result passes the unchanged checker with all 87,600 dispatch rows.
2. A second flexibility policy produces a computed comparison, or an honest explanation/status if the outcome does not change or no solution is found.
3. An alternative opening month rebuilds inputs correctly and returns its timing/cost/service results.
4. A demand-multiplier change works as a labeled custom scenario and is checked against the same physical rules using its actual demand. The official checker rebuilds baseline demand and cannot certify this route.
5. A grid-delay test holds capacities fixed and returns a valid result or honest failure status.
6. Monthly and event outputs come from the same hourly result and reconcile to its totals. Ratios with zero denominators are explicitly undefined.
7. Run instructions and one example comparison output let the frontend developer display results without understanding the optimization implementation.

## Implementation order

**First:** agree the input/output contract and produce one validated baseline. **Second:** add flexibility comparison and monthly/event series. **Third:** add opening-date comparison, adjustable demand and the locked-portfolio delay test. **Then:** connect the dashboard, add a cleaner-budget option, and expand site/market data as available.

Start with the smallest complete path and keep placeholders visibly unavailable. A plain interface backed by these calculations is sufficient for the first demo.

---

## Product design and front-end requirements

Back End Design

Front - End Design aspect

Build the front end for a hackathon demo app called “PeakPower.” It helps a data-center developer compare energy portfolios for a fictional campus in Williamson County, Texas.

The app should feel like a clear, credible energy-planning dashboard: clean, modern and easy for a nontechnical judge to understand in a five-minute demo. Prioritize decision clarity over decorative visuals. Use responsive layouts and accessible colors, labels, and controls.

CORE WORKFLOW

1. Let the user enter hard requirements separately from preferences:

   - Required initial-service month (optional)

   - Priority sliders or weights for speed to power, cost, and environmental performance

   - Optional emissions or interruption constraints

   Make it visually clear that a hard requirement must be met, while a preference influences ranking and trade-offs.

2. Show the recommended portfolio:

   - Initial-service month and full-demand month

   - Selected resource types and capacities

   - A concise explanation of why this portfolio was selected

   - Clear status for requirements met, constraints, and any unmet requirements

3. Explain outcomes with readable cards and charts:

   - Total decision cost, local energy cost, relocation cost, and interruption consequence

   - Cost per MWh

   - CO₂ emissions, combined emissions intensity, and clean-energy share

   - Relocated and interrupted energy

   - Portfolio capacity versus campus demand over time

   - Grid import limit and supply during stress events

   Use consistent units and short explanations or tooltips. Distinguish local supply, remote supply, and interrupted demand.

4. Include an “Alternative portfolio” comparison. Make the trade-offs explicit—for example, what the alternative gains or gives up in opening speed, cost, emissions, or reliability. Do not imply that one option is universally best.

5. Include a prominent interactive priority control. Changing a priority should update the recommendation and results, or clearly explain why the recommendation did not change. This interaction is essential to the live demo.

6. Add a stress-event view showing at least one event: demand, reduced grid-import limit, local generation/storage, relocation, interruption, and remaining margin.

DESIGN DIRECTION

- Use a restrained palette inspired by energy and infrastructure: dark navy or charcoal for structure, warm white backgrounds, and teal/green accents for clean energy. Use amber/red only for warnings or constraint issues.

- Use strong visual hierarchy, concise labels, and generous spacing.

- Prefer interactive charts and comparison tables over dense paragraphs.

- Make the main recommendation visible immediately, with supporting detail below.

- Include sensible empty, loading, and error states.

- Avoid fake precision, unexplained scores, excessive gradients, and unnecessary animations.

TECHNICAL BOUNDARIES

- Build the interface as a front end that can connect to a local recommendation/dispatch backend through clearly defined inputs and outputs.

- Do not invent benchmark results. Use clearly labeled sample data only until connected to real computed results.

- Keep the product self-contained and able to run without API keys, accounts, or calls to external AI services. A temporary tunnel URL may be used only to expose the locally running demo.

- Keep the recommendation method, physical constraints, financial assumptions, and environmental accounting visible enough that a judge can understand and challenge them.

- Structure the code so the interface can be run locally and later exposed through a tunnel such as ngrok. Do not put secrets in front-end code or commit them.

Before coding, briefly propose the page structure and components. Then implement the working interface with realistic sample states and explain how to connect it to the recommendation engine.

METHOD & ASSUMPTIONS PAGE

Create a dedicated page called “Method & Assumptions” that documents the recommendation and dispatch logic in plain language. It should match the written method document and help judges understand, inspect, and challenge the approach.

Organize the page into these sections:

1. Decision process

   - Show how hard requirements are applied before preferences.

   - Explain how speed, cost, and environmental preferences influence the ranking of feasible portfolios.

   - State what happens when requirements conflict or no feasible portfolio is found.

   - Make clear whether the method uses rules, weighted scoring, limited search, or optimization. Do not claim global optimality unless it is proven.

2. Portfolio selection

   - Explain how the app selects resource types and capacities.

   - Show the relevant capacity increments, maximum sizes, availability dates, and the 8-acre onsite land constraint.

   - Explain how initial-service timing is considered and how the full-demand month is determined.

3. Hourly dispatch

   - Explain how demand is served hour by hour across the 87,600-hour evaluation horizon.

   - Describe how grid import limits, staged grid upgrades, resource availability, and stress-event limits are handled.

   - Explain Tier 0 protected demand, Tier 1 relocation, Tier 2 interruption, and the rules that constrain each.

   - Describe battery charging, discharging, state of charge, and energy conservation if batteries are selected.

4. Cost accounting

   - Explain which costs are included: equipment capital and fixed costs, fuel, contracts, merchant electricity, relocation, and interruption.

   - Keep common benchmark costs separate from any customer-specific willingness-to-pay or delay valuation.

   - Identify whether contract payments apply to available generation even when some energy is curtailed.

5. Environmental accounting

   - Explain how local and remote emissions are counted, how clean-energy share is calculated, and how relocation is treated.

   - Make clear that interrupted demand is not equivalent to clean energy or served demand.

6. Inputs, assumptions, and limitations

   - List the benchmark files and inputs used, with units where helpful.

   - Distinguish supplied benchmark data from team assumptions and customer preferences.

   - Summarize simplifications and limitations, including that results are screening estimates rather than certified uptime or real-world project economics.

7. Reproducibility

   - Provide a concise description of how to run the app and regenerate the recommendation and exports.

   - Link to or summarize the method document included with the submission.

   - Show the method/version used for the currently displayed results.

Use plain language, compact diagrams or numbered steps, and expandable details for equations or technical rules. Include a visible “How this recommendation was produced” link from the results page to this page. Keep the page synchronized with the actual code and the team’s written method document; never describe logic the implementation does not use.
