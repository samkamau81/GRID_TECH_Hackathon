/* Interactive site layout planner (drag data halls and equipment onto the land). */
// ---------------- site layout planner (interactive) ----------------
// Power yard: each square is 0.05 acre (packet land use: gas 0.05-0.1 acre/MW, battery 0.15 acre/MW); 20 squares = 1 acre per row.
// Campus zone: data center buildings, illustrative footprints only (team extension, not costed).
const TOK={gas_turbine:{n:'Gas turbine',mw:25,w:10,h:5,max:75,c:'--s-gas',z:'p'},battery_4h:{n:'Battery',mw:12,w:6,h:6,max:12,c:'--s-bat',z:'p'},gas_engine:{n:'Gas engine',mw:5,w:5,h:1,max:60,c:'--s-gas',z:'p'},fuel_cell:{n:'Fuel cell',mw:5,w:5,h:1,max:30,c:'--s-gas',z:'p'},
  hall:{n:'Data hall',sub:'25 MW IT',w:8,h:4,max:3,c:'--t0',z:'c',cnt:true},chill:{n:'Chiller yard',w:6,h:3,max:2,c:'--t1',z:'c',cnt:true},subst:{n:'Substation',w:4,h:4,max:1,c:'--s-grid',z:'c',cnt:true},office:{n:'Office & security',w:4,h:2,max:1,c:'--ink-3',z:'c',cnt:true},park:{n:'Parking',w:6,h:2,max:2,c:'--rule',z:'c',cnt:true}};
const LP={items:[],tool:'gas_engine',sel:null,seq:0,res:null,forO:null};
const LPC=20,CR=8;const zr=z=>z==='c'?CR:F.acres;
function lpFits(it,x,y,w,h,ignore,z){if(x<0||y<0||x+w>LPC||y+h>zr(z))return false;for(const o of LP.items){if(o===ignore||o===it||o.z!==z)continue;if(x<o.x+o.w&&x+w>o.x&&y<o.y+o.h&&y+h>o.y)return false;}return true;}
function lpFirst(w,h,z){for(let y=0;y<=zr(z)-h;y++)for(let x=0;x<=LPC-w;x++)if(lpFits(null,x,y,w,h,null,z))return [x,y];return null;}
function lpAdd(k){const T=TOK[k];let p=lpFirst(T.w,T.h,T.z),w=T.w,h=T.h;if(!p){p=lpFirst(T.h,T.w,T.z);w=T.h;h=T.w;}if(!p)return false;LP.items.push({id:++LP.seq,k,z:T.z,x:p[0],y:p[1],w,h});return true;}
function lpFrom(caps){LP.items=[];LP.sel=null;LP.res=null;for(const k of ['hall','hall','hall','subst','chill','office'])lpAdd(k);for(const k of ['gas_turbine','battery_4h','gas_engine','fuel_cell']){let n=Math.round((caps[k]||0)/TOK[k].mw);while(n-->0)if(!lpAdd(k))break;}}
function lpCaps(){const c={};for(const it of LP.items)if(it.z==='p')c[it.k]=(c[it.k]||0)+TOK[it.k].mw;return c;}
const lpCount=k=>LP.items.filter(o=>o.k===k).length;
function drawLP(){if(chosen==null||!rows.length||!rows.every(r=>r.done)){return;}
  const r=rows.find(x=>x.o===chosen).r;if(!r)return;if(LP.forO!==chosen+'|'+F.acres+'|'+JSON.stringify(r.caps)){LP.forO=chosen+'|'+F.acres+'|'+JSON.stringify(r.caps);lpFrom(r.caps);}
  const RX=resX(),caps=lpCaps(),full=k=>TOK[k].cnt?lpCount(k)>=TOK[k].max:(caps[k]||0)+TOK[k].mw>TOK[k].max,late=k=>RX[k]&&RX[k].available_month>chosen;
  const tb=(k,T)=>`<button type="button" class="tool" data-k="${k}" aria-pressed="${LP.tool===k}" ${full(k)?'disabled':''} style="--c:var(${T.c})"><span class="sw"></span><span><b>${T.n}${T.mw?' · '+T.mw+' MW':T.sub?' · '+T.sub:''}</b><br><span class="muted">${T.z==='p'?fmt(T.w*T.h*0.05,2)+' acres':`${lpCount(k)} of ${T.max}`}${late(k)?` · from month ${RX[k].available_month}`:''}${full(k)?' · at max':''}</span></span></button>`;
  $('lp-tools').innerHTML=`<div class="tg"><span class="tgl">Campus</span>${Object.entries(TOK).filter(([,T])=>T.z==='c').map(([k,T])=>tb(k,T)).join('')}</div><div class="tg"><span class="tgl">Power yard</span>${Object.entries(TOK).filter(([,T])=>T.z==='p').map(([k,T])=>tb(k,T)).join('')}</div>`;
  $('lp-tools').querySelectorAll('.tool').forEach(b=>b.onclick=()=>{LP.tool=b.dataset.k;drawLP();});
  const W=900,cw=W/LPC,ch=24,HD=26,offC=HD,offP=HD+CR*ch+HD+8,H=offP+F.acres*ch;const oy=z=>z==='c'?offC:offP;let g='';
  g+=`<text x="0" y="${offC-8}" class="sec">CAMPUS BUILDINGS · illustrative footprints, not part of the land limit</text><text x="0" y="${offP-8}" class="sec">ONSITE POWER YARD · ${F.acres} acres, the packet's land limit</text>`;
  for(const z of ['c','p'])for(let y=0;y<zr(z);y++)for(let x=0;x<LPC;x++)g+=`<rect class="cell ${z}" x="${x*cw+0.5}" y="${oy(z)+y*ch+0.5}" width="${cw-1}" height="${ch-1}" rx="2"/>`;
  for(let y=0;y<F.acres;y++)g+=`<text x="${W-4}" y="${offP+y*ch+ch-7}" text-anchor="end" style="font-size:9px;opacity:.6">acre ${y+1}</text>`;
  for(const it of LP.items){const T=TOK[it.k],X=it.x*cw,Y=oy(it.z)+it.y*ch,dark=it.k!=='park';
    g+=`<g class="tok ${LP.sel===it.id?'sel':''}" data-id="${it.id}" tabindex="0" role="button" aria-label="${T.n}"><rect x="${X+2}" y="${Y+2}" width="${it.w*cw-4}" height="${it.h*ch-4}" rx="4" fill="var(${T.c})" ${it.k==='fuel_cell'?'opacity=".6"':it.k==='gas_engine'?'opacity=".8"':''} ${it.k==='park'?'stroke="var(--ink-3)" stroke-dasharray="4 3"':''}/>
    <text x="${X+8}" y="${Y+16}" style="fill:${dark?'#fff':'var(--ink-2)'};font-size:11px;font-family:var(--f-body);font-weight:600">${T.n}${T.mw?' '+T.mw+(it.h>1?' MW':''):''}</text>${T.sub&&it.h>1?`<text x="${X+8}" y="${Y+30}" style="fill:#fff;font-size:10px">${T.sub}</text>`:''}
    ${it.k==='hall'&&it.h>2?Array.from({length:Math.max(0,Math.floor((it.w*cw-20)/16))},(_,q)=>`<rect x="${X+10+q*16}" y="${Y+it.h*ch-22}" width="10" height="12" rx="1.5" fill="#fff" opacity=".45"/>`).join(''):''}
    ${it.z==='p'&&it.h>2?`<g transform="translate(${X+it.w*cw/2},${Y+it.h*ch/2+6}) scale(1.3)">${(it.k==='battery_4h'?ICON.battery_4h:ICON.gas)('#fff')}</g>`:''}
    ${it.k==='chill'&&it.h>1?[0,1,2].slice(0,Math.floor(it.w/2)).map(q=>`<circle cx="${X+cw+q*cw*2}" cy="${Y+it.h*ch/2+6}" r="9" fill="none" stroke="#fff" stroke-width="1.5"/>`).join(''):''}</g>`;}
  g+=`<g id="lp-ghost"></g>`;
  $('lp-grid').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Campus and power yard plot">${g}</svg>`;
  const svg=$('lp-grid').querySelector('svg');const cellAt=e=>{const b=svg.getBoundingClientRect(),px=(e.clientX-b.left)*W/b.width,py=(e.clientY-b.top)*H/b.height;const z=py>=offP-HD/2?'p':'c';return [Math.floor(px/cw),Math.floor((py-oy(z))/ch),z];};
  const ghost=$('lp-ghost');let drag=null;
  svg.onpointermove=e=>{const [x,y,z]=cellAt(e);let it=drag?drag.it:null,w,h,zz;if(drag){w=it.w;h=it.h;zz=it.z;}else{if(e.target.closest('.tok'))return ghost.innerHTML='';const T=TOK[LP.tool];if(full(LP.tool))return ghost.innerHTML='';w=T.w;h=T.h;zz=T.z;}
    if(z!==zz)return ghost.innerHTML='';const px=drag?x-drag.dx:x,py=drag?y-drag.dy:y,ok=lpFits(it,px,py,w,h,it,zz);ghost.innerHTML=`<rect x="${px*cw+2}" y="${oy(zz)+py*ch+2}" width="${w*cw-4}" height="${h*ch-4}" rx="4" fill="${ok?'var(--accent)':'var(--bad)'}" opacity=".3" stroke="${ok?'var(--accent)':'var(--bad)'}" stroke-dasharray="4 3"/>`;};
  svg.onpointerleave=()=>{if(!drag)ghost.innerHTML='';};
  svg.onpointerdown=e=>{const t=e.target.closest('.tok');const [x,y,z]=cellAt(e);if(t){const it=LP.items.find(o=>o.id===+t.dataset.id);drag={it,dx:x-it.x,dy:y-it.y};LP.sel=it.id;svg.setPointerCapture(e.pointerId);return;}
    const T=TOK[LP.tool];if(full(LP.tool)||z!==T.z)return;if(lpFits(null,x,y,T.w,T.h,null,z)){LP.items.push({id:++LP.seq,k:LP.tool,z,x,y,w:T.w,h:T.h});LP.sel=LP.seq;LP.res=null;drawLP();}};
  svg.onpointerup=e=>{if(!drag)return;const [x,y]=cellAt(e),it=drag.it,px=x-drag.dx,py=y-drag.dy;if((px!==it.x||py!==it.y)&&lpFits(it,px,py,it.w,it.h,it,it.z)){it.x=px;it.y=py;}drag=null;drawLP();};
  svg.querySelectorAll('.tok').forEach(t=>t.onkeydown=e=>{const it=LP.items.find(o=>o.id===+t.dataset.id);const mv={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
    if(mv){e.preventDefault();if(lpFits(it,it.x+mv[0],it.y+mv[1],it.w,it.h,it,it.z)){it.x+=mv[0];it.y+=mv[1];LP.sel=it.id;drawLP();document.querySelector(`#lp-grid .tok[data-id="${it.id}"]`)?.focus();}}
    else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();LP.items=LP.items.filter(o=>o!==it);LP.sel=null;LP.res=null;drawLP();}
    else if(e.key==='r'||e.key==='R'){if(lpFits(it,it.x,it.y,it.h,it.w,it,it.z)){[it.w,it.h]=[it.h,it.w];drawLP();}}});
  const used=LP.items.filter(o=>o.z==='p').reduce((a,it)=>a+it.w*it.h*0.05,0),cx=capexOf(caps),rc=capexOf(r.caps);const selIt=LP.items.find(o=>o.id===LP.sel);
  const halls=lpCount('hall'),sub=lpCount('subst'),chl=lpCount('chill');
  const checks=[[halls>=3,`${halls} of 3 data halls (75 MW campus)`],[sub>=1,'Substation placed'],[chl>=1,'Cooling placed']];
  $('lp-side').innerHTML=`<div class="checks">${checks.map(([ok,t])=>`<div class="${ok?'up':'down'}">${ok?'✓':'○'} ${t}</div>`).join('')}</div><div class="eqlive">${Object.keys(TOK).filter(k=>caps[k]).map(k=>`<div class="r"><span>${TOK[k].n}</span><b>${fmt(caps[k])} MW</b></div>`).join('')||'<div class="muted">No onsite power placed.</div>'}
      <div class="r"><span>Power-yard land</span><b>${fmt(used,2)} of ${F.acres} acres</b></div><div class="r"><span>Upfront capex</span><b>${money(cx.up)} <span class="muted">(rec. ${money(rc.up)})</span></b></div><div class="r"><span>Fixed cost per year</span><b>${money(cx.yr)}</b></div></div>
    ${selIt?`<div class="crow"><span class="sm">Selected: ${TOK[selIt.k].n}</span><span><button class="btn" type="button" id="lp-rot">Rotate</button> <button class="btn" type="button" id="lp-del">Remove</button></span></div>`:''}
    <div class="crow"><button class="btn pri" type="button" id="lp-test">Test this layout</button><button class="btn" type="button" id="lp-reset">Reset</button><button class="btn" type="button" id="lp-clear">Clear power</button></div><div id="lp-res"></div>`;
  if(selIt){$('lp-rot').onclick=()=>{if(lpFits(selIt,selIt.x,selIt.y,selIt.h,selIt.w,selIt,selIt.z)){[selIt.w,selIt.h]=[selIt.h,selIt.w];drawLP();}};$('lp-del').onclick=()=>{LP.items=LP.items.filter(o=>o!==selIt);LP.sel=null;LP.res=null;drawLP();};}
  $('lp-reset').onclick=()=>{lpFrom(r.caps);drawLP();};$('lp-clear').onclick=()=>{LP.items=LP.items.filter(o=>o.z!=='p');LP.sel=null;LP.res=null;drawLP();};
  $('lp-test').onclick=()=>{$('lp-res').innerHTML=busy();setTimeout(()=>{const b=r.base,c2={...b.caps};for(const k of ['gas_turbine','battery_4h','gas_engine','fuel_cell'])delete c2[k];Object.assign(c2,lpCaps());
      const R=run(chosen,c2,b.policy,b.mode),z=zOf(R),e=econ(z);LP.res={z,e};drawLPres(r);},20);};
  drawLPres(r);}
function drawLPres(r){const box=$('lp-res');if(!box||!LP.res){if(box)box.innerHTML='';return;}const {z,e}=LP.res,d=e.profit-r.e.profit;
  box.innerHTML=`<div class="report ${z.uns>0.5?'bad':d<0?'warn':'ok'}" style="margin-top:6px"><h3 style="font-size:16px">${z.uns>0.5?`Short ${fmt(z.uns)} MWh over 10 years`:'Every MWh served'}</h3><div class="rgrid"><span>Profit, 10 years</span><span>${money(e.profit)}</span><span>vs recommended build</span><span class="${d<0?'down':'up'}">${sgn(d)}</span><span>Power cost</span><span>${money(z.total)}</span><span>Carbon</span><span>${fmt(z.kg,0)} kg/MWh</span></div>
   <p class="muted sm">Same contracts and operating rule as the recommendation, start month ${chosen}. Unserved energy is charged at $1,000/MWh.</p></div>`;}

$('go-2').onclick=()=>{if(chosen==null)return;startPlant(chosen);};
