/* Step 3 equipment panel. */
// ---- equipment panel ----
const EQN={campus:'Data center halls',sub:'Substation',grid:'ERCOT grid power',wind:'Wind contract',utility_solar:'Solar contract',nuclear:'Nuclear contract',battery_4h:'Battery',gas_turbine:'Gas turbine',gas_engine:'Gas engines',fuel_cell:'Gas fuel cell',backup:'Backup diesel generator',chillers:'Chillers'};
function drawPanel(){const R=live.R;if(!R)return;const k=selK,c=R.caps,el=$('eq-panel');let ctl='';const seg=(id,opts,cur)=>`<div class="seg" role="group" id="${id}">${opts.map(([v,l])=>`<button type="button" data-v="${v}" aria-pressed="${v===cur}">${l}</button>`).join('')}</div>`;
  const nextWin=()=>{const F=flagsAt(R,live.t).filter(f=>f.kind!=='svc'&&f.kind!=='cloud');return F.length?{from:F[0].from,to:F[F.length-1].to,lab:F[0].lab}:null;};const nw=nextWin();
  if(k==='battery_4h'){ctl=c.battery_4h?`<div class="crow"><span>Mode</span>${seg('pc-bat',[['auto','Auto'],['res','Reserve for next event']],ops.bat?'res':'auto')}</div><p class="muted sm">${nw?`Next event: ${nw.lab} ${hh(nw.from)}. Reserve charges it beforehand and stops price trading.`:'No event in the next 72 hours; Auto buys cheap power (or uses surplus wind and solar) to charge, sells nothing back, trades price spikes and covers stress events.'}</p>`:`<p class="sm">No battery in this plan.</p><button class="btn" type="button" id="pc-add">Add one in Run the plant</button>`;}
  else if(k==='backup')ctl=`<div class="crow"><span>Mode <span class="tag">ext.</span></span>${seg('pc-gen',[['off','Off'],['stby','Standby for next event']],ops.gen?'stby':'off')}</div><p class="muted sm">10 MW diesel, about $350/MWh and 0.74 t CO₂/MWh. On standby it starts only if gas and the grid fall short, before any work is paused.${nw?` Next event: ${nw.lab} ${hh(nw.from)}.`:''}</p>`;
  else if(GASK.includes(k))ctl=`<div class="crow"><button class="btn" type="button" id="pc-trip">Simulate a trip tomorrow</button><label class="chk"><input type="checkbox" id="pc-tech" ${ops.tech?'checked':''}> technician on call ($${fmt(TECH_COST)}, back in ${TECH_H} h)</label></div>`;
  else if(k==='chillers')ctl=`<p class="sm">Cooling is assumed at ${fmt(100*COOL)}% of campus load <span class="tag">ext.</span>; the packet's demand already includes it.</p><div class="crow"><button class="btn" type="button" id="pc-chill">Simulate a chiller fault tomorrow</button><label class="chk"><input type="checkbox" id="pc-tech" ${ops.tech?'checked':''}> technician on call</label></div>`;
  else if(k==='wind'||k==='utility_solar')ctl=`<div class="crow"><button class="btn" type="button" id="pc-wx">${k==='wind'?'Simulate a 3-day wind lull':'Simulate 3 days of heavy cloud'}</button></div>`;
  else if(k==='sub'||k==='grid')ctl=`<div class="crow"><button class="btn" type="button" id="pc-out">Simulate an outage tomorrow</button><button class="btn" type="button" id="pc-str">Simulate a stress alert</button></div>`;
  const sv=service(R,k,live.t);const svh=sv?`<div class="svc"><div class="crow"><span>Next service <span class="tag">ext.</span></span><span class="mono">${sv.days<1?'due now':'in '+fmt(sv.days,0)+' days'}${sv.unit==='run hours'?` · ${fmt(sv.left)} run h`:''}</span></div><div class="meter"><i style="width:${fmt(sv.pct)}%;background:${sv.days<=14?'#c98500':'var(--accent)'}"></i></div><div class="muted sm">${sv.what} · ${sv.hrs} h · $${fmt(sv.cost)}</div>${k==='chillers'?(()=>{const cs=chillerSave(R,live.t);return cs?`<div class="save"><b>On time saves ${fmt(cs.co2,0)} t CO₂</b> and ${money(cs.cost)} vs ${CH_LATE} days late <span class="tag">ext.</span><br><span class="muted">Dirty coils add ~${fmt(100*CH_DEGR)}% cooling power: ${fmt(cs.mw,1)} MW, ${fmt(cs.mwh,0)} MWh.</span></div>`:'';})():''}${ops.svc&&ops.svc.id===k?`<div class="sm up">Booked ${hh(ops.svc.from)}</div>`:`<button class="btn" type="button" id="pc-svc">Schedule in a quiet window</button>`}</div>`:'';
  const hasTrend=!!TK[k];
  el.innerHTML=`<div class="hd"><p class="eyebrow" style="margin:0">Selected · ${EQN[k]||k}</p></div><div id="eq-live" class="eqlive"></div>${ctl}${svh}${hasTrend?`<div id="l-trend" class="trend" hidden></div>`:k==='campus'?'<p class="muted sm">Racks light green when served, blue when moved to the remote site, grey when paused, red when unserved. Click any piece of equipment for its controls.</p>':''}`;
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
  const c1=cost(R)+extra,c0=cost(R0),cn=cost(Bn),u1=un(R),u0=un(R0),p1=pa(R),p0=pa(R0);const resp=ops.bat||ops.gen||ops.tech||ops.svc;const cls=u1>0.5?'bad':p1>0.5?'warn':'ok';
  box.innerHTML=`<div class="report ${cls}"><h3>${u1>0.5?`Next 4 days: short ${fmt(u1)} MWh`:p1>0.5?`Next 4 days: covered, ${fmt(p1)} MWh batch paused`:'Next 4 days: every MW served'}</h3>
    <div class="rgrid"><span>Event cost vs a normal 4 days</span><span>${sgn(c0-cn)}</span>${resp?`<span>Your responses change it by</span><span class="${c1-c0>0?'down':'up'}">${sgn(c1-c0)}</span><span>Unserved: do nothing → yours</span><span>${fmt(u0)} → ${fmt(u1)} MWh</span><span>Batch paused: do nothing → yours</span><span>${fmt(p0)} → ${fmt(p1)} MWh</span><span>Carbon change from responses</span><span>${sgn(co(R)-co(R0),v=>fmt(v,0)+' t')}</span>`:`<span>Unserved</span><span>${fmt(u0)} MWh</span><span>Batch paused</span><span>${fmt(p0)} MWh</span>`}</div>
    <p class="muted sm" style="margin:6px 0 0">${resp?'Includes call-out and service fees.':'No response set yet. Use the alerts above or click equipment.'} Unserved energy is charged at $1,000/MWh.</p>
    <div class="crow" style="margin-top:6px"><button class="btn pri" type="button" id="op-play">▶ Play through it</button><button class="btn" type="button" id="op-clear">Clear all</button></div></div>`;
  $('op-play').onclick=()=>{const F=flagsAt(R,ops.tp);const s=F.length?F[0].from:ops.tp;live.playing=true;$('l-play').textContent='❚❚ Pause';live.speed=1;syncSpeed();live.jump(Math.max(ops.tp,s-6));live.start();};
  $('op-clear').onclick=()=>{Object.assign(ops,{ev:'none',bat:null,gen:null,tech:false,svc:null,result:null,tp:null,day:null});$('sim').value='none';$('sim-src').hidden=true;applyOps();};}
function drawOps(R,t){drawSite(R,t);drawFc(R,t);drawAlerts(R,t);updPanel(R,t);}
function initOps(){$('sim').innerHTML=Object.entries(EV).map(([k,[t]])=>`<option value="${k}">${t}</option>`).join('');$('sim').value=ops.ev;
  const srcs=ORD.filter(k=>plant.cur.caps[k]);$('sim-src').innerHTML=srcs.map(k=>`<option value="${k}">${fmt(plant.cur.caps[k])} MW ${RN[k]}</option>`).join('');if(!ops.failId||!plant.cur.caps[ops.failId])ops.failId=srcs.find(k=>GASK.includes(k))||srcs[0];
  $('sim-src').hidden=ops.ev!=='fail';$('sim-src').value=ops.failId;$('sim-d').textContent=EV[ops.ev][1];
  $('sim').onchange=e=>{const v=e.target.value;$('sim-d').textContent=EV[v][1];if(v==='none'){ops.ev='none';ops.day=null;applyOps();}else setEv(v);};
  $('sim-src').onchange=e=>{ops.failId=e.target.value;setEv('fail');};siteKey='';}

const baseRun=()=>{const a=plant.attrs;return run(plant.open,plant.cur.caps,a.policy,a.mode);};
const live={t:0,playing:true,speed:1,timer:null,cum:null,R:null,over:null,
  setRun(R,keepT){this.R=R;const n=87600,c={cost:new Float64Array(n+1),co2:new Float64Array(n+1),dem:new Float64Array(n+1),uns:new Float64Array(n+1),cur:new Float64Array(n+1)};
    for(let t=0;t<n;t++){c.cost[t+1]=c.cost[t]+R.A.cost[t]+R.A.relCost[t]+R.A.intCost[t];c.co2[t+1]=c.co2[t]+R.A.co2[t];c.dem[t+1]=c.dem[t]+R.I.L[t];c.uns[t+1]=c.uns[t]+R.O.unserved[t];c.cur[t+1]=c.cur[t]+R.O.cur[t];}
    this.cum=c;this.over=buckets(R,0,87600,730);if(!keepT||this.t<plant.open*730)this.t=plant.open*730+24*5+12;this.draw();this.start();},
  start(){clearInterval(this.timer);if(this.playing&&!document.hidden&&!$('v-3').hidden)this.timer=setInterval(()=>{this.t+=this.speed;if(this.t>=87599)this.t=plant.open*730;this.draw();},150);},
  jump(t){this.t=Math.max(0,Math.min(87599,Math.round(t)));this.draw();},
  draw(){const R=this.R;if(!R)return;const t=this.t,I=R.I,a=dateOf(t),m=Math.floor(t/730),op=plant.open;
    $('l-clock').innerHTML=`Year ${Math.floor(t/8760)+1} · ${a.wd} ${a.m} ${a.d}, ${String(a.h).padStart(2,'0')}:00<small>model month ${m}${m>=op?` · ${m>=op+10?'full campus':'ramping up, '+fmt(100*Math.min(1,1/3+(m-op)/15))+'% of full demand'}`:' · before first power'}</small>`;
    const h=hourSup(R,t),L=I.L[t],st=$('l-status');const inEv=ops.result&&t>=ops.result.win[0]&&t<ops.result.win[1];
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
