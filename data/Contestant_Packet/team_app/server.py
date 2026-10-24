"""Offline local HTTP API and static frontend server for Campus Power Planner."""
from __future__ import annotations

import json
from functools import lru_cache
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import engine

PACKET_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PACKET_DIR / "outputs"
WEB_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = Path(__file__).resolve().parents[3]
FRONTEND_PATH = PROJECT_ROOT / "Campus Power Planner.html"


@lru_cache(maxsize=24)
def _recommendation(start: int, delay: int, policy: str, objective: str) -> dict:
    result = engine.recommend(start, delay, policy, objective)
    return result["result"]


@lru_cache(maxsize=12)
def _policy_comparison(start: int, delay: int, objective: str) -> dict:
    return engine.compare_policies(start, delay, objective)


def _int_param(params: dict[str, list[str]], name: str, default: int) -> int:
    try:
        return int(params.get(name, [str(default)])[0])
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be an integer") from exc


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def _send_json(self, status: int, payload: dict) -> None:
        raw = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def _send_frontend(self) -> None:
        if not FRONTEND_PATH.is_file():
            return self.send_error(404, "Campus Power Planner.html was not found at the project root")
        raw = FRONTEND_PATH.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            route = unquote(parsed.path)
            if route in ("/", "/index.html", f"/{FRONTEND_PATH.name}"):
                return self._send_frontend()
            return self.send_error(404, "Not found")
        params = parse_qs(parsed.query)
        try:
            if parsed.path == "/api/health":
                engine.checker.verify_released_data()
                checks = engine.checker.validate_inputs()
                return self._send_json(200, {"status": "ok", "data": checks, "service": "Campus Power Planner local backend"})

            start = _int_param(params, "start", 20)
            delay = _int_param(params, "delay", 0)
            policy = params.get("policy", ["strict"])[0]
            objective = params.get("objective", ["cost"])[0]

            if parsed.path == "/api/recommendation":
                if start == 20 and delay == 0 and policy == "strict" and objective == "cost" and (OUTPUT_DIR / "summary.json").exists():
                    payload = json.loads((OUTPUT_DIR / "summary.json").read_text(encoding="utf-8"))
                elif start == 20 and delay == 0 and policy == "strict" and objective == "carbon" and (OUTPUT_DIR / "carbon_alternative.json").exists():
                    payload = json.loads((OUTPUT_DIR / "carbon_alternative.json").read_text(encoding="utf-8"))
                else:
                    payload = _recommendation(start, delay, policy, objective)
                return self._send_json(200, payload)

            if parsed.path == "/api/policy-comparison":
                if start == 20 and delay == 0 and objective == "cost" and (OUTPUT_DIR / "policy_comparison.json").exists():
                    payload = json.loads((OUTPUT_DIR / "policy_comparison.json").read_text(encoding="utf-8"))
                else:
                    payload = _policy_comparison(start, delay, objective)
                return self._send_json(200, payload)

            if parsed.path == "/api/delay-test":
                selected = engine.recommend(start, delay, policy, objective)
                fixed = {**selected["portfolio"], "policy": policy}
                tests = engine.locked_capacity_delay_test(fixed, (0, 6))
                compact = []
                fields = ("total_decision_cost_usd", "combined_operational_co2_t", "combined_electricity_co2_kg_per_mwh", "clean_energy_share", "relocated_local_equivalent_mwh", "interrupted_mwh", "requested_mwh", "local_served_mwh")
                for row in tests:
                    if row["status"] == "feasible":
                        compact.append({"grid_delay_months": row["grid_delay_months"], "capacities_mw": row["capacities_mw"], "status": row["status"], "metrics": {key: row["metrics"].get(key) for key in fields}})
                    else:
                        compact.append({key: row[key] for key in ("grid_delay_months", "capacities_mw", "status", "message")})
                return self._send_json(200, {"fixed_capacities": fixed["capacities_mw"], "policy": policy, "results": compact})

            return self._send_json(404, {"error": "Unknown API endpoint"})
        except (ValueError, RuntimeError, KeyError, TypeError, OverflowError) as exc:
            return self._send_json(400, {"error": str(exc)})


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="Run the local Campus Power Planner frontend and API.")
    parser.add_argument("--host", default="127.0.0.1", help="Bind to loopback by default; use 0.0.0.0 only when intentionally exposing the server.")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    engine.checker.verify_released_data()
    engine.checker.validate_inputs()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Campus Power Planner: http://{args.host}:{args.port}")
    print("Local-only, offline backend. Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
