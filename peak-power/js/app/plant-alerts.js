/* Step 2 alerts and board decisions. */
// ---- alerts and decisions ----
function delta(a,b,at){const A=win(a,at,120),B=win(b,at,120),y=A.yrs;return {cost:(B.total-A.total)/y,co2:(B.co2-A.co2)/y,profit:(B.e.profit-A.e.profit)/y,kg:B.kg,uns:B.uns};}
const fxTxt=d=>`<span>cost <b class="${d.cost>0?'down':'up'}">${sgn(d.cost)}/yr</b></span><span>CO₂ <b class="${d.co2>0?'down':'up'}">${sgn(d.co2/1e3,v=>fmt(v,1)+'k t')}/yr</b></span><span>profit <b class="${d.profit<0?'down':'up'}">${sgn(d.profit)}/yr</b></span>`;
function drawAlertsDecs(over,months,kg5){const p=plant,o=p.cur,M=o.mo,at=p.at,L=lim(),mi=MIXORD.indexOf(p.mix),A=[];
  const alt=(mix,bat,cap)=>{const q=planOf(mix,bat,cap);return q?{q,d:delta(o,q,at)}:null;};
  const apply=q=>{p.cap=q._cap!=null?q._cap:p.cap;setPlan(q);drawRun();};
  const tag=(q,cap)=>{if(q)q._cap=cap;return q;};
  // 1 carbon
  if(kg5>L&&over.length){const pk=over.reduce((a,m)=>M.kg[m]>M.kg[a]?m:a,over[0]),gs=sumM(M.gas,at-12,at)/Math.max(sumM(M.req,at-12,at),1);
    // rank the fixes that actually cut CO2 by cost per tonne avoided
    const cand=[];for(const c of [100,70,40])if(c<(p.cap||1e9)){const a=alt(p.mix,p.battery,c);if(a&&!a.q.miss)cand.push({t:`Cap carbon at ${c} kg/MWh`,a:tag(a,c)});}
    if(mi<MIXORD.length-1){const a=alt(MIXORD[mi+1],p.battery,p.cap);if(a)cand.push({t:MIXORD[mi+1].includes('N25')?'Add a nuclear contract':'Sign more wind and solar',a:tag(a,p.cap)});}
    const act=cand.filter(c=>c.a.d.co2<-500).map(c=>({...c,pt:Math.max(c.a.d.cost,0)/-c.a.d.co2})).sort((x,y)=>x.pt-y.pt).slice(0,2);
    const avg10=o.z.kg,onTrack=F.capMode==='avg'&&avg10<=L,ramp=pk<30+F.delay;
    if(onTrack){A.push({lvl:'info',h:`Last 12 months at ${fmt(kg5,0)} kg/MWh, 10-year average on track at ${fmt(avg10,0)}`,b:`${p.cap?'The cap':'The packet example limit'} is a 10-year average. Carbon starts high and falls: ${ramp?`until month ${30+F.delay} the grid gives only 25 to 50 MW, so gas carries the rest; `:''}later years are cleaner as grid carbon falls 3% a year.`,act:[]});}
    else A.push({lvl:'bad',h:`Carbon over the limit: ${fmt(kg5,0)} kg/MWh over the last 12 months`,b:`Peak ${fmt(M.kg[pk],0)} kg/MWh in month ${pk}, against a limit of ${L}${p.cap?'':' (packet example; no cap is set yet)'}. Onsite gas carried ${fmt(100*gs,0)}% of demand. Cheapest ways to cut it, per tonne avoided:`,act});}
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
  G.push({k:'mix',icon:'wind',col:'--s-wind',t:'Clean energy contracts',d:'Paid on available output.',opts:MIXORD.map(m=>({l:MIXT[m].replace(' + 25 MW nuclear',' + nuclear'),cur:m===p.mix,a:m===p.mix?null:alt(m,p.battery,p.cap),cap:p.cap}))});
  G.push({k:'cap',icon:'gas',col:'--s-gas',t:'Carbon cap',d:'Operations runs gas and batch work to stay under it.',opts:[0,100,70,40].map(c=>({l:c?`Below ${c} kg/MWh`:'No cap',cur:c===(p.cap||0),a:c===(p.cap||0)?null:alt(p.mix,p.battery,c),cap:c}))});
  {const cur=win(o,at,120),base=[{l:'Current plan',q:o,d:null}];const rowsI=[];
    for(const g of G)for(const q of g.opts)if(q.a&&!q.a.q.miss)rowsI.push({l:`${{mix:'Contracts',bat:'Battery',cap:'Cap'}[g.k]}: ${q.l.replace('Below ','< ')}`,q:q.a.q,d:q.a.d});
    rowsI.sort((a,b)=>a.d.co2-b.d.co2);const capL=lim();
    const tr=(l,w,d)=>`<tr><td>${l}</td><td>${fmt(w.co2/1e3,0)}k t</td><td class="${d?d.co2<0?'up':'down':''}">${d?sgn(d.co2*w.yrs/1e3,v=>fmt(v,0)+'k t'):'–'}</td><td class="${w.kg>capL?'down':''}">${fmt(w.kg,0)}</td><td>${fmt(100*w.clean/Math.max(w.served,1),0)}%</td><td>${d?sgn(d.cost):'–'}</td><td>${d&&d.co2<-100?'$'+fmt(Math.max(0,d.cost)/-d.co2)+'/t':'–'}</td></tr>`;
    document.querySelectorAll('.atm').forEach(e=>e.textContent=at);
    $('env-imp').innerHTML=`<div class="chart"><table class="tbl"><thead><tr><th>Plan</th><th>CO₂ to m120</th><th>Change</th><th>kg/MWh</th><th>Clean share</th><th>Cost / yr</th><th>Cost per t avoided</th></tr></thead><tbody>${tr('<b>Current plan</b>',cur,null)}${rowsI.map(r=>tr(r.l,win(r.q,at,120),r.d)).join('')}</tbody></table></div>`;}
  $('c-decs').innerHTML=G.map((g,gi)=>`<div class="dec"><div class="dh"><svg viewBox="-22 -26 44 48" width="34" height="38" aria-hidden="true">${ICON[g.icon](`var(${g.col})`)}</svg><div><div class="t">${g.t}</div><div class="d">${g.d}</div></div></div>
    <div class="curp"><span class="muted">Current</span> <b>${(g.opts.find(q=>q.cur)||{}).l||'–'}</b></div>${g.k==='mix'?'<div id="mkt"></div>':''}
    <div class="dopts">${g.opts.map((q,qi)=>{if(q.cur)return '';if(!q.a)return `<div class="dopt dis"><span class="l">${q.l}</span><span class="fx muted">not tested</span></div>`;
      const miss=q.a.q.miss;return `<button type="button" class="dopt" data-g="${gi}" data-q="${qi}" ${miss?'disabled':''}><span class="l">${q.l}</span><span class="fx">${miss?'<span class="down">cannot meet this cap with this build</span>':fxTxt(q.a.d)}</span></button>`;}).join('')}</div></div>`).join('');
  drawMarket(o);
  $('c-decs').querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{const q=G[+b.dataset.g].opts[+b.dataset.q];p.cap=q.cap;setPlan(q.a.q);drawRun();});
  const dS=delta(p.start,o,at);const changed=o!==p.start;
  $('c-vs').innerHTML=changed?`<span class="muted">Your changes vs the plan you opened with, from month ${at}:</span> ${fxTxt(dS)} <button class="btn" type="button" id="c-reset">Undo all</button>`:`<span class="muted">Deltas are per year from month ${at} to month 120, from full hourly re-runs, if the change were in place from now.</span>`;
  if($('c-reset'))$('c-reset').onclick=()=>{p.cap=F.cap;setPlan(p.start);drawRun();};}
$('back-1').onclick=()=>showStep(1);
$('go-3').onclick=()=>{showStep(3);};
