import { launch, openPage, BASE, sleep } from '../tests/e2e/lib.mjs';
const b = await launch();
for (const [n,u,w,d] of [['idx','index.html',1400,false],['proto','prototype.html',1400,false],['proto-m','prototype.html',390,false],['proto-dark','prototype.html',1400,true],['idx-m','index.html',390,false]]) {
 const p = await openPage(b,{width:w,height:900,dark:d,url:BASE+u}); await sleep(3500);
 const ov = await p.ev('document.documentElement.scrollWidth<=innerWidth+1'); console.log(n,'noOverflow',ov,'errors',p.errors.length);
 await p.shot('g-'+n,false); await p.close(); }
b.close(); process.exit(0);
