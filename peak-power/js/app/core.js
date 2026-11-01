/* Shared helpers, formatting and engine/data bindings. */
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
