// Write the in-browser engine's hourly dispatch for chosen library plans as portfolio.json + dispatch.csv, in the packet's
// submission format, so the official checker can validate them (see scripts/verify_plan_library.py).
//
//   node scripts/export_plan_dispatch.mjs <output-dir> <plan-id> [<plan-id> ...]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS = path.join(ROOT, 'peak-power', 'js');
const [outDir, ...ids] = process.argv.slice(2);
if (!outDir || !ids.length) { console.error('usage: node export_plan_dispatch.mjs <output-dir> <plan-id> ...'); process.exit(2); }

const w = {};
new Function('window', fs.readFileSync(path.join(JS, 'data', 'reference-data.js'), 'utf8'))(w);
new Function('window', fs.readFileSync(path.join(JS, 'data', 'scenarios.js'), 'utf8'))(w);
const REF = w.PEAKPOWER_REFERENCE, PLANS = w.PEAKPOWER_SCENARIOS, E = createRequire(import.meta.url)(path.join(JS, 'engine.js'));

const HEADER = 'model_hour,grid_mw,tier1_relocated_mw,tier2_curtailed_mw,utility_solar_mw,wind_mw,battery_4h_charge_mw,battery_4h_discharge_mw,battery_4h_soc_mwh,battery_4h_clean_charge_mw,gas_turbine_mw,nuclear_mw,gas_engine_mw,fuel_cell_mw';
const COLS = ['grid', 'rel', 'cur', 'solar', 'wind', 'ch', 'di', 'soc', 'cch', 'gas_turbine', 'nuclear', 'gas_engine', 'fuel_cell'];

for (const id of ids) {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) { console.error('no such plan: ' + id); process.exit(1); }
  const I = E.buildInputs(REF.ref, plan.open, {});
  const O = E.dispatch(I, REF.res, plan.caps, plan.policy, plan.mode);
  const dir = path.join(outDir, id.replace(/[^\w.-]+/g, '_'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'portfolio.json'), JSON.stringify({ initial_service_month: plan.open, grid_delay_months: 0, capacities_mw: plan.caps }));
  const lines = [HEADER];
  for (let t = 0; t < E.N; t++) lines.push(t + ',' + COLS.map((c) => O[c][t].toFixed(10)).join(','));
  fs.writeFileSync(path.join(dir, 'dispatch.csv'), lines.join('\n') + '\n');
}
console.log('exported ' + ids.length + ' plan(s) to ' + outDir);
