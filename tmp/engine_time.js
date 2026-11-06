const fs=require('fs'),path=require('path');const w={};
for(const f of ['reference-data.js','scenarios.js'])new Function('window',fs.readFileSync(path.join('peak-power/js/data',f),'utf8'))(w);
const E=require(path.resolve('peak-power/js/engine.js'));const {ref,res}=w.PEAKPOWER_REFERENCE,S=w.PEAKPOWER_SCENARIOS;
const s=S.find(x=>x.battery>0)||S[0];const t=[];
for(let i=0;i<7;i++){const t0=process.hrtime.bigint();const I=E.buildInputs(ref,s.open,{});const O=E.dispatch(I,res,s.caps,s.policy,s.mode,1000);const A=E.account(I,res,s.caps,O);t.push(Number(process.hrtime.bigint()-t0)/1e6);
 if(i===0){let n=0,b=0;for(const X of [I,O,A])for(const k in X)if(ArrayBuffer.isView(X[k])){n++;b+=X[k].byteLength}console.log('typed series',n,'MB',(b/1048576).toFixed(1))}}
t.sort((a,b)=>a-b);console.log('ms per 10-year run: min',t[0].toFixed(0),'median',t[3].toFixed(0),'max',t[6].toFixed(0), 'plans in library', S.length);
