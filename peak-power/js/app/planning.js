/* Step 1, Site Planning: power pipeline chart, revenue models, start-month scroller. */
// ---------------- STEP 1 ----------------
const syncs=[];
function sel(id,opts,get,set){const el=$(id);el.innerHTML=opts.map(o=>`<option value="${o.v}">${o.l}</option>`).join('');el.onchange=()=>{const o=opts.find(x=>String(x.v)===el.value);set(o.v);};syncs.push(()=>{el.value=String(get());});}
sel('s-dead',[{v:0,l:'No deadline'},...OPENS.map(o=>({v:o+10,l:'Month '+(o+10)+(o===20?' (packet target)':'')}))],()=>F.dead,v=>{F.dead=v;step1();});
sel('s-cap',[{v:0,l:'No limit'},{v:100,l:'Below 100 kg/MWh (packet example)'},{v:70,l:'Below 70 kg/MWh'},{v:40,l:'Below 40 kg/MWh'}],()=>F.cap,v=>{F.cap=v;step1();});
sel('s-delay',[{v:0,l:'On time (packet)'},{v:3,l:'3 months late'},{v:6,l:'6 months late (packet example 5)'},{v:12,l:'12 months late'}],()=>F.delay,v=>{F.delay=v;step1();});
sel('s-ren',[{v:'0,0',l:'Packet dates (wind 12, solar 24)'},{v:'12,0',l:'Wind 12 months late'},{v:'24,0',l:'Wind 24 months late'},{v:'12,12',l:'Wind and solar 12 months late'}],()=>F.ren,v=>{F.ren=v;step1();});
sel('s-growth',[{v:0,l:'Flat (packet)'},{v:0.03,l:'+3% a year'},{v:0.05,l:'+5% a year'},{v:0.1,l:'+10% a year'}],()=>F.growth,v=>{F.growth=v;step1();});
sel('s-weather',[{v:'typical',l:'Typical (packet 2023 profiles)'},{v:'windy',l:'Windier: wind +15%'},{v:'calmw',l:'Low wind: wind −20%'},{v:'sunny',l:'Sunnier: solar +10%'},{v:'cloudy',l:'Cloudier: solar −15%'},{v:'poor',l:'Poor renewables'}],()=>F.weather,v=>{F.weather=v;step1();});
sel('s-grid',[{v:'packet',l:'Packet: 7 events a year at 60%'},{v:'calm',l:'Calm: no stress events'},{v:'tight',l:'Tighter: events at 40%'},{v:'wave',l:'Plus a 2-week August heat wave'}],()=>F.grid,v=>{F.grid=v;step1();});
sel('q-capmode',[{v:'avg',l:'10-year average (packet)'},{v:'year',l:'Every year (stricter)'}],()=>F.capMode,v=>{F.capMode=v;step1();});
sel('q-cap',[{v:0,l:'No limit'},{v:100,l:'Below 100 kg/MWh'},{v:70,l:'Below 70 kg/MWh'},{v:40,l:'Below 40 kg/MWh'}],()=>F.cap,v=>{F.cap=v;step1();});
sel('q-acres',[{v:5,l:'5 acres'},{v:8,l:'8 acres (packet)'},{v:12,l:'12 acres'},{v:20,l:'20 acres'}],()=>F.acres,v=>{F.acres=v;step1();});
sel('q-delay',[{v:0,l:'On time: month 18 (packet)'},{v:3,l:'3 months late'},{v:6,l:'6 months late'},{v:12,l:'12 months late'}],()=>F.delay,v=>{F.delay=v;step1();});
function setSummary(){const p=[F.dead?`full campus by month ${F.dead}`:'',F.cap?`carbon < ${F.cap} kg ${F.capMode==='year'?'every year':'10-yr avg'}`:'',F.delay?`grid ${F.delay} mo late`:'',F.ren!=='0,0'?'contracts late':'',F.growth?`demand +${F.growth*100}%/yr`:'',F.weather!=='typical'?'weather: '+F.weather.replace('calmw','low wind'):'',F.grid!=='packet'?{calm:'calm grid',tight:'tighter events',wave:'heat wave'}[F.grid]:''].filter(Boolean);
  $('set-sum').textContent=p.length?p.join(' · '):'Packet case: no deadline, no carbon limit, grid and contracts on time';}

// pipeline chart
function crf(r,n){return r/(1-Math.pow(1+r,-n));}
function drawPipe(open){const RX=resX(),box=$('pipe'),W=1100,rowsH=30,P={l:150,r:300,t:24,b:24},M=72,iw=W-P.l-P.r,x=m=>P.l+iw*Math.min(m,M)/M;
  const items=[['wind','Wind contract','--s-wind','c'],['utility_solar','Solar contract','--s-solar','c'],['nuclear','Nuclear contract','--s-nuc','c'],['battery_4h','Battery (4 h)','--s-bat','o'],['fuel_cell','Gas fuel cell','--s-gas','o'],['gas_engine','Gas engine','--s-gas','o'],['gas_turbine','Gas turbine','--s-gas','o']];
  const gH=46,H=P.t+gH+items.length*rowsH+P.b+8;let s='';
  for(let m=0;m<=M;m+=6)s+=`<line class="gl" x1="${x(m)}" x2="${x(m)}" y1="${P.t-6}" y2="${H-P.b}"/><text x="${x(m)}" y="${P.t-10}" text-anchor="middle">m${m}</text>`;
  // grid row
  const steps=[[0,0],[18+F.delay,25],[24+F.delay,50],[30+F.delay,75]];s+=`<text class="lbl" x="${P.l-10}" y="${P.t+gH/2+4}" text-anchor="end">Grid import limit</text>`;
  for(let i=0;i<steps.length;i++){const [m0,v]=steps[i],m1=i<steps.length-1?steps[i+1][0]:M;if(!v){s+=`<text x="${(x(m0)+x(m1))/2}" y="${P.t+gH-6}" text-anchor="middle">no grid</text>`;continue;}const h=(gH-6)*v/75;s+=`<rect x="${x(m0)}" y="${P.t+gH-h}" width="${x(m1)-x(m0)}" height="${h}" fill="var(--s-grid)" opacity=".35"/><text x="${x(m0)+4}" y="${P.t+gH-h-3}" class="ink">${v} MW</text>`;}
  s+=`<text x="${W-P.r+8}" y="${P.t+gH/2+4}">shared by contracts</text><text x="${W-P.r+8}" y="${P.t+gH/2+18}">and grid power</text>`;
  items.forEach(([k,n,c,typ],i)=>{const r=RX[k],y0=P.t+gH+8+i*rowsH,av=r.available_month,usable=typ==='c'?Math.max(av,18+F.delay):av;
    const fixed=(r.capex_usd_per_kw*crf(0.08,r.life_years)+r.fom_usd_per_kw_year);const maxMW=r.max_mw!=null?r.max_mw:{wind:200,utility_solar:150,nuclear:25,battery_4h:53,fuel_cell:30,gas_engine:60,gas_turbine:75}[k];   // from the packet catalogue
    const costTxt=typ==='c'?`$${fmt(r.payment_usd_per_mwh)}/MWh available · up to ${maxMW} MW`:k==='battery_4h'?`$${fmt(fixed)}/kW-yr · up to ${maxMW} MW`:`$${fmt(fixed)}/kW-yr + ~$${fmt(r.payment_usd_per_mwh+r.heat_rate_mmbtu_per_mwh_hhv*3.5)}/MWh fuel · ${maxMW} MW`;
    s+=`<text class="lbl" x="${P.l-10}" y="${y0+rowsH/2}" text-anchor="end">${n}</text>`;
    if(typ==='c'&&usable>av)s+=`<rect x="${x(av)}" y="${y0+6}" width="${x(usable)-x(av)}" height="${rowsH-14}" rx="3" fill="var(${c})" opacity=".25"/><text x="${(x(av)+x(usable))/2}" y="${y0+rowsH/2+1}" text-anchor="middle" style="font-size:10px">waits for grid</text>`;
    if(av<M)s+=`<rect x="${x(usable)}" y="${y0+6}" width="${x(M)-x(usable)}" height="${rowsH-14}" rx="3" fill="var(${c})" opacity=".85"/><text x="${x(usable)+6}" y="${y0+rowsH/2+1}" style="fill:#fff;font-size:10.5px">from month ${av}${typ==='c'&&usable>av?`, usable ${usable}`:''}</text>`;
    s+=`<text x="${W-P.r+8}" y="${y0+rowsH/2}" style="font-size:10.5px">${costTxt}</text>`;});
  if(open!=null)s+=`<line x1="${x(open)}" x2="${x(open)}" y1="${P.t-4}" y2="${H-P.b+4}" stroke="var(--ink)" stroke-width="2"/><text x="${x(open)}" y="${H-6}" text-anchor="middle" class="ink" style="font-weight:600">start ${open}</text>`;
  box.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="When each power source becomes available">${s}</svg>`;}

function drawModels(){const M=[['lease','Capacity lease','Rent per kW. You pay the power bill.','Hyperscale leases'],
  ['pass','Lease + pass-through','Rent per kW, plus power billed at cost + markup.','Colocation'],
  ['bundled','All-in per MWh','One price per MWh delivered. You pay the power bill.','Service contracts'],
  ['hybrid','Combined, by tier','Always-on: lease. Movable: lease + pass-through. Batch: per MWh.','Mixed tenants']
];
  const cr=chosen!=null&&rows.length&&rows.every(r=>r.done)?(rows.find(r=>r.o===chosen)||{}).r:null;const PF={};if(cr)for(const [k] of M)if(k!=='export')PF[k]=econ(cr.z,k).profit;
  const best=cr?Object.keys(PF).reduce((a,b)=>PF[b]>PF[a]?b:a):null;
  $('models').innerHTML=M.map(([k,t,d,w])=>`<button type="button" class="model" data-m="${k}" aria-pressed="${RM.model===k}" ${k==='export'?'disabled':''}><span class="t">${t}${k===best?'<span class="pill rec">best profit</span>':''}</span><span class="d">${d}</span><span class="who">${w}</span>${PF[k]!=null?`<span class="mp"><b>${money(PF[k])}</b> profit, 10 yrs${k!==best?` <span class="down">${sgn(PF[k]-PF[best])}</span>`:''}</span>`:''}</button>`).join('');
  $('mrec').innerHTML=cr?`<div class="note ${best===RM.model?'ok':''}">${best===RM.model?`Your model, <b>${M.find(m=>m[0]===best)[1].toLowerCase()}</b>, earns the most at start month ${chosen} with these prices.`:`Recommended: <b>${M.find(m=>m[0]===best)[1]}</b> earns ${money(PF[best]-PF[RM.model])} more than your current choice at start month ${chosen}. <button class="btn" type="button" id="m-use">Use it</button>`} Assumes the same rent in every model; pass-through tenants usually pay less rent.</div>`:'';
  if($('m-use'))$('m-use').onclick=()=>{RM.model=best;drawModels();step1(true);};
  $('models').querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{RM.model=b.dataset.m;drawModels();step1(true);});
  const tierSel=`<div class="in"><label for="m-tier">Rent per kW-month (always-on / movable / batch)</label><select id="m-tier"><option value="low">Low: $140 / $110 / $60</option><option value="mid">Mid: $180 / $150 / $100</option><option value="high">High: $230 / $190 / $120</option></select><span class="hint">Market references: $110–220 base rent; CBRE puts asking rents above $200</span></div>`;
  const mkSel=`<div class="in"><label for="m-mk">Markup on power passed through</label><select id="m-mk"><option value="0">At cost</option><option value="0.05">5%</option><option value="0.1">10%</option><option value="0.2">20%</option></select></div>`,rateSel=`<div class="in"><label for="m-rate">All-in price per MWh${RM.model==='hybrid'?' (batch)':''}</label><select id="m-rate"><option value="225">$225</option><option value="250">$250</option><option value="275">$275</option><option value="300">$300</option><option value="350">$350</option></select></div>`;
  $('mparams').innerHTML=RM.model==='hybrid'?tierSel+mkSel+rateSel:RM.model==='lease'?tierSel:RM.model==='pass'?tierSel+`<div class="in"><label for="m-mk">Markup on power passed through</label><select id="m-mk"><option value="0">At cost</option><option value="0.05">5%</option><option value="0.1">10%</option><option value="0.2">20%</option></select></div>`:
    `<div class="in"><label for="m-rate">All-in price per MWh delivered</label><select id="m-rate"><option value="225">$225</option><option value="250">$250</option><option value="275">$275</option><option value="300">$300</option><option value="350">$350</option></select><span class="hint">$275 ≈ the mid lease plus average power cost</span></div>`;
  if($('m-tier')){$('m-tier').value=RM.tier;$('m-tier').onchange=e=>{RM.tier=e.target.value;step1(true);};}
  if($('m-mk')){$('m-mk').value=String(RM.mk);$('m-mk').onchange=e=>{RM.mk=+e.target.value;step1(true);};}
  if($('m-rate')){$('m-rate').value=String(RM.rate);$('m-rate').onchange=e=>{RM.rate=+e.target.value;step1(true);};}}

let rows=[],recO=null,chosen=null,token=0;
function syncQ(){const m=$('q-model'),t=$('q-tier');if(!m)return;m.value=RM.model;t.value=RM.model==='bundled'?String(RM.rate):RM.tier;
  t.innerHTML=RM.model==='bundled'?[225,250,275,300,350].map(v=>`<option value="${v}">$${v} per MWh delivered</option>`).join(''):`<option value="low">Low: $140 / $110 / $60 per kW-mo</option><option value="mid">Mid: $180 / $150 / $100</option><option value="high">High: $230 / $190 / $120</option>`;
  t.value=RM.model==='bundled'?String(RM.rate):RM.tier;$('q-tierl').textContent=RM.model==='bundled'?'Price to tenants':'Rent level (always-on / movable / batch)';}
$('q-model').onchange=e=>{RM.model=e.target.value;drawModels();step1(true);};
$('q-tier').onchange=e=>{if(RM.model==='bundled')RM.rate=+e.target.value;else RM.tier=e.target.value;drawModels();step1(true);};
function step1(moneyOnly){syncs.forEach(f=>f());syncQ();setSummary();const tok=++token;
  if(moneyOnly&&rows.length&&rows.every(r=>r.done)){rows.forEach(r=>{if(r.r)r.r.e=econ(r.r.z);});pickRec();drawCards();return;}
  rows=OPENS.map(o=>({o,r:null,done:false}));drawCards();let i=0;
  const st=()=>{if(tok!==token)return;if(i<rows.length){rows[i].r=bestAt(rows[i].o,false);rows[i].done=true;i++;drawCards();setTimeout(st,4);return;}pickRec();drawCards();};setTimeout(st,10);}
function pickRec(){const ok=rows.filter(r=>feasible(r.r)&&inDeadline(r.o));recO=ok.length?ok.reduce((a,b)=>b.r.e.profit>a.r.e.profit?b:a).o:null;if(chosen==null||!ok.find(r=>r.o===chosen))chosen=recO;}
function drawCards(){const all=rows.every(r=>r.done);if(all)pickRec();drawStarts();drawPipe(chosen);$('go-2').disabled=chosen==null||!all;
  if(!all){$('rec').innerHTML=busy(`Evaluating start months… ${rows.filter(r=>r.done).length} of ${rows.length}`);$('o-why').innerHTML='';$('infra').innerHTML='';return;}
  if(recO==null){$('rec').innerHTML='<div class="note bad">No start month meets these limits. Loosen the carbon limit, land or deadline.</div>';$('o-why').innerHTML='';$('infra').innerHTML='';return;}
  const c=rows.find(r=>r.o===chosen).r,z=c.z,e=c.e,isRec=chosen===recO,R0=rows.find(r=>r.o===recO).r;
  const mtxt={lease:'capacity lease',pass:'lease with power pass-through',bundled:'all-in price per MWh',hybrid:'combined model by tier'}[RM.model];
  const capex=capexOf(c.caps);
  const pv=rows.slice().reverse().find(r=>r.o<chosen&&feasible(r.r)),nx=rows.find(r=>r.o>chosen&&feasible(r.r));
  $('rec').innerHTML=`<div class="rech"><div><div class="reclbl">${isRec?'Highest 10-year profit':'Your pick'}</div><div class="recbig">Open at month ${chosen}</div>
      <p class="sub">${isRec?'We maximize profit: revenue minus power cost.':`Month ${recO} earns ${money(R0.e.profit-e.profit)} more profit.`} Build: ${buildText(c.caps)}.</p></div></div>
    <div class="why">${[pv,{o:chosen,r:c},nx].filter(Boolean).map(r=>{const me=r.o===chosen,d=k=>me?'':`<span class="${(k==='cost'?-1:1)*(k==='rev'?r.r.e.rev-c.e.rev:k==='cost'?r.r.z.total-c.z.total:r.r.e.profit-c.e.profit)>0?'up':'down'}">${sgn(k==='rev'?r.r.e.rev-c.e.rev:k==='cost'?r.r.z.total-c.z.total:r.r.e.profit-c.e.profit)}</span>`;
      return `<button type="button" class="wcol ${me?'me':''}" data-o="${r.o}"><span class="wh">${me?'Month '+r.o:r.o<chosen?'Open earlier · month '+r.o:'Wait · month '+r.o}</span>
        <span class="wr"><span>Revenue</span><b>${money(r.r.e.rev)}</b>${d('rev')}</span><span class="wr"><span>Power cost</span><b>${money(r.r.z.total)}</b>${d('cost')}</span><span class="wr wtot"><span>Profit</span><b>${money(r.r.e.profit)}</b>${d('profit')}</span></button>`;}).join('')}</div>
    <p class="muted sm" style="margin:6px 0 0">${pv?`Opening at month ${pv.o} adds ${money(pv.r.e.rev-c.e.rev)} of revenue but ${money(pv.r.z.total-c.z.total)} of power cost, because ${pv.o<18+F.delay?'the grid is not there yet and gas carries the load':'the grid is still small then and gas fills the gap'}.`:''}${nx?` Waiting to month ${nx.o} saves ${money(c.z.total-nx.r.z.total)} of power but loses ${money(c.e.rev-nx.r.e.rev)} of rent.`:''}</p>
    <p class="eyebrow" style="margin:12px 0 4px">How the campus runs if it opens at month ${chosen}</p><div class="chart" id="ramp"></div>
    <div class="kpis" style="margin-top:8px">
      <div class="kpi hi"><div class="k">Profit, 10 years <span class="tag">team</span></div><div class="v">${money(e.profit)}</div><div class="s">${fmt(100*e.profit/Math.max(e.rev,1),0)}% margin</div></div>
      <div class="kpi"><div class="k">Revenue <span class="tag">team</span></div><div class="v">${money(e.rev)}</div><div class="s">${mtxt}</div></div>
      <div class="kpi"><div class="k">Power cost</div><div class="v">${money(z.total)}</div><div class="s">$${fmt(z.usdPerMWh,1)}/MWh</div></div>
      <div class="kpi ${F.cap&&zCap(z)>F.cap?'bad':''}"><div class="k">Carbon, 10-yr average</div><div class="v">${fmt(z.kg,0)}<small> kg/MWh</small></div><div class="s">${z.akgMax?`worst year ${fmt(z.akgMax,0)}`:''}${F.cap?` · cap ${F.cap} ${F.capMode==='year'?'every year':'avg'}`:''}</div></div>
      <div class="kpi"><div class="k">Upfront equipment</div><div class="v">${money(capex.up)}</div><div class="s">onsite power</div></div>
    </div>`;
  $('rec').querySelectorAll('[data-o]').forEach(b=>b.onclick=()=>{chosen=+b.dataset.o;drawCards();});
  drawRamp(chosen);$('o-why').innerHTML='';
  drawInfra(c.caps);drawLP();drawModels();}
function drawRamp(o){const W=900,H=96,P={l:8,r:8,t:22,b:20},iw=W-P.l-P.r,x=m=>P.l+iw*m/120,y=v=>P.t+(H-P.t-P.b)*(1-v/75),full=o+10,d=F.delay;
  let s=`<rect x="${x(0)}" y="${P.t}" width="${x(o)-x(0)}" height="${H-P.t-P.b}" fill="var(--rule-2)"/><text x="${x(o/2)}" y="${P.t+30}" text-anchor="middle">building, no demand</text>`;
  s+=`<path d="M${x(o)},${y(0)} L${x(o)},${y(25)} L${x(full)},${y(75)} L${x(120)},${y(75)} L${x(120)},${y(0)} Z" fill="var(--t1)" opacity=".35"/><path d="M${x(o)},${y(25)} L${x(full)},${y(75)} L${x(120)},${y(75)}" fill="none" stroke="var(--t0)" stroke-width="2"/>`;
  for(const [m,v] of [[18+d,25],[24+d,50],[30+d,75]])s+=`<line x1="${x(m)}" x2="${x(m)}" y1="${P.t}" y2="${H-P.b}" stroke="var(--s-grid)" stroke-dasharray="3 3"/><text x="${x(m)}" y="${H-6}" text-anchor="middle" style="fill:var(--s-grid)">${v}</text>`;
  s+=`<text x="${x(18+d)-16}" y="${H-6}" text-anchor="end" style="fill:var(--s-grid)">grid MW</text>`;
  s+=`<text x="${x(o)}" y="${P.t-8}" text-anchor="middle" class="ink" style="font-weight:600">opens m${o} · 25 MW</text><text x="${x(full)+6}" y="${y(75)+16}" class="ink" style="font-weight:600">full campus 75 MW · m${full}</text><text x="${x(120)-6}" y="${y(75)+34}" text-anchor="end">${120-o} months of operation to m120</text><text x="${x(120)}" y="${P.t-8}" text-anchor="end">m120</text><text x="${x(0)}" y="${P.t-8}">m0</text>`;
  $('ramp').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Demand ramp after opening">${s}</svg>`;}
function capexOf(c){const RX=resX();let up=0,yr=0;const L=[];for(const k of ['battery_4h','fuel_cell','gas_engine','gas_turbine']){if(!c[k])continue;const r=RX[k],u=c[k]*1000*r.capex_usd_per_kw,f=c[k]*1000*(r.capex_usd_per_kw*crf(0.08,r.life_years)+r.fom_usd_per_kw_year);up+=u;yr+=f;L.push({k,mw:c[k],up:u,yr:f,acres:c[k]*LAND[k],life:r.life_years});}return {up,yr,L};}
const MCF={};function meanCf(k){if(MCF[k+F.weather])return MCF[k+F.weather];const a=k==='wind'?REF.wind:REF.solar,sc=WX[F.weather][k==='wind'?0:1];let s=0;for(const v of a)s+=Math.min(1,v*sc);return MCF[k+F.weather]=s/a.length;}
function drawInfra(c){const cx=capexOf(c),RX=resX(),A=F.acres,W=900,H=46;let x0=0,bar='';const sx=v=>W*v/Math.max(A,landOf(c));
  const col={battery_4h:'--s-bat',fuel_cell:'--s-gas',gas_engine:'--s-gas',gas_turbine:'--s-gas'};
  for(const q of cx.L){const w=sx(q.acres);bar+=`<rect x="${x0}" y="4" width="${Math.max(w-2,1)}" height="30" rx="3" fill="var(${col[q.k]})" ${q.k==='gas_engine'?'opacity=".75"':q.k==='fuel_cell'?'opacity=".55"':''}/>${w>70?`<text x="${x0+6}" y="23" style="fill:#fff;font-size:11px">${RN[q.k]} ${fmt(q.acres,1)} ac</text>`:''}`;x0+=w;}
  const free=Math.max(0,A-landOf(c));bar+=`<rect x="${x0}" y="4" width="${Math.max(sx(free)-1,0)}" height="30" rx="3" fill="var(--rule-2)" stroke="var(--rule)" stroke-dasharray="4 3"/>${sx(free)>90?`<text x="${x0+8}" y="23">${fmt(free,1)} acres free</text>`:''}`;
  if(landOf(c)>A)bar+=`<line x1="${sx(A)}" x2="${sx(A)}" y1="0" y2="38" stroke="var(--bad)" stroke-width="2"/>`;
  const con=['wind','utility_solar','nuclear'].filter(k=>c[k]).map(k=>{const r=RX[k],cf=k==='nuclear'?1:meanCf(k),yr=c[k]*cf*8760*r.payment_usd_per_mwh;return {k,mw:c[k],price:r.payment_usd_per_mwh,from:r.available_month,yr};});
  
  $('infra').innerHTML=`<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Site land use">${bar}</svg></div>
   <div class="infra2"><table class="tbl"><thead><tr><th>Onsite equipment</th><th>MW</th><th>Acres</th><th>Upfront capex</th><th>Fixed cost / yr</th></tr></thead><tbody>
     ${cx.L.map(q=>`<tr><td>${RN[q.k][0].toUpperCase()+RN[q.k].slice(1)}</td><td>${fmt(q.mw)}</td><td>${fmt(q.acres,1)}</td><td>${money(q.up)}</td><td>${money(q.yr)}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">No onsite equipment</td></tr>'}
     <tr class="totr"><td>Total</td><td>${fmt(cx.L.reduce((a,q)=>a+q.mw,0))}</td><td>${fmt(landOf(c),1)} of ${A}</td><td>${money(cx.up)}</td><td>${money(cx.yr)}</td></tr></tbody></table>
    <table class="tbl"><thead><tr><th>Contracts, over the grid</th><th>MW</th><th>$/MWh</th><th>From month</th><th>Payment / yr</th></tr></thead><tbody>
     ${con.map(q=>`<tr><td>${RN[q.k][0].toUpperCase()+RN[q.k].slice(1)}</td><td>${fmt(q.mw)}</td><td>$${fmt(q.price)}</td><td>${q.from}</td><td>${money(q.yr)}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">No contracts</td></tr>'}
     <tr><td>Grid connection</td><td>${18+F.delay<30+F.delay?`25→75`:''}</td><td>wholesale</td><td>${18+F.delay}</td><td class="muted">pay as used</td></tr></tbody></table></div>
   <p class="muted sm">Fixed cost = packet capex annualized at 8% plus upkeep. Contracts pay for average available output.</p>`;}
function drawStarts(){const box=$('starts'),W=900,H=230,P={l:56,r:10,t:16,b:40},iw=W-P.l-P.r,ih=H-P.t-P.b,n=rows.length,bw=iw/n;
  const vals=rows.filter(r=>r.done&&r.r).flatMap(r=>[r.r.e.rev,r.r.z.total,r.r.e.profit]);const ym=Math.max(1,...vals,1)*1.08,mn=Math.min(0,...vals);const y=v=>P.t+ih*(1-(v-mn)/(ym-mn));
  let s='';const tk=[0,ym/2,ym].map(v=>Math.round(v/1e8)*1e8);for(const v of [...new Set(tk)])s+=`<line class="gl" x1="${P.l}" x2="${W-P.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${P.l-6}" y="${y(v)+4}" text-anchor="end">${money(v)}</text>`;
  rows.forEach((r,i)=>{const x=P.l+i*bw,cx=x+bw/2;const sel=r.o===chosen;
    if(!r.done){s+=`<text x="${cx}" y="${y(0)-8}" text-anchor="middle">…</text>`;}
    else if(r.r){const ok=feasible(r.r)&&inDeadline(r.o),e=r.r.e,z=r.r.z,w=Math.min(64,bw*0.56),op=ok?(sel?1:.72):.18,pr=Math.max(e.profit,0);
      s+=`<rect x="${cx-w/2}" y="${y(z.total)}" width="${w}" height="${y(0)-y(z.total)}" fill="var(--cost)" opacity="${op}"/>`;
      if(pr>0)s+=`<rect x="${cx-w/2}" y="${y(z.total+pr)}" width="${w}" height="${y(z.total)-y(z.total+pr)}" fill="var(--good)" opacity="${op}"/>`;
      s+=`<line x1="${cx-w/2-4}" x2="${cx+w/2+4}" y1="${y(e.rev)}" y2="${y(e.rev)}" stroke="var(--rev)" stroke-width="2.5" opacity="${ok?1:.3}"/>`;
      if(ok&&w>40){const pm=(y(z.total)+y(z.total+pr))/2,cm=(y(0)+y(z.total))/2;s+=`<text x="${cx}" y="${pm-2}" text-anchor="middle" style="fill:#fff;font-size:13px;font-weight:700">${money(e.profit)}</text><text x="${cx}" y="${pm+12}" text-anchor="middle" style="fill:#fff;font-size:9.5px;opacity:.9">profit</text><text x="${cx}" y="${cm+1}" text-anchor="middle" style="fill:#fff;font-size:11px;font-weight:600">${money(z.total)}</text><text x="${cx}" y="${cm+13}" text-anchor="middle" style="fill:#fff;font-size:9.5px;opacity:.9">power cost</text>`;}
      s+=`<text x="${cx}" y="${y(Math.max(e.rev,0))-7}" text-anchor="middle" class="${sel?'ink':''}" style="font-weight:${sel?600:400}">${ok?money(e.rev):!inDeadline(r.o)?'late':!r.r.capOk?'over cap':r.r.fits?'short':'no fit'}</text>`;}
    else s+=`<text x="${cx}" y="${y(0)-8}" text-anchor="middle">no fit</text>`;
    s+=`<text x="${cx}" y="${H-22}" text-anchor="middle" class="${sel?'ink':''}" style="font-weight:${sel?600:400}">month ${r.o}</text>${r.o===recO?`<rect x="${cx-46}" y="${H-15}" width="92" height="14" rx="7" fill="var(--accent)"/><text x="${cx}" y="${H-6}" text-anchor="middle" style="fill:var(--accent-ink);font-size:10px">highest profit</text>`:r.o===20?`<text x="${cx}" y="${H-6}" text-anchor="middle" style="font-size:10px">packet target</text>`:''}`;
    if(sel)s+=`<rect x="${x+2}" y="${P.t-8}" width="${bw-4}" height="${ih+30}" rx="5" fill="none" stroke="var(--accent)" stroke-width="1.5"/>`;
    s+=`<rect class="col" data-o="${r.o}" x="${x}" y="0" width="${bw}" height="${H}" fill="transparent" style="cursor:pointer"/>`;});
  s+=`<line class="ax" x1="${P.l}" x2="${W-P.r}" y1="${y(0)}" y2="${y(0)}"/>`;
  box.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenue, power cost and profit by start month">${s}</svg>`;
  box.querySelectorAll('.col').forEach(el=>{el.onclick=()=>{const r=rows.find(q=>q.o===+el.dataset.o);if(r&&r.done&&r.r){chosen=r.o;drawCards();}};
    el.onmousemove=e=>{const r=rows.find(q=>q.o===+el.dataset.o);if(!r||!r.done||!r.r)return;const z=r.r.z,ee=r.r.e;tipAt(box,`<div class="h">Start month ${r.o} · full campus ${r.o+10}</div>${row('Revenue',money(ee.rev),'--rev')}${row('Power cost',money(z.total),'--cost')}${row('Profit',money(ee.profit),'--good')}${row('Carbon',fmt(z.kg,0)+' kg/MWh')}${row('Onsite gas',fmt(gasOf(r.r.caps))+' MW')}${row('Land',fmt(landOf(r.r.caps),1)+' acres')}`,e);};el.onmouseleave=()=>hideTip(box);});}
