/* Step 2, Run the plant: board-level review. */
// ---------------- STEP 2: run the plant (board level) ----------------
// The CEO decides contracts, battery and a carbon cap. Operations then picks how gas runs and when batch
// work may pause (the cheapest of the tested operating rules that meets the cap).
let plant=null;   // {open, mix, battery, cap, at, attrs, cur, start}
const LIMDEF=100; const lim=()=>plant.cap||LIMDEF;
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
    plant.start=p0;setPlan(p0);drawRun();},20);}
function setPlan(o){plant.cur=o;plant.attrs=o.attrs;plant.mix=o.attrs.mix;plant.battery=o.attrs.battery;}

function drawRun(){const p=plant,o=p.cur,M=o.mo,at=p.at,WN=p.win||12,lo=Math.max(p.open,at-WN),L=lim();
  const w12=win(o,lo,at),wPrev=at-WN>p.open?win(o,Math.max(p.open,at-2*WN),at-WN):null,co5=sumM(M.co2,Math.max(p.open,at-12),at),de5=sumM(M.den,Math.max(p.open,at-12),at),kg5=de5?1000*co5/de5:0;
  const months=[];for(let m=Math.max(p.open,at-12);m<at;m++)months.push(m);const over=months.filter(m=>M.kg[m]>L);
  const opts=[];for(let m=p.open+3;m<=119;m+=1)opts.push(m);
  const dd=(a,b,good)=>{if(b==null)return '';const x=a-b;if(Math.abs(x)<0.05*Math.abs(b)/10)return '<span class="muted">flat vs prior period</span>';return `<span class="${(x<0)===good?'up':'down'}">${x>0?'▲':'▼'} ${fmt(Math.abs(100*x/b),0)}% vs prior ${WN} mo</span>`;};
  $('c-head').innerHTML=`<div class="rhead"><div><p class="eyebrow">Plant running · opened month ${p.open} · full campus month ${p.open+10}</p>
     <h2>Board review, month ${at} <span class="muted" style="font-size:16px;font-weight:500">(year ${Math.floor(at/12)+1})</span></h2>
     <p class="sub">${buildText(o.caps)}. Figures are for the last ${at-lo} months unless marked.</p></div>
     <div class="in" style="width:200px"><label for="c-at">Review at</label><select id="c-at">${opts.map(m=>`<option value="${m}" ${m===at?'selected':''}>Month ${m} · year ${Math.floor(m/12)+1}</option>`).join('')}</select></div></div>
   <div class="kpis" style="margin-top:10px">
    <div class="kpi hi"><div class="k">Power cost per MWh</div><div class="v">$${fmt(w12.usdPerMWh,1)}</div><div class="s">${wPrev?dd(w12.usdPerMWh,wPrev.usdPerMWh,true):'first period'}</div></div>
    <div class="kpi"><div class="k">Power bill, per year (annualized)</div><div class="v">${money(w12.total/w12.yrs)}</div><div class="s">all energy, contracts, equipment</div></div>
    <div class="kpi"><div class="k">Profit, per year <span class="tag">team</span></div><div class="v">${money(w12.e.profit/w12.yrs)}</div><div class="s">revenue ${money(w12.e.rev/w12.yrs)}</div></div>
    <div class="kpi ${o.z.kg>L?'bad':''}"><div class="k">Carbon, 10-year average</div><div class="v">${fmt(o.z.kg,0)}<small> kg/MWh</small> ${o.z.kg<=L?'<span class="up" style="font-size:14px">✓</span>':''}</div><div class="s">${p.cap?`cap ${L}`:'packet example 100'} · last 12 months ${fmt(kg5,0)}${kg5>L&&at<=30+F.delay+3?' (grid ramp-up)':''}</div></div>
    <div class="kpi ${w12.uns>1?'bad':''}"><div class="k">Demand met</div><div class="v">${fmt(100*(1-w12.uns/Math.max(w12.req,1)),2)}<small>%</small></div><div class="s">${w12.cur>1?fmt(w12.cur,0)+' MWh batch paused':'no batch work paused'}</div></div>
   </div>`;
  $('c-at').onchange=e=>{plant.at=+e.target.value;drawRun();};
  $('c-win').innerHTML=[3,6,12,24].map(v=>`<button type="button" data-v="${v}" aria-pressed="${v===WN}">${v} mo</button>`).join('');
  $('c-win').querySelectorAll('button').forEach(b=>b.onclick=()=>{p.win=+b.dataset.v;drawRun();});$('c-wlab').textContent=`last ${at-lo} months, to month ${at}`;
  drawPlantPic(o,lo,at);drawCostChart(o,at);drawEnv(o,lo,at);$('env-imp').innerHTML=busy('Projecting impacts…');
  $('c-alerts').innerHTML=busy('Checking the plant…');$('c-decs').innerHTML=busy('Costing board decisions…');
  setTimeout(()=>drawAlertsDecs(over,months,kg5),20);}
