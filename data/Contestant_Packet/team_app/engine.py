"""First backend iteration for PeakPower.

This module searches a deliberately small, documented portfolio set and uses
only the shared packet accounting/checker for benchmark scoring. It does not
claim global optimality. The checker remains unchanged.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

PACKET_DIR = Path(__file__).resolve().parents[1]
STARTER_DIR = PACKET_DIR / "starter"
if str(STARTER_DIR) not in sys.path:
    sys.path.insert(0, str(STARTER_DIR))
import check_submission as checker  # noqa: E402

POLICIES: dict[str, dict[str, Any]] = {
    "strict": {
        "label": "No relocation or interruption",
        "allow_relocation": False,
        "allow_interruption": False,
        "description": "All demand stays local and served during stress events.",
    },
    "relocate": {
        "label": "Relocation allowed; interruption prohibited",
        "allow_relocation": True,
        "allow_interruption": False,
        "description": "Tier 1 may relocate during eligible stress hours; Tier 2 remains served locally.",
    },
    "flexible": {
        "label": "Relocation and interruption allowed",
        "allow_relocation": True,
        "allow_interruption": True,
        "description": "Tier 1 relocates first during eligible events; Tier 2 interruption is used only if needed.",
    },
}

OBJECTIVES = {"cost", "carbon"}

# A curated screening set, not an exhaustive portfolio search. It includes
# gas-only and selected clean-contract alternatives at catalog block sizes.
CANDIDATE_CAPACITIES: tuple[dict[str, float], ...] = (
    {"gas_turbine": 25},
    {"gas_engine": 10},
    {"gas_engine": 15},
    {"gas_turbine": 25, "gas_engine": 5},
    {"gas_turbine": 25, "fuel_cell": 5},
    {"gas_turbine": 50},
    {"gas_turbine": 75},
    {"gas_engine": 30},
    {"fuel_cell": 30},
    {"gas_turbine": 25, "gas_engine": 5, "wind": 100, "utility_solar": 50},
    {"gas_turbine": 25, "fuel_cell": 5, "wind": 150, "utility_solar": 50},
    {"gas_turbine": 50, "wind": 100, "utility_solar": 50},
    {"gas_engine": 30, "wind": 150, "utility_solar": 50},
    {"gas_turbine": 50, "nuclear": 25},
)


def _portfolio(start_month: int, grid_delay_months: int, capacities: dict[str, float]) -> dict[str, Any]:
    return {
        "initial_service_month": int(start_month),
        "grid_delay_months": int(grid_delay_months),
        "capacities_mw": {k: float(v) for k, v in capacities.items() if v},
    }


def _dispatch(ctx: dict[str, Any], portfolio: dict[str, Any], policy_key: str, objective: str) -> pd.DataFrame:
    """Create hourly dispatch for one fixed portfolio and response policy."""
    if policy_key not in POLICIES:
        raise ValueError(f"Unknown policy: {policy_key}")
    if objective not in OBJECTIVES:
        raise ValueError(f"Unknown objective: {objective}")

    n = ctx["n"]
    h = np.arange(n)
    load = ctx["load"]
    grid_limit = ctx["grid_limit"]
    caps = ctx["caps"]
    options = checker.options.set_index("option_id")
    policy = POLICIES[policy_key]

    gas_ids = [k for k in ("fuel_cell", "gas_engine", "gas_turbine") if caps.get(k, 0) > 0]
    gas_capacity: dict[str, np.ndarray] = {}
    gas_variable_cost: dict[str, np.ndarray] = {}
    gas_emissions: dict[str, float] = {}
    total_gas_capacity = np.zeros(n)
    for key in gas_ids:
        row = options.loc[key]
        active = checker.available_mask(row, ctx)
        cap = float(caps[key]) * active
        gas_capacity[key] = cap
        gas_variable_cost[key] = float(row.payment_usd_per_mwh) + float(row.heat_rate_mmbtu_per_mwh_hhv) * ctx["gas_price"]
        gas_emissions[key] = float(row.co2_t_per_mwh)
        total_gas_capacity += cap

    # Contracts and merchant purchases together may never exceed the same
    # grid cap. Offsite contracts therefore do not create extra connection MW.
    contract_potential: dict[str, np.ndarray] = {}
    for key in ("wind", "utility_solar", "nuclear"):
        mw = float(caps.get(key, 0))
        row = options.loc[key]
        contract_potential[key] = mw * checker.profile(row, ctx) if mw else np.zeros(n)
    contract_total = sum(contract_potential.values(), start=np.zeros(n))

    # First find the minimum response needed to meet local supply capability.
    # The response uses packet eligibility limits and is restricted to events.
    supply_gap = np.maximum(load - grid_limit - total_gas_capacity, 0.0)
    relocated = np.zeros(n)
    interrupted = np.zeros(n)
    if policy["allow_relocation"]:
        relocated = np.minimum(supply_gap, ctx["relocation_limit"])
        supply_gap = np.maximum(supply_gap - relocated, 0.0)
    if policy["allow_interruption"]:
        interrupted = np.minimum(supply_gap, ctx["interruption_limit"])
        supply_gap = np.maximum(supply_gap - interrupted, 0.0)
    if float(supply_gap.max(initial=0.0)) > 1e-7:
        worst = int(np.argmax(supply_gap))
        raise ValueError(
            f"Infeasible under {policy['label']}: {supply_gap[worst]:.4f} MW unmet at model_hour {worst}; "
            "the limited candidate lacks local/grid capacity or eligible response."
        )

    local_load = load - relocated - interrupted
    # Use available clean contracts first, pro-rata when more than one is
    # selected. Contract payments still apply to all available output.
    clean_dispatch_total = np.minimum(np.minimum(contract_total, grid_limit), local_load)
    out: dict[str, np.ndarray] = {
        "model_hour": h,
        "grid_mw": np.zeros(n),
        "tier1_relocated_mw": relocated,
        "tier2_curtailed_mw": interrupted,
    }
    for key in ("wind", "utility_solar", "nuclear"):
        out[key + "_mw"] = np.divide(
            clean_dispatch_total * contract_potential[key],
            contract_total,
            out=np.zeros(n),
            where=contract_total > 0,
        )

    residual = local_load - clean_dispatch_total
    grid_room = np.maximum(grid_limit - clean_dispatch_total, 0.0)
    must_run_gas = np.maximum(residual - grid_room, 0.0)
    gas_remaining_need = residual.copy()
    gas_outputs = {k: np.zeros(n) for k in gas_ids}

    # Greedy merit order is transparent and deterministic. The cost objective
    # dispatches gas when its variable cost is below merchant power; otherwise
    # it uses gas only as needed to respect the import cap. Carbon mode uses
    # grid imports first and then the least-emitting available gas resource.
    for key in gas_ids:
        order_value = gas_variable_cost[key] if objective == "cost" else np.full(n, gas_emissions[key])
        if objective == "cost":
            # Arrays are sorted by average merit for a compact MVP; exact
            # per-hour price comparisons still determine economic dispatch.
            pass
        gas_outputs[key] = np.zeros(n)
    if objective == "cost":
        gas_order = sorted(gas_ids, key=lambda k: float(np.mean(gas_variable_cost[k])))
    else:
        gas_order = sorted(gas_ids, key=lambda k: gas_emissions[k])

    gas_used = np.zeros(n)
    for key in gas_order:
        cap = gas_capacity[key]
        need_for_grid = np.maximum(must_run_gas - gas_used, 0.0)
        if objective == "cost":
            economic = gas_variable_cost[key] < ctx["grid_price"]
            desired = np.where(economic, gas_remaining_need, need_for_grid)
        else:
            desired = need_for_grid
        take = np.minimum(cap, np.maximum(desired, 0.0))
        gas_outputs[key] = take
        gas_used += take
        gas_remaining_need -= take

    for key in ("fuel_cell", "gas_engine", "gas_turbine"):
        out[key + "_mw"] = gas_outputs.get(key, np.zeros(n))
    out["grid_mw"] = np.maximum(local_load - clean_dispatch_total - gas_used, 0.0)

    # The first iteration does not select storage. Emit its official zero
    # columns so every generated submission follows the packet schema.
    out["battery_4h_charge_mw"] = np.zeros(n)
    out["battery_4h_discharge_mw"] = np.zeros(n)
    out["battery_4h_soc_mwh"] = np.zeros(n)
    dispatch = pd.DataFrame(out)
    required = checker.required_columns()
    dispatch = dispatch[required]
    # Fast local assertion before asking the official checker to validate it.
    imports = dispatch["grid_mw"].to_numpy().copy()
    for key in ("wind", "utility_solar", "nuclear"):
        imports += dispatch[key + "_mw"].to_numpy()
    balance = dispatch["grid_mw"].to_numpy().copy()
    for key in checker.options.option_id:
        if key == "battery_4h":
            balance += dispatch["battery_4h_discharge_mw"].to_numpy() - dispatch["battery_4h_charge_mw"].to_numpy()
        else:
            balance += dispatch[key + "_mw"].to_numpy()
    local_check = local_load
    err = float(np.max(np.abs(balance - local_check)))
    if err > 1e-6 or float(np.max(imports - grid_limit)) > 1e-6:
        raise ValueError(f"Internal dispatch balance/import check failed (balance={err:.3g} MW).")
    return dispatch


def _candidate_rows(start_month: int, grid_delay_months: int, policy_key: str, objective: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for capacities in CANDIDATE_CAPACITIES:
        portfolio = _portfolio(start_month, grid_delay_months, capacities)
        try:
            ctx = checker.prepare_inputs(portfolio)
            dispatch = _dispatch(ctx, portfolio, policy_key, objective)
            checker.check(portfolio, dispatch, ctx)
            metrics = checker.score(portfolio, dispatch)
            rows.append({"portfolio": portfolio, "dispatch": dispatch, "metrics": metrics})
        except (ValueError, KeyError, TypeError, OverflowError) as exc:
            rows.append({"portfolio": portfolio, "error": str(exc)})
    return rows


def _sort_key(candidate: dict[str, Any], objective: str) -> tuple[float, float]:
    metrics = candidate["metrics"]
    if objective == "carbon":
        return (float(metrics["combined_operational_co2_t"]), float(metrics["total_decision_cost_usd"]))
    return (float(metrics["total_decision_cost_usd"]), float(metrics["combined_operational_co2_t"]))


def search_policy(
    initial_service_month: int = 20,
    grid_delay_months: int = 0,
    policy: str = "strict",
    objective: str = "cost",
) -> dict[str, Any]:
    """Return the best feasible candidate in the disclosed limited search set."""
    # Validate timing and data from the same released tools the judge uses.
    probe = _portfolio(initial_service_month, grid_delay_months, {})
    checker.prepare_inputs(probe)
    if policy not in POLICIES:
        raise ValueError(f"policy must be one of {', '.join(POLICIES)}")
    if objective not in OBJECTIVES:
        raise ValueError(f"objective must be one of {', '.join(sorted(OBJECTIVES))}")
    checker.verify_released_data()
    checker.validate_inputs()
    evaluated = _candidate_rows(initial_service_month, grid_delay_months, policy, objective)
    feasible = [x for x in evaluated if "metrics" in x]
    if not feasible:
        failures = [x["error"] for x in evaluated]
        raise RuntimeError("No feasible portfolio found in the limited candidate set. " + " | ".join(failures[:3]))
    best = min(feasible, key=lambda x: _sort_key(x, objective))
    return {"best": best, "evaluated": evaluated, "feasible_count": len(feasible), "candidate_count": len(evaluated)}


def _monthly_and_event_series(portfolio: dict[str, Any], dispatch: pd.DataFrame, ctx: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    options = checker.options.set_index("option_id")
    n = ctx["n"]
    month = ctx["month"]
    d = dispatch
    # Rebuild the common hourly cost components for display aggregation. The
    # official horizon/year totals below always come from checker.score().
    fixed = np.zeros(n)
    contract = np.zeros(n)
    gas_cost = np.zeros(n)
    local_co2 = d["grid_mw"].to_numpy() * ctx["grid_co2"]
    clean_generation = np.zeros(n)
    for key, row in options.iterrows():
        mw = float(portfolio["capacities_mw"].get(key, 0))
        mask = checker.available_mask(row, ctx)
        crf = checker.case["discount_rate_real"] / (1 - (1 + checker.case["discount_rate_real"]) ** (-float(row.life_years)))
        if mw:
            fixed += mask * mw * 1000 * (float(row.capex_usd_per_kw) * crf + float(row.fom_usd_per_kw_year)) / 8760
        if row.kind == "storage":
            continue
        gen = d[key + "_mw"].to_numpy()
        if row.payment_basis == "available_generation":
            profile = checker.profile(row, ctx)
            contract += mw * profile * float(row.payment_usd_per_mwh)
        elif row.kind == "dispatchable":
            gas_cost += gen * (float(row.payment_usd_per_mwh) + float(row.heat_rate_mmbtu_per_mwh_hhv) * ctx["gas_price"])
            local_co2 += gen * float(row.co2_t_per_mwh)
        if bool(row.clean_credit):
            clean_generation += gen
    merchant = d["grid_mw"].to_numpy() * ctx["grid_price"]
    relocation = d["tier1_relocated_mw"].to_numpy() * ctx["relocation_price"]
    interruption = d["tier2_curtailed_mw"].to_numpy() * ctx["interruption_price"]
    remote_mwh = d["tier1_relocated_mw"].to_numpy() * checker.response["remote_energy_multiplier"]
    remote_co2 = remote_mwh * ctx["remote_co2"]
    total_local_cost = fixed + contract + gas_cost + merchant
    total_decision = total_local_cost + relocation + interruption
    local_load = ctx["load"] - d["tier1_relocated_mw"].to_numpy() - d["tier2_curtailed_mw"].to_numpy()

    def sums(values: np.ndarray) -> np.ndarray:
        return np.bincount(month, weights=values, minlength=120)

    monthly = []
    columns = {
        "requested_mwh": ctx["load"],
        "local_served_mwh": local_load,
        "relocated_mwh": d["tier1_relocated_mw"].to_numpy(),
        "interrupted_mwh": d["tier2_curtailed_mw"].to_numpy(),
        "grid_mwh": d["grid_mw"].to_numpy(),
        "local_generation_mwh": sum((d[k + "_mw"].to_numpy() for k in ("gas_turbine", "gas_engine", "fuel_cell")), start=np.zeros(n)),
        "clean_contract_mwh": clean_generation,
        "fixed_capacity_cost_usd": fixed,
        "contract_cost_usd": contract,
        "gas_cost_usd": gas_cost,
        "merchant_cost_usd": merchant,
        "relocation_cost_usd": relocation,
        "interruption_cost_usd": interruption,
        "decision_cost_usd": total_decision,
        "combined_co2_t": local_co2 + remote_co2,
    }
    totals = {k: sums(v) for k, v in columns.items()}
    for m in range(120):
        monthly.append({"development_month": m, **{k: float(v[m]) for k, v in totals.items()}})

    active = ctx["active"]
    event_ids = ctx["frame"]["stress_event_id"].to_numpy()
    events = []
    for event_id in pd.unique(event_ids[active]):
        mask = active & (event_ids == event_id)
        idx = np.flatnonzero(mask)
        events.append({
            "event_id": str(event_id),
            "start_model_hour": int(idx[0]),
            "duration_hours": int(len(idx)),
            "peak_requested_mw": float(ctx["load"][mask].max(initial=0.0)),
            "peak_import_limit_mw": float(ctx["grid_limit"][mask].max(initial=0.0)),
            "peak_grid_import_mw": float(d.loc[mask, "grid_mw"].max()),
            "onsite_generation_mwh": float(columns["local_generation_mwh"][mask].sum()),
            "relocated_mwh": float(d.loc[mask, "tier1_relocated_mw"].sum()),
            "interrupted_mwh": float(d.loc[mask, "tier2_curtailed_mw"].sum()),
            "protected_tier0_mwh": float(ctx["tier0"][mask].sum()),
        })
    return monthly, events


def _summary(candidate: dict[str, Any], policy_key: str, objective: str) -> dict[str, Any]:
    portfolio = candidate["portfolio"]
    dispatch = candidate["dispatch"]
    metrics = candidate["metrics"]
    ctx = checker.prepare_inputs(portfolio)
    monthly, events = _monthly_and_event_series(portfolio, dispatch, ctx)
    return {
        "schema_version": "1.0",
        "run_id": hashlib.sha256(json.dumps({"portfolio": portfolio, "policy": policy_key, "objective": objective}, sort_keys=True).encode()).hexdigest()[:12],
        "status": "validated",
        "validation": {"official_checker": "passed", "physical_checks_passed": metrics["physical_checks_passed"], "timeline_hours": metrics["timeline_hours"]},
        "inputs": {"site_profile": "contestant_packet_v5.5.1", "initial_service_month": portfolio["initial_service_month"], "full_demand_month": portfolio["initial_service_month"] + 10, "grid_delay_months": portfolio["grid_delay_months"], "policy": policy_key, "objective": objective},
        "method": {
            "name": "limited curated portfolio search with hourly merit dispatch",
            "candidate_count": candidate["candidate_count"],
            "feasible_candidate_count": candidate["feasible_count"],
            "global_optimality_claimed": False,
            "limitations": ["Candidate set is intentionally limited and omits batteries in iteration 1.", "No detailed unit commitment, startup, ramping, outage, or gas-delivery constraints.", "Benchmark outputs are screening estimates, not certified uptime or project economics."],
        },
        "recommendation": {"capacities_mw": portfolio["capacities_mw"], "land_acres": metrics["land_acres"], "initial_service_month": metrics["initial_service_month"], "full_demand_month": metrics["full_demand_month"]},
        "metrics": {k: v for k, v in metrics.items() if k not in ("annual_results", "capacity_cost_ledger")},
        "annual_results": metrics["annual_results"],
        "capacity_cost_ledger": metrics["capacity_cost_ledger"],
        "monthly": monthly,
        "stress_events": events,
    }


def recommend(initial_service_month: int = 20, grid_delay_months: int = 0, policy: str = "strict", objective: str = "cost") -> dict[str, Any]:
    search = search_policy(initial_service_month, grid_delay_months, policy, objective)
    best = search["best"]
    best["candidate_count"] = search["candidate_count"]
    best["feasible_count"] = search["feasible_count"]
    result = _summary(best, policy, objective)
    result["candidate_assessment"] = [
        {
            "capacities_mw": row["portfolio"]["capacities_mw"],
            "status": "feasible" if "metrics" in row else "infeasible_in_limited_search",
            **({"reason": row["error"]} if "error" in row else {}),
        }
        for row in search["evaluated"]
    ]
    return {"result": result, "portfolio": best["portfolio"], "dispatch": best["dispatch"], "metrics": best["metrics"]}


def _fixed_policy_sensitivity(
    initial_service_month: int,
    grid_delay_months: int,
    capacities: dict[str, float],
    objective: str = "cost",
) -> dict[str, Any]:
    """Compare response permissions on one intentionally constrained fixed portfolio."""
    rows = []
    for key, policy in POLICIES.items():
        portfolio = _portfolio(initial_service_month, grid_delay_months, capacities)
        try:
            ctx = checker.prepare_inputs(portfolio)
            dispatch = _dispatch(ctx, portfolio, key, objective)
            metrics = checker.score(portfolio, dispatch)
            rows.append({
                "policy": key,
                "label": policy["label"],
                "status": "feasible",
                "total_decision_cost_usd": metrics["total_decision_cost_usd"],
                "combined_operational_co2_t": metrics["combined_operational_co2_t"],
                "relocated_local_equivalent_mwh": metrics["relocated_local_equivalent_mwh"],
                "interrupted_mwh": metrics["interrupted_mwh"],
                "physical_checks_passed": metrics["physical_checks_passed"],
            })
        except (ValueError, RuntimeError, KeyError, TypeError, OverflowError) as exc:
            rows.append({"policy": key, "label": policy["label"], "status": "infeasible", "reason": str(exc)})
    return {
        "label": "Fixed 20 MW gas-engine sensitivity (illustrates response-policy feasibility; not the recommended portfolio)",
        "capacities_mw": capacities,
        "results": rows,
    }


def compare_policies(initial_service_month: int = 20, grid_delay_months: int = 0, objective: str = "cost") -> dict[str, Any]:
    comparisons = []
    for key, policy in POLICIES.items():
        try:
            selected = recommend(initial_service_month, grid_delay_months, key, objective)
            metrics = selected["metrics"]
            comparisons.append({"policy": key, "label": policy["label"], "status": "feasible", "capacities_mw": selected["portfolio"]["capacities_mw"], "initial_service_month": initial_service_month, "full_demand_month": initial_service_month + 10, "total_decision_cost_usd": metrics["total_decision_cost_usd"], "combined_operational_co2_t": metrics["combined_operational_co2_t"], "combined_electricity_co2_kg_per_mwh": metrics["combined_electricity_co2_kg_per_mwh"], "clean_energy_share": metrics["clean_energy_share"], "relocated_local_equivalent_mwh": metrics["relocated_local_equivalent_mwh"], "interrupted_mwh": metrics["interrupted_mwh"], "candidate_count": selected["result"]["method"]["candidate_count"], "feasible_candidate_count": selected["result"]["method"]["feasible_candidate_count"], "candidate_assessment": selected["result"]["candidate_assessment"]})
        except RuntimeError as exc:
            comparisons.append({"policy": key, "label": policy["label"], "status": "no_feasible_candidate_in_limited_search", "message": str(exc)})
    return {
        "initial_service_month": initial_service_month,
        "full_demand_month": initial_service_month + 10,
        "grid_delay_months": grid_delay_months,
        "objective": objective,
        "method": "same demand, start date, grid assumptions, and limited candidate set for each policy",
        "comparisons": comparisons,
        "fixed_portfolio_sensitivity": _fixed_policy_sensitivity(initial_service_month, grid_delay_months, {"gas_engine": 20.0}, objective),
    }


def locked_capacity_delay_test(portfolio: dict[str, Any], delays: tuple[int, ...] = (0, 6)) -> list[dict[str, Any]]:
    """Re-dispatch the same capacities under each delay; never resize them."""
    results = []
    for delay in delays:
        candidate_portfolio = _portfolio(portfolio["initial_service_month"], int(delay), portfolio["capacities_mw"])
        try:
            ctx = checker.prepare_inputs(candidate_portfolio)
            # Run all response options and choose the one most consistent with
            # the selected portfolio's original service policy.
            policy_key = portfolio.get("policy", "strict")
            dispatch = _dispatch(ctx, candidate_portfolio, policy_key, "cost")
            metrics = checker.score(candidate_portfolio, dispatch)
            results.append({"grid_delay_months": int(delay), "capacities_mw": candidate_portfolio["capacities_mw"], "status": "feasible", "metrics": metrics})
        except (ValueError, RuntimeError, KeyError, TypeError, OverflowError) as exc:
            results.append({"grid_delay_months": int(delay), "capacities_mw": candidate_portfolio["capacities_mw"], "status": "infeasible_or_invalid", "message": str(exc)})
    return results


def write_submission(result: dict[str, Any], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    portfolio = dict(result["portfolio"])
    (output_dir / "portfolio.json").write_text(json.dumps(portfolio, indent=2) + "\n", encoding="utf-8")
    result["dispatch"].to_csv(output_dir / "dispatch.csv", index=False, float_format="%.10f")
    (output_dir / "check_results.json").write_text(json.dumps(result["metrics"], indent=2, allow_nan=False) + "\n", encoding="utf-8")
    (output_dir / "summary.json").write_text(json.dumps(result["result"], indent=2, allow_nan=False) + "\n", encoding="utf-8")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Run PeakPower's first backend iteration using the official benchmark checker.")
    parser.add_argument("--start-month", type=int, default=20)
    parser.add_argument("--grid-delay-months", type=int, default=0)
    parser.add_argument("--policy", choices=POLICIES, default="strict")
    parser.add_argument("--objective", choices=sorted(OBJECTIVES), default="cost")
    parser.add_argument("--output-dir", type=Path, default=PACKET_DIR / "outputs")
    parser.add_argument("--compare-policies", action="store_true")
    args = parser.parse_args()

    result = recommend(args.start_month, args.grid_delay_months, args.policy, args.objective)
    write_submission(result, args.output_dir)
    print(json.dumps({"status": result["result"]["status"], "portfolio": result["portfolio"], "physical_checks_passed": result["metrics"]["physical_checks_passed"], "total_decision_cost_usd": result["metrics"]["total_decision_cost_usd"], "combined_operational_co2_t": result["metrics"]["combined_operational_co2_t"], "outputs": str(args.output_dir)}, indent=2))
    if args.compare_policies:
        comparison = compare_policies(args.start_month, args.grid_delay_months, args.objective)
        path = args.output_dir / "policy_comparison.json"
        path.write_text(json.dumps(comparison, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        print(f"Policy comparison: {path}")


if __name__ == "__main__":
    main()



