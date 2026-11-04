// Rebuild the browser's library of pre-simulated starting plans (peak-power/js/data/scenarios.js) with the symposium-packet rules.
//
//   node scripts/build_plan_library.mjs            # from the repository root; uses every CPU core, takes a few minutes
//
// Each plan is one cell of: opening month x contract mix x battery (none / BATTERY_MW) x stress policy x objective (cost / carbon).
// Offsite contracts and the battery size are fixed by the cell; the onsite gas package is chosen from GAS_PACKAGES as the cheapest
// (cost objective) or lowest-carbon (carbon objective) package that serves every hour under that policy. A cell with no feasible
// package is left out. The in-browser engine (peak-power/js/engine.js) does all the simulation, so the library matches the app exactly;
// scripts/verify_plan_library.py then replays plans through the packet's official checker.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS = path.join(ROOT, 'peak-power', 'js');
const OPENS = [14, 16, 18, 20, 22, 24, 27, 30];
const MIXES = { W100: { wind: 100 }, W150S50: { wind: 150, utility_solar: 50 }, W200S100: { wind: 200, utility_solar: 100 }, W200S100N25: { wind: 200, utility_solar: 100, nuclear: 25 } };
const BATTERY_MW = 30;                        // the "with battery" option; the packet allows up to 53 MW but that alone fills the 8-acre site
const POLICIES = ['never', 'last_resort', 'when_cheaper'];
const MODES = ['cost', 'carbon'];
const LAND = { fuel_cell: 0.05, gas_engine: 0.05, gas_turbine: 0.1, battery_4h: 0.15 }, ACRES = 8;
const GAS_PACKAGES = [[0, 5, 0], [0, 10, 0], [0, 15, 0], [0, 25, 0], [0, 35, 0], [0, 0, 30], [0, 15, 30], [25, 0, 0], [25, 5, 0], [25, 10, 0], [25, 30, 0], [25, 10, 30], [50, 0, 0], [50, 10, 0]]; // [turbine, engine, fuel cell] MW
const round = (v, d) => v == null ? null : Math.round(v * 10 ** d) / 10 ** d;

let cached;
function load() {
  if (cached) return cached;
  const w = {};
  new Function('window', fs.readFileSync(path.join(JS, 'data', 'reference-data.js'), 'utf8'))(w);
  cached = { REF: w.PEAKPOWER_REFERENCE, E: createRequire(import.meta.url)(path.join(JS, 'engine.js')) };
  return cached;
}

function landOf(caps) { return Object.entries(caps).reduce((a, [k, v]) => a + (LAND[k] || 0) * v, 0); }

function evaluate(E, REF, I, caps, policy, mode) {
  const O = E.dispatch(I, REF.res, caps, policy, mode), A = E.account(I, REF.res, caps, O), z = E.summarize(I, O, A);
  return { z, O, A };
}

function planGroup({ open, mixKey, battery }) {
  const { REF, E } = load();
  const I = E.buildInputs(REF.ref, open, {});
  const out = [];
  for (const policy of POLICIES) for (const mode of MODES) {
    let best = null;
    for (const [gt, ge, fc] of GAS_PACKAGES) {
      const caps = { ...MIXES[mixKey], ...(battery ? { battery_4h: BATTERY_MW } : {}), ...(gt ? { gas_turbine: gt } : {}), ...(ge ? { gas_engine: ge } : {}), ...(fc ? { fuel_cell: fc } : {}) };
      if (landOf(caps) > ACRES + 1e-9) continue;
      const { z, A, O } = evaluate(E, REF, I, caps, policy, mode);
      if (z.uns > 1e-6 || (policy === 'never' && z.cur > 1e-6)) continue;          // must serve every hour under this policy
      const key = mode === 'cost' ? [z.total, z.co2] : [z.co2, z.total];
      if (!best || key[0] < best.key[0] - 1e-6 || (Math.abs(key[0] - best.key[0]) <= 1e-6 && key[1] < best.key[1])) best = { key, caps, z, A, O };
    }
    if (!best) continue;
    const { z, caps } = best;
    const akg = []; for (let y = 0; y < 10; y++) { const s = E.summarize(I, best.O, best.A, y * E.HPY, (y + 1) * E.HPY); akg.push(round(s.kg || 0, 1)); }
    out.push({
      id: [open, mixKey, battery ? BATTERY_MW : 0, policy, mode].join('|'), open, mix: mixKey, battery: battery ? BATTERY_MW : 0, policy, mode, caps,
      full_demand_month: open + 10, total_decision_cost_usd: round(z.total, 2), local_energy_cost_usd: round(z.localCost, 3), relocation_cost_usd: round(z.relC, 3),
      interruption_consequence_usd: round(z.intC, 3), decision_cost_usd_per_requested_mwh: round(z.usdPerMWh, 3), combined_electricity_co2_kg_per_mwh: round(z.kg, 3),
      combined_operational_co2_t: round(z.co2, 3), clean_energy_share: round(z.cleanShare, 3), interrupted_mwh: round(z.cur, 3), relocated_local_equivalent_mwh: round(z.rel, 3),
      requested_mwh: round(z.req, 3), local_served_mwh: round(z.served, 3), akg,
    });
  }
  return out;
}

if (!isMainThread) {
  parentPort.on('message', (job) => { parentPort.postMessage({ job, plans: planGroup(job) }); });
} else {
  const jobs = []; for (const open of OPENS) for (const mixKey of Object.keys(MIXES)) for (const battery of [false, true]) jobs.push({ open, mixKey, battery });
  const results = []; let next = 0, done = 0;
  const nWorkers = Math.min(os.cpus().length, jobs.length);
  const t0 = Date.now();
  await new Promise((resolve, reject) => {
    for (let w = 0; w < nWorkers; w++) {
      const worker = new Worker(fileURLToPath(import.meta.url), { workerData: {} });
      const feed = () => { if (next < jobs.length) worker.postMessage(jobs[next++]); else worker.terminate(); };
      worker.on('message', ({ plans }) => { results.push(...plans); done++; if (done % 8 === 0 || done === jobs.length) console.log(`${done}/${jobs.length} groups, ${results.length} plans, ${Math.round((Date.now() - t0) / 1000)} s`); if (done === jobs.length) resolve(); else feed(); });
      worker.on('error', reject);
      feed();
    }
  });
  const order = (p) => [OPENS.indexOf(p.open), Object.keys(MIXES).indexOf(p.mix), p.battery, POLICIES.indexOf(p.policy), MODES.indexOf(p.mode)];
  results.sort((a, b) => { const x = order(a), y = order(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
  const header = `/* The ${results.length} pre-simulated candidate plans (symposium packet v6.0.1, V2 rules). Generated by scripts/build_plan_library.mjs with the in-browser engine;\n   scripts/verify_plan_library.py replays plans through the packet's official checker. Battery plans use ${BATTERY_MW} MW. */\n`;
  fs.writeFileSync(path.join(JS, 'data', 'scenarios.js'), header + 'window.PEAKPOWER_SCENARIOS = ' + JSON.stringify(results) + ';\n');
  const missing = jobs.length * POLICIES.length * MODES.length - results.length;
  console.log(`Wrote ${results.length} plans${missing ? ` (${missing} cells had no feasible gas package and were left out)` : ''} in ${Math.round((Date.now() - t0) / 1000)} s`);
}
