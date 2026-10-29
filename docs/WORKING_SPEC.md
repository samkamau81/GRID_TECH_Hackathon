# Living App Specification

## Canonical document

The product requirements and app-building guidance live in this Google Doc:

[Open the living PeakPower app specification](https://docs.google.com/document/d/1B7Cn1Hs347fT3MlIAfdn-k-fZxYArB4Pa-Pjs_Q1-ww/edit)

**The Google Doc is the editable source of truth.** This repository file is only a stable pointer and workflow note; do not replace the live document with a downloaded or committed copy.

## Team access

GitHub repository access does not grant access to this Google Doc. In Google Drive, share the Doc directly with each teammate's Google account and grant **Editor** access. For this team, verify that `joyabedin0713@gmail.com` can open and edit it. Avoid setting “Anyone with the link” to Editor unless the team explicitly wants public editing.

## Change workflow

1. Agree on requirements, UX decisions, and methodology in the Google Doc.
2. When implementing a decision, link the relevant Doc heading in the code change, pull request, or commit description when practical.
3. Keep implementation-specific truth in the repository: code, tests, run instructions, model assumptions, and generated outputs.
4. Update the README and method documentation when implemented behavior or assumptions change. The live Doc may describe planned work; label plans as plans until they are implemented.
5. Do not copy the entire Google Doc into GitHub on every edit. If a dated snapshot is ever needed for a release, export it separately as a clearly labeled archive and keep the live Doc canonical.

## Suggested contents for the Google Doc

Keep the specification useful to both product and engineering work. Include:

- Product goal, target user, demo story, and out-of-scope items
- User flows, screen requirements, and accessibility expectations
- Hard requirements versus customer preferences
- Recommendation and hourly dispatch method, including inputs, constraints, assumptions, and limitations
- Cost, reliability, and environmental metrics with definitions and units
- Acceptance criteria and the required demo scenarios
- Decisions log with date, decision, rationale, owner, and implementation status

When a decision changes, update the decision log rather than silently replacing the rationale. Keep the implementation status synchronized with the code and this repository's README.
