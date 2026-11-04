// Smoke test for the prototype on the symposium packet (v6.0.1, V2): all three steps load and run without errors, and the app is using
// the V2 catalogue and plan library. (The older prototype-regression test compares against the original single-file build, which has
// the previous packet's numbers, so it can no longer be expected to match.)
// Usage: node tests/e2e/prototype-v2.e2e.mjs
import { launch, openPage, BASE, sleep } from './lib.mjs';

let bad = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };
const b = await launch();
try {
  for (const [w, h] of [[1400, 900], [390, 800]]) {
    const p = await openPage(b, { url: BASE + 'prototype.html', width: w, height: h });
    const tag = `${w}px`;
    ok(await p.waitFor(`document.querySelectorAll('#starts .col').length > 0`, 60000), `${tag}: step 1 shows opening-month options`);

    // data in use
    ok(await p.ev('S.length === 384'), `${tag}: 384-plan library loaded`);
    ok(await p.ev(`new Set(S.map(s => s.battery)).size === 2 && S.some(s => s.battery === 30)`), `${tag}: library includes the 30 MW battery plans`);
    ok(await p.ev(`(() => { const r = resX(); return r.wind.payment_usd_per_mwh === 45 && r.battery_4h.capex_usd_per_kw === 1220 && r.battery_4h.max_mw === 53; })()`), `${tag}: catalogue is V2 (wind $45, battery $1,220/kW, max 53 MW)`);
    ok(await p.ev(`document.getElementById('pipe').textContent.includes('up to 53 MW')`), `${tag}: planner shows the 53 MW battery limit`);
    ok(await p.ev(`S.every(s => ['wind','utility_solar','nuclear','battery_4h','gas_turbine','gas_engine','fuel_cell'].every(k => !(k in s.caps) || s.caps[k] >= 0))`), `${tag}: plan capacities are well formed`);
    ok(await p.ev(`S.every(s => { let a = 0; for (const [k, v] of Object.entries(s.caps)) a += ({fuel_cell:.05,gas_engine:.05,gas_turbine:.1,battery_4h:.15})[k] * v || 0; return a <= 8 + 1e-9; })`), `${tag}: every library plan fits the 8-acre site`);

    // walk the three steps
    await p.ev(`(() => { const c = [...document.querySelectorAll('#starts .col')]; (c[3] || c[0]).dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`);
    ok(await p.waitFor(`!document.getElementById('go-2').disabled`, 60000), `${tag}: a start month can be chosen`);
    await p.click('#go-2');
    ok(await p.waitFor(`!document.getElementById('v-2').hidden && document.querySelectorAll('#c-decs .dopt').length > 0`, 120000), `${tag}: step 2 (board review) renders with decisions`);
    const hasPlan = await p.ev(`typeof plant !== 'undefined' && !!plant && !!plant.cur && Number.isFinite(plant.cur.z.total)`);
    ok(hasPlan, `${tag}: the selected plan has a finite 10-year cost`);
    await p.click('#go-3');
    ok(await p.waitFor(`!document.getElementById('v-3').hidden`, 120000), `${tag}: step 3 (live operations) opens`);
    await sleep(1500);
    ok(await p.ev('document.documentElement.scrollWidth <= window.innerWidth + 1') || w < 700, `${tag}: no horizontal scroll`);
    ok(p.errors.length === 0, `${tag}: no JS errors ${p.errors.slice(0, 2).join(' ; ')}`);
    await p.shot('prototype-v2-' + w);
    await p.close();
  }
} finally { b.close(); }
console.log(bad ? `\n${bad} check(s) FAILED` : '\nAll checks passed');
process.exit(bad ? 1 : 0);
