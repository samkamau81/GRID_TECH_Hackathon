/* Step 3, Live Operations: the hour-by-hour live run. */
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
