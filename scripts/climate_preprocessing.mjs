#!/usr/bin/env node
/* Precompute climate statistics and natural-hazard data on a coarse grid over the contiguous US, for the
   Investment Intelligence heatmap.

     node scripts/climate_preprocessing.mjs                # from the repository root; resumable, takes about 1.5 hours
     node scripts/climate_preprocessing.mjs --status       # progress only, no network
     node scripts/climate_preprocessing.mjs --spacing 3 --years 3 --hourly-budget 4000

   Writes peak-power/data/processed/climate-grid.json. Needs data/processed/us-states.geojson (run us_reference_data.py first).

   Why Node and not Python: the statistics come from peak-power/js/climate-stats.js, the same file the browser uses for a clicked
   location, so the map and the live analysis can never disagree on how a location is described.

   Open-Meteo free tier (non-commercial use only; CC BY 4.0): 600 calls/min, 5,000/hour, 10,000/day, where a request covering more
   than 14 days or 10 variables counts as several calls. The published examples fit  weight = max(1, variables/10) * days/14
   per location, so a three-year hourly request weighs about 78. This script assumes that rule, keeps a persistent ledger of what
   it has sent, and stays under a configurable share of every limit (default 80 % of the hourly cap). If the API says a limit has
   been hit it waits and retries; if the daily limit is hit it stops, and a later run resumes from the cache. */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Climate = require(path.join(ROOT, 'peak-power/js/climate-stats.js'));
const Geo = require(path.join(ROOT, 'peak-power/js/us-geo.js'));
const OUT = path.join(ROOT, 'peak-power/data/processed');
const CACHE = path.join(ROOT, 'scripts/.cache/climate');
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const FEMA = 'https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Counties/FeatureServer/0/query';
const HOURLY = ['temperature_2m', 'relative_humidity_2m', 'wet_bulb_temperature_2m', 'wind_speed_10m'];

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i < 0 ? dflt : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const SPACING = +arg('spacing', 3), NYEARS = +arg('years', 3), HOURLY_BUDGET = +arg('hourly-budget', 4000);
const MINUTE_BUDGET = 450, DAY_BUDGET = +arg('day-budget', 8500), LIMIT = +arg('limit', Infinity);   // free tier: 600/min, 5,000/hour, 10,000/day
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastYear = new Date().getUTCFullYear() - 1;                  // last complete calendar year
const YEARS = Array.from({ length: NYEARS }, (_, i) => lastYear - NYEARS + 1 + i);
const START = `${YEARS[0]}-01-01`, END = `${YEARS[YEARS.length - 1]}-12-31`;
const DAYS = Math.round((Date.parse(END) - Date.parse(START)) / 864e5) + 1;
const WEIGHT = Math.max(1, HOURLY.length / 10) * DAYS / 14;

const states = JSON.parse(fs.readFileSync(path.join(OUT, 'us-states.geojson'), 'utf8'));
const ref = JSON.parse(fs.readFileSync(path.join(OUT, 'us-reference.json'), 'utf8'));
fs.mkdirSync(CACHE, { recursive: true });

// ---------------------------------------------------------------- locations
function gridCells() {
  const cells = [], stateSeen = new Set();
  for (let lat0 = 24; lat0 < 50; lat0 += SPACING) for (let lon0 = -125; lon0 < -66; lon0 += SPACING) {
    const lat = +(lat0 + SPACING / 2).toFixed(2), lon = +(lon0 + SPACING / 2).toFixed(2);
    const st = Geo.stateAt(lon, lat, states);
    if (!st || st === 'AK' || st === 'HI') continue;
    cells.push({ id: `g_${lat.toFixed(1)}_${lon.toFixed(1)}`, lat, lon, state: st, anchor: false }); stateSeen.add(st);
  }
  // Contiguous states with no cell centre (small states at coarse spacing) get one interior point so every state can be compared.
  for (const f of states.features) {
    const code = f.properties.code;
    if (stateSeen.has(code) || code === 'AK' || code === 'HI') continue;
    const polys = f.geometry.coordinates, area = (r) => Math.abs(r.reduce((a, p, i) => a + (p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1]), 0) / 2);
    const big = polys.reduce((b, p) => (area(p[0]) > area(b[0]) ? p : b));
    const ring = big[0];
    // area-weighted centroid of the largest outline (shoelace formulas)
    let a2 = 0, cx = 0, cy = 0;
    ring.forEach((p, i) => { const q = ring[(i + 1) % ring.length], c = p[0] * q[1] - q[0] * p[1]; a2 += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c; });
    cx /= 3 * a2; cy /= 3 * a2;
    let best = null;
    if (Geo.stateAt(cx, cy, states) === code) best = [cx, cy];
    else {
      const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.05) for (let y = Math.min(...ys); y <= Math.max(...ys); y += 0.05) {
        if (Geo.stateAt(x, y, states) !== code) continue;
        const d = (x - cx) ** 2 + (y - cy) ** 2; if (!best || d < best[2]) best = [x, y, d];
      }
    }
    if (best) cells.push({ id: `a_${code}`, lat: +best[1].toFixed(2), lon: +best[0].toFixed(2), state: code, anchor: true });
  }
  // deterministic scatter so an interrupted run still covers the whole country
  const h = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return cells.sort((a, b) => h(a.id) - h(b.id));
}

// ---------------------------------------------------------------- rate limiting
const LEDGER = path.join(CACHE, '_ledger.json');
let ledger = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : [];
const saveLedger = () => fs.writeFileSync(LEDGER, JSON.stringify(ledger));
const used = (ms) => ledger.filter((e) => e.t > Date.now() - ms).reduce((a, e) => a + e.w, 0);
async function waitForBudget(w) {
  for (;;) {
    ledger = ledger.filter((e) => e.t > Date.now() - 864e5);
    const over = [[6e4, MINUTE_BUDGET], [36e5, HOURLY_BUDGET], [864e5, DAY_BUDGET]].find(([ms, cap]) => used(ms) + w > cap);
    if (!over) return;
    const oldest = ledger.filter((e) => e.t > Date.now() - over[0]).sort((a, b) => a.t - b.t)[0];
    const wait = oldest ? Math.max(1000, oldest.t + over[0] - Date.now() + 500) : 1000;
    if (over[0] === 864e5 && wait > 3 * 36e5) throw new Error('daily call budget used up; run again later and it will resume');
    await sleep(Math.min(wait, 60000));
  }
}

async function getJson(url, what) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      let body; try { body = JSON.parse(text); } catch { body = null; }
      if (res.ok && body && !body.error) return body;
      const reason = (body && body.reason) || `HTTP ${res.status}`;
      if (/daily/i.test(reason)) throw new Error('Open-Meteo daily limit reached: ' + reason);
      const pause = /hourly/i.test(reason) ? 15 * 60e3 : /minutely/i.test(reason) ? 70e3 : 20e3 * attempt;
      console.error(`  ${what}: ${reason}; waiting ${Math.round(pause / 1000)}s (attempt ${attempt})`);
      await sleep(pause);
    } catch (e) {
      if (/daily limit/.test(e.message)) throw e;
      console.error(`  ${what}: ${e.message}; retrying`); await sleep(5000 * attempt);
    }
  }
  throw new Error(`${what}: giving up after 5 attempts`);
}

// ---------------------------------------------------------------- FEMA
async function femaAt(lat, lon) {
  const q = new URLSearchParams({ geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: 'COUNTY,STATEABBRV,POPULATION,BUILDVALUE,EAL_VALB,RISK_RATNG,HWAV_RISKR,CFLD_RISKR,HRCN_RISKR,ERQK_RISKR,TRND_RISKR,WFIR_RISKR,DRGT_RISKR,NRI_VER',
    returnGeometry: 'false', f: 'json' });
  const d = await getJson(`${FEMA}?${q}`, 'FEMA');
  const a = d.features && d.features[0] && d.features[0].attributes;
  if (!a || !a.BUILDVALUE) return null;       // no county (sea, border): left unassessed, never guessed
  return { county: a.COUNTY, state: a.STATEABBRV, ealRate: a.EAL_VALB / a.BUILDVALUE, compositeRating: a.RISK_RATNG, nriVersion: a.NRI_VER,
    hazards: { heatWave: a.HWAV_RISKR, coastalFlood: a.CFLD_RISKR, hurricane: a.HRCN_RISKR, earthquake: a.ERQK_RISKR, tornado: a.TRND_RISKR, wildfire: a.WFIR_RISKR, drought: a.DRGT_RISKR } };
}

// ---------------------------------------------------------------- main
const cellFile = (c) => path.join(CACHE, `${c.id}.json`);
const cells = gridCells().slice(0, LIMIT);
const done = () => cells.filter((c) => fs.existsSync(cellFile(c)) && JSON.parse(fs.readFileSync(cellFile(c), 'utf8')).climate).length;

function assemble() {
  const out = [];
  for (const c of cells) {
    if (!fs.existsSync(cellFile(c))) continue;
    const r = JSON.parse(fs.readFileSync(cellFile(c), 'utf8'));
    if (!r.climate) continue;
    out.push({ id: c.id, lat: c.lat, lon: c.lon, state: c.state, anchor: c.anchor, elevationM: r.elevationM, climate: r.climate, hazard: r.hazard });
  }
  out.sort((a, b) => a.state.localeCompare(b.state) || a.lat - b.lat || a.lon - b.lon);
  const grid = { meta: { generated: new Date().toISOString(), source: 'Open-Meteo Historical Weather API (ERA5 reanalysis), https://open-meteo.com/en/docs/historical-weather-api',
      license: 'CC BY 4.0; the free API is for non-commercial use only', years: YEARS, spacingDeg: SPACING, hourlyVariables: HOURLY, cells: out.length, cellsPlanned: cells.length,
      anchors: out.filter((c) => c.anchor).length, nriVersion: ref.fema.nriVersion,
      note: 'Cells are coarse: each is a modelled point at the centre of a grid cell, not a measurement. Anchors are single interior points for states with no cell centre.' }, cells: out };
  writeAtomic(path.join(OUT, 'climate-grid.json'), JSON.stringify(grid) + '\n');
  return out.length;
}

// The repository folder may be synced (OneDrive, Dropbox), which can briefly lock a file. Write to a temporary name and
// rename; if that still fails the cache already holds the data, so carry on and let a later write succeed.
function writeAtomic(file, text) {
  for (let i = 0; i < 6; i++) {
    try { fs.writeFileSync(file + '.tmp', text); fs.renameSync(file + '.tmp', file); return true; }
    catch (e) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400); }
  }
  console.error('  (could not write ' + path.basename(file) + ' this time; progress is safe in the cache)');
  return false;
}

if (arg('status', false)) {
  console.log(`window ${START}..${END} (${DAYS} days), request weight about ${WEIGHT.toFixed(1)}; ${cells.length} locations planned (${cells.filter((c) => c.anchor).length} anchors); ${done()} done`);
  console.log(`ledger: ${Math.round(used(6e4))}/min, ${Math.round(used(36e5))}/hour, ${Math.round(used(864e5))}/day`);
  process.exit(0);
}

console.log(`Open-Meteo free tier is for non-commercial use (CC BY 4.0). Window ${START}..${END}; ${cells.length} locations at ${SPACING} deg; about ${WEIGHT.toFixed(0)} call-weight each; hourly budget ${HOURLY_BUDGET}.`);
// pass 1: FEMA for every cell (cheap, separate service)
for (const c of cells) {
  const f = cellFile(c), rec = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  if (rec.hazard !== undefined) continue;
  rec.hazard = await femaAt(c.lat, c.lon);
  fs.writeFileSync(f, JSON.stringify(rec));
}
console.log(`FEMA done for ${cells.length} locations`);

// pass 2: weather history, paced by the ledger
const t0 = Date.now(); let fetched = 0;
for (const c of cells) {
  const f = cellFile(c), rec = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (rec.climate) continue;
  await waitForBudget(WEIGHT);
  const q = new URLSearchParams({ latitude: c.lat, longitude: c.lon, start_date: START, end_date: END, hourly: HOURLY.join(','), timezone: 'auto', wind_speed_unit: 'mph' });
  ledger.push({ t: Date.now(), w: WEIGHT }); saveLedger();
  const d = await getJson(`${ARCHIVE}?${q}`, `archive ${c.id}`);
  rec.climate = Climate.summarize(d.hourly);
  rec.elevationM = d.elevation; rec.apiLocation = { latitude: d.latitude, longitude: d.longitude, timezone: d.timezone };
  fs.writeFileSync(f, JSON.stringify(rec));
  fetched++;
  const n = assemble(), rate = (Date.now() - t0) / fetched, left = cells.length - done();
  console.log(`[${n}/${cells.length}] ${c.id} ${c.state} mean ${rec.climate.annual.meanC} C, ${rec.climate.annual.heatDays95F} days >=95F, CDD ${rec.climate.annual.cddF}; eta ${Math.round(left * rate / 60000)} min`);
}
console.log(`finished: ${assemble()} of ${cells.length} locations written to climate-grid.json`);
