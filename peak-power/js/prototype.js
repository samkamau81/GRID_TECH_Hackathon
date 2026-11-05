/* Prototype app, split from the Claude Artifact by scripts/split_prototype_artifact.py. Data comes from js/data/*.js and the engine from js/engine.js. */
(function(){
const E=window.GTEngine;
const {ref:REF,res:RES}=window.PEAKPOWER_REFERENCE;
const S=window.PEAKPOWER_SCENARIOS;
const $=id=>document.getElementById(id);
const fmt=(x,d=0)=>x==null||!isFinite(x)?'–':x.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const money=x=>{if(x==null||!isFinite(x))return '–';const a=Math.abs(x);return (x<0?'−':'')+(a>=1e6?'$'+fmt(a/1e6,a<1e7?1:0)+'M':a>=1e3?'$'+fmt(a/1e3,0)+'k':'$'+fmt(a,0));};
const sgn=(x,f)=>(x>=0?'+':'−')+(f||money)(Math.abs(x));
const OPENS=[...new Set(S.map(s=>s.open))].sort((a,b)=>a-b);
const GASK=['fuel_cell','gas_engine','gas_turbine'];
const RN={wind:'wind contract',utility_solar:'solar contract',nuclear:'nuclear contract',battery_4h:'battery',fuel_cell:'gas fuel cell',gas_engine:'gas engine',gas_turbine:'gas turbine'};
const ORD=['wind','utility_solar','nuclear','battery_4h','fuel_cell','gas_engine','gas_turbine'];
const MIXORD=['W100','W150S50','W200S100','W200S100N25'];
const MIXT={W100:'100 MW wind',W150S50:'150 MW wind + 50 MW solar',W200S100:'200 MW wind + 100 MW solar',W200S100N25:'200 MW wind + 100 MW solar + 25 MW nuclear'};
const gasOf=c=>GASK.reduce((a,k)=>a+(c[k]||0),0);
const buildText=c=>ORD.filter(k=>c[k]).map(k=>`${fmt(c[k])} MW ${RN[k]}`).join(', ');
const LAND={fuel_cell:.05,gas_engine:.05,gas_turbine:.1,battery_4h:.15};
const landOf=c=>Object.keys(LAND).reduce((a,k)=>a+(c[k]||0)*LAND[k],0);
const UNMET=1000;
const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const dateOf=t=>{const r=((t%8760)+8760)%8760,d=new Date(Date.UTC(2023,0,1+Math.floor(r/24)));return {m:MN[d.getUTCMonth()],d:d.getUTCDate(),wd:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()],h:REF.hour[r]};};
const busy=t=>`<span class="busy">${t||'Running 87,600 hours…'}</span>`;
function tipAt(box,html,e){let t=box.querySelector('.tip');if(!t){t=document.createElement('div');t.className='tip';box.appendChild(t);}t.innerHTML=html;t.hidden=false;
  const r=box.getBoundingClientRect(),x=e.clientX-r.left+box.scrollLeft,y=e.clientY-r.top;t.style.left=Math.min(Math.max(x+14,0),box.scrollWidth-t.offsetWidth-2)+'px';t.style.top=Math.max(y-10,0)+'px';}
const hideTip=box=>{const t=box.querySelector('.tip');if(t)t.hidden=true;};
const row=(n,v,c)=>`<div class="r"><span>${c?`<i style="background:var(${c})"></i>`:''}${n}</span><span>${v}</span></div>`;

// ---------------- settings & revenue model ----------------
const F={capMode:'avg',dead:0,cap:0,delay:0,ren:'0,0',growth:0,weather:'typical',grid:'packet',acres:8,leads:'market',permit:12,hard:true,vcap:0.5,flex:1};
const RM={model:'lease',tier:'mid',mk:0.10,rate:275};
const RPRE={low:[140,110,60],mid:[180,150,100],high:[230,190,120]};
const rates=()=>RPRE[RM.tier];
const WX={typical:[1,1],windy:[1.15,1],calmw:[0.8,1],sunny:[1,1.1],cloudy:[1,0.85],poor:[0.8,0.85]};
const perMWh=r=>r*1000/730;
function scBase(){const s={growth:F.growth,delay:F.delay};if(F.flex!==1)s.flex=F.flex;const w=WX[F.weather];if(w[0]!==1)s.windScale=w[0];if(w[1]!==1)s.solarScale=w[1];
  const GG=effGrid();if(GG==='calm')s.packetEvents=false;if(GG==='tight')s.capFrac=0.4;if(GG==='wave')s.extra=[{startDay:212,days:14,startHour:14,hours:8,frac:0.5}];if(F.hard){s.wxWin=LULL.wx();s.hourEvents=LULL.ev();}return s;}
const isDefault=()=>!F.growth&&!F.delay&&F.ren==='0,0'&&F.weather==='typical'&&effGrid()==='packet'&&F.leads==='packet'&&F.permit<=14&&!F.hard&&F.flex===1;
const RXC=new Map();
function resX(){const key=[F.ren,F.leads,F.permit].join('|');if(RXC.has(key))return RXC.get(key);const [w,so]=F.ren.split(',').map(Number);const r=JSON.parse(JSON.stringify(RES));r.wind.available_month+=w;r.utility_solar.available_month+=so;
  const L=LEADS[F.leads]||{};for(const k in L)r[k].available_month=L[k];for(const g of GASK)r[g].available_month=Math.max(r[g].available_month,F.permit);const cm=F.leads==='market'?COMM:0;if(cm){for(const g of GASK)r[g].available_month+=cm;r.battery_4h.available_month+=cm;}RXC.set(key,r);return r;}
const TSC={};function tierSums(open){const kx=open+'|'+F.flex;if(TSC[kx])return TSC[kx];const s=[0,0,0];for(let h=open*730;h<87600;h++){const k=Math.floor(h/730)-open,f=Math.min(1,1/3+k/15),r=h%8760,t1=REF.t1[r]*f*F.flex,t2=REF.t2[r]*f*F.flex;s[0]+=REF.load[r]*f-t1-t2;s[1]+=t1;s[2]+=t2;}return TSC[kx]=s;}
// rent by tier (lease and pass-through models), from tier MWh served
function rentOf(t0,t1,t2){const r=rates();return perMWh(r[0])*t0+perMWh(r[1])*t1+perMWh(r[2])*t2;}
// money for a result z: z.mt = [t0,t1,t2] MWh served by tier, z.total power cost, z.unmet
function econ(z,model){const M=model||RM.model,served=z.mt[0]+z.mt[1]+z.mt[2];let rev,profit,label;
  if(M==='hybrid'){const r=rates(),sh1=served?z.mt[1]/served:0;rev=perMWh(r[0])*z.mt[0]+perMWh(r[1])*z.mt[1]+sh1*z.total*(1+RM.mk)+RM.rate*z.mt[2];profit=rev-z.total-z.unmet;}
  else if(M==='lease'){rev=rentOf(...z.mt);profit=rev-z.total-z.unmet;}
  else if(M==='pass'){const rent=rentOf(...z.mt);rev=rent+z.total*(1+RM.mk);profit=rent+RM.mk*z.total-z.unmet;}
  else {rev=RM.rate*served;profit=rev-z.total-z.unmet;}
  return {rev,profit,served};}
function tierServed(R){let a=0,b=0,c=0;for(let t=0;t<87600;t++){const L=R.I.L[t];if(L<=0)continue;let t1=R.I.t1[t],t2=R.I.t2[t]-R.O.cur[t],t0=L-R.I.t1[t]-R.I.t2[t];let u=R.O.unserved[t];let x=Math.min(u,t2);t2-=x;u-=x;x=Math.min(u,t1);t1-=x;u-=x;t0-=Math.min(u,t0);a+=t0;b+=t1;c+=t2;}return [a,b,c];}

// ---------------- engine ----------------
const cache=new Map();
function run(open,caps,policy,mode,extra,rental,outages,ctl){const b0=scBase(),sc={...b0,...(extra||{})},RX=resX();if(extra){if(b0.wxWin&&extra.wxWin)sc.wxWin=b0.wxWin.concat(extra.wxWin);if(b0.hourEvents&&extra.hourEvents)sc.hourEvents=b0.hourEvents.concat(extra.hourEvents);}const key=[open,JSON.stringify(caps),policy,mode,JSON.stringify(sc),F.ren,F.leads,F.permit,JSON.stringify(rental||0),JSON.stringify(outages||0),JSON.stringify(ctl||0)].join('|');if(cache.has(key))return cache.get(key);
  const I=E.buildInputs(REF,open,sc);const O=E.dispatch(I,RX,caps,policy,mode,1000,rental,outages,ctl);const A=E.account(I,RX,caps,O);const R={I,O,A,caps,open,policy,mode};
  if(cache.size>48)cache.delete(cache.keys().next().value);cache.set(key,R);return R;}
function annKg(R){const a=[];for(let y=0;y<10;y++){let co=0,d=0;for(let t=y*8760;t<(y+1)*8760;t++){co+=R.A.co2[t];d+=R.I.L[t]-R.O.cur[t]-R.O.unserved[t]+0.05*R.O.rel[t];}a.push(d>1?1000*co/d:0);}return a;}
function zOf(R){const z=E.summarize(R.I,R.O,R.A);z.mt=tierServed(R);z.unmet=z.uns*UNMET;z.akg=annKg(R);z.akgMax=Math.max(...z.akg);{let w=0,so=0,l=0;for(let t=0;t<87600;t++){w+=R.O.wind[t];so+=R.O.solar[t];l+=R.I.L[t]-R.O.cur[t]-R.O.unserved[t];}z.vs=l>0?(w+so)/l:0;}return z;}
const capKg=s=>F.capMode==='year'?Math.max(...(s.akg||[0])):s.combined_electricity_co2_kg_per_mwh;const zCap=z=>F.capMode==='year'?z.akgMax:z.kg;
function sizeUp(open,b){let caps={...b.caps};const added={gas_engine:0,gas_turbine:0,fuel_cell:0};let R,fits=true,why='',det='',stale=false;const never=b.policy==='never',RX=resX();
  const OPT=[['gas_engine',60,5],['gas_turbine',75,25],['fuel_cell',30,5]];
  for(let it=0;it<10;it++){R=run(open,caps,b.policy,b.mode);stale=false;let need=0,m0=-1;
    for(let t=0;t<87600;t++){const n=R.O.unserved[t]+(never?R.O.cur[t]:0);if(n>0.05&&m0<0)m0=R.I.month[t];if(n>need)need=n;}
    if(need<0.05)break;let done=false,late=null;
    for(const [k,cap,step] of OPT){const room=cap-(caps[k]||0);if(room<=0)continue;
      if(Math.max(open,RX[k].available_month)>m0){late=late||k;continue;}
      const add=Math.min(room,Math.ceil(need/step-1e-9)*step),c={...caps};c[k]=(c[k]||0)+add;
      if(landOf(c)>F.acres+1e-9){fits=false;why='land';done=true;break;}
      added[k]+=add;caps=c;done=true;stale=true;break;}
    if(!done){fits=false;why=late?'late':'limit';det=late?`no gas unit can be delivered and commissioned before load first goes unserved in month ${m0}`:'';break;}
    if(!fits)break;}
  if(stale)R=run(open,caps,b.policy,b.mode);
  return {R,caps,added,fits,why,det};}
function lightZ(b){const ts=tierSums(b.open);return {total:b.total_decision_cost_usd,usdPerMWh:b.decision_cost_usd_per_requested_mwh,kg:b.combined_electricity_co2_kg_per_mwh,req:b.requested_mwh,cur:b.interrupted_mwh,uns:0,co2:b.combined_operational_co2_t,cleanShare:b.clean_energy_share,mt:[ts[0],ts[1],ts[2]-b.interrupted_mwh],unmet:0,akg:b.akg,akgMax:Math.max(...(b.akg||[0])),vs:VSH[b.mix]};}
function evalBase(b,deep){const zero={gas_engine:0,gas_turbine:0};let o;
  if(isDefault()){if(!deep)o={open:b.open,base:b,R:null,caps:b.caps,added:zero,fits:true,z:lightZ(b)};else{const R=run(b.open,b.caps,b.policy,b.mode);o={open:b.open,base:b,R,caps:b.caps,added:zero,fits:true,z:zOf(R)};}}
  else{const r=sizeUp(b.open,b);o={open:b.open,base:b,R:r.R,caps:r.caps,added:r.added,fits:r.fits,why:r.why,det:r.det,z:zOf(r.R)};}
  if(landOf(o.caps)>F.acres+1e-9)o.fits=false;o.capOk=!F.cap||zCap(o.z)<=F.cap;o.e=econ(o.z);return o;}
const quick=s=>econ(lightZ(s)).profit;
function bestAt(open,deep){let pool=S.filter(s=>s.open===open&&VSH[s.mix]<=F.vcap+1e-9);if(!pool.length)return null;
  if(isDefault()){const ok=pool.filter(s=>(!F.cap||capKg(s)<=F.cap)&&landOf(s.caps)<=F.acres+1e-9);if(!ok.length)return null;return evalBase(ok.reduce((a,c)=>quick(c)>quick(a)?c:a),deep);}
  pool=pool.filter(s=>landOf(s.caps)<=F.acres+1e-9);if(!pool.length)return null;pool.sort((a,c)=>quick(c)-quick(a));const cand=[];const seen=new Set();for(const s of pool){const k=s.mix+s.battery+s.mode+s.policy;if(seen.has(k))continue;seen.add(k);cand.push(s);if(cand.length>=(deep?3:1))break;}
  if(F.cap){const c2=pool.filter(s=>capKg(s)<=F.cap*0.8&&!cand.includes(s));if(c2.length)cand.push(c2[0]);}
  let best=null;for(const b of cand){const o=evalBase(b,true);const sc=(o.fits?0:-1e12)+(o.capOk?0:-1e11)+o.e.profit;if(!best||sc>best.sc)best={...o,sc};}return best;}
const feasible=r=>r&&r.fits&&r.capOk&&r.z.uns<0.5;
const inDeadline=o=>!F.dead||o+10<=F.dead;

// ---------------- STEP 1 ----------------
const syncs=[];
function sel(id,opts,get,set){const el=$(id);el.innerHTML=opts.map(o=>`<option value="${o.v}">${o.l}</option>`).join('');el.onchange=()=>{const o=opts.find(x=>String(x.v)===el.value);set(o.v);};syncs.push(()=>{el.value=String(get());});}
sel('s-dead',[{v:0,l:'No deadline'},...OPENS.map(o=>({v:o+10,l:'Month '+(o+10)+(o===20?' (packet target)':'')}))],()=>F.dead,v=>{F.dead=v;step1();});
sel('s-cap',[{v:0,l:'No limit'},{v:384,l:'Below 384 kg/MWh (US grid average)'},{v:300,l:'Below 300 kg/MWh'},{v:250,l:'Below 250 kg/MWh'},{v:200,l:'Below 200 kg/MWh'}],()=>F.cap,v=>{F.cap=v;step1();});
sel('s-delay',[{v:0,l:'On time (packet)'},{v:3,l:'3 months late'},{v:6,l:'6 months late (packet example 5)'},{v:12,l:'12 months late'}],()=>F.delay,v=>{F.delay=v;step1();});
sel('s-ren',[{v:'0,0',l:'Packet dates (wind 12, solar 24)'},{v:'12,0',l:'Wind 12 months late'},{v:'24,0',l:'Wind 24 months late'},{v:'12,12',l:'Wind and solar 12 months late'}],()=>F.ren,v=>{F.ren=v;step1();});
sel('s-growth',[{v:0,l:'Flat (packet)'},{v:0.03,l:'+3% a year'},{v:0.05,l:'+5% a year'},{v:0.1,l:'+10% a year'}],()=>F.growth,v=>{F.growth=v;step1();});
sel('s-weather',[{v:'typical',l:'Typical (packet 2023 profiles)'},{v:'windy',l:'Windier: wind +15%'},{v:'calmw',l:'Low wind: wind −20%'},{v:'sunny',l:'Sunnier: solar +10%'},{v:'cloudy',l:'Cloudier: solar −15%'},{v:'poor',l:'Poor renewables'}],()=>F.weather,v=>{F.weather=v;step1();});
sel('s-grid',[{v:'packet',l:'Packet: 7 events a year at 60%'},{v:'calm',l:'Calm: no stress events'},{v:'tight',l:'Tighter: events at 40%'},{v:'wave',l:'Plus a 2-week August heat wave'}],()=>effGrid(),v=>{F.grid=v;step1();});
sel('q-capmode',[{v:'avg',l:'10-year average (packet)'},{v:'year',l:'Every year (stricter)'}],()=>F.capMode,v=>{F.capMode=v;step1();});
sel('q-cap',[{v:0,l:'No limit'},{v:384,l:'Below 384 kg/MWh (US grid average)'},{v:300,l:'Below 300 kg/MWh'},{v:250,l:'Below 250 kg/MWh'},{v:200,l:'Below 200 kg/MWh'}],()=>F.cap,v=>{F.cap=v;step1();});
sel('q-acres',[{v:5,l:'5 acres'},{v:8,l:'8 acres (packet)'},{v:12,l:'12 acres'},{v:20,l:'20 acres'}],()=>F.acres,v=>{F.acres=v;step1();});
sel('q-delay',[{v:0,l:'On time: month 18 (packet)'},{v:3,l:'3 months late'},{v:6,l:'6 months late'},{v:12,l:'12 months late'}],()=>F.delay,v=>{F.delay=v;step1();});
function setSummary(){const G=effGrid(),p=[F.dead?`full campus by month ${F.dead}`:'',F.cap?`carbon < ${F.cap} kg ${F.capMode==='year'?'every year':'10-yr avg'}`:'',F.delay?`grid ${F.delay} mo late`:'',F.ren!=='0,0'?'contracts late':'',F.growth?`demand +${F.growth*100}%/yr`:'',F.weather!=='typical'?'weather: '+F.weather.replace('calmw','low wind'):'',G!=='packet'?{calm:'calm grid',tight:'tighter events',wave:'heat wave'}[G]:'',F.leads==='packet'?'packet equipment timelines':'',F.permit!==12?`air permit ${F.permit} mo`:'',F.hard?'':'stress and drought tests off',F.vcap!==0.5?(F.vcap<1?`wind and solar cap ${Math.round(F.vcap*100)}%`:'no wind and solar cap'):''].filter(Boolean);
  $('set-sum').textContent=p.length?p.join(' · '):'Market equipment timing, 12 month air permit, reliability tests on, wind and solar capped at 50%, no carbon limit';}

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
    const fixed=(r.capex_usd_per_kw*crf(0.08,r.life_years)+r.fom_usd_per_kw_year);const maxMW={wind:200,utility_solar:150,nuclear:25,battery_4h:r.max_mw,fuel_cell:30,gas_engine:60,gas_turbine:75}[k];
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
  $('models').classList.add('cmp');$('models').innerHTML=M.map(([k,t,d,w])=>`<button type="button" class="model" data-m="${k}" aria-pressed="${RM.model===k}" ${k==='export'?'disabled':''}><span class="t">${t}${k===best?'<span class="pill rec">best profit</span>':''}</span><span class="d">${d}</span><span class="who">${w}</span>${PF[k]!=null?`<span class="mp"><b>${money(PF[k])}</b> profit, 10 yrs${k!==best?` <span class="down">${sgn(PF[k]-PF[best])}</span>`:''}</span>`:''}</button>`).join('');
  const nb=cr?Object.keys(PF).filter(k=>k!==best).reduce((a,b)=>PF[b]>PF[a]?b:a):null,bm=best?M.find(m=>m[0]===best):null;
  $('mrec').innerHTML=cr?`<p class="muted sm" style="margin:-4px 0 8px">Click a model to use it. The tag marks the highest profit${best==='pass'?'. Pass-through assumes the same rent as a plain lease; real pass-through tenants usually pay less':''}.</p>`:busy('Working out revenue for this site…');
  if($('m-use'))$('m-use').onclick=()=>{RM.model=best;drawModels();step1(true);};
  $('models').querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{RM.model=b.dataset.m;drawModels();step1(true);});
  const RT={low:[140,110,60],mid:[180,150,100],high:[230,190,120]},rr=RT[RM.tier]||RT.mid;
  const MN={lease:'Capacity lease',pass:'Lease + pass-through',bundled:'All-in per MWh',hybrid:'Combined, by tier'},USE={lease:['tier'],pass:['tier','mk'],bundled:['rate'],hybrid:['tier','mk','rate']}[RM.model]||[];
  const seg=(id,opts,cur,on)=>`<div class="pseg" role="group">`+opts.map(([v,l])=>`<button type="button" data-pp="${id}" data-v="${v}" aria-pressed="${String(cur)===String(v)}" ${on?'':'disabled'}>${l}</button>`).join('')+`</div>`;
  const box=(id,title,body)=>{const on=USE.includes(id);return `<div class="pp${on?'':' off'}"><div class="pph"><span>${title}</span>${on?'':`<em>Not used by ${MN[RM.model]}</em>`}</div>${body(on)}</div>`;};
  const tierBox=box('tier','Rent per kW per month',on=>seg('tier',[['low','Low'],['mid','Mid'],['high','High']],RM.tier,on)+`<div class="rtab"><span>Always on<b>$${rr[0]}</b></span><span>Movable<b>$${rr[1]}</b></span><span>Batch<b>$${rr[2]}</b></span></div><div class="hint">Market range is $110 to $220 base rent, with CBRE asking rents above $200. The movable and batch discounts are our assumption.</div>`);
  const mkBox=box('mk','Markup on power passed through',on=>seg('mk',[[0,'At cost'],[0.05,'5%'],[0.1,'10%'],[0.2,'20%']],RM.mk,on));
  const rateBox=box('rate','All in price per MWh'+(RM.model==='hybrid'?' (batch)':''),on=>seg('rate',[225,250,275,300,350].map(v=>[v,'$'+v]),RM.rate,on)+`<div class="hint">$275 is about the mid lease plus average power cost</div>`);
  $('mparams').innerHTML=`<div class="ppwrap">`+tierBox+mkBox+rateBox+`</div>`;
  $('mparams').querySelectorAll('[data-pp]').forEach(b=>b.onclick=()=>{const k=b.dataset.pp,v=b.dataset.v;if(k==='tier')RM.tier=v;else if(k==='mk')RM.mk=+v;else RM.rate=+v;drawModels();step1(true);});
}

let rows=[],recO=null,chosen=null,token=0;
function syncQ(){const m=$('q-model'),t=$('q-tier');if(!m)return;m.value=RM.model;t.value=RM.model==='bundled'?String(RM.rate):RM.tier;
  t.innerHTML=RM.model==='bundled'?[225,250,275,300,350].map(v=>`<option value="${v}">$${v} per MWh delivered</option>`).join(''):`<option value="low">Low: $140 / $110 / $60 per kW-mo</option><option value="mid">Mid: $180 / $150 / $100</option><option value="high">High: $230 / $190 / $120</option>`;
  t.value=RM.model==='bundled'?String(RM.rate):RM.tier;$('q-tierl').textContent=RM.model==='bundled'?'Price to tenants':'Rent level (always-on / movable / batch)';}
if($('q-model'))$('q-model').onchange=e=>{RM.model=e.target.value;drawModels();step1(true);};
if($('q-tier'))$('q-tier').onchange=e=>{if(RM.model==='bundled')RM.rate=+e.target.value;else RM.tier=e.target.value;drawModels();step1(true);};
// ---------------- site screening (team; sample sites + cited Texas policy outside the packet) ----------------
const SITES=[
 {id:'wc',nm:'Williamson County campus',src:'Packet site · ERCOT, Central Texas',tag:'packet',delay:0,acres:8,perm:60,
  f:['Grid 25 MW at month 18, full 75 MW at month 30','8 acres for onsite power: about 75 MW of turbines fit','Packet prices, wind, solar and stress events'],ix:'Packet grid schedule; it already stands in for permitting and utility upgrades.'},
 {id:'bf',nm:'Brownfield by a substation',src:'Sample site · team assumption',tag:'sample',delay:0,acres:5,perm:70,
  f:['Existing substation: grid on the packet schedule','Only 5 acres: about 50 MW of turbines fit','Former industrial land: fewer new permits (assumed)'],ix:'Existing substation, so less new utility build-out (assumed).'},
 {id:'gf',nm:'Greenfield with room to grow',src:'Sample site · team assumption',tag:'sample',delay:12,acres:20,perm:35,
  f:['New substation and line: grid 12 months later','20 acres: room for a full onsite gas bridge','New easements and site permits (assumed)'],ix:'New line and substation: highest direct connection cost, paid 100% by the customer under SB 6.'},
 {id:'ww',nm:'West Texas wind corridor',src:'Sample site · team assumption',tag:'sample',delay:6,acres:12,perm:45,
  f:['Congested transmission: grid 6 months later','12 acres for onsite power','Uses packet prices and profiles; local wind not modelled'],ix:'Transmission constraints in the area slow the upgrade (assumed).'}];
const DIMS=[['power','Speed to power','--s-grid'],['land','Land for onsite power','--s-wind'],['perm','Permits & interconnection','--s-rel'],['policy','Policy risk','--s-gas']];
const SW={power:3,land:2,perm:3,policy:2};let siteId='wc',alertOff=false,popK=null;const PROF={},EXR={};
const dimScore=(st,k)=>k==='power'?({0:85,3:70,6:55,12:25}[st.delay]??40):k==='land'?({5:40,8:65,12:80,20:95}[st.acres]??60):k==='perm'?st.perm:30;
const comp=st=>{let a=0,w=0;for(const [k] of DIMS){a+=SW[k]*dimScore(st,k);w+=SW[k];}return w?a/w:0;};
function pathSteps(st){return [['Secure the land','todo','Real estate counsel'],['ERCOT audit disclosures','now','Regulatory counsel'],['Grid connection request (~$4M security + study)','todo','Interconnection engineer'],['Air permit for onsite gas','paused','Air permitting consultant'],['Water and stormwater permits','paused','Environmental consultant'],['Emergency backup plan','todo','Grid operations advisor']].map(([t,st2,ex])=>[t,'',st2,ex]);}
const pKey=(d,a)=>[d,a,RM.model,RM.tier,RM.mk,RM.rate,F.flex].join('|');
const curSite=()=>SITES.find(x=>x.id===siteId),siteMatch=st=>st.delay===F.delay&&st.acres===F.acres;
const PRESETS=[['bal','Balanced',{power:3,land:2,perm:3,policy:2}],['speed','Speed first',{power:5,land:1,perm:2,policy:1}],['room','Room to grow',{power:1,land:5,perm:2,policy:1}],['perm','Easiest permits',{power:1,land:1,perm:5,policy:3}]];let preset='bal';
const RATE={power:['Fast','Medium','Slow'],land:['Roomy','Enough','Tight'],perm:['Easier','Typical','Hard'],policy:['Low risk','Some risk','High risk']};
const ICO={power:'⚡',land:'▦',perm:'📄',policy:'⚖'};
const lvl=v=>v>=70?0:v>=45?1:2,LC=['var(--good)','#c98500','var(--bad)'];
const ring=v=>{const r=21,c=2*Math.PI*r,col=LC[lvl(v)];return `<svg class="ring" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="${r}" fill="none" stroke="var(--rule)" stroke-width="5"/><circle cx="26" cy="26" r="${r}" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(c*v/100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 26 26)"/><text x="26" y="31" text-anchor="middle">${fmt(v,0)}</text></svg>`;};
function drawScreen(){drawPortfolio();}
function step1(moneyOnly){syncs.forEach(f=>f());syncQ();setSummary();renderHeader();drawScreen();const tok=++token;
  if(moneyOnly&&rows.length&&rows.every(r=>r.done)){rows.forEach(r=>{if(r.r)r.r.e=econ(r.r.z);});pickRec();drawCards();return;}
  rows=OPENS.map(o=>({o,r:null,done:false}));drawCards();let i=0;
  const st=()=>{if(tok!==token)return;if(i<rows.length){rows[i].r=bestAt(rows[i].o,false);rows[i].done=true;i++;drawCards();setTimeout(st,4);return;}pickRec();drawCards();};setTimeout(st,10);}
function pickRec(){const ok=rows.filter(r=>feasible(r.r)&&inDeadline(r.o));recO=ok.length?ok.reduce((a,b)=>b.r.e.profit>a.r.e.profit?b:a).o:null;if(chosen==null||!ok.find(r=>r.o===chosen))chosen=recO;}
function drawCards0(){const all=rows.every(r=>r.done);if(all){pickRec();}drawStarts();drawPipe(chosen);$('go-2').disabled=chosen==null||!all;
  if(!all){$('rec').innerHTML=busy(`Evaluating start months… ${rows.filter(r=>r.done).length} of ${rows.length}`);$('o-why').innerHTML='';$('infra').innerHTML='';return;}
  if(recO==null){$('rec').innerHTML='<div class="note bad">No start month meets these limits. Loosen the carbon limit, land or deadline.</div>';$('o-why').innerHTML='';$('infra').innerHTML='';return;}
  const c=rows.find(r=>r.o===chosen).r,z=c.z,e=c.e,isRec=chosen===recO,R0=rows.find(r=>r.o===recO).r;
  const mtxt={lease:'capacity lease',pass:'lease with power pass-through',bundled:'all-in price per MWh',hybrid:'combined model by tier'}[RM.model];
  const capex=capexOf(c.caps);
  const pv=rows.slice().reverse().find(r=>r.o<chosen&&feasible(r.r)),nx=rows.find(r=>r.o>chosen&&feasible(r.r));
  $('rec').innerHTML=`<div class="rech"><div>${isRec?'':'<div class="reclbl">Your pick</div>'}<div class="recbig">Open at month ${chosen}</div>
      ${isRec?'':`<p class="sub">Month ${recO} earns ${money(R0.e.profit-e.profit)} more profit.</p>`}</div></div>
    <div class="why">${[pv||'E',{o:chosen,r:c},nx||'L'].map(r=>{if(typeof r==='string')return `<div class="wcol off"><span class="wh">${r==='E'?'Open earlier':'Wait'}</span><span class="wmsg">${r==='E'?(rows.some(q=>q.o<chosen)?'No earlier month works':'No earlier month tested'):(rows.some(q=>q.o>chosen)?'No later month works':'No later month tested')}</span></div>`;const me=r.o===chosen,d=k=>me?'':`<span class="${(k==='cost'?-1:1)*(k==='rev'?r.r.e.rev-c.e.rev:k==='cost'?r.r.z.total-c.z.total:r.r.e.profit-c.e.profit)>0?'up':'down'}">${sgn(k==='rev'?r.r.e.rev-c.e.rev:k==='cost'?r.r.z.total-c.z.total:r.r.e.profit-c.e.profit)}</span>`;
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
function drawRampOld(o){const W=900,H=96,P={l:8,r:8,t:22,b:20},iw=W-P.l-P.r,x=m=>P.l+iw*m/120,y=v=>P.t+(H-P.t-P.b)*(1-v/75),full=o+10,d=F.delay;
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
      if(ok&&w>40){const pm=(y(z.total)+y(z.total+pr))/2,cm=(y(0)+y(z.total))/2;s+=`<text x="${cx}" y="${pm+5}" text-anchor="middle" style="fill:#fff;font-size:${sel?15:13}px;font-weight:${sel?700:500}">${money(e.profit)}</text><text x="${cx}" y="${cm+4}" text-anchor="middle" style="fill:#fff;font-size:${sel?13:11.5}px;font-weight:${sel?700:500}">${money(z.total)}</text>`;}
      s+=`<text x="${cx}" y="${y(Math.max(e.rev,0))-7}" text-anchor="middle" class="${sel?'ink':''}" style="font-weight:${sel?600:400}">${ok?money(e.rev):!inDeadline(r.o)?'Late':failLbl(r.r)}</text>`;}
    else s+=`<text x="${cx}" y="${y(0)-8}" text-anchor="middle">no fit</text>`;
    s+=`<text x="${cx}" y="${H-22}" text-anchor="middle" class="${sel?'ink':''}" style="font-weight:${sel?600:400}">Month ${r.o}</text>${r.o===recO?`<rect x="${cx-46}" y="${H-15}" width="92" height="14" rx="7" fill="var(--accent)"/><text x="${cx}" y="${H-6}" text-anchor="middle" style="fill:var(--accent-ink);font-size:10px">Highest profit</text>`:r.o===20?`<text x="${cx}" y="${H-6}" text-anchor="middle" style="font-size:10px">Packet target</text>`:''}`;
    if(sel)s+=`<rect x="${x+2}" y="${P.t-8}" width="${bw-4}" height="${ih+30}" rx="5" fill="none" stroke="var(--accent)" stroke-width="1.5"/>`;
    s+=`<rect class="col" data-o="${r.o}" x="${x}" y="0" width="${bw}" height="${H}" fill="transparent" style="cursor:pointer"/>`;});
  s+=`<line class="ax" x1="${P.l}" x2="${W-P.r}" y1="${y(0)}" y2="${y(0)}"/>`;
  box.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenue, power cost and profit by start month">${s}</svg>`;
  box.querySelectorAll('.col').forEach(el=>{el.onclick=()=>{const r=rows.find(q=>q.o===+el.dataset.o);if(r&&r.done&&r.r){chosen=r.o;drawCards();}};
    el.onmousemove=e=>{const r=rows.find(q=>q.o===+el.dataset.o);if(!r||!r.done||!r.r)return;const z=r.r.z,ee=r.r.e;tipAt(box,`<div class="h">Start month ${r.o} · full campus ${r.o+10}</div>${row('Revenue',money(ee.rev),'--rev')}${row('Power cost',money(z.total),'--cost')}${row('Profit',money(ee.profit),'--good')}${row('Carbon',fmt(z.kg,0)+' kg/MWh')}${row('Onsite gas',fmt(gasOf(r.r.caps))+' MW')}${row('Land',fmt(landOf(r.r.caps),1)+' acres')}`,e);};el.onmouseleave=()=>hideTip(box);});}
// ---------------- site layout planner (interactive) ----------------
// Power yard: each square is 0.05 acre (packet land use: gas 0.05-0.1 acre/MW, battery 0.15 acre/MW); 20 squares = 1 acre per row.
// Campus zone: data center buildings, illustrative footprints only (team extension, not costed).
const TOK={gas_turbine:{n:'Gas turbine',mw:25,w:10,h:5,max:75,c:'--s-gas',z:'p'},battery_4h:{n:'Battery',mw:12,w:6,h:6,max:(RES.battery_4h.max_mw||12),c:'--s-bat',z:'p'},gas_engine:{n:'Gas engine',mw:5,w:5,h:1,max:60,c:'--s-gas',z:'p'},fuel_cell:{n:'Fuel cell',mw:5,w:5,h:1,max:30,c:'--s-gas',z:'p'},
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

// ---------------- STEP 2: run the plant (board level) ----------------
// The CEO decides contracts, battery and a carbon cap. Operations then picks how gas runs and when batch
// work may pause (the cheapest of the tested operating rules that meets the cap).
let plant=null;   // {open, mix, battery, cap, at, attrs, cur, start}
const LIMDEF=384; const lim=()=>plant.cap||LIMDEF;
const PC=new Map();
function opsBest(mix,battery,cap){const pool=S.filter(s=>s.open===plant.open&&s.mix===mix&&s.battery===battery);if(!pool.length)return null;
  const ok=cap?pool.filter(s=>capKg(s)<=cap):pool;
  if(!ok.length)return {s:pool.reduce((a,c)=>capKg(c)<capKg(a)?c:a),miss:true};
  return {s:ok.reduce((a,c)=>quick(c)>quick(a)?c:a),miss:false};}
function planOf(mix,battery,cap){const key=[plant.open,mix,battery,cap,JSON.stringify(F),JSON.stringify(RM)].join('|');if(PC.has(key))return PC.get(key);
  const b=opsBest(mix,battery,cap);if(!b)return null;const o=evalBase(b.s,true);o.attrs={mix,battery,mode:b.s.mode,policy:b.s.policy};o.miss=b.miss;o.mo=monthly(o.R);PC.set(key,o);return o;}
function tierServedW(R,lo,hi){let a=0,b=0,c=0;for(let t=lo;t<hi;t++){const L=R.I.L[t];if(L<=0)continue;let t1=R.I.t1[t],t2=R.I.t2[t]-R.O.cur[t],t0=L-R.I.t1[t]-R.I.t2[t];let u=R.O.unserved[t];let x=Math.min(u,t2);t2-=x;u-=x;x=Math.min(u,t1);t1-=x;u-=x;t0-=Math.min(u,t0);a+=t0;b+=t1;c+=t2;}return [a,b,c];}
function win(o,m0,m1){const R=o.R,lo=m0*730,hi=m1*730,z=E.summarize(R.I,R.O,R.A,lo,hi);z.mt=tierServedW(R,lo,hi);z.unmet=z.uns*UNMET;z.e=econ(z);z.yrs=(m1-m0)/12;return z;}
const CAT=[['grid','Grid power','--s-grid'],['con','Wind, solar, nuclear contracts','--s-wind'],['fuel','Gas fuel','--s-gas'],['fix','Equipment (gas, battery)','--ink-3'],['work','Moved or paused work','--s-int']];
function monthly(R){const I=R.I,O=R.O,A=R.A,n=120,M={};for(const k of ['grid','con','fuel','fix','work','req','co2','den','gas','uns','curt'])M[k]=new Float64Array(n);
  const RX=resX(),pw=RX.wind.payment_usd_per_mwh,ps=RX.utility_solar.payment_usd_per_mwh,c=R.caps;
  for(let t=0;t<87600;t++){const i=Math.floor(t/730);M.grid[i]+=A.cGrid[t];M.con[i]+=A.cCon[t];M.fuel[i]+=A.cGas[t];M.fix[i]+=A.cFix[t];M.work[i]+=A.relCost[t]+A.intCost[t];M.req[i]+=I.L[t];M.co2[i]+=A.co2[t];
    M.den[i]+=I.L[t]-O.cur[t]-O.unserved[t]+0.05*O.rel[t];M.gas[i]+=O.fuel_cell[t]+O.gas_engine[t]+O.gas_turbine[t];M.uns[i]+=O.unserved[t];
    if(I.month[t]>=Math.max(R.open,RX.wind.available_month)&&c.wind)M.curt[i]+=Math.max(0,c.wind*I.wcf[t]-O.wind[t])*pw;
    if(I.month[t]>=Math.max(R.open,RX.utility_solar.available_month)&&c.utility_solar)M.curt[i]+=Math.max(0,c.utility_solar*I.scf[t]-O.solar[t])*ps;}
  M.kg=Array.from(M.co2,(v,i)=>M.den[i]>0?1000*v/M.den[i]:0);return M;}
const sumM=(a,m0,m1)=>{let s=0;for(let i=Math.max(0,m0);i<m1;i++)s+=a[i];return s;};

function startPlant(o){const r=rows.find(x=>x.o===o).r;showStep(2);$('c-head').innerHTML=busy('Starting the plant…');['c-plant','c-alerts','c-cost','c-decs'].forEach(id=>$(id).innerHTML='');
  setTimeout(()=>{plant={open:o,mix:r.base.mix,battery:r.base.battery,cap:F.cap,at:Math.min(119,Math.max(o+13,30+F.delay+6))};const p0=planOf(plant.mix,plant.battery,plant.cap)||evalBase(r.base,true);
    if(!p0.attrs){p0.attrs={mix:r.base.mix,battery:r.base.battery,mode:r.base.mode,policy:r.base.policy};p0.mo=monthly(p0.R);}
    plant.start=p0;setPlan(p0);drawRun();setStatus();if(afterPlant===3){afterPlant=null;showStep(3);}},20);}
function setPlan(o){plant.cur=o;plant.attrs=o.attrs;plant.mix=o.attrs.mix;plant.battery=o.attrs.battery;}

function drawRun(){const p=plant,o=p.cur,M=o.mo,at=p.at,WN=p.win||12,lo=Math.max(p.open,at-WN),L=lim();
  const w12=win(o,lo,at),wPrev=at-WN>p.open?win(o,Math.max(p.open,at-2*WN),at-WN):null,co5=sumM(M.co2,Math.max(p.open,at-12),at),de5=sumM(M.den,Math.max(p.open,at-12),at),kg5=de5?1000*co5/de5:0;
  const months=[];for(let m=Math.max(p.open,at-12);m<at;m++)months.push(m);const over=months.filter(m=>M.kg[m]>L);
  const opts=[];for(let m=p.open+3;m<=119;m+=1)opts.push(m);
  const dd=(a,b,good)=>{if(b==null)return '';const x=a-b;if(Math.abs(x)<0.05*Math.abs(b)/10)return '<span class="muted">flat vs prior period</span>';return `<span class="${(x<0)===good?'up':'down'}">${x>0?'▲':'▼'} ${fmt(Math.abs(100*x/b),0)}% vs prior ${WN} mo</span>`;};
  $('c-head').innerHTML=`<div class="rhead"><div><p class="eyebrow">Plant running · opened month ${p.open} · full campus month ${p.open+10}</p>
     <h2>Board review, month ${at} <span class="muted" style="font-size:16px;font-weight:500">(year ${Math.floor(at/12)+1})</span></h2>
     <p class="sub">Plan: ${buildText(o.caps)}. Figures cover the last ${at-lo} months unless marked.</p></div>
     <div class="in" style="width:200px"><label for="c-at">Review at</label><select id="c-at">${opts.map(m=>`<option value="${m}" ${m===at?'selected':''}>Month ${m} · year ${Math.floor(m/12)+1}</option>`).join('')}</select></div></div>
   <div class="kpis" style="margin-top:10px">
    <div class="kpi hi"><div class="k">Power cost per MWh</div><div class="v">$${fmt(w12.usdPerMWh,1)}</div><div class="s">${wPrev?dd(w12.usdPerMWh,wPrev.usdPerMWh,true):'first period'}</div></div>
    <div class="kpi"><div class="k">Power bill, per year (annualized)</div><div class="v">${money(w12.total/w12.yrs)}</div><div class="s">all energy, contracts, equipment</div></div>
    <div class="kpi"><div class="k">Profit, per year <span class="tag">team</span></div><div class="v">${money(w12.e.profit/w12.yrs)}</div><div class="s">revenue ${money(w12.e.rev/w12.yrs)}</div></div>
    <div class="kpi ${o.z.kg>L?'bad':''}"><div class="k">Carbon, 10-year average</div><div class="v">${fmt(o.z.kg,0)}<small> kg/MWh</small> ${o.z.kg<=L?'<span class="up" style="font-size:14px">✓</span>':''}</div><div class="s">${p.cap?`cap ${L}`:'US grid average 384'} · last 12 months ${fmt(kg5,0)}${kg5>L&&at<=30+F.delay+3?' (grid ramp-up)':''}</div></div>
    <div class="kpi ${w12.uns>1?'bad':''}"><div class="k">Demand met</div><div class="v">${fmt(100*(1-w12.uns/Math.max(w12.req,1)),2)}<small>%</small></div><div class="s">${w12.cur>1?fmt(w12.cur,0)+' MWh batch paused':'no batch work paused'}</div></div>
   </div>`;
  $('c-at').onchange=e=>{plant.at=+e.target.value;drawRun();};
  $('c-win').innerHTML=[3,6,12,24].map(v=>`<button type="button" data-v="${v}" aria-pressed="${v===WN}">${v} mo</button>`).join('');
  $('c-win').querySelectorAll('button').forEach(b=>b.onclick=()=>{p.win=+b.dataset.v;drawRun();});$('c-wlab').textContent=`last ${at-lo} months, to month ${at}`;
  drawPlantPic(o,lo,at);drawCostChart(o,at);drawEnv(o,lo,at);$('env-imp').innerHTML=busy('Projecting impacts…');
  $('c-alerts').innerHTML=busy('Checking the plant…');$('c-decs').innerHTML=busy('Costing board decisions…');
  setTimeout(()=>drawAlertsDecs(over,months,kg5),20);}

// ---- imagery: the plant as a picture, flows sized by energy over the window ----
const ICON={
 grid:c=>`<path d="M-10 18 L-4 -16 L4 -16 L10 18 M-7 4 L7 4 M-5 -6 L5 -6 M-14 -12 L14 -12 M-14 -2 L14 -2 M-7 4 L4 -16 M7 4 L-4 -16" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>`,
 wind:c=>`<path d="M0 -4 L-2 20 L2 20 Z" fill="${c}"/><g stroke="${c}" stroke-width="3.2" stroke-linecap="round"><line x1="0" y1="-4" x2="0" y2="-20"/><line x1="0" y1="-4" x2="14" y2="4"/><line x1="0" y1="-4" x2="-14" y2="4"/></g><circle cx="0" cy="-4" r="2.6" fill="var(--panel)" stroke="${c}" stroke-width="1.6"/>`,
 utility_solar:c=>`<path d="M-17 8 L-9 -12 L17 -12 L9 8 Z" fill="${c}" opacity=".9"/><path d="M-13 -2 L13 -2 M-4 -12 L-8 8 M4 -12 L0 8" stroke="var(--panel)" stroke-width="1.4"/><path d="M-2 8 L-2 18 M-8 18 L4 18" stroke="${c}" stroke-width="2"/>`,
 nuclear:c=>`<path d="M-13 18 C-9 6 -9 -4 -11 -12 L11 -12 C9 -4 9 6 13 18 Z" fill="${c}" opacity=".9"/><path d="M-4 -15 C-8 -19 -2 -22 -5 -25 M4 -15 C0 -19 6 -22 3 -25" fill="none" stroke="var(--ink-3)" stroke-width="1.6" stroke-linecap="round"/>`,
 battery_4h:c=>`<rect x="-16" y="-10" width="30" height="20" rx="3" fill="none" stroke="${c}" stroke-width="2.4"/><rect x="14" y="-4" width="4" height="8" rx="1" fill="${c}"/><rect x="-12" y="-6" width="7" height="12" fill="${c}"/><rect x="-3" y="-6" width="7" height="12" fill="${c}"/>`,
 gas:c=>`<path d="M0 -20 C10 -8 13 0 10 8 C8 15 3 18 0 18 C-6 18 -11 13 -11 6 C-11 -2 -4 -6 -3 -13 C2 -8 2 -3 1 1 C4 -2 4 -8 0 -20 Z" fill="${c}"/>`,
 work:c=>`<path d="M-14 -10 L14 -10 L14 10 L-14 10 Z" fill="none" stroke="${c}" stroke-width="2"/><path d="M-6 -4 L-6 4 M0 -4 L0 4" stroke="${c}" stroke-width="3"/><path d="M5 -4 L11 0 L5 4" fill="none" stroke="${c}" stroke-width="2"/>`};
function drawPlantPic(o,m0,m1){const R=o.R,O=R.O,c=o.caps,lo=m0*730,hi=m1*730;const S2=k=>{let s=0;for(let t=lo;t<hi;t++)s+=O[k][t];return s;};
  const A=R.A,cs=a=>{let s=0;for(let t=lo;t<hi;t++)s+=a[t];return s;};const yrs=(m1-m0)/12;
  const gasE=S2('fuel_cell')+S2('gas_engine')+S2('gas_turbine'),gasMWc=gasOf(c);
  const RX=resX();const fixOf=k=>{const r=RX[k];return (c[k]||0)*1000*(r.capex_usd_per_kw*crf(0.08,r.life_years)+r.fom_usd_per_kw_year)*yrs;};
  const conOf=k=>{const r=RX[k];let s=0;const from=Math.max(R.open,r.available_month)*730;for(let t=Math.max(lo,from);t<hi;t++)s+=(c[k]||0)*(k==='wind'?R.I.wcf[t]:k==='utility_solar'?R.I.scf[t]:1)*r.payment_usd_per_mwh;return s;};
  let co2g=0;for(let t=lo;t<hi;t++)co2g+=O.grid[t]*R.I.co2[t];
  const src=[['grid','Grid power',`${fmt(gasMWc?0:0)}`,'--s-grid',S2('grid'),cs(A.cGrid),co2g,true],
    ['wind',`Wind contract · ${fmt(c.wind||0)} MW`,'','--s-wind',S2('wind'),conOf('wind'),0,!!c.wind],
    ['utility_solar',`Solar contract · ${fmt(c.utility_solar||0)} MW`,'','--s-solar',S2('solar'),conOf('utility_solar'),0,!!c.utility_solar],
    ['nuclear',`Nuclear contract · ${fmt(c.nuclear||0)} MW`,'','--s-nuc',S2('nuclear'),conOf('nuclear'),0,!!c.nuclear],
    ['battery_4h',`Battery · ${fmt(c.battery_4h||0)} MW`,'','--s-bat',S2('di'),fixOf('battery_4h'),0,!!c.battery_4h],
    ['gas',`Onsite gas · ${fmt(gasMWc)} MW`,'','--s-gas',gasE,cs(A.cGas)+GASK.reduce((a,k)=>a+fixOf(k),0),0,gasMWc>0]];
  {let g=0;for(let t=lo;t<hi;t++)g+=O.fuel_cell[t]*RX.fuel_cell.co2_t_per_mwh+O.gas_engine[t]*RX.gas_engine.co2_t_per_mwh+O.gas_turbine[t]*RX.gas_turbine.co2_t_per_mwh;src[5][6]=g;}
  const rel=S2('rel'),cur=S2('cur');const workC=cs(A.relCost)+cs(A.intCost);
  if(rel+cur>1)src.push(['work','Moved or paused work','','--s-int',rel+cur,workC,0,true]);
  let req=0;for(let t=lo;t<hi;t++)req+=R.I.L[t];
  const tot=src.reduce((a,s)=>a+(s[7]?s[4]:0),0)||1,W=780,rh=64,H=src.length*rh+8,bx=W-176,by=H/2;
  let g='';src.forEach((s,i)=>{const [k,n,,col,e,cost,co2,inPlan]=s,y=10+i*rh+rh/2,share=e/tot,sw=Math.max(inPlan&&e>0?2:0,34*share),cv=`var(${col})`;
    if(inPlan&&e>0){const x0=290,x1=bx-8,ty=by+(i-(src.length-1)/2)*7;g+=`<path d="M${x0},${y} C${(x0+x1)/2},${y} ${(x0+x1)/2},${ty} ${x1},${ty}" fill="none" stroke="${cv}" stroke-opacity=".55" stroke-width="${sw.toFixed(1)}"/>`;}
    g+=`<g transform="translate(26,${y})" ${inPlan?'':'opacity=".35"'}>${ICON[k](cv)}</g>`;
    g+=`<text class="lbl" x="54" y="${y-7}" ${inPlan?'':'style="fill:var(--ink-3)"'}>${n}</text>`;
    if(inPlan){g+=`<rect x="54" y="${y+2}" width="170" height="7" rx="3.5" fill="var(--rule-2)"/><rect x="54" y="${y+2}" width="${(170*Math.min(1,share)).toFixed(1)}" height="7" rx="3.5" fill="${cv}"/><text x="232" y="${y+9}" class="ink" style="font-size:12px">${fmt(100*share,0)}%</text>`;
      g+=`<text x="54" y="${y+24}">${money(cost/yrs)}/yr${co2>1?` · ${fmt(co2/yrs/1e3,1)}k t CO₂/yr`:''}</text>`;}else{g+=`<text x="54" y="${y+11}">not in plan</text>`;const w=offWhy(k,R,RX);if(w)g+=`<text x="54" y="${y+24}">${w}</text>`;}});
  // campus building
  g+=`<g transform="translate(${bx},${by-58})"><rect width="150" height="116" rx="6" fill="var(--bg)" stroke="var(--ink-2)" stroke-width="1.5"/>
    ${[0,1,2,3].map(r=>[0,1,2,3,4].map(q=>`<rect x="${14+q*26}" y="${16+r*17}" width="18" height="10" rx="1.5" fill="var(--ink-3)" opacity=".35"/><circle cx="${18+q*26}" cy="${21+r*17}" r="1.6" fill="var(--good)"/>`).join('')).join('')}
    <text x="75" y="100" text-anchor="middle" class="ink" style="font-family:var(--f-body);font-weight:600;font-size:12.5px">Campus</text></g>
   <text x="${bx+75}" y="${by+76}" text-anchor="middle">${fmt(req/((hi-lo)||1),1)} MW average</text><text x="${bx+75}" y="${by+92}" text-anchor="middle">${money(src.reduce((a,s)=>a+(s[7]?s[5]:0),0)/yrs)}/yr power</text>`;
  $('c-plant').innerHTML=`<svg viewBox="0 0 ${W} ${H+24}" role="img" aria-label="Where the plant's energy came from">${g}</svg>`;}

// ---- monthly cost per MWh with carbon strip ----
function drawCostChart(o,at){const M=o.mo,p=plant,L=lim(),W=900,H=210,P={l:44,r:8,t:10,b:20},iw=W-P.l-P.r,ih=H-P.t-P.b,m0=p.open,n=120-m0,bw=iw/n,x=i=>P.l+bw*i;
  const per=CAT.map(([k])=>Array.from({length:n},(_,i)=>M.req[m0+i]?M[k][m0+i]/M.req[m0+i]:0));
  let ym=0;for(let i=0;i<n;i++){let s=0;for(const a of per)s+=a[i];ym=Math.max(ym,s);}ym=Math.ceil(ym/20)*20||20;const y=v=>P.t+ih*(1-v/ym);
  let s='';for(const v of [0,ym/2,ym])s+=`<line class="gl" x1="${P.l}" x2="${W-P.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${P.l-5}" y="${y(v)+4}" text-anchor="end">$${fmt(v)}</text>`;
  for(let i=0;i<n;i++){let acc=0;const fut=m0+i>=at;for(let k=0;k<CAT.length;k++){const v=per[k][i];if(v<=0)continue;s+=`<rect x="${(x(i)+0.5).toFixed(1)}" y="${y(acc+v).toFixed(1)}" width="${Math.max(bw-1,0.6).toFixed(1)}" height="${(y(acc)-y(acc+v)).toFixed(1)}" fill="var(${CAT[k][2]})" ${fut?'opacity=".35"':''}/>`;acc+=v;}}
  const lab=[];for(let m=Math.ceil(m0/12)*12;m<120;m+=12)lab.push(m);s+=lab.map(m=>`<text x="${x(m-m0)}" y="${H-5}" text-anchor="middle">m${m}</text>`).join('');
  s+=`<line x1="${x(at-m0)}" x2="${x(at-m0)}" y1="${P.t-4}" y2="${P.t+ih}" stroke="var(--ink)" stroke-width="1.5"/><text x="${x(at-m0)+5}" y="${P.t+8}" class="ink">now</text><text x="${W-P.r}" y="${P.t+8}" text-anchor="end">projection →</text>`;
  // carbon strip
  const H2=70,P2={t:6,b:16},ih2=H2-P2.t-P2.b,km=Math.max(L*1.6,...M.kg.slice(m0))*1.05,y2=v=>P2.t+ih2*(1-Math.min(v,km)/km);let s2='';
  for(let i=0;i<n;i++){const v=M.kg[m0+i],bad=v>L,fut=m0+i>=at;s2+=`<rect x="${(x(i)+0.5).toFixed(1)}" y="${y2(v).toFixed(1)}" width="${Math.max(bw-1,0.6).toFixed(1)}" height="${(y2(0)-y2(v)).toFixed(1)}" fill="${bad?'var(--bad)':'var(--ink-3)'}" opacity="${fut?.3:bad?.9:.45}"/>`;}
  s2+=`<line x1="${P.l}" x2="${W-P.r}" y1="${y2(L)}" y2="${y2(L)}" stroke="var(--bad)" stroke-dasharray="5 4" stroke-width="1.3"/><text x="${W-P.r}" y="${y2(L)-4}" text-anchor="end" style="fill:var(--bad)">${plant.cap?`cap ${L} kg/MWh${F.capMode==="year"?"":" (10-yr average)"}`:`US grid average ${L} kg/MWh`}</text>`;
  s2+=`<line x1="${x(at-m0)}" x2="${x(at-m0)}" y1="${P2.t}" y2="${P2.t+ih2}" stroke="var(--ink)" stroke-width="1.5"/><text x="${P.l-5}" y="${y2(0)}" text-anchor="end">0</text><text x="${P.l}" y="${H2-3}">carbon, kg CO₂/MWh by month</text>`;
  const box=$('c-cost');box.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Power cost per MWh by month">${s}<rect class="hit" x="${P.l}" y="0" width="${iw}" height="${H}" fill="transparent"/></svg><svg viewBox="0 0 ${W} ${H2}" role="img" aria-label="Carbon by month">${s2}</svg>`;
  const svg=box.querySelector('svg');box.querySelector('.hit').onmousemove=e=>{const r=svg.getBoundingClientRect(),i=Math.max(0,Math.min(n-1,Math.floor(((e.clientX-r.left)*W/r.width-P.l)/bw))),m=m0+i;
    let tt=0;const rr=CAT.map(([k,nm,c],j)=>{tt+=per[j][i];return per[j][i]>0.05?row(nm,'$'+fmt(per[j][i],1),c):'';}).join('');
    tipAt(box,`<div class="h">Month ${m}${m>=at?' · projection':''}</div>${rr}${row('<b>Total per MWh</b>','<b>$'+fmt(tt,1)+'</b>')}${row('Carbon',fmt(M.kg[m],0)+' kg/MWh')}`,e);};
  box.querySelector('.hit').onmouseleave=()=>hideTip(box);
  $('c-costleg').innerHTML=CAT.map(([,n,c])=>`<span><i style="background:var(${c})"></i>${n}</span>`).join('');}

// ---- environmental report (all from the packet's emission factors) ----
function envSeries(R){if(R._env)return R._env;const I=R.I,O=R.O,RX=resX(),n=120,E={s1:new Float64Array(n),s2:new Float64Array(n),s3:new Float64Array(n),clean:new Float64Array(n),served:new Float64Array(n),hm:Array.from({length:n},()=>[new Float64Array(24),new Float64Array(24)])};
  const ef=GASK.map(k=>[k,RX[k].co2_t_per_mwh]);
  for(let t=0;t<87600;t++){const m=Math.floor(t/730),L=I.L[t];if(L<=0)continue;let g=0;for(const [k,f] of ef)g+=O[k][t]*f;if(O.rental)g+=O.rental[t]*0.74;
    E.s1[m]+=g;E.s2[m]+=O.grid[t]*I.co2[t];E.s3[m]+=O.rel[t]*1.05*I.co2[t];const cl=Math.max(0,O.wind[t]+O.solar[t]+O.nuclear[t]-O.ch[t]+O.di[t]),sv=L-O.rel[t]-O.cur[t]-O.unserved[t];
    E.clean[m]+=cl;E.served[m]+=sv;const h=REF.hour[t%8760];E.hm[m][0][h]+=Math.min(cl,sv);E.hm[m][1][h]+=sv;}
  R._env=E;return E;}
function drawEnv(o,lo,at){const p=plant,E=envSeries(o.R),L=lim(),s=(a,m0,m1)=>sumM(a,m0,m1);
  const yrs=(at-lo)/12,co=s(E.s1,lo,at)+s(E.s2,lo,at)+s(E.s3,lo,at),sv=s(E.served,lo,at),cfe=sv?s(E.clean,lo,at)/sv:0;
  let hm0=0,hm1=0;for(let m=lo;m<at;m++)for(let h=0;h<24;h++){hm0+=E.hm[m][0][h];hm1+=E.hm[m][1][h];}
  const tot10=s(E.s1,0,120)+s(E.s2,0,120)+s(E.s3,0,120),sv10=s(E.served,0,120),rest=s(E.s1,at,120)+s(E.s2,at,120)+s(E.s3,at,120);
  const sh=v=>co?fmt(100*v/co,0)+'%':'–';
  $('env-kpi').innerHTML=`<div class="kpi"><div class="k">CO₂ per year, last ${at-lo} mo</div><div class="v">${fmt(co/yrs/1e3,1)}<small>k t</small></div><div class="s">annualized</div></div>
   <div class="kpi ${sv&&1000*co/sv>L&&!(p.cap&&F.capMode==='avg'&&o.z.kg<=p.cap)?'bad':''}"><div class="k">Carbon intensity, this period</div><div class="v">${sv?fmt(1000*co/sv,0):'–'}<small> kg/MWh</small></div><div class="s">limit ${L}${p.cap?'':' (US grid average)'}</div></div>
   <div class="kpi"><div class="k">Clean energy, hour by hour</div><div class="v">${fmt(100*hm0/Math.max(hm1,1),0)}<small>%</small></div><div class="s">wind, solar, nuclear, battery used on site</div></div>
   <div class="kpi"><div class="k">Where CO₂ came from</div><div class="v" style="font-size:15px;white-space:normal">gas ${sh(s(E.s1,lo,at))} · grid ${sh(s(E.s2,lo,at))}</div><div class="s">remote site ${sh(s(E.s3,lo,at))}</div></div>
   <div class="kpi"><div class="k">Projected to month 120</div><div class="v">${fmt(tot10/1e3,0)}<small>k t total</small></div><div class="s">${fmt(rest/1e3,0)}k t still ahead · ${fmt(o.z.kg,0)} kg/MWh 10-yr${p.cap?(o.z.kg<=p.cap?' ✓ under cap':' ✗ over cap'):''}</div></div>`;
  // annual stacked bars
  const W=520,H=200,P={l:40,r:8,t:12,b:22},iw=W-P.l-P.r,ih=H-P.t-P.b,yr=[...Array(10)].map((_,y)=>[s(E.s1,y*12,y*12+12),s(E.s2,y*12,y*12+12),s(E.s3,y*12,y*12+12)]),ym=Math.max(1,...yr.map(a=>a[0]+a[1]+a[2]))*1.12,bw=iw/10,y=v=>P.t+ih*(1-v/ym);
  let g='';for(const v of [0,ym/2,ym].map(v=>Math.round(v/1e3)*1e3))g+=`<line class="gl" x1="${P.l}" x2="${W-P.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${P.l-5}" y="${y(v)+4}" text-anchor="end">${fmt(v/1e3,0)}k</text>`;
  const col=['--s-gas','--s-grid','--s-rel'],ay=at/12;
  yr.forEach((a,i)=>{let acc=0;const fut=i+1>ay,part=i<ay&&i+1>ay;for(let j=0;j<3;j++){if(a[j]<=0)continue;g+=`<rect x="${P.l+i*bw+bw*0.18}" y="${y(acc+a[j])}" width="${bw*0.64}" height="${y(acc)-y(acc+a[j])}" fill="var(${col[j]})" opacity="${fut&&!part?.35:1}"/>`;acc+=a[j];}
    const svY=s(E.served,i*12,i*12+12);g+=`<text x="${P.l+i*bw+bw/2}" y="${H-6}" text-anchor="middle">Y${i+1}</text>`;if(acc>0)g+=`<text x="${P.l+i*bw+bw/2}" y="${y(acc)-4}" text-anchor="middle" style="font-size:10px">${fmt(1000*acc/Math.max(svY,1),0)}</text>`;});
  g+=`<line x1="${P.l+ay*bw}" x2="${P.l+ay*bw}" y1="${P.t}" y2="${P.t+ih}" stroke="var(--ink)" stroke-width="1.5"/><text x="${P.l+ay*bw+4}" y="${P.t+ih-4}" class="ink">now</text>`;
  $('env-yr').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="CO2 by year">${g}</svg>`;
  // heat map: clean share by month and hour of day
  const m0=p.open,nm=120-m0,W2=520,H2=200,Q={l:34,r:8,t:12,b:22},cw=(W2-Q.l-Q.r)/nm,chh=(H2-Q.t-Q.b)/24;let h2='';
  for(let i=0;i<nm;i++){const m=m0+i;for(let hh=0;hh<24;hh++){const d=E.hm[m][1][hh],v=d?E.hm[m][0][hh]/d:0;h2+=`<rect x="${(Q.l+i*cw).toFixed(1)}" y="${(Q.t+hh*chh).toFixed(1)}" width="${(cw+0.3).toFixed(1)}" height="${(chh+0.3).toFixed(1)}" fill="var(--s-wind)" fill-opacity="${(0.06+0.94*v).toFixed(2)}" ${m>=at?'opacity=".45"':''}/>`;}}
  for(const hh of [0,6,12,18])h2+=`<text x="${Q.l-4}" y="${Q.t+hh*chh+chh+3}" text-anchor="end">${String(hh).padStart(2,'0')}h</text>`;
  for(let m=Math.ceil(m0/12)*12;m<120;m+=12)h2+=`<text x="${Q.l+(m-m0)*cw}" y="${H2-6}" text-anchor="middle">m${m}</text>`;
  h2+=`<line x1="${Q.l+(at-m0)*cw}" x2="${Q.l+(at-m0)*cw}" y1="${Q.t}" y2="${H2-Q.b}" stroke="var(--ink)" stroke-width="1.5"/>`;
  $('env-hm').innerHTML=`<svg viewBox="0 0 ${W2} ${H2}" role="img" aria-label="Clean energy share by month and hour of day">${h2}</svg>`;}

// ---- contracts vs market (LevelTen North America PPA Price Index, Q2 2026: offers, mostly virtual PPAs; not ERCOT-specific) ----
const MKT={wind:{p25:61.19,avg:83.79},utility_solar:{p25:52.65,avg:61.40}};
function drawMarket(o){const el=$('mkt');if(!el)return;const R=o.R,RX=resX(),c=o.caps,at=plant.at;
  const RX2=JSON.parse(JSON.stringify(RX));RX2.wind.payment_usd_per_mwh=MKT.wind.p25;RX2.utility_solar.payment_usd_per_mwh=MKT.utility_solar.p25;
  const A2=E.account(R.I,RX2,c,R.O);let d=0;for(let t=at*730;t<87600;t++)d+=A2.cost[t]-R.A.cost[t];const yrs=(120-at)/12;
  const wp=y=>REF.price.reduce((a,v)=>a+v,0)/REF.price.length*Math.pow(1.05,y)+REF.grid_adder;
  const W=680,H=150,P={l:34,r:84,t:10,b:18},iw=W-P.l-P.r,ih=H-P.t-P.b,ym=90,x=y=>P.l+iw*y/9,yy=v=>P.t+ih*(1-v/ym);
  let g='';for(const v of [0,30,60,90])g+=`<line class="gl" x1="${P.l}" x2="${P.l+iw}" y1="${yy(v)}" y2="${yy(v)}"/><text x="${P.l-4}" y="${yy(v)+4}" text-anchor="end">$${v}</text>`;
  const ln=(f,col,dash,lab,dy=0)=>{let p='';for(let y=0;y<10;y++)p+=(y?'L':'M')+x(y)+','+yy(f(y));return `<path d="${p}" fill="none" stroke="${col}" stroke-width="2" ${dash?`stroke-dasharray="${dash}"`:''}/><text x="${P.l+iw+4}" y="${yy(f(9))+4+dy}" style="font-size:10px;fill:${col}">${lab}</text>`;};
  g+=ln(wp,'var(--s-grid)','','grid avg');g+=ln(()=>RX.wind.payment_usd_per_mwh,'var(--s-wind)','','wind offer',6);g+=ln(()=>MKT.wind.p25,'var(--s-wind)','4 3','wind market',-2);
  g+=ln(()=>RX.utility_solar.payment_usd_per_mwh,'var(--s-solar)','','solar offer',-4);g+=ln(()=>MKT.utility_solar.p25,'var(--s-solar)','4 3','solar market',3);
  for(const y of [0,3,6,9])g+=`<text x="${x(y)}" y="${H-4}" text-anchor="middle">Y${y+1}</text>`;
  const row=(n,k)=>`<tr><td>${n}</td><td>$${fmt(RX[k].payment_usd_per_mwh)}</td><td>$${fmt(MKT[k].p25)}</td><td>$${fmt(MKT[k].avg)}</td></tr>`;
  el.innerHTML=`<div class="mkt"><div class="sm" style="font-weight:600;margin:0 0 4px">Packet offers vs today's market, $/MWh</div>
    <table class="tbl"><thead><tr><th></th><th>Packet offer</th><th>Market low (P25)</th><th>Market average</th></tr></thead><tbody>${row('Wind','wind')}${row('Solar','utility_solar')}<tr><td>Grid power, year 1 → 10</td><td colspan="3" style="text-align:right">$${fmt(wp(0))} → $${fmt(wp(9))} (packet price path)</td></tr></tbody></table>
    <div class="chart" style="margin-top:4px"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Contract prices against grid power price forecast">${g}</svg></div>
    <p class="sm" style="margin:2px 0 0">${(c.wind||c.utility_solar)?`At market-low prices, this plan's contracts would cost <b class="down">${sgn(d/yrs)}/yr</b> more from month ${at}. The packet offers are 35–45% below market, so lock them in early.`:'This plan has no wind or solar contracts.'}</p>
    <p class="muted sm" style="margin:2px 0 0">Market: <a href="https://www.leveltenenergy.com/post/levelten-north-american-ppa-price-index-q2-2026" target="_blank" rel="noopener">LevelTen PPA Price Index, Q2 2026</a>, North America offers, mostly virtual PPAs, not ERCOT-specific. Wind +17.5% year on year.</p></div>`;}

// ---- alerts and decisions ----
function delta(a,b,at){const A=win(a,at,120),B=win(b,at,120),y=A.yrs;return {cost:(B.total-A.total)/y,co2:(B.co2-A.co2)/y,profit:(B.e.profit-A.e.profit)/y,kg:B.kg,uns:B.uns};}
const fxTxt=d=>`<span>cost <b class="${d.cost>0?'down':'up'}">${sgn(d.cost)}/yr</b></span><span>CO₂ <b class="${d.co2>0?'down':'up'}">${sgn(d.co2/1e3,v=>fmt(v,1)+'k t')}/yr</b></span><span>profit <b class="${d.profit<0?'down':'up'}">${sgn(d.profit)}/yr</b></span>`;
function drawAlertsDecs(over,months,kg5){const p=plant,o=p.cur,M=o.mo,at=p.at,L=lim(),mi=MIXORD.indexOf(p.mix),A=[];
  const alt=(mix,bat,cap)=>{if(VSH[mix]>F.vcap+1e-9)return null;const q=planOf(mix,bat,cap);return q?{q,d:delta(o,q,at)}:null;};
  const apply=q=>{p.cap=q._cap!=null?q._cap:p.cap;setPlan(q);drawRun();};
  const tag=(q,cap)=>{if(q)q._cap=cap;return q;};
  // 1 carbon
  if(kg5>L&&over.length){const pk=over.reduce((a,m)=>M.kg[m]>M.kg[a]?m:a,over[0]),gs=sumM(M.gas,at-12,at)/Math.max(sumM(M.req,at-12,at),1);
    // rank the fixes that actually cut CO2 by cost per tonne avoided
    const cand=[];for(const c of [300,250,200])if(c<(p.cap||1e9)){const a=alt(p.mix,p.battery,c);if(a&&!a.q.miss)cand.push({t:`Cap carbon at ${c} kg/MWh`,a:tag(a,c)});}
    if(mi<MIXORD.length-1){const a=alt(MIXORD[mi+1],p.battery,p.cap);if(a)cand.push({t:MIXORD[mi+1].includes('N25')?'Add a nuclear contract':'Sign more wind and solar',a:tag(a,p.cap)});}
    const act=cand.filter(c=>c.a.d.co2<-500).map(c=>({...c,pt:Math.max(c.a.d.cost,0)/-c.a.d.co2})).sort((x,y)=>x.pt-y.pt).slice(0,2);
    const avg10=o.z.kg,onTrack=F.capMode==='avg'&&avg10<=L,ramp=pk<30+F.delay;
    if(onTrack){A.push({lvl:'info',h:`Last 12 months at ${fmt(kg5,0)} kg/MWh, 10-year average on track at ${fmt(avg10,0)}`,b:`${p.cap?'The cap':'The US grid average reference'} is a 10-year average. Carbon starts high and falls: ${ramp?`until month ${30+F.delay} the grid gives only 25 to 50 MW, so gas carries the rest; `:''}later years are cleaner as grid carbon falls 3% a year.`,act:[]});}
    else A.push({lvl:'bad',h:`Carbon over the limit: ${fmt(kg5,0)} kg/MWh over the last 12 months`,b:`Peak ${fmt(M.kg[pk],0)} kg/MWh in month ${pk}, against a limit of ${L}${p.cap?'':' (US grid average; no cap is set yet)'}. Onsite gas carried ${fmt(100*gs,0)}% of demand. Cheapest ways to cut it, per tonne avoided:`,act});}
  // 2 paid-for clean energy not used
  const cu=sumM(M.curt,at-12,at),bill=sumM(M.grid,at-12,at)+sumM(M.con,at-12,at)+sumM(M.fuel,at-12,at)+sumM(M.fix,at-12,at)+sumM(M.work,at-12,at);
  if(cu>0.03*bill){let act=null;
    A.push({lvl:'warn',h:`${money(cu)} paid for wind and solar you could not use`,b:`Last 12 months: contracts pay for available output, but the shared import limit or low demand left it unused (${fmt(100*cu/bill,0)}% of the bill).`,act});}
  // 3 gas share of bill and rising gas price
  const fuel=sumM(M.fuel,at-12,at);if(fuel>0.2*bill&&mi<MIXORD.length-1){const a=alt(MIXORD[mi+1],p.battery,p.cap);
    A.push({lvl:a&&a.d.cost<0?'warn':'info',h:`Gas fuel is ${fmt(100*fuel/bill,0)}% of the power bill`,b:'The packet has gas prices rising 3% a year. More contracted wind and solar would cut fuel use.',act:a?{t:'Sign more clean contracts',a:tag(a,p.cap),note:`Move to ${MIXT[MIXORD[mi+1]]}.`}:null});}
  // 4 stress-event costs
  const wk=sumM(M.work,at-12,at);if(wk>1e4){let act=null;
    A.push({lvl:'warn',h:`Grid stress cost ${money(wk)} in moved or paused work`,b:'Last 12 months. Stress events cap imports at 60% and work moves to the remote site.',act});}
  // 5 unserved
  if(sumM(M.uns,at-12,at)>1)A.push({lvl:'bad',h:`${fmt(sumM(M.uns,at-12,at),0)} MWh of demand not met`,b:'Onsite capacity was short. Operations will add gas within the 8-acre limit at the next re-plan.',act:null});
  // 6 ahead
  const ahead=[];const RX=resX();if(at<30+F.delay)ahead.push(`grid import reaches 75 MW at month ${30+F.delay}`);if(at<RX.nuclear.available_month&&!o.caps.nuclear)ahead.push(`nuclear contracts open at month ${RX.nuclear.available_month}`);
  if(ahead.length)A.push({lvl:'info',h:'Coming up',b:ahead.join('; ')+'.',act:null});
  if(!A.some(a=>a.lvl!=='info'))A.unshift({lvl:'ok',h:'No problems in the last 12 months',b:`Carbon ${fmt(kg5,0)} kg/MWh, under the ${L} limit, and all demand met.`,act:null});
  const used=new Set();A.forEach(a=>{a.acts=(Array.isArray(a.act)?a.act:a.act?[a.act]:[]).filter(x=>{const k=x.t;if(used.has(k))return false;used.add(k);return true;});});
  $('c-alerts').innerHTML=A.map((a,i)=>`<div class="alert ${a.lvl}"><div class="h">${a.lvl==='bad'?'⚠ ':''}${a.h}</div><div class="b">${a.b}</div>${a.acts.map((x,j)=>`<div class="act"><button class="btn ${a.lvl==='bad'&&!j?'pri':''}" type="button" data-a="${i}" data-x="${j}">${x.t}</button><span class="fx">${fxTxt(x.a.d)}${x.pt!=null?`<span class="muted">$${fmt(x.pt)}/t</span>`:''}</span></div>`).join('')}</div>`).join('');
  $('c-alerts').querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>apply(A[+b.dataset.a].acts[+b.dataset.x].a.q));
  // decisions
  const G=[];
  G.push({k:'mix',icon:'wind',col:'--s-wind',t:'Clean energy contracts',d:'Paid on available output.',opts:MIXORD.map(m=>({l:MIXT[m].replace(' + 25 MW nuclear',' + nuclear'),cur:m===p.mix,a:m===p.mix?null:alt(m,p.battery,p.cap),blk:VSH[m]>F.vcap+1e-9,cap:p.cap}))});
  G.push({k:'cap',icon:'gas',col:'--s-gas',t:'Carbon cap',d:'Operations runs gas and batch work to stay under it.',opts:[0,300,250,200].map(c=>({l:c?`Below ${c} kg/MWh`:'No cap',cur:c===(p.cap||0),a:c===(p.cap||0)?null:alt(p.mix,p.battery,c),cap:c}))});
  {const cur=win(o,at,120),base=[{l:'Current plan',q:o,d:null}];const rowsI=[];
    for(const g of G)for(const q of g.opts)if(q.a&&!q.a.q.miss)rowsI.push({l:`${{mix:'Contracts',bat:'Battery',cap:'Cap'}[g.k]}: ${q.l.replace('Below ','< ')}`,q:q.a.q,d:q.a.d});
    rowsI.sort((a,b)=>a.d.co2-b.d.co2);const capL=lim();
    const tr=(l,w,d)=>`<tr><td>${l}</td><td>${fmt(w.co2/1e3,0)}k t</td><td class="${d?d.co2<0?'up':'down':''}">${d?sgn(d.co2*w.yrs/1e3,v=>fmt(v,0)+'k t'):'–'}</td><td class="${w.kg>capL?'down':''}">${fmt(w.kg,0)}</td><td>${fmt(100*w.clean/Math.max(w.served,1),0)}%</td><td>${d?sgn(d.cost):'–'}</td><td>${d&&d.co2<-100?'$'+fmt(Math.max(0,d.cost)/-d.co2)+'/t':'–'}</td></tr>`;
    document.querySelectorAll('.atm').forEach(e=>e.textContent=at);
    $('env-imp').innerHTML=`<div class="chart"><table class="tbl"><thead><tr><th>Plan</th><th>CO₂ to m120</th><th>Change</th><th>kg/MWh</th><th>Clean share</th><th>Cost / yr</th><th>Cost per t avoided</th></tr></thead><tbody>${tr('<b>Current plan</b>',cur,null)}${rowsI.map(r=>tr(r.l,win(r.q,at,120),r.d)).join('')}</tbody></table></div>`;}
  $('c-decs').innerHTML=G.map((g,gi)=>`<div class="dec"><div class="dh"><svg viewBox="-22 -26 44 48" width="34" height="38" aria-hidden="true">${ICON[g.icon](`var(${g.col})`)}</svg><div><div class="t">${g.t}</div><div class="d">${g.d}</div></div></div>
    <div class="curp"><span class="muted">Current</span> <b>${(g.opts.find(q=>q.cur)||{}).l||'–'}</b></div>${g.k==='mix'?'<div id="mkt"></div>':''}
    <div class="dopts">${g.opts.map((q,qi)=>{if(q.cur)return '';if(!q.a)return `<div class="dopt dis"><span class="l">${q.l}</span><span class="fx muted">${q.blk?`above the ${fmt(100*F.vcap,0)}% wind and solar cap`:'not tested'}</span></div>`;
      const miss=q.a.q.miss;return `<button type="button" class="dopt" data-g="${gi}" data-q="${qi}" ${miss?'disabled':''}><span class="l">${q.l}</span><span class="fx">${miss?'<span class="down">cannot meet this cap with this build</span>':fxTxt(q.a.d)}</span></button>`;}).join('')}</div></div>`).join('');
  drawMarket(o);
  $('c-decs').querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{const q=G[+b.dataset.g].opts[+b.dataset.q];p.cap=q.cap;setPlan(q.a.q);drawRun();});
  const dS=delta(p.start,o,at);const changed=o!==p.start;
  $('c-vs').innerHTML=changed?`<span class="muted">Your changes vs the plan you opened with, from month ${at}:</span> ${fxTxt(dS)} <button class="btn" type="button" id="c-reset">Undo all</button>`:`<span class="muted">Deltas are per year from month ${at} to month 120, from full hourly re-runs, if the change were in place from now.</span>`;
  if($('c-reset'))$('c-reset').onclick=()=>{p.cap=F.cap;setPlan(p.start);drawRun();};}
$('back-1').onclick=()=>showStep(1);
$('go-3').onclick=()=>{showStep(3);};

// ---------------- STEP 3: live ----------------
const SUP=[['gas','Onsite gas','--s-gas',''],['dsl','Backup generator','--s-dsl',''],['grid','Grid power','--s-grid',''],['wind','Wind','--s-wind',''],['solar','Solar','--s-solar','lt'],['nuclear','Nuclear','--s-nuc',''],['bat','Battery','--s-bat',''],['rel','Moved away','--s-rel',''],['cur','Batch paused','--s-int',''],['uns','Unserved','--s-uns','']];
function hourSup(R,t){const O=R.O,cl=O.wind[t]+O.solar[t]+O.nuclear[t],sc=cl>0?(cl-O.ch[t])/cl:0;return {gas:O.fuel_cell[t]+O.gas_engine[t]+O.gas_turbine[t],dsl:O.rental?O.rental[t]:0,grid:O.grid[t],wind:O.wind[t]*sc,solar:O.solar[t]*sc,nuclear:O.nuclear[t]*sc,bat:O.di[t],rel:O.rel[t],cur:O.cur[t],uns:O.unserved[t]};}
function buckets(R,lo,hi,b){const k=Math.ceil((hi-lo)/b),Z={k};[...SUP.map(x=>x[0]),'L','G','st'].forEach(x=>Z[x]=new Float64Array(k));
  for(let t=lo;t<hi;t++){const i=Math.floor((t-lo)/b),h=hourSup(R,t);for(const [key] of SUP)Z[key][i]+=h[key];Z.L[i]+=R.I.L[t];Z.G[i]+=R.I.G[t];Z.st[i]=Math.max(Z.st[i],R.I.st[t]);}
  for(let i=0;i<k;i++){const c=Math.min(b,hi-lo-i*b);for(const x of [...SUP.map(x=>x[0]),'L','G'])Z[x][i]/=c;}return Z;}
function area(box,Z,opts){const W=900,H=opts.h,P={l:36,r:8,t:8,b:opts.labels?20:6},iw=W-P.l-P.r,ih=H-P.t-P.b,n=Z.k,ym=opts.ymax,x=i=>P.l+iw*i/n,y=v=>P.t+ih*(1-Math.min(v,ym)/ym);
  let g='';for(const v of opts.ticks)g+=`<line class="gl" x1="${P.l}" x2="${W-P.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${P.l-5}" y="${y(v)+4}" text-anchor="end">${v}</text>`;
  let sh='';if(!opts.noshade)for(let i=0;i<n;i++)if(Z.st[i])sh+=`<rect x="${x(i)}" y="${P.t}" width="${Math.max(x(i+1)-x(i),1.2)}" height="${ih}" fill="var(--warn-bg)"/>`;
  let acc=new Float64Array(n),p='';for(const [k,,c] of SUP){const a=Z[k];let mx=0;for(let i=0;i<n;i++)mx=Math.max(mx,a[i]);if(mx<0.01)continue;const lo=acc.slice();for(let i=0;i<n;i++)acc[i]+=a[i];
    let d='M'+x(0)+','+y(lo[0]);for(let i=0;i<n;i++)d+=`L${x(i)},${y(acc[i])}L${x(i+1)},${y(acc[i])}`;for(let i=n-1;i>=0;i--)d+=`L${x(i+1)},${y(lo[i])}L${x(i)},${y(lo[i])}`;p+=`<path d="${d}Z" fill="var(${c})"/>`;}
  const st=(a,s,dash,w)=>{let d='';for(let i=0;i<n;i++)d+=(i?'L':'M')+x(i)+','+y(a[i])+'L'+x(i+1)+','+y(a[i]);return `<path d="${d}" fill="none" stroke="${s}" stroke-width="${w}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;};
  let lab='';for(const [i,l] of (opts.labels||[]))lab+=`<text x="${x(i)}" y="${H-5}" text-anchor="middle">${l}</text>`;
  const cursor=opts.cursor!=null?`<line x1="${x(opts.cursor)}" x2="${x(opts.cursor)}" y1="${P.t}" y2="${P.t+ih}" stroke="var(--ink)" stroke-width="1.5"/>`:'';
  const band=opts.band?`<rect x="${x(opts.band[0])}" y="${P.t}" width="${Math.max(x(opts.band[1])-x(opts.band[0]),2)}" height="${ih}" fill="var(--accent)" opacity=".3"/>`:'';
  box.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${opts.aria}">${sh}${g}${p}${st(Z.G,'var(--ink-2)','5 4',1.5)}${st(Z.L,'var(--ink)','',1.6)}${band}${cursor}<line class="ax" x1="${P.l}" x2="${W-P.r}" y1="${y(0)}" y2="${y(0)}"/>${lab}<rect class="hit" x="${P.l}" y="${P.t}" width="${iw}" height="${ih}" fill="transparent"/></svg>`;
  const svg=box.querySelector('svg'),hit=box.querySelector('.hit');const idx=e=>{const r=svg.getBoundingClientRect();return Math.max(0,Math.min(n-1,Math.floor(((e.clientX-r.left)*W/r.width-P.l)/iw*n)));};
  if(opts.tip){hit.onmousemove=e=>tipAt(box,opts.tip(idx(e)),e);hit.onmouseleave=()=>hideTip(box);}if(opts.click)hit.onclick=e=>opts.click(idx(e));}

let trendK=null;
function srcSeries(R,k,t){const I=R.I,O=R.O,c=R.caps,m=I.month[t],RX=resX(),avOK=id=>m>=Math.max(plant.open,RX[id].available_month);
  if(k==='grid')return {u:O.grid[t],cap:I.G[t],tot:O.grid[t]+O.wind[t]+O.solar[t]+O.nuclear[t]};
  if(k==='wind')return {u:O.wind[t],cap:avOK('wind')?c.wind*I.wcf[t]:0};
  if(k==='utility_solar')return {u:O.solar[t],cap:avOK('utility_solar')?c.utility_solar*I.scf[t]:0};
  if(k==='nuclear')return {u:O.nuclear[t],cap:avOK('nuclear')?c.nuclear:0};
  if(k==='battery_4h')return {u:O.soc[t],cap:avOK('battery_4h')?4*c.battery_4h:0,di:O.di[t],ch:O.ch[t]};
  if(k==='rental')return {u:O.rental?O.rental[t]:0,cap:10};
  return {u:O[k][t],cap:avOK(k)?c[k]:0};}
const TK={grid:['Grid connection','--s-grid','Grid power bought','Import limit (incl. contracts)'],wind:['Wind contract','--s-wind','Used','Available (paid for)'],utility_solar:['Solar contract','--s-solar','Used','Available (paid for)'],nuclear:['Nuclear contract','--s-nuc','Used','Available (paid for)'],
  battery_4h:['Battery','--s-bat','Stored energy (MWh)','Full'],gas_turbine:['Gas turbine','--s-gas','Output','Capacity'],gas_engine:['Gas engine','--s-gas','Output','Capacity'],fuel_cell:['Gas fuel cell','--s-gas','Output','Capacity'],rental:['Rented generator','--s-dsl','Output','Capacity']};
function lineChart(box,lines,ymax,labels,unit,cursor){const W=900,H=170,P={l:40,r:8,t:10,b:20},iw=W-P.l-P.r,ih=H-P.t-P.b,n=lines[0].a.length,x=i=>P.l+iw*i/Math.max(n-1,1),y=v=>P.t+ih*(1-Math.min(v,ymax)/ymax);
  let g='';for(const v of [0,ymax/2,ymax])g+=`<line class="gl" x1="${P.l}" x2="${W-P.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${P.l-5}" y="${y(v)+4}" text-anchor="end">${fmt(v,v<10?1:0)}</text>`;
  let p='';for(const L of lines){let d='';for(let i=0;i<n;i++)d+=(i?'L':'M')+x(i).toFixed(1)+','+y(L.a[i]).toFixed(1);if(L.fill)p+=`<path d="${d}L${x(n-1)},${y(0)}L${x(0)},${y(0)}Z" fill="var(${L.c})" opacity=".18"/>`;p+=`<path d="${d}" fill="none" stroke="${L.c.startsWith('--')?`var(${L.c})`:L.c}" stroke-width="${L.w||1.8}" ${L.dash?`stroke-dasharray="${L.dash}"`:''}/>`;}
  let lab='';for(const [i,l] of labels)lab+=`<text x="${x(i)}" y="${H-5}" text-anchor="middle">${l}</text>`;
  const cur=cursor!=null?`<line x1="${x(cursor)}" x2="${x(cursor)}" y1="${P.t}" y2="${P.t+ih}" stroke="var(--ink)" stroke-width="1.2"/>`:'';
  box.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend">${g}${p}${cur}<line class="ax" x1="${P.l}" x2="${W-P.r}" y1="${y(0)}" y2="${y(0)}"/>${lab}<text x="${P.l}" y="${P.t}" dy="-1">${unit}</text></svg>`;}
function drawTrend(R,t){const el=$('l-trend');if(!el)return;if(!trendK){el.hidden=true;return;}const k=trendK,info=TK[k];if(!info){el.hidden=true;return;}el.hidden=false;
  const lo=Math.max(0,t-167),wk={u:[],cap:[]};for(let h=lo;h<=t;h++){const v=srcSeries(R,k,h);wk.u.push(v.u);wk.cap.push(v.cap);}
  const mo={u:new Float64Array(120),cap:new Float64Array(120)};let E=0,Cap=0,hrs=0,on=0;for(let h=0;h<87600;h++){const v=srcSeries(R,k,h),i=Math.floor(h/730);mo.u[i]+=v.u/730;mo.cap[i]+=v.cap/730;if(h>=plant.open*730){E+=v.u;Cap+=v.cap;hrs++;if(v.u>0.05)on++;}}
  const ym=Math.max(1,...wk.cap,...wk.u)*1.1,ymm=Math.max(1,...mo.cap,...mo.u)*1.1,unit=k==='battery_4h'?'MWh':'MW';
  const cost=k==='grid'?R.A.lines.merchant:R.A.lines[k];
  const wl=[];for(let i=0;i<wk.u.length;i+=24){const q=dateOf(lo+i);wl.push([i,`${q.wd} ${q.d}`]);}
  const stats=k==='battery_4h'?`<span>average charge <b>${fmt(100*E/Math.max(Cap,1),0)}%</b></span><span>cycles <b>${fmt(R.O.di.reduce((a,v)=>a+v,0)/(4*R.caps.battery_4h*0.922),0)}</b> over 10 years</span>`
    :`<span>energy, 10 years <b>${fmt(E/1e3,0)}k MWh</b></span><span>${k==='grid'?'share of import limit used':k==='wind'||k==='utility_solar'||k==='nuclear'?'used vs paid for':'capacity factor'} <b>${fmt(100*E/Math.max(Cap,1),0)}%</b></span><span>hours running <b>${fmt(100*on/Math.max(hrs,1),0)}%</b></span>`;
  el.innerHTML=`<div class="hd"><p class="eyebrow" style="margin:0">${info[0]} · trend</p></div>
   <div class="stats">${stats}${cost?`<span>cost, 10 years <b>${money(cost)}</b></span>`:''}</div>
   <div class="legend"><span><i style="background:var(${info[1]})"></i>${info[2]}</span><span><i style="height:0;border-top:2px dashed var(--ink-2)"></i>${info[3]}</span></div>
   <p class="muted" style="font-size:12px;margin:0">Last 7 days, hourly</p><div class="chart" id="tr-wk"></div>
   <p class="muted" style="font-size:12px;margin:6px 0 0">10 years, monthly average · line = now</p><div class="chart" id="tr-mo"></div>`;
  lineChart($('tr-wk'),[{a:wk.cap,c:'var(--ink-2)',dash:'5 4',w:1.4},{a:wk.u,c:info[1],fill:true}],ym,wl,unit,wk.u.length-1);
  lineChart($('tr-mo'),[{a:Array.from(mo.cap),c:'var(--ink-2)',dash:'5 4',w:1.4},{a:Array.from(mo.u),c:info[1],fill:true}],ymm,[0,18,24,30,48,60,72,84,96,108].map(m=>[m,'m'+m]),unit,Math.min(119,Math.floor(t/730)));
  }
// ---- operator: events, responses, servicing (all extensions, labeled) ----
const TECH_COST=8000,TECH_H=4,DOWN_H=24,BACKUP_MW=10,COOL=0.2,CH_SINCE=77,CH_DEGR=0.08,CH_LATE=30; // extensions: call-out, repair times, backup size, cooling share
const SERV={gas_turbine:{every:4000,hrs:12,cost:25000,what:'hot-section inspection'},gas_engine:{every:2000,hrs:8,cost:9000,what:'oil, plugs and valves'},fuel_cell:{every:8000,hrs:24,cost:12000,what:'stack check'},
  battery_4h:{days:180,hrs:6,cost:6000,what:'cell balancing and HVAC check'},chillers:{days:90,hrs:4,cost:3000,what:'coil clean and refrigerant check'},backup:{days:30,hrs:1,cost:500,what:'monthly test run'}};
const EV={none:['Nothing','A normal day.'],wind:['Wind lull, 3 days','Calm spell from tomorrow: wind at 25% of normal.'],solar:['Heavy cloud, 3 days','Solar at 30% of normal from tomorrow.'],
  stress:['Grid stress alert','Tomorrow 14:00–22:00, imports capped at 50%.'],outage:['Grid outage','Tomorrow 15:00–21:00, no imports at all (no grid, no wind or solar).'],
  chiller:['Chiller drawing excess power','Tomorrow from 13:00 a chiller fault adds 3 MW of cooling load for 12 hours.'],fail:['Equipment trips','Tomorrow 16:00 one unit trips offline for 24 hours.']};
const ops={pb:null,ev:'none',failId:null,day:null,bat:null,gen:null,tech:false,svc:null,result:null,base0:null,tp:null};
function evDef(){const day=ops.day;if(day==null)return null;
  if(ops.ev==='outage')return {extra:{hourEvents:[{from:day+15,to:day+21,frac:0}]},win:[day+15,day+21],kind:'outage'};
  if(ops.ev==='stress')return {extra:{hourEvents:[{from:day+14,to:day+22,frac:0.5}]},win:[day+14,day+22],kind:'stress'};
  if(ops.ev==='solar')return {extra:{wxWin:[{from:day,to:day+72,solar:0.3}]},win:[day,day+72],kind:'cloud'};
  if(ops.ev==='wind')return {extra:{wxWin:[{from:day,to:day+72,wind:0.25}]},win:[day,day+72],kind:'lull'};
  if(ops.ev==='chiller'){const f=day+13;return {extra:{loadAdd:[{from:f,to:f+(ops.tech?3:12),mw:3}]},win:[f,f+12],kind:'chiller'};}
  if(ops.ev==='fail'&&ops.failId){const f=day+16,to=f+(ops.tech?TECH_H:DOWN_H);return {extra:{},win:[f,f+DOWN_H],outages:[{id:ops.failId,from:f,to}],kind:'fail'};}return null;}
function opsRun(withResp,pbo){const a=plant.attrs,caps=plant.cur.caps,d=evDef();let outs=[...((d&&d.outages)||[])];const ex={...((d&&d.extra)||{})};
  if(withResp&&ops.svc&&ops.svc.id!=='chillers'&&ops.svc.id!=='backup')outs.push({id:ops.svc.id,from:ops.svc.from,to:ops.svc.to});
  let rental=withResp&&ops.gen?{from:ops.gen.from,to:ops.gen.to,mw:BACKUP_MW}:null,ctl=withResp&&ops.bat?{bat:ops.bat}:null;
  const pb=withResp?(pbo!==undefined?pbo:ops.pb):null;
  if(pb&&pb.win){const [f,to]=pb.win;ctl={...(ctl||{})};if(pb.keep)ctl.keep={from:f,to};if(pb.pol)ctl.pol={from:f,to,p:pb.pol};if(pb.cover==='bat')ctl.bat={from:f,to};if(pb.cover==='gen')rental={from:f,to,mw:BACKUP_MW};if(!Object.keys(ctl).length)ctl=null;}
  return run(plant.open,caps,a.policy,lMode(),ex,rental,outs.length?outs:null,ctl);}
const pbOn=()=>ops.pb&&(ops.pb.keep||ops.pb.pol||ops.pb.cover!=='plan');
const anyOps=()=>ops.ev!=='none'||ops.bat||ops.gen||ops.svc||pbOn();
function applyOps(){if(!plant)return;if(!anyOps()){ops.result=null;ops.tp=null;live.setRun(baseRun(),true);drawOpsAll();return;}
  if(ops.tp==null)ops.tp=live.t;const d=evDef(),R=opsRun(true),outs=[];if(d&&d.outages)outs.push(...d.outages);if(ops.svc)outs.push(ops.svc);
  ops.result={R,win:d?d.win:null,out:outs};live.setRun(R,true);drawOpsAll();}
function rh(R){if(R._rh)return R._rh;const o={};for(const k of [...GASK,'rental']){const a=new Float32Array(87601);const src=R.O[k];for(let t=0;t<87600;t++)a[t+1]=a[t]+(src&&src[t]>0.05?1:0);o[k]=a;}R._rh=o;return o;}
function service(R,k,t){const s=SERV[k];if(!s)return null;const RX=resX(),c=R.caps;
  if(s.every){if(!c[k])return null;const a=rh(R)[k],used=a[t+1],since=used%s.every,left=s.every-since,rate=Math.max((a[t+1]-a[Math.max(0,t-720)])/Math.min(720,t+1),0.02);return {...s,left,unit:'run hours',days:left/(rate*24),pct:100*since/s.every};}
  const from=k==='battery_4h'?Math.max(plant.open,RX.battery_4h.available_month)*730:k==='chillers'?plant.open*730-CH_SINCE*24:plant.open*730;if(k==='battery_4h'&&!c.battery_4h)return null;if(t<from)return null;
  const d=(t-from)/24,since=d%s.days,left=s.days-since;return {...s,left,unit:'days',days:left,pct:100*since/s.days};}
function bestServiceWin(R,k,t){const s=SERV[k],O=R.O,src=k==='battery_4h'?O.di:O[k]||null;let best=null;
  for(let a=t+24;a<Math.min(87600-s.hrs,t+24*14);a++){let sc=0,bad=false;for(let h=a;h<a+s.hrs;h++){if(R.I.st[h])bad=true;sc+=(src?src[h]:0)+0.02*R.I.L[h];}if(bad)continue;if(!best||sc<best.sc)best={from:a,to:a+s.hrs,sc};}return best;}
// chillers: a late service leaves dirty coils, so cooling draws CH_DEGR more power (team assumption) until serviced
const CSV=new Map();
function chillerSave(R,t){const sv=service(R,'chillers',t);if(!sv)return null;const due=Math.round(t+sv.days*24),key=due+'|'+JSON.stringify(R.caps)+R.policy+R.mode;if(CSV.has(key))return CSV.get(key);
  const to=Math.min(87600,due+CH_LATE*24);let L=0;for(let h=due;h<to;h++)L+=R.I.L[h];L/=Math.max(1,to-due);const mw=COOL*CH_DEGR*L;
  const a=plant.attrs,B=baseRun(),X=run(plant.open,plant.cur.caps,a.policy,lMode(),{loadAdd:[{from:due,to,mw}]});let dc=0,dco=0;
  for(let h=due;h<to;h++){dc+=(X.A.cost[h]+X.A.relCost[h]+X.A.intCost[h]+X.O.unserved[h]*UNMET)-(B.A.cost[h]+B.A.relCost[h]+B.A.intCost[h]+B.O.unserved[h]*UNMET);dco+=X.A.co2[h]-B.A.co2[h];}
  const r={mw,mwh:mw*(to-due),co2:dco,cost:dc,due};CSV.set(key,r);return r;}
// forecast flags over [t, t+72)
function flagsAt(R,t){const I=R.I,c=R.caps,F=[],H=Math.min(87600,t+72),RX=resX();const avW=h=>I.month[h]>=Math.max(plant.open,RX.wind.available_month)&&c.wind;
  const scan=(test,kind,lab,min)=>{let s=null;for(let h=t;h<=H;h++){const on=h<H&&test(h);if(on&&s==null)s=h;if(!on&&s!=null){if(h-s>=(min||1))F.push({kind,from:s,to:h,lab});s=null;}}};
  scan(h=>avW(h)&&I.wcf[h]<0.12&&I.L[h]>0,'lull','Wind lull',6);
  scan(h=>I.st[h]&&I.G[h]>0,'stress','Grid stress');scan(h=>I.Gord[h]>0&&I.G[h]===0,'outage','Grid outage');
  if(ops.result&&ops.result.out)for(const o of ops.result.out)if(o.to>t&&o.from<H)F.push({kind:o.cost?'svc':'fail',from:Math.max(o.from,t),to:Math.min(o.to,H),lab:(o.cost?'Service: ':'Trip: ')+(RN[o.id]||o.id),id:o.id});
  const d=evDef();if(d&&d.kind==='chiller'&&d.win[1]>t&&d.win[0]<H)F.push({kind:'chiller',from:Math.max(d.win[0],t),to:Math.min(d.win[0]+(ops.tech?3:12),H),lab:'Chiller overdraw'});
  if(d&&d.kind==='cloud'&&d.win[1]>t)F.push({kind:'cloud',from:Math.max(d.win[0],t),to:Math.min(d.win[1],H),lab:'Heavy cloud'});
  scan(h=>R.O.unserved[h]>0.05,'short','Short of power');
  return F.sort((a,b)=>a.from-b.from);}
const FK={lull:'--s-wind',stress:'#c98500',outage:'--bad',fail:'--bad',svc:'--accent',chiller:'--s-int',cloud:'--s-solar',short:'--bad'};
const fkc=k=>FK[k].startsWith('--')?`var(${FK[k]})`:FK[k];
const hh=t=>{const q=dateOf(t);return `${q.wd} ${String(q.h).padStart(2,'0')}:00`;};

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
  const {unA,unB}=tierSplit(R,t);
  hall('A',t0,t0-unA,0,0,unA);hall('B',t1,t1-rel-unB,rel,0,unB);hall('C',t2,t2-cur,0,cur,0);
  setT('st-hA',L<=0?'not open yet':unA>0.05?`AT RISK: ${fmt(unA,1)} MW unserved`:'all served');setT('st-hB',L<=0?'':unB>0.05?`${fmt(unB,1)} MW unserved`:rel>0.05?`${fmt(rel,1)} MW moved to remote site`:'all served on site');setT('st-hC',L<=0?'':cur>0.05?`${fmt(cur,1)} MW paused`:'running');
  setFlow('hA',t0-unA);setFlow('hB',t1-rel-unB);setFlow('hC',t2-cur);
  // chillers
  const d=evDef(),chOn=d&&d.kind==='chiller'&&t>=d.win[0]&&t<d.win[0]+(ops.tech?3:12);const cool=L*COOL+(chOn?3:0);
  setT('tx-chillers',L>0?`cooling ~${fmt(cool,1)} MW${chOn?' · chiller 2 +3 MW':''}`:'');
  for(let i=0;i<3;i++){const e=document.getElementById('ch-'+i);if(e)e.style.stroke=chOn&&i===1?'var(--bad)':'';const f=document.getElementById('fan-'+i);if(f)f.classList.toggle('on',L>0);}
  for(const k of ['A','B','C']){}
}
function drawSite(R,t){const key=JSON.stringify(R.caps);const box=$('site');if(siteKey!==key||!box.firstChild){box.innerHTML=siteSVG(R);siteKey=key;
    box.querySelectorAll('.eq').forEach(g=>{const go=()=>{selK=g.dataset.k;drawPanel();};g.onclick=go;g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}};});}
  box.querySelectorAll('.eq').forEach(g=>g.classList.toggle('sel',g.dataset.k===selK));updSite(R,t);}

// ---- forecast chart: next 72 hours ----
function drawFc(R,t){const I=R.I,c=R.caps,RX=resX(),H0=Math.min(87600,t+72),n=H0-t;if(n<2){$('fc').innerHTML='';return;}
  const m=h=>I.month[h],av=(k,h)=>m(h)>=Math.max(plant.open,RX[k].available_month)&&c[k];
  const wd=[],so=[],nu=[],L=[],G=[],firm=[];for(let h=t;h<H0;h++){wd.push(av('wind',h)?c.wind*I.wcf[h]:0);so.push(av('utility_solar',h)?c.utility_solar*I.scf[h]:0);nu.push(av('nuclear',h)?c.nuclear:0);L.push(I.L[h]);G.push(I.G[h]);
    firm.push(I.G[h]+GASK.reduce((a,k)=>a+(av(k,h)?c[k]:0),0)+(av('battery_4h',h)?c.battery_4h:0));}
  const W=520,Hh=220,P={l:34,r:8,t:30,b:22},iw=W-P.l-P.r,ih=Hh-P.t-P.b;const ym=Math.max(80,...L.map(v=>v*1.1),...wd.map((v,i)=>(v+so[i]+nu[i])*1.05)),x=i=>P.l+iw*i/(n-1),y=v=>P.t+ih*(1-Math.min(v,ym)/ym);
  const ar=(lo,hi,col,op)=>{let d='M'+x(0)+','+y(hi[0]);for(let i=1;i<n;i++)d+='L'+x(i)+','+y(hi[i]);for(let i=n-1;i>=0;i--)d+='L'+x(i)+','+y(lo[i]);return `<path d="${d}Z" fill="${col}" opacity="${op}"/>`;};
  const ln=(a,col,dash,w)=>{let d='';for(let i=0;i<n;i++)d+=(i?'L':'M')+x(i).toFixed(1)+','+y(a[i]).toFixed(1);return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w||1.6}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;};
  const z=L.map(()=>0),s1=wd,s2=wd.map((v,i)=>v+so[i]),s3=s2.map((v,i)=>v+nu[i]);const band=i=>0.08+0.004*i;
  let s='';for(const v of [0,25,50,75,100].filter(v=>v<=ym))s+=`<line class="gl" x1="${P.l}" x2="${W-P.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${P.l-4}" y="${y(v)+4}" text-anchor="end">${v}</text>`;
  const F=flagsAt(R,t);F.forEach((f,j)=>{const a=x(f.from-t),b=x(Math.min(f.to-t,n-1));s+=`<rect x="${a}" y="${P.t}" width="${Math.max(b-a,2)}" height="${ih}" fill="${fkc(f.kind)}" opacity=".10"/><rect x="${a}" y="${6+(j%2)*11}" width="${Math.max(b-a,3)}" height="8" rx="3" fill="${fkc(f.kind)}"/>`;});
  s+=ar(s3.map((v,i)=>v*(1-band(i))),s3.map((v,i)=>v*(1+band(i))),'var(--ink-3)',.15);
  s+=ar(z,s1,'var(--s-wind)',.55)+ar(s1,s2,'var(--s-solar)',.55)+ar(s2,s3,'var(--s-nuc)',.45);
  s+=ln(G,'var(--s-grid)','5 4',1.4)+ln(firm,'var(--ink-3)','2 3',1.2)+ln(L,'var(--ink)','',1.8);
  for(let i=0;i<n;i+=12){s+=`<text x="${x(i)}" y="${Hh-6}" text-anchor="middle">${i?'+'+i+'h':'now'}</text>`;}
  const box=$('fc');box.innerHTML=`<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="72-hour forecast">${s}<rect class="hit" x="${P.l}" y="0" width="${iw}" height="${Hh}" fill="transparent"/></svg>`;
  const svg=box.querySelector('svg');box.querySelector('.hit').onmousemove=e=>{const r=svg.getBoundingClientRect(),i=Math.max(0,Math.min(n-1,Math.round(((e.clientX-r.left)*W/r.width-P.l)/iw*(n-1)))),tt=t+i;
    const fl=F.filter(f=>tt>=f.from&&tt<f.to).map(f=>`<div style="color:${fkc(f.kind)};font-weight:600">${f.lab}</div>`).join('');
    tipAt(box,`<div class="h">${hh(tt)} · +${i}h</div>${fl}${row('Wind available',fmt(wd[i],1),'--s-wind')}${row('Solar available',fmt(so[i],1),'--s-solar')}${nu[i]?row('Nuclear',fmt(nu[i],1),'--s-nuc'):''}${row('Demand',fmt(L[i],1))}${row('Grid limit',fmt(G[i],1))}${row('Grid + onsite capacity',fmt(firm[i],1))}`,e);};
  box.querySelector('.hit').onmouseleave=()=>hideTip(box);
  $('fc-flags').innerHTML=F.length?F.map(f=>`<span class="flag" style="--fc:${fkc(f.kind)}">${f.lab} · ${hh(f.from)}${f.to-f.from>1?'–'+hh(f.to).split(' ')[1]:''}${f.to-f.from>=24?` (${fmt((f.to-f.from)/24,1)} days)`:''}</span>`).join(''):'<span class="muted" style="font-size:12px">Clear: no lulls, stress or outages in the next 72 hours.</span>';}

// ---- alerts feed with actions ----
let alertSig='';
function alertsFor(R,t){const A=[],F=flagsAt(R,t),c=R.caps,first=k=>F.find(f=>f.kind===k);
  const winOf=f=>({from:f.from,to:f.to});
  const sh=first('short');if(sh)A.push({lvl:'bad',k:'short',h:`Short of power ${hh(sh.from)}`,b:'Demand will exceed the grid limit plus onsite capacity. Always-on work is at risk.',acts:[['backup','Backup diesel on standby',winOf(sh)],c.battery_4h?['bat','Reserve the battery',winOf(sh)]:['addbat','Add a battery (Run the plant)']]});
  const ev=first('outage')||first('stress');if(ev)A.push({lvl:ev.kind==='outage'?'bad':'warn',k:ev.kind,h:`${ev.lab} ${hh(ev.from)}–${hh(ev.to).split(' ')[1]}`,b:ev.kind==='outage'?'No imports at all: wind, solar and grid power stop. Onsite gas and the battery must carry the campus.':'Imports capped. Movable work shifts to the remote site automatically; batch work pauses if still short.',acts:[c.battery_4h?['bat','Reserve the battery',winOf(ev)]:['addbat','Add a battery (Run the plant)'],['backup','Backup diesel on standby',winOf(ev)]]});
  const lu=first('lull');if(lu){const lack=Math.max(0,1);A.push({lvl:'warn',k:'lull',h:`Wind lull ${hh(lu.from)} for ${fmt((lu.to-lu.from),0)} h`,b:'Wind below 12% of contract. The gap is bought from the grid or burned as gas, at a higher cost and more carbon.',acts:[c.battery_4h?['bat','Charge and hold the battery for it',winOf(lu)]:['addbat','Add a battery (Run the plant)'],['backup','Backup diesel on standby',winOf(lu)]]});}
  const cl=first('cloud');if(cl)A.push({lvl:'info',k:'cloud',h:`Heavy cloud from ${hh(cl.from)}`,b:'Solar at 30% of normal. Usually a cost issue, not a reliability one.',acts:[]});
  const ch=first('chiller');if(ch)A.push({lvl:'bad',k:'chiller',h:'Chiller 2 drawing excess power',b:`Fault adds 3 MW of cooling load from ${hh(ch.from)}${ops.tech?'; technician booked, fixed in 3 hours':' for 12 hours'}.`,acts:ops.tech?[]:[['tech','Dispatch a technician ($8,000)']]});
  const fl=F.find(f=>f.kind==='fail');if(fl)A.push({lvl:'bad',k:'fail',h:`${RN[fl.id]||fl.id} trips ${hh(fl.from)}`,b:ops.tech?`Technician dispatched: back in ${TECH_H} hours.`:`Offline ${DOWN_H} hours unless repaired.`,acts:ops.tech?[['backup','Backup diesel on standby',winOf(fl)]]:[['tech',`Dispatch a technician ($${fmt(TECH_COST)})`],['backup','Backup diesel on standby',winOf(fl)]]});
  for(const k of [...GASK,'battery_4h','chillers','backup']){const sv=service(R,k,t);if(!sv||sv.days>14)continue;if(ops.svc&&ops.svc.id===k){const cs=k==='chillers'?chillerSave(R,t):null;A.push({lvl:'ok',k:'svc'+k,h:`${k==='chillers'?'Chiller':k==='backup'?'Backup diesel':RN[k][0].toUpperCase()+RN[k].slice(1)} service booked ${hh(ops.svc.from)}`,b:`${sv.hrs} h ${sv.what}, $${fmt(sv.cost)}, in the quietest window of the next 2 weeks.${cs?` Avoids ${fmt(cs.co2,0)} t CO₂ and ${money(cs.cost)} vs servicing ${CH_LATE} days late.`:''}`,acts:[['unsvc','Cancel']]});continue;}
    if(k==='chillers'){const cs=chillerSave(R,t);A.push({lvl:'warn',k:'svcchillers',h:`Chiller service coming up in ${fmt(Math.max(sv.days,0),0)} days: on time saves ${fmt(cs.co2,0)} t CO₂`,b:`If it slips ${CH_LATE} days, dirty coils add about ${fmt(cs.mw,1)} MW of cooling load: ${fmt(cs.mwh,0)} MWh, ${fmt(cs.co2,0)} t CO₂ and ${money(cs.cost)} of power. Service: ${sv.hrs} h, $${fmt(sv.cost)}.`,acts:[['svc','Schedule in a quiet window',k]]});continue;}
    A.push({lvl:'info',k:'svc'+k,h:`${k==='backup'?'Backup diesel':RN[k][0].toUpperCase()+RN[k].slice(1)}: service due ${sv.days<1?'now':'in '+fmt(sv.days,0)+' days'}`,b:`${sv.what} · ${sv.hrs} h downtime · $${fmt(sv.cost)}.`,acts:[['svc','Schedule in a quiet window',k]]});}
  if(!A.some(a=>a.lvl==='bad'||a.lvl==='warn'))A.unshift({lvl:'ok',k:'ok',h:'All clear for the next 72 hours',b:'No lulls, stress events or shortfalls forecast. Try “Simulate” below to test the plant.',acts:[]});
  return A;}
function doAct(a){const [kind,,arg]=a;
  if(kind==='bat'){ops.bat=arg;} else if(kind==='backup'){ops.gen=arg;} else if(kind==='tech'){ops.tech=true;} else if(kind==='addbat'){showStep(2);return;}
  else if(kind==='unsvc'){ops.svc=null;} else if(kind==='svc'){const w=bestServiceWin(live.R,arg,live.t);if(!w)return;ops.svc={id:arg,from:w.from,to:w.to,cost:SERV[arg].cost};}
  applyOps();}
function drawAlerts(R,t){const A=alertsFor(R,t),sig=A.map(a=>a.k+a.h+a.acts.map(x=>x[0]).join()).join('|');if(sig===alertSig)return;alertSig=sig;
  $('al').innerHTML=A.map((a,i)=>`<div class="alert ${a.lvl}"><div class="h">${a.lvl==='bad'?'⚠ ':''}${a.h}</div><div class="b">${a.b}</div>${a.acts.length?`<div class="act">${a.acts.map((x,j)=>`<button class="btn ${a.lvl==='bad'&&!j?'pri':''}" type="button" data-a="${i}" data-x="${j}">${x[1]}</button>`).join('')}</div>`:''}</div>`).join('');
  $('al').querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>doAct(A[+b.dataset.a].acts[+b.dataset.x]));}

// ---- equipment panel ----
const EQN={campus:'Data center halls',sub:'Substation',grid:'ERCOT grid power',wind:'Wind contract',utility_solar:'Solar contract',nuclear:'Nuclear contract',battery_4h:'Battery',gas_turbine:'Gas turbine',gas_engine:'Gas engines',fuel_cell:'Gas fuel cell',backup:'Backup diesel generator',chillers:'Chillers'};
function drawPanel(){const R=live.R;if(!R)return;const k=selK,c=R.caps,el=$('eq-panel');let ctl='';const seg=(id,opts,cur)=>`<div class="seg" role="group" id="${id}">${opts.map(([v,l])=>`<button type="button" data-v="${v}" aria-pressed="${v===cur}">${l}</button>`).join('')}</div>`;
  const nextWin=()=>{const F=flagsAt(R,live.t).filter(f=>f.kind!=='svc'&&f.kind!=='cloud');return F.length?{from:F[0].from,to:F[F.length-1].to,lab:F[0].lab}:null;};const nw=nextWin();
  if(k==='battery_4h'){ctl=c.battery_4h?`<div class="crow"><span>Mode</span>${seg('pc-bat',[['auto','Auto'],['res','Reserve for next event']],ops.bat?'res':'auto')}</div><p class="muted sm">${nw?`Next event: ${nw.lab} ${hh(nw.from)}. Reserve charges it beforehand and stops price trading.`:'No event in the next 72 hours; Auto trades price spikes and covers stress events.'}</p>`:`<p class="sm">No battery in this plan.</p><button class="btn" type="button" id="pc-add">Add one in Run the plant</button>`;}
  else if(k==='backup')ctl=`<div class="crow"><span>Mode <span class="tag">ext.</span></span>${seg('pc-gen',[['off','Off'],['stby','Standby for next event']],ops.gen?'stby':'off')}</div><p class="muted sm">10 MW diesel, about $350/MWh and 0.74 t CO₂/MWh. On standby it starts only if gas and the grid fall short, before any work is paused.${nw?` Next event: ${nw.lab} ${hh(nw.from)}.`:''}</p>`;
  else if(GASK.includes(k))ctl=`<div class="crow"><button class="btn" type="button" id="pc-trip">Simulate a trip tomorrow</button><label class="chk"><input type="checkbox" id="pc-tech" ${ops.tech?'checked':''}> technician on call ($${fmt(TECH_COST)}, back in ${TECH_H} h)</label></div>`;
  else if(k==='chillers')ctl=`<p class="sm">Cooling is assumed at ${fmt(100*COOL)}% of campus load <span class="tag">ext.</span>; the packet's demand already includes it.</p><div class="crow"><button class="btn" type="button" id="pc-chill">Simulate a chiller fault tomorrow</button><label class="chk"><input type="checkbox" id="pc-tech" ${ops.tech?'checked':''}> technician on call</label></div>`;
  else if(k==='wind'||k==='utility_solar')ctl=`<div class="crow"><button class="btn" type="button" id="pc-wx">${k==='wind'?'Simulate a 3-day wind lull':'Simulate 3 days of heavy cloud'}</button></div>`;
  else if(k==='sub'||k==='grid')ctl=`<div class="crow"><button class="btn" type="button" id="pc-out">Simulate an outage tomorrow</button><button class="btn" type="button" id="pc-str">Simulate a stress alert</button></div>`;
  const sv=service(R,k,live.t);const svh=sv?`<div class="svc"><div class="crow"><span>Next service <span class="tag">ext.</span></span><span class="mono">${sv.days<1?'due now':'in '+fmt(sv.days,0)+' days'}${sv.unit==='run hours'?` · ${fmt(sv.left)} run h`:''}</span></div><div class="meter"><i style="width:${fmt(sv.pct)}%;background:${sv.days<=14?'#c98500':'var(--accent)'}"></i></div><div class="muted sm">${sv.what} · ${sv.hrs} h · $${fmt(sv.cost)}</div>${k==='chillers'?(()=>{const cs=chillerSave(R,live.t);return cs?`<div class="save"><b>On time saves ${fmt(cs.co2,0)} t CO₂</b> and ${money(cs.cost)} vs ${CH_LATE} days late <span class="tag">ext.</span><br><span class="muted">Dirty coils add ~${fmt(100*CH_DEGR)}% cooling power: ${fmt(cs.mw,1)} MW, ${fmt(cs.mwh,0)} MWh.</span></div>`:'';})():''}${ops.svc&&ops.svc.id===k?`<div class="sm up">Booked ${hh(ops.svc.from)}</div>`:`<button class="btn" type="button" id="pc-svc">Schedule in a quiet window</button>`}</div>`:'';
  const hasTrend=!!TK[k];
  el.innerHTML=`<div class="hd"><p class="eyebrow" style="margin:0">${EQN[k]||k}</p></div><div id="eq-live" class="eqlive"></div>${ctl}${svh}${hasTrend?`<div id="l-trend" class="trend" hidden></div>`:k==='campus'?'<p class="muted sm">Racks light green when served, blue when moved to the remote site, grey when paused, red when unserved. Click any piece of equipment for its controls.</p>':''}`;
  const S=(id,fn)=>{const e=$(id);if(e)e.onclick=fn;};
  if($('pc-bat'))$('pc-bat').querySelectorAll('button').forEach(b=>b.onclick=()=>{ops.bat=b.dataset.v==='res'&&nw?{from:nw.from,to:nw.to}:null;if(b.dataset.v==='res'&&!nw){b.blur();}applyOps();});
  if($('pc-gen'))$('pc-gen').querySelectorAll('button').forEach(b=>b.onclick=()=>{ops.gen=b.dataset.v==='stby'?(nw?{from:nw.from,to:nw.to}:{from:live.t,to:live.t+72}):null;applyOps();});
  S('pc-add',()=>showStep(2));S('pc-trip',()=>setEv('fail',k));S('pc-chill',()=>setEv('chiller'));S('pc-wx',()=>setEv(k==='wind'?'wind':'solar'));S('pc-out',()=>setEv('outage'));S('pc-str',()=>setEv('stress'));
  S('pc-svc',()=>doAct(['svc','',k]));if($('pc-tech'))$('pc-tech').onchange=e=>{ops.tech=e.target.checked;applyOps();};
  trendK=hasTrend?(k==='sub'?'grid':k):null;updPanel(R,live.t);}
function updPanel(R,t){const e=$('eq-live');if(!e)return;const k=selK,O=R.O,I=R.I,c=R.caps;let h='';const r2=(a,b)=>`<div class="r"><span>${a}</span><b>${b}</b></div>`;
  if(k==='campus'){const L=I.L[t];h=r2('Demand',fmt(L,1)+' MW')+r2('Always-on / movable / batch',`${fmt(L-I.t1[t]-I.t2[t],1)} / ${fmt(I.t1[t],1)} / ${fmt(I.t2[t],1)}`)+r2('Moved to remote site',fmt(O.rel[t],1)+' MW')+r2('Batch paused',fmt(O.cur[t],1)+' MW')+r2('Unserved',fmt(O.unserved[t],1)+' MW');}
  else if(k==='battery_4h'&&c.battery_4h)h=r2('Charge',`${fmt(100*O.soc[t]/(4*c.battery_4h),0)}% · ${fmt(O.soc[t],1)} MWh`)+r2('Now',O.di[t]>0.01?`discharging ${fmt(O.di[t],1)} MW`:O.ch[t]>0.01?`charging ${fmt(O.ch[t],1)} MW`:'idle');
  else if(GASK.includes(k))h=r2('Output',`${fmt(O[k][t],1)} of ${fmt(c[k])} MW`)+r2('Fuel price now',`$${fmt(I.gasP[t],2)}/MMBtu`)+r2('Run hours, last 30 days',fmt(rh(R)[k][t+1]-rh(R)[k][Math.max(0,t-720)],0));
  else if(k==='backup')h=r2('Output',fmt(O.rental?O.rental[t]:0,1)+' MW')+r2('Status',ops.gen?`standby ${hh(ops.gen.from)}–${hh(ops.gen.to)}`:'off');
  else if(k==='sub'||k==='grid')h=r2('Import now',`${fmt(O.grid[t]+O.wind[t]+O.solar[t]+O.nuclear[t],1)} of ${fmt(I.G[t],0)} MW`)+r2('of which grid power',fmt(O.grid[t],1)+' MW')+r2('Price',`$${fmt(I.price[t],0)}/MWh`)+r2('Grid carbon',`${fmt(I.co2[t]*1000,0)} kg/MWh`);
  else if(k==='chillers')h=r2('Cooling load (est.)',fmt(I.L[t]*COOL,1)+' MW')+r2('Units','3 running');
  else if(k==='wind'||k==='utility_solar'||k==='nuclear'){const cf=k==='wind'?I.wcf[t]:k==='utility_solar'?I.scf[t]:1,u=k==='wind'?O.wind[t]:k==='utility_solar'?O.solar[t]:O.nuclear[t];h=c[k]?r2('Available',fmt(c[k]*cf,1)+' MW')+r2('Used',fmt(u,1)+' MW')+r2('Paid',`$${fmt(resX()[k].payment_usd_per_mwh)}/MWh of available output`):'<p class="sm">Not contracted in this plan.</p>';}
  e.innerHTML=h;if(trendK&&$('l-trend'))drawTrend(R,t);}
function setEv(kind,id){ops.ev=kind;if(id)ops.failId=id;ops.day=Math.floor(live.t/24)*24+24;$('sim').value=kind;if(kind==='fail'){if(!ops.failId)ops.failId=ORD.filter(k=>plant.cur.caps[k]&&GASK.includes(k))[0];$('sim-src').hidden=false;$('sim-src').value=ops.failId;}applyOps();}
function drawOpsAll(){alertSig='';const R=live.R;if(!R)return;drawPanel();drawAlerts(R,live.t);drawReport();}
function drawReport(){const box=$('op-report');if(!ops.result||ops.tp==null){box.innerHTML='';return;}const R=ops.result.R,R0=opsRun(false),Bn=baseRun(),w=[ops.tp,Math.min(87600,ops.tp+24*4)];
  const sum=(RR,f)=>{let s=0;for(let t=w[0];t<w[1];t++)s+=f(RR,t);return s;};const cost=RR=>sum(RR,(r,t)=>r.A.cost[t]+r.A.relCost[t]+r.A.intCost[t]+r.O.unserved[t]*UNMET),co=RR=>sum(RR,(r,t)=>r.A.co2[t]);
  const un=RR=>sum(RR,(r,t)=>r.O.unserved[t]),pa=RR=>sum(RR,(r,t)=>r.O.cur[t]);const extra=(ops.tech&&(ops.ev==='fail'||ops.ev==='chiller')?TECH_COST:0)+(ops.svc?ops.svc.cost:0);
  const c1=cost(R)+extra,c0=cost(R0),cn=cost(Bn),u1=un(R),u0=un(R0),p1=pa(R),p0=pa(R0);const resp=ops.bat||ops.gen||ops.tech||ops.svc||pbOn();const cls=u1>0.5?'bad':p1>0.5?'warn':'ok';
  box.innerHTML=`<div class="report ${cls}"><h3>${u1>0.5?`Next 4 days: short ${fmt(u1)} MWh`:p1>0.5?`Next 4 days: covered, ${fmt(p1)} MWh batch paused`:'Next 4 days: every MW served'}</h3>
    <div class="rgrid"><span>Event cost vs a normal 4 days</span><span>${sgn(c0-cn)}</span>${resp?`<span>Your responses change it by</span><span class="${c1-c0>0?'down':'up'}">${sgn(c1-c0)}</span><span>Unserved: do nothing → yours</span><span>${fmt(u0)} → ${fmt(u1)} MWh</span><span>Batch paused: do nothing → yours</span><span>${fmt(p0)} → ${fmt(p1)} MWh</span><span>Carbon change from responses</span><span>${sgn(co(R)-co(R0),v=>fmt(v,0)+' t')}</span>`:`<span>Unserved</span><span>${fmt(u0)} MWh</span><span>Batch paused</span><span>${fmt(p0)} MWh</span>`}</div>
    <p class="muted sm" style="margin:6px 0 0">${resp?'Includes call-out and service fees.':'No response set yet. Use the alerts above or click equipment.'} Unserved energy is charged at $1,000/MWh.</p>
    <div class="crow" style="margin-top:6px"><button class="btn pri" type="button" id="op-play">▶ Play through it</button><button class="btn" type="button" id="op-clear">Clear all</button></div></div>`;
  $('op-play').onclick=()=>{const F=flagsAt(R,ops.tp);const s=F.length?F[0].from:ops.tp;live.playing=true;$('l-play').textContent='❚❚ Pause';live.speed=1;syncSpeed();live.jump(Math.max(ops.tp,s-6));live.start();};
  $('op-clear').onclick=()=>{Object.assign(ops,{pb:null,ev:'none',bat:null,gen:null,tech:false,svc:null,result:null,tp:null,day:null});$('sim').value='none';$('sim-src').hidden=true;applyOps();};}
// ---- demand routing: tier -> on campus / remote site / paused, for the current hour ----
const REM_MW=12/1.05,RTC=new WeakMap();
function tierSplit(R,t){const I=R.I,O=R.O,L=I.L[t],t1=I.t1[t],t2=I.t2[t],t0=Math.max(0,L-t1-t2),rel=O.rel[t],cur=O.cur[t],un=O.unserved[t];
  const unB=Math.min(un,Math.max(0,t1-rel)),unA=Math.max(0,un-unB);return {L,t0,t1,t2,rel,cur,un,unA,unB};}
function rtCum(R){let c=RTC.get(R);if(c)return c;const n=87600,I=R.I,O=R.O;c={rel:new Float64Array(n+1),cur:new Float64Array(n+1),st:new Float64Array(n+1),t0:new Float64Array(n+1),unA:new Float64Array(n+1),starts:[]};
  for(let t=0;t<n;t++){const s=tierSplit(R,t),on=I.st[t]===1&&s.L>0;c.rel[t+1]=c.rel[t]+s.rel;c.cur[t+1]=c.cur[t]+s.cur;c.st[t+1]=c.st[t]+(on?1:0);c.t0[t+1]=c.t0[t]+s.t0;c.unA[t+1]=c.unA[t]+s.unA;
    if(on&&!(t>0&&I.st[t-1]===1))c.starts.push(t);}
  RTC.set(R,c);return c;}
let rtSig='',rtNextSig='';
const PB0={keep:false,cover:'plan',pol:null},RESP={move:{},keep:{keep:true},pause:{pol:'always'}};
const pbResp=win=>ops.pb&&ops.pb.win&&ops.pb.win[0]===win[0]?ops.pb.resp||'move':'move';
const PBE=new Map();
const tierRate=i=>RM.model==='bundled'||(RM.model==='hybrid'&&i===2)?RM.rate:perMWh(rates()[i]);
function pbCost(R,win){let cost=0,risk=0;for(let h=win[0];h<win[1];h++){cost+=R.A.cost[h]+R.A.relCost[h]+R.A.intCost[h]+R.O.unserved[h]*UNMET;const s=tierSplit(R,h);risk+=s.cur*tierRate(2)+s.unB*tierRate(1)+s.unA*tierRate(0)+Math.max(0,s.un-s.unA-s.unB)*tierRate(2);}return {cost,risk};}
function pbEval(win){const key=[F.flex,win[0],JSON.stringify(plant.cur.caps),plant.attrs.policy,lMode(),ops.ev,ops.failId,JSON.stringify(ops.bat),JSON.stringify(ops.gen),JSON.stringify(ops.svc),RM.model,RM.tier,RM.rate].join('|');
  const got=PBE.get(key);if(got)return got;const e={opt:{},best:null,flex:0};PBE.set(key,e);if(PBE.size>40)PBE.delete(PBE.keys().next().value);
  const I=live.R.I;for(let h=win[0];h<win[1];h++)e.flex+=I.t1[h]*tierRate(1)+I.t2[h]*tierRate(2);
  const jobs=Object.keys(RESP);const step=()=>{const k=jobs.shift();if(!k){e.best=Object.keys(e.opt).reduce((a,b)=>e.opt[b].cost<e.opt[a].cost-1?b:a,'move');rtSig='';if(live.R)drawRoute(live.R,live.t);return;}
    e.opt[k]=pbCost(opsRun(true,{...PB0,...RESP[k],win}),win);setTimeout(step,0);};setTimeout(step,0);return e;}
document.addEventListener('click',ev=>{const b=ev.target.closest&&ev.target.closest('#rt-pb [data-resp]');if(!b||!live.R)return;
  const win=JSON.parse($('rt-pb').dataset.win||'null');if(!win)return;const k=b.dataset.resp;
  ops.pb=k==='move'?null:{...PB0,...RESP[k],win,resp:k};rtSig='';applyOps();});
function drawRoute(R,t){const I=R.I,O=R.O,s=tierSplit(R,t),st=I.st[t]===1,open=s.L>0,h=hourSup(R,t),pol=R.policy||'last_resort';
  // flows in source order; destination order follows tier order
  const F=[[0,'site',s.t0-s.unA],[0,'uns',s.unA],[1,'site',s.t1-s.rel-s.unB],[1,'rem',s.rel],[1,'uns',s.unB],[2,'site',s.t2-s.cur],[2,'pau',s.cur]].map(([a,b,v])=>[a,b,Math.max(0,v)]);
  const cpt=($('rt-sk').clientWidth||700)<540,W=cpt?440:680,k=180/Math.max(80,s.L),SL=cpt?28:34,GAP=12,TOP=30,BW=10,XL=cpt?116:184,XR=W-(cpt?122:206);
  const TI=[['Always-on','Tier 0 · stays on campus','--t0',s.t0],['Movable','Tier 1 · can move off-site','--t1',s.t1],['Batch','Tier 2 · can pause','--t2',s.t2]];
  const srcTop=(i=>{let y=TOP;return TI.map(([,,,v])=>{const hh=Math.max(v*k,2),sl=Math.max(hh,SL),o={y:y+(sl-hh)/2,h:hh,sl,y0:y};y+=sl+GAP;return o;});})();
  const top3=[['grid','grid'],['gas','gas'],['dsl','diesel'],['wind','wind'],['solar','solar'],['nuclear','nuclear'],['bat','battery']].map(([q,n])=>[n,h[q]||0]).filter(x=>x[1]>0.05).sort((a,b)=>b[1]-a[1]).slice(0,cpt?2:3).map(([n,v])=>`${n} ${fmt(v,0)}`).join(' · ');
  const site=F.filter(f=>f[1]==='site').reduce((a,f)=>a+f[2],0);
  const so_=cpt?'stress only':'stress windows only',DI=[['site','On campus',open?(top3||'no supply'):'not open yet','--accent',site,true],['rem','Remote site',st?(cpt?`max ${fmt(REM_MW,1)} MW`:`${fmt(REM_MW,1)} MW max · $123.50/MWh`):so_,'--s-rel',s.rel,true],['pau',cpt?'Paused':'Paused (cancelled)',st?'$1,000/MWh':so_,'--s-int',s.cur,true],['uns','Unserved','alert · plan is short','--bad',s.un,s.un>0.05]].filter(d=>d[5]);
  const dstTop=(()=>{let y=TOP;return DI.map(([,,,,v])=>{const hh=v>0.05?Math.max(v*k,2):0,sl=Math.max(hh,SL),o={y:y+(sl-Math.max(hh,10))/2,h:hh,sl,y0:y};y+=sl+GAP;return o;});})();
  const H=Math.max(srcTop[2].y0+srcTop[2].sl,dstTop[dstTop.length-1].y0+dstTop[dstTop.length-1].sl)+6;
  let g=`<text x="${XL}" y="14" class="sec" text-anchor="end">${cpt?'TIER · MW':'DEMAND TIER'}</text><text x="${XR}" y="14" class="sec">GOES TO${cpt?' · MW':''}</text>`;
  // ribbons
  const so=srcTop.map(o=>o.y),dIdx=Object.fromEntries(DI.map((d,i)=>[d[0],i])),doff=dstTop.map(o=>o.y);const xm1=XL+BW+(XR-XL-BW)*0.45,xm2=XL+BW+(XR-XL-BW)*0.55;
  for(const [ti,dk,v] of F){if(v<0.02||dIdx[dk]==null)continue;const w=v*k,i=dIdx[dk],y1=so[ti],y2=doff[i];so[ti]+=w;doff[i]+=w;
    g+=`<path class="rib" d="M${XL+BW},${y1.toFixed(1)} C${xm1},${y1.toFixed(1)} ${xm2},${y2.toFixed(1)} ${XR},${y2.toFixed(1)} L${XR},${(y2+w).toFixed(1)} C${xm2},${(y2+w).toFixed(1)} ${xm1},${(y1+w).toFixed(1)} ${XL+BW},${(y1+w).toFixed(1)} Z" fill="var(${TI[ti][2]})" opacity="${dk==='site'?.42:.75}"><title>${TI[ti][0]} → ${DI[i][1]}: ${fmt(v,1)} MW</title></path>`;}
  TI.forEach(([n,sub,c,v],i)=>{const o=srcTop[i],cy=o.y0+o.sl/2+(cpt?7:0);g+=`<rect x="${XL}" y="${o.y.toFixed(1)}" width="${BW}" height="${o.h.toFixed(1)}" rx="2" fill="var(${c})"/><text class="nm" x="${XL-8}" y="${cy-3}" text-anchor="end">${n} <tspan class="v" style="font-family:var(--f-mono);font-weight:500">${open?fmt(v,1):'–'}</tspan></text>${cpt?'':`<text x="${XL-8}" y="${cy+12}" text-anchor="end" style="font-size:10.5px">${sub}</text>`}`;});
  DI.forEach(([dk,n,sub,c,v],i)=>{const o=dstTop[i],cy=o.y0+o.sl/2,live=v>0.05;
    g+=live?`<rect x="${XR}" y="${o.y.toFixed(1)}" width="${BW}" height="${o.h.toFixed(1)}" rx="2" fill="var(${c})"/>`:`<rect class="gh" x="${XR+0.5}" y="${o.y.toFixed(1)}" width="${BW-1}" height="10" rx="2"/>`;
    g+=`<text class="nm" x="${XR+BW+8}" y="${cy-3}" style="${live?'':'fill:var(--ink-3)'}">${n} <tspan class="v" style="font-family:var(--f-mono);font-weight:500">${fmt(v,1)}${cpt?'':' MW'}</tspan></text><text x="${XR+BW+8}" y="${cy+12}" style="font-size:10.5px">${sub}</text>`;});
  const svg=`<svg viewBox="0 0 ${W} ${H.toFixed(0)}" role="img" aria-label="Demand routing this hour: always-on ${fmt(s.t0,1)} MW, movable ${fmt(s.t1,1)} MW with ${fmt(s.rel,1)} moved, batch ${fmt(s.t2,1)} MW with ${fmt(s.cur,1)} paused">${g}</svg>`;
  // grid stress: three responses, each with event cost and revenue at risk
  const C1=rtCum(R);let wf,wt;if(st&&open){wf=t;while(wf>0&&I.st[wf-1]===1)wf--;wt=t;while(wt<87599&&I.st[wt+1]===1)wt++;wt++;}
  else{let lo=0,hi=C1.starts.length;while(lo<hi){const q=(lo+hi)>>1;if(C1.starts[q]<=t)lo=q+1;else hi=q;}const ns=C1.starts[lo];if(ns!=null){wf=ns;wt=ns;while(wt<87599&&I.st[wt+1]===1)wt++;wt++;}}
  let pb;
  if(wf==null||!open)pb=`<div class="sx"><div class="hd">Grid stress</div><div class="sub2">${open?'No more grid stress windows in the 10 years.':'Campus not open yet.'}</div></div>`;
  else{const win=[wf,wt],hrs=wt-wf,q=dateOf(wf),E=pbEval(win),sel=pbResp(win),avg=f=>{let a=0;for(let h=wf;h<wt;h++)a+=f(h);return a/hrs;};
    const cap=avg(h=>I.G[h]),L=avg(h=>I.L[h]),o=E.opt[sel];
    const RS=[['move','Move flexible work off-site',`${fmt(avg(h=>Math.min(I.t1[h],REM_MW)),1)} MW to the remote site; gas covers the rest`],['keep','Keep all work here','Nothing moves; run onsite gas harder'],['pause','Pause batch work',`Cancel ${fmt(avg(h=>I.t2[h]),1)} MW of batch jobs; less gas`]];
    pb=`<div class="sx"><div><div class="hd">Grid stress · ${q.wd} ${q.m} ${q.d}, ${String(q.h).padStart(2,'0')}:00–${String(dateOf(wt).h).padStart(2,'0')}:00</div>
      <div class="sub2">${st?`<b>Now</b>, hour ${t-wf+1} of ${hrs}`:`In ${wf-t<48?fmt(wf-t,0)+' h':fmt((wf-t)/24,0)+' days'}`} · imports capped at <b>${fmt(cap,0)} MW</b>, campus needs <b>${fmt(L,0)} MW</b></div></div>
      <div class="sxk"><div><div class="k">Event cost</div><div class="v">${o?money(o.cost):'…'}</div><div class="s">power, remote site and pauses, ${hrs} h</div></div><div><div class="k">Revenue at risk <span class="tag">team</span></div><div class="v ${o&&o.risk>1?'down':''}">${o?money(o.risk):'…'}</div><div class="s">${o?`of ${money(E.flex)} from flexible tenants`:'tenant rent for work not delivered'}</div></div></div>
      <div class="resp" role="radiogroup" aria-label="Response">${RS.map(([k,n,d])=>{const x=E.opt[k];return `<button type="button" class="rb" role="radio" data-resp="${k}" aria-pressed="${sel===k}" aria-checked="${sel===k}"><span class="dot"></span><span class="t">${n}${E.best===k?'<span class="rec">lowest cost</span>':''}</span><span class="n r1">${x?money(x.cost):'…'}<small>cost</small></span><span class="n r2 ${x&&x.risk>1?'down':''}">${x?money(x.risk):'…'}<small>at risk</small></span><span class="d">${d}</span></button>`;}).join('')}</div>
      <p class="muted" style="font-size:11.5px;margin:0">Cost is the packet's decision cost in the window ($123.50/MWh to move, $1,000/MWh to pause). Revenue at risk is the rent for work paused or unserved, at your revenue model's rates.</p></div>`;}
  const sig=svg+pb;if(sig!==rtSig){rtSig=sig;$('rt-sk').innerHTML=svg;$('rt-pb').innerHTML=pb;}$('rt-pb').dataset.win=wf!=null?JSON.stringify([wf,wt]):'';
  // since first power: what routing has cost so far, and the next stress window
  const C=rtCum(R),s0=R.open*730,s1=Math.max(s0,t+1),d=(a)=>a[s1]-a[s0],t0d=d(C.t0);
  const tot=`<div><div class="k">Stress hours so far</div><div class="v">${fmt(d(C.st),0)} h</div></div><div><div class="k">Work moved to remote site</div><div class="v">${fmt(d(C.rel),0)} MWh</div></div><div><div class="k">Batch work paused</div><div class="v">${fmt(d(C.cur),0)} MWh</div></div><div><div class="k">Always-on served</div><div class="v">${t0d>0?fmt(100*(1-d(C.unA)/t0d),2)+'%':'–'}</div></div>`;
  if($('rt-tot').innerHTML!==tot)$('rt-tot').innerHTML=tot;
  let nx='';if(st&&open){let e=t;while(e<87599&&I.st[e+1]===1)e++;nx=`<span class="status stress">Stress now · until ${String(dateOf(e+1).h).padStart(2,'0')}:00</span>`;}
  else{let lo=0,hi=C.starts.length;while(lo<hi){const m=(lo+hi)>>1;if(C.starts[m]<=t)lo=m+1;else hi=m;}const ns=C.starts[lo];
    if(ns!=null){let e=ns;while(e<87599&&I.st[e+1]===1)e++;const q=dateOf(ns),dd=(ns-t)/24;nx=`<span>Next stress window: <b>${q.wd} ${q.m} ${q.d}, ${String(q.h).padStart(2,'0')}:00</b>, ${e-ns+1} h${dd<60?` · in ${dd<2?fmt(ns-t,0)+' h':fmt(dd,0)+' days'}`:''}</span><button class="btn" type="button" data-rtj="1">Jump there</button>`;}
    else nx='<span class="muted">No more stress windows in the 10 years</span>';}
  if(nx!==rtNextSig){rtNextSig=nx;$('rt-next').innerHTML=nx;const b=$('rt-next').querySelector('[data-rtj]');if(b)b.onclick=()=>{const j=document.querySelector('[data-j="stress"]');if(j)j.click();};}}
window.addEventListener('resize',()=>{if(live.R&&!$('v-3').hidden)drawRoute(live.R,live.t);});
function drawOps(R,t){drawSite(R,t);drawRoute(R,t);drawFc(R,t);drawAlerts(R,t);updPanel(R,t);}
function initOps(){$('sim').innerHTML=Object.entries(EV).map(([k,[t]])=>`<option value="${k}">${t}</option>`).join('');$('sim').value=ops.ev;
  const srcs=ORD.filter(k=>plant.cur.caps[k]);$('sim-src').innerHTML=srcs.map(k=>`<option value="${k}">${fmt(plant.cur.caps[k])} MW ${RN[k]}</option>`).join('');if(!ops.failId||!plant.cur.caps[ops.failId])ops.failId=srcs.find(k=>GASK.includes(k))||srcs[0];
  $('sim-src').hidden=ops.ev!=='fail';$('sim-src').value=ops.failId;$('sim-d').textContent=EV[ops.ev][1];
  $('sim').onchange=e=>{const v=e.target.value;$('sim-d').textContent=EV[v][1];if(v==='none'){ops.ev='none';ops.day=null;applyOps();}else setEv(v);};
  $('sim-src').onchange=e=>{ops.failId=e.target.value;setEv('fail');};siteKey='';}

const lMode=()=>ops.mode||plant.attrs.mode;
const baseRun=()=>{const a=plant.attrs;return run(plant.open,plant.cur.caps,a.policy,lMode());};
function drawMode(){const el=$('l-mode');if(!el||!plant)return;const m=lMode(),a=plant.attrs;
  el.innerHTML=`<span class="sm" style="font-weight:600">Gas rule</span><div class="seg" role="group" aria-label="Gas rule"><button type="button" data-m="cost" aria-pressed="${m==='cost'}">Gas when cheaper</button><button type="button" data-m="carbon" aria-pressed="${m==='carbon'}">Grid before gas</button></div><span class="sm" id="l-mode-fx"></span>`;
  el.querySelectorAll('button').forEach(b=>b.onclick=()=>{ops.mode=b.dataset.m===a.mode?null:b.dataset.m;drawMode();applyOps();});
  const z=o=>{const R=run(plant.open,plant.cur.caps,a.policy,o);return E.summarize(R.I,R.O,R.A);},zc=z('cost'),zg=z('carbon'),d=m==='carbon'?{c:zg.total-zc.total,co:zg.co2-zc.co2,vs:'gas when cheaper'}:{c:zc.total-zg.total,co:zc.co2-zg.co2,vs:'grid before gas'};
  $('l-mode-fx').innerHTML=`10 years vs ${d.vs}: cost <b class="${d.c>0?'down':'up'}">${sgn(d.c)}</b>, CO₂ <b class="${d.co>0?'down':'up'}">${sgn(d.co/1e3,v=>fmt(v,0)+'k t')}</b>${m!==a.mode?' · demo override':''}`;}
const live={t:0,playing:true,speed:1,timer:null,cum:null,R:null,over:null,
  setRun(R,keepT){this.R=R;const n=87600,c={cost:new Float64Array(n+1),co2:new Float64Array(n+1),dem:new Float64Array(n+1),uns:new Float64Array(n+1),cur:new Float64Array(n+1)};
    for(let t=0;t<n;t++){c.cost[t+1]=c.cost[t]+R.A.cost[t]+R.A.relCost[t]+R.A.intCost[t];c.co2[t+1]=c.co2[t]+R.A.co2[t];c.dem[t+1]=c.dem[t]+R.I.L[t];c.uns[t+1]=c.uns[t]+R.O.unserved[t];c.cur[t+1]=c.cur[t]+R.O.cur[t];}
    this.cum=c;this.over=buckets(R,0,87600,730);if(!keepT||this.t<plant.open*730)this.t=plant.open*730+24*5+12;this.draw();this.start();},
  start(){clearInterval(this.timer);if(this.playing&&!document.hidden&&!$('v-3').hidden)this.timer=setInterval(()=>{this.t+=this.speed;if(this.t>=87599)this.t=plant.open*730;this.draw();},150);},
  jump(t){this.t=Math.max(0,Math.min(87599,Math.round(t)));this.draw();},
  draw(){const R=this.R;if(!R)return;const t=this.t,I=R.I,a=dateOf(t),m=Math.floor(t/730),op=plant.open;
    $('l-clock').innerHTML=`Year ${Math.floor(t/8760)+1} · ${a.wd} ${a.m} ${a.d}, ${String(a.h).padStart(2,'0')}:00<small>model month ${m}${m>=op?` · ${m>=op+10?'full campus':'ramping up, '+fmt(100*Math.min(1,1/3+(m-op)/15))+'% of full demand'}`:' · before first power'}</small>`;
    const h=hourSup(R,t),L=I.L[t],st=$('l-status');const inEv=ops.result&&ops.result.win&&ops.ev!=='none'&&t>=ops.result.win[0]&&t<ops.result.win[1];
    if(L<=0){st.className='status off';st.textContent=`Not open yet · first power month ${op}`;}
    else if(h.uns>0.01){st.className='status bad';st.textContent=`Short by ${fmt(h.uns,1)} MW`;}
    else if(inEv){st.className='status stress';st.textContent=ops.ev==='fail'?`${RN[ops.failId]} offline`:`${EV[ops.ev][0].split(',')[0]} · in progress`;}
    else if(I.st[t]){st.className='status stress';st.textContent=`Grid stress · import capped at ${fmt(I.G[t],0)} MW`;}
    else if(I.Gord[t]===0){st.className='status';st.textContent='No grid yet · running on site';}
    else{st.className='status';st.textContent=`Normal · grid limit ${fmt(I.Gord[t],0)} MW`;}
    const t0=L-I.t1[t]-I.t2[t];$('l-dem').innerHTML=`${fmt(L,1)}<small> MW</small>`;
    const full=Math.max(80,L*1.05);const seg=(v,c,lab,cl)=>v>0.01?`<div class="${cl||''}" style="flex:${v} 1 0;background:var(${c})" title="${lab} ${fmt(v,1)} MW">${v/full>0.08?fmt(v,0):''}</div>`:'';
    $('l-dbar').innerHTML=L>0?seg(t0,'--t0','Always-on')+seg(I.t1[t],'--t1','Movable')+seg(I.t2[t],'--t2','Batch','lt')+`<div style="flex:${Math.max(0,full-L)} 1 0;background:transparent"></div>`:'<div style="flex:1;color:var(--ink-3);font-weight:400">Campus not open yet</div>';
    $('l-met').innerHTML=L>0?`${fmt(100*(L-h.uns-h.cur)/L,0)}<small>% met</small>`:'–';
    const lim=I.G[t];$('l-sbar').innerHTML=L>0?SUP.map(([k,n,c,cl])=>seg(h[k],c,n,cl)).join('')+`<div style="flex:${Math.max(0,full-L)} 1 0;background:transparent"></div><span class="limit" style="left:${Math.min(100,100*lim/full)}%"></span>`:'<div style="flex:1"></div>';
    $('l-skeys').innerHTML=SUP.filter(([k])=>h[k]>0.01).map(([k,n,c])=>`<span><i style="background:var(${c})"></i>${n} ${fmt(h[k],1)}</span>`).join('')+(L>0?`<span><i style="width:0;border-left:2px dashed var(--ink);height:10px;border-radius:0"></i>grid limit ${fmt(lim,0)}</span>`:'');
    const lo=Math.max(0,t-167),Z=buckets(R,lo,t+1,1);let pk=80;for(let i=0;i<Z.k;i++)pk=Math.max(pk,Z.L[i]*1.05);
    const labs=[];for(let i=0;i<Z.k;i+=24){const q=dateOf(lo+i);labs.push([i,`${q.wd} ${q.d}`]);}
    area($('l-week'),Z,{h:150,ymax:Math.ceil(pk/25)*25,ticks:[0,25,50,75].filter(v=>v<=pk),labels:labs,cursor:Z.k,aria:'Last seven days',tip:i=>{const tt=lo+i,hh=hourSup(R,tt),q=dateOf(tt);return `<div class="h">${q.wd} ${q.m} ${q.d} ${String(q.h).padStart(2,'0')}:00${R.I.st[tt]?' · grid stress':''}</div>${SUP.filter(([k])=>hh[k]>0.01).map(([k,n,c])=>row(n,fmt(hh[k],1),c)).join('')}${row('Demand',fmt(R.I.L[tt],1))}${row('Grid limit',fmt(R.I.G[tt],1))}`;}});
    const ZO=this.over;let po=80;for(let i=0;i<ZO.k;i++)po=Math.max(po,ZO.L[i]*1.05);
    area($('l-over'),ZO,{h:60,ymax:po,ticks:[0],noshade:true,labels:[0,18,24,30,60,90].map(mm=>[mm,'m'+mm]),band:[t/730-0.5,t/730+0.5],aria:'10-year overview',tip:i=>`<div class="h">Model month ${i}</div>${row('Demand',fmt(ZO.L[i],1)+' MW avg')}<div class="muted">Click to jump</div>`,click:i=>this.jump(i*730+24*10+14)});
    const c=this.cum,s0=op*730,s1=Math.max(s0,t+1),cost=c.cost[s1]-c.cost[s0],co2=c.co2[s1]-c.co2[s0],dem=c.dem[s1]-c.dem[s0],un=c.uns[s1]-c.uns[s0],pa=c.cur[s1]-c.cur[s0];
    drawOps(R,t);
    $('l-tot').innerHTML=`<div><div class="k">Since first power</div><div class="v">${t>=s0?fmt((t-s0)/730,1)+' mo':'–'}</div></div><div><div class="k">Demand met</div><div class="v">${dem?fmt(100*(dem-un-pa)/dem,2)+'%':'–'}</div></div><div><div class="k">Power cost</div><div class="v">${money(cost)}</div></div><div><div class="k">Carbon</div><div class="v">${fmt(co2/1e3,1)}k t</div></div>`;}};
$('l-play').onclick=()=>{live.playing=!live.playing;$('l-play').textContent=live.playing?'❚❚ Pause':'▶ Play';live.start();};
const syncSpeed=()=>document.querySelectorAll('#l-speed button').forEach(b=>b.setAttribute('aria-pressed',+b.dataset.v===live.speed));
document.querySelectorAll('#l-speed button').forEach(b=>b.onclick=()=>{live.speed=+b.dataset.v;syncSpeed();});syncSpeed();
document.querySelectorAll('[data-j]').forEach(b=>b.onclick=()=>{if(!live.R)return;const j=b.dataset.j,R=live.R,o=plant.open;
  if(j==='open')live.jump(o*730+24*3+14);else if(j==='grid')live.jump((18+F.delay)*730+24*5+14);else if(j==='full')live.jump((o+10)*730+24*5+14);else if(j==='y6')live.jump(5*8760+24*200+14);
  else{let t=live.t+24;while(t<87600&&!(R.I.st[t]&&R.I.L[t]>0))t++;if(t>=87600){t=o*730;while(t<87600&&!(R.I.st[t]&&R.I.L[t]>0))t++;}live.jump(t);if(live.speed>6){live.speed=1;syncSpeed();}}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInterval(live.timer);else live.start();});
if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)live.playing=false;

// ---------------- steps ----------------
let step=1;
function showStep(n){if(n>1&&!plant&&n!==2)return;step=n;[0,1,2,3].forEach(k=>{$('v-'+k).hidden=k!==n;$('tab-'+k).setAttribute('aria-selected',k===n);$('tab-'+k).classList.toggle('done',k<n);});
  if(n===3){if(!plant)return showStep(1);if(!live.R||live.R.caps!==plant.cur.caps){Object.assign(ops,{pb:null,ev:'none',bat:null,gen:null,tech:false,svc:null,result:null,tp:null,day:null});ops.mode=null;initOps();selK='chillers';live.setRun(baseRun(),false);drawOpsAll();drawMode();}else live.start();$('l-play').textContent=live.playing?'❚❚ Pause':'▶ Play';}else clearInterval(live.timer);
  window.scrollTo({top:0});}
document.querySelectorAll('nav.steps button').forEach(b=>b.onclick=()=>{const n=+b.dataset.s;if(n>1&&!plant){if(chosen!=null&&rows.every(r=>r.done)){afterPlant=n===3?3:null;startPlant(chosen);}else{pendingGo=n;setStatus();}return;}showStep(n);syncProj();});

// ================= Portfolio, US county map, reliability and realism limits, equipment timelines =================
// Added after customer feedback. Everything below sits on top of the original engine and screens.
const MAPD=window.PEAKPOWER_SITE_MAP,CMAP=new Map(MAPD.c.map(c=>[c.f,c]));
const GL=['Good','Moderate','Bad','Not graded','Excellent'],GCLS=['g','m','b','n','x'],GCOL=['var(--good)','#c98500','var(--bad)','var(--rule)','#0a5c0a'];
const pill=(r,t)=>`<span class="rt ${r==null?'n':GCLS[r]}">${r==null?(t||'…'):(t||GL[r])}</span>`;
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const GRK={calm:0,packet:1,wave:2,tight:3};
const STRESS_TXT={calm:'no stress events',packet:'7 events a year, imports cut to 60%',wave:'packet events plus a 2 week August heat wave at 50%',tight:'7 events a year, imports cut to 40%'};
const LEADS={packet:{},market:{gas_turbine:45}},COMM=3;
const XS={site:null};
// share of annual energy the contracted wind and solar supply, per contract mix (full 10 year hourly runs of the case packet plans)
const VSH={W100:0.48,W150S50:0.78,W200S100:0.89,W200S100N25:0.79};
// design drought: 5 days of almost no wind and thin sun every January, with grid imports cut to 60%
const LULL={d:5,start:19*24,wind:0.15,sol:0.5,frac:0.6,_w:null,_e:null,
  wx(){return this._w||(this._w=Array.from({length:10},(_,y)=>({from:y*8760+this.start,to:y*8760+this.start+this.d*24,wind:this.wind,solar:this.sol})));},
  ev(){return this._e||(this._e=Array.from({length:10},(_,y)=>({from:y*8760+this.start,to:y*8760+this.start+this.d*24,frac:this.frac})));}};

// ---- state table: name, grid region (approximate), policy grade and the sourced reason ----
const STP={};
`01|AL|Alabama|Southeast utilities
02|AK|Alaska|Isolated Alaska grids
04|AZ|Arizona|Western utilities
05|AR|Arkansas|MISO
06|CA|California|CAISO
08|CO|Colorado|Western utilities
09|CT|Connecticut|ISO-NE
10|DE|Delaware|PJM
11|DC|District of Columbia|PJM
12|FL|Florida|Southeast utilities
13|GA|Georgia|Southeast utilities
15|HI|Hawaii|Isolated Hawaii grids
16|ID|Idaho|Western utilities
17|IL|Illinois|PJM in the north, MISO elsewhere
18|IN|Indiana|MISO and PJM
19|IA|Iowa|MISO
20|KS|Kansas|SPP
21|KY|Kentucky|PJM and Southeast utilities
22|LA|Louisiana|MISO
23|ME|Maine|ISO-NE
24|MD|Maryland|PJM
25|MA|Massachusetts|ISO-NE
26|MI|Michigan|MISO and PJM
27|MN|Minnesota|MISO
28|MS|Mississippi|MISO and Southeast utilities
29|MO|Missouri|MISO and SPP
30|MT|Montana|Western utilities
31|NE|Nebraska|SPP
32|NV|Nevada|Western utilities
33|NH|New Hampshire|ISO-NE
34|NJ|New Jersey|PJM
35|NM|New Mexico|Western utilities and SPP
36|NY|New York|NYISO
37|NC|North Carolina|Southeast utilities and PJM
38|ND|North Dakota|MISO and SPP
39|OH|Ohio|PJM
40|OK|Oklahoma|SPP
41|OR|Oregon|Western utilities
42|PA|Pennsylvania|PJM
44|RI|Rhode Island|ISO-NE
45|SC|South Carolina|Southeast utilities
46|SD|South Dakota|SPP and MISO
47|TN|Tennessee|TVA
48|TX|Texas|ERCOT
49|UT|Utah|Western utilities
50|VT|Vermont|ISO-NE
51|VA|Virginia|PJM
53|WA|Washington|Western utilities
54|WV|West Virginia|PJM
55|WI|Wisconsin|MISO
56|WY|Wyoming|Western utilities`.split('\n').forEach(l=>{const [k,a,n,r]=l.split('|');STP[k]={a,n,reg:r,g:0,t:'No statewide pause or incentive freeze found in the sources reviewed. 38 states waive sales tax on data center equipment (NCSL), so confirm this state\'s own program.'};});
const PROP='A statewide moratorium has been proposed or planned. It is not law in the sources reviewed';
Object.entries({
 '04':[1,'Budget talks reportedly include a three year pause on new data center tax exemption certificates. Reported, not confirmed.'],
 '06':[1,'Sources conflict on a 2026 statewide restriction, and large load tariff bills (SB 886) are pending. Verify before relying on this.'],
 '10':[1,'A moratorium bill (SB 353) stalled in the Senate in 2026.'],
 '13':[1,'The Senate passed SB 476 in February 2026, which would end nearly all state tax credits, including new ones for data centers. Final outcome not checked.'],
 '17':[1,'The state paused processing of new Data Center Investment Program agreements on July 1, 2026. Energy and water bills are pending.'],
 '18':[0,'No pause found. Data centers using the sales tax exemption must share 1% of the savings with local governments (HB 1210, March 2026).'],
 '23':[1,'The governor vetoed a limited moratorium on large data centers, and an executive order created an advisory council to study them.'],
 '24':[1,PROP+' (HB 120).'],
 '26':[1,PROP+' (HB 5594 to 5596, in committee).'],
 '27':[1,PROP+' (HF 4888, in committee).'],
 '33':[1,'The governor plans a multi year statewide moratorium in the 2027 budget.'],
 '35':[1,'A moratorium is planned for the 2027 legislative session.'],
 '36':[2,'Executive Order 62 (July 14, 2026) pauses environmental permits for facilities over 50 MW for about a year while a statewide environmental review is completed.'],
 '37':[1,PROP+' (H 1189, a two year pause for 100 MW and up, in committee).'],
 '39':[1,'The state has stopped considering new data center sales tax exemption applications since May 2026 while it studies data center growth.'],
 '40':[1,PROP+' (SB 1488, in committee).'],
 '41':[1,'State land is frozen for data centers through July 2027, and loads of 20 MW and up sit in a separate rate class (POWER Act, 2025).'],
 '45':[1,PROP+' (H 5286, pending).'],
 '48':[2,'Texas paused data center environmental permits (TCEQ, since Sep 21) while ERCOT audits loads of 75 MW and up. Senate Bill 6 (2025) also sets rules for loads of 75 MW and up.'],
 '50':[1,PROP+' (S.205, until 2030, in committee).'],
 '51':[1,'The sales tax exemption (through 2035) is under review. The Senate proposed phasing it out from 2027, the House would keep it.'],
 '53':[1,'Incentives were narrowed in April 2026: replacement servers and the refurbishment route no longer qualify.']
}).forEach(([k,[g,t]])=>{STP[k].g=g;STP[k].t=t;});
const WLBL=['Low','Low to medium','Medium to high','High','Extremely high'];
const WTXT=(c,tx)=>{if(c.w==null)return 'Not scored. No water stress data for this watershed.';const e=tx&&c.e?' The Edwards Aquifer Authority also limits groundwater pumping, so cooling water needs another source.':'';
  if(c.w<0)return 'Arid watershed with little current water use, so stress is not defined. Treat as Moderate: cooling water will be scarce and plants may need dry cooling, which raises power use.'+e;
  return `Baseline water stress is ${WLBL[c.w].toLowerCase()}: about ${c.wp}% of available surface and groundwater in this watershed is already withdrawn. ${c.w>=3?'Cooling water is a real siting risk, and dry cooling raises power use.':c.w===2?'Cooling water needs a secured source.':'Cooling water is unlikely to limit the site.'}`+e;};
const HTXT=c=>{if(c.h==null)return 'Not scored. No FEMA risk data for this county.';const p=c.h[0],t=c.h[1].map(([i,sh])=>`${MAPD.hz[i]} (${sh}% of expected loss)`);
  return `Expected yearly damage to buildings from natural hazards, per dollar of buildings, is higher than in ${p}% of US counties. Biggest drivers: ${t.join(' and ')||'none'}. ${p>85?'This is a siting risk, so plan for resilience or look elsewhere.':p>=60?'Worth a site specific hazard study.':'Low relative exposure.'} River flooding dominates this index in many counties, so check site flood maps.`;};
const QTXT=c=>{const g=c.q==null?null:MAPD.qreg[c.q];if(!g)return 'Not scored. No queue data for this county.';if(g.med==null||g.n<15)return `Not scored. Too few power plants reached operation in the ${g.name} area in 2021 to 2025 to measure a wait.`;
  return `${g.name} area. Power plants that came online in 2021 to 2025 waited a median of ${g.med} years from interconnection request to operation (middle half: ${g.p25} to ${g.p75} years, ${g.n} plants), and ${g.act} GW is still waiting in the queue. This is the generation queue, so it shows how congested the grid is, not your own wait. Large loads are studied separately, so confirm with the utility.`;};
const LOCALZ={'09009':'New Haven is considering a 12 month pause','37183':'Raleigh held a hearing on a 6 month moratorium','37119':'Charlotte has an extension hearing on its pause','37081':'Guilford County held a hearing on a pause','17031':'a Chicago moratorium ordinance is in committee','44009':'Hopkinton is studying a ban','33013':'Bow planning board proposed a moratorium'};
MAPD.c.forEach(c=>{c.s=c.f.slice(0,2);if(c.r[2]<0)c.r[2]=STP[c.s].g;const tx=c.s==='48';c.r[4]=c.w==null?3:(c.w<=1?0:c.w===2?1:c.w>=3?2:1);if(tx&&c.e)c.r[4]=2;c.r[5]=c.h==null?3:c.h[0]<60?0:c.h[0]<=85?1:2;c.r[6]=LOCALZ[c.f]?1:3;{const g=c.q==null?null:MAPD.qreg[c.q];c.r[3]=c.fd==null?(c.dh<=100?0:c.dh<=250?1:2):(c.fd<=50?0:c.fd<=150?1:2);c.r[7]=!g||g.med==null||g.n<15?3:g.med<4?0:g.med<=6?1:2;}});
const stOf=c=>STP[c.s];
const SX={wc:{fips:'48491',stage:'Design',stress:'packet',short:'Williamson campus'},bf:{fips:'48139',stage:'Diligence',stress:'packet',short:'Brownfield by a substation'},gf:{fips:'48331',stage:'Land option',stress:'packet',short:'Greenfield with room to grow'},ww:{fips:'48353',stage:'Screening',stress:'tight',short:'West Texas wind corridor'}};
SITES.forEach(s=>Object.assign(s,SX[s.id]));
let mapLayer='all',mapScope='tx',selCounty='48491',ptab='fin',pSig='',pTok=0,pfView='proj',mapBuilt=false;
const PORT={};

// ---- hard reliability constraint: the site's design stress case is a floor the user cannot relax ----
function effGrid(){const st=XS.site||curSite(),floor=(st&&st.stress)||'packet';return F.hard&&GRK[F.grid]<GRK[floor]?floor:F.grid;}
const siteEff=st=>st.id===siteId?{...st,delay:F.delay,acres:F.acres}:st;
function withSite(st,fn){const sv={d:F.delay,a:F.acres,s:XS.site};F.delay=st.delay;F.acres=st.acres;XS.site=st;try{return fn();}finally{F.delay=sv.d;F.acres=sv.a;XS.site=sv.s;}}
function keyFor(st){return JSON.stringify([st.id,F.delay,F.acres,effGrid(),F.leads,F.permit,F.hard,F.vcap,F.cap,F.capMode,F.dead,F.ren,F.growth,F.weather,F.flex,RM.model,RM.tier,RM.mk,RM.rate]);}
const getPort=st=>st.id===siteId?PORT[keyFor(st)]:withSite(st,()=>PORT[keyFor(st)]);
function summRows(rs){const ok=rs.filter(r=>feasible(r.r)&&inDeadline(r.o));const best=ok.length?ok.reduce((a,b)=>b.r.e.profit>a.r.e.profit?b:a):null;
  return {o:best?best.o:null,p:best?best.r.e.profit:null,rev:best?best.r.e.rev:null,pc:best?best.r.z.total:null,first:ok.length?ok[0].o:null,gate:best?'pass':'fail',caps:best?best.r.caps:null,op:best?best.o:null,pol:best?best.r.base.policy:null,md:best?best.r.base.mode:null};}
function recordCurrent(){if(!rows.length||!rows.every(r=>r.done))return;const k=keyFor(curSite()),sm=summRows(rows),old=PORT[k];PORT[k]=sm;
  if(!old||old.o!==sm.o||old.p!==sm.p||pSig!==k){pSig=k;drawPortfolio();schedulePortfolio();}schedSens();drawSens();}
function schedulePortfolio(){const tok=++pTok,todo=SITES.filter(st=>st.id!==siteId&&!getPort(st));let si=0,oi=0,acc=[];
  const stp=()=>{if(tok!==pTok)return;if(si>=todo.length){drawPortfolio();return;}const st=todo[si];
    withSite(st,()=>{const o=OPENS[oi];acc.push({o,r:bestAt(o,false),done:true});});oi++;
    if(oi>=OPENS.length){withSite(st,()=>{PORT[keyFor(st)]=summRows(acc);});acc=[];oi=0;si++;drawPortfolio();}
    setTimeout(stp,6);};
  if(todo.length)setTimeout(stp,60);}


// ---- readable titles: turn small grey labels into real card titles, with the explanation on its own line ----
function titleize(){document.querySelectorAll('.eyebrow:not([data-t])').forEach(e=>{e.dataset.t='1';const nx=e.nextElementSibling;
  if(nx&&nx.tagName==='H2'){e.classList.add('kick');return;}
  e.classList.add('ttl');const nodes=[...e.childNodes],tn=nodes.find(n=>n.nodeType===3&&n.textContent.trim());if(!tn)return;
  const raw=tn.textContent.trim(),i=raw.indexOf(' · '),a=i<0?raw:raw.slice(0,i),b=i<0?'':raw.slice(i+3).trim(),sp=document.createElement('span');sp.className='et';sp.textContent=a.charAt(0).toUpperCase()+a.slice(1);tn.replaceWith(sp);
  if(b){const es=document.createElement('span');es.className='es';es.textContent=b.charAt(0).toUpperCase()+b.slice(1);e.appendChild(es);}});}
let ttlPending=false;function schedTitleize(){if(ttlPending)return;ttlPending=true;requestAnimationFrame(()=>{ttlPending=false;titleize();});}

// ---- reset every setting to its starting value ----
const F0=JSON.parse(JSON.stringify(F)),RM0=JSON.stringify(RM);
function settingsChanged(){return Object.keys(F0).some(k=>k!=='delay'&&k!=='acres'&&JSON.stringify(F[k])!==JSON.stringify(F0[k]))||JSON.stringify(RM)!==RM0;}
function syncReset(){const b=$('reset-btn');if(b)b.disabled=!settingsChanged();}
function resetAll(){Object.assign(F,JSON.parse(JSON.stringify(F0)));Object.assign(RM,JSON.parse(RM0));const st=SITES.find(x=>x.id===siteId);if(st){F.delay=st.delay;F.acres=st.acres;}chosen=null;
  if(step>1){plant=null;showStep(1);}drawModels();step1();}

// ---- tier shares: how much of the load can move or pause (packet default 36%) ----
const FLEXV=[{v:0,n:'Firm',t:'all work stays on, 0% flexible'},{v:0.5,n:'Half',t:'82% always on, 12% movable, 6% batch'},{v:1,n:'Packet',t:'64% always on, 24% movable, 12% batch'}];
const keyFlex=(st,v)=>{const o=F.flex;F.flex=v;try{return keyFor(st);}finally{F.flex=o;}};
let sTok=0;
function schedSens(){const tok=++sTok,st=curSite(),base=keyFor(st),todo=FLEXV.filter(q=>!PORT[keyFlex(st,q.v)]);let qi=0,oi=0,acc=[];
  const stp=()=>{if(tok!==sTok||keyFor(curSite())!==base)return;if(qi>=todo.length){drawSens();return;}const q=todo[qi],sv=F.flex;
    try{F.flex=q.v;acc.push({o:OPENS[oi],r:bestAt(OPENS[oi],false),done:true});oi++;
      if(oi>=OPENS.length){PORT[keyFor(st)]=summRows(acc);acc=[];oi=0;qi++;}}finally{F.flex=sv;}
    drawSens();setTimeout(stp,8);};
  if(todo.length)setTimeout(stp,200);}
function flexXOld(v,sm){if(!sm||sm.o==null||!sm.caps)return null;if(sm.x!==undefined)return sm.x;const sv=F.flex;F.flex=v;
  try{const R2=run(sm.op,sm.caps,sm.pol,sm.md,{capFrac:0.4,packetEvents:true}),z2=E.summarize(R2.I,R2.O,R2.A);sm.x={gas:gasOf(sm.caps),up:capexOf(sm.caps).up,t:z2.uns};}catch(e){sm.x=null;}finally{F.flex=sv;}return sm.x;}
function drawSensOld(){const el=$('flex-sens');if(!el)return;const st=curSite(),cur=F.flex;
  const FL=[{v:0,n:'0% flexible',t:'All work always on'},{v:0.5,n:'18% flexible',t:'82% always on, 12% movable, 6% batch'},{v:1,n:'36% flexible',t:'64% always on, 24% movable, 12% batch'}];
  const D=FL.map(q=>{const sm=PORT[keyFlex(st,q.v)];return {q,sm,x:flexX(q.v,sm)};});
  const cols=D.map(({q,sm,x})=>{const on=Math.abs(q.v-cur)<1e-9;let a,b,c,d;
    if(!sm){a=b=c=d='<span class="muted">Checking</span>';}
    else if(sm.p==null){a='No plan';b=c=d='-';}
    else{a=money(sm.p);b=x?fmt(x.gas)+' MW':'...';c=x?money(x.up):'...';d=x?(x.t<0.5?'<span style="color:var(--good)">Holds</span>':'<span style="color:var(--warn-ink)">Short '+fmt(x.t,0)+' MWh</span>'):'...';}
    return `<div class="fscol${on?' on':''}"><div class="fsh">${q.n}${on?' <small>selected</small>':''}</div><div class="fss">${q.t}</div><div class="fsv"><span>10 year profit</span><b>${a}</b></div><div class="fsv"><span>Onsite gas needed</span><b>${b}</b></div><div class="fsv"><span>Upfront equipment</span><b>${c}</b></div><div class="fsv"><span>Tighter grid test</span><b>${d}</b></div></div>`;}).join('');
  let note='';const A=D[0],B=D[2];
  if(A.sm&&B.sm&&A.sm.p!=null&&B.sm.p!=null&&A.x&&B.x){const cl=[];
    cl.push(B.sm.p<A.sm.p?`profit falls ${money(A.sm.p-B.sm.p)}`:B.sm.p>A.sm.p?`profit rises ${money(B.sm.p-A.sm.p)}`:'profit is unchanged');
    if(B.x.gas<A.x.gas)cl.push(`onsite gas falls by ${fmt(A.x.gas-B.x.gas)} MW`);else if(B.x.gas>A.x.gas)cl.push(`onsite gas rises by ${fmt(B.x.gas-A.x.gas)} MW`);
    if(A.x.t>=0.5&&B.x.t<0.5)cl.push(`the tighter grid test goes from short ${fmt(A.x.t,0)} MWh to holding`);else if(A.x.t<0.5&&B.x.t>=0.5)cl.push(`the tighter grid test goes from holding to short ${fmt(B.x.t,0)} MWh`);
    note=`<p class="muted sm" style="margin:8px 0 0">From 0% to 36% flexible: ${cl.join(', ')}.${B.sm.p<A.sm.p?' Movable and batch work pays lower rent, so profit falls as the flexible share rises.':''}</p>`;}
  el.innerHTML=`<h3 class="sech">What flexible work changes</h3><p class="sub" style="margin:0 0 8px">Same site and same opening month. Only the share of work that can move or pause changes.</p><div class="fsrow">${cols}</div>${note}`;}

// ---- live site: say why a source is not in the plan ----
function offWhy(k,R,RX){const r=RX[k];if(!r)return '';
  if(k==='battery_4h')return `$${fmt(r.capex_usd_per_kw,0)} per kW, up to ${fmt(r.max_mw)} MW offered`;
  const late=r.available_month>R.open;
  return `${late?'not available until':'available from'} month ${r.available_month}, $${fmt(r.payment_usd_per_mwh,0)} per MWh`;}

// ---- county screen: plain reasons behind every grade ----
function cWhy(c){const S=stOf(c),tx=c.s==='48';
  const loc=`${c.dm} mi to ${MAPD.metros[c.am]}`+(tx&&c.c?'. Core county, so land is scarce and costly':!tx&&c.dm<=15?'. Inside a major metro, so land is scarce and costly':'')+(tx&&c.k?'. Gulf coast, so hurricane and flood exposure':'');
  const en=!tx?`Not graded on its own. The hourly grid model in this demo covers ERCOT only. This county sits in ${S.reg}, so the Overall grade uses that region's grid queue wait as a stand in for energy (see Time to power).`
    :c.z===2?'Outside ERCOT or on its edge (approximate boundary). The grid model here is ERCOT only, so its results do not apply.':c.z===1?'West Texas wind belt. Plenty of wind and solar, but transmission out of the region is congested, so grid upgrades run slower.':`ERCOT load zone, ${c.dt} mi from ${MAPD.txm[c.at]}. Deep gas and grid supply near demand.`;
  const pol=S.t;
  const fib=c.fd==null?`${c.dh} mi to the ${MAPD.hubs[c.ah]} carrier hub`:`Nearest listed colocation or network facility is ${c.fd} mi away (${c.fc}). ${c.fn===0?'None within 50 miles':c.fn+(c.fn===1?' facility':' facilities')+' within 50 miles'}.`;
  return {loc:[c.r[0],loc,'Public geography'],en:[c.r[1],en,tx?'Team screen, approximate market boundary':'Not modeled yet'],pol:[c.r[2],pol,'State actions in public sources, Nov 2026. Local zoning and abatements not loaded'],fib:[c.r[3],fib,'CAIDA IXP dataset (PeeringDB based), Oct 2026 release. Facility locations, not fiber routes'],
    water:[c.r[4],WTXT(c,tx),c.w==null?'Data needed':'WRI Aqueduct 4.0 baseline water stress, watershed matched to the county centroid'],
    haz:[c.r[5],HTXT(c),c.h==null?'Data needed':'FEMA National Risk Index v1.20 (Dec 2025), expected annual building loss per dollar of building value'],
    zon:[c.r[6],LOCALZ[c.f]?`A local pause on data centers is under consideration: ${LOCALZ[c.f]}.`:'Not scored. Needs county and city zoning and ordinance data. The state level view is under Policy.',LOCALZ[c.f]?'Electric Choice moratorium tracker, Oct 2026':'Data needed'],
    pwr:[c.r[7],QTXT(c),c.r[7]===3?'Data needed':'LBNL Queued Up, data through 2025, by grid operator region']};}
const ovRule=(en,items)=>{const sc=items.filter(x=>x[0]!==3);if(en===3)return sc.filter(x=>x[0]===2).length>=2?2:3;
  const avg=sc.reduce((a,x)=>a+x[0]*x[1],0)/sc.reduce((a,x)=>a+x[1],0),anyBad=sc.some(x=>x[0]===2);const nb=sc.filter(x=>x[0]===2).length;return (en===2||avg>=1)?2:(nb===0&&avg<=0.35)?4:(nb<=1&&avg<=0.6)?0:1;};
// Outside Texas the grid queue wait stands in for energy, because the dispatch model covers ERCOT only
const cOverall=c=>{const r=c.r,tx=c.s==='48';return tx?ovRule(r[1],[[r[0],1],[r[1],2],[r[2],1.5],[r[3],1],[r[4],1],[r[5],1],[r[7],1]]):ovRule(r[7],[[r[0],1],[r[7],2],[r[2],1.5],[r[3],1],[r[4],1],[r[5],1]]);};
const LAYERS=[['all','Overall'],['loc','Location'],['en','Energy'],['pol','Policy'],['fib','Fiber']],LAYERS2=[['water','Water'],['haz','Hazard'],['pwr','Time to power']],LIDX={loc:0,en:1,pol:2,fib:3,water:4,haz:5,zon:6,pwr:7};
const LAYTXT={all:'Overall is a weighted average of the scored factors, with energy counting double and policy one and a half times. Excellent means no Bad factor and a nearly all Good average. Good means a mostly Good average with at most one Bad factor. Bad means energy is Bad or the average is mostly Bad. Outside Texas the grid queue wait stands in for energy, because the dispatch model covers ERCOT only.',
  loc:'Distance to the nearest of 57 metro anchors. Good within 90 miles, Moderate within 170. Counties inside a metro are held at Moderate for land cost, and the Texas Gulf coast is held back one step.',
  en:'Texas only. ERCOT counties within 140 miles of Dallas Fort Worth, Houston, Austin or San Antonio are Good. The West Texas wind belt is Moderate because of transmission congestion. Outside ERCOT is Bad. Other states are not graded here. Their Overall grade uses the grid queue wait as a stand in.',
  pol:'State level. Bad where a statewide pause on data center permits is in effect (Texas, New York). Moderate where incentives are frozen or narrowed, a moratorium is proposed, or sources conflict. Good where no pause was found.',
  fib:'Distance to the nearest colocation or network facility in the CAIDA IXP dataset (676 US sites, from PeeringDB, Oct 2026). Good within 50 miles, Moderate within 150. This shows where networks meet, not where fiber runs, and facilities that never registered are missing.',
  water:'WRI Aqueduct 4.0 baseline water stress for the watershed containing the county centroid. Good under 20% of supply withdrawn, Moderate for 20 to 40% and for arid watersheds, Bad above 40%. The Edwards Aquifer counties are Bad regardless.',
  haz:'FEMA National Risk Index: expected yearly building damage per dollar of buildings, across 17 natural hazards (flood, hurricane, wildfire, earthquake, tornado, hail, winter weather and more). Good below the 60th percentile of US counties, Moderate 60th to 85th, Bad above the 85th. The index also has social vulnerability scores that do not matter for a data center, so they are left out.',
  zon:'Moderate where a city or county pause is under consideration according to the moratorium tracker (seven places). Everything else needs zoning data. These extra factors do not change the Overall grade yet.',
  pwr:'LBNL Queued Up, by grid operator area, not by county. Median years from interconnection request to operation for power plants that came online in 2021 to 2025: Good under 4 years, Moderate 4 to 6, Bad over 6. It measures generation queues as a sign of congestion, not a data center load wait.'};

// ---- map: built once per scope, recolored per layer ----
// Outline paths load on demand: Texas first (the map opens on Texas), the rest of the US only when that view is chosen. Each file is requested once.
const SHP={};function loadShapes(k){return SHP[k]||(SHP[k]=new Promise((ok,no)=>{const e=document.createElement('script');e.src='js/data/site-shapes-'+k+'.js';e.onload=()=>ok();e.onerror=()=>{delete SHP[k];no(new Error('Could not load map shapes ('+k+')'));};document.head.appendChild(e);}));}
let mapSeq=0;
function buildMap(){const my=++mapSeq,tx=mapScope==='tx';$('map').innerHTML='<p class="muted sm" style="padding:12px">Loading the county map…</p>';
  const need=tx?loadShapes('tx'):Promise.all([loadShapes('tx'),loadShapes('us')]);
  need.then(()=>{if(my===mapSeq)drawMapSvg();},e=>{if(my===mapSeq)$('map').innerHTML='<p class="note bad">'+esc(e.message)+'. Reload the page to try again.</p>';});}
function drawMapSvg(){const SH=window.PEAKPOWER_SITE_SHAPES,tx=mapScope==='tx',cs=tx?MAPD.c.filter(c=>c.s==='48'):MAPD.c,vb=tx?MAPD.txbox:[0,0,MAPD.vb[0],MAPD.vb[1]];
  $('map').innerHTML=`<svg class="${tx?'tx':'us'}" viewBox="${vb.join(' ')}" role="img" aria-label="${tx?'Texas':'United States'} counties graded by factor"><g id="cg">${cs.map(c=>`<path class="cty" data-f="${c.f}" d="${SH.d[c.f]}"/>`).join('')}</g>${tx?'':`<path class="sbd" d="${SH.sb}"/>`}<g id="pins"></g></svg>`;
  mapBuilt=true;recolor();drawPins();selMark();drawMapChrome();}
function recolor(){const L=mapLayer;document.querySelectorAll('#cg .cty').forEach(p=>{const c=CMAP.get(p.dataset.f),v=L==='all'?cOverall(c):c.r[LIDX[L]];p.setAttribute('fill',GCOL[v]);p.setAttribute('fill-opacity',v===3?'.5':v===4?'.9':'.62');});}
function drawPins(){const g=$('pins');if(!g)return;const tx=mapScope==='tx',r=tx?4.6:6.5,fs=tx?6.2:8.5;
  g.innerHTML=SITES.map((st,i)=>{const c=CMAP.get(st.fips),on=st.id===siteId;return `<g class="pin${on?' on':''}" data-site="${st.id}" transform="translate(${c.x},${c.y})" tabindex="0" role="button" aria-label="${esc(st.nm)}"><circle r="${on?r*1.3:r}"/><text y="${fs*0.36}" text-anchor="middle" style="font-size:${fs}px">${i+1}</text></g>`;}).join('');}
function selMark(){document.querySelectorAll('#cg .sel').forEach(p=>p.classList.remove('sel'));const p=document.querySelector(`#cg [data-f="${selCounty}"]`);if(p){p.classList.add('sel');p.parentNode.appendChild(p);}}
function drawMapChrome(){const L=mapLayer;
  $('map-scope').innerHTML=[['tx','Texas'],['us','United States']].map(([k,n])=>`<button type="button" data-scope="${k}" aria-pressed="${k===mapScope}">${n}</button>`).join('');
  $('map-layers').innerHTML=[['Combined',[['all','Overall']]],['Power',[['en','Energy'],['pwr','Time to power']]],['Site',[['loc','Location'],['fib','Fiber']]],['Risk',[['pol','Policy'],['water','Water'],['haz','Hazard']]]].map(([g,ls])=>`<div class="lg"><span class="lgl">${g}</span><div class="seg">${ls.map(([k,n])=>`<button type="button" data-layer="${k}" aria-pressed="${k===L}">${n}</button>`).join('')}</div></div>`).join('');
  $('map-layers2').innerHTML='';
  $('map-leg').innerHTML=[4,0,1,2,3].map(i=>`<span><i style="background:${GCOL[i]};opacity:${i===4?.95:.7}"></i>${GL[i]}</span>`).join('')+`<span><i style="background:var(--accent);border-radius:50%"></i>Your project</span>`;
  $('map-note').textContent=LAYTXT[L]+' Screening grades from public geography and sourced state actions, to be replaced by licensed county data.';}
function drawCounty(){const c=CMAP.get(selCounty),w=cWhy(c),here=SITES.filter(s=>s.fips===c.f),ov=cOverall(c),S=stOf(c);
  $('cdet').innerHTML=`<div class="rech"><div><p class="eyebrow">County detail</p><h2>${c.n} County, ${S.a}</h2><p class="sub">Grid: ${S.reg} (approximate)</p></div><div>${pill(ov,ov===3?'No overall grade':'Overall '+GL[ov].toLowerCase())}</div></div>
   <div class="dimcols">${[['Power',[['en','Energy availability'],['pwr','Time to power']]],['Site',[['loc','Location'],['fib','Fiber']]],['Risk',[['pol','Policy'],['water','Water'],['haz','Natural hazard']]]].map(([g,ks])=>`<div class="dimcol"><div class="pgh">${g}</div>${ks.map(([k,l])=>`<div class="dimrow"><div class="dh"><b>${l}</b> ${pill(w[k][0],(w[k][0]===3&&['water','haz','pwr'].includes(k))?'Not scored':null)}</div><div class="dt">${w[k][1]}</div><div class="ev">Basis: ${w[k][2]}</div></div>`).join('')}</div>`).join('')}</div>
   ${here.length?`<p class="sm" style="margin-top:8px">Projects here: ${here.map(s=>`<button type="button" class="chip" data-proj="${s.id}">${SITES.indexOf(s)+1}. ${s.nm}</button>`).join(' ')}</p>`:'<p class="muted sm" style="margin-top:8px">No project in this county yet. Click any county to see its grades and the reason behind each.</p>'}`;}

// ---- project grades: Austin's four factors plus land and grid reliability ----
function projDims(st){const c=CMAP.get(st.fips),w=cWhy(c),floor=st.stress||'packet',d=[];
  d.push({k:'loc',l:'Location',r:c.r[0],t:w.loc[1],ev:'Public geography'});
  let er=c.r[1],et=w.en[1];if(st.delay>0){er=Math.max(er,1);et+=` Grid connection is ${st.delay} months late on this project (month ${18+st.delay} instead of 18).`;}
  d.push({k:'en',l:'Energy',r:er,t:et,ev:'Modeled grid timing and team screen'});
  d.push({k:'pol',l:'Policy',r:c.r[2],t:w.pol[1],ev:'State actions in public sources'});
  d.push({k:'fib',l:'Fiber',r:c.r[3],t:w.fib[1],ev:'CAIDA IXP dataset, Oct 2026. Facility locations, not fiber routes'});
  d.push({k:'land',l:'Land',r:st.acres>=12?0:st.acres>=8?1:2,t:`${st.acres} acres for onsite power. ${st.acres>=12?'Room for a full gas bridge and growth.':st.acres>=8?'Fits the packet plan.':'Too tight for a full gas bridge.'}`,ev:'Project data'});
  d.push({k:'rel',l:'Grid reliability',r:floor==='tight'?2:floor==='calm'?0:1,t:`Design case: ${STRESS_TXT[floor]}, plus a 5 day wind and solar drought each January. The plan must serve every MWh under it and keep wind and solar within the cap.`,ev:'Modeled in the dispatch engine'});
  d.push({k:'water',l:'Water',r:c.r[4],t:w.water[1],ev:w.water[2]});
  d.push({k:'haz',l:'Hazard',r:c.r[5],t:w.haz[1],ev:w.haz[2]});
  d.push({k:'pwr',l:'Time to power',r:c.r[7],t:w.pwr[1],ev:w.pwr[2]});
  return d;}
function gateOf(st){const sm=getPort(st);return sm?sm.gate:'pending';}
function projOverall(st,dims){const g=gateOf(st);if(g==='fail')return 2;const W={en:2,pol:1.5},en=dims.find(x=>x.k==='en').r;return ovRule(en,dims.map(x=>[x.r,W[x.k]||1]));}

// ---- portfolio: answer first, then cards, map or comparison ----
const firstSent=t=>{const i=t.indexOf('. ');return i>0?t.slice(0,i+1):t;};
function nextStep(x){if(x.sm&&x.sm.gate==='fail')return 'The power plan does not hold up in a bad grid week. It needs more land, a later opening or a different site.';
  const bad=x.dims.filter(d=>d.r===2);if(bad.length){const o=bad.find(d=>d.k!=='pol'),lst=bad.map(d=>d.l.toLowerCase()).join(', ');return `Blocked by ${lst}. ${o?firstSent(o.t):'Waiting on the state permit pause to lift.'}`;}
  const mod=x.dims.find(d=>d.r===1);return mod?`Watch ${mod.l.toLowerCase()}: ${firstSent(mod.t)}`:'Clear to advance.';}
function drawHead(info){const N=info.length,done=info.filter(x=>x.sm);
  if(done.length<N){$('pf-hl').innerHTML=`<p class="eyebrow">Portfolio</p><h2>Checking ${N} projects…</h2><p class="sub">Each one is run hour by hour for 10 years under its own grid stress case.</p>`;$('pf-key').innerHTML='';return;}
  const ready=done.filter(x=>x.sm.gate==='pass'&&x.ov!==2&&x.sm.p!=null).sort((a,b)=>b.sm.p-a.sm.p),pass=done.filter(x=>x.sm.gate==='pass').length,paused=info.filter(x=>x.dims.find(d=>d.k==='pol').r===2).length;
  const top=ready[0];
  const cnt=[4,0,1,2].map(g=>[g,info.filter(x=>x.ov===g).length]).filter(a=>a[1]>0).map(a=>`${a[1]} ${GL[a[0]]}`).join(', ');
  $('pf-hl').innerHTML=`<p class="eyebrow">Portfolio</p><h2>${N} projects: ${cnt}</h2>
   <p class="sub">${paused?`${paused} of ${N} are affected by the Texas permit pause. `:''}${pass} of ${N} hold up in a bad grid week.${top?` Earliest opening: month ${Math.min(...done.filter(x=>x.sm.first!=null).map(x=>x.sm.first))}.`:' Each project below has at least one blocker. The cards say which.'}</p>
   ${F.flex!==1?`<p class="note" style="margin:6px 0 0"><b>Flexible work share changed:</b> ${F.flex===0?'0% of work can move or pause':'18% of work can move or pause'}. Results below use this, not the base case of 36%. Change it back under Reliability on the Project plan tab.</p>`:''}`;$('pf-key').innerHTML=`<div class="kh">Overall grade</div><div class="krow">${pill(4)}<span>strong across the board</span></div><div class="krow">${pill(0)}<span>clear to proceed</span></div><div class="krow">${pill(1)}<span>workable, something to fix</span></div><div class="krow">${pill(2)}<span>a blocker</span></div>`;}
function card(x){const sm=x.sm,c=CMAP.get(x.st.fips),S=stOf(c);
  return `<article class="pcard${x.st.id===siteId?' sel':''}" data-proj="${x.st.id}" tabindex="0">${x.st.id===siteId?'<div class="selbar">Selected project</div>':''}<div class="ph"><span class="pnum">${x.i+1}</span><div><b>${x.st.nm}</b><div class="muted sm">${c.n} County, ${S.a} · ${x.st.stage}</div></div><span class="rt big ${GCLS[x.ov]}">Overall ${GL[x.ov].toLowerCase()}</span></div>
   <div class="pm"><div><span class="k">Earliest opening</span><b>${sm?(sm.first!=null?'Month '+sm.first:'None'):'…'}</b></div><div><span class="k">10 year profit</span><b>${sm&&sm.p!=null?money(sm.p):sm?'None':'…'}</b></div><div><span class="k">Holds in a bad grid week</span><b class="${sm?(sm.gate==='pass'?'up':'down'):''}">${sm?(sm.gate==='pass'?'Yes':'No'):'…'}</b></div></div>
   <div class="pgrid">${[['Power',['en','rel','pwr']],['Site',['loc','land','fib']],['Risk',['pol','water','haz']]].map(([g,ks])=>`<div class="pcol"><div class="pgh">${g}</div>${ks.map(k=>{const d=x.dims.find(q=>q.k===k);return d?`<div class="pc" title="${esc(d.t)}"><span>${d.l}</span>${pill(d.r)}</div>`:'';}).join('')}</div>`).join('')}</div>
   <p class="pnx">${nextStep(x)}</p><div class="pbtn"><button type="button" class="btn" data-goto="${x.st.id}">Open plan →</button><button type="button" class="btn pri" data-export="${x.st.id}">Export summary</button></div></article>`;}

// ---- what changed and what to watch ----
let lastInfo=[],PREV=null;const SNAPK='pp_snap_v1';
try{PREV=JSON.parse(localStorage.getItem(SNAPK)||'null');}catch(e){PREV=null;}
const fmtD=t=>new Date(t).toLocaleDateString('en-US',{month:'short',day:'numeric'});
const ifLift=x=>projOverall(x.st,x.dims.map(q=>q.k==='pol'?{...q,r:0}:q));
function changesVs(info){if(!PREV||!PREV.s||F.flex!==1)return null;const out=[];
  info.forEach(x=>{const a=PREV.s[x.st.id];if(!a||!x.sm)return;
    if(a.ov!==x.ov)out.push(`${x.st.nm}: Overall ${GL[a.ov].toLowerCase()} to ${GL[x.ov].toLowerCase()}`);
    x.dims.forEach((d,i)=>{if(a.g[i]!==undefined&&+a.g[i]!==d.r)out.push(`${x.st.nm}: ${d.l} ${GL[+a.g[i]].toLowerCase()} to ${GL[d.r].toLowerCase()}`);});
    if(a.first!==x.sm.first)out.push(`${x.st.nm}: can open in month ${a.first==null?'none':a.first} to ${x.sm.first==null?'none':x.sm.first}`);
    if(a.p!=null&&x.sm.p!=null&&Math.abs(a.p-x.sm.p)>=1e6)out.push(`${x.st.nm}: 10 year profit ${money(a.p)} to ${money(x.sm.p)}`);});
  return out;}
function drawChg(info){const el=$('scr-alert');if(!el)return;const done=info.every(x=>x.sm);
  const hit=info.filter(x=>CMAP.get(x.st.fips).s==='48'&&x.dims.find(d=>d.k==='pol').r===2);
  let rows='';
  if(hit.length){const lift=done?hit.map(x=>{const n=ifLift(x);return n!==x.ov?`${x.st.nm} moves from ${GL[x.ov].toLowerCase()} to ${GL[n].toLowerCase()}`:`${x.st.nm} stays ${GL[x.ov].toLowerCase()}`;}).join('. ')+'.':'';
    rows+=`<li><span class="cd">Sep 21</span><div><b>Texas paused data center permits</b><p>The state environmental agency is holding permits while ERCOT audits loads of 75 MW and up. It affects ${hit.map(x=>x.st.nm).join(', ')}, so each shows Policy as Bad.${lift?` <b>If the pause lifts:</b> ${lift}`:''} <a href="https://gov.texas.gov/news/post/governor-abbott-directs-tceq-to-halt-data-center-permits" target="_blank" rel="noopener">Source</a></p></div></li>`;}
  const ch=done?changesVs(info):null;
  const when=PREV&&PREV.t?fmtD(PREV.t):'First visit';
  const body=!done?'Checking your projects…':ch===null?'This is your first visit on this browser. The next time you open the page, anything that moved in your grades, opening months or profit will be listed here.':ch.length?`<ul class="chgsub">${ch.map(c=>`<li>${c}</li>`).join('')}</ul>`:'Nothing has moved in your grades, opening months or profit.';
  rows+=`<li><span class="cd">${when}</span><div><b>Since your last visit</b><div class="chgp">${body}</div></div></li>`;
  el.innerHTML=`<section class="box chg"><p class="eyebrow">Recent changes</p><ul class="chglist">${rows}</ul><p class="muted sm" style="margin:8px 0 0">Data as of: state policy Nov 2026, grid queue through 2025, FEMA hazard Dec 2025, WRI Aqueduct 4.0 water stress, fiber facilities Oct 2026.</p></section>`;
  if(done&&F.flex===1){try{const o={};info.forEach(x=>{o[x.st.id]={ov:x.ov,first:x.sm.first,p:x.sm.p,g:x.dims.map(d=>d.r).join('')};});localStorage.setItem(SNAPK,JSON.stringify({t:Date.now(),s:o}));}catch(e){}}}

// ---- one page export ----
const shortT=t=>{const a=String(t).split('. ');return a.slice(0,2).join('. ')+(a.length>2||/\.$/.test(a[a.length-1])?(/\.$/.test(a.slice(0,2).join('. '))?'':'.'):'');};
function onePager(x){const c=CMAP.get(x.st.fips),S=stOf(c),sm=x.sm||{},today=new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  const bad=x.dims.filter(d=>d.r===2),mod=x.dims.filter(d=>d.r===1),lift=CMAP.get(x.st.fips).s==='48'&&x.dims.find(d=>d.k==='pol').r===2?ifLift(x):null;
  const pl=r=>`<span class="rt ${GCLS[r]}">${GL[r]}</span>`;
  return `<div class="op-page"><div class="op-top"><span>Peak Power · Project summary</span><span>${today}</span></div>
  <h1>${x.st.nm}</h1><p class="op-sub">${c.n} County, ${S.a} · ${x.st.stage} · 75 MW campus</p>
  <div class="op-ov"><span class="rt big ${GCLS[x.ov]}">Overall ${GL[x.ov].toLowerCase()}</span><p>${nextStep(x)}</p></div>
  <div class="op-stats"><div><span>Earliest opening</span><b>${sm.first!=null?'Month '+sm.first:'None'}</b></div><div><span>Best profit opening</span><b>${sm.o!=null?'Month '+sm.o:'None'}</b></div><div><span>10 year profit</span><b>${sm.p!=null?money(sm.p):'None'}</b></div><div><span>Holds in a bad grid week</span><b>${sm.gate==='pass'?'Yes':sm.gate==='fail'?'No':'Testing'}</b></div></div>
  <table class="op-t"><thead><tr><th>Factor</th><th>Grade</th><th>Why</th></tr></thead><tbody>${x.dims.map(d=>`<tr><td><b>${d.l}</b></td><td>${pl(d.r)}</td><td>${shortT(d.t)}<div class="op-b">Basis: ${d.ev}</div></td></tr>`).join('')}</tbody></table>
  <div class="op-risk"><b>Blockers:</b> ${bad.length?bad.map(d=>d.l.toLowerCase()).join(', '):'none'}. <b>To watch:</b> ${mod.length?mod.map(d=>d.l.toLowerCase()).join(', '):'none'}.${lift!=null&&lift!==x.ov?` If the Texas permit pause lifts, Overall moves from ${GL[x.ov].toLowerCase()} to ${GL[lift].toLowerCase()}.`:''}</div>
  <p class="op-foot">Method: 10 year hourly dispatch simulation of a 75 MW campus using the case packet data, with wind and solar capped at realistic shares and tested against a design drought. Grades come from public data: state actions (Nov 2026), WRI Aqueduct 4.0, FEMA National Risk Index v1.20, LBNL Queued Up (through 2025), EIA hourly generation (2025) and the CAIDA IXP dataset (Oct 2026). This is a screening summary. Confirm power, permits and zoning with the utility and the county before committing capital.</p></div>`;}
function openOnePager(id){const x=lastInfo.find(q=>q.st.id===id);if(!x)return;let o=$('onepager');if(!o){o=document.createElement('div');o.id='onepager';document.body.appendChild(o);}
  o.innerHTML=`<div class="op-bar"><button type="button" class="btn" id="op-print">Print or save as PDF</button><button type="button" class="btn" id="op-close">Close</button></div>`+onePager(x);
  o.hidden=false;document.body.classList.add('pp-open');o.scrollTop=0;}
function closeOnePager(){const o=$('onepager');if(o)o.hidden=true;document.body.classList.remove('pp-open');}
function drawPortfolio(){
  if(!$('pf-cards'))return;
  $('scr-alert').innerHTML='';
  const info=SITES.map((st,i)=>{const e=siteEff(st),dims=projDims(e),sm=getPort(st);return {st,e,i,dims,sm,ov:projOverall(st,dims)};});
  lastInfo=info;drawHead(info);drawChg(info);
  $('pf-cards').innerHTML=info.map(card).join('');
  const cur=info.find(x=>x.st.id===siteId);
  $('pf-why').innerHTML=`<div class="rech"><div><h2 class="whyh">Why ${cur.st.nm} is rated <span class="rt big ${GCLS[cur.ov]}">${GL[cur.ov]}</span></h2><p class="sub">Overall grade and the factors behind it</p></div></div>
    <div class="dimcols">${[['Power',['en','rel','pwr']],['Site',['loc','land','fib']],['Risk',['pol','water','haz']]].map(([g,ks])=>`<div class="dimcol"><div class="pgh">${g}</div>${ks.map(k=>{const d=cur.dims.find(q=>q.k===k);return d?`<div class="dimrow"><div class="dh"><b>${d.l}</b> ${pill(d.r)}</div><div class="dt">${d.t}</div><div class="ev">Basis: ${d.ev}</div></div>`:'';}).join('')}</div>`).join('')}</div>`;
  const steps=pathSteps(cur.st),nP=steps.filter(x=>x[2]==='paused').length;$('scr-pathsum').textContent=`${steps.length} steps, ${nP} on hold, about $4M`;
  $('scr-steps').innerHTML=`<ol class="psteps">${steps.map(([t,d,stt,ex],i)=>{const k=siteId+':'+i;return `<li><span class="t">${t}</span><span class="st ${stt}">${{paused:'paused',todo:'to do',now:'due now'}[stt]}</span><div class="ex"><span>${ex}</span>${EXR[k]?'<span class="req">✓ Requested (prototype)</span>':`<button class="btn" type="button" data-ex="${k}">Request expert</button>`}</div></li>`;}).join('')}</ol>`;
  drawGantt(info);drawPins();}
function drawGantt(info){const W=1000,rowH=40,H=36+info.length*rowH+24,L=210,R=250,M=48,x=m=>L+(W-L-R)*Math.min(m,M)/M;let s='';
  for(let m=0;m<=M;m+=6)s+=`<line class="gl" x1="${x(m)}" x2="${x(m)}" y1="22" y2="${H-22}"/><text x="${x(m)}" y="14" text-anchor="middle">m${m}</text>`;
  const pmax=Math.max(1,...info.map(i=>i.sm&&i.sm.p||0));
  info.forEach((it,i)=>{const y0=30+i*rowH,sm=it.sm,gridM=18+it.e.delay;
    s+=`<text class="lbl" x="${L-10}" y="${y0+18}" text-anchor="end">${i+1}. ${it.st.short}</text>`;
    if(sm&&sm.o!=null){const o=sm.o;
      s+=`<rect x="${x(0)}" y="${y0+8}" width="${x(o)-x(0)}" height="18" rx="3" fill="var(--rule)"/><text x="${x(o/2)}" y="${y0+21}" text-anchor="middle" style="font-size:10px;fill:var(--ink)">construction &amp; interconnection</text>`;
      s+=`<rect x="${x(o)}" y="${y0+8}" width="${x(o+10)-x(o)}" height="18" rx="3" fill="var(--t1)" opacity=".55"/><rect x="${x(o+10)}" y="${y0+8}" width="${Math.max(0,x(M)-x(o+10))}" height="18" rx="3" fill="var(--t0)" opacity=".8"/>`;
      s+=`<text x="${(x(o+10)+x(M))/2}" y="${y0+21}" text-anchor="middle" style="font-size:11px;fill:#fff">full campus</text>`;
      s+=`<line x1="${x(o)}" x2="${x(o)}" y1="${y0+26}" y2="${y0+31}" stroke="var(--ink)" stroke-width="1.5"/><text x="${x(o)+5}" y="${y0+38}" style="font-size:11px;font-weight:600;fill:var(--ink)">opens m${o}</text>`;
      s+=`<line x1="${x(gridM)}" x2="${x(gridM)}" y1="${y0+2}" y2="${y0+28}" stroke="var(--s-grid)" stroke-width="2.5" stroke-dasharray="4 2"/>`;
      {const cx=(x(o)+x(o+10))/2;if(Math.abs(x(gridM)-cx)<34)s+=`<rect x="${cx-30}" y="${y0+11}" width="60" height="14" fill="#a5bbd1"/>`;s+=`<text x="${cx}" y="${y0+21}" text-anchor="middle" style="font-size:11px;fill:var(--ink)">ramp up</text>`;}
      s+=`<rect x="${W-R+30}" y="${y0+8}" width="${Math.max(2,(R-110)*sm.p/pmax)}" height="18" rx="3" fill="var(--good)" opacity=".8"/><text class="pv" x="${W-R+34+Math.max(2,(R-110)*sm.p/pmax)}" y="${y0+21}">${money(sm.p)}</text>`;
    }else s+=`<text x="${x(2)}" y="${y0+21}">${sm?'No credible opening month under these limits':'Running the model…'}</text>`;});
  s+=`<text x="${W-R+30}" y="14">10 year profit</text><line x1="${x(0)}" x2="${x(0)}" y1="22" y2="${H-22}" class="ax"/>`;
  $('pf-gantt').innerHTML=`<div class="legend"><span><i style="background:var(--rule)"></i>Construction and interconnection</span><span><i style="background:var(--t1);opacity:.6"></i>Ramp to full campus</span><span><i style="background:var(--t0)"></i>Full campus</span><span><i style="width:0;border-left:2px dashed var(--s-grid);height:11px;border-radius:0"></i>First grid power</span></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Opening month and profit by project">${s}</svg>`;}

// ---- project header, summary strip and the Energy / Finance split ----
function buildProj(){const el=$('proj');el.innerHTML=`<option value="__all">All projects (portfolio)</option>`+SITES.map((s,i)=>`<option value="${s.id}">${i+1}. ${s.nm}, ${CMAP.get(s.fips).n} County</option>`).join('');
  el.onchange=()=>{if(el.value==='__all'){showStep(0);syncProj();return;}setProject(el.value);};}
const syncProj=()=>{const el=$('proj');if(el)el.value=step===0?'__all':siteId;};
function renderHeader(){const st=siteEff(curSite()),d=st.delay;$('hdr-site').innerHTML=`${CMAP.get(st.fips).n} County, ${stOf(CMAP.get(st.fips)).a} · <b>75 MW peak</b> · 10 year plan`;}
function setProject(id,go){const st=SITES.find(x=>x.id===id);if(!st)return;const was=siteId;siteId=id;F.delay=st.delay;F.acres=st.acres;chosen=null;selCounty=st.fips;if(mapBuilt){selMark();drawCounty();}
  if(step>1){plant=null;showStep(1);}else if(go&&step===0)showStep(1);
  if(was!==id||go)step1();else drawPortfolio();syncProj();window.scrollTo({top:0});}
function showPtab(t){ptab=t;const f=$('p-fin'),e=$('p-energy');if(f)f.hidden=t!=='fin';if(e)e.hidden=t!=='energy';document.querySelectorAll('#ptabs [data-ptab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.ptab===t)));}
const failWords=q=>!q?'no contract mix fits within the wind and solar cap':q.why==='late'?(q.det||'gas equipment cannot be delivered in time'):q.why==='land'?'the gas needed does not fit on the land':q.why==='limit'?'no more gas can be added':!q.capOk?'it breaks the carbon limit':(q.z&&q.z.uns>=0.5)?'load goes unserved in the design case (grid stress and a wind drought week)':'it does not fit';
const failLbl=q=>!q?'No mix':q.why==='late'?'Too early':q.why==='land'?'No land':q.why==='limit'?'No gas room':!q.capOk?'Over cap':(q.z&&q.z.uns>=0.5)?'Power short':'No fit';
function afterCards(){const all=rows.length&&rows.every(r=>r.done);
  if(!all||chosen==null||recO==null){$('psum').innerHTML=`<p class="eyebrow">Project</p><h2>${curSite().nm}</h2>${busy('Testing every opening month against the reliability limit…')}`;
    $('gate-body').innerHTML=busy('Running the reliability test…');$('gas-body').innerHTML=busy('Sizing onsite gas…');const ab=$('alt-box');if(ab)ab.hidden=true;return;}
  recordCurrent();
  const c=rows.find(r=>r.o===chosen).r;drawSummary(c);drawAlt(c);drawGate(c);drawGas(c);whyNot();drawSens();}
function whyNot(){const rec=$('rec');const ok=rows.filter(r=>feasible(r.r)&&inDeadline(r.o));if(!ok.length||!rec.querySelector('.why'))return;
  const first=ok[0].o,prev=rows.slice().reverse().find(r=>r.o<first),after=rows.find(r=>r.o>recO&&feasible(r.r));let t;
  if(!prev)t=`Month ${first} is the earliest month tested, and it works.`;
  else t=`Month ${prev.o} does not work: ${failWords(prev.r)}.`;
  const x=recO!==first?` Month ${first} works but earns less profit than month ${recO}.`:'';
  const wh=rec.querySelector('.why'),after2=wh.nextElementSibling||wh;after2.insertAdjacentHTML('afterend',`<div class="note ok" style="margin:8px 0 0">${t}${x}</div>`);}
function drawSummary(c){const st=siteEff(curSite()),dims=projDims(st),sm=PORT[keyFor(curSite())],ov=projOverall(curSite(),dims),e=c.e,z=c.z;
  const first=rows.filter(r=>feasible(r.r)&&inDeadline(r.o))[0];
  $('psum').innerHTML=`<div class="rech"><div><p class="eyebrow" style="margin:0 0 2px">Project</p><h2 style="margin:0">${st.nm}</h2><p class="sub">${CMAP.get(st.fips).n} County, ${stOf(CMAP.get(st.fips)).a} · ${st.stage} stage · 75 MW</p></div><div>${pill(ov,'Overall '+GL[ov].toLowerCase())}</div></div>
   <div class="kpis" style="margin-top:8px"><div class="kpi"><div class="k">Earliest credible opening</div><div class="v">Month ${first?first.o:'–'}</div><div class="s">gas delivered, permitted, reliable</div></div>
   <div class="kpi hi"><div class="k">Best profit opening</div><div class="v">Month ${recO}</div><div class="s">${chosen!==recO?`you picked ${chosen}`:'recommended'}</div></div>
   <div class="kpi"><div class="k">10 year profit</div><div class="v">${money(e.profit)}</div><div class="s">at month ${chosen}</div></div>
   <div class="kpi"><div class="k">Reliability test</div><div class="v ${z.uns<0.5?'':'down'}">${z.uns<0.5?'Passes':'Fails'}</div><div class="s">${F.hard?'stress and drought tests on':'tests are off'}</div></div>
   <div class="kpi"><div class="k">Onsite gas</div><div class="v">${fmt(gasOf(c.caps))}<small> MW</small></div><div class="s">${fmt(landOf(c.caps),1)} of ${F.acres} acres</div></div></div>`;}
function drawGateCtlOld(){const el=$('gate-ctl');if(!el)return;
  const seg=(id,opts,cur)=>`<div class="pseg" role="group">`+opts.map(([v,l])=>`<button type="button" data-gc="${id}" data-v="${v}" aria-pressed="${String(cur)===String(v)}">${l}</button>`).join('')+`</div>`;
  const sh={0:[100,0,0],0.5:[82,12,6],1:[64,24,12]}[F.flex]||[64,24,12];
  el.innerHTML=`<div class="ppwrap" style="grid-template-columns:1fr;margin-top:0">
    <div class="pp"><div class="pph">Stress and drought tests</div>${seg('hard',[[1,'On'],[0,'Off']],F.hard?1:0)}<div class="hint">Off lets a plan lean on a calmer grid and steadier wind than this site will see.</div></div>
    <div class="pp"><div class="pph">Most energy from wind and solar</div>${seg('vcap',[[0.5,'50%'],[0.6,'60%'],[0.7,'70%'],[0.8,'80%'],[1,'No cap']],F.vcap)}<div class="hint">For scale, the highest large US grid is at about 45%.</div></div>
    <div class="pp"><div class="pph">Work that can move or pause</div>${seg('flex',[[0,'0%'],[0.5,'18%'],[1,'36%']],F.flex)}<div class="rtab"><span>Always on<b>${sh[0]}%</b></span><span>Movable<b>${sh[1]}%</b></span><span>Batch<b>${sh[2]}%</b></span></div></div></div>`;
  el.querySelectorAll('[data-gc]').forEach(b=>b.onclick=()=>{const k=b.dataset.gc,v=b.dataset.v;if(k==='hard')F.hard=v==='1';else if(k==='vcap')F.vcap=+v;else F.flex=+v;step1();});}
function drawGateOld(c){const g=effGrid(),z=c.z,vs=z.vs!=null?z.vs:(VSH[c.base.mix]||0);
  const R=c.R||run(c.open,c.caps,c.base.policy,c.base.mode);
  const R2=run(c.open,c.caps,c.base.policy,c.base.mode,{capFrac:0.4,packetEvents:true}),z2=E.summarize(R2.I,R2.O,R2.A);
  const pass=z.uns<0.5,tightPass=z2.uns<0.5,capTxt=F.vcap<1?fmt(100*F.vcap,0)+'%':'no limit',vOk=vs<=F.vcap+1e-9;
  const cond=`${STRESS_TXT[g]}, plus a 5 day wind and solar drought each January`;
  const word=F.hard?(pass?'Holds':'Fails'):'Not tested',cls=F.hard?(pass?'ok':'bad'):'off';
  const line=F.hard?(pass?'0 MWh unserved in 10 years':fmt(z.uns,0)+' MWh unserved in 10 years'):'Stress and drought tests are off';
  const back=`Backup used: ${fmt(gasOf(c.caps))} MW onsite gas${z.rel>0?`, ${fmt(z.rel,0)} MWh of work moved to another site`:''}${z.cur>0?`, ${fmt(z.cur,0)} MWh of batch work paused`:''}.`;
  const R_=(c2,t)=>`<em class="res ${c2}">${t}</em>`;
  $('gate-body').innerHTML=`<div class="verdict ${cls}"><div class="vword">${word}</div><div class="vtxt"><b>${line}</b><span>${F.hard?(pass?'Every hour is served under the design case below.':'Some hours go unserved under the design case below.'):'Results may rely on a calmer grid or steadier wind than this site will see.'}</span></div></div>
    <p class="vsub">${back}</p>
    <div class="tlist">
      <div class="trow"><div><b>Design case at month ${c.open}</b><span>${cap1(cond)}</span></div>${F.hard?R_(pass?'ok':'bad',pass?'Holds':'Short '+fmt(z.uns,0)+' MWh'):R_('na','Not tested')}</div>
      <div class="trow"><div><b>Tighter grid test</b><span>${g==='tight'?'Same as the design case':'Grid imports cut to 40%. An extra check, not a requirement.'}</span></div>${R_(tightPass?'ok':'warn',tightPass?'Holds':'Short '+fmt(z2.uns,0)+' MWh')}</div>
      <div class="trow"><div><b>Wind and solar share</b><span>${fmt(100*vs,0)}% of energy. ${F.vcap<1?'Limit is '+capTxt+'.':'No limit set.'}</span></div>${R_(vOk?'ok':'bad',vOk?'Within limit':'Over limit')}</div>
    </div>`;}
const cap1=t=>t.charAt(0).toUpperCase()+t.slice(1);
function gShare(R,m0,m1){let g=0,l=0;for(let t=Math.max(0,m0)*730;t<Math.min(87600,m1*730);t++){g+=R.O.fuel_cell[t]+R.O.gas_engine[t]+R.O.gas_turbine[t];l+=R.I.L[t];}return l?g/l:0;}
function drawGas(c){const RX=resX(),R=c.R||run(c.open,c.caps,c.base.policy,c.base.mode),O=R.O,d=F.delay,gb=(30+d)*730;let pb=0,pa=0;
  for(let t=c.open*730;t<87600;t++){const g=O.fuel_cell[t]+O.gas_engine[t]+O.gas_turbine[t];if(t<gb){if(g>pb)pb=g;}else if(g>pa)pa=g;}
  const mw=gasOf(c.caps),early=gShare(R,c.open,c.open+36),late=gShare(R,84,120);
  const NAME={fuel_cell:'Gas fuel cell',gas_engine:'Gas engine',gas_turbine:'Gas turbine',battery_4h:'Battery (4 h)'};
  const tr=['fuel_cell','gas_engine','gas_turbine','battery_4h'].map(k=>{const used=RX[k].available_month,mk=LEADS.market[k],m=c.caps[k]||0;
    const status=!m?'<span class="muted">Not in this plan</span>':used<=c.open?'<span class="up">Ready at opening</span>':`<span class="down">Arrives ${used-c.open} month${used-c.open===1?'':'s'} after opening</span>`;
    return `<tr><td>${NAME[k]}</td><td>${fmt(m)}</td><td>${RES[k].available_month} months</td><td>${mk!=null?mk+' months':k==='battery_4h'?'n/a':'no figure loaded'}</td><td>${GASK.includes(k)?F.permit+' months':'n/a'}</td><td>${F.leads==='market'?'+'+COMM+' months':'none'}</td><td><b>Month ${used}</b></td><td style="text-align:left">${status}</td></tr>`;}).join('');
  $('gas-body').innerHTML=`<div class="gasgrid"><div><p class="sm"><b>What gas does here.</b> It bridges the gap until the grid reaches 75 MW at month ${30+d}, then covers grid stress events.</p>
     <ul class="gl2"><li>Sized at <b>${fmt(mw)} MW</b> on ${fmt(landOf(c.caps),1)} of ${F.acres} acres.</li><li>Peaks at <b>${fmt(pb,0)} MW</b> during the grid ramp and <b>${fmt(pa,0)} MW</b> after it, in stress events.</li><li>Supplies <b>${fmt(100*early,0)}%</b> of energy in the first 3 years of operation and <b>${fmt(100*late,0)}%</b> in the last 3.</li></ul></div>
     <div class="note" style="margin:0"><b>16 months versus 45 months.</b> 16 months is how long the case packet allows for a gas engine to arrive. 45 months is the market lead time for a large gas turbine. They are different machines on different delivery tracks, so this plan bridges with engines and fuel cells and only counts a turbine once it arrives.</div></div>
    <div class="tblwrap"><table class="tbl"><thead><tr><th>Equipment</th><th>MW in plan</th><th>Case packet delivery</th><th>Market check</th><th>Air permit</th><th>Install and commission</th><th>In service</th><th style="text-align:left">Versus opening at month ${c.open}</th></tr></thead><tbody>${tr}</tbody></table></div>
    <p class="muted sm">A unit cannot run before it is delivered, permitted and commissioned, so it enters service at the later of delivery and permit, plus install time. The case packet setting skips the install buffer. Large turbines: Wood Mackenzie reported an average of almost five years in 2025, so 45 months is not conservative (<a href="https://www.utilitydive.com/news/natural-gas-equipment-generation-bottleneck-data-centers/812931/" target="_blank" rel="noopener">Utility Dive</a>). Air permits for onsite gas run 6 to 18 months (<a href="https://www.datacentres.com/news/behind-the-meter-power-gas-turbines-and-fuel-cells-emerge-as-data-centres-escape-slot1-2026-08-19" target="_blank" rel="noopener">Datacentres.com Research</a>). Engines, fuel cells and batteries use case packet figures because no market figure is loaded yet.</p>`;}

function drawCards(){drawCards0();afterCards();setStatus();if(rows.length&&rows.every(r=>r.done)){if(pendingGo!=null)runPending();else prewarm();}}
function drawRamp(o){const W=900,H=216,P={l:56,r:14,t:46,b:44},iw=W-P.l-P.r,ih=H-P.t-P.b,x=m=>P.l+iw*m/120,y=v=>P.t+ih*(1-v/80),full=o+10,d=F.delay;
  const dem=m=>m<o?0:m>=full?75:25+5*(m-o),gr=m=>m>=30+d?75:m>=24+d?50:m>=18+d?25:0;
  const fs='font-size:12px';let s='<defs><pattern id="gapH" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--s-gas)" opacity=".12"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--s-gas)" stroke-width="2.2" opacity=".75"/></pattern></defs>';
  for(const v of [0,25,50,75])s+=`<line x1="${P.l}" x2="${W-P.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule-2)"/><text x="${P.l-8}" y="${y(v)+4}" text-anchor="end" style="${fs};fill:var(--ink-3)">${v}</text>`;
  s+=`<text x="${P.l-8}" y="${P.t-14}" text-anchor="end" style="${fs};font-weight:700;fill:var(--ink)">MW</text>`;
  for(let m=0;m<=120;m+=12)s+=`<line x1="${x(m)}" x2="${x(m)}" y1="${y(0)}" y2="${y(0)+5}" stroke="var(--ink-3)"/><text x="${x(m)}" y="${y(0)+19}" text-anchor="middle" style="${fs};fill:var(--ink-3)">${m}</text>`;
  s+=`<text x="${W-P.r}" y="${H-4}" text-anchor="end" style="${fs};font-weight:700;fill:var(--ink)">Months from start</text>`;
  const bw=x(o)-x(0),bx=x(o/2),by=y(64)+4,bs=`style="${fs};fill:var(--ink-2)"`;
  s+=`<rect x="${x(0)}" y="${y(75)}" width="${bw}" height="${y(0)-y(75)}" fill="var(--rule-2)"/>`;
  s+=bw>=300?`<text x="${bx}" y="${by}" text-anchor="middle" ${bs}>Construction &amp; interconnection</text>`:bw>=115?`<text x="${bx}" y="${by-7}" text-anchor="middle" ${bs}>Construction &amp;</text><text x="${bx}" y="${by+9}" text-anchor="middle" ${bs}>interconnection</text>`:`<text x="${bx}" y="${by}" text-anchor="middle" ${bs}>Construction</text>`;
  s+=`<path d="M${x(o)},${y(0)} L${x(o)},${y(25)} L${x(full)},${y(75)} L${x(120)},${y(75)} L${x(120)},${y(0)} Z" fill="var(--t1)" opacity=".3"/>`;
  let gap=0;for(let m=o;m<Math.min(120,30+d+1);m+=0.25){const a=dem(m+0.125),b=gr(m+0.125);if(a>b){gap+=(a-b)*0.25;s+=`<rect x="${x(m)}" y="${y(a)}" width="${x(m+0.25)-x(m)+0.4}" height="${y(b)-y(a)}" fill="url(#gapH)"/>`;}}
  s+=`<path d="M${x(o)},${y(25)} L${x(full)},${y(75)} L${x(120)},${y(75)}" fill="none" stroke="var(--t0)" stroke-width="2.5"/>`;
  s+=`<path d="M${x(0)},${y(0)} L${x(18+d)},${y(0)} L${x(18+d)},${y(25)} L${x(24+d)},${y(25)} L${x(24+d)},${y(50)} L${x(30+d)},${y(50)} L${x(30+d)},${y(75)} L${x(120)},${y(75)}" fill="none" stroke="var(--s-grid)" stroke-width="2.5" stroke-dasharray="7 4"/>`;
  s+=`<line x1="${x(o)}" x2="${x(o)}" y1="${P.t-36}" y2="${y(0)}" stroke="var(--ink)" stroke-dasharray="2 3"/><line x1="${x(full)}" x2="${x(full)}" y1="${P.t-20}" y2="${y(0)}" stroke="var(--ink)" stroke-dasharray="2 3"/>`;
  s+=`<text x="${x(o)+6}" y="${P.t-28}" style="${fs};font-weight:600;fill:var(--ink)">Opens at month ${o}, uses 25 MW</text><text x="${x(full)+6}" y="${P.t-12}" style="${fs};font-weight:600;fill:var(--ink)">Fully ramped by month ${full}, uses 75 MW</text>`;
  s+=`<text x="${x(30+d)}" y="${y(0)+36}" text-anchor="middle" style="${fs};font-weight:600;fill:var(--s-grid)">Grid connection complete at month ${30+d}</text>`;
  s+=`<line id="rh" x1="0" x2="0" y1="${P.t-8}" y2="${y(0)}" stroke="var(--ink)" stroke-width="1" opacity="0" pointer-events="none"/><rect id="rhit" x="${P.l}" y="${P.t-8}" width="${iw}" height="${ih+8}" fill="transparent"/>`;
  const box=$('ramp');
  box.innerHTML=`<div class="legend"><span><i style="background:var(--t1);opacity:.55"></i>Campus demand</span><span><i style="width:0;border-left:3px dashed var(--s-grid);height:11px;border-radius:0"></i>Grid import limit</span>${gap>0?'<span><i style="background:var(--s-gas);opacity:.5"></i>Gap covered by onsite gas</span>':''}</div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Campus demand ramp against the grid import limit">${s}</svg>`;
  const svg=box.querySelector('svg'),hit=svg.querySelector('#rhit'),hl=svg.querySelector('#rh');
  hit.onmousemove=e=>{const b=svg.getBoundingClientRect(),px=(e.clientX-b.left)*W/b.width,mm=Math.max(0,Math.min(119,Math.floor((px-P.l)/iw*120)));
    hl.setAttribute('x1',x(mm+0.5));hl.setAttribute('x2',x(mm+0.5));hl.setAttribute('opacity','.55');
    const dv=dem(mm),gv=gr(mm),ph=mm<o?'Construction and interconnection. No demand yet.':mm<full?'Campus ramping up, 5 MW more each month.':'Full campus.';
    tipAt(box,`<div class="h">Month ${mm}</div><div class="muted" style="margin-bottom:4px">${ph}</div>${row('Campus demand',dv+' MW','--t0')}${row('Grid import limit',gv+' MW','--s-grid')}${dv>gv?row('Covered by onsite gas',(dv-gv)+' MW','--s-gas'):''}`,e);};
  hit.onmouseleave=()=>{hl.setAttribute('opacity','0');hideTip(box);};}
function initNew(){
  buildProj();
  titleize();new MutationObserver(schedTitleize).observe(document.body,{childList:true,subtree:true});
  syncs.push(syncReset);if($('reset-btn'))$('reset-btn').onclick=resetAll;
  sel('g-leads',[{v:'market',l:'Market check: large gas turbines take 45 months'},{v:'packet',l:'Case packet: engine 16, turbine 18, fuel cell 14 months'}],()=>F.leads,v=>{F.leads=v;step1();});
  sel('g-permit',[{v:6,l:'6 months (fast)'},{v:12,l:'12 months (midpoint)'},{v:18,l:'18 months (slow)'}],()=>F.permit,v=>{F.permit=+v;step1();});
  syncs.push(()=>{drawGateCtl();syncProj();const n=$('s-grid-note');if(n)n.textContent=F.hard&&GRK[F.grid]<GRK[effGrid()]?`Held at this site's design case: ${STRESS_TXT[effGrid()]}.`:'';});
  document.addEventListener('click',e=>{const t=e.target;if(!t.closest)return;let el;
    if((el=t.closest('#map [data-site]'))){setProject(el.dataset.site);return;}
    if((el=t.closest('#map .cty'))){selCounty=el.dataset.f;selMark();drawCounty();return;}
    if((el=t.closest('[data-scope]'))){mapScope=el.dataset.scope;buildMap();return;}
    if((el=t.closest('[data-layer]'))){mapLayer=el.dataset.layer;recolor();drawMapChrome();return;}
    if((el=t.closest('[data-ptab]'))){showPtab(el.dataset.ptab);return;}
    if(t.closest('[data-how]')){openHow();return;}
    if(t.closest('#op-close')){closeOnePager();return;}
    if(t.closest('#op-print')){try{window.print();}catch(e){}return;}
    if((el=t.closest('[data-export]'))){openOnePager(el.dataset.export);return;}
    if((el=t.closest('[data-goto]'))){setProject(el.dataset.goto,true);return;}
    if((el=t.closest('[data-open]'))){setProject(siteId,true);showStep(+el.dataset.open);return;}
    if((el=t.closest('[data-proj]'))){setProject(el.dataset.proj);return;}
    if((el=t.closest('#scr [data-ex]'))){EXR[el.dataset.ex]=true;drawPortfolio();return;}
    if(t.closest('#scr-x')){alertOff=true;drawPortfolio();}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeOnePager();if(e.key!=='Enter'&&e.key!==' ')return;const t=e.target;if(!t.closest)return;const el=t.closest('tr[data-proj],.pcard[data-proj],#map [data-site]');if(el&&t===el){e.preventDefault();setProject(el.dataset.proj||el.dataset.site);}});
  const mp=$('map');mp.addEventListener('mousemove',e=>{const el=e.target.closest&&e.target.closest('.cty');if(!el){hideTip(mp);return;}const c=CMAP.get(el.dataset.f),w=cWhy(c),ov=cOverall(c);
    tipAt(mp,`<div class="h">${c.n} County, ${stOf(c).a}</div>${[['Location','loc'],['Energy','en'],['Policy','pol'],['Fiber','fib']].map(([n,k])=>row(n,GL[w[k][0]])).join('')}${row('Overall',ov===3?'No overall grade':GL[ov])}`,e);});
  mp.addEventListener('mouseleave',()=>hideTip(mp));
  showPtab('fin');buildMap();drawCounty();}

// ================= Demo support: readiness status, cost-vs-carbon comparison, "How it works" page =================
// Added before judging. Reads existing results only; no calculation rule is changed.
let pendingGo=null,afterPlant=null;
function setStatus(){const el=$('pp-status');if(!el)return;const n=rows.length,d=rows.filter(r=>r.done).length;
  if(!n||d<n){el.innerHTML=busy(`Testing opening months: ${d} of ${n||OPENS.length}…${pendingGo?' Will open the next step when ready.':''}`);el.className='ppstat';return;}
  if(plant){el.textContent='✓ Plant running';el.className='ppstat ok';return;}
  el.textContent='✓ Ready: all opening months tested';el.className='ppstat ok';}
function prewarm(){if(plant||chosen==null||!rows.length||!rows.every(r=>r.done))return;const r=rows.find(x=>x.o===chosen);if(!r||!r.r||!r.r.base)return;const tok=token,o=chosen,b=r.r.base;
  setTimeout(()=>{if(tok!==token||plant||chosen!==o)return;const sv=plant;plant={open:o};try{planOf(b.mix,b.battery,F.cap);}catch(e){}plant=sv;},300);}
function runPending(){if(pendingGo==null||plant||chosen==null||!rows.every(r=>r.done))return;const n=pendingGo;pendingGo=null;afterPlant=n===3?3:null;startPlant(chosen);}

const ALTC=new Map();
function drawAlt(c){const box=$('alt-box');if(!box)return;
  const key=keyFor(curSite())+'|'+c.open+'|'+chosen;
  if(ALTC.has(key)){box.innerHTML=ALTC.get(key);box.hidden=false;return;}
  box.hidden=false;box.innerHTML=`<p class="eyebrow">Recommended plan and alternatives</p>${busy('Comparing a cleaner plan and a faster opening…')}`;const tok=token;
  setTimeout(()=>{if(tok!==token||chosen==null)return;
    const pool=S.filter(s=>s.open===c.open&&VSH[s.mix]<=F.vcap+1e-9&&landOf(s.caps)<=F.acres+1e-9&&s!==c.base).sort((a,b)=>capKg(a)-capKg(b));
    let clean=null;const seen=new Set();let tried=0;
    for(const s of pool){if(capKg(s)>=capKg(c.base)-1)break;const k=s.mix+s.battery+s.mode+s.policy;if(seen.has(k))continue;seen.add(k);if(++tried>3)break;
      const o=evalBase(s,false);if(feasible(o)&&o.capOk&&o.z.kg<c.z.kg-1){clean=o;break;}}
    const ok=rows.filter(r=>feasible(r.r)&&inDeadline(r.o));const first=ok.length?ok[0]:null;
    const fast=first&&first.o<c.open?first.r:null;
    // Cheaper alternative: what the hard carbon limit costs (plan without it), or else the lowest power-cost plan at this opening.
    let cheap=null,cheapLab='',cheapSub='';
    if(F.cap){const sv=F.cap;F.cap=0;try{const o=bestAt(c.open,false);if(o&&o.fits&&o.z.uns<0.5&&o.z.total<c.z.total-1e5&&o.z.kg>c.z.kg+1){cheap=o;cheapLab='Without the carbon limit';cheapSub='what the limit costs';}}finally{F.cap=sv;}}
    else{const seen2=new Set();let n2=0;const byCost=S.filter(s=>s.open===c.open&&VSH[s.mix]<=F.vcap+1e-9&&landOf(s.caps)<=F.acres+1e-9&&s!==c.base).sort((a,b)=>a.total_decision_cost_usd-b.total_decision_cost_usd);
      for(const s of byCost){if(s.total_decision_cost_usd>=c.z.total-1e5||++n2>3)break;const k=s.mix+s.battery+s.mode+s.policy;if(seen2.has(k))continue;seen2.add(k);const o=evalBase(s,false);if(feasible(o)&&o.z.total<c.z.total-1e5){cheap=o;cheapLab='Lower-cost alternative';cheapSub='same opening, lowest power cost that passes';break;}}}
    const cols=[['Recommended','best 10-year profit',c]];if(cheap)cols.push([cheapLab,cheapSub,cheap]);if(clean)cols.push(['Cleaner alternative','same opening, lowest carbon that passes',clean]);if(fast)cols.push(['Faster alternative','earliest credible opening',fast]);
    const mixTxt=o=>`${MIXT[o.base.mix]||o.base.mix}${o.base.battery?` + ${o.base.battery} MW battery`:''}; ${fmt(gasOf(o.caps))} MW onsite gas`;
    const rel=o=>o.z.rel!=null?o.z.rel:(o.base.relocated_local_equivalent_mwh||0);
    const R=(lab,f,note)=>`<tr><th scope="row">${lab}${note?`<small>${note}</small>`:''}</th>${cols.map(k=>`<td>${f(k[2])}</td>`).join('')}</tr>`;
    const dl=o=>({dc:o.z.total-c.z.total,dk:o.z.kg-c.z.kg,dt:c.z.co2-o.z.co2});
    const tbl=`<div class="tblwrap"><table class="tbl alt"><thead><tr><th></th>${cols.map(k=>`<th>${k[0]}<small>${k[1]}</small></th>`).join('')}</tr></thead><tbody>`+
      R('Initial service / full demand',o=>`month ${o.open} / ${o.open+10}`)+
      R('Portfolio',mixTxt)+
      R('Power cost, 10 years',o=>money(o.z.total),'local energy + relocation + interruption')+
      R('Cost per MWh',o=>'$'+fmt(o.z.usdPerMWh,1))+
      R('CO₂ intensity',o=>fmt(o.z.kg,0)+' kg/MWh')+
      R('Clean energy share',o=>fmt(100*o.z.cleanShare,0)+'%')+
      R('Work moved / paused in grid stress',o=>`${fmt(rel(o),0)} MWh moved · ${fmt(o.z.cur,0)} MWh paused`,'protected load always served locally')+
      R('Reliability test',o=>o.z.uns<0.5?'<span class="up">Passes</span>':'<span class="down">Fails</span>')+
      R('10-year profit',o=>money(o.e.profit),'business assumption, kept apart from power cost')+`</tbody></table></div>`;
    let why='';
    if(clean){const d=dl(clean);
      why+=`<div class="altnote"><b>Cleaner alternative:</b> power cost <b class="${d.dc>0?'down':'up'}">${sgn(d.dc)}</b> over 10 years for <b>${fmt(-d.dk,0)} kg/MWh</b> less carbon (${fmt(d.dt/1e3,0)}k tonnes CO₂ avoided${d.dc>0&&d.dt>0?`, about <b>$${fmt(d.dc/d.dt,0)} per tonne</b>`:''}). <b>Choose it when</b> the customer has a carbon target, or values avoided CO₂ above that price per tonne.</div>`;}
    else why+=`<div class="altnote">No cleaner plan passes the reliability test at month ${c.open} under the current limits, so the recommended plan is already the lowest-carbon option that fits.</div>`;
    if(cheap){const d=dl(cheap),sv=-d.dc,dk=d.dk;
      why+=`<div class="altnote"><b>${cheapLab}:</b> saves <b class="up">${money(sv)}</b> of power cost over 10 years but emits <b>${fmt(dk,0)} kg/MWh</b> more (${fmt(-d.dt/1e3,0)}k tonnes CO₂ more) and changes 10-year profit by ${sgn(cheap.e.profit-c.e.profit)}. ${F.cap?`That is what the carbon limit costs: about <b>$${fmt(sv/Math.max(1,-d.dt),0)} per tonne</b> avoided. <b>Choose it when</b> the customer can relax the limit.`:`<b>Choose it when</b> power cost matters more than carbon and the extra emissions are acceptable.`}</div>`;}
    if(fast){const d=dl(fast),n=c.open-fast.open;why+=`<div class="altnote"><b>Faster alternative:</b> opens ${n} month${n===1?'':'s'} earlier (month ${fast.open}) at <b>${sgn(d.dc)}</b> power cost and ${sgn(fast.e.profit-c.e.profit)} profit versus the recommendation. <b>Choose it when</b> speed to power is worth more than that.</div>`;}
    const html=`<div class="boxh"><p class="eyebrow" style="margin:0">Recommended plan and alternatives</p><button type="button" class="btn" data-how>How the answers become this result</button></div>${tbl}${why}<p class="muted sm" style="margin-top:6px">Every plan comes from the 384-plan library, each replayed through the packet's official checker${isDefault()?'':', then re-sized and re-simulated for the current settings'}. Screening estimates, not quotes.</p>`;
    ALTC.set(key,html);box.innerHTML=html;},30);}

function howHTML(){
  const c=chosen!=null&&rows.length&&rows.every(r=>r.done)?(rows.find(r=>r.o===chosen)||{}).r:null,st=curSite(),G=effGrid();
  const H=()=>`<span class="rt b">hard requirement</span>`,P=()=>`<span class="rt m">preference</span>`,B=()=>`<span class="rt n">business assumption</span>`;
  const A=[
   ['Full campus by',F.dead?`month ${F.dead}`:'not set',H(),'Plans whose full demand (opening + 10 months) comes later are removed.'],
   ['Carbon limit',F.cap?`${F.cap} kg/MWh, ${F.capMode==='year'?'every year':'10-year average'}`:'none',H(),'Plans above the limit are removed, not just ranked lower.'],
   ['Wind and solar share cap',F.vcap<1?Math.round(F.vcap*100)+'%':'none',H(),'Keeps the plan realistic for a real grid.'],
   ['Onsite land',F.acres+' acres',H(),'Gas, fuel cells and battery must fit (packet land per MW).'],
   ['Stress and drought tests',F.hard?'on':'off',H(),`Plan must serve every MWh in: ${STRESS_TXT[G]}, plus a 5 day wind and solar drought.`],
   ['Grid connection delay',F.delay?F.delay+' months late':'on schedule',P(),'Shifts the whole import schedule.'],
   ['Work flexibility',{1:'packet (64 / 24 / 12)',0.5:'half',0:'firm'}[F.flex]||F.flex,P(),'How much work can move or pause in a stress event.'],
   ['Opening month','chosen for highest 10-year profit',P(),'Earlier is not forced; each month is tested and shown.'],
   ['Revenue model',RM.model,B(),'Affects profit only. Never mixed into power cost.']];
  const rowsA=A.map(r=>`<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('');
  const res=c?`<div class="op-risk"><b>Worked example for ${st.nm}, with the answers above:</b> open at <b>month ${c.open}</b> (full demand month ${c.open+10}); ${MIXT[c.base.mix]||c.base.mix}${c.base.battery?` + ${c.base.battery} MW battery`:''} and ${fmt(gasOf(c.caps))} MW onsite gas. Power cost <b>${money(c.z.total)}</b> ($${fmt(c.z.usdPerMWh,1)}/MWh), <b>${fmt(c.z.kg,0)} kg CO₂/MWh</b>, ${fmt(100*c.z.cleanShare,0)}% clean. Change an answer and reopen this page to see it update.</div>`:`<div class="op-risk">Results are still being computed. Close this page and reopen it when the status line shows Ready.</div>`;
  return `<div class="op-page"><div class="op-top"><span>Peak Power · Method</span><span>Screening tool, not a quote</span></div>
   <h1>How customer answers become a recommendation</h1><p class="op-sub">Five steps. Every step uses the packet's rules and data; nothing needs an internet connection.</p>
   <table class="op-t"><thead><tr><th>Step</th><th>What happens</th></tr></thead><tbody>
   <tr><td><b>1. Answers</b></td><td>The customer states hard requirements (must hold) and preferences (rank by). Both are listed below and kept apart.</td></tr>
   <tr><td><b>2. Screen</b></td><td>Library of 384 plans (contract mix × battery × stress policy × cost or carbon operating mode × opening month). Hard requirements remove plans. Gas only counts once delivered and permitted.</td></tr>
   <tr><td><b>3. Simulate</b></td><td>Each surviving plan is replayed hour by hour for 87,600 hours: contracts and merchant power share the grid limit; the battery charges and discharges; in stress events imports drop to 60%, protected load stays local, movable work relocates, batch work pauses.</td></tr>
   <tr><td><b>4. Account</b></td><td>Power cost (capacity, contract, fuel, merchant), relocation cost and interruption cost are totalled, then CO₂ and clean share. Business revenue is added separately.</td></tr>
   <tr><td><b>5. Recommend</b></td><td>Highest 10-year profit among plans that meet every hard requirement, shown next to a cleaner and a faster alternative with what each costs and when it wins.</td></tr></tbody></table>
   <p class="op-b" style="margin:10px 0 3px"><b>THE ANSWERS RIGHT NOW</b></p>
   <table class="op-t"><thead><tr><th>Answer</th><th>Value</th><th>Treated as</th><th>Effect</th></tr></thead><tbody>${rowsA}</tbody></table>${res}
   <p class="op-b" style="margin:10px 0 3px"><b>ASSUMPTIONS YOU CAN CHALLENGE</b></p>
   <table class="op-t"><thead><tr><th>Energy</th><th>Finance</th><th>Carbon</th></tr></thead><tbody><tr>
    <td style="width:33%">Campus 75 MW peak, 69 MW average. Grid import 0 → 25 → 50 → 75 MW at months 18 / 24 / 30 (plus any delay). Seven stress events a year, 3–7 hours, imports cut to 60%. Battery: 4 hours, 85% round trip, up to 53 MW, no export. ERCOT 2023 hourly shapes repeated for 10 years.</td>
    <td style="width:34%">Constant 2023 dollars; capital annualized at 8%. Contracts pay for all available output, even if curtailed. Merchant power at hourly price + $20/MWh. Relocation $123.50/MWh; interruption $1,000/MWh. Wind $45/MWh; battery $1,220/kW. Revenue models are team assumptions and stay separate from power cost.</td>
    <td style="width:33%">kg CO₂/MWh = onsite + remote emissions ÷ MWh served (the remote site uses 1.05× the relocated electricity). Clean share counts wind, solar, nuclear and battery discharge in proportion to the clean share of its charging; grid-charged energy earns no credit.</td></tr></tbody></table>
   <p class="op-foot">Limits: dispatch is rule-based, not an optimizer; the plan library is finite; the hourly model covers ERCOT (Texas) only; equipment outages and startup limits are simplified. Source: symposium packet v6.0.1 (V2) data and rules; see README and docs/DATA_GAPS.md.</p></div>`;}
function openHow(){let o=$('onepager');if(!o){o=document.createElement('div');o.id='onepager';document.body.appendChild(o);}
  o.innerHTML=`<div class="op-bar"><button type="button" class="btn" id="op-print">Print or save as PDF</button><button type="button" class="btn" id="op-close">Close</button></div>`+howHTML();
  o.hidden=false;document.body.classList.add('pp-open');o.scrollTop=0;}


// Read-only hook for scripts/build_site_grades.mjs: the Appendix's county grades (js/data/site-grades.js) are read from this code, never a second copy.
window.PEAKPOWER_PROTOTYPE_API={cOverall,GL,LAYTXT,STP,MAPD,
  // The engine's best plan for the packet case (8 acres, packet stress events) with the grid connection `months` late, chosen the way a project card is.
  delayCase(months){return withSite({id:'sens-'+months,delay:months,acres:8,stress:'packet'},()=>{
    const ok=OPENS.map(o=>({o,r:bestAt(o,false)})).filter(x=>x.r&&feasible(x.r)&&inDeadline(x.o));if(!ok.length)return null;
    const best=ok.reduce((a,c)=>c.r.e.profit>a.r.e.profit?c:a),z=best.r.z;
    return {open:best.o,first:ok[0].o,total:z.total,perMWh:z.usdPerMWh,kg:z.kg,clean:z.cleanShare,profit:best.r.e.profit,co2t:z.co2};});}};
// ================= Reliability: how far the plan can be pushed (10 years) and one bad hour (minutes) =================
const GX={tab:'ten',lvl:null,ev:'cut',mi:1,lv2:0.6,nt:0,hot:0,bat:0,rsp:15,spd:1,c:null};
const LV=[0.6,0.5,0.4,0.3,0.2,0.1,0],LVL=v=>Math.round(v*100)+'%';
const LADC=new Map();let ladQ=[],ladOn=false;
const s0Of=()=>effGrid()==='tight'?2:0;
const niceMax=m=>{const p=Math.pow(10,Math.floor(Math.log10(Math.max(m,1))));return Math.ceil(m/p)*p;};
const fmtK=v=>v>=1000?fmt(v/1000,v%1000?1:0)+'k':fmt(v,0);
const GEQ=['fuel_cell','gas_engine','gas_turbine'];
const GNAME={fuel_cell:'Fuel cell',gas_engine:'Gas engine',gas_turbine:'Gas turbine'};

// ---- grid cut ladder: unserved energy over 10 years as imports during events fall ----
function ladEntry(op,caps,pol,md,fx,all){if(op==null||!caps)return null;const k=JSON.stringify([fx,op,caps,pol,md,keyFlex(curSite(),fx)]);let e=LADC.get(k);
  if(!e){e={fx,open:op,caps,pol,md,u:[],mon:[],all:false};LADC.set(k,e);if(LADC.size>40)LADC.delete(LADC.keys().next().value);}
  if(all)e.all=true;if(!ladQ.includes(e))ladQ.push(e);ladPump();return e;}
function ladNext(e){for(let i=s0Of();i<7;i++){if(e.u[i]===undefined)return i;if(!e.all&&!(e.u[i]<0.5))return -1;}return -1;}
function ladRun(e,i){const f=LV[i],sv=F.flex;F.flex=e.fx;
  try{const ev=[];for(let y=0;y<10;y++)ev.push({from:y*8760+LULL.start,to:y*8760+LULL.start+LULL.d*24,frac:f});
    const R=run(e.open,e.caps,e.pol,e.md,{capFrac:f,packetEvents:true,hourEvents:ev});
    let u=0;const mon=new Float32Array(120);for(let t=0;t<87600;t++){const x=R.O.unserved[t];if(x>0){u+=x;mon[(t/730)|0]+=x;}}
    e.u[i]=u;e.mon[i]=mon;}
  finally{F.flex=sv;}}
function ladPump(){if(ladOn)return;ladOn=true;
  const stp=()=>{let e=null,i=-1;for(const x of ladQ){const n=ladNext(x);if(n>=0){e=x;i=n;break;}}
    if(!e){ladOn=false;return;}
    try{ladRun(e,i);}catch(err){e.u[i]=NaN;}
    if(GX.c&&$('gate-body'))drawGateAll();
    setTimeout(stp,6);};
  setTimeout(stp,20);}
function ladRes(e){const s0=s0Of();let hold=null,fail=null,pend=false;
  for(let i=s0;i<7;i++){if(e.u[i]===undefined){pend=true;break;}if(!(e.u[i]<0.5)){fail=i;break;}hold=i;}
  return {s0,hold,fail,pend};}
const cushOf=r=>r.hold==null?null:Math.round((LV[r.s0]-LV[r.hold])*100);

function ladSvg(e,s0,sel){const L=LV.slice(s0),n=L.length,W=560,H=236,P={l:58,r:12,t:30,b:62},iw=W-P.l-P.r,ih=H-P.t-P.b,cw=iw/n;
  const vals=L.map((f,j)=>e.u[s0+j]).filter(v=>v!=null&&isFinite(v)),mx=niceMax(Math.max(500,...vals));
  const y=v=>P.t+ih*(1-v/mx),fs='font-size:12px';
  let s=`<line x1="${P.l}" x2="${W-P.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--ink-3)"/>`;
  for(const v of [mx/2,mx])s+=`<line x1="${P.l}" x2="${W-P.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule-2)"/><text x="${P.l-8}" y="${y(v)+4}" text-anchor="end" style="${fs};fill:var(--ink-3)">${fmtK(v)}</text>`;
  s+=`<text x="${P.l-8}" y="${y(0)+4}" text-anchor="end" style="${fs};fill:var(--ink-3)">0</text><text x="${P.l-8}" y="${P.t-14}" text-anchor="end" style="${fs};font-weight:700;fill:var(--ink)">MWh</text>`;
  L.forEach((f,j)=>{const i=s0+j,v=e.u[i],cx=P.l+cw*(j+.5),on=i===sel,bw=Math.min(52,cw*.6);
    s+=`<g data-glv="${i}" style="cursor:pointer"><rect x="${P.l+cw*j+3}" y="${P.t-6}" width="${cw-6}" height="${ih+P.b-24}" fill="${on?'var(--bg)':'transparent'}" stroke="${on?'var(--ink)':'none'}" stroke-width="1.5"/>`;
    if(v===undefined)s+=`<text x="${cx}" y="${y(0)-8}" text-anchor="middle" style="${fs};fill:var(--ink-3)">…</text>`;
    else if(isNaN(v))s+=`<text x="${cx}" y="${y(0)-8}" text-anchor="middle" style="${fs};fill:var(--ink-3)">?</text>`;
    else if(!(v>=0.5))s+=`<rect x="${cx-bw/2}" y="${y(0)-4}" width="${bw}" height="4" fill="var(--good)"/><text x="${cx}" y="${y(0)-12}" text-anchor="middle" style="${fs};font-weight:700;fill:var(--good)">0</text>`;
    else s+=`<rect x="${cx-bw/2}" y="${y(v)}" width="${bw}" height="${Math.max(2,y(0)-y(v))}" fill="var(--bad)"/><text x="${cx}" y="${y(v)-6}" text-anchor="middle" style="${fs};font-weight:600;fill:var(--ink)">${fmt(v,0)}</text>`;
    s+=`<text x="${cx}" y="${y(0)+19}" text-anchor="middle" style="${fs};font-weight:${on?700:600};fill:var(--ink)">${LVL(f)}</text>`;
    if(j===0)s+=`<text x="${cx}" y="${y(0)+34}" text-anchor="middle" style="font-size:11px;fill:var(--ink-3)">design case</text>`;
    s+='</g>';});
  s+=`<text x="${W-P.r}" y="${H-6}" text-anchor="end" style="${fs};font-weight:700;fill:var(--ink)">Grid imports during an event, share of normal</text>`;
  return `<svg class="gsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Unserved energy as grid imports are cut deeper">${s}</svg>`;}

// ---- when the shortfalls fall, against what is online ----
function tlSvg(c,mon,f){const W=900,H=240,P={l:80,r:14,t:30,b:20},pH=108,iw=W-P.l-P.r,x=m=>P.l+iw*m/120,fs='font-size:12px',RX=resX(),d=F.delay;
  const gl=m=>m>=30+d?75:m>=24+d?50:m>=18+d?25:0,gs=m=>GEQ.reduce((a,k)=>a+((c.caps[k]&&m>=Math.max(c.open,RX[k].available_month))?c.caps[k]:0),0);
  const mxv=niceMax(Math.max(100,...mon)),y=v=>P.t+pH*(1-v/mxv),y0=y(0);
  let s='';const nz=[];mon.forEach((v,m)=>{if(v>0.5)nz.push(m);});
  if(nz.length){const a=nz[0],b=nz[nz.length-1];s+=`<rect x="${x(a)-2}" y="${P.t-6}" width="${x(b+1)-x(a)+4}" height="${pH+6}" fill="var(--warn-bg)"/><text x="${x(a)-4}" y="${P.t-12}" style="${fs};font-weight:600;fill:var(--warn-ink)">Shortfalls fall in months ${a+1} to ${b+1}</text>`;}
  for(const v of [mxv/2,mxv])s+=`<line x1="${P.l}" x2="${W-P.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule-2)"/><text x="${P.l-8}" y="${y(v)+4}" text-anchor="end" style="${fs};fill:var(--ink-3)">${fmtK(v)}</text>`;
  s+=`<text x="${P.l-8}" y="${y0+4}" text-anchor="end" style="${fs};fill:var(--ink-3)">0</text><text x="${P.l-8}" y="${P.t-14}" text-anchor="end" style="${fs};font-weight:700;fill:var(--ink)">MWh</text>`;
  const bw=Math.max(1,iw/120-1.4);mon.forEach((v,m)=>{if(v>0.5)s+=`<rect x="${x(m)+0.7}" y="${y(v)}" width="${bw}" height="${Math.max(1.5,y0-y(v))}" fill="var(--bad)"><title>Month ${m+1}: ${fmt(v,0)} MWh unserved</title></rect>`;});
  s+=`<line x1="${P.l}" x2="${W-P.r}" y1="${y0}" y2="${y0}" stroke="var(--ink-3)"/>`;
  for(let m=0;m<=120;m+=12)s+=`<line x1="${x(m)}" x2="${x(m)}" y1="${y0}" y2="${y0+5}" stroke="var(--ink-3)"/><text x="${x(m)}" y="${y0+19}" text-anchor="middle" style="${fs};fill:var(--ink-3)">${m}</text>`;
  const strip=(fn,col,yy,lab)=>{let s2=`<text x="${P.l-8}" y="${yy+13}" text-anchor="end" style="${fs};font-weight:600;fill:var(--ink-2)">${lab}</text>`;let m=0;
    while(m<120){let e2=m;while(e2+1<120&&fn(e2+1)===fn(m))e2++;const v=fn(m),w=x(e2+1)-x(m);
      s2+=`<rect x="${x(m)}" y="${yy}" width="${w}" height="18" fill="${v>0?col:'none'}" fill-opacity="${v>0?.28:1}" stroke="${v>0?col:'var(--rule)'}" ${v>0?'':'stroke-dasharray="3 3"'}/>`;
      if(w>=34)s2+=`<text x="${x(m)+w/2}" y="${yy+13}" text-anchor="middle" style="font-size:11px;font-weight:600;fill:var(--ink)">${v>0?v+' MW':'none'}</text>`;
      m=e2+1;}return s2;};
  const ys=y0+32;s+=strip(gl,'var(--s-grid)',ys,'Grid limit')+strip(gs,'var(--s-gas)',ys+26,'Onsite gas');
  const ch=new Set();for(let m=1;m<120;m++){if(gl(m)!==gl(m-1)||gs(m)!==gs(m-1))ch.add(m);}
  ch.forEach(m=>{s+=`<line x1="${x(m)}" x2="${x(m)}" y1="${P.t}" y2="${ys+44}" stroke="var(--ink-3)" stroke-dasharray="2 3" opacity=".55"/>`;});
  s+=`<text x="${W-P.r}" y="${H-2}" text-anchor="end" style="${fs};font-weight:700;fill:var(--ink)">Months from start</text>`;
  return `<svg class="gsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Unserved energy by month against grid and gas capacity online">${s}</svg>`;}

function drawTen(c,e){const r=ladRes(e),s0=r.s0,d=LV[s0],sel=Math.max(s0,GX.lvl!=null?GX.lvl:(r.fail!=null?r.fail:s0));
  let cls='off',word='Checking',line='Running the grid cut tests',sub='Each cut is a full 10 year hourly run.';
  if(!r.pend||r.fail!=null){const f=r.fail,h=r.hold;
    if(f===s0){cls='bad';word='Short';line=`Falls short even at the ${LVL(d)} design case`;sub=`${fmt(e.u[s0],0)} MWh unserved over 10 years.`;}
    else if(f==null){cls='ok';word='Holds';line='Holds even with no grid imports during events';sub='No hour goes unserved at any cut tested.';}
    else{const cu=cushOf(r);cls=cu>=10?'ok':'warn';word=cu>=10?'Holds':'At the limit';
      line=cu>=10?`Holds with grid imports cut to ${LVL(LV[h])}`:`Holds at the ${LVL(d)} design case and no deeper`;
      sub=(cu>=10?`That is ${cu} points beyond the ${LVL(d)} design case. `:'The plan has no cushion past the design case. ')+`At ${LVL(LV[f])} it falls short by ${fmt(e.u[f],0)} MWh over 10 years.`;}}
  const z=c.z,back=`Plan backup: ${fmt(gasOf(c.caps))} MW onsite gas${z.rel>0?`, ${fmt(z.rel,0)} MWh of work moved to another site`:''}${z.cur>0?`, ${fmt(z.cur,0)} MWh of batch work paused`:''}.`;
  $('gate-body').innerHTML=`<div class="verdict ${cls}"><div class="vword">${word}</div><div class="vtxt"><b>${line}</b><span>${sub}</span></div></div><p class="vsub">${back}</p>`;
  const el=$('gate-lad');
  el.innerHTML=`<h3 class="sech" style="margin-top:16px">How far can the grid be cut?</h3><p class="sub" style="margin:0 0 6px">Unserved energy over 10 years as imports during events fall. Click a bar to see when it happens.</p>${ladSvg(e,s0,sel)}`;
  el.querySelectorAll('[data-glv]').forEach(g=>g.onclick=()=>{GX.lvl=+g.dataset.glv;drawGateAll();});
  const mon=e.mon[sel],tl=$('gate-tl');
  if(!mon)tl.innerHTML=`<h3 class="sech">When it falls short</h3>${busy('Running the test…')}`;
  else{const tot=e.u[sel];tl.innerHTML=`<h3 class="sech">When it falls short, with grid imports cut to ${LVL(LV[sel])}</h3><p class="sub" style="margin:0 0 6px">${tot>=0.5?`${fmt(tot,0)} MWh unserved. The strips show what is online in each month.`:`Nothing falls short at ${LVL(LV[sel])}. Click a deeper cut above.`}</p>${tlSvg(c,mon,LV[sel])}`;}}

// ---- what flexible work changes ----
function drawSens(){const el=$('flex-sens');if(!el)return;const st=curSite(),cur=F.flex;
  const FL=[{v:0,n:'0% flexible',t:'All work always on'},{v:0.5,n:'18% flexible',t:'82% always on, 12% movable, 6% batch'},{v:1,n:'36% flexible',t:'64% always on, 24% movable, 12% batch'}];
  const D=FL.map(q=>{const sm=PORT[keyFlex(st,q.v)];const e=sm&&sm.p!=null&&sm.caps?ladEntry(sm.op,sm.caps,sm.pol,sm.md,q.v,false):null;return {q,sm,e,r:e?ladRes(e):null};});
  const cols=D.map(({q,sm,e,r})=>{const on=Math.abs(q.v-cur)<1e-9;let a,b,c2,o,h,k;
    if(!sm){a=b=c2=o=h=k='<span class="muted">Checking</span>';}
    else if(sm.p==null){a='No plan';b=c2=o=h=k='…';}
    else{a=money(sm.p);b=fmt(gasOf(sm.caps))+' MW';c2=money(capexOf(sm.caps).up);o='Month '+sm.o;
      if(!r||(r.pend&&r.fail==null)){h=k='<span class="muted">Checking</span>';}
      else if(r.fail===r.s0){h='<span style="color:var(--bad)">Short</span>';k='<span style="color:var(--bad)">None</span>';}
      else{h=r.hold==null?'…':(r.fail==null?'0%':LVL(LV[r.hold]));const cu=r.fail==null?Math.round(LV[r.s0]*100):cushOf(r);k=cu>=10?`<span style="color:var(--good)">+${cu} points</span>`:'<span style="color:var(--warn-ink)">None</span>';}}
    return `<div class="fscol${on?' on':''}"><div class="fsh">${q.n}${on?' <small>selected</small>':''}</div><div class="fss">${q.t}</div><div class="fsv"><span>Best opening</span><b>${o}</b></div><div class="fsv"><span>10 year profit</span><b>${a}</b></div><div class="fsv"><span>Onsite gas needed</span><b>${b}</b></div><div class="fsv"><span>Upfront equipment</span><b>${c2}</b></div><div class="fsv"><span>Holds with imports cut to</span><b>${h}</b></div><div class="fsv"><span>Cushion past design case</span><b>${k}</b></div></div>`;}).join('');
  let note='';const A=D[0],B=D[2];
  if(A.sm&&B.sm&&A.sm.p!=null&&B.sm.p!=null){const cl=[];
    cl.push(B.sm.p<A.sm.p?`profit falls ${money(A.sm.p-B.sm.p)}`:B.sm.p>A.sm.p?`profit rises ${money(B.sm.p-A.sm.p)}`:'profit is unchanged');
    const ga=gasOf(A.sm.caps),gb=gasOf(B.sm.caps);if(gb<ga)cl.push(`onsite gas falls by ${fmt(ga-gb)} MW`);else if(gb>ga)cl.push(`onsite gas rises by ${fmt(gb-ga)} MW`);
    if(A.r&&B.r&&!A.r.pend&&!B.r.pend&&A.r.fail!==A.r.s0&&B.r.fail!==B.r.s0){const ca=A.r.fail==null?99:cushOf(A.r),cb=B.r.fail==null?99:cushOf(B.r);if(cb>ca)cl.push(`the cushion grows from ${ca} to ${cb} points`);}
    note=`<p class="muted sm" style="margin:8px 0 0">From 0% to 36% flexible: ${cl.join(', ')}.${B.sm.p<A.sm.p?' Movable and batch work pays lower rent, so profit falls as the flexible share rises.':''}</p>`;}
  el.innerHTML=`<h3 class="sech">What flexible work changes</h3><p class="sub" style="margin:0 0 8px">Same site. Only the share of work that can move or pause changes, and each column uses its own best opening and plan.</p><div class="fsrow">${cols}</div>${note}`;}

// ---- controls: flexible share, and the plan rules ----
function drawGateCtl(){const el=$('gate-ctl');if(!el)return;
  const seg=(id,opts,cur)=>`<div class="pseg" role="group">`+opts.map(([v,l])=>`<button type="button" data-gc="${id}" data-v="${v}" aria-pressed="${String(cur)===String(v)}">${l}</button>`).join('')+`</div>`;
  const sh={0:[100,0,0],0.5:[82,12,6],1:[64,24,12]}[F.flex]||[64,24,12];
  el.innerHTML=`<div class="ppwrap" style="grid-template-columns:1fr;margin-top:16px"><div class="pp"><div class="pph">Work that can move or pause</div>${seg('flex',[[0,'0%'],[0.5,'18%'],[1,'36%']],F.flex)}<div class="rtab"><span>Always on<b>${sh[0]}%</b></span><span>Movable<b>${sh[1]}%</b></span><span>Batch<b>${sh[2]}%</b></span></div><div class="hint">The more work that can pause, the further the grid can be cut with the same gas.</div></div></div>`;
  const rl=$('gate-rules-body');
  if(rl){rl.innerHTML=`<div class="ppwrap" style="margin-top:8px"><div class="pp"><div class="pph">Stress and drought tests when sizing the plan</div>${seg('hard',[[1,'On'],[0,'Off']],F.hard?1:0)}<div class="hint">Off lets a plan lean on a calmer grid and steadier wind than this site will see.</div></div>
    <div class="pp"><div class="pph">Most energy from wind and solar</div>${seg('vcap',[[0.5,'50%'],[0.6,'60%'],[0.7,'70%'],[0.8,'80%'],[1,'No cap']],F.vcap)}<div class="hint">For scale, the highest large US grid is at about 45%.</div></div></div><p class="muted sm" id="rules-vs" style="margin:8px 0 0"></p>`;
    const sm=$('gate-rules-sum');if(sm)sm.textContent='Plan rules';}
  document.querySelectorAll('#gate [data-gc]').forEach(b=>b.onclick=()=>{const k=b.dataset.gc,v=b.dataset.v;if(k==='hard')F.hard=v==='1';else if(k==='vcap')F.vcap=+v;else F.flex=+v;step1();});}

// ---- one bad hour: minute by minute replay ----
const BATS=[[0,0,'No battery'],[10,15,'10 MW for 15 min'],[25,15,'25 MW for 15 min'],[50,30,'50 MW for 30 min']];
const GPR={gas_engine:{cd:5,cr:5,hr:2},gas_turbine:{cd:5,cr:5,hr:4},fuel_cell:{cd:20,cr:40,hr:20}};
const hMonths=c=>[c.open+6,c.open+18,c.open+42].map(m=>Math.min(m,118));
function standbyCost(c){if(c._sb!=null)return c._sb;const R=c.R||run(c.open,c.caps,c.base.policy,c.base.mode),I=R.I,O=R.O,RX=resX();let tot=0;
  for(const k of GEQ){const Pm=c.caps[k];if(!Pm)continue;const r=RX[k],a=Math.max(c.open,r.available_month)*730,idle=0.3*Pm;let s=0;
    for(let t=a;t<87600;t++){const ex=idle-O[k][t];if(ex>0){const df=r.payment_usd_per_mwh+r.heat_rate_mmbtu_per_mwh_hhv*I.gasP[t]-I.price[t];if(df>0)s+=ex*df;}}
    tot+=s/((87600-a)/8760);}
  return c._sb=tot;}
function simHour(c,P){const R=c.R||run(c.open,c.caps,c.base.policy,c.base.mode),I=R.I,RX=resX(),caps=c.caps,s=P.spd,mo=hMonths(c)[P.mi];
  const E0=Math.max(30,P.nt),Ec=E0-P.nt,D=90,NM=E0+D+60;
  let t0=-1;for(let t=mo*730;t<Math.min(87600,(mo+1)*730);t++)if(I.st[t]===1){t0=t;break;}if(t0<0)t0=mo*730+300;
  const av=k=>caps[k]&&mo>=Math.max(c.open,RX[k].available_month);
  const L=I.L[t0],Gl=I.Gord[t0],base=(av('wind')?caps.wind*I.wcf[t0]:0)+(av('utility_solar')?caps.utility_solar*I.scf[t0]:0),nuc=av('nuclear')?caps.nuclear:0;
  const units=GEQ.filter(av).map(k=>({k,P:caps[k]}));
  let tripK=null;if(P.ev==='trip'&&units.length)tripK=units.slice().sort((a,b)=>b.P-a.P||(a.k==='gas_turbine'?-1:1))[0].k;
  const sumP=units.reduce((a,u)=>a+u.P,0),idle=P.hot?0.3:0,needPre=L-base-nuc-Gl,preTot=Math.min(sumP,Math.max(idle*sumP,needPre));
  units.forEach(u=>{u.o0=sumP?preTot*u.P/sumP:0;});
  const o={grid:[],ren:[],gas:{},bat:[],cur:[],uns:[]};units.forEach(u=>o.gas[u.k]=[]);
  const bmw=BATS[P.bat][0],ecap=bmw*BATS[P.bat][1]/60,fl=({0:0,0.5:0.18,1:0.36}[F.flex]||0)*L;let soc=ecap;
  let uns=0,peak=0,mins=0,cur=0,used=0,up=null;const sumLive=sumP-(tripK?caps[tripK]:0);
  for(let m=0;m<NM;m++){const ev=m>=E0&&m<E0+D,el=m-Ec+0.5;
    const wf=P.ev==='wind'&&m>=E0?Math.max(0.15,1-0.85*Math.min(1,(m-E0+1)/15)):1,ren=base*wf+nuc,gl=ev?Gl*P.lv2:Gl;
    let capT=0,minT=0;const ck={};
    units.forEach(u=>{let c1;
      if(m>=E0&&u.k===tripK)c1=0;else if(m<Ec)c1=u.o0;
      else if(u.o0>0.01)c1=Math.min(u.P,u.o0+0.7*u.P/(GPR[u.k].hr*s)*el);
      else{const w=el-GPR[u.k].cd*s;c1=w<=0?0:Math.min(u.P,u.P*w/(GPR[u.k].cr*s));}
      ck[u.k]=c1;capT+=c1;if(m>=E0&&u.k!==tripK&&P.hot)minT+=0.3*u.P;});
    const gasT=m<Ec?preTot:m<E0?Math.max(preTot,Math.min(capT,Math.max(0,L-ren))):Math.max(Math.min(minT,capT),Math.min(capT,Math.max(0,L-ren-gl)));
    const gridT=Math.min(gl,Math.max(0,L-ren-gasT)),gap1=Math.max(0,L-ren-gasT-gridT);
    const cu=m>=E0+P.rsp?Math.min(fl,gap1):0,gap2=gap1-cu,bt=Math.min(bmw,soc*60,gap2);soc-=bt/60;const un=gap2-bt;
    units.forEach(u=>o.gas[u.k].push(m<Ec?u.o0:(capT>0?ck[u.k]*gasT/capT:0)));
    o.grid.push(gridT);o.ren.push(ren);o.bat.push(bt);o.cur.push(cu);o.uns.push(un);
    uns+=un/60;cur+=cu/60;used+=bt/60;if(un>0.05){mins++;peak=Math.max(peak,un);}
    if(up==null&&m>=Ec&&capT>=sumLive-0.01)up=m-E0+1;}
  return {o,L,Gl,mo,units,tripK,uns,peak,mins,cur,used,ecap,up,E0,Ec,D,NM,top:Math.max(L,Gl)};}

function hourSvg(r){const W=640,H=300,Pd={l:52,r:14,t:34,b:44},iw=W-Pd.l-Pd.r,ih=H-Pd.t-Pd.b,NM=r.NM,top=r.top*1.14,x=m=>Pd.l+iw*m/NM,y=v=>Pd.t+ih*(1-v/top),fs='font-size:12px';
  const defs=`<defs><pattern id="curH" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--rule-2)"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink-3)" stroke-width="2"/></pattern></defs>`;
  const L=[{k:'grid',a:r.o.grid,f:'var(--s-grid)',n:'Grid'},{k:'ren',a:r.o.ren,f:'var(--s-wind)',n:'Wind and solar'}];
  r.units.forEach((u,i)=>L.push({k:u.k,a:r.o.gas[u.k],f:'var(--s-gas)',op:[1,.7,.45][i%3],n:GNAME[u.k]}));
  L.push({k:'bat',a:r.o.bat,f:'var(--s-bat)',n:'Battery'},{k:'cur',a:r.o.cur,f:'url(#curH)',n:'Flexible work paused'},{k:'uns',a:r.o.uns,f:'var(--bad)',n:'Not served'});
  let lo=new Array(NM).fill(0),s=defs,leg='';
  for(const l of L){const up=lo.map((v,m)=>v+l.a[m]);if(Math.max(...l.a)>0.05){let p='';for(let m=0;m<NM;m++)p+=(m?'L':'M')+x(m)+','+y(up[m])+'L'+x(m+1)+','+y(up[m]);for(let m=NM-1;m>=0;m--)p+='L'+x(m+1)+','+y(lo[m])+'L'+x(m)+','+y(lo[m]);
      s+=`<path d="${p}Z" fill="${l.f}" ${l.op?`fill-opacity="${l.op}"`:''} stroke="var(--panel)" stroke-width=".6"/>`;leg+=`<span><i style="background:${l.k==='cur'?'repeating-linear-gradient(45deg,var(--rule-2) 0 3px,var(--ink-3) 3px 5px)':l.f};${l.op?'opacity:'+l.op:''}"></i>${l.n}</span>`;}lo=up;}
  for(let v=0;v<=top;v+=25)s+=`<line x1="${Pd.l}" x2="${W-Pd.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule-2)" opacity=".6"/><text x="${Pd.l-8}" y="${y(v)+4}" text-anchor="end" style="${fs};fill:var(--ink-3)">${v}</text>`;
  s+=`<text x="${Pd.l-8}" y="${Pd.t-18}" text-anchor="end" style="${fs};font-weight:700;fill:var(--ink)">MW</text>`;
  for(let m=0;m<=NM;m+=30)s+=`<line x1="${x(m)}" x2="${x(m)}" y1="${y(0)}" y2="${y(0)+5}" stroke="var(--ink-3)"/><text x="${x(m)}" y="${y(0)+19}" text-anchor="middle" style="${fs};fill:var(--ink-3)">${m}</text>`;
  s+=`<text x="${W-Pd.r}" y="${H-4}" text-anchor="end" style="${fs};font-weight:700;fill:var(--ink)">Minutes</text>`;
  s+=`<line x1="${Pd.l}" x2="${W-Pd.r}" y1="${y(r.L)}" y2="${y(r.L)}" stroke="var(--ink)" stroke-width="2" stroke-dasharray="6 4"/><text x="${W-Pd.r}" y="${y(r.L)-6}" text-anchor="end" style="${fs};font-weight:600;fill:var(--ink)">Campus load ${fmt(r.L)} MW</text>`;
  s+=`<line x1="${x(r.E0)}" x2="${x(r.E0)}" y1="${Pd.t-14}" y2="${y(0)}" stroke="var(--ink)" stroke-dasharray="2 3"/><text x="${x(r.E0)-5}" y="${Pd.t-18}" text-anchor="end" style="${fs};fill:var(--ink)">Event starts</text>`;
  s+=`<line x1="${x(r.E0+r.D)}" x2="${x(r.E0+r.D)}" y1="${Pd.t-14}" y2="${y(0)}" stroke="var(--ink)" stroke-dasharray="2 3"/><text x="${x(r.E0+r.D)+5}" y="${Pd.t-18}" style="${fs};fill:var(--ink)">Grid back</text>`;
  if(r.Ec<r.E0)s+=`<line x1="${x(r.Ec)}" x2="${x(r.Ec)}" y1="${Pd.t-14}" y2="${y(0)}" stroke="var(--ink-3)" stroke-dasharray="2 3"/><text x="${x(r.Ec)+5}" y="${Pd.t-18}" style="${fs};fill:var(--ink-3)">Warning</text>`;
  return `<svg class="gsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Minute by minute supply against campus load during the event">${s}</svg><div class="lgd">${leg}</div>`;}

const same=(a,b)=>String(a)===String(b)||(a!==''&&b!==''&&!isNaN(+a)&&!isNaN(+b)&&Math.abs(+a-+b)<1e-9);
function drawHour(c){const el=$('hour-body');if(!el)return;const RX=resX(),P=GX,mos=hMonths(c),r=simHour(c,P);
  const seg=(key,opts,cur,off)=>`<div class="pseg" role="group">`+opts.map(([v,l])=>`<button type="button" data-hx="${key}" data-v="${v}" aria-pressed="${same(cur,v)}"${off?' disabled':''}>${l}</button>`).join('')+`</div>`;
  const gl=m=>m>=30+F.delay?75:m>=24+F.delay?50:m>=18+F.delay?25:0;
  const on=m=>GEQ.filter(k=>c.caps[k]&&m>=Math.max(c.open,RX[k].available_month)).map(k=>`${fmt(c.caps[k])} MW ${GNAME[k].toLowerCase()}`);
  const mh=on(r.mo),sb=standbyCost(c),bP=P.bat?`Price up to ${money(BATS[P.bat][0]*1000*RX.battery_4h.capex_usd_per_kw)}.`:'Campus backup batteries are not counted here.';
  const noFlex=F.flex===0,spdTxt=GEQ.filter(k=>c.caps[k]).map(k=>{const g=GPR[k],s=P.spd;return `${GNAME[k]}: ${fmt((g.cd+g.cr)*s)} min from cold, ${fmt(g.hr*s)} min from idle`;}).join('. ');
  const inputs=`<div class="bhin"><h4 class="grp">The event</h4>
    <div class="pp"><div class="pph">When it happens</div>${seg('mi',mos.map((m,i)=>[i,'Month '+m]),P.mi)}<div class="hint">Online then: grid ${gl(r.mo)} MW${mh.length?', '+mh.join(', '):', no onsite gas yet'}.</div></div>
    <div class="pp"><div class="pph">What happens</div>${seg('ev',[['cut','Grid cut'],['trip','Gas unit trips too'],['wind','Wind drops too']],P.ev)}<div class="hint">${P.ev==='trip'?(r.tripK?`The ${fmt(c.caps[r.tripK])} MW ${GNAME[r.tripK].toLowerCase()} goes offline as the grid is cut.`:'No gas unit is online yet, so nothing trips.'):P.ev==='wind'?'Wind and solar fall over 15 minutes as the grid is cut.':'Only the grid is cut.'}</div></div>
    <div class="pp"><div class="pph">How deep is the grid cut</div>${seg('lv',[[0.6,'60%'],[0.4,'40%'],[0.2,'20%'],[0,'Lost']],P.lv2)}<div class="hint">Share of normal imports that remains for 90 minutes. 60% is the design case.</div></div>
    <div class="pp"><div class="pph">Warning before the cut</div>${seg('nt',[[0,'None'],[30,'30 min'],[120,'2 hours']],P.nt)}<div class="hint">A fault gives no warning. A planned utility request gives some.</div></div>
    <h4 class="grp">Your backup</h4>
    <div class="pp"><div class="pph">Onsite gas before the event</div>${seg('hot',[[0,'Cold'],[1,'Hot idle']],P.hot)}<div class="hint">${P.hot?`Units idle at 30% and ramp in minutes. About ${money(sb)} a year in extra fuel.`:'Units are off unless the plan needs them, so they start from cold.'}</div></div>
    <div class="pp"><div class="pph">Backup battery</div>${seg('bat',BATS.map((b,i)=>[i,b[0]?b[0]+' MW':'None']),P.bat)}<div class="hint">${BATS[P.bat][2]}. ${bP}</div></div>
    <div class="pp${noFlex?' off':''}"><div class="pph">Flexible work can pause in</div>${seg('rsp',[[1,'1 min'],[15,'15 min'],[60,'1 hour']],P.rsp,noFlex)}<div class="hint">${noFlex?'No flexible work in this plan. Set it on the Over 10 years tab.':`${F.flex===1?'36%':'18%'} of campus load pauses once it responds.`}</div></div></div>`;
  const ok=r.uns<0.01,cls=ok?'ok':'bad',upTxt=r.up==null?'n/a':r.up<=0?'Ready':r.up;
  const verdict=`<div class="verdict ${cls}"><div class="vword">${ok?'Holds':'Short'}</div><div class="vtxt"><b>${ok?'Load is served through the whole event':`Drops up to ${fmt(r.peak,0)} MW for ${fmt(r.mins)} min`}</b><span>${ok?(r.up==null||r.up<=0?'Gas is ready before the grid is cut.':`Onsite gas is fully up ${r.up} min after the event starts.`):`${fmt(r.uns,1)} MWh not served before backup comes up.`}</span></div></div>`;
  const kp=`<div class="kpis" style="margin-top:8px"><div class="kpi"><div class="k">Gas fully up</div><div class="v">${typeof upTxt==='number'?upTxt+'<small> min</small>':upTxt}</div><div class="s">${typeof upTxt==='number'?'after the event starts':r.up==null?'no onsite gas online':'before the event starts'}</div></div><div class="kpi"><div class="k">Battery used</div><div class="v">${r.ecap?fmt(100*r.used/r.ecap,0)+'<small>%</small>':'n/a'}</div><div class="s">${r.ecap?'of its stored energy':'no battery chosen'}</div></div><div class="kpi"><div class="k">Work paused</div><div class="v">${fmt(r.cur,1)}<small> MWh</small></div><div class="s">${noFlex?'no flexible work':'flexible work'}</div></div></div>`;
  let ways='';if(!ok){const tryP=p=>simHour(c,{...P,...p}),res=q=>q.uns<0.01?'<em class="res ok">Holds</em>':`<em class="res warn">Still short ${fmt(q.peak,0)} MW for ${fmt(q.mins)} min</em>`;
    const W=[];if(!P.hot)W.push(['Keep gas hot',`About ${money(sb)} a year in extra fuel`,tryP({hot:1})]);
    if(P.bat<2)W.push(['Add a 25 MW battery for 15 min',`Price up to ${money(25*1000*RX.battery_4h.capex_usd_per_kw)}`,tryP({bat:2})]);
    if(!noFlex&&P.rsp>1)W.push(['Pause flexible work within 1 minute','Needs work built for fast pausing',tryP({rsp:1})]);
    if(P.nt<30)W.push(['Get 30 minutes of warning','Needs an agreement with the utility',tryP({nt:30})]);
    if(W.length)ways=`<h3 class="sech" style="margin-top:16px">Ways to close the gap</h3><div class="tlist">${W.map(w=>`<div class="trow"><div><b>${w[0]}</b><span>${w[1]}</span></div>${res(w[2])}</div>`).join('')}</div>`;}
  const asm=`<details class="fold" id="hour-asm"><summary><span class="sm" style="font-weight:600">Start and ramp assumptions</span></summary><div class="pp" style="margin-top:8px"><div class="pph">Equipment start speed</div>${seg('spd',[[0.5,'Fast'],[1,'Typical'],[2,'Slow']],P.spd)}<div class="hint">${spdTxt}. Batteries respond at once. Wind and solar fall over 15 minutes. These are typical screening values. Replace them with your vendor's figures.</div></div></details>`;
  const open=el.querySelector('#hour-asm')&&el.querySelector('#hour-asm').open;
  el.innerHTML=`<p class="sub" style="margin:12px 0 0">The 10 year test steps one hour at a time, so it assumes onsite gas is ready when the grid is cut. This view checks the first minutes of one event with no warning.</p><div class="bhgrid">${inputs}<div>${verdict}${kp}<div style="margin-top:10px">${hourSvg(r)}</div>${ways}${asm}</div></div>`;
  if(open)el.querySelector('#hour-asm').open=true;
  el.querySelectorAll('[data-hx]').forEach(b=>b.onclick=()=>{const k=b.dataset.hx,v=b.dataset.v;if(k==='ev')P.ev=v;else if(k==='lv')P.lv2=+v;else P[k]=+v;drawHour(c);});}

function drawGate(c){GX.c=c;drawGateAll();}
function drawGateAll(){const c=GX.c;if(!c||!$('gate-body'))return;
  document.querySelectorAll('#gtabs [data-gtab]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.gtab===GX.tab));b.onclick=()=>{GX.tab=b.dataset.gtab;drawGateAll();};});
  $('g-ten').hidden=GX.tab!=='ten';$('g-hour').hidden=GX.tab!=='hour';
  ladQ=[];const e=ladEntry(c.open,c.caps,c.base.policy,c.base.mode,F.flex,true);
  const vs=c.z.vs!=null?c.z.vs:(VSH[c.base.mix]||0),rv=$('rules-vs');if(rv)rv.textContent=`Stress tests are ${F.hard?'on':'off'}. This plan gets ${fmt(100*vs,0)}% of its energy from wind and solar${F.vcap<1?', against a limit of '+fmt(100*F.vcap,0)+'%':' with no limit set'}.`;
  if(GX.tab==='ten'){if(e)drawTen(c,e);drawSens();}else drawHour(c);}

initNew();drawModels();step1();showStep(0);
})();
