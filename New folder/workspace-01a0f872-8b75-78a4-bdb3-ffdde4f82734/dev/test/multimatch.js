'use strict';
var fs=require('fs'), path=require('path'), vm=require('vm');
function load(f){ vm.runInThisContext(fs.readFileSync(path.join(__dirname,'..','js',f),'utf8'),{filename:f}); }
load('core.js'); load('sim.js'); load('ai.js'); load('match.js');
var AF=globalThis.AF;
var pairs=[[0,7],[3,4],[1,2],[5,6],[7,0],[4,3]];
var tot={g:0,s:0,sv:0,t:0,p:0,pok:0,f:0,c:0,shots:0};
for(var i=0;i<pairs.length;i++){
  var m=new AF.Match({homeId:pairs[i][0],awayId:pairs[i][1],userSide:-1,diffKey:'pro',lengthSec:240,attract:true});
  var tick=0;
  while(tick<60*320&&m.state!=='full'){ if(m.state==='half')m.startSecondHalf(); m.update(1/60,null); tick++; }
  var g=m.teams[0].goals+m.teams[1].goals;
  var s=m.teams[0].st.shots+m.teams[1].st.shots;
  var sv=m.teams[0].players[0].ms.saves+m.teams[1].players[0].ms.saves;
  var t=m.teams[0].st.tackles+m.teams[1].st.tackles;
  var p=m.teams[0].st.passes+m.teams[1].st.passes;
  var pok=m.teams[0].st.passesOk+m.teams[1].st.passesOk;
  var f=m.teams[0].st.fouls+m.teams[1].st.fouls;
  var c=m.teams[0].st.corners+m.teams[1].st.corners;
  console.log(pairs[i][0]+'v'+pairs[i][1]+' -> '+m.teams[0].goals+'-'+m.teams[1].goals+' | shots '+s+' (onT '+(m.teams[0].st.sot+m.teams[1].st.sot)+') saves '+sv+' tackles '+t+' pass% '+Math.round(pok/Math.max(1,p)*100)+' ('+pok+'/'+p+') fouls '+f+' corners '+c);
  tot.g+=g;tot.s+=s;tot.sv+=sv;tot.t+=t;tot.p+=p;tot.pok+=pok;tot.f+=f;tot.c+=c;
}
console.log('AVG: goals '+(tot.g/6).toFixed(1)+' shots '+(tot.s/6).toFixed(1)+' saves '+(tot.sv/6).toFixed(1)+' tackles '+(tot.t/6).toFixed(1)+' pass% '+Math.round(tot.pok/tot.p*100)+' fouls '+(tot.f/6).toFixed(1)+' corners '+(tot.c/6).toFixed(1));
