# Data-gap report: Prototype site selection and energy data

Scope: the county data behind **Find a site** in the Prototype (`peak-power/js/data/site-counties.js`, 3,142 counties, unchanged from the
supplied artifact), the Texas energy data, and storage (BESS) data. Nothing was filled in or estimated while integrating; where a value is
missing the app shows "Not graded" or "Data needed". Counts below were computed from the file on 4 Nov 2026.

## 1. County records (quality checks)

| Check | Result |
|---|---|
| Records | 3,142, each with a unique five-digit FIPS code; no duplicates; all 51 state codes present (50 states + DC) |
| Geometry vintage | **Alaska has 29 areas, Connecticut has 8 counties.** Newer sources use 30 Alaska areas (Chugach and Copper River replaced Valdez–Cordova in 2019) and 9 Connecticut planning regions (2022). Joins for these two states cannot match newer data one to one. |
| Hazard (FEMA National Risk Index) | Missing for **9 counties**: all 8 Connecticut counties and 1 Alaska area. This is the planning-region mismatch above. |
| Water stress (WRI Aqueduct) | No value for **62 counties**: Texas 17, Montana 11, New Mexico 11, Hawaii 5, Nevada 5, Arizona 4, Wyoming 3, Colorado 2, and one each in Idaho, Oregon, Alaska and California. Shown as not graded. |
| Grid queue region | No region for **35 counties** (Alaska 29, Hawaii 5, DC 1). |
| Policy | Graded at **state level** only; local zoning, abatements and ordinances are not loaded. |
| Land use / zoning | **Not scored.** Only seven places under a local pause (moratorium tracker) are flagged Moderate; it does not change the Overall grade. |

## 2. Energy: what is graded and what is not

| Variable | Texas (254 counties) | Other states (2,888 counties) |
|---|---|---|
| Energy availability grade | Graded: proximity to Dallas Fort Worth, Houston, Austin, San Antonio; West Texas wind belt held to Moderate for transmission congestion. Team screen, labelled as such. | **Not graded.** Shown as "Not graded", with the reason that the dispatch model covers ERCOT only. |
| Hourly power model | ERCOT 2023 reference year (price, wind, solar, load) from the symposium packet; unchanged. | Not available. No other region is modelled. |
| Time to power | Grid-region median years from LBNL *Queued Up* (ERCOT 3.8). | Same measure by region: CAISO 7.9, MISO 4.4, NYISO 5.2, PJM 5.8, SPP 5.8, Southeast 4.5, West 3.9. **ISO-NE: no completed plants in the dataset, so no median.** |
| Overall grade | Uses the energy grade (weight 2). | Uses the grid queue wait as a stand-in for energy. |

Caveat on Time to power: it measures how long **generation** projects waited to connect, as a sign of congestion. It is not a wait for a data center **load**, and it is by region, not by county.

**Counties with no queue median at all: 102** (Alaska, Connecticut, DC, Hawaii, Maine, Massachusetts, New Hampshire, Rhode Island, Vermont).

### Energy variables are different datasets, and are not interchangeable

| Variable the prototype may need | Why it is separate | Credible public source (not downloaded) | Status |
|---|---|---|---|
| Electricity price (industrial) | A cost; by state and utility, not by county | EIA Electric Power Monthly; EIA-861 | Missing outside Texas (Texas uses ERCOT hourly prices) |
| Grid capacity / headroom near a site | Physical limit at substations and transmission | Utility integrated resource plans; ISO/RTO load-interconnection studies; no national county dataset | Missing everywhere except the Texas screen |
| Interconnection queue (generation) | Congestion proxy | LBNL *Queued Up* (already used); ISO/RTO queue files | In use, by region |
| Transmission congestion | Price separation between locations | ISO/RTO congestion components (ERCOT, PJM, MISO, SPP, CAISO, NYISO, ISO-NE public data) | Missing; Texas congestion is a qualitative screen |
| Reliability (outages) | Customer-level interruptions | EIA-861 reliability tables (SAIDI/SAIFI by utility) | Missing |
| Generation near a site | Supply side | EIA-860 plant data by county | Not loaded |

Recommended order if more data is added: (1) EIA-861 industrial prices and reliability by state, (2) ISO/RTO congestion for the regions already named, (3) utility-level capacity statements for named projects. Each should be loaded as a separate, labelled variable and not folded into the existing Energy grade without approval.

## 3. Battery storage (BESS)

| Item | Status |
|---|---|
| Specifications used | Only the symposium packet catalogue: 1–53 MW, 4 h, round trip 0.85, up to 365 cycles a year, $1,220/kW CAPEX, $40/kW-yr fixed O&M, 15-year life, 0.15 acre/MW |
| Rules | V2: may charge from any source (grid, offsite contracts, onsite gas), behind the meter, no export or resale; clean credit in proportion to the year's clean charging |
| Project-level battery data (real sites, interconnection, vendor specifications) | **None in the repository.** EIA-860 (planned and operating storage) and the LBNL queue (storage requests) would be the public sources. |
| Calculations | Unchanged by this integration other than the battery limit now coming from the catalogue (53 MW) |

## 4. Weather

The Data Center Climate Explorer fetches current weather on demand from Open-Meteo. The Prototype does **not** use live or historical weather: its "weather year" setting scales the packet's 2023 wind and solar profiles (an extension labelled in the interface). Connecting the two is deferred; if done it should reuse the Explorer's cached, on-demand module and stay separate from the dispatch calculations.

## 5. Source vintages shown in the Prototype

State policy: Nov 2026 · LBNL grid queue: through 2025 · FEMA National Risk Index: Dec 2025 · WRI Aqueduct 4.0 · CAIDA IXP / PeeringDB fiber facilities: Oct 2026 · Moratorium tracker: Electric Choice · Boundaries: US Census (us-atlas). The county data was supplied inside the artifact; the original source files are **not** in the repository, so the join logic cannot be re-run from sources here.
