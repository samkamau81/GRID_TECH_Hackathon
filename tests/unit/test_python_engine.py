"""The Python backend (data/Symposium_Packet/team_app/engine.py) against the packet's own checker.

    python -m unittest tests/unit/test_python_engine.py        # from the repository root
"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "data" / "Symposium_Packet" / "team_app"))
import engine  # noqa: E402


def run(caps, policy="flexible", objective="cost"):
    portfolio = engine._portfolio(20, 0, caps)
    ctx = engine.checker.prepare_inputs(portfolio)
    dispatch = engine._dispatch(ctx, portfolio, policy, objective)
    engine.checker.check(portfolio, dispatch, ctx)          # raises if any packet rule is broken
    return portfolio, ctx, dispatch, engine.checker.score(portfolio, dispatch)


class PacketTests(unittest.TestCase):
    def test_packet_is_v2(self):
        self.assertEqual(engine.checker.options.set_index("option_id").loc["battery_4h", "max_mw"], 53)
        self.assertEqual(engine.checker.options.set_index("option_id").loc["wind", "payment_usd_per_mwh"], 45)
        self.assertIn("V2", engine.PACKET_LABEL)

    def test_battery_dispatch_passes_the_official_checker(self):
        _, ctx, d, m = run({"gas_turbine": 25, "wind": 100, "utility_solar": 50, "battery_4h": 30})
        self.assertTrue(m["physical_checks_passed"])
        self.assertGreater(d.battery_4h_discharge_mw.sum(), 0)
        self.assertLessEqual(abs(d.battery_4h_soc_mwh.iloc[-1]), 1e-9)

    def test_grid_charging_earns_no_clean_credit(self):
        _, _, d, _ = run({"gas_turbine": 25, "battery_4h": 30})      # no clean contracts at all
        self.assertGreater(d.battery_4h_charge_mw.sum(), 0, "grid charging should happen")
        self.assertEqual(d.battery_4h_clean_charge_mw.sum(), 0)
        _, _, _, m = run({"gas_turbine": 25, "battery_4h": 30})
        self.assertEqual(m["clean_energy_share"], 0)

    def test_clean_charge_never_exceeds_total_charge(self):
        _, _, d, _ = run({"gas_turbine": 25, "wind": 150, "utility_solar": 50, "battery_4h": 15})
        self.assertTrue((d.battery_4h_clean_charge_mw <= d.battery_4h_charge_mw + 1e-9).all())

    def test_no_battery_columns_are_zero(self):
        _, _, d, _ = run({"gas_turbine": 25})
        self.assertEqual(d.battery_4h_charge_mw.sum() + d.battery_4h_discharge_mw.sum() + d.battery_4h_soc_mwh.sum(), 0)

    def test_over_the_land_limit_is_rejected_by_the_checker(self):
        with self.assertRaises(ValueError):
            run({"gas_turbine": 25, "battery_4h": 53})


if __name__ == "__main__":
    unittest.main()
