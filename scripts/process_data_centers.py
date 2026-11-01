#!/usr/bin/env python3
"""Turn data/data_centers.zip into the browser-ready files used by the Data Center Explorer.

    python scripts/process_data_centers.py            # from the repository root

Reads the ZIP in place (it is never modified or extracted), validates and normalises the records, and writes

    peak-power/data/processed/data-centers.geojson   what the page loads
    peak-power/data/processed/data-centers.report.json   quality report: exclusions, fill rates, checks

Standard library only. The output is deterministic: running it twice on the same ZIP gives identical files.

Nothing is invented. A record is dropped only if its coordinates are missing or invalid, and every drop is listed
in the report. The one derived attribute is the US state of records that have none: it is looked up from the
record's own coordinates in US Census state boundaries, marked "inferred" on the record, and checked against the
records whose state was tagged in the source (the agreement rate is in the report). Use --no-state-inference to
switch it off. No geocoding is needed because every record already has coordinates.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import sys
import urllib.request
import zipfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ZIP = ROOT / "data" / "data_centers.zip"
DEFAULT_OUT = ROOT / "peak-power" / "data" / "processed" / "data-centers.geojson"
CACHE_DIR = Path(__file__).resolve().parent / ".cache"

# US Census 1:500,000 state boundaries (public domain), downloaded once and cached.
BOUNDARY_URL = "https://eric.clst.org/assets/wiki/uploads/Stuff/gz_2010_us_040_00_500k.json"
BOUNDARY_FILE = "us-states-500k.geojson"
MIN_INFERENCE_AGREEMENT = 0.95  # inference is only used if it reproduces at least this share of the tagged states

MAIN_CSV, TOTALS_CSV, SUMMARY_CSV = "data_centers.csv", "reported_totals.csv", "country_summary.csv"

STATE_CODES = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA", "Colorado": "CO",
    "Connecticut": "CT", "Delaware": "DE", "District of Columbia": "DC", "Florida": "FL", "Georgia": "GA",
    "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
    "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA",
    "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS", "Missouri": "MO", "Montana": "MT",
    "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM",
    "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
    "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA",
    "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY", "Puerto Rico": "PR",
}
VALID_US_CODES = set(STATE_CODES.values())


def read_zip_csv(z: zipfile.ZipFile, name: str) -> list[dict[str, str]]:
    with z.open(name) as fh:
        text = io.TextIOWrapper(fh, encoding="utf-8-sig", newline="")
        return [{k: (v or "").strip() for k, v in row.items()} for row in csv.DictReader(text)]


def to_float(value: str):
    try:
        x = float(value)
    except (TypeError, ValueError):
        return None
    return x if x == x and abs(x) != float("inf") else None


def clean_number(value: str):
    """Numeric attribute as int/float, or None if absent or not a plain number (never guessed)."""
    x = to_float(value)
    if x is None or x < 0:
        return None
    return int(x) if x == int(x) else round(x, 2)


# ---------------------------------------------------------------- state lookup from coordinates
def load_boundaries(refresh: bool = False):
    CACHE_DIR.mkdir(exist_ok=True)
    path = CACHE_DIR / BOUNDARY_FILE
    if refresh or not path.exists():
        print(f"Downloading US state boundaries from {BOUNDARY_URL}", file=sys.stderr)
        req = urllib.request.Request(BOUNDARY_URL, headers={"User-Agent": "peak-power-data-processing/1.0"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            path.write_bytes(resp.read())
    raw = path.read_bytes()
    gj = json.loads(raw.decode("utf-8", errors="replace"))
    states = []
    for feat in gj["features"]:
        code = STATE_CODES.get(feat["properties"]["NAME"])
        if not code:
            continue
        geom = feat["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        parts = []
        for poly in polys:
            xs = [p[0] for p in poly[0]]
            ys = [p[1] for p in poly[0]]
            parts.append((min(xs), min(ys), max(xs), max(ys), poly))
        states.append((code, parts))
    return states, hashlib.sha256(raw).hexdigest()


def in_ring(x: float, y: float, ring) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def state_at(lon: float, lat: float, states) -> str | None:
    """State whose boundary contains the point; None if it falls outside every state (e.g. offshore)."""
    for code, parts in states:
        for x0, y0, x1, y1, poly in parts:
            if x0 <= lon <= x1 and y0 <= lat <= y1 and in_ring(lon, lat, poly[0]) \
                    and not any(in_ring(lon, lat, hole) for hole in poly[1:]):
                return code
    return None


# ---------------------------------------------------------------- main
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zip", type=Path, default=DEFAULT_ZIP)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--no-state-inference", action="store_true", help="do not derive missing US states from coordinates")
    ap.add_argument("--refresh-boundaries", action="store_true", help="re-download the state boundary file")
    args = ap.parse_args()

    with zipfile.ZipFile(args.zip) as z:
        names = z.namelist()
        for need in (MAIN_CSV, TOTALS_CSV):
            if need not in names:
                sys.exit(f"{args.zip} does not contain {need} (found: {names})")
        zip_sha = hashlib.sha256(args.zip.read_bytes()).hexdigest()
        csv_sha = hashlib.sha256(z.read(MAIN_CSV)).hexdigest()
        rows = read_zip_csv(z, MAIN_CSV)
        totals = read_zip_csv(z, TOTALS_CSV)
        summary = read_zip_csv(z, SUMMARY_CSV) if SUMMARY_CSV in names else []

    needed = {"osm_type", "osm_id", "latitude", "longitude", "country", "country_iso2", "state", "city", "facility_kind"}
    missing_cols = needed - set(rows[0].keys())
    if missing_cols:
        sys.exit(f"{MAIN_CSV} is missing columns: {sorted(missing_cols)}")

    # ---- validate: drop only records that cannot be placed on a map, and say why
    exclusions, seen, kept = [], set(), []
    for r in rows:
        rid = f"{r['osm_type']}/{r['osm_id']}"
        lat, lon = to_float(r["latitude"]), to_float(r["longitude"])
        reason = None
        if lat is None or lon is None:
            reason = "missing or non-numeric coordinates"
        elif not (-90 <= lat <= 90 and -180 <= lon <= 180):
            reason = "coordinates out of range"
        elif lat == 0 and lon == 0:
            reason = "coordinates are exactly 0,0"
        elif rid in seen:
            reason = "duplicate OpenStreetMap id"
        if reason:
            exclusions.append({"id": rid, "name": r["name"], "reason": reason})
            continue
        seen.add(rid)
        r["_id"], r["_lat"], r["_lon"] = rid, lat, lon
        kept.append(r)

    # ---- normalise US state values (full names to postal codes); unknown spellings are kept out, not guessed
    state_notes = Counter()
    for r in kept:
        s = r["state"]
        if r["country_iso2"] == "US" and s:
            code = STATE_CODES.get(s, s.upper() if s.upper() in VALID_US_CODES else None)
            if code != s:
                state_notes["normalised full state name to code" if code else "unrecognised US state value dropped"] += 1
            r["state"] = code or ""

    # ---- derive missing US states from coordinates, validated against the tagged ones
    inference = {"enabled": False}
    if not args.no_state_inference:
        try:
            states, boundary_sha = load_boundaries(args.refresh_boundaries)
            tagged = [r for r in kept if r["country_iso2"] == "US" and r["state"]]
            agree = sum(1 for r in tagged if state_at(r["_lon"], r["_lat"], states) == r["state"])
            outside = sum(1 for r in tagged if state_at(r["_lon"], r["_lat"], states) is None)
            rate = agree / len(tagged) if tagged else 0
            inference = {"enabled": rate >= MIN_INFERENCE_AGREEMENT, "boundary_source": BOUNDARY_URL,
                         "boundary_sha256": boundary_sha, "validated_against_tagged": len(tagged),
                         "agreed_with_tag": agree, "tagged_outside_any_boundary": outside,
                         "agreement_rate": round(rate, 4), "minimum_required": MIN_INFERENCE_AGREEMENT}
            if inference["enabled"]:
                n_inferred = n_unresolved = 0
                for r in kept:
                    if r["country_iso2"] == "US" and not r["state"]:
                        code = state_at(r["_lon"], r["_lat"], states)
                        if code:
                            r["state"], r["_state_src"] = code, "inferred"
                            n_inferred += 1
                        else:
                            n_unresolved += 1
                inference.update(inferred=n_inferred, unresolved_left_blank=n_unresolved)
            else:
                print(f"State inference NOT applied: agreement {rate:.1%} is below {MIN_INFERENCE_AGREEMENT:.0%}", file=sys.stderr)
        except Exception as exc:  # network or parse problem: carry on without inference, and say so
            inference = {"enabled": False, "error": f"{type(exc).__name__}: {exc}"}
            print(f"State inference skipped: {inference['error']}", file=sys.stderr)

    # ---- build features
    def feature(r):
        props = {
            "id": r["_id"], "name": r["name"], "nameEn": r["name_en"], "operator": r["operator"], "owner": r["owner"],
            "kind": r["facility_kind"], "country": r["country"], "iso2": r["country_iso2"], "region": r["continent"],
            "state": r["state"], "stateSrc": (r.get("_state_src") or "tagged") if r["state"] else "",
            "city": r["city"], "postcode": r["postcode"], "street": r["street"],
            "footprintM2": clean_number(r["footprint_area_m2"]), "levels": clean_number(r["building_levels"]),
            "heightM": clean_number(r["height_m"]), "startDate": r["start_date"], "website": r["website"],
            "edited": r["osm_last_edited"],
        }
        props = {k: v for k, v in props.items() if v not in ("", None)}
        return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [r["_lon"], r["_lat"]]}, "properties": props}

    features = [feature(r) for r in kept]

    # ---- reported totals (independent tracker figures, for context only)
    # The file holds more than one snapshot per country; keep the most recent as_of ("2026-03" sorts after "2026-02-18").
    reported = {}
    for t in totals:
        n = clean_number(t["reported_facilities"])
        iso = t["country_iso2"]
        if iso and n is not None and (iso not in reported or t["as_of"] > reported[iso]["asOf"]):
            reported[iso] = {"facilities": n, "asOf": t["as_of"], "tracker": t["tracker"],
                             "publishedBy": t["published_by"], "sourceUrl": t["source_url"]}

    # ---- integrity cross-checks
    by_iso = Counter(r["country_iso2"] for r in kept if r["country_iso2"])
    summary_mismatch = [{"iso2": s["country_iso2"], "summary": int(s["osm_facilities"]), "processed": by_iso.get(s["country_iso2"], 0)}
                        for s in summary if int(s["osm_facilities"]) != by_iso.get(s["country_iso2"], 0)]
    url_mismatch = sum(1 for r in kept if r["osm_url"] != f"https://www.openstreetmap.org/{r['_id']}")
    coord_groups = Counter((r["_lat"], r["_lon"]) for r in kept)
    shared_coords = [{"coordinates": [lon, lat], "records": n} for (lat, lon), n in coord_groups.items() if n > 1]

    us = [f for f in features if f["properties"].get("iso2") == "US"]
    fill = {k: sum(1 for r in kept if r[k]) for k in
            ("name", "operator", "owner", "country", "state", "city", "street", "footprint_area_m2", "website")}
    stats = {
        "total": len(features), "us": len(us),
        "countries": len({f["properties"]["iso2"] for f in features if "iso2" in f["properties"]}),
        "usStates": len({f["properties"]["state"] for f in us if "state" in f["properties"]}),
        "usStatesTaggedOnly": len({f["properties"]["state"] for f in us if f["properties"].get("stateSrc") == "tagged"}),
        "withoutCountry": sum(1 for f in features if "iso2" not in f["properties"]),
    }
    metadata = {
        "title": "Global data center locations",
        "source": "OpenStreetMap-derived extract supplied in data_centers.zip",
        "sourceZipSha256": zip_sha, "sourceCsvSha256": csv_sha,
        "stats": stats,
        "stateInference": {k: inference.get(k) for k in ("enabled", "agreement_rate", "validated_against_tagged", "inferred", "unresolved_left_blank")},
        "reportedTotals": reported,
        "notes": ["Counts are mapped OpenStreetMap features, not a complete census of data centers.",
                  "The dataset has no capacity or power fields; footprintM2 is mapped building footprint only."],
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"type": "FeatureCollection", "metadata": metadata, "features": features}, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write("\n")

    report = {
        "source_zip": str(args.zip.relative_to(ROOT)) if args.zip.is_relative_to(ROOT) else str(args.zip),
        "source_sha256": zip_sha, "source_files": list(names),
        "rows_read": len(rows), "records_written": len(features), "excluded": exclusions,
        "stats": stats, "field_fill_counts": fill, "state_inference": inference, "state_normalisation": dict(state_notes),
        "facility_kinds": dict(Counter(f["properties"]["kind"] for f in features)),
        "records_without_country": [{"id": f["properties"]["id"], "name": f["properties"].get("name", "")}
                                    for f in features if "iso2" not in f["properties"]],
        "records_sharing_identical_coordinates": shared_coords,
        "country_summary_csv_mismatches": summary_mismatch, "osm_url_not_derivable_from_id": url_mismatch,
        "reported_totals_countries": len(reported),
        "geocoding": "not needed: every record has valid coordinates",
    }
    rp = args.out.with_name("data-centers.report.json")
    rp.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")

    print(f"read {len(rows)} rows -> wrote {len(features)} records ({len(exclusions)} excluded) to {args.out}")
    print(f"US: {stats['us']} records, {stats['usStates']} states ({stats['usStatesTaggedOnly']} from source tags); countries: {stats['countries']}")
    if inference.get("enabled"):
        print(f"state inference: {inference['inferred']} derived, {inference['unresolved_left_blank']} left blank; "
              f"agreement with {inference['validated_against_tagged']} tagged records = {inference['agreement_rate']:.1%}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
