/* Scenario settings controls and revenue-model definitions. */
// ---------------- settings & revenue model ----------------
const F={capMode:'avg',dead:0,cap:0,delay:0,ren:'0,0',growth:0,weather:'typical',grid:'packet',acres:8};
const RM={model:'lease',tier:'mid',mk:0.10,rate:275};
const RPRE={low:[140,110,60],mid:[180,150,100],high:[230,190,120]};
const rates=()=>RPRE[RM.tier];
const WX={typical:[1,1],windy:[1.15,1],calmw:[0.8,1],sunny:[1,1.1],cloudy:[1,0.85],poor:[0.8,0.85]};
const perMWh=r=>r*1000/730;
function scBase(){const s={growth:F.growth,delay:F.delay};const w=WX[F.weather];if(w[0]!==1)s.windScale=w[0];if(w[1]!==1)s.solarScale=w[1];
  if(F.grid==='calm')s.packetEvents=false;if(F.grid==='tight')s.capFrac=0.4;if(F.grid==='wave')s.extra=[{startDay:212,days:14,startHour:14,hours:8,frac:0.5}];return s;}
const isDefault=()=>!F.growth&&!F.delay&&F.ren==='0,0'&&F.weather==='typical'&&F.grid==='packet';
function resX(){if(F.ren==='0,0')return RES;const [w,so]=F.ren.split(',').map(Number);const r=JSON.parse(JSON.stringify(RES));r.wind.available_month+=w;r.utility_solar.available_month+=so;return r;}
const TSC={};function tierSums(open){if(TSC[open])return TSC[open];const s=[0,0,0];for(let h=open*730;h<87600;h++){const k=Math.floor(h/730)-open,f=Math.min(1,1/3+k/15),r=h%8760,t1=REF.t1[r]*f,t2=REF.t2[r]*f;s[0]+=REF.load[r]*f-t1-t2;s[1]+=t1;s[2]+=t2;}return TSC[open]=s;}
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
