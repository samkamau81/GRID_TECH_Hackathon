import { launch, openPage, BASE } from '../tests/e2e/lib.mjs';
const b = await launch();
const p = await openPage(b, { url: BASE + 'prototype.html' });
await new Promise(r=>setTimeout(r,4000));
for (const e of ["typeof cOverall","typeof STP","typeof MAPD","MAPD.c.length","MAPD.c[0].r.length","document.readyState"]) { try { console.log(e,'=>',await p.ev(e)); } catch(x){ console.log(e,'ERR',String(x).slice(0,160)); } }
console.log('page errors', p.errors.slice(0,3));
b.close(); process.exit(0);
