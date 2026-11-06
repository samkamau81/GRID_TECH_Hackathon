// Fixed theme: every page must look identical whether the browser/OS prefers light or dark.
// Compares computed colours of key elements, and checks that no stylesheet reacts to prefers-color-scheme.
import { launch, openPage, BASE, sleep } from './lib.mjs';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const PROBE = `(()=>{const q=(s)=>document.querySelector(s);const cs=(e,p)=>e?getComputedStyle(e)[p]:null;
 return JSON.stringify({scheme:cs(document.documentElement,'colorScheme'),body:[cs(document.body,'backgroundColor'),cs(document.body,'color')],
 nav:cs(q('.nav, header.top'),'backgroundColor'),btn:cs(q('.btn-primary, .btn.pri, button'),'backgroundColor'),
 input:[cs(q('input,select'),'backgroundColor'),cs(q('input,select'),'color')],
 card:cs(q('.card, .panel, section'),'backgroundColor'),chat:cs(q('.pp-chat-btn'),'backgroundColor')})})()`;
const b = await launch();
try {
  for (const page of ['index.html', 'prototype.html', 'appendix.html']) {
    const res = {};
    for (const dark of [false, true]) {
      const p = await openPage(b, { width: 1300, height: 850, dark, url: BASE + page }); await sleep(900);
      res[dark] = await p.ev(PROBE);
      if (dark) await p.shot('theme-dark-' + page.replace('.html', ''), false);
      else await p.shot('theme-light-' + page.replace('.html', ''), false);
      ok(p.errors.length === 0, `${page} (${dark ? 'dark' : 'light'} OS): no console errors ${p.errors.join('|')}`);
    }
    ok(res[false] === res[true], `${page}: computed colours identical in light and dark OS settings`);
    ok(JSON.parse(res[true]).scheme === 'light', `${page}: color-scheme is light under a dark OS setting`);
  }
  // no stylesheet rule may be conditional on prefers-color-scheme
  const p = await openPage(b, { width: 1300, height: 850, url: BASE + 'index.html' }); await sleep(500);
  const n = await p.ev(`[...document.styleSheets].reduce((a,s)=>{try{return a+[...s.cssRules].filter(r=>r.media&&/prefers-color-scheme/.test(r.media.mediaText)).length}catch(e){return a}},0)`);
  ok(n === 0, 'no @media (prefers-color-scheme) rules in the loaded stylesheets (' + n + ')');
} finally { b.close(); }
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
