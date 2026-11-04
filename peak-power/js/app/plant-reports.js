/* Step 2 reports: plant imagery, monthly cost per MWh, environmental report, contracts vs market. */
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
      g+=`<text x="54" y="${y+24}">${money(cost/yrs)}/yr${co2>1?` · ${fmt(co2/yrs/1e3,1)}k t CO₂/yr`:''}</text>`;}else g+=`<text x="54" y="${y+11}">not in plan</text>`;});
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
  s2+=`<line x1="${P.l}" x2="${W-P.r}" y1="${y2(L)}" y2="${y2(L)}" stroke="var(--bad)" stroke-dasharray="5 4" stroke-width="1.3"/><text x="${W-P.r}" y="${y2(L)-4}" text-anchor="end" style="fill:var(--bad)">${plant.cap?`cap ${L} kg/MWh${F.capMode==="year"?"":" (10-yr average)"}`:`limit ${L} kg/MWh (packet example)`}</text>`;
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
    E.s1[m]+=g;E.s2[m]+=O.grid[t]*I.co2[t];E.s3[m]+=O.rel[t]*1.05*I.co2[t];const cl=Math.max(0,O.wind[t]+O.solar[t]+O.nuclear[t]+O.credit[t]),sv=L-O.rel[t]-O.cur[t]-O.unserved[t];
    E.clean[m]+=cl;E.served[m]+=sv;const h=REF.hour[t%8760];E.hm[m][0][h]+=Math.min(cl,sv);E.hm[m][1][h]+=sv;}
  R._env=E;return E;}
function drawEnv(o,lo,at){const p=plant,E=envSeries(o.R),L=lim(),s=(a,m0,m1)=>sumM(a,m0,m1);
  const yrs=(at-lo)/12,co=s(E.s1,lo,at)+s(E.s2,lo,at)+s(E.s3,lo,at),sv=s(E.served,lo,at),cfe=sv?s(E.clean,lo,at)/sv:0;
  let hm0=0,hm1=0;for(let m=lo;m<at;m++)for(let h=0;h<24;h++){hm0+=E.hm[m][0][h];hm1+=E.hm[m][1][h];}
  const tot10=s(E.s1,0,120)+s(E.s2,0,120)+s(E.s3,0,120),sv10=s(E.served,0,120),rest=s(E.s1,at,120)+s(E.s2,at,120)+s(E.s3,at,120);
  const sh=v=>co?fmt(100*v/co,0)+'%':'–';
  $('env-kpi').innerHTML=`<div class="kpi"><div class="k">CO₂ per year, last ${at-lo} mo</div><div class="v">${fmt(co/yrs/1e3,1)}<small>k t</small></div><div class="s">annualized</div></div>
   <div class="kpi ${sv&&1000*co/sv>L&&!(p.cap&&F.capMode==='avg'&&o.z.kg<=p.cap)?'bad':''}"><div class="k">Carbon intensity, this period</div><div class="v">${sv?fmt(1000*co/sv,0):'–'}<small> kg/MWh</small></div><div class="s">limit ${L}${p.cap?'':' (packet example)'}</div></div>
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
