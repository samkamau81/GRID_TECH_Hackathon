/* Bridges the UI to the in-browser dispatch engine. */
// ---------------- engine ----------------
const cache=new Map();
function run(open,caps,policy,mode,extra,rental,outages,ctl){const sc={...scBase(),...(extra||{})},RX=resX();const key=[open,JSON.stringify(caps),policy,mode,JSON.stringify(sc),F.ren,JSON.stringify(rental||0),JSON.stringify(outages||0),JSON.stringify(ctl||0)].join('|');if(cache.has(key))return cache.get(key);
  const I=E.buildInputs(REF,open,sc);const O=E.dispatch(I,RX,caps,policy,mode,1000,rental,outages,ctl);const A=E.account(I,RX,caps,O);const R={I,O,A,caps,open,policy,mode};
  if(cache.size>30)cache.delete(cache.keys().next().value);cache.set(key,R);return R;}
function annKg(R){const a=[];for(let y=0;y<10;y++){let co=0,d=0;for(let t=y*8760;t<(y+1)*8760;t++){co+=R.A.co2[t];d+=R.I.L[t]-R.O.cur[t]-R.O.unserved[t]+0.05*R.O.rel[t];}a.push(d>1?1000*co/d:0);}return a;}
function zOf(R){const z=E.summarize(R.I,R.O,R.A);z.mt=tierServed(R);z.unmet=z.uns*UNMET;z.akg=annKg(R);z.akgMax=Math.max(...z.akg);return z;}
const capKg=s=>F.capMode==='year'?Math.max(...(s.akg||[0])):s.combined_electricity_co2_kg_per_mwh;const zCap=z=>F.capMode==='year'?z.akgMax:z.kg;
function sizeUp(open,b){let caps={...b.caps};const added={gas_engine:0,gas_turbine:0};let R,fits=true;const never=b.policy==='never';
  for(let it=0;it<7;it++){R=run(open,caps,b.policy,b.mode);let need=0;for(let t=0;t<87600;t++){const n=R.O.unserved[t]+(never?R.O.cur[t]:0);if(n>need)need=n;}
    if(need<0.05)break;let add=Math.ceil(need/5-1e-9)*5;const c={...caps};const e=Math.min(add,Math.max(0,60-(c.gas_engine||0)));c.gas_engine=(c.gas_engine||0)+e;add-=e;
    if(add>0){const tb=Math.ceil(add/25)*25;if((c.gas_turbine||0)+tb>75){fits=false;break;}c.gas_turbine=(c.gas_turbine||0)+tb;}
    if(landOf(c)>F.acres+1e-9){fits=false;break;}added.gas_engine+=c.gas_engine-(caps.gas_engine||0);added.gas_turbine+=(c.gas_turbine||0)-(caps.gas_turbine||0);caps=c;}
  return {R,caps,added,fits};}
function lightZ(b){const ts=tierSums(b.open);return {total:b.total_decision_cost_usd,usdPerMWh:b.decision_cost_usd_per_requested_mwh,kg:b.combined_electricity_co2_kg_per_mwh,req:b.requested_mwh,cur:b.interrupted_mwh,uns:0,co2:b.combined_operational_co2_t,cleanShare:b.clean_energy_share,mt:[ts[0],ts[1],ts[2]-b.interrupted_mwh],unmet:0,akg:b.akg,akgMax:Math.max(...(b.akg||[0]))};}
function evalBase(b,deep){const zero={gas_engine:0,gas_turbine:0};let o;
  if(isDefault()){if(!deep)o={open:b.open,base:b,R:null,caps:b.caps,added:zero,fits:true,z:lightZ(b)};else{const R=run(b.open,b.caps,b.policy,b.mode);o={open:b.open,base:b,R,caps:b.caps,added:zero,fits:true,z:zOf(R)};}}
  else{const r=sizeUp(b.open,b);o={open:b.open,base:b,R:r.R,caps:r.caps,added:r.added,fits:r.fits,z:zOf(r.R)};}
  if(landOf(o.caps)>F.acres+1e-9)o.fits=false;o.capOk=!F.cap||zCap(o.z)<=F.cap;o.e=econ(o.z);return o;}
const quick=s=>econ(lightZ(s)).profit;
function bestAt(open,deep){let pool=S.filter(s=>s.open===open);if(!pool.length)return null;
  if(isDefault()){const ok=pool.filter(s=>(!F.cap||capKg(s)<=F.cap)&&landOf(s.caps)<=F.acres+1e-9);if(!ok.length)return null;return evalBase(ok.reduce((a,c)=>quick(c)>quick(a)?c:a),deep);}
  pool=pool.filter(s=>landOf(s.caps)<=F.acres+1e-9);if(!pool.length)return null;pool.sort((a,c)=>quick(c)-quick(a));const cand=[];const seen=new Set();for(const s of pool){const k=s.mix+s.battery+s.mode+s.policy;if(seen.has(k))continue;seen.add(k);cand.push(s);if(cand.length>=(deep?3:1))break;}
  if(F.cap){const c2=pool.filter(s=>capKg(s)<=F.cap*0.8&&!cand.includes(s));if(c2.length)cand.push(c2[0]);}
  let best=null;for(const b of cand){const o=evalBase(b,true);const sc=(o.fits?0:-1e12)+(o.capOk?0:-1e11)+o.e.profit;if(!best||sc>best.sc)best={...o,sc};}return best;}
const feasible=r=>r&&r.fits&&r.capOk&&r.z.uns<0.5;
const inDeadline=o=>!F.dead||o+10<=F.dead;
