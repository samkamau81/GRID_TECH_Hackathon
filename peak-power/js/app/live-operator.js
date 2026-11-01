/* Step 3 operator events, responses and servicing (labelled extensions). */
// ---- operator: events, responses, servicing (all extensions, labeled) ----
const TECH_COST=8000,TECH_H=4,DOWN_H=24,BACKUP_MW=10,COOL=0.2,CH_SINCE=77,CH_DEGR=0.08,CH_LATE=30; // extensions: call-out, repair times, backup size, cooling share
const SERV={gas_turbine:{every:4000,hrs:12,cost:25000,what:'hot-section inspection'},gas_engine:{every:2000,hrs:8,cost:9000,what:'oil, plugs and valves'},fuel_cell:{every:8000,hrs:24,cost:12000,what:'stack check'},
  battery_4h:{days:180,hrs:6,cost:6000,what:'cell balancing and HVAC check'},chillers:{days:90,hrs:4,cost:3000,what:'coil clean and refrigerant check'},backup:{days:30,hrs:1,cost:500,what:'monthly test run'}};
const EV={none:['Nothing','A normal day.'],wind:['Wind lull, 3 days','Calm spell from tomorrow: wind at 25% of normal.'],solar:['Heavy cloud, 3 days','Solar at 30% of normal from tomorrow.'],
  stress:['Grid stress alert','Tomorrow 14:00–22:00, imports capped at 50%.'],outage:['Grid outage','Tomorrow 15:00–21:00, no imports at all (no grid, no wind or solar).'],
  chiller:['Chiller drawing excess power','Tomorrow from 13:00 a chiller fault adds 3 MW of cooling load for 12 hours.'],fail:['Equipment trips','Tomorrow 16:00 one unit trips offline for 24 hours.']};
const ops={ev:'none',failId:null,day:null,bat:null,gen:null,tech:false,svc:null,result:null,base0:null,tp:null};
function evDef(){const day=ops.day;if(day==null)return null;
  if(ops.ev==='outage')return {extra:{hourEvents:[{from:day+15,to:day+21,frac:0}]},win:[day+15,day+21],kind:'outage'};
  if(ops.ev==='stress')return {extra:{hourEvents:[{from:day+14,to:day+22,frac:0.5}]},win:[day+14,day+22],kind:'stress'};
  if(ops.ev==='solar')return {extra:{wxWin:[{from:day,to:day+72,solar:0.3}]},win:[day,day+72],kind:'cloud'};
  if(ops.ev==='wind')return {extra:{wxWin:[{from:day,to:day+72,wind:0.25}]},win:[day,day+72],kind:'lull'};
  if(ops.ev==='chiller'){const f=day+13;return {extra:{loadAdd:[{from:f,to:f+(ops.tech?3:12),mw:3}]},win:[f,f+12],kind:'chiller'};}
  if(ops.ev==='fail'&&ops.failId){const f=day+16,to=f+(ops.tech?TECH_H:DOWN_H);return {extra:{},win:[f,f+DOWN_H],outages:[{id:ops.failId,from:f,to}],kind:'fail'};}return null;}
function opsRun(withResp){const a=plant.attrs,caps=plant.cur.caps,d=evDef();let outs=[...((d&&d.outages)||[])];const ex={...((d&&d.extra)||{})};
  if(withResp&&ops.svc&&ops.svc.id!=='chillers'&&ops.svc.id!=='backup')outs.push({id:ops.svc.id,from:ops.svc.from,to:ops.svc.to});
  const rental=withResp&&ops.gen?{from:ops.gen.from,to:ops.gen.to,mw:BACKUP_MW}:null,ctl=withResp&&ops.bat?{bat:ops.bat}:null;
  return run(plant.open,caps,a.policy,a.mode,ex,rental,outs.length?outs:null,ctl);}
const anyOps=()=>ops.ev!=='none'||ops.bat||ops.gen||ops.svc;
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
  const a=plant.attrs,B=baseRun(),X=run(plant.open,plant.cur.caps,a.policy,a.mode,{loadAdd:[{from:due,to,mw}]});let dc=0,dco=0;
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
