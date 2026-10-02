/* Headless simulation test: loads core/sim/ai/match without DOM and runs full matches. */
'use strict';
var fs=require('fs'), path=require('path'), vm=require('vm');

function load(f){
  var code=fs.readFileSync(path.join(__dirname,'..','js',f),'utf8');
  vm.runInThisContext(code,{filename:f});
}
load('core.js'); load('sim.js'); load('ai.js'); load('match.js');
var AF=globalThis.AF, u=AF.util;

function finiteMatch(m){
  var b=m.ball;
  if(!isFinite(b.p.x)||!isFinite(b.p.y)||!isFinite(b.p.z))return 'ball NaN';
  for(var ti=0;ti<2;ti++){var t=m.teams[ti];
    for(var i=0;i<t.players.length;i++){var p=t.players[i];
      if(!isFinite(p.pos.x)||!isFinite(p.pos.z))return 'player '+p.name+' NaN';
      if(Math.abs(p.pos.x)>58||Math.abs(p.pos.z)>40)return 'player '+p.name+' out of world: '+p.pos.x+','+p.pos.z;
      if(p.stamina<0||p.stamina>100.5)return 'stamina '+p.stamina;
    }
  }
  if(!isFinite(m.gameSec))return 'clock NaN';
  return null;
}

function runAttract(){
  var m=new AF.Match({homeId:3,awayId:4,userSide:-1,diffKey:'pro',lengthSec:240,attract:true});
  var steps=0, maxSteps=60*700, err=null;
  var actions={pass:0,shot:0,tackle:0,cross:0,through:0,goal:0,foul:0,save:0,corner:0,throwin:0,goalkick:0,freekick:0,penalty:0,halftime:0,fulltime:0};
  AF.bus.on('match',function(ev){
    if(ev.type==='goal')actions.goal++;
    else if(ev.type==='foul')actions.foul++;
    else if(ev.type==='save')actions.save++;
    else if(ev.type==='halftime')actions.halftime++;
    else if(ev.type==='fulltime')actions.fulltime++;
    else if(ev.type==='setpiece'){ if(actions[ev.sp]!==undefined)actions[ev.sp]++; }
    else if(ev.type==='kick')actions.pass++;
    else if(ev.type==='shot')actions.shot++;
    else if(ev.type==='tackle')actions.tackle++;
    else if(ev.type==='cross')actions.cross++;
  });
  while(steps<maxSteps&&m.state!=='full'){
    if(m.state==='half')m.startSecondHalf();
    m.update(1/60,null);
    err=finiteMatch(m);
    if(err){ console.log('FAIL attract at step',steps,'state',m.state,':',err); process.exit(1); }
    steps++;
  }
  var snap=m.snapshot();
  console.log('attract match done in',steps,'ticks. state=',m.state,'score=',snap.score.join('-'));
  console.log('  events:',JSON.stringify(actions));
  console.log('  poss=',snap.poss.join('%/ ')+'%',' shots=',m.teams[0].st.shots+'/'+m.teams[1].st.shots,' passes=',m.teams[0].st.passes+'/'+m.teams[1].st.passes,' saves=',m.teams[0].players[0].ms.saves+'/'+m.teams[1].players[0].ms.saves);
  var ok=m.state==='full'&&(actions.goal>0||actions.shot>=3)&&m.teams[0].st.passes>20&&m.teams[1].st.passes>20;
  if(!ok){ console.log('WARN: attract sim looks weak'); }
  return ok;
}

function runUser(){
  var m=new AF.Match({homeId:3,awayId:0,userSide:0,diffKey:'pro',lengthSec:240,
    userSpec:{name:'Test Player',pos:'ST',num:9,attrs:{pace:70,sho:66,pas:55,dri:64,def:42,phy:60}}});
  var steps=0, switched=0;
  AF.bus.on('match',function(ev){ if(ev.type==='switch')switched++; });
  var rng=u.mulberry32(42);
  while(steps<60*120&&m.state!=='full'){
    if(m.state==='half')m.startSecondHalf();
    // fake "user": run toward ball; pass sometimes, shoot near goal, sprint randomly
    var c=m.controlled;
    var intents=null;
    if(c){
      var b=m.ball;
      var dx=b.p.x-c.pos.x, dz=b.p.z-c.pos.z, dl=Math.sqrt(dx*dx+dz*dz)||1;
      var acts=[];
      var r=rng();
      if(b.owner===c){
        var gx=m.teams[0].dir*52.5;
        var dG=Math.sqrt(Math.pow(gx-c.pos.x,2)+c.pos.z*c.pos.z);
        if(dG<20&&r<0.2)acts.push({t:'shoot',power:0.6+0.4*r});
        else if(r<0.25)acts.push({t:'pass'});
        else if(r<0.3)acts.push({t:'through'});
      } else if(r<0.02){ acts.push({t:'switch'}); }
      intents={move:{x:dx/dl,z:dz/dl},sprint:r<0.4,charge:0,actions:acts};
    }
    m.update(1/60,intents);
    var err=finiteMatch(m);
    if(err){ console.log('FAIL user at step',steps,'state',m.state,':',err); process.exit(1); }
    steps++;
  }
  var user=m.findUserPlayer();
  console.log('user match done. score=',m.teams[0].goals+'-'+m.teams[1].goals,' user stats=',JSON.stringify(user.ms),' rating=',m.playerRating(user),' switches=',switched);
  return true;
}

var t0=Date.now();
var ok1=runAttract();
var ok2=runUser();
console.log('elapsed ms:',Date.now()-t0);
console.log(ok1&&ok2?'ALL OK':'ISSUES (see warnings)');
