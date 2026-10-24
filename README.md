# GridTech Hackathon — Power Portfolio Planner

A team project for the GridTech Hackathon: a decision-support tool for comparing energy portfolios for a fictional data-center campus in Williamson County, Texas.

> **Project status (updated 2026-10-24):** The repository includes a local Campus Power Planner dashboard and Python recommendation/API backend in `data/Contestant_Packet/team_app/`, along with validated benchmark outputs. The model uses a limited curated candidate set; it is a screening tool, not a global optimizer or real-world project quote.

## Living product specification

The team product and methodology specification is maintained in Google Docs so teammates can edit it collaboratively. The [living specification and access workflow](docs/WORKING_SPEC.md) link to the canonical document; this repository keeps implementation and release artifacts. The [integrated build handoff](docs/APP_BUILD_HANDOFF.md) combines the backend and front-end requirements, with backend validation first and dashboard integration afterward.

## What we are building

The planned product will help a customer express energy priorities, compare feasible portfolios, and understand their trade-offs. It should make the reasoning visible: what requirements were applied, why resources were selected, how the portfolio responds during grid-stress periods, and what the choice means for cost and emissions.

The intended demo flow is:

1. Set hard requirements and preferences for speed to power, cost, and environmental performance.
2. Review the recommended resource portfolio and service milestones.
3. Inspect costs, emissions, clean-energy share, and grid-stress response.
4. Compare at least one meaningful alternative.
5. Change a customer priority in the interface and explain how the recommendation changes—or why it does not.

The app is a screening and decision-support product for the fictional benchmark. It is not a real project quote, a nationwide comparison, a power-system certification, or a guarantee of data-center uptime.

## Challenge scope

The benchmark describes a fictional campus in Williamson County, Texas, with a 75 MW peak and 69 MW mean mature load. The model covers 120 months (87,600 hourly intervals), including a commissioning ramp, staged grid upgrades, resource availability dates, and recurring grid-stress events.

The portfolio may use any feasible combination of seven resource offers—utility solar, wind, a four-hour battery, gas turbine, gas engine, natural-gas fuel cell, and a future nuclear PPA—plus residual merchant electricity. The benchmark specifies common capacity, timing, land, cost, operating, and emissions assumptions. The default case starts service in month 20, reaches full demand in month 30, and uses no grid-connection delay.

The source inputs are regional proxies and fictional exercise assumptions. Electricity prices use an ERCOT South Texas proxy, gas prices use Henry Hub plus an assumed delivery adder, and grid emissions use an annual-average factor. Results should be described as Texas benchmark results, not as representative of all U.S. locations.

## What judges evaluate

The judging rubric gives equal weight to five areas:

- **Product:** Is the tool useful, understandable, and responsive to changing inputs?
- **Methodology:** Can a judge see how inputs and assumptions produce the recommendation?
- **Portfolio viability:** Does the portfolio cover demand, show service timing and stress response, and compare an alternative?
- **Financial outcomes:** Are costs and their drivers clear, including relocation and interruption consequences?
- **Environmental outcomes:** Are emissions, clean-energy share, and environmental trade-offs clear?

Judges score the five-minute presentation and demo. Make the logic, assumptions, outputs, and trade-offs visible in the product rather than relying on claims that are difficult to verify during the demo.

## Repository contents

```text
.
├── .claude/
│   └── settings.json                 # Claude Code project settings; contains no API key
├── Campus Power Planner.html        # Canonical standalone frontend
├── data/
│   ├── Contestant_Packet[FINAL].zip  # Released challenge packet
│   └── Contestant_Packet/
│       ├── team_app/                 # Campus Power Planner HTML and Python backend
│       └── outputs/                  # Validated benchmark results
├── problem statement/
│   └── GridTech_Hackathon_Problem_Statement.pdf
├── scoring rubric/
│   ├── Judging Rubric - Rubric.csv
│   └── Judging Rubric - Rubric.pdf
├── CLAUDE.md                         # Team-specific collaboration and packet guidance
├── README.md                         # This living project guide
└── .gitignore                        # Excludes .env and local secrets
```

Team-owned code lives under `data/Contestant_Packet/team_app/` and generated artifacts under `data/Contestant_Packet/outputs/`. Do not modify, move, rename, or re-save the supplied benchmark inputs and checker. Keep the extracted packet structure intact.

## Getting started

### 1. Get the packet files

The full packet is stored in `data/Contestant_Packet[FINAL].zip`. Extract it into `data/` so the packet folder is `data/Contestant_Packet/`. On Windows PowerShell:

```powershell
Expand-Archive -LiteralPath 'data/Contestant_Packet[FINAL].zip' -DestinationPath 'data' -Force
```

The packet includes its own `README.md`, `BUILD_CHECKLIST.md`, `CLAUDE.md`, `Problem_Statement.md`, `MODEL_RULES.md`, `SUBMISSION_FORMAT.md`, benchmark data, examples, and submission checker. Read the packet README first, then the build checklist and packet instructions. The packet documents are authoritative for the benchmark and submission format.

### 2. Set up Python for the checker

The supplied checker utilities require Python 3.10 or newer. The packet lists NumPy and pandas as dependencies. From the extracted packet directory, create and activate a virtual environment:

```powershell
py -3 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r starter/requirements.txt
```

If PowerShell blocks activation, run the virtual environment's Python executable directly. The packet data is usable offline; installing dependencies may require a configured package source.

### 3. Run the app

The canonical frontend is the root-level `Campus Power Planner.html`; its contents are kept intact and the local Python server serves that exact file at `http://127.0.0.1:8000/`. Python backend modules remain in `data/Contestant_Packet/team_app/` and expose the recommendation API. Python 3.10+ and the packet requirements (`pandas`, `numpy`) are needed. From the repository root:

```powershell
python -m pip install -r data/Contestant_Packet/starter/requirements.txt
python data/Contestant_Packet/team_app/server.py
```

The server binds to loopback by default. The engine can also be run directly with `python data/Contestant_Packet/team_app/run.py --help`.

## Planned product behavior

### Customer inputs

The interface should clearly separate:

- **Hard requirements:** conditions the portfolio must satisfy, such as a required initial-service month or a maximum interruption level.
- **Preferences:** trade-offs that influence ranking, such as valuing faster service, lower cost, or lower emissions.

No customer weights or recommended portfolio are prescribed by the packet. The team should document its chosen decision method and make the effect of each input understandable.

### Portfolio and hourly dispatch

The model must select feasible capacities from the supplied resource catalog and generate an hourly operating schedule for all 87,600 hours in the base case. It must respect resource increments and maxima, availability dates, the 8-acre onsite land limit, campus demand, the commissioning ramp, grid upgrades, and stress-event import limits.

During designated stress hours, the schedule may use local resources, storage, eligible Tier 1 demand relocation, and eligible Tier 2 interruption within the packet's limits. Tier 0 demand must remain served locally. Relocation and interruption must be reported as distinct actions; relocation does not make energy use or emissions disappear.

### Results and explanations

The app and its generated summary should report, at minimum:

- Initial-service and full-demand months
- Selected resource capacities
- Local energy cost, relocation cost, interruption consequence, and total decision cost
- Cost per MWh
- Local, remote, and combined emissions; combined emissions intensity; clean-energy share
- Relocated and interrupted MWh
- Stress-period behavior and import-limit compliance
- A meaningful alternative with its costs and trade-offs

Show the method, accounting assumptions, and limitations on a dedicated **Method & Assumptions** page and in the short written method README required by the packet. Keep the in-app explanation synchronized with the actual implementation; do not claim the app uses methods or constraints that are not implemented.

## Submission and validation

The final submission is expected to include:

- Runnable app and source code, with run instructions
- A short method README describing supported inputs, selection and dispatch logic, valuations, simplifications, limitations, and AI/software disclosure
- A readable results summary
- `portfolio.json` and `dispatch.csv` in the packet's required schema

Once results are generated, run the supplied checker from the extracted packet directory. Keep `outputs/` inside that directory so the paths below resolve:

```powershell
python starter/check_submission.py outputs/portfolio.json outputs/dispatch.csv > outputs/check_results.json
```

The checker validates physical rules and reports common benchmark accounting; it does not select a portfolio or generate an hourly schedule. Review the packet's `SUBMISSION_FORMAT.md` and examples before building the export files. Keep a checked base-case result even if the team adds optional sensitivities or extensions.

## Method and assumptions log

Use this section as a compact change log for decisions that affect results. Update it alongside the implementation and the detailed method document.

| Version | Date | Update |
|---|---|---|
| 0.1 | 2026-10-24 | Added initial project overview, benchmark scope, repository map, setup guidance, judging priorities, and planned product requirements. App method and results are not implemented yet. |

When the model is implemented, record its version, portfolio-selection approach, dispatch rules, customer valuations, and any deviations from the supplied benchmark conventions here or in a linked methodology document.

## Team workflow

- Coordinate changes through GitHub. Pull the latest `main` before starting shared work and use feature branches for substantial or parallel changes.
- Keep commits focused and avoid committing generated caches, virtual environments, secrets, or unrelated local files.
- Review changes to benchmark inputs before merging; supplied files must remain unchanged.
- Update this README and the method document whenever setup commands, app behavior, assumptions, or outputs change.

## Credentials and public demo links

Do not commit API keys, ngrok tokens, or other credentials. `.env` is ignored by Git. The app itself should not require API keys or online services. A tunnel such as ngrok may be used as a temporary way to show a locally running demo; it is not part of the app's data or recommendation logic. Rotate any credential that has been exposed, and keep replacement tokens in local configuration only.

## Reference files

- `CLAUDE.md` — team instructions for working with the hackathon packet
- `data/Contestant_Packet[FINAL].zip` — released benchmark packet and authoritative model/submission rules
- `problem statement/GridTech_Hackathon_Problem_Statement.pdf` — readable problem statement copy
- `scoring rubric/Judging Rubric - Rubric.csv` — rubric criteria and scoring anchors
- `scoring rubric/Judging Rubric - Rubric.pdf` — printable rubric copy

## License

See [`LICENSE`](LICENSE) for the repository license. The benchmark packet and supplied challenge materials may have separate terms or attribution requirements; preserve their original contents and follow the instructions included with the packet.
