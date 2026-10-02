/* ============================================================
   AI FOOTBALL — input_hud.js : controls + in-match HUD
   ============================================================ */
(function(){
'use strict';
var G=(typeof globalThis!=='undefined')?globalThis:{};
var AF=G.AF=G.AF||{};
var u=AF.util;

/* ================= INPUT ================= */
var Input=AF.Input={
  keys:{}, actions:[], charge:0, charging:false,
  mouse:{x:0,y:0,dx:0,dy:0,drag:false,rdown:false,btn:0}, wheel:0, _everKeyDown:false,
  _attached:false
};
Input.attach=function(canvas){
  if(this._attached)return;
  this._attached=true;
  var self=this;
  this.canvas=canvas;
  var gameKeys={KeyW:1,KeyA:1,KeyS:1,KeyD:1,ArrowUp:1,ArrowDown:1,ArrowLeft:1,ArrowRight:1,Space:1,ShiftLeft:1,ShiftRight:1,KeyE:1,KeyQ:1,KeyR:1,KeyF:1,KeyC:1};
  window.addEventListener('keydown',function(e){
    if(gameKeys[e.code])e.preventDefault();
    if(e.repeat){self.keys[e.code]=true;return;}
    self.keys[e.code]=true;
    self._everKeyDown=true;
    switch(e.code){
      case 'Space': self.charging=true; self.charge=0; break;
      case 'KeyE': self.actions.push({t:'pass'}); break;
      case 'KeyQ': self.actions.push({t:'through'}); break;
      case 'KeyR': self.actions.push({t:'cross'}); break;
      case 'KeyF': self.actions.push({t:'switch'}); break;
      case 'KeyC': self.actions.push({t:'tackle'}); break;
      case 'KeyP': case 'Escape': AF.bus.emit('ui',{type:'pausekey'}); break;
      case 'KeyV': AF.bus.emit('ui',{type:'camkey'}); break;
      case 'KeyH': AF.bus.emit('ui',{type:'hintkey'}); break;
      case 'KeyM': AF.bus.emit('ui',{type:'mutekey'}); break;
    }
  },true);
  window.addEventListener('keyup',function(e){
    self.keys[e.code]=false;
    if(e.code==='Space'&&self.charging){
      self.charging=false;
      self.actions.push({t:'shoot',power:u.clamp(self.charge/0.75,0.22,1)});
      self.charge=0;
    }
  },true);
  window.addEventListener('blur',function(){ if(document.visibilityState==='hidden'){ self.keys={}; self.charging=false; AF.bus.emit('ui',{type:'blur'}); } });
  canvas.addEventListener('mousedown',function(e){ if(e.button===2){ self.mouse.rdown=true; e.preventDefault(); } });
  window.addEventListener('mouseup',function(e){ if(e.button===2)self.mouse.rdown=false; });
  document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='hidden'){ self.keys={}; self.charging=false; AF.bus.emit('ui',{type:'blur'}); } });
  canvas.addEventListener('mousedown',function(e){
    self.mouse.drag=true; self.mouse.btn=e.button;
    try{ window.focus(); }catch(e2){}
    if(AF.audio){AF.audio.init();AF.audio.resume();}
  });
  window.addEventListener('mouseup',function(){ self.mouse.drag=false; });
  window.addEventListener('mousemove',function(e){
    self.mouse.dx+=e.movementX||0; self.mouse.dy+=e.movementY||0;
    self.mouse.x=e.clientX/window.innerWidth*2-1;
    self.mouse.y=e.clientY/window.innerHeight*2-1;
  });
  window.addEventListener('wheel',function(e){ self.wheel+=e.deltaY; e.preventDefault(); },{passive:false});
  canvas.addEventListener('contextmenu',function(e){e.preventDefault();});
};
Input.buildMove=function(camYaw){
  var k=this.keys;
  var iz=(k.KeyW||k.ArrowUp?1:0)-(k.KeyS||k.ArrowDown?1:0);
  var ix=(k.KeyD||k.ArrowRight?1:0)-(k.KeyA||k.ArrowLeft?1:0);
  if(!iz&&!ix&&this.mouse.rdown){ // hold RIGHT mouse button: move toward the pointer
    var mx=this.mouse.x, my=this.mouse.y;
    if(Math.abs(mx)>0.14||Math.abs(my)>0.14){ ix=mx; iz=-my; }
  }
  if(!iz&&!ix)return null;
  var fx=Math.sin(camYaw), fz=Math.cos(camYaw);
  var rx=-Math.cos(camYaw), rz=Math.sin(camYaw);
  var mx=fx*iz+rx*ix, mz=fz*iz+rz*ix;
  var l=Math.sqrt(mx*mx+mz*mz);
  return {x:mx/l,z:mz/l};
};
Input.consumeActions=function(){ var a=this.actions; this.actions=[]; return a; };
Input.endFrame=function(){ this.mouse.dx=0; this.mouse.dy=0; this.wheel=0; };

/* ================= HUD ================= */
var HUD=AF.HUD={root:null,tickerToasts:[],promptOn:false,hintOn:true,radarCtx:null};

HUD.init=function(){
  var root=this.root=document.getElementById('hud');
  root.innerHTML=
    '<div class="hud-score" id="hud-score"></div>'+
    '<div class="hud-ticker" id="hud-ticker"></div>'+
    '<div class="hud-card" id="hud-card" style="display:none"></div>'+
    '<div class="hud-radar" id="hud-radar"><canvas id="radar-cv" width="220" height="146"></canvas></div>'+
    '<div class="hud-toast" id="hud-toast"></div>'+
    '<div class="hud-banner" id="hud-banner"><h1 id="hud-banner-h"></h1><p id="hud-banner-p"></p></div>'+
    '<div class="hud-prompt" id="hud-prompt"></div>'+
    '<div class="hud-hint" id="hud-hint"></div>'+
    '<div class="hud-fatal" id="hud-fatal"></div>';
  this.radarCtx=document.getElementById('radar-cv').getContext('2d');
  this.setHint();
  window.addEventListener('error',function(e){ HUD.fatal(e.message); });
};
HUD.setHint=function(){
  var el=document.getElementById('hud-hint'); if(!el)return;
  el.style.display=this.hintOn?'block':'none';
  el.innerHTML=
    '<div><b>WASD</b> Move</div>'+
    '<div><b>SHIFT</b> Sprint</div>'+
    '<div><b>SPACE</b> Shoot (hold = power)</div>'+
    '<div><b>E</b> Pass</div>'+
    '<div><b>Q</b> Through ball</div>'+
    '<div><b>R</b> Cross</div>'+
    '<div><b>C</b> Tackle</div>'+
    '<div><b>F</b> Switch player</div>'+
    '<div><b>MOUSE</b> Camera (drag / edges)</div>'+
    '<div><b>V</b> Camera mode &nbsp;<b>P</b> Pause &nbsp;<b>H</b> Hide</div>';
};
HUD.bindMatch=function(match){
  this.match=match;
  document.getElementById('hud-card').style.display=match.userSide>=0?'block':'none';
  document.getElementById('hud-radar').style.display=AF.App.settings.radar?'block':'none';
  document.getElementById('hud-ticker').innerHTML='';
  this.hideBanner(); this.hidePrompt();
};
HUD.teamChip=function(team){
  return '<span class="chip" style="background:'+team.kit.shirt+'"></span>';
};
HUD.updateScore=function(match){
  var el=document.getElementById('hud-score');
  if(!match){el.innerHTML='';return;}
  var h=match.teams[0],a=match.teams[1];
  var min=Math.floor(match.displaySec()/60);
  el.innerHTML=
    HUD.teamChip(h)+'<span class="tname">'+h.club.short+'</span>'+
    '<span class="score">'+h.goals+' : '+a.goals+'</span>'+
    '<span class="tname">'+a.club.short+'</span>'+HUD.teamChip(a)+
    '<span class="hud-clock">'+u.fmtClock(match.displaySec())+'</span>'+
    '<span class="hud-half">'+(match.half===1?'1ST':'2ND')+' · '+min+'\u2032</span>';
};
HUD.updateCard=function(match){
  var el=document.getElementById('hud-card');
  var c=match.controlled;
  if(!c||match.userSide<0){el.style.display='none';return;}
  el.style.display='block';
  var st=Math.round(c.stamina);
  var pow=AF.App&&AF.Input.charging?'block':'none';
  el.innerHTML=
    '<div><span class="pname">'+u.esc(c.name)+'</span><span class="ppos">#'+c.num+' '+c.role+'</span></div>'+
    '<div class="bar stam"><i style="width:'+st+'%"></i></div>'+
    '<div class="bar powr hud-powr" style="display:'+pow+'"><i style="width:'+Math.round((AF.Input.charge/0.75)*100)+'%"></i></div>';
};
HUD.commentary=function(text,cls){
  var t=document.getElementById('hud-ticker');
  var d=document.createElement('div');
  d.textContent=text;
  t.appendChild(d);
  while(t.children.length>3)t.removeChild(t.firstChild);
  setTimeout(function(){ d.style.transition='opacity 1s'; d.style.opacity='0'; setTimeout(function(){ if(d.parentNode)d.parentNode.removeChild(d); },1100); },5200);
};
HUD.toast=function(text,cls){
  var stack=document.getElementById('hud-toast');
  var d=document.createElement('div');
  d.className='toast '+(cls||'');
  d.textContent=text;
  stack.appendChild(d);
  setTimeout(function(){ d.style.transition='opacity 0.5s'; d.style.opacity='0'; setTimeout(function(){ if(d.parentNode)d.parentNode.removeChild(d); },550); },2600);
  while(stack.children.length>4)stack.removeChild(stack.firstChild);
};
HUD.banner=function(big,small,dur){
  var b=document.getElementById('hud-banner');
  document.getElementById('hud-banner-h').textContent=big;
  document.getElementById('hud-banner-p').textContent=small||'';
  b.style.display='block';
  if(this._bt)clearTimeout(this._bt);
  if(dur!==0)this._bt=setTimeout(function(){ HUD.hideBanner(); },dur||2600);
};
HUD.hideBanner=function(){ var b=document.getElementById('hud-banner'); if(b)b.style.display='none'; };
HUD.hidePrompt=function(){ HUD.prompt(null); };
HUD.prompt=function(text){
  var p=document.getElementById('hud-prompt');
  if(!text){p.style.display='none';this.promptOn=false;return;}
  p.innerHTML=text; p.style.display='block'; this.promptOn=true;
};
HUD.fatal=function(msg){
  var f=document.getElementById('hud-fatal');
  if(!f)return;
  f.style.display='block';
  f.textContent='Error: '+msg;
};
HUD.lastMsg={};

/* event → HUD + commentary */
HUD.onMatchEvent=function(ev){
  var m=ev.match; if(!m)return;
  var last=m.goals[m.goals.length-1];
  switch(ev.type){
    case 'goal':
      HUD.banner('GOAL!',(ev.own?'OWN GOAL — ':'')+(ev.scorer?ev.scorer.name.toUpperCase():'')+'  '+m.teams[0].club.short+' '+m.teams[0].goals+'-'+m.teams[1].goals+' '+m.teams[1].club.short);
      HUD.commentary('\u26BD GOOOAL! '+(ev.own?'Own goal... ':'')+(ev.scorer?ev.scorer.name:'')+' — '+m.teams[0].club.short+' '+m.teams[0].goals+'-'+m.teams[1].goals+' '+m.teams[1].club.short,'goal');
      HUD.toast('GOAL — '+(ev.scorer?ev.scorer.name:''),'goal');
      break;
    case 'save':
      HUD.commentary((ev.big?'Huge save! ':'Saved. ')+ev.player.name+' keeps it out');
      break;
    case 'foul':
      HUD.toast('FOUL — '+ev.player.name, ev.card?'yellow':'');
      if(ev.card)HUD.toast('YELLOW CARD — '+ev.player.name,'yellow');
      HUD.commentary('Foul by '+ev.player.name+' on '+ev.victim.name+(ev.card?' — booked!':''));
      break;
    case 'shot':
      if(ev.dist<25)HUD.commentary(ev.player.name+' lets fly from '+Math.round(ev.dist)+'m!');
      break;
    case 'header':
      if(ev.shot)HUD.commentary(ev.player.name+' rises for the header!');
      break;
    case 'tackle':
      if(ev.good)HUD.commentary('Crunching tackle by '+ev.player.name);
      break;
    case 'setpiece':
      if(ev.user&&ev.taker){
        var labels={kickoff:'KICK OFF — E: pass (auto in 3s)',corner:'CORNER — R: cross (auto in 3s)',throwin:'THROW-IN — auto in 3s, or E/Q now',goalkick:'',freekick:'FREE KICK — SPACE/E/R (auto in 3s)',penalty:'PENALTY! Aim A/D, hold SPACE (auto in 6s)'};
        if(labels[ev.sp])HUD.prompt('<span class="kbd">'+labels[ev.sp]+'</span>');
      } else if(ev.sp==='penalty'&&(ev.team===m.userSide)){ HUD.prompt('PENALTY against you — defend your line!'); }
      break;
    case 'resume': case 'inplay': HUD.prompt(null); break;
    case 'youball':
      HUD.prompt('<span class="kbd">YOU HAVE IT</span> E pass &middot; Q through &middot; SPACE shoot (hold) &middot; R cross', true);
      if(HUD._ybT)clearTimeout(HUD._ybT);
      HUD._ybT=setTimeout(function(){ HUD.prompt(null); },2200);
      break;
    case 'ready': if(!ev.user)HUD.prompt(null); break;
    case 'halftime': HUD.banner('HALF TIME',m.teams[0].club.short+' '+m.teams[0].goals+' - '+m.teams[1].goals+' '+m.teams[1].club.short,0); break;
    case 'fulltime': HUD.banner('FULL TIME',m.teams[0].club.short+' '+m.teams[0].goals+' - '+m.teams[1].goals+' '+m.teams[1].club.short,0); break;
  }
};
HUD.tick=function(match,dt){
  if(!match)return;
  var App2=window.AF&&window.AF.App?window.AF.App:null;
  if(App2&&App2.playing&&match.userSide>=0&&!AF.Input._everKeyDown&&match.t>4){
    this._nkT=(this._nkT||0)+dt;
    if(this._nkT>6){
      this._nkT=-14; // re-remind after a while
      HUD.toast('NO KEYBOARD DETECTED - click the pitch once, or HOLD RIGHT MOUSE to run','yellow');
    }
  }
  this.updateScore(match);
  this.updateCard(match);
  if(AF.App.settings.radar)this.drawRadar(match);
};
HUD.drawRadar=function(match){
  var ctx=this.radarCtx; if(!ctx)return;
  var W=220,H=146;
  var F=AF.CFG.FIELD;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#123c17'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=1;
  ctx.strokeRect(6.5,6.5,W-13,H-13);
  ctx.beginPath(); ctx.moveTo(W/2,6.5); ctx.lineTo(W/2,H-6.5); ctx.stroke();
  ctx.beginPath(); ctx.arc(W/2,H/2,12,0,Math.PI*2); ctx.stroke();
  var px=function(x){ return 6.5+(x/F.L+0.5)*(W-13); };
  var pz=function(z){ return 6.5+(z/F.W+0.5)*(H-13); };
  for(var ti=0;ti<2;ti++){
    var team=match.teams[ti];
    ctx.fillStyle=team.kit.shirt;
    for(var i=0;i<team.players.length;i++){
      var p=team.players[i];
      ctx.beginPath(); ctx.arc(px(p.pos.x),pz(p.pos.z),2.6,0,Math.PI*2); ctx.fill();
    }
  }
  var c=match.controlled;
  if(c){
    ctx.strokeStyle='#ffffff'; ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.arc(px(c.pos.x),pz(c.pos.z),4.6,0,Math.PI*2); ctx.stroke();
  }
  var b=match.ball;
  ctx.fillStyle='#ffffff';
  ctx.beginPath(); ctx.arc(px(b.p.x),pz(b.p.z),2.4,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#222'; ctx.lineWidth=0.8; ctx.stroke();
};
})();
