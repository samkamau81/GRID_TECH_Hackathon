// Lazy county shapes: Texas paths load with the map, US paths only when the US view is chosen, each file once; map still draws and recolors.
import { launch, openPage, BASE, sleep } from './lib.mjs';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const b = await launch();
try {
  const p = await openPage(b, { width: 1400, height: 900, url: BASE + 'prototype.html' });
  ok(await p.waitFor(`document.querySelectorAll('#map .cty').length===254`, 60000), 'Texas map draws 254 county paths');
  ok(!p.requests.some((u) => /site-shapes-us/.test(u)), 'US shapes not requested on load');
  ok(p.requests.filter((u) => /site-shapes-tx/.test(u)).length === 1, 'Texas shapes requested once');
  ok(await p.ev(`document.querySelector('#map .cty').getAttribute('d').startsWith('M')`), 'paths carry real geometry');
  await p.click('[data-scope="us"]');
  ok(await p.waitFor(`document.querySelectorAll('#map .cty').length===3142 && !!document.querySelector('#map .sbd')`, 30000), 'US view draws 3,142 counties and the border');
  await p.click('[data-scope="tx"]'); await p.click('[data-scope="us"]'); await sleep(800);
  ok(p.requests.filter((u) => /site-shapes-us/.test(u)).length === 1, 'US shapes requested once across repeated toggles');
  await p.click('[data-layer="water"]'); await sleep(300);
  ok(await p.ev(`new Set([...document.querySelectorAll('#map .cty')].map(e=>e.getAttribute('fill'))).size>=2`), 'layer recolor works');
  ok(p.errors.length === 0, 'no console errors' + p.errors.join('|')); ok(p.failed.length === 0, 'no failed requests');
} catch (e) { fail++; console.log('FAIL', e.message); }
b.close(); console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
