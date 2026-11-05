"""Build a compact US power-plant dataset from the EIA-860 annual generator survey.

Source: EIA-860 2024 final release (U.S. Energy Information Administration)
    https://www.eia.gov/electricity/data/eia860/archive/xls/eia8602024.zip
Download (put it in a NEW EMPTY folder, never run anything from it):
    mkdir tmp/eia860_download
    curl -L -A "Mozilla/5.0" -o tmp/eia860_download/eia8602024.zip <URL above>
Rebuild (stdlib only; the argument may be the zip or an extracted folder):
    python -I scripts/build_eia860.py tmp/eia860_download/eia8602024.zip
Output: peak-power/data/processed/eia860-plants.json (override with --out).
"""
import argparse
import io
import json
import os
import re
import zipfile
import xml.etree.ElementTree as ET

URL = "https://www.eia.gov/electricity/data/eia860/archive/xls/eia8602024.zip"
GROUPS = ["Gas", "Coal", "Nuclear", "Hydro", "Wind", "Solar", "Battery", "Other"]
GAS = {"NG", "OG", "BFG", "PG"}
COAL = {"ANT", "BIT", "LIG", "SUB", "RC", "WC"}
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def group_index(tech, code):
    """Index into GROUPS for a generator (battery check first, then energy-source code)."""
    tech = (tech or "").lower()
    code = (code or "").strip().upper()
    if "batter" in tech:
        return 6
    if "pumped storage" in tech:
        return 3
    if code in GAS:
        return 0
    if code in COAL:
        return 1
    if code == "NUC":
        return 2
    if code == "WAT":
        return 3
    if code == "WND":
        return 4
    if code == "SUN":
        return 5
    return 7


def col_num(ref):
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(0):
        n = n * 26 + ord(ch) - 64
    return n - 1


class Xlsx:
    def __init__(self, source):
        self.z = zipfile.ZipFile(source)
        self.strings = []
        if "xl/sharedStrings.xml" in self.z.namelist():
            with self.z.open("xl/sharedStrings.xml") as f:
                for _, el in ET.iterparse(f):
                    if el.tag == M + "si":
                        self.strings.append("".join(t.text or "" for t in el.iter(M + "t")))
                        el.clear()
        wb = ET.fromstring(self.z.read("xl/workbook.xml"))
        rels = ET.fromstring(self.z.read("xl/_rels/workbook.xml.rels"))
        target = {r.get("Id"): r.get("Target") for r in rels}
        self.sheets = {}
        for s in wb.find("m:sheets", NS):
            t = target[s.get(R + "id")].lstrip("/")
            self.sheets[s.get("name")] = t if t.startswith("xl/") else "xl/" + t

    def rows(self, name):
        """Yield each row as a list of values (str / float / None)."""
        with self.z.open(self.sheets[name]) as f:
            for _, el in ET.iterparse(f):
                if el.tag != M + "row":
                    continue
                row = []
                for c in el.findall(M + "c"):
                    i = col_num(c.get("r"))
                    row.extend([None] * (i + 1 - len(row)))
                    t = c.get("t")
                    v = c.find(M + "v")
                    if t == "s" and v is not None:
                        val = self.strings[int(v.text)]
                    elif t == "inlineStr":
                        val = "".join(x.text or "" for x in c.iter(M + "t"))
                    elif t in ("str", "e", "b"):
                        val = v.text if v is not None else None
                    elif v is not None and v.text not in (None, ""):
                        val = float(v.text)
                    else:
                        val = None
                    row[i] = val
                yield row
                el.clear()

    def table(self, name, key="Plant Code"):
        """Yield dicts keyed by header, after locating the header row containing `key`."""
        header = None
        for row in self.rows(name):
            if header is None:
                if key in row:
                    header = [str(h).strip() if h is not None else "" for h in row]
                continue
            yield {h: (row[i] if i < len(row) else None) for i, h in enumerate(header) if h}


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def open_member(path, pattern):
    if os.path.isdir(path):
        for fn in sorted(os.listdir(path)):
            if re.search(pattern, fn):
                return Xlsx(os.path.join(path, fn))
    else:
        z = zipfile.ZipFile(path)
        for fn in sorted(z.namelist()):
            if re.search(pattern, fn):
                return Xlsx(io.BytesIO(z.read(fn)))
    raise SystemExit("missing file matching " + pattern)


def build(source, out, url=URL):
    plant_x = open_member(source, r"2___Plant_Y\d{4}\.xlsx$")
    gen_x = open_member(source, r"3_1_Generator_Y\d{4}\.xlsx$")
    m = re.search(r"(\d{4})", os.path.basename(url))
    vintage = m.group(1) if m else "2024"

    plants = {}
    for r in plant_x.table("Plant"):
        code = r.get("Plant Code")
        if code is None:
            continue
        plants[int(code)] = {
            "name": str(r.get("Plant Name") or ""), "state": str(r.get("State") or ""),
            "lat": num(r.get("Latitude")), "lon": num(r.get("Longitude")),
            "op": [0.0] * 8, "pl": [0.0] * 8}
    unknown = 0
    for sheet, key, only_op in (("Operable", "op", True), ("Proposed", "pl", False)):
        for r in gen_x.table(sheet):
            if only_op and str(r.get("Status") or "").strip() != "OP":
                continue
            code = r.get("Plant Code")
            mw = num(r.get("Nameplate Capacity (MW)"))
            if code is None or mw is None:
                continue
            p = plants.get(int(code))
            if p is None:
                unknown += 1
                continue
            code_src = r.get("Energy Source Code") or r.get("Energy Source 1")
            p[key][group_index(r.get("Technology"), code_src)] += mw

    def build_records(min_mw):
        recs, dropped = [], 0
        for p in plants.values():
            tot = sum(p["op"]) + sum(p["pl"])
            if tot < 0.5 or tot < min_mw:
                continue
            if p["lat"] is None or p["lon"] is None or (p["lat"] == 0 and p["lon"] == 0):
                dropped += 1
                continue
            name = p["name"] if sum(p["op"]) >= 50 else ""
            recs.append([round(p["lat"], 3), round(p["lon"], 3), p["state"], name,
                         [int(round(x)) for x in p["op"]], [int(round(x)) for x in p["pl"]]])
        recs.sort(key=lambda x: (x[2], x[0], x[1]))
        return recs, dropped

    notes = [
        "Nameplate capacity is not available headroom: it ignores outages, derates, fuel limits and interconnection.",
        "Supply side only; says nothing about load, transmission or whether a site can serve a data center.",
        "Alaska and Hawaii are included but not used by the continental-US map.",
        "Plants are aggregated by Plant Code; names kept only for plants with 50 MW or more operating.",
        "Planned MW covers every Proposed-sheet status (permitted, under construction, planned) and may never be built.",
    ]

    def encode(recs):
        op = [sum(r[4][i] for r in recs) for i in range(8)]
        pl = [sum(r[5][i] for r in recs) for i in range(8)]
        meta = {"source": "EIA-860 %s Annual Electric Generator Report (U.S. Energy Information Administration)" % vintage,
                "url": url, "vintage": vintage, "groups": GROUPS,
                "units": "MW nameplate (rounded to whole MW)",
                "operating_status": "Operable sheet, status OP only",
                "planned_status": "Proposed sheet, all statuses",
                "plants": len(recs), "operating_mw_by_group": op, "planned_mw_by_group": pl,
                "notes": notes}
        return json.dumps({"meta": meta, "plants": recs}, separators=(",", ":"), ensure_ascii=False)

    min_mw = 1
    recs, dropped = build_records(min_mw)
    text = encode(recs)
    if len(text.encode("utf-8")) > 1.2 * 1024 * 1024:
        min_mw = 5
        recs, dropped = build_records(min_mw)
        text = encode(recs)
        print("size over 1.2 MB: dropped plants below 5 MW total")
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    meta = json.loads(text)["meta"]
    print("plants kept: %d (min total MW cutoff %d)" % (len(recs), min_mw))
    print("dropped (no valid coordinates): %d; generators with unknown plant: %d" % (dropped, unknown))
    for g, o, p in zip(GROUPS, meta["operating_mw_by_group"], meta["planned_mw_by_group"]):
        print("  %-8s operating %9d MW   planned %9d MW" % (g, o, p))
    print("file size: %.1f KB" % (len(text.encode("utf-8")) / 1024))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("source", help="extracted EIA-860 folder or the zip file")
    ap.add_argument("--out", default="peak-power/data/processed/eia860-plants.json")
    ap.add_argument("--url", default=URL)
    a = ap.parse_args(argv)
    build(a.source, a.out, a.url)


if __name__ == "__main__":
    main()
