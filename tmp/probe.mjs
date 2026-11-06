import { launch, openPage, BASE } from '../tests/e2e/lib.mjs';
const b = await launch();
try {
  const p = await openPage(b, { url: BASE + 'prototype.html' });
  await new Promise(r => setTimeout(r, 8000));
  for (const e of ["typeof cOverall", "typeof STP", "typeof MAPD", "MAPD.c.length", "MAPD.c.every(c=>c.r.length>=8)", "MAPD.c.filter(c=>c.r.length<8).length", "typeof bestAt", "typeof OPENS", "document.title", "location.href"]) {
    try { console.log(e, '=>', await p.ev(e)); } catch (x) { console.log(e, 'ERR', String(x).slice(0,150)); }
  }
  console.log('errors', JSON.stringify(p.errors || []).slice(0, 600));
} finally { b.close(); }
process.exit(0);
