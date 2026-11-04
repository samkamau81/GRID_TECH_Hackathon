#!/usr/bin/env python3
"""Replay browser-library plans through the symposium packet's official checker.

    python scripts/verify_plan_library.py                 # a spread sample of plans
    python scripts/verify_plan_library.py --all           # every plan (slow: about 3 s each)
    python scripts/verify_plan_library.py --ids "20|W150S50|0|when_cheaper|cost" ...

The browser engine's hourly dispatch is exported in submission format (scripts/export_plan_dispatch.mjs), checked by the packet's own
check_submission.py (physical rules), and its common accounting is compared with the numbers stored in the library. A plan passes when the
checker accepts the dispatch and cost, CO2 and clean share agree within 0.05 %.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STARTER = ROOT / "data" / "Symposium_Packet" / "starter"
sys.path.insert(0, str(STARTER))
import check_submission as checker  # noqa: E402
import pandas as pd  # noqa: E402

TOL = 5e-4


def load_plans() -> list[dict]:
    text = (ROOT / "peak-power" / "js" / "data" / "scenarios.js").read_text(encoding="utf-8")
    return json.loads(text[text.index("= [") + 2:text.rindex("]") + 1])


def pick_sample(plans: list[dict], n: int) -> list[str]:
    """A deterministic spread: every opening month, mix, battery, policy and objective appears."""
    step = max(1, len(plans) // n)
    chosen = [p["id"] for p in plans[::step]]
    for attr in ("open", "mix", "battery", "policy", "mode"):
        for value in sorted({p[attr] for p in plans}, key=str):
            if not any(p[attr] == value and p["id"] in chosen for p in plans):
                chosen.append(next(p["id"] for p in plans if p[attr] == value))
    return list(dict.fromkeys(chosen))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--sample", type=int, default=24)
    ap.add_argument("--ids", nargs="*")
    args = ap.parse_args()
    plans = {p["id"]: p for p in load_plans()}
    ids = args.ids or (list(plans) if args.all else pick_sample(list(plans.values()), args.sample))
    failures = 0
    with tempfile.TemporaryDirectory() as tmp:
        # export in small batches so a failure is easy to attribute
        for i in range(0, len(ids), 8):
            batch = ids[i:i + 8]
            subprocess.run(["node", str(ROOT / "scripts" / "export_plan_dispatch.mjs"), tmp, *batch], check=True, capture_output=True)
            for pid in batch:
                folder = Path(tmp) / re.sub(r"[^\w.-]+", "_", pid)
                plan = plans[pid]
                try:
                    metrics = checker.score(json.loads((folder / "portfolio.json").read_text()), pd.read_csv(folder / "dispatch.csv"))
                except (ValueError, KeyError, TypeError, OverflowError) as exc:
                    failures += 1
                    print(f"FAIL {pid}: checker rejected the dispatch: {exc}")
                    continue
                pairs = [("cost", metrics["total_decision_cost_usd"], plan["total_decision_cost_usd"]),
                         ("co2", metrics["combined_operational_co2_t"], plan["combined_operational_co2_t"]),
                         ("clean", metrics["clean_energy_share"], plan["clean_energy_share"])]
                bad = [f"{k}: checker {a:.6g} vs library {b:.6g}" for k, a, b in pairs if abs(a - b) > TOL * max(abs(a), 1e-9) and abs(a - b) > 1e-3]
                if bad:
                    failures += 1
                    print(f"FAIL {pid}: " + "; ".join(bad))
                else:
                    print(f"ok   {pid}  cost ${metrics['total_decision_cost_usd']/1e6:.2f}M  co2 {metrics['combined_operational_co2_t']:.0f} t")
    print(f"\n{len(ids) - failures} of {len(ids)} plans passed the official checker" + ("" if not failures else f"; {failures} FAILED"))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
