/* Step 3 forecast chart: next 72 hours. */
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
