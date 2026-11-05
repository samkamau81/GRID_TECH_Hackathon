"""Build county outlines in latitude/longitude from the Prototype's Find-a-site county map.

The Prototype draws its 3,142 counties as SVG paths in a 975 x 610 pixel space. That space is the standard d3 "geoAlbersUsa" layout
(scale 1300, translate 487.5, 305), so the lower-48 outlines can be converted back to real coordinates with the closed-form inverse of the
Albers equal-area conic projection (parallels 29.5 and 45.5, rotation -96, centre -0.6, 38.7). Checked against known county centroids: within 0.2 px (~1 km).

Why: the Data Center Climate Explorer needs "which county is this point in?" and a county overlay, and it must use the SAME county shapes and
grades as the Prototype, not a second boundary source that could disagree.

Limits, shown in the interface: the outlines are generalised to the Prototype's pixel resolution (about 4.7 km per pixel), so a point within a few
kilometres of a county line can land in the neighbouring county. Alaska and Hawaii sit in the map as insets with their own projections and are left out.

    python -I scripts/build_county_outlines.py          # from the repository root; standard library only

Output: peak-power/data/processed/county-outlines.json
  { v, scale, note, c: { fips: [ ring, ... ] } }  each ring = [lon0, lat0, dlon1, dlat1, ...] in integer hundredths of a degree, delta-encoded.
"""
import json
import math
import os
import re
import sys

SRC = "peak-power/data/source/site-counties.full.js"
OUT = "peak-power/data/processed/county-outlines.json"
SCALE = 100            # hundredths of a degree (~1 km)
SKIP_STATES = {"02", "15"}   # Alaska, Hawaii: inset projections

K, TX, TY = 1300.0, 487.5, 305.0
P0, P1 = math.radians(29.5), math.radians(45.5)
N = (math.sin(P0) + math.sin(P1)) / 2
C = 1 + math.sin(P0) * (2 * N - math.sin(P0))
R0 = math.sqrt(C) / N


def _raw(lam, phi):
    r = math.sqrt(C - 2 * N * math.sin(phi)) / N
    return r * math.sin(lam * N), R0 - r * math.cos(lam * N)


CX, CY = _raw(math.radians(-0.6), math.radians(38.7))


def forward(lon, lat):
    x, y = _raw(math.radians(lon + 96), math.radians(lat))
    return TX + K * (x - CX), TY - K * (y - CY)


def inverse(px, py):
    x = (px - TX) / K + CX
    y = -(py - TY) / K + CY
    rr = R0 - y
    lam = math.atan2(x, rr) / N
    r = math.sqrt(x * x + rr * rr) * (1 if N > 0 else -1)
    phi = math.asin((C - (r * N) ** 2) / (2 * N))
    return math.degrees(lam) - 96, math.degrees(phi)


def rings(d):
    """Split an SVG path of M/L/Z commands into lists of (x, y) vertices."""
    out, cur = [], None
    for cmd, args in re.findall(r"([MLZ])([^MLZ]*)", d):
        if cmd == "M":
            cur = []
            out.append(cur)
        if cmd in "ML":
            nums = [float(v) for v in re.findall(r"-?\d+(?:\.\d+)?", args)]
            for i in range(0, len(nums) - 1, 2):
                cur.append((nums[i], nums[i + 1]))
    return [r for r in out if len(r) >= 3]


def encode(points):
    q = [(round(lon * SCALE), round(lat * SCALE)) for lon, lat in points]
    dedup = [q[0]]
    for p in q[1:]:
        if p != dedup[-1]:
            dedup.append(p)
    if len(dedup) < 3:
        return None
    flat = [dedup[0][0], dedup[0][1]]
    for a, b in zip(dedup, dedup[1:]):
        flat += [b[0] - a[0], b[1] - a[1]]
    return flat


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)
    text = open(SRC, encoding="utf-8").read()
    data = json.loads(text[text.index("{"): text.rindex("}") + 1])
    out, skipped, n_rings = {}, 0, 0
    for c in data["c"]:
        if c["f"][:2] in SKIP_STATES:
            skipped += 1
            continue
        enc = []
        for ring in rings(c["d"]):
            e = encode([inverse(x, y) for x, y in ring])
            if e:
                enc.append(e)
        if enc:
            out[c["f"]] = enc
            n_rings += len(enc)
    doc = {"v": 1, "scale": SCALE,
           "note": "Generalised county outlines from the Prototype's county map (about 4.7 km resolution). Not survey-grade; do not use within a few km of a county line.",
           "c": out}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        json.dump(doc, f, separators=(",", ":"))
    size = os.path.getsize(OUT)
    print("counties: %d  rings: %d  skipped (AK/HI): %d  size: %.0f KB" % (len(out), n_rings, skipped, size / 1024))
    # self-check: forward(inverse(p)) must return p
    for p in [(500.0, 300.0), (816.3, 265.2), (104.7, 51.1)]:
        q = forward(*inverse(*p))
        assert abs(q[0] - p[0]) < 1e-6 and abs(q[1] - p[1]) < 1e-6, (p, q)
    print("round-trip check passed")


if __name__ == "__main__":
    sys.exit(main())
