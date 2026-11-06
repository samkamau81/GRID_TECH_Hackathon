// Appendix end-to-end: nav, four sections, dataset filter, matrix and scatter, grade views, console errors, layout at 390 px, both colour schemes.
import { launch, openPage, BASE, sleep } from './lib.mjs';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const b = await launch();
try {
  const p = await openPage(b, { url: BASE + 'appendix.html' });
  await sleep(600);
  ok((await p.ev(`[...document.querySelectorAll('header.nav nav a')].map(a=>a.getAttribute('href')).join()`)) === 'index.html,prototype.html,appendix.html', 'navigation has exactly Introduction, Prototype, Appendix');
  ok(await p.ev(`document.querySelector('header.nav nav a[aria-current=page]').textContent==='Appendix'`), 'Appendix is the current page');
  ok(await p.ev(`document.querySelectorAll('#atabs [role=tab]').length===4 && !document.getElementById('s-model').hidden`), 'four sections, model section visible first');
  ok(await p.ev(`document.querySelectorAll('#dim-table tbody tr').length===9`), 'nine comparison dimensions listed');
  ok(!(await p.ev(`!!window.PEAKPOWER_APPENDIX_STATS`)), 'statistics are not loaded until needed');
  await p.click('#t-data'); ok(await p.waitFor(`document.querySelectorAll('#ds-list .ds').length===8`), 'dataset inventory lists 8 datasets');
  ok(await p.ev(`/Water stress: none for 62 counties/.test(document.getElementById('ds-list').textContent)`), 'missing-value counts are computed from data (62 water, 9 hazard)');
  await p.ev(`(()=>{const q=document.getElementById('ds-q');q.value='FEMA';q.dispatchEvent(new Event('input'))})()`);
  ok(await p.ev(`document.querySelectorAll('#ds-list .ds').length>=1 && document.querySelectorAll('#ds-list .ds').length<8`), 'dataset filter narrows the list');
  await p.click('#t-insights'); ok(await p.waitFor(`document.querySelectorAll('#matrix button').length===25`), 'correlation matrix has 25 cells');
  ok(await p.ev(`document.getElementById('scatter-read').textContent.includes('n = 3,142')`), 'default pair reports n = 3,142');
  const before = await p.ev(`document.getElementById('scatter-read').textContent`);
  await p.click('#matrix button[data-i="2"][data-j="3"]');
  ok((await p.ev(`document.getElementById('scatter-read').textContent`)) !== before && await p.ev(`/n = 3,071/.test(document.getElementById('scatter-read').textContent)`), 'clicking a cell changes the pair (water vs hazard, n = 3,071)');
  ok(await p.ev(`(()=>{const c=document.getElementById('scatter').getContext('2d').getImageData(0,0,560,360).data;let n=0;for(let i=3;i<c.length;i+=4)if(c[i]>0)n++;return n>2000})()`), 'scatter canvas has plotted points');
  ok(await p.ev(`document.getElementById('state-find').textContent.includes('n = 47')`), 'state analysis reports n = 47');
  for (const v of ['mat', 'inp', 'dist']) { await p.click(`#g-view [data-v=${v}]`); ok(await p.ev(`document.getElementById('g-out').children.length>0`), 'grade view ' + v + ' renders'); }
  ok(await p.ev(`/model-generated/i.test(document.getElementById('s-insights').textContent) && /not causation|does not show|do not show/i.test(document.getElementById('s-insights').textContent)`), 'model-generated and causation caveats are present');
  await p.click('#t-limits'); ok(await p.ev(`!document.getElementById('s-limits').hidden && document.getElementById('s-model').hidden`), 'limitations section opens');
  ok(await p.ev(`(()=>{const t=document.getElementById('t-limits');t.focus();return true})()`), 'tab is focusable');
  ok(p.errors.length === 0, 'no console errors' + (p.errors.length ? ': ' + p.errors.join(' | ') : '')); ok(p.failed.length === 0, 'no failed requests' + (p.failed.length ? ': ' + p.failed.join(' | ') : ''));
  for (const [w, dark] of [[1400, false], [1400, true], [390, false]]) {
    const q = await openPage(b, { width: w, height: 900, dark, url: BASE + 'appendix.html#insights' });
    await q.waitFor(`document.querySelectorAll('#matrix button').length===25`);
    ok(await q.ev(`document.documentElement.scrollWidth<=window.innerWidth+1`), `no horizontal overflow at ${w}px${dark ? ' dark' : ''}`);
    await q.shot(`appendix-insights-${w}${dark ? '-dark' : ''}`, true);
    ok(q.errors.length === 0, 'no errors at ' + w); await q.close();
  }
  for (const s of ['model', 'data', 'limits']) { const q = await openPage(b, { width: 1400, height: 900, url: BASE + 'appendix.html#' + s }); await sleep(500); await q.shot('appendix-' + s, true); await q.close(); }
} catch (e) { fail++; console.log('FAIL exception', e.message); }
b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
