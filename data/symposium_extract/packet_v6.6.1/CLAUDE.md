# GRIDTECH contestant project instructions v6.0.1 (V2)

Read `README.md` first, then `Problem_Statement.md`, `examples/MODEL_RULES.md` and `SUBMISSION_FORMAT.md`. The PDF is the unchanged released prompt. README.md is the single setup, file-navigation and resource guide. Look up fields in `data/data_dictionary.csv` as needed.

Help the team choose its own algorithm, interface and preference logic. No solver, framework, objective weights or recommended portfolio are prescribed. Do not read the entire timeline into chat context: inspect headers, small samples and code-computed summaries.

Keep supplied inputs and checking utilities unchanged; put team code in team_app/ and exports in outputs/ (or equivalent team-owned folders). Only a completed-submission checker is supplied; it internally reconstructs inputs and benchmark accounting and does not dispatch or recommend a portfolio. Teams may import its `prepare_inputs()` to build the 87,600-hour input table for any opening month (see README section 2). `BUILD_CHECKLIST.md` summarizes required vs. optional work.

Key boundaries: facility demand includes cooling; demand ramps chronologically; grid upgrades and energy-resource availability apply at their dates. Merchant and all offsite contract delivery share the grid cap. Tier 0 stays local and served; Tier 1/Tier 2 actions are event-limited and have consequences. Battery SOC carries across months/years; V2 allows grid charging (behind the meter, no export) and gives grid-charged energy no clean credit. Available-generation contract payments and early capacity commitments continue under the common accounting rules.

Use the base inputs for the required comparison. Optional grid-delay sensitivity uses grid_delay_months; there is no named-scenario selector in this packet. Extensions need disclosed assumptions and a reproducible common-model result.

Commands from this folder:
```
python starter/check_submission.py outputs/portfolio.json outputs/dispatch.csv > outputs/check_results.json
```
Submission: put the recommended result as portfolio.json and dispatch.csv at the top level of the team’s Submission Folder. Put alternatives, priority-change results or extensions in clearly labeled subfolders. Upload CSVs as files, not Google Sheets.

Checker output contains physical validity and common benchmark accounting, not a competition ranking. Checking does not establish optimality or assess the product workflow. If instructions appear inconsistent, flag the issue rather than silently replacing shared assumptions.
