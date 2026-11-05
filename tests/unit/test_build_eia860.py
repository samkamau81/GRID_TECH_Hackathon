"""Tests for scripts/build_eia860.py (stdlib unittest).

    python -I -m unittest tests/unit/test_build_eia860.py        # from the repository root
"""
import io
import json
import sys
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import build_eia860 as b  # noqa: E402

OUT = ROOT / "peak-power" / "data" / "processed" / "eia860-plants.json"

SHEET = """<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c></row>
<row r="2"><c r="A2" t="s"><v>1</v></c><c r="C2" t="s"><v>2</v></c><c r="D2" t="s"><v>3</v></c></row>
<row r="3"><c r="A3"><v>7</v></c><c r="C3" t="inlineStr"><is><t>Alpha</t></is></c><c r="D3"><v>12.5</v></c></row>
</sheetData></worksheet>"""


def make_xlsx():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("xl/sharedStrings.xml",
                   '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                   "<si><t>Title block</t></si><si><t>Plant Code</t></si>"
                   "<si><t>Plant Name</t></si><si><t>Nameplate Capacity (MW)</t></si></sst>")
        z.writestr("xl/workbook.xml",
                   '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                   'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                   '<sheets><sheet name="Operable" sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr("xl/_rels/workbook.xml.rels",
                   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
        z.writestr("xl/worksheets/sheet1.xml", SHEET)
    buf.seek(0)
    return buf


class MappingTests(unittest.TestCase):
    def test_groups(self):
        g = b.GROUPS
        cases = [("Natural Gas Fired Combined Cycle", "NG", "Gas"), ("x", "BFG", "Gas"),
                 ("Conventional Steam Coal", "BIT", "Coal"), ("x", "SUB", "Coal"),
                 ("Nuclear", "NUC", "Nuclear"), ("Conventional Hydroelectric", "WAT", "Hydro"),
                 ("Hydroelectric Pumped Storage", "WAT", "Hydro"), ("Onshore Wind Turbine", "WND", "Wind"),
                 ("Solar Photovoltaic", "SUN", "Solar"), ("Batteries", "MWH", "Battery"),
                 ("Batteries", "SUN", "Battery"), ("Landfill Gas", "LFG", "Other"),
                 ("Petroleum Liquids", "DFO", "Other"), ("Geothermal", "GEO", "Other"),
                 (None, None, "Other")]
        for tech, code, want in cases:
            self.assertEqual(g[b.group_index(tech, code)], want, (tech, code))

    def test_group_count(self):
        self.assertEqual(len(b.GROUPS), 8)


class XlsxTests(unittest.TestCase):
    def test_cell_types_and_header_search(self):
        x = b.Xlsx(make_xlsx())
        self.assertEqual(list(x.sheets), ["Operable"])
        rows = list(x.table("Operable"))
        self.assertEqual(rows, [{"Plant Code": 7.0, "Plant Name": "Alpha", "Nameplate Capacity (MW)": 12.5}])

    def test_col_num(self):
        self.assertEqual([b.col_num(c) for c in ("A1", "Z9", "AA3")], [0, 25, 26])


@unittest.skipUnless(OUT.exists(), "generated JSON not present")
class OutputShapeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        raw = OUT.read_bytes()
        assert not raw.startswith(b"\xef\xbb\xbf")
        cls.d = json.loads(raw.decode("utf-8"))

    def test_meta(self):
        m = self.d["meta"]
        for k in ("source", "url", "vintage", "groups", "units", "operating_status", "planned_status",
                  "plants", "operating_mw_by_group", "planned_mw_by_group", "notes"):
            self.assertIn(k, m)
        self.assertEqual(len(m["groups"]), 8)
        self.assertEqual(len(m["operating_mw_by_group"]), 8)
        self.assertEqual(len(m["planned_mw_by_group"]), 8)
        self.assertEqual(m["plants"], len(self.d["plants"]))

    def test_plants(self):
        for p in self.d["plants"]:
            self.assertEqual(len(p), 6)
            lat, lon, st, name, op, pl = p
            self.assertTrue(17 <= lat <= 72, p)
            self.assertTrue(-180 <= lon <= -60, p)
            self.assertIsInstance(st, str)
            self.assertIsInstance(name, str)
            for arr in (op, pl):
                self.assertEqual(len(arr), 8)
                self.assertTrue(all(isinstance(v, int) for v in arr))


if __name__ == "__main__":
    unittest.main()
