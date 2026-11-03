#!/usr/bin/env python3
"""Build the US reference data used by the Investment Intelligence page.

    python scripts/us_reference_data.py            # from the repository root (needs internet on first run)

Writes into peak-power/data/processed/:
    us-states.geojson     US state outlines, simplified (about 2 km) for point-in-state lookups in the browser
    us-reference.json     EIA state electricity prices and reliability, and FEMA's national distribution of building loss rates
    data-sources.json     provenance of every dataset the page uses (source, date, units, resolution, licence, limitations)

Sources (all public US government data):
    US Census Bureau cartographic state boundaries, 1:500,000  (cached from scripts/.cache/, see process_data_centers.py)
    US Energy Information Administration, Form EIA-861, 2025 final data: Sales_Ult_Cust and Reliability files
    FEMA National Risk Index, county layer (ArcGIS FeatureServer), version recorded in the output

Standard library only. Downloads are cached in scripts/.cache/ and verified by SHA-256 recorded in the output.
Nothing is estimated or filled in: a state with no usable reliability reports simply has no reliability value.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.parse
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "peak-power" / "data" / "processed"
CACHE = Path(__file__).resolve().parent / ".cache"

BOUNDARY_FILE = CACHE / "us-states-500k.geojson"
BOUNDARY_URL = "https://eric.clst.org/assets/wiki/uploads/Stuff/gz_2010_us_040_00_500k.json"
EIA_YEAR = 2025
EIA_URL = f"https://www.eia.gov/electricity/data/eia861/zip/f861{EIA_YEAR}.zip"
FEMA_URL = "https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Counties/FeatureServer/0/query"
SIMPLIFY_DEG = 0.02          # Douglas-Peucker tolerance, about 2 km: fine for choosing a state, not for surveying
UA = {"User-Agent": "peak-power-data-processing/1.0"}

STATES = {  # 50 states + DC; Puerto Rico and other territories are outside this analysis
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA", "Colorado": "CO",
    "Connecticut": "CT", "Delaware": "DE", "District of Columbia": "DC", "Florida": "FL", "Georgia": "GA",
    "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
    "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA",
    "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS", "Missouri": "MO", "Montana": "MT",
    "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM",
    "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
    "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA",
    "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
}
CODES = set(STATES.values())


def download(url: str, dest: Path, refresh: bool) -> bytes:
    CACHE.mkdir(exist_ok=True)
    if refresh or not dest.exists():
        print(f"downloading {url}", file=sys.stderr)
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
            dest.write_bytes(r.read())
    return dest.read_bytes()


# ---------------------------------------------------------------- state outlines
def simplify(points, tol):
    """Douglas-Peucker on a list of (x, y); iterative so very long coastlines cannot overflow the stack."""
    n = len(points)
    if n < 3:
        return points
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        norm = (dx * dx + dy * dy) ** 0.5
        best, idx = 0.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            d = abs(dy * (px - ax) - dx * (py - ay)) / norm if norm else ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
            if d > best:
                best, idx = d, i
        if best > tol and idx > 0:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(points, keep) if k]


def build_states(refresh: bool):
    raw = download(BOUNDARY_URL, BOUNDARY_FILE, refresh)
    gj = json.loads(raw.decode("utf-8", errors="replace"))
    feats, n_in, n_out = [], 0, 0
    for f in gj["features"]:
        code = STATES.get(f["properties"]["NAME"])
        if not code:
            continue
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        out_polys = []
        for poly in polys:
            rings = []
            for ring in poly:
                n_in += len(ring)
                s = simplify([(p[0], p[1]) for p in ring], SIMPLIFY_DEG)
                if len(s) >= 4:  # a closed ring needs at least 4 points; tiny islands may vanish, which is fine here
                    rings.append([[round(x, 3), round(y, 3)] for x, y in s])
                    n_out += len(s)
            if rings:
                out_polys.append(rings)
        feats.append({"type": "Feature", "properties": {"code": code, "name": f["properties"]["NAME"]},
                      "geometry": {"type": "MultiPolygon", "coordinates": out_polys}})
    feats.sort(key=lambda f: f["properties"]["code"])
    if {f["properties"]["code"] for f in feats} != CODES:
        sys.exit("state boundary file is missing states")
    return {"type": "FeatureCollection", "features": feats}, hashlib.sha256(raw).hexdigest(), n_in, n_out


# ---------------------------------------------------------------- EIA-861 (minimal xlsx reader)
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def read_sheet(path: Path, member_wanted: str, sheet_name: str):
    """Rows of one sheet of an .xlsx inside a zip, as {column letter: value} dicts."""
    with zipfile.ZipFile(path) as outer:
        inner = zipfile.ZipFile(__import__("io").BytesIO(outer.read(member_wanted)))
    ss = []
    if "xl/sharedStrings.xml" in inner.namelist():
        for si in ET.fromstring(inner.read("xl/sharedStrings.xml")).findall("m:si", NS):
            ss.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    wb = ET.fromstring(inner.read("xl/workbook.xml"))
    rels = ET.fromstring(inner.read("xl/_rels/workbook.xml.rels"))
    target = None
    for s in wb.find("m:sheets", NS):
        if s.get("name") == sheet_name:
            rid = s.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
            for r in rels:
                if r.get("Id") == rid:
                    target = "xl/" + r.get("Target").lstrip("/").replace("xl/", "")
    if target is None:
        sys.exit(f"sheet {sheet_name} not found in {member_wanted}")
    out = []
    for r in ET.fromstring(inner.read(target)).find("m:sheetData", NS):
        row = {}
        for c in r:
            col = re.match(r"[A-Z]+", c.get("r")).group()
            v, t = c.find("m:v", NS), c.get("t")
            if v is None:
                isn = c.find("m:is", NS)
                row[col] = "".join(x.text or "" for x in isn.iter("{%s}t" % NS["m"])) if isn is not None else None
            else:
                row[col] = ss[int(v.text)] if t == "s" else v.text
        out.append(row)
    return out


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None  # "." and blanks mean "not reported"


def build_eia(refresh: bool):
    raw = download(EIA_URL, CACHE / f"eia861-{EIA_YEAR}.zip", refresh)
    zpath = CACHE / f"eia861-{EIA_YEAR}.zip"

    # Prices: revenue of all service types over sales of bundled + energy-only service (delivery-only sales would
    # double-count). This reproduces EIA's published national averages (industrial about 8.5, commercial about 13.4 c/kWh).
    rows = read_sheet(zpath, f"Sales_Ult_Cust_{EIA_YEAR}.xlsx", "States")
    hdr = next(i for i, r in enumerate(rows) if r.get("A") == "Data Year")
    rev, sales, cust = defaultdict(float), defaultdict(float), defaultdict(float)
    cols = {"commercial": ("M", "N"), "industrial": ("P", "Q"), "residential": ("J", "K")}
    for r in rows[hdr + 1:]:
        st, svc = r.get("G"), r.get("E")
        if st not in CODES or svc not in ("Bundled", "Energy", "Delivery"):
            continue
        for sector, (rc, sc) in cols.items():
            rev[st, sector] += num(r.get(rc)) or 0.0
            if svc in ("Bundled", "Energy"):
                sales[st, sector] += num(r.get(sc)) or 0.0
        if svc in ("Bundled", "Delivery"):
            cust[st] += num(r.get("X")) or 0.0
    price = lambda st, sec: round(100.0 * rev[st, sec] / sales[st, sec], 2) if sales[st, sec] > 0 else None
    national = {s: round(100.0 * sum(v for (st, sec), v in rev.items() if sec == s) / sum(v for (st, sec), v in sales.items() if sec == s), 2) for s in cols}

    # Reliability: customer-weighted state means of utility-reported SAIDI/SAIFI, IEEE 1366 figures where given, otherwise
    # the utility's own standard. "Without major event days" is used for scoring so storm-driven outages are not counted twice
    # (FEMA hazard data covers that); the all-events figure is kept for display.
    rel = read_sheet(zpath, f"Reliability_{EIA_YEAR}.xlsx", "Reliability_States")
    hdr = next(i for i, r in enumerate(rel) if r.get("A") == "Data Year")
    acc = defaultdict(lambda: defaultdict(float))
    for r in rel[hdr + 1:]:
        st = r.get("D")
        if st not in CODES:
            continue
        ieee = num(r.get("O")) is not None and num(r.get("O")) > 0
        c = num(r.get("O")) if ieee else num(r.get("X"))
        if not c or c <= 0:
            continue
        pick = (("I", "J", "F", "G") if ieee else ("U", "V", "R", "S"))
        saidi, saifi, saidi_all, saifi_all = (num(r.get(k)) for k in pick)
        a = acc[st]
        if saidi is not None:
            a["saidi_w"] += saidi * c; a["saidi_c"] += c
        if saifi is not None:
            a["saifi_w"] += saifi * c; a["saifi_c"] += c
        if saidi_all is not None:
            a["saidiall_w"] += saidi_all * c; a["saidiall_c"] += c
        if ieee:
            a["ieee_c"] += c
    states = {}
    for st in sorted(CODES):
        a = acc.get(st, {})
        entry = {"industrialCentsPerKwh": price(st, "industrial"), "commercialCentsPerKwh": price(st, "commercial"),
                 "residentialCentsPerKwh": price(st, "residential"), "industrialSalesMWh": round(sales[st, "industrial"])}
        if a.get("saidi_c"):
            entry.update({"saidiMinutes": round(a["saidi_w"] / a["saidi_c"], 1),
                          "saifi": round(a["saifi_w"] / a["saifi_c"], 2) if a.get("saifi_c") else None,
                          "saidiAllEventsMinutes": round(a["saidiall_w"] / a["saidiall_c"], 1) if a.get("saidiall_c") else None,
                          "reliabilityCustomers": round(a["saidi_c"]),
                          "reliabilityCoverage": round(min(1.0, a["saidi_c"] / cust[st]), 2) if cust[st] else None,
                          "ieeeShare": round(a["ieee_c"] / a["saidi_c"], 2)})
        states[st] = entry
    return {"year": EIA_YEAR, "national": national, "states": states}, hashlib.sha256(raw).hexdigest()


# ---------------------------------------------------------------- FEMA National Risk Index
def build_fema():
    """National distribution of the expected annual building loss rate (building EAL / building value) over US counties."""
    rates, version, offset, n = [], set(), 0, 0
    while True:
        q = urllib.parse.urlencode({"where": "1=1", "outFields": "COUNTYFIPS,STATEABBRV,BUILDVALUE,EAL_VALB,NRI_VER",
                                    "returnGeometry": "false", "orderByFields": "OBJECTID", "resultOffset": offset,
                                    "resultRecordCount": 2000, "f": "json"})
        with urllib.request.urlopen(urllib.request.Request(FEMA_URL + "?" + q, headers=UA), timeout=120) as r:
            d = json.loads(r.read().decode("utf-8"))
        feats = d.get("features", [])
        for f in feats:
            a = f["attributes"]
            n += 1
            version.add(a.get("NRI_VER"))
            bv, eal = a.get("BUILDVALUE"), a.get("EAL_VALB")
            if a.get("STATEABBRV") in CODES and bv and bv > 0 and eal is not None and eal >= 0:
                rates.append(eal / bv)
        if not d.get("exceededTransferLimit") or not feats:
            break
        offset += len(feats)
    rates.sort()
    q = [rates[min(len(rates) - 1, round(i / 100 * (len(rates) - 1)))] for i in range(101)]
    return {"nriVersion": sorted(v for v in version if v), "countiesReturned": n, "countiesUsed": len(rates),
            "metric": "expected annual building loss rate = EAL_VALB / BUILDVALUE (fraction of building value per year)",
            "quantiles": [float(f"{x:.6g}") for x in q]}


# ---------------------------------------------------------------- provenance registry
def sources(meta):
    return [
        {"id": "dc-osm", "name": "Data center locations (OpenStreetMap-derived extract)", "provider": "supplied as data/data_centers.zip",
         "used_for": "Existing data centers layer; market concentration proxy (count of mapped facilities nearby)",
         "units": "points (WGS84 latitude/longitude)", "resolution": "individual facilities", "dated": "extract dated 2026-09-29 (file timestamps); records carry OSM last-edit dates",
         "license": "OpenStreetMap data is © OpenStreetMap contributors, ODbL 1.0",
         "limitations": ["No status field: existing and planned facilities cannot be told apart", "Mapped features only; far fewer than industry trackers report",
                         "Mapping effort varies by region, so counts are biased toward well-mapped areas", "A facility's presence says nothing about whether a new site there would be suitable"]},
        {"id": "open-meteo-archive", "name": "Open-Meteo Historical Weather API (ERA5 reanalysis)", "provider": "Open-Meteo.com, https://open-meteo.com/en/docs/historical-weather-api",
         "used_for": "Hourly temperature, relative humidity, wet-bulb temperature and wind speed for climate statistics and the cooling model",
         "units": "°C or °F, %, mph (converted in code)", "resolution": "ERA5 about 25 km grid, hourly; data available with about a 5-day delay",
         "dated": f"{meta['years'][0]}-{meta['years'][-1]} calendar years (see climate-grid.json for the exact window)",
         "license": "CC BY 4.0. The free API is for non-commercial use only (limits: 600 calls/min, 5,000/hour, 10,000/day); commercial use needs a paid plan",
         "limitations": ["Reanalysis, not station measurements: a modelled estimate on a 25 km grid", "Wet-bulb temperature is the API's own variable (2 m)",
                         "A few years do not capture long-term climate; the history window is short by design to stay within free-tier limits",
                         "Not suitable for design-day (ASHRAE-style) extremes; indicates typical conditions"]},
        {"id": "open-meteo-forecast", "name": "Open-Meteo Forecast API (current conditions)", "provider": "Open-Meteo.com, https://open-meteo.com/en/docs",
         "used_for": "Current weather in the location panel (operational context only, never used in scoring)",
         "units": "°F, mph, %", "resolution": "best available model for the location, 15-minute interval", "dated": "live at click time",
         "license": "CC BY 4.0; free API for non-commercial use only", "limitations": ["Model analysis, not an observation at a specific station"]},
        {"id": "eia-861", "name": f"EIA Form EIA-861 {meta['eia_year']} final data: sales to ultimate customers and reliability", "provider": "US Energy Information Administration, https://www.eia.gov/electricity/data/eia861/",
         "used_for": "State average industrial/commercial electricity price; state SAIDI/SAIFI reliability",
         "units": "cents per kWh (revenue / sales); minutes per customer per year (SAIDI); interruptions per customer per year (SAIFI)",
         "resolution": "state", "dated": f"data year {meta['eia_year']}, final release 2026-10-07; retrieved {meta['retrieved']}",
         "license": "US government work; EIA states its data may be reused with attribution (see EIA Copyright & Reuse)",
         "limitations": ["State averages hide large differences between utilities, tariffs and negotiated large-load contracts",
                         "Industrial average is a proxy for what a data center would pay", "Reliability is utility-reported and covers only reporting utilities; some use non-IEEE definitions",
                         "SAIDI measures distribution outages, not whether new capacity or interconnection is available"]},
        {"id": "fema-nri", "name": f"FEMA National Risk Index, counties ({', '.join(meta['nri_version'])})", "provider": "FEMA, https://hazards.fema.gov/nri/",
         "used_for": "Natural hazard exposure: expected annual building loss rate of the county (queried live for a clicked point; precomputed for map cells)",
         "units": "fraction of building value per year", "resolution": "county", "dated": f"NRI {', '.join(meta['nri_version'])}; retrieved {meta['retrieved']}",
         "license": "US government data, free to use; this page is not endorsed by FEMA",
         "limitations": ["County resolution only", "Composite NRI risk score is not used: it grows with the amount of property exposed and would penalise every large metro",
                         "Covers natural hazards only (no heat-wave trend modelling, no man-made hazards)"]},
        {"id": "census-states", "name": "US Census Bureau cartographic state boundaries (1:500,000)", "provider": "US Census Bureau",
         "used_for": "Deciding which state a point is in; simplified to about 2 km for browser use",
         "units": "polygons (WGS84)", "resolution": "state, simplified", "dated": "2010 cartographic boundary file", "license": "US government work, public domain",
         "limitations": ["Simplification can misplace a point within about 2 km of a border"]},
    ]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true", help="re-download source files")
    ap.add_argument("--skip-fema", action="store_true", help="skip the FEMA download (keeps any existing FEMA section)")
    args = ap.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ref_path = OUT_DIR / "us-reference.json"
    old = json.loads(ref_path.read_text(encoding="utf-8")) if ref_path.exists() else {}

    states_gj, b_sha, n_in, n_out = build_states(args.refresh)
    (OUT_DIR / "us-states.geojson").write_text(json.dumps(states_gj, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")
    print(f"states: {len(states_gj['features'])} outlines, {n_in} -> {n_out} vertices")

    eia, e_sha = build_eia(args.refresh)
    print(f"EIA-861 {EIA_YEAR}: national industrial {eia['national']['industrial']} c/kWh, commercial {eia['national']['commercial']} c/kWh; "
          f"{sum(1 for s in eia['states'].values() if 'saidiMinutes' in s)} of {len(eia['states'])} states with reliability data")

    fema = old.get("fema") if args.skip_fema else build_fema()
    print(f"FEMA NRI: {fema['countiesUsed']} counties, versions {fema['nriVersion']}; building loss rate p10/p50/p90 = "
          f"{fema['quantiles'][10]:.2e} / {fema['quantiles'][50]:.2e} / {fema['quantiles'][90]:.2e}")

    import datetime
    retrieved = datetime.date.today().isoformat()
    ref = {"eia": {**eia, "sourceUrl": EIA_URL, "sha256": e_sha, "retrieved": retrieved,
                   "priceDefinition": "state average revenue / sales, all service types' revenue over bundled + energy-only sales"},
           "fema": {**fema, "sourceUrl": FEMA_URL.rsplit("/query", 1)[0], "retrieved": retrieved},
           "boundaries": {"sourceUrl": BOUNDARY_URL, "sha256": b_sha, "simplifyDegrees": SIMPLIFY_DEG}}
    ref_path.write_text(json.dumps(ref, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")

    grid = OUT_DIR / "climate-grid.json"
    years = json.loads(grid.read_text(encoding="utf-8"))["meta"]["years"] if grid.exists() else ["window set by climate_preprocessing.mjs"]
    meta = {"years": years, "eia_year": EIA_YEAR, "nri_version": fema["nriVersion"], "retrieved": retrieved}
    (OUT_DIR / "data-sources.json").write_text(json.dumps(sources(meta), indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    print("wrote us-states.geojson, us-reference.json, data-sources.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
