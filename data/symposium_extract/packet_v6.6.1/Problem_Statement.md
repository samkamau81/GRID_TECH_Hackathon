# Design the power portfolio

> **V2 note (v6.0.0):** Battery rules changed from the released brief: grid charging is allowed (behind the meter, no export) and grid-charged energy gets no clean credit. See `examples/MODEL_RULES.md` §4 and §6. Where the PDF differs, this file and MODEL_RULES.md take precedence.
>
> **Build-day note (v5.5.1):** This is the text of the brief released before the event, otherwise unchanged. Where it says data "will be supplied" or "the packet will specify", that material is now in this folder: see `README.md` section 2 and `BUILD_CHECKLIST.md` for which file holds what.

COLUMBIA UNIVERSITY ENERGY SYMPOSIUM GRIDTECH HACKATHON

This brief explains the challenge for your advance preparation. **The complete data packet will be provided on build day.**

## Your challenge

Build a decision tool that helps a data-center developer choose an energy resource portfolio. Combine an algorithm with a functional interface that translates customer priorities into a feasible recommendation, explains the trade-offs, and responds to changing needs.

Your customer is balancing **speed to power, cost, and environmental performance**. Energy resources differ in availability dates, operation, and cost. Some generate electricity onsite; others deliver it through the grid. The campus grid connection becomes available in stages, limiting how much electricity can arrive through it at each development date. Some demand must always remain served; other demand can relocate or be interrupted during designated grid-stress periods.

Your team decides how to capture customer priorities and turn them into decisions. The fictional campus described in this brief will be the common benchmark for your product. There is no prescribed objective weighting, winning portfolio, or requirement to use every resource.

## What your product must do

**Understand the customer.** Design a way to express the relative importance of speed, cost, and environmental performance. Clearly distinguish preferences from hard requirements and explain how your product treats each. For example, "earlier opening is preferable" allows trade-offs; "we must start service by month 24" establishes a deadline.

**Recommend a feasible mix.** Select and size energy resources from the catalog, evaluate hourly operation (dispatch), and report initial-service and full-demand dates, cost, and environmental results. A ranking of individual technologies is insufficient: the combined portfolio must serve the required demand within the common constraints.

**Account for demand flexibility.** Use the hourly demand tiers and grid-stress events that will be supplied on build day to model the campus response. Protect essential demand and account for relocation and interruption consequences.

**Explain the decision.** Show your recommendation and demonstrate how changing a customer priority affects the recommendation. Explain the trade-offs behind the result.

## Build a functional minimum viable product

Build a functional minimum viable product with a clear, usable workflow. Customers should clearly understand what to enter, what the tool recommends, and why. A finished visual design, extensive branding, and production-ready infrastructure are not expected within the eight-hour build.

## A joint engineering and business challenge

Establish both whether the portfolio works and why a developer would choose it. Engineering work includes resource sizing, dispatch, feasibility, and implementation. Business-focused work includes customer questions, valuation logic, service consequences, and the decision experience. Develop these together; roles may overlap. No separate business plan, market-sizing exercise, or customer interviews are required.

A customer may care about a deadline, a cost ceiling, service continuity, or an environmental goal. Your product should turn its supported inputs into an understandable recommendation. The examples on the next page illustrate these decisions and additional capabilities your team may choose to support.

# Design around customer decisions

ILLUSTRATIVE REQUESTS ACROSS DIFFERENT PRIORITIES

**Your product must address speed to power, cost, and environmental performance** and let customer priorities influence the recommendation. Examples 1-3 illustrate these required decision dimensions; their exact questions and numerical targets are not mandatory. Examples 4-7 illustrate optional additional capabilities. All teams must respect grid-stress import limits; example 4 adds the optional customer requirement of zero Tier 2 interruption. The numbers are illustrative, not promises of feasibility. Forms, guided questions, sliders, or another clear workflow are welcome; a chatbot is not required.

**1. Speed to power.** "We want to reach full demand by month 24. What portfolio supports the commissioning ramp to that date, and how much more would it cost than reaching full demand in month 30?"

**2. Cost.** "We can reach full demand as late as month 36. Find the lowest-cost portfolio your tool can identify over the supplied evaluation period, and show its initial-service and full-demand dates, emissions, and dependence on merchant electricity."

**3. Environmental performance.** "We want average operational emissions below 100 kg CO2/MWh. What is the earliest full-demand date your tool finds that meets that limit, and what would it cost?"

**4. Continuity during grid stress.** "Meet the reduced grid-import limits during stress events without interrupting any Tier 2 demand. You may relocate Tier 1 within its limits; Tier 0 must stay served locally. What additional resources or cost does that require?"

**5. Connection uncertainty.** "If our grid connection slips six months, can we keep our month-24 opening? Compare the cost of adapting the portfolio with delaying opening to month 30."

**6. Willingness to pay.** "We would pay up to 10% more over the evaluation period to reach full demand in month 24 rather than month 30. Is there a feasible portfolio within that premium, and what environmental trade-off would we make?"

**7. Deployment alternatives.** "Would adding energy-resource capacity in stages improve on a portfolio whose capacities are selected upfront? Show the benefits, early costs, and continuing commitments."

## What an answer might look like

Your product could compare portfolios at two or three opening dates, search supported dates for a customer threshold, or show the cost or emissions improvement per month of waiting. A follow-up question could clarify which benefit justifies a premium. Explain the dates and portfolios tested; a provably optimal answer is not required.

## Carbon intensity in plain language

Carbon intensity is emissions per unit of electricity, commonly kg CO2/MWh. At 100 kg CO2/MWh, each MWh supplied is associated with 100 kg of operational CO2. Lower intensity means cleaner electricity under the common accounting rules. Total emissions also depend on the amount served. Account for relocated demand and show interruptions separately; dropping service must not create an unexplained environmental improvement.

## Data arrives on build day

You will receive hourly demand and tier profiles, a commissioning ramp, renewable availability, electricity and gas prices, energy-resource parameters, stress-event limits, and common timeline, cost, and environmental rules. The self-contained CSV/JSON packet will include a plain-language guide, column definitions and units, examples, and sources distinguishing public observations from fictional assumptions.

No paid data, live APIs, credentials, or additional data collection are needed. Historical prices and regional renewable profiles will be screening inputs, not site-specific forecasts. Offers and campus constraints are fictional, not executable quotations. Demand includes cooling; do not apply another PUE multiplier.

# Your data center customer

CAMPUS, RESOURCE OPTIONS, AND DATA

Your customer is developing a fictional campus in Williamson County, Texas. At full operation, the campus has a **75 MW peak and 69 MW mean total-facility demand**, including cooling: 604,440 MWh in a representative year. The representative year contains 8,760 hourly intervals, with demand, prices, and renewable availability matched to the same timestamps. The packet will specify how representative operating profiles are applied across the development timeline. Demand rises during commissioning; once fully operating, total facility demand is relatively steady, while protected and flexible demand vary by hour.

## Seven energy resource options plus merchant electricity

Your tool may select and size any feasible combination of **utility solar contract, wind contract, 4-hour battery, onsite gas turbine, onsite gas engine, natural-gas fuel cell, and offsite nuclear supply PPA**. Merchant electricity purchases are also available when the grid connection permits. No energy resource is mandatory.

The solar, wind, and nuclear contracts supply electricity through the grid. The gas turbine, gas engine, fuel cell, and battery are onsite. The battery stores electricity; it does not generate new energy. A power purchase agreement (PPA) is a contract to buy electricity from a generator.

| **Case feature** | **What it means** |
| --- | --- |
| Development dates | The campus can begin operating from month 14 if adequate power is available and targets full demand at month 30. A supplied commissioning schedule defines how demand grows. Months are elapsed from hypothetical development start, separate from the historical operating profiles. |
| Base grid connection | Import capacity is 0 MW before month 18, 25 MW from month 18, 50 MW from month 24, and 75 MW from month 30. The assumed schedule represents permitting, utility upgrades, and connection delays. |
| Optional connection delays | All teams must model the base schedule. Exploring delays is optional sensitivity analysis: shift connection milestones by a stated number of months. Six months is one example, not a required or exclusive delay. |
| Site and catalog limits | Onsite space is limited. The build-day data packet will specify the usable area available for energy infrastructure and the footprint of each onsite energy resource. It will also specify resource availability dates, capacity increments, maximum offered capacities, and operating limits. |
| Merchant purchases | Residual grid purchases are available at the supplied hourly price plus the stated service adder, within the same campus import limit as offsite contracts. |

## Energy resources have different roles and availability

The catalog will define each offer's costs, efficiency, size limits, and availability. Gas turbines, gas engines, and natural-gas fuel cells are distinct options. All use natural gas and emit CO2. The fuel cell is not a zero-carbon hydrogen resource in this benchmark.

The nuclear option is physical supply from a new offsite plant assumed available at month 60, five years after development starts. It shares the campus import limit. Reactor construction modeling is not required. It is one delayed clean, firm option, not a prescribed destination for the portfolio.

Delayed grid access can favor waiting or using onsite energy resources earlier, with different cost and environmental consequences. All teams receive the same fictional customer and benchmark data. Utility-service dates and illustrative delays are exercise assumptions, not estimates from an actual queue.

# Represent demand flexibility

THREE HOURLY LOAD TIERS AND A DEFINED GRID-STRESS RESPONSE

## How much demand can move or be interrupted?

Each hour's pre-response facility demand is divided into three tiers. Their MW values sum to the supplied total. The build-day profiles will specify how much demand is eligible for each action; your tool chooses the response within the stated limits. The tier shares will be fictional benchmark assumptions, not measured workload data.

| **Tier** | **Required treatment** |
| --- | --- |
| Tier 0 Protected | Must remain served locally. Cannot be relocated or interrupted. Includes the allocated essential facility demand specified in the packet. |
| Tier 1 Relocatable | May move to another site with 30 minutes' notice, up to the supplied limits. Account for the remote-site capacity, energy use, cost, and emissions specified in the packet; relocated activity is not eliminated. |
| Tier 2 Immediately interruptible | May be curtailed immediately within the supplied limits. Account for the interruption consequence specified in the packet and report the interrupted MWh. |

## Respond during designated constrained periods

The build-day packet will identify the grid-stress hours, advance notice, and permitted import limits. Respect those limits using onsite generation, storage, eligible relocation, eligible interruption, or a combination. A grid-import reduction is not necessarily a reduction in total campus demand: onsite resources can supply demand that remains on campus.

For the common hourly model, relocation notice is available at least 30 minutes before each affected interval. Tier 1 action can therefore apply for that full interval; Tier 2 can respond at its start. You do not need a subhourly simulator or a workload-routing system. This tests hourly adequacy under the stated notice assumption, not second-by-second response performance.

For the required model, relocation and interruption are permitted only in the designated stress windows, within the duration and quantity limits that will be supplied. Outside those windows, all three tiers remain local demand to be served. Flexibility cannot substitute for meeting the prescribed demand ramp in ordinary operating hours.

## Make the consequences visible

Report how much Tier 1 demand moves, how much Tier 2 demand is interrupted, whether protected demand remains served, and whether the import limit is met. Use the packet's common relocation and interruption assumptions in comparable results. Any additional customer valuations should be separately identified and explained.

Keep local electricity use, relocated activity, and interrupted service distinct. Include the supplied remote-operation emissions in the relevant service comparison; do not claim that relocating demand makes its energy use or emissions disappear. Distinguish clean generation curtailment from interruption of customer demand.

This is the challenge's operational treatment of grid-support and ratepayer-protection concerns: demonstrate reduced grid dependence when instructed. Tariff design and estimating effects on other customers' electricity bills are not required.

# Model and explain the portfolio

COMMON OPERATING RULES AND DECISION METRICS

## Follow demand and energy availability over time

For the required MVP, select energy-resource capacities and model hourly operation across the supplied development timeline. Campus demand increases along the prescribed commissioning ramp. Apply each grid upgrade when it takes effect, and make each selected energy resource usable only from its availability date. The portfolio must serve the required demand throughout; use the demand prescribed for each hour of the commissioning ramp and the grid capacity available at that point in the timeline, rather than applying opening-day conditions to the entire evaluation period.

Report when initial service begins and when full demand is reached. Your product should distinguish customer timing requirements from preferences. The packet will specify the commissioning ramp and common evaluation horizon, extending beyond the delayed clean, firm supply date. You do not need to invent or optimize the shape of the ramp, construction schedules, financing, or retirement decisions. No transition to a particular energy resource is required.

When comparing schedules, show months of delay alongside comparable costs, emissions intensity, and demand relocated or interrupted. Distinguish cleaner operation from fewer emissions caused only by operating for less time. If thresholds or dates are searched, explain the range tested; exhaustive optimization is not required.

## Respect the common physical rules

MW measures power at a moment; MWh measures energy over time. A 10 MW resource running at full output for 2 hours produces 20 MWh.

Every hour, the portfolio must supply the demand remaining on campus after permitted relocation and interruption, plus any electricity used to charge the battery. Excess available generation may be curtailed; no unreported unmet demand is allowed.

Respect energy-resource dates, module increments, capacity maxima, site land, and availability profiles. Exports and resale are not allowed. **Residual merchant imports and all dispatched offsite contracts share the campus import limit.** Contracts do not provide extra connection capacity.

Battery usable energy equals selected MW times 4 hours. Apply the efficiency and cycle limit specified in the packet. Track stored energy between successive hours and keep it within bounds; the packet will specify initial and final conditions and cycle accounting across the timeline. No simultaneous charging and discharging; charging may use any portfolio source within the grid-import limit (V2), with no export or resale. The build-day model rules will provide the equations, numerical parameters, and units.

# Compare costs and environmental performance

COMMON ACCOUNTING AND CUSTOMER DECISIONS

## Use a common basis for comparison

Report local energy cost over the evaluation period, annual results, and cost per MWh of local demand served, using the common accounting rules in the packet. Use the common annualized equipment capital costs (CAPEX), fixed and variable operation and maintenance (O&M), fuel, contract payments, and merchant pricing. Available-generation contracts pay for all available energy, including curtailment; do not double-charge contract energy as merchant supply.

Show relocation costs and interruption consequences separately, then include them in the common total decision-cost comparison. Show served, relocated, and interrupted MWh so reducing service cannot masquerade as an equivalent cheaper outcome. Label any customer-specific delay or carbon valuation separately from common costs. Apply the supplied rules for when equipment charges and contract payments begin and how commitments continue. Introducing later supply does not automatically erase earlier equipment costs or contract commitments.

Report annual and evaluation-period CO2 emissions from electricity serving the campus and the percentage of campus electricity supplied by clean resources. If demand is relocated, also report the associated electricity-related emissions at the receiving site and include them in total emissions. Use the data packet's common accounting rules. Annual clean share is different from every-hour clean coverage. Storage does not create clean energy or receive duplicate clean credit. These are benchmark indicators, not a formal lifecycle inventory.

## Required modeling scope

The required model uses hourly adequacy, simplified operating parameters, and common annualized economics. Detailed unit commitment, subhourly control, project finance, and optimization of investment timing are optional. UPS, emergency protection design, and certification of data-center uptime are outside scope.

## Your method remains yours

Use weights, rankings, thresholds, guided questions, or another clear approach. A preference such as "cleaner matters most" differs from a requirement such as a maximum emissions intensity. Explain how inputs affect choices. Optimization, limited search, or transparent heuristics are acceptable; global optimality is not required. If requirements conflict, suggest a useful relaxation and distinguish search limitations from proof of impossibility.

# Show a useful decision product

SUBMISSION, OPTIONAL DEPTH, AND FINAL PRESENTATIONS

## Add your files to the Submission Folder in your Team Google Drive Folder by 5:00 p.m.

**Working product and code.** Provide a functional interface and recommendation method with reproducible run instructions. Local execution is acceptable. A simple, clear workflow is sufficient; a finished customer-ready product is not expected.

**Short method README.** Explain supported customer inputs, selection and operating logic, business valuations, simplifications, and limitations. Disclose AI assistance, reused software, and any additional data or assumptions. AI tools and existing libraries are welcome; your team remains responsible for its results.

**Structured results.** Export portfolio capacities and service milestones in JSON, plus hourly operation and demand-response actions across the evaluation timeline in CSV, following the schema that will accompany the build-day packet. Include a human-readable results summary. The packet will include checking utilities for physical rules and common accounting. These check submitted results; they do not select resources or produce an hourly operating schedule. Your team builds that logic. Technical checks support review; judges assess the product and reasoning without manually reading the raw files.

## Demonstrate your product

**Show your recommendation and demonstrate how changing a customer priority affects the recommendation.** Include initial-service and full-demand dates, selected energy-resource capacities, costs, emissions, clean-energy share, and demand relocated or interrupted over the supplied timeline. Show how the portfolio responds during grid-stress periods. Demonstrate the priority change through the interface; explain an unchanged recommendation when appropriate.

## Optional enhancements

Choose depth after the core product works. An enhancement should provide credible insight, not simply add features. Keep a reproducible result using the common model alongside extensions.

| **Enhancement** | **What it can explore** |
| --- | --- |
| Richer deployment choices | Explore staged capacity additions or other deployment strategies beyond applying the supplied availability dates. Account for early costs and continuing commitments; no transition to a particular technology is expected. |
| Resource performance | Startup costs, ramping, minimum output, seasonal performance, outages, degradation, or gas-delivery constraints, using documented additional assumptions. |
| Uncertainty and flexibility | Delayed availability, alternative stress conditions, more detailed workload flexibility, or robustness across customer situations. |

## Prepare during the week; build during the event

Before build day, use this brief to understand the decisions, research modeling methods and libraries, agree on team roles, and sketch your customer workflow. You will receive the actual numerical data and file formats at the event; no additional data collection will be needed for the core task. Selected teams will present at the Columbia University Energy Symposium approximately two weeks later. Build the working MVP during the eight-hour event; only optional minor fixes and presentation improvements are expected afterward.
