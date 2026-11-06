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

  // 2. the Recommended plan / Alternative box is gone; the Project plan still shows its finance and energy tabs and the best opening month
  await p.ev(`document.getElementById('tab-1').click()`);
  ok(await p.waitFor(`/Open at month/.test(document.getElementById('rec').innerText)`, 120000), 'project plan still recommends an opening month');
  ok(await p.ev(`!document.getElementById('alt-box')`), 'no Recommended plan / Alternative box in the page');
  ok(await p.ev(`!/Recommended plan and alternatives|Cleaner alternative|Faster alternative/.test(document.getElementById('v-1').innerText)`), 'no recommended-plan or alternative text on Project plan');
  ok(await p.ev(`[...document.querySelectorAll('#ptabs [data-ptab]')].map(b=>b.textContent).join()==='Finance,Energy'`), 'Project plan sub-tabs are Finance and Energy only');

  // 3. How it works page
  await p.ev(`document.querySelector('[data-how]').click()`);
  ok(await p.waitFor(`!document.getElementById('onepager').hidden`, 5000), 'How it works opens');
  const how = await text('#onepager');
  ok(/hard requirement/.test(how) && /preference/.test(how) && /business assumption/.test(how), 'page separates hard requirements, preferences and business assumptions');
  ok(/Worked example/.test(how) && /kg CO₂\/MWh/.test(how), 'page shows the current answers turned into a result');
  ok(/energy/i.test(how) && /finance/i.test(how) && /carbon/i.test(how), 'page lists energy, finance and carbon assumptions');
  await p.ev(`document.getElementById('op-close').click()`);
  ok(await p.ev(`document.getElementById('onepager').hidden`), 'page closes');

  // 4. changing an answer still re-runs the start-month analysis
  await p.ev(`(() => { const s = document.getElementById('s-cap'); s.value = '200'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(500);
  ok(await p.waitFor(`/Open at month/.test(document.getElementById('rec').innerText)`, 180000), 'start-month recommendation redraws after a carbon limit is set');
ok(p.errors.length === 0, 'no JavaScript errors ' + p.errors.slice(0, 2).join(' ; '));
} finally { b.close(); }
console.log(bad ? `\n${bad} check(s) failed` : '\nAll checks passed');
process.exit(bad ? 1 : 0);
