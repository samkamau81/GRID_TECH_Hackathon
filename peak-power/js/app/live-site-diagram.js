/* Step 3 site diagram: built once per structure, updated each tick. */
// ---- site diagram: built once per structure, updated each tick ----
let selK='campus',siteKey='';
const IC2={...ICON,backup:c=>`<rect x="-16" y="-9" width="32" height="18" rx="2" fill="none" stroke="${c}" stroke-width="2.2"/><path d="M-11 -9 L-11 -14 L-3 -14 L-3 -9" fill="none" stroke="${c}" stroke-width="2"/><path d="M2 -5 L-3 1 L1 1 L-2 6" fill="none" stroke="${c}" stroke-width="2"/><circle cx="9" cy="0" r="3" fill="${c}"/>`};
function siteSVG(R){const c=R.caps,W=880;let s='';
  const flow=(id,d,col)=>`<path id="fl-${id}" class="flow" d="${d}" fill="none" stroke="${col}" stroke-width="2"/>`;
  const pad=(k,x,y,w,h,icon,col,name,ghost)=>`<g class="eq ${ghost?'ghost':''}" data-k="${k}" tabindex="0" role="button" aria-label="${name}"><rect class="padr" x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/>
    <g transform="translate(${x+24},${y+h/2})">${icon(col)}</g><text class="lbl" x="${x+50}" y="${y+18}">${name}</text><text id="tx-${k}" x="${x+50}" y="${y+33}"></text><text id="st-${k}" class="st" x="${x+50}" y="${y+h-8}"></text>
    <circle id="dot-${k}" cx="${x+w-10}" cy="${y+10}" r="4" fill="var(--ink-3)"/><g id="sv-${k}"></g></g>`;
  const T=44,PH=56,GAP=12;            // top of content, pad height, gap
  const X1=16,W1=184,X2=236,W2=172,BUS=436,BX=476,BW=W-BX-12;
  // column 1: off-site
  const off=[['wind',c.wind?`Wind · ${fmt(c.wind)} MW`:'Wind',ICON.wind,'--s-wind',!!c.wind],['utility_solar',c.utility_solar?`Solar · ${fmt(c.utility_solar)} MW`:'Solar',ICON.utility_solar,'--s-solar',!!c.utility_solar],['nuclear',c.nuclear?`Nuclear · ${fmt(c.nuclear)} MW`:'Nuclear',ICON.nuclear,'--s-nuc',!!c.nuclear],['grid','Grid power',ICON.grid,'--s-grid',true]];
  s+=`<text x="${X1}" y="${T-14}" class="sec">OFF-SITE · OVER THE GRID</text>`;
  const subY=T,subH=PH*2+GAP,subMid=subY+subH/2;
  off.forEach(([k,n,ic,col,on],i)=>{const y=T+i*(PH+GAP),my=y+PH/2;s+=flow(k,`M${X1+W1},${my} C${X1+W1+20},${my} ${X2-20},${subMid} ${X2},${subMid}`,`var(${col})`);s+=pad(k,X1,y,W1,PH,ic,`var(${col})`,n,!on);});
  // column 2: substation then yard
  s+=`<text x="${X2}" y="${T-14}" class="sec">SUBSTATION</text>`;
  s+=`<g class="eq" data-k="sub" tabindex="0" role="button" aria-label="Substation"><rect class="padr" x="${X2}" y="${subY}" width="${W2}" height="${subH}" rx="6"/><g transform="translate(${X2+26},${subY+40})">${ICON.grid('var(--s-grid)')}</g>
    <text class="lbl" x="${X2+52}" y="${subY+26}">Import meter</text><text id="tx-sub" x="${X2+52}" y="${subY+44}"></text><rect x="${X2+14}" y="${subY+76}" width="${W2-28}" height="8" rx="4" fill="var(--rule-2)"/><rect id="bar-sub" x="${X2+14}" y="${subY+76}" width="0" height="8" rx="4" fill="var(--s-grid)"/><text id="st-sub" class="st" x="${X2+14}" y="${subY+102}"></text><circle id="dot-sub" cx="${X2+W2-10}" cy="${subY+10}" r="4"/></g>`;
  s+=flow('sub',`M${X2+W2},${subMid} L${BUS},${subMid}`,'var(--s-grid)');
  const yard=[['battery_4h',c.battery_4h?`Battery · ${fmt(c.battery_4h)} MW`:'Battery',ICON.battery_4h,'--s-bat',!!c.battery_4h]];
  for(const [k,n] of [['gas_turbine','Gas turbine'],['gas_engine','Gas engines'],['fuel_cell','Fuel cell']])if(c[k])yard.push([k,`${n} · ${fmt(c[k])}`,ICON.gas,'--s-gas',true]);
  yard.push(['backup',`Backup diesel · ${BACKUP_MW}`,IC2.backup,'--s-dsl',true]);
  const yT=subY+subH+40;s+=`<text x="${X2}" y="${yT-14}" class="sec">ON-SITE YARD</text>`;
  yard.forEach(([k,n,ic,col,on],i)=>{const y=yT+i*(PH+GAP),my=y+PH/2;s+=flow(k,`M${X2+W2},${my} L${BUS},${my}`,`var(${col})`);s+=pad(k,X2,y,W2,PH,ic,`var(${col})`,n,!on);});
  const bot=Math.max(yT+yard.length*(PH+GAP)-GAP,T+off.length*(PH+GAP)-GAP,T+430);
  s+=`<line x1="${BUS}" x2="${BUS}" y1="${subMid-14}" y2="${bot-PH/2+14}" stroke="var(--ink-2)" stroke-width="4" stroke-linecap="round"/><text x="${BUS}" y="${bot+16}" text-anchor="middle" class="sec">BUS</text>`;
  // building: roof with chillers, then three halls
  const BY=T,BH=bot-T,RH=64,HG=10,HH=(BH-RH-HG*4)/3;
  s+=`<text x="${BX}" y="${T-14}" class="sec">DATA CENTER</text><rect x="${BX}" y="${BY}" width="${BW}" height="${BH}" rx="8" fill="var(--bg)" stroke="var(--ink-2)" stroke-width="1.5"/>`;
  const cw=(BW-2*HG-4*HG)/3;
  s+=`<g class="eq" data-k="chillers" tabindex="0" role="button" aria-label="Chillers"><rect class="padr" x="${BX+HG}" y="${BY+HG}" width="${BW-2*HG}" height="${RH-HG}" rx="5"/>
    ${[0,1,2].map(i=>{const cx=BX+2*HG+i*(cw+HG)+cw/2,cy=BY+HG+(RH-HG)/2;return `<g transform="translate(${cx},${cy})"><rect id="ch-${i}" x="${-cw/2+6}" y="-17" width="${cw-12}" height="34" rx="4" fill="var(--panel)" stroke="var(--rule)"/><circle r="12" fill="none" stroke="var(--ink-3)" stroke-width="1"/><g class="fan" id="fan-${i}"><path d="M0 -10 L3 -2 L0 0 L-3 -2 Z M0 0 L9 5 L2 3 Z M0 0 L-9 5 L-2 3 Z" fill="var(--ink-3)"/></g><circle r="1.8" fill="var(--ink-2)"/><text x="${-cw/2+12}" y="4" style="font-size:10px">CH-${i+1}</text></g>`;}).join('')}
    <text id="tx-chillers" x="${BX+BW-HG-8}" y="${BY+HG+12}" text-anchor="end" style="font-size:10px"></text><g id="sv-chillers"></g></g>`;
  const halls=[['A','Hall A · always-on','--t0'],['B','Hall B · movable','--t1'],['C','Hall C · batch','--t2']];
  const cols=12,rws=3,rkw=(BW-2*HG-24-(cols-1)*6)/cols,rkh=Math.min(16,(HH-28-20-(rws-1)*5)/rws);
  halls.forEach(([k,n,col],i)=>{const y=BY+RH+HG+i*(HH+HG),my=y+HH/2,by=subMid+30+i*40;
    s+=flow('h'+k,`M${BUS},${by} C${BUS+22},${by} ${BX-16},${my} ${BX+HG},${my}`,`var(${col})`);
    s+=`<g class="eq" data-k="campus" tabindex="0" role="button" aria-label="${n}"><rect class="padr" x="${BX+HG}" y="${y}" width="${BW-2*HG}" height="${HH}" rx="5"/><rect x="${BX+HG}" y="${y}" width="4" height="${HH}" rx="2" fill="var(${col})"/><text class="lbl" x="${BX+HG+14}" y="${y+18}">${n}</text><text id="tx-h${k}" x="${BX+BW-HG-12}" y="${y+18}" text-anchor="end"></text>
      ${Array.from({length:rws},(_,r)=>Array.from({length:cols},(_,q)=>`<rect class="rack" id="rk-${k}-${r*cols+q}" x="${(BX+HG+12+q*(rkw+6)).toFixed(1)}" y="${(y+26+r*(rkh+5)).toFixed(1)}" width="${rkw.toFixed(1)}" height="${rkh.toFixed(1)}" rx="2"/>`).join('')).join('')}<text id="st-h${k}" class="st" x="${BX+HG+14}" y="${y+HH-8}"></text></g>`;});
  return `<svg viewBox="0 0 ${W} ${bot+26}" role="img" aria-label="Site diagram: power sources, yard and data center">${s}</svg>`;}
function setT(id,v){const e=document.getElementById(id);if(e&&e.textContent!==v)e.textContent=v;}
function setFlow(id,mw,rev){const e=document.getElementById('fl-'+id);if(!e)return;const on=mw>0.05;e.style.strokeWidth=on?(1.5+8*Math.min(mw/75,1)).toFixed(1):'1';e.classList.toggle('on',on);e.classList.toggle('rev',!!rev);e.style.opacity=on?'.9':'.18';}
function setDot(k,state){const e=document.getElementById('dot-'+k);if(e)e.setAttribute('fill',{run:'var(--good)',stby:'var(--ink-3)',off:'var(--bad)',warn:'#c98500',wait:'var(--rule)'}[state]||'var(--ink-3)');}
function updSite(R,t){const c=R.caps,I=R.I,O=R.O,m=I.month[t],RX=resX(),av=k=>m>=Math.max(plant.open,RX[k].available_month),h=hourSup(R,t),out=(ops.result&&ops.result.out)||[];
  const isOff=k=>out.some(o=>o.id===k&&t>=o.from&&t<o.to&&!o.cost),inSvc=k=>out.some(o=>o.id===k&&t>=o.from&&t<o.to&&o.cost);
  for(const [k,cf,u] of [['wind',I.wcf[t],O.wind[t]],['utility_solar',I.scf[t],O.solar[t]],['nuclear',1,O.nuclear[t]]]){if(!c[k]){setT('tx-'+k,'not contracted');setT('st-'+k,'');setFlow(k,0);continue;}
    const a=av(k)&&!isOff(k)?c[k]*cf:0;setT('tx-'+k,`${fmt(u,1)} of ${fmt(a,1)} MW`);setT('st-'+k,!av(k)?`from month ${RX[k].available_month}`:a<0.05?'no output now':u<a-0.5?`curtailed ${fmt(a-u,1)} MW`:'delivering');setDot(k,!av(k)?'wait':a<0.05?'stby':'run');setFlow(k,u);}
  setT('tx-grid',`${fmt(O.grid[t],1)} MW bought`);setT('st-grid',I.Gord[t]===0?'no connection yet':`$${fmt(I.price[t],0)}/MWh now`);setDot('grid',I.Gord[t]===0?'wait':'run');setFlow('grid',O.grid[t]);
  const gu=O.grid[t]+O.wind[t]+O.solar[t]+O.nuclear[t];setT('tx-sub',`${fmt(gu,1)} / ${fmt(I.G[t],0)} MW`);const bar=document.getElementById('bar-sub');if(bar)bar.setAttribute('width',(122*(I.G[t]?Math.min(1,gu/I.G[t]):0)).toFixed(1));
  setT('st-sub',I.Gord[t]===0?'not built yet':I.G[t]===0?'OUTAGE: no imports':I.st[t]?`stress: capped at ${fmt(I.G[t],0)} MW`:'import limit shared');setDot('sub',I.Gord[t]===0?'wait':I.G[t]===0?'off':I.st[t]?'warn':'run');setFlow('sub',gu);
  if(c.battery_4h){const B=c.battery_4h,pc=100*O.soc[t]/(4*B);setT('tx-battery_4h',`${fmt(pc,0)}% · ${fmt(O.soc[t],0)} MWh`);
    setT('st-battery_4h',isOff('battery_4h')?'offline':inSvc('battery_4h')?'in service':O.di[t]>0.01?`discharging ${fmt(O.di[t],1)} MW`:O.ch[t]>0.01?`charging ${fmt(O.ch[t],1)} MW`:!av('battery_4h')?'not commissioned':ops.bat&&t<ops.bat.to?'reserved for event':'idle, auto');
    setDot('battery_4h',isOff('battery_4h')?'off':inSvc('battery_4h')?'warn':O.di[t]>0.01||O.ch[t]>0.01?'run':'stby');setFlow('battery_4h',O.di[t]||O.ch[t],O.ch[t]>0.01);}
  else{setT('tx-battery_4h','not installed');setT('st-battery_4h','click to add');setFlow('battery_4h',0);}
  for(const k of GASK){if(!c[k])continue;const o=O[k][t];setT('tx-'+k,`${fmt(o,1)} MW · ${fmt(100*o/c[k],0)}%`);setT('st-'+k,isOff(k)?'TRIPPED · offline':inSvc(k)?'in planned service':!av(k)?`from month ${RX[k].available_month}`:o>0.05?'running':'standby');
    setDot(k,isOff(k)?'off':inSvc(k)?'warn':o>0.05?'run':'stby');setFlow(k,o);}
  const bk=O.rental?O.rental[t]:0;setT('tx-backup',`${fmt(bk,1)} MW`);setT('st-backup',bk>0.05?'running · diesel':ops.gen&&t<ops.gen.to&&t>=ops.gen.from-24?'on standby for event':'off · ext.');setDot('backup',bk>0.05?'run':ops.gen&&t<ops.gen.to?'warn':'stby');setFlow('backup',bk);
  // service badges
  for(const k of [...GASK,'battery_4h','chillers','backup']){const g=document.getElementById('sv-'+k);if(!g)continue;const sv=service(R,k,t);const due=sv&&sv.days<=14;const pad=g.parentNode.querySelector('.padr');
    const bx=pad?+pad.getAttribute('x')+ +pad.getAttribute('width')-62:0,by=pad?+pad.getAttribute('y')+ +pad.getAttribute('height')-18:0;
    const html=due&&k!=='chillers'?`<rect x="${bx}" y="${by}" width="54" height="13" rx="6" fill="var(--warn-bg)" stroke="#c98500"/><text x="${bx+27}" y="${by+10}" text-anchor="middle" style="fill:var(--warn-ink);font-size:9px">service ${sv.days<1?'now':fmt(sv.days,0)+'d'}</text>`:'';if(g.innerHTML!==html)g.innerHTML=html;}
  // halls
  const L=I.L[t],t1=I.t1[t],t2=I.t2[t],t0=L-t1-t2,un=O.unserved[t],cur=O.cur[t],rel=O.rel[t];
  const hall=(k,load,served,moved,paused,risk)=>{setT('tx-h'+k,load>0?`${fmt(load,1)} MW`:'');const lit=load>0?Math.round(36*Math.min(1,load/Math.max(1,{A:48,B:18,C:9}[k]))):0;const mv=load>0?Math.round(lit*moved/load):0,pa=load>0?Math.round(lit*paused/load):0,rk=load>0?Math.round(lit*risk/load):0;
    for(let i=0;i<36;i++){const e=document.getElementById(`rk-${k}-${i}`);if(!e)continue;const cl=i>=lit?'rack':i<rk?'rack r':i<rk+pa?'rack p':i<rk+pa+mv?'rack m':'rack g';if(e.getAttribute('class')!==cl)e.setAttribute('class',cl);}};
  const unA=Math.max(0,un-Math.max(0,t2-cur)-t1);
  hall('A',t0,t0-unA,0,0,unA);hall('B',t1,t1-rel,rel,0,0);hall('C',t2,t2-cur,0,cur,0);
  setT('st-hA',L<=0?'not open yet':unA>0.05?`AT RISK: ${fmt(unA,1)} MW unserved`:'all served');setT('st-hB',L<=0?'':rel>0.05?`${fmt(rel,1)} MW moved to remote site`:'all served on site');setT('st-hC',L<=0?'':cur>0.05?`${fmt(cur,1)} MW paused`:'running');
  setFlow('hA',t0-unA);setFlow('hB',t1-rel);setFlow('hC',t2-cur);
  // chillers
  const d=evDef(),chOn=d&&d.kind==='chiller'&&t>=d.win[0]&&t<d.win[0]+(ops.tech?3:12);const cool=L*COOL+(chOn?3:0);
  setT('tx-chillers',L>0?`cooling ~${fmt(cool,1)} MW${chOn?' · chiller 2 +3 MW':''}`:'');
  for(let i=0;i<3;i++){const e=document.getElementById('ch-'+i);if(e)e.style.stroke=chOn&&i===1?'var(--bad)':'';const f=document.getElementById('fan-'+i);if(f)f.classList.toggle('on',L>0);}
  for(const k of ['A','B','C']){}
}
function drawSite(R,t){const key=JSON.stringify(R.caps);const box=$('site');if(siteKey!==key||!box.firstChild){box.innerHTML=siteSVG(R);siteKey=key;
    box.querySelectorAll('.eq').forEach(g=>{const go=()=>{selK=g.dataset.k;drawPanel();};g.onclick=go;g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}};});}
  box.querySelectorAll('.eq').forEach(g=>g.classList.toggle('sel',g.dataset.k===selK));updSite(R,t);}
