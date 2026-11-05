#!/usr/bin/env python3
"""Split a self-contained Claude Artifact prototype into the Peak Power file layout.

    python scripts/split_prototype_artifact.py "peak-power/Peak Power (Copy).html"        # from the repository root

The artifact is one HTML file: CSS, markup, an engine, the app script and three embedded JSON blocks (`ref`, `scen`, `txmap`).
This script writes, without changing any behaviour of the app script:

    peak-power/css/prototype.css            the artifact's CSS (host styles + page styles) and the site-navigation links
    peak-power/js/prototype.js              the artifact's app script (only its three data-loading lines and the battery limits, which now come from the catalogue, change)
    peak-power/js/data/site-counties.js     the county map data (`txmap`), byte for byte, as window.PEAKPOWER_SITE_MAP
    peak-power/prototype.html               the artifact's markup with the three-tab site navigation, loading the files above

The embedded `ref` (reference year and resource catalogue), `scen` (starting plans) and the engine are NOT copied: the page uses the
repository's own peak-power/js/data/reference-data.js, scenarios.js and js/engine.js, which are built from the symposium packet (V2).
The script checks the artifact's data shape against them and stops if they are not compatible. Every text replacement must match
exactly once, otherwise the script stops without writing anything.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PP = ROOT / "peak-power"

NAV = ('<nav class="sitelinks" aria-label="Peak Power pages"><a href="index.html">Introduction</a>'
       '<a href="prototype.html" aria-current="page">Prototype</a><a href="data-centers.html">Data Center Climate Explorer</a></nav>')

SITELINK_CSS = """
/* ---- site navigation (Introduction | Prototype | Data Center Climate Explorer) ---- */
.sitelinks{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}
.sitelinks a{font-size:12.5px;font-weight:500;color:var(--ink-2,#52514e);text-decoration:none;padding:5px 11px;border:1px solid var(--rule,#d9d8d3);border-radius:4px;background:var(--panel,#fff)}
.sitelinks a:hover,.sitelinks a[aria-current="page"]{border-color:var(--accent,#0d6672);color:var(--accent,#0d6672)}
.sitelinks a:focus-visible{outline:2px solid var(--accent,#0d6672);outline-offset:2px}
"""

FOOTER_OLD = ("come from the contestant packet; builds start from 384 pre-simulated plans that passed its official checker and are "
              "re-run hour by hour in your browser with the checker's accounting.")
FOOTER_NEW = ("come from the symposium packet (v6.0.1, V2: the battery may charge from the grid, up to 53 MW); builds start from 384 "
              "pre-simulated plans, each replayed through its official checker, and are re-run hour by hour in your browser with the "
              "checker's accounting.")


def once(text: str, old: str, new: str, what: str) -> str:
    if text.count(old) != 1:
        sys.exit(f"STOP: expected exactly one match for {what}, found {text.count(old)}. Nothing was written.")
    return text.replace(old, new, 1)


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    src = Path(sys.argv[1])
    html = src.read_text(encoding="utf-8")

    styles = re.findall(r"<style>(.*?)</style>", html, re.S)
    if len(styles) != 2:
        sys.exit(f"STOP: expected 2 <style> blocks (host + page), found {len(styles)}.")
    blocks = list(re.finditer(r'<script(?: type="application/json" id="(\w+)")?>(.*?)</script>', html, re.S))
    data = {m.group(1): m.group(2) for m in blocks if m.group(1)}
    plain = [m for m in blocks if not m.group(1)]
    if set(data) != {"ref", "scen", "txmap"} or len(plain) != 2:
        sys.exit(f"STOP: unexpected script layout: json={sorted(data)}, plain={len(plain)} (expected engine + app).")
    app_js = plain[1].group(2)
    first_script = html.index("<script")
    body = html[html.rindex("</style>") + len("</style>"):first_script].strip("\n")

    # compatibility of the artifact's data shape with the repository's data files
    repo_ref = (PP / "js/data/reference-data.js").read_text(encoding="utf-8")
    repo = json.loads(repo_ref[repo_ref.index("= {") + 2:repo_ref.rindex("}") + 1])
    art = json.loads(data["ref"])
    missing = (set(art["ref"]) - set(repo["ref"])) | (set(art["res"]) - set(repo["res"]))
    for k in art["res"]:
        missing |= {f"res.{k}.{f}" for f in set(art["res"][k]) - set(repo["res"].get(k, {}))}
    if missing:
        sys.exit(f"STOP: the repository data lacks fields the artifact uses: {sorted(missing)}")
    txmap = json.loads(data["txmap"])

    # --- app script: three data-loading lines and the V2 battery limit in the layout planner
    app_js = once(app_js, "const {ref:REF,res:RES}=JSON.parse(document.getElementById('ref').textContent);",
                  "const {ref:REF,res:RES}=window.PEAKPOWER_REFERENCE;", "reference-data loader")
    app_js = once(app_js, "const S=JSON.parse(document.getElementById('scen').textContent);", "const S=window.PEAKPOWER_SCENARIOS;", "plan-library loader")
    app_js = once(app_js, "const MAPD=JSON.parse($('txmap').textContent),", "const MAPD=window.PEAKPOWER_SITE_MAP,", "county-map loader")
    app_js = once(app_js, "battery_4h:{n:'Battery',mw:12,w:6,h:6,max:12,", "battery_4h:{n:'Battery',mw:12,w:6,h:6,max:(RES.battery_4h.max_mw||12),", "layout-planner battery limit")

    app_js = once(app_js, "nuclear:25,battery_4h:12,fuel_cell:30", "nuclear:25,battery_4h:r.max_mw,fuel_cell:30", "energy-timeline battery limit")
    app_js = once(app_js, "per kW, up to 12 MW offered", "per kW, up to ${fmt(r.max_mw)} MW offered", "equipment-offer battery text")

    body = once(body, '<div class="wrap">\n  <header class="top">', '<div class="wrap">\n  ' + NAV + '\n  <header class="top">', "page header")
    body = once(body, FOOTER_OLD, FOOTER_NEW, "footer data statement")
    body = once(body, "The packet does not allow selling power back to the grid.", "The packet does not allow selling power back to the grid, and the battery never exports.", "footer export statement")

    page = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
            '<title>Prototype – Peak Power</title>\n'
            '<meta name="description" content="Plan a 75 MW data center campus: portfolio of sites, county site finder, energy plan, board review and live operations.">\n'
            '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Cpolygon fill=\'%230d6672\' points=\'60,0 0,58 42,58 30,100 100,36 56,36\'/%3E%3C/svg%3E">\n'
            '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">\n'
            '<link rel="stylesheet" href="css/prototype.css">\n</head>\n<body>\n' + body + '\n\n'
            '<script src="js/data/reference-data.js"></script>\n<script src="js/data/scenarios.js"></script>\n'
            '<script src="js/data/site-counties.js"></script>\n<script src="js/engine.js"></script>\n<script src="js/prototype.js"></script>\n</body>\n</html>\n')

    (PP / "css").mkdir(exist_ok=True)
    (PP / "css/prototype.css").write_text("/* Prototype page styles, split from the Claude Artifact by scripts/split_prototype_artifact.py */\n"
                                          + styles[0].strip() + "\n" + styles[1].strip() + "\n" + SITELINK_CSS, encoding="utf-8")
    (PP / "js/prototype.js").write_text("/* Prototype app, split from the Claude Artifact by scripts/split_prototype_artifact.py. Data comes from js/data/*.js and the engine from js/engine.js. */\n"
                                        + app_js.strip("\n") + "\n", encoding="utf-8")
    (PP / "js/data/site-counties.js").write_text(
        "/* US county map and county grades for the Prototype's Find a site (from the Claude Artifact, unchanged). "
        f"{len(txmap['c'])} counties keyed by 5-digit FIPS. Sources are listed in the page under 'Where these grades come from'. */\n"
        "window.PEAKPOWER_SITE_MAP = " + data["txmap"] + ";\n", encoding="utf-8")
    (PP / "prototype.html").write_text(page, encoding="utf-8")
    print(f"Wrote prototype.html, css/prototype.css, js/prototype.js ({len(app_js) // 1024} KB), js/data/site-counties.js ({len(data['txmap']) // 1024} KB, {len(txmap['c'])} counties).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
