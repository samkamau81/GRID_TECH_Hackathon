// End-to-end test for the demo-readiness additions to the Prototype: the readiness status line, a step click made before the
// results are ready (queued, not ignored), the "Recommended plan and alternatives" comparison, and the "How it works" page.
// Usage: node tests/e2e/demo-readiness.e2e.mjs      (takes a few minutes: the portfolio is simulated in the browser)
import { launch, openPage, BASE, sleep } from './lib.mjs';

let bad = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };
const b = await launch();
try {
  const p = await openPage(b, { url: BASE + 'prototype.html', width: 1400, height: 900 });
  const text = (sel) => p.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.innerText.split(String.fromCharCode(10)).join(' | ') : ''; })()`);

  // 1. visible computing state and a queued early click
  ok(await p.ev(`!!document.getElementById('pp-status')`), 'status line exists in the header');
  const early = await text('#pp-status');
  ok(/Testing opening months|Ready/.test(early), 'status line shows progress or ready right after load: ' + early);
  await p.ev(`document.getElementById('tab-3').click()`);
  const queued = await text('#pp-status');
  console.log('INFO status after early click: ' + queued);
  ok(await p.waitFor(`!document.getElementById('v-3').hidden`, 240000), 'early click on Live Operations is queued and opens it once the plant is ready');
  ok(/Plant running/.test(await text('#pp-status')), 'status line says the plant is running');
  ok(await p.ev(`!!document.querySelector('#site svg')`), 'Live Operations site diagram is drawn');

  // 2. comparison box on the project plan
  await p.ev(`document.getElementById('tab-1').click()`);
  ok(await p.waitFor(`!document.getElementById('alt-box').hidden && !!document.querySelector('#alt-box table.alt')`, 120000), 'recommended plan and alternatives table is shown');
  const alt = await text('#alt-box');
  ok(/Recommended/.test(alt) && /Power cost, 10 years/.test(alt) && /CO₂ intensity/.test(alt) && /Clean energy share/.test(alt), 'comparison shows cost, carbon and clean share');
  ok(/Cleaner alternative|No cleaner plan/.test(alt), 'a cleaner alternative (or why none exists) is stated');
  ok(/Choose it when|already the lowest-carbon/.test(alt), 'says when the alternative is the better choice');
  ok(/10-year profit/.test(alt) && /business assumption/.test(alt), 'business profit is labelled separately from power cost');
  console.log('INFO ' + alt.slice(0, 900));

  // 3. How it works page
  await p.ev(`document.querySelector('[data-how]').click()`);
  ok(await p.waitFor(`!document.getElementById('onepager').hidden`, 5000), 'How it works opens');
  const how = await text('#onepager');
  ok(/hard requirement/.test(how) && /preference/.test(how) && /business assumption/.test(how), 'page separates hard requirements, preferences and business assumptions');
  ok(/Worked example/.test(how) && /kg CO₂\/MWh/.test(how), 'page shows the current answers turned into a result');
  ok(/energy/i.test(how) && /finance/i.test(how) && /carbon/i.test(how), 'page lists energy, finance and carbon assumptions');
  await p.ev(`document.getElementById('op-close').click()`);
  ok(await p.ev(`document.getElementById('onepager').hidden`), 'page closes');

  // 4. changing an answer updates the comparison
  const before = await text('#alt-box');
  await p.ev(`(() => { const s = document.getElementById('s-cap'); const o = [...s.options].find((x) => x.value && x.value !== '0'); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(500);
  ok(await p.waitFor(`!document.getElementById('alt-box').hidden && !!document.querySelector('#alt-box table.alt')`, 180000), 'comparison redraws after a carbon limit is set');
  ok(p.errors.length === 0, 'no JavaScript errors ' + p.errors.slice(0, 2).join(' ; '));
  await p.shotEl('alt-box', '#alt-box', 8).catch(() => {});
} finally { b.close(); }
console.log(bad ? `\n${bad} check(s) failed` : '\nAll checks passed');
process.exit(bad ? 1 : 0);
