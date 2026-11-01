/* Step navigation and application start-up. Must load last. */
// ---------------- steps ----------------
let step=1;
function showStep(n){if(n>1&&!plant&&n!==2)return;step=n;[1,2,3].forEach(k=>{$('v-'+k).hidden=k!==n;$('tab-'+k).setAttribute('aria-selected',k===n);$('tab-'+k).classList.toggle('done',k<n);});
  if(n===3){if(!plant)return showStep(1);if(!live.R||live.R.caps!==plant.cur.caps){Object.assign(ops,{ev:'none',bat:null,gen:null,tech:false,svc:null,result:null,tp:null,day:null});initOps();selK='chillers';live.setRun(baseRun(),false);drawOpsAll();}else live.start();$('l-play').textContent=live.playing?'❚❚ Pause':'▶ Play';}else clearInterval(live.timer);
  window.scrollTo({top:0});}
document.querySelectorAll('nav.steps button').forEach(b=>b.onclick=()=>{const n=+b.dataset.s;if(n>1&&!plant){if(chosen!=null&&rows.every(r=>r.done))startPlant(chosen);return;}showStep(n);});
drawModels();step1();showStep(1);
