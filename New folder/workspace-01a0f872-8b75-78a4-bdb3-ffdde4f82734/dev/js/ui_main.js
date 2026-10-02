/* ============================================================
   AI FOOTBALL — ui_main.js : screens + application loop
   ============================================================ */
(function(){
'use strict';
var G=(typeof globalThis!=='undefined')?globalThis:{};
var AF=G.AF=G.AF||{};
var u=AF.util;
var career=AF.career;

/* ================= APP ================= */
var App=AF.App={
  settings:AF.loadSettings(),
  mode:'boot', match:null, playing:false,
  renderer:null, rendererOK:false,
  camYaw:0, camPitch:0.36, camDist:8.8, camMode:'follow', camIdle:9,
  matchContext:null, lastSnapshot:null,
  _attractTimer:0, _halftimer:0
};

App.boot=function(){
  var splash=document.getElementById('bootsplash');
  var bootmsg=document.getElementById('bootmsg');
  window.addEventListener('error',function(e){
    if(splash&&splash.style.display!=='none'&&bootmsg){
      bootmsg.style.color='#ff7b88';
      bootmsg.textContent='STARTUP ERROR: '+(e.message||'unknown')+' — if this persists, download the file and open it directly in Chrome/Firefox/Edge.';
    }
  });
  AF.__stage='webgl-probe';
  try{
    var probe=document.createElement('canvas');
    var gl2=null;
    try{ gl2=probe.getContext('webgl')||probe.getContext('experimental-webgl'); }catch(e2){ gl2=null; }
    if(!gl2)throw new Error('WebGL is not available in this browser or preview. Download the HTML file and open it directly in Chrome, Firefox or Edge.');
  }catch(e){
    if(bootmsg){bootmsg.style.color='#ff7b88';bootmsg.textContent=e.message;}
    return;
  }
  var cv=document.getElementById('gl');
  AF.HUD.init();
  AF.__stage='renderer';
  try{
    App.renderer=new AF.Renderer(cv);
    App.renderer.init(App.settings.quality==='lite'?'lite':'high');
    if(App.settings.quality==='lite')App.perfMode=true;
    App.rendererOK=true;
  }catch(e){
    App.rendererOK=false;
    console.error(e);
    AF.HUD.fatal('3D init failed: '+e.message);
    if(bootmsg){bootmsg.style.color='#ff7b88';bootmsg.textContent='GRAPHICS INIT FAILED: '+e.message;}
  }
  AF.Input.attach(cv);
  // bus wiring
  AF.bus.on('match',function(ev){
    AF.HUD.onMatchEvent(ev);
    var a=AF.audio;
    switch(ev.type){
      case 'kick': a.kick(u.clamp(ev.power,0.1,1)); break;
      case 'goal': a.cheer(true); a.horn(); break;
      case 'save': if(ev.big)a.cheer(false); break;
      case 'whistle': a.whistle(ev.kind); break;
      case 'setpiece': if(ev.sp==='kickoff')a.whistle('single'); break;
      case 'halftime': case 'fulltime': a.whistle(ev.type==='halftime'?'half':'full'); break;
      case 'switch': if(App.renderer)App.renderer.snapCamera(); break;
    }
  });
  AF.bus.on('ui',function(ev){
    switch(ev.type){
      case 'pausekey': if(App.playing){ App.paused?App.resume():App.pause(); } break;
      case 'camkey': App.camMode=App.camMode==='follow'?'tele':'follow'; App.settings.camMode=App.camMode; AF.HUD.toast('CAMERA: '+(App.camMode==='follow'?'FOLLOW':'TELECAST')); break;
      case 'hintkey': AF.HUD.hintOn=!AF.HUD.hintOn; AF.HUD.setHint(); break;
      case 'mutekey': App.settings.sound=!App.settings.sound; AF.saveSettings(App.settings); AF.audio.setEnabled(App.settings.sound); AF.HUD.toast(App.settings.sound?'SOUND ON':'SOUND OFF'); break;
      case 'blur': if(App.playing&&!App.paused&&document.visibilityState==='hidden')App.pause(); break;
    }
  });
  AF.__stage='ui';
  UI.init();
  // hide splash on first interaction too (covers RAF-throttled preview panes)
  var hideOnce=function(){
    var sp=document.getElementById('bootsplash');
    if(sp)sp.style.display='none';
  };
  window.addEventListener('pointerdown',hideOnce,{once:true});
  window.addEventListener('keydown',hideOnce,{once:true});
  setTimeout(function(){
    var sp3=document.getElementById('bootsplash');
    if(sp3&&(App._frames||0)<2)sp3.style.display='none';
  },6000);
  App.camMode=App.settings.camMode||'follow';
  AF.audio.setEnabled(App.settings.sound);
  UI.show('main');
  App.mode='menu';
  if(App.rendererOK)App.startAttract();
  AF.__booted=true;
  App.lastRafAt=Date.now();
  requestAnimationFrame(App.loop);
  // RAF health watchdog: if frame delivery stalls at ANY time (throttled preview
  // pane, GPU policy, backgrounded tab), a fallback interval keeps the match alive
  // until real frames resume, then hands back automatically.
  setInterval(function(){
    var since=Date.now()-(App.lastRafAt||0);
    if(!App.paused&&since>900&&!App._fallbackIv){
      var last2=Date.now();
      App._fallbackIv=setInterval(function(){
        var n2=Date.now(); var d2=Math.min(0.05,(n2-last2)/1000); last2=n2;
        App.loopFallback(d2);
      },33);
    } else if(App._fallbackIv&&since<400){
      clearInterval(App._fallbackIv); App._fallbackIv=null;
    }
  },600);
};
App.loopFallback=function(dt){
  // drives frames without requestAnimationFrame (for throttled preview panes)
  if(Date.now()-(App.lastRafAt||0)<400)return; // real frames are flowing again
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(App.loop);
  var m=App.match;
  if(App.rendererOK&&m){
    // fixed-step simulation (catch up to real time)
    App._fbAcc=(App._fbAcc||0)+dt;
    var simmed=0;
    while(App._fbAcc>=1/60&&simmed<8){
      var isUser=App.playing&&!App.paused&&m.userSide>=0;
      if(isUser&&m.controlled){
        if(AF.Input.charging)AF.Input.charge+=1/60;
        m.update(1/60,{
          move:AF.Input.buildMove(App.camYaw),
          sprint:!!(AF.Input.keys.ShiftLeft||AF.Input.keys.ShiftRight),
          charge:AF.Input.charging?AF.Input.charge:0,
          actions:AF.Input.consumeActions()
        });
      } else {
        AF.Input.consumeActions();
        m.update(1/60,null);
      }
      App._fbAcc-=1/60; simmed++;
      if(intentsGuard())break;
    }
    function intentsGuard(){
      if(App.playing&&m.state==='half'&&!App._halfHandled){ App._halfHandled=true; UI.showHalf(m.snapshot()); return true; }
      if(App.playing&&m.state==='full'&&!App._fullHandled){ App._fullHandled=true; App.onFullTime(); return true; }
      return false;
    }
    if(App._fbAcc>0.4)App._fbAcc=0;
    if(!App.playing){
      if(m.state==='half'){ App._halftimer+=dt; if(App._halftimer>1.6){ m.startSecondHalf(); App._halftimer=0; } }
      else if(m.state==='full'){ App._attractTimer+=dt; if(App._attractTimer>4){ App.startAttract(); App._attractTimer=0; } }
    }
    App.updateCameraControl(dt);
    // adaptive rendering: if a render pass is expensive, render every other tick
    var doRender=true;
    if(App._renderSlow){ App._fbTick=(App._fbTick||0)+1; doRender=(App._fbTick%2===0); }
    if(doRender){
      var st;
      if(App.playing){
        var c=m.controlled;
        var zoom=1;
        if(m.userSide>=0){
          var bb=m.ball;
          var own=bb.owner?bb.owner.team:(bb.lastTouchTeam===m.userSide?m.userSide:-1);
          if(own===m.userSide)zoom=1.13;
        }
        st={mode:App.camMode==='tele'?'tele':'follow',target:c?c.pos:m.ball.p,ball:m.ball.p,camYaw:App.camYaw,camPitch:App.camPitch,dist:App.camDist,zoom:zoom};
      } else st={mode:'menu'};
      var t0=Date.now();
      App.renderer.sync(dt);
      App.renderer.updateCamera(dt,st);
      App.renderer.render();
      var cost=Date.now()-t0;
      App._renderSlow=cost>26;
      App._frames=(App._frames||0)+1;
      if(App._frames===2){
        var sp=document.getElementById('bootsplash');
        if(sp)sp.style.display='none';
      }
    }
    AF.HUD.tick(m,dt);
    AF.audio.update(dt,m.excite||0);
    if(App.settings.quality==='auto'&&!App._perfChecked){
      App._perfN=(App._perfN||0)+1;
      if(!App._perfT0)App._perfT0=Date.now()/1000;
      var nw=Date.now()/1000;
      if(nw-App._perfT0>=5){
        App._perfChecked=true;
        if(App._perfN/(nw-App._perfT0)<15){
          App.perfMode=true;
          App.renderer.setPerfMode(true);
          AF.HUD.toast('PERFORMANCE MODE ON');
        }
      }
    }
  }
  AF.Input.endFrame();
};

App.saveSettings=function(){
  AF.saveSettings(App.settings);
  AF.audio.setEnabled(App.settings.sound);
  if(App.renderer&&App.rendererOK)App.renderer.setQuality(App.settings.quality);
  var r=document.getElementById('hud-radar'); if(r)r.style.display=App.settings.radar?'block':'none';
};

/* ----- attract match behind menus ----- */
App.startAttract=function(){
  if(!App.rendererOK)return;
  var a=u.ri(0,7), b=(a+u.ri(1,7))%8;
  App.playing=false;
  App.match=new AF.Match({homeId:a,awayId:b,userSide:-1,diffKey:'pro',lengthSec:420,attract:true});
  App.renderer.buildMatch(App.match);
  App.matchContext=null;
};

/* ----- real match ----- */
App.startRealMatch=function(opts){
  App.matchContext=opts;
  App.match=new AF.Match({
    homeId:opts.homeId, awayId:opts.awayId,
    userSide:opts.userSide, userSpec:opts.userSpec||null,
    diffKey:opts.diffKey, lengthSec:opts.lengthSec,
    autoSwitch:App.settings.autoswitch, salt:opts.salt||0
  });
  App.playing=true; App.paused=false;
  App._fullHandled=false; App._halfHandled=false; App._acc=0;
  if(App.rendererOK)App.renderer.buildMatch(App.match);
  AF.HUD.bindMatch(App.match);
  AF.HUD.hideBanner();
  UI.show(null);
  App.camSnap();
};
App.pause=function(){
  if(!App.playing)return;
  App.paused=true;
  if(App.match)App.match.paused=true;
  UI.show('pause');
};
App.resume=function(){
  App.paused=false;
  if(App.match)App.match.paused=false;
  UI.show(null);
};
App.quitMatch=function(){
  App.playing=false; App.paused=false;
  App.startAttract();
  UI.show(career.data?'career':'main');
};
App.camSnap=function(){ if(App.renderer)App.renderer.snapCamera(); };

/* ----- main loop ----- */
App.loop=function(t){
  App.lastRafAt=Date.now();
  requestAnimationFrame(App.loop);
  var now=t/1000;
  if(!App._last)App._last=now;
  var rawDt=u.clamp(now-App._last,0.001,1.0);   // real elapsed (for simulation pace)
  var dt=u.clamp(rawDt,0.001,0.06);             // smoothed (for cameras/fx)
  App._last=now;
  // auto performance: wall-clock based check — a slow pane renders few frames,
  // so count frames over time instead of averaging clamped deltas
  if(App.settings.quality==='auto'&&!App._perfChecked){
    App._perfN=(App._perfN||0)+1;
    if(!App._perfT0)App._perfT0=now;
    if(now-App._perfT0>=5){
      App._perfChecked=true;
      var fps=App._perfN/(now-App._perfT0);
      if(fps<22){
        App.perfMode=true;
        if(App.rendererOK)App.renderer.setPerfMode(true);
        AF.HUD.toast('PERFORMANCE MODE ON');
      }
    }
  }
  var m=App.match;
  if(m){
    // attract-mode bookkeeping
    if(!App.playing){
      if(m.state==='half'){ App._halftimer+=dt; if(App._halftimer>1.6){ m.startSecondHalf(); App._halftimer=0; } }
      else if(m.state==='full'){ App._attractTimer+=dt; if(App._attractTimer>4){ App.startAttract(); App._attractTimer=0; } }
    }
    // fixed-step sim
    var isUser=App.playing&&!App.paused&&m.userSide>=0;
    var intents=null;
    if(isUser&&m.controlled&&m.state!=='half'&&m.state!=='full'){
      if(AF.Input.charging)AF.Input.charge+=dt;
      intents={
        move:AF.Input.buildMove(App.camYaw),
        sprint:!!(AF.Input.keys.ShiftLeft||AF.Input.keys.ShiftRight),
        charge:AF.Input.charging?AF.Input.charge:0,
        actions:AF.Input.consumeActions()
      };
    } else {
      AF.Input.consumeActions();
      if(AF.Input.charging&&!isUser){AF.Input.charging=false;}
    }
    var acc=App._acc=(App._acc||0)+rawDt;
    var steps=0;
    while(acc>=1/60&&steps<24){
      if(!App.paused){
        if(App.playing||m.attract){
          if(intents)intents.move=AF.Input.buildMove(App.camYaw); // sample keys every step: zero input latency
          m.update(1/60,intents);
        }
      }
      acc-=1/60; steps++;
      if(intents&&intents.actions)intents.actions=[];
      if(m.state==='full'&&App.playing&&!App._fullHandled){ App._fullHandled=true; App.onFullTime(); }
      if(m.state==='half'&&App.playing&&!App._halfHandled){ App._halfHandled=true; App.onHalfTime(); }
      if(!App.playing&&(m.state==='half'||m.state==='full'))break;
    }
    if(acc>0.35)acc=0.02; // drop unsustainable backlog: stay live instead of slow-motion
    App._acc=steps===24?acc:Math.min(acc,0.05);
    // camera control
    App.updateCameraControl(dt);
    var st;
    if(App.playing){
      var c=m.controlled;
      var tgt=c?c.pos:m.ball.p;
      var zoom=1;
      if(m.userSide>=0){
        var b=m.ball;
        var own=b.owner?b.owner.team:(b.lastTouchTeam===m.userSide?m.userSide:-1);
        if(own===m.userSide)zoom=1.13;
      }
      st={mode:App.camMode==='tele'?'tele':'follow',target:tgt,ball:m.ball.p,camYaw:App.camYaw,camPitch:App.camPitch,dist:App.camDist,zoom:zoom};
    } else {
      st={mode:'menu'};
    }
    if(App.rendererOK){
      App.renderer.sync(dt);
      App.renderer.updateCamera(dt,st);
      App.renderer.render();
      App._frames=(App._frames||0)+1;
      if(App._frames===2){
        var sp2=document.getElementById('bootsplash');
        if(sp2)sp2.style.display='none';
      }
    }
    AF.HUD.tick(m,dt);
    AF.audio.update(dt,m.excite||0);
  }
  AF.Input.endFrame();
};
App.updateCameraControl=function(dt){
  var mo=AF.Input.mouse;
  if(App.playing){
    // is the player giving movement input right now?
    var moving=false;
    if(App.match&&App.match.userSide>=0)moving=!!AF.Input.buildMove(App.camYaw);
    if(mo.drag){
      App.camYaw-=mo.dx*0.005;
      App.camPitch=u.clamp(App.camPitch-mo.dy*0.003,0.16,0.85);
      App.camIdle=0;
    } else {
      App.camIdle+=dt;
      if(Math.abs(mo.x)>0.85)App.camYaw-=Math.sign(mo.x)*dt*1.15;
    }
    if(AF.Input.wheel)App.camDist=u.clamp(App.camDist+AF.Input.wheel*0.008,6,14.5);
    // IMPORTANT: while the user is running, the camera NEVER auto-turns —
    // WASD directions must stay constant under your fingers.
    if(!moving&&App.camIdle>1.6&&App.match&&App.match.controlled){
      var c=App.match.controlled, b=App.match.ball.p;
      var dx2=b.x-c.pos.x, dz2=b.z-c.pos.z;
      if(Math.sqrt(dx2*dx2+dz2*dz2)>1.2){
        var targetYaw=Math.atan2(dx2,dz2);
        App.camYaw=u.angDamp(App.camYaw,targetYaw,1.1,dt);
      } else if(App.match.userSide>=0){
        // standing still with the ball: gently face the attack goal
        var gdir=App.match.teams[App.match.userSide].dir;
        var goalYaw=Math.atan2(gdir*40-c.pos.x,0-c.pos.z);
        App.camYaw=u.angDamp(App.camYaw,goalYaw,0.35,dt);
      }
    }
  } else {
    App.camYaw+=dt*0.05;
  }
};
App.onHalfTime=function(){
  var s=App.match.snapshot();
  UI.showHalf(s);
};
App.onFullTime=function(){
  var m=App.match;
  var s=m.snapshot();
  App.lastSnapshot=s;
  var extra=null;
  if(App.matchContext&&App.matchContext.context==='career'&&career.data){
    var user=m.findUserPlayer();
    var myHome=App.matchContext.homeId===career.data.clubId;
    var gf=myHome?s.score[0]:s.score[1];
    var ga=myHome?s.score[1]:s.score[0];
    var res=career.applyMatch({gf:gf,ga:ga,goals:user.ms.goals,assists:user.ms.assists,rating:m.playerRating(user)});
    career.save();
    extra=res;
  }
  setTimeout(function(){
    if(App.playing)UI.showFull(s,extra);
  },1400);
};

/* ================= UI ================= */
var UI=AF.UI={current:null,_prev:null};
UI.$=function(id){ return document.getElementById(id); };
UI.init=function(){
  var root=document.getElementById('screens');
  root.innerHTML=
    '<div class="screen" id="s-main"><div class="panel narrow center">'+
      '<h1 class="title">AI FOOTBALL<br><span>RISE TO GLORY</span></h1>'+
      '<div class="subtitle">INTELLIGENT · DYNAMIC · ALIVE</div>'+
      '<div class="menucol">'+
        '<button class="btn" id="b-new">New Career</button>'+
        '<button class="btn" id="b-continue">Continue Career</button>'+
        '<button class="btn ghost" id="b-quick">Quick Match</button>'+
        '<button class="btn ghost" id="b-howto">How To Play</button>'+
        '<button class="btn ghost" id="b-settings">Settings</button>'+
      '</div>'+
      '<div class="small" style="margin-top:18px">11v11 · situational football AI · career mode<br>Click the pitch once to enable sound. Best on desktop.</div>'+
    '</div></div>'+

    '<div class="screen" id="s-new"><div class="panel narrow">'+
      '<h2 class="sect">CREATE YOUR PLAYER</h2>'+
      '<div style="margin:10px 0 4px" class="small">PLAYER NAME</div>'+
      '<input type="text" id="in-name" maxlength="22" value="Abebe Bekele">'+
      '<div style="margin:14px 0 4px" class="small">POSITION</div><div class="optrow" id="opt-pos"></div>'+
      '<div style="margin:14px 0 4px" class="small">DIFFICULTY (opponent AI)</div><div class="optrow" id="opt-diff"></div>'+
      '<div class="small" style="margin:12px 0">You start at <b style="color:#fff">Addis United</b>, the youngest squad in the league. Perform well to earn moves to bigger clubs.</div>'+
      '<button class="btn" id="b-startcareer">Begin Rise To Glory</button> <button class="btn ghost" id="b-newback">Back</button>'+
    '</div></div>'+

    '<div class="screen" id="s-quick"><div class="panel narrow">'+
      '<h2 class="sect">QUICK MATCH</h2>'+
      '<div style="margin:8px 0 4px" class="small">YOUR TEAM (HOME)</div><div class="optrow" id="q-home"></div>'+
      '<div style="margin:12px 0 4px" class="small">OPPONENT</div><div class="optrow" id="q-away"></div>'+
      '<div style="margin:12px 0 4px" class="small">DIFFICULTY</div><div class="optrow" id="q-diff"></div>'+
      '<div style="margin:12px 0 4px" class="small">YOUR POSITION</div><div class="optrow" id="q-pos"></div>'+
      '<button class="btn" id="b-startquick">Kick Off</button> <button class="btn ghost" id="b-quickback">Back</button>'+
    '</div></div>'+

    '<div class="screen" id="s-career"><div class="panel wide">'+
      '<div class="rowflex" style="justify-content:space-between;margin-bottom:6px">'+
        '<h1 class="title" style="font-size:30px">CAREER <span id="career-season"></span></h1>'+
        '<div id="career-clubinfo" class="center"></div>'+
      '</div>'+
      '<div class="grid3" id="career-grid"></div>'+
      '<div class="rowflex" style="margin-top:16px">'+
        '<button class="btn" id="b-playmatch">Play Next Match</button>'+
        '<button class="btn ghost" id="b-simmatch">Sim Match</button>'+
        '<button class="btn ghost small" id="b-export">Save Code</button>'+
        '<button class="btn ghost small" id="b-import">Load Code</button>'+
        '<button class="btn ghost small" id="b-careerset">Settings</button>'+
        '<button class="btn danger small" id="b-careermain">Main Menu</button>'+
      '</div>'+
      '<div id="career-transferbox" style="display:none;margin-top:10px"></div>'+
    '</div></div>'+

    '<div class="screen" id="s-prematch"><div class="panel narrow center">'+
      '<div class="pill" id="pre-comp">LEAGUE · MATCHDAY</div>'+
      '<div class="fixture" id="pre-fixture"></div>'+
      '<div id="pre-info" class="small"></div>'+
      '<div style="margin-top:18px"><button class="btn" id="b-kickoff">Kick Off</button> <button class="btn ghost" id="b-preback">Back</button></div>'+
    '</div></div>'+

    '<div class="screen clear" id="s-pause"><div class="panel narrow center">'+
      '<h1 class="title" style="font-size:34px">PAUSED</h1>'+
      '<div class="menucol" style="margin-top:14px">'+
        '<button class="btn" id="b-resume">Resume</button>'+
        '<button class="btn ghost" id="b-quitmatch">Quit Match</button>'+
      '</div>'+
      '<div class="small" style="margin-top:10px">P / ESC resume · V camera · H hide help</div>'+
    '</div></div>'+

    '<div class="screen" id="s-half"><div class="panel narrow center">'+
      '<h1 class="title" style="font-size:34px">HALF TIME</h1>'+
      '<div class="fixture" id="half-score"></div>'+
      '<div id="half-stats"></div>'+
      '<button class="btn" id="b-secondhalf" style="margin-top:12px">Second Half</button>'+
    '</div></div>'+

    '<div class="screen" id="s-full"><div class="panel narrow center">'+
      '<h1 class="title" style="font-size:34px" id="full-title">FULL TIME</h1>'+
      '<div class="fixture" id="full-score"></div>'+
      '<div id="full-scorers" class="small"></div>'+
      '<div id="full-stats" style="text-align:left"></div>'+
      '<div id="full-reward" style="margin:10px 0"></div>'+
      '<button class="btn" id="b-fullcontinue">Continue</button>'+
    '</div></div>'+

    '<div class="screen" id="s-season"><div class="panel">'+
      '<h1 class="title center" style="font-size:32px">SEASON <span id="season-num"></span> COMPLETE</h1>'+
      '<div id="season-body" class="grid2" style="margin-top:12px"></div>'+
      '<div class="center" style="margin-top:16px"><button class="btn" id="b-newseason">Start Next Season</button></div>'+
    '</div></div>'+

    '<div class="screen" id="s-howto"><div class="panel narrow">'+
      '<h2 class="sect">HOW TO PLAY</h2>'+
      '<div class="grid2" style="gap:14px">'+
        '<div class="card"><b style="color:var(--green)">CONTROLS</b>'+
          '<div class="statline"><span>Move</span><b><span class="kbd">W</span><span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span></b></div>'+
          '<div class="statline"><span>Sprint</span><b><span class="kbd">SHIFT</span></b></div>'+
          '<div class="statline"><span>Shoot (hold for power)</span><b><span class="kbd">SPACE</span></b></div>'+
          '<div class="statline"><span>Pass</span><b><span class="kbd">E</span></b></div>'+
          '<div class="statline"><span>Through ball</span><b><span class="kbd">Q</span></b></div>'+
          '<div class="statline"><span>Cross / long ball</span><b><span class="kbd">R</span></b></div>'+
          '<div class="statline"><span>Tackle / poke</span><b><span class="kbd">C</span></b></div>'+
          '<div class="statline"><span>Switch player</span><b><span class="kbd">F</span></b></div>'+
          '<div class="statline"><span>Camera</span><b>Mouse drag · edges · wheel</b></div>'+
          '<div class="statline"><span>Cam / pause / help</span><b><span class="kbd">V</span><span class="kbd">P</span><span class="kbd">H</span></b></div>'+
        '</div>'+
        '<div class="card"><b style="color:var(--green)">THE AI</b>'+
          '<div class="small" style="margin-top:8px">Every one of the 22 players thinks for itself:<br><br>'+
          '· Defenders <b>press, cover and mark</b> based on the ball and danger.<br>'+
          '· Attackers <b>make runs in behind</b>, hold width and overlap.<br>'+
          '· The carrier <b>evaluates shoot / pass / through / cross / dribble / clear</b> every moment using space, pressure and pass lanes.<br>'+
          '· Goalkeepers <b>sweep, claim and dive</b>.<br>'+
          '· Teams push forward when chasing a result.<br><br>'+
          'Enable <b>AI labels</b> in Settings to watch their brains work.</div>'+
        '</div>'+
      '</div>'+
      '<div class="small" style="margin-top:10px">Arcade rules: no offsides. Stamina drains while sprinting — release to recover.</div>'+
      '<button class="btn ghost" id="b-howtoback" style="margin-top:12px">Back</button>'+
    '</div></div>'+

    '<div class="screen" id="s-settings"><div class="panel narrow">'+
      '<h2 class="sect">SETTINGS</h2>'+
      '<div style="margin:8px 0 4px" class="small">MATCH LENGTH</div><div class="optrow" id="set-length"></div>'+
      '<div style="margin:12px 0 4px" class="small">DIFFICULTY</div><div class="optrow" id="set-diff"></div>'+
      '<div style="margin:12px 0 4px" class="small">CAMERA</div><div class="optrow" id="set-cam"></div>'+
      '<div style="margin:12px 0 4px" class="small">QUALITY</div><div class="optrow" id="set-quality"></div>'+
      '<div style="margin:12px 0 4px" class="small">TOGGLES</div><div class="optrow" id="set-toggles"></div>'+
      '<div style="margin-top:16px"><button class="btn" id="b-setback">Done</button>'+
      '<button class="btn danger small" id="b-wipe" style="margin-left:8px">Delete Career Save</button></div>'+
    '</div></div>';
  // bind buttons
  UI.$('b-new').onclick=function(){ UI.renderNewCareer(); UI.show('new'); };
  UI.$('b-continue').onclick=function(){
    if(!career.data){ if(!career.load()){ AF.HUD.toast('No save found'); return; } }
    UI.show('career');
  };
  UI.$('b-quick').onclick=function(){ UI.renderQuick(); UI.show('quick'); };
  UI.$('b-howto').onclick=function(){ UI.show('howto'); };
  UI.$('b-settings').onclick=function(){ UI._prev='main'; UI.renderSettings(); UI.show('settings'); };
  UI.$('b-newback').onclick=function(){ UI.show('main'); };
  UI.$('b-startcareer').onclick=function(){
    var name=UI.$('in-name').value.trim()||'Abebe Bekele';
    career.new({name:name,pos:UI._selPos,diff:UI._selDiff});
    career.save();
    UI.show('career');
    AF.HUD.toast('Welcome to '+career.club().name,'goal');
  };
  UI.$('b-quickback').onclick=function(){ UI.show('main'); };
  UI.$('b-startquick').onclick=function(){
    var tpl=AF.POS_TEMPLATES[UI._qPos]||AF.POS_TEMPLATES.ST;
    App.startRealMatch({homeId:UI._qHome,awayId:UI._qAway,userSide:0,
      userSpec:{name:'You',pos:UI._qPos,num:9,attrs:JSON.parse(JSON.stringify(tpl))},
      diffKey:UI._qDiff,lengthSec:App.settings.length,context:'quick'});
  };
  UI.$('b-playmatch').onclick=function(){ UI.openNextFixture(); };
  UI.$('b-simmatch').onclick=function(){ UI.simNextFixture(); };
  UI.$('b-export').onclick=function(){
    career.save();
    var code=career.exportCode();
    UI._showTransfer('<h2 class="sect">SAVE CODE</h2><div class="small">Copy this code somewhere safe and use LOAD CODE to restore.</div><textarea class="card" style="width:100%;height:90px;font-size:10px;user-select:text;-webkit-user-select:text" readonly>'+code+'</textarea><button class="btn ghost small" onclick="document.getElementById(\'career-transferbox\').style.display=\'none\'">Close</button>');
  };
  UI.$('b-import').onclick=function(){
    UI._showTransfer('<h2 class="sect">LOAD CODE</h2><textarea class="card" id="import-code" style="width:100%;height:90px;font-size:10px;user-select:text;-webkit-user-select:text" placeholder="Paste save code"></textarea><button class="btn small" id="b-doimport">Load</button> <button class="btn ghost small" onclick="document.getElementById(\'career-transferbox\').style.display=\'none\'">Cancel</button>');
    UI.$('b-doimport').onclick=function(){
      var ok=career.loadCode(UI.$('import-code').value);
      AF.HUD.toast(ok?'Career loaded!':'Invalid code','' );
      if(ok)UI.show('career');
    };
  };
  UI.$('b-careerset').onclick=function(){ UI._prev='career'; UI.renderSettings(); UI.show('settings'); };
  UI.$('b-careermain').onclick=function(){ UI.show('main'); };
  UI.$('b-kickoff').onclick=function(){ UI.launchFixture(); };
  UI.$('b-preback').onclick=function(){ UI.show('career'); };
  UI.$('b-resume').onclick=function(){ App.resume(); };
  UI.$('b-quitmatch').onclick=function(){
    App.playing=false; App.paused=false;
    App.startAttract();
    UI.show(career.data?'career':'main');
  };
  UI.$('b-secondhalf').onclick=function(){
    App.match.startSecondHalf();
    App._halfHandled=false;
    UI.show(null);
  };
  UI.$('b-fullcontinue').onclick=function(){
    if(App.matchContext&&App.matchContext.context==='career'&&career.data){
      App.playing=false;
      if(career.data.round>=career.data.fixtures.length){ UI.showSeasonEnd(); }
      else UI.show('career');
      App.startAttract();
    } else {
      App.playing=false;
      App.startAttract();
      UI.show('main');
    }
  };
  UI.$('b-newseason').onclick=function(){
    career.newSeason();
    UI.show('career');
  };
  UI.$('b-howtoback').onclick=function(){ UI.show('main'); };
  UI.$('b-setback').onclick=function(){ App.saveSettings(); UI.show(UI._prev||'main'); };
  UI.$('b-wipe').onclick=function(){
    career.data=null; career.clearSave();
    AF.HUD.toast('Career deleted');
    UI.show('main');
  };
  UI._selPos='ST'; UI._selDiff=App.settings.difficulty;
  UI._qHome=0; UI._qAway=7; UI._qDiff=App.settings.difficulty; UI._qPos='ST';
};
UI.show=function(id){
  if(id==='career'&&career.data)UI.showCareer();
  var screens=document.querySelectorAll('.screen');
  for(var i=0;i<screens.length;i++)screens[i].classList.remove('show');
  if(id){
    var el=UI.$('s-'+id);
    if(el){ el.classList.add('show'); UI.current=id; }
  } else UI.current=null;
  var hudScore=document.getElementById('hud-score');
  if(hudScore)hudScore.style.opacity=(App.playing&&id==null)?'1':'0';
};
UI._showTransfer=function(html){
  var box=UI.$('career-transferbox');
  box.style.display='block';
  box.innerHTML=html;
};

/* ----- option row helpers ----- */
UI.optRow=function(container,items,selIdx,onSel){
  var el=typeof container==='string'?UI.$(container):container;
  el.innerHTML='';
  items.forEach(function(it,i){
    var b=document.createElement('button');
    b.className='opt'+(i===selIdx?' sel':'');
    b.textContent=it.label;
    b.onclick=function(){
      var kids=el.children;
      for(var j=0;j<kids.length;j++)kids[j].classList.remove('sel');
      b.classList.add('sel');
      onSel(i,it);
    };
    el.appendChild(b);
  });
};
UI.renderNewCareer=function(){
  UI.optRow('opt-pos',AF.POS_LIST.map(function(p){return {label:p};}),0,function(i,it){ UI._selPos=it.label; });
  var diffs=Object.keys(AF.DIFFS);
  var sel=Math.max(0,diffs.indexOf(App.settings.difficulty));
  UI.optRow('opt-diff',diffs.map(function(d){return {label:AF.DIFFS[d].label};}),sel,function(i){ UI._selDiff=diffs[i]; });
};
UI.renderQuick=function(){
  UI.optRow('q-home',AF.TEAMS.map(function(t,i){return {label:t.name};}),0,function(i){ UI._qHome=i; });
  UI.optRow('q-away',AF.TEAMS.map(function(t,i){return {label:t.name};}),7,function(i){ UI._qAway=i; });
  var diffs=Object.keys(AF.DIFFS);
  UI.optRow('q-diff',diffs.map(function(d){return {label:AF.DIFFS[d].label};}),Math.max(0,diffs.indexOf(App.settings.difficulty)),function(i){ UI._qDiff=diffs[i]; });
  UI.optRow('q-pos',AF.POS_LIST.map(function(p){return {label:p};}),0,function(i,it){ UI._qPos=it.label; });
};
UI.renderSettings=function(){
  var lens=[[240,'4 MIN'],[360,'6 MIN'],[480,'8 MIN'],[600,'10 MIN']];
  UI.optRow('set-length',lens.map(function(l){return {label:l[1]};}),Math.max(0,lens.map(function(l){return l[0];}).indexOf(App.settings.length)),function(i){ App.settings.length=lens[i][0]; });
  var diffs=Object.keys(AF.DIFFS);
  UI.optRow('set-diff',diffs.map(function(d){return {label:AF.DIFFS[d].label};}),Math.max(0,diffs.indexOf(App.settings.difficulty)),function(i){ App.settings.difficulty=diffs[i]; });
  UI.optRow('set-cam',[{label:'FOLLOW'},{label:'TELECAST'}],App.settings.camMode==='tele'?1:0,function(i){ App.settings.camMode=i===1?'tele':'follow'; App.camMode=App.settings.camMode; });
  var qopts=[{label:'AUTO'},{label:'HIGH'},{label:'LITE'}];
  var qsel=App.settings.quality==='auto'?0:App.settings.quality==='high'?1:2;
  UI.optRow('set-quality',qopts,qsel,function(i){
    App.settings.quality=['auto','high','lite'][i];
    App._perfChecked=true;
    if(App.rendererOK){
      App.renderer.setQuality(App.settings.quality==='lite'?'lite':'high');
      App.renderer.setPerfMode(App.settings.quality==='lite'||(App.settings.quality==='auto'&&App.perfMode));
    }
  });
  var togs=[['SOUND','sound'],['AUTO SWITCH','autoswitch'],['AI LABELS','aiLabels'],['RADAR','radar']];
  var el=UI.$('set-toggles'); el.innerHTML='';
  togs.forEach(function(t){
    var b=document.createElement('button');
    b.className='opt'+(App.settings[t[1]]?' sel':'');
    b.textContent=t[0];
    b.onclick=function(){
      App.settings[t[1]]=!App.settings[t[1]];
      b.classList.toggle('sel',App.settings[t[1]]);
      App.saveSettings();
    };
    el.appendChild(b);
  });
};

/* ----- career hub ----- */
UI.attrRowHTML=function(k,label,val,pts){
  return '<div class="attrrow"><span class="alabel">'+label+'</span>'+
    '<span class="abar"><i style="width:'+val+'%"></i></span>'+
    '<span class="aval">'+val+'</span>'+
    '<button class="pm" data-attr="'+k+'" '+(pts>0?'':'disabled')+'>+</button></div>';
};
UI.showCareer=function(){
  var d=career.data; if(!d){UI.show('main');return;}
  UI.$('career-season').textContent='· SEASON '+d.season;
  var club=career.club();
  UI.$('career-clubinfo').innerHTML=
    '<div class="pill">'+club.name.toUpperCase()+'</div> <span class="pill amber">OVR '+career.userOverall()+'</span>';
  var ovr=career.userOverall();
  var attrsHTML='<div class="card"><b style="color:var(--green)">'+u.esc(d.name).toUpperCase()+'</b> <span class="pill">'+d.pos+' · #'+d.num+'</span>'+
    '<div class="small" style="margin:4px 0 8px">LEVEL '+d.level+' · <span style="color:var(--amber)">'+d.xp+'/'+career.xpNeed(d.level)+' XP</span>'+
    (d.pts>0?' · <b style="color:var(--green)">'+d.pts+' PTS TO SPEND</b>':'')+'</div>';
  AF.ATTR_INFO.forEach(function(ai){ attrsHTML+=UI.attrRowHTML(ai.k,ai.label,d.attrs[ai.k],d.pts); });
  attrsHTML+='<div class="small" style="margin-top:8px">Apps '+d.seasonStats.apps+' · Goals '+d.seasonStats.goals+' · Assists '+d.seasonStats.assists+' · Avg rating '+(career.avgRating()||'—')+'</div>';
  if(d.trophies.length){ attrsHTML+='<div style="margin-top:8px">'; d.trophies.slice(-4).forEach(function(t){ attrsHTML+='<span class="pill amber">\u2605 '+t.name+' (S'+t.season+')</span> '; }); attrsHTML+='</div>'; }
  attrsHTML+='</div>';
  // fixture + table
  var fx=career.nextFixture();
  var fixHTML='<div class="card"><b style="color:var(--green)">NEXT MATCH — MATCHDAY '+(d.round+1)+'</b>';
  if(fx){
    var h=AF.TEAMS[fx.home], a=AF.TEAMS[fx.away];
    var youPlay=fx.home===d.clubId?'(YOU HOME)':fx.away===d.clubId?'(YOU AWAY)':'';
    fixHTML+='<div class="fixture"><span class="chipinline" style="background:'+h.shirt+'"></span>'+h.name+' <span class="vs">VS</span> '+a.name+'<span class="chipinline" style="background:'+a.shirt+'"></span></div>'+
      '<div class="small center">'+youPlay+' Opponent strength '+career.strengthOf(fx.home===d.clubId?fx.away:fx.home)+'</div>';
  } else fixHTML+='<div class="small center">Season complete — finish the round to continue.</div>';
  fixHTML+='<div class="small center" style="margin-top:6px">XP is earned from ratings, goals and assists.</div></div>';
  // table
  var rows=career.sortedTable();
  var tbl='<div class="card" style="margin-top:14px"><b style="color:var(--green)">RISE TO GLORY LEAGUE</b><table class="tbl"><tr><th>#</th><th>CLUB</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>PTS</th></tr>';
  rows.forEach(function(r,i){
    var c=AF.TEAMS[r.clubId];
    tbl+='<tr class="'+(r.clubId===d.clubId?'me':'')+'"><td>'+(i+1)+'</td><td><span class="chipinline" style="background:'+c.shirt+'"></span>'+c.name+'</td><td>'+r.p+'</td><td>'+r.w+'</td><td>'+r.d+'</td><td>'+r.l+'</td><td>'+(r.gf-r.ga)+'</td><td><b>'+r.pts+'</b></td></tr>';
  });
  tbl+='</table></div>';
  UI.$('career-grid').innerHTML='<div>'+attrsHTML+'</div><div>'+fixHTML+tbl+'</div><div id="career-right"></div>';
  var right=UI.$('career-right');
  var hist=d.history.slice(-5).reverse();
  var rh='<div class="card"><b style="color:var(--green)">CAREER RECORD</b>';
  if(!hist.length)rh+='<div class="small" style="margin-top:6px">Your story starts now.</div>';
  else{
    rh+='<table class="tbl" style="margin-top:6px"><tr><th>SEASON</th><th>CLUB</th><th>G</th><th>A</th><th>AVG</th><th>POS</th></tr>';
    hist.forEach(function(h2){
      rh+='<tr><td>S'+h2.season+'</td><td>'+AF.TEAMS[h2.clubId].short+'</td><td>'+h2.goals+'</td><td>'+h2.assists+'</td><td>'+h2.rating+'</td><td>'+h2.pos+'</td></tr>';
    });
    rh+='</table>';
  }
  rh+='</div>';
  right.innerHTML=rh;
  // attr + buttons
  var pm=UI.$('career-grid').querySelectorAll('.pm');
  for(var i=0;i<pm.length;i++){
    pm[i].onclick=function(){
      var k=this.getAttribute('data-attr');
      if(career.spendPoint(k)){ career.save(); UI.showCareer(); }
    };
  }
  var tb=UI.$('career-transferbox'); tb.style.display='none';
};
UI.openNextFixture=function(){
  var d=career.data;
  var fx=career.nextFixture();
  if(!fx){ UI.showSeasonEnd(); return; }
  var home=AF.TEAMS[fx.home], away=AF.TEAMS[fx.away];
  UI.$('pre-comp').textContent='RISE TO GLORY LEAGUE · MATCHDAY '+(d.round+1);
  UI.$('pre-fixture').innerHTML='<span class="chipinline" style="background:'+home.shirt+'"></span>'+home.name+' <span class="vs">VS</span> '+away.name+'<span class="chipinline" style="background:'+away.shirt+'"></span>';
  UI.$('pre-info').innerHTML='You are <b style="color:#fff">'+(fx.home===d.clubId?home.name:away.name)+'</b> · '+AF.DIFFS[d.diff||App.settings.difficulty].label+' AI · '+(App.settings.length/60)+' min';
  UI._fixture=fx;
  UI.show('prematch');
};
UI.launchFixture=function(){
  var d=career.data, fx=UI._fixture;
  var myHome=fx.home===d.clubId;
  App.startRealMatch({
    homeId:fx.home, awayId:fx.away, userSide:myHome?0:1,
    userSpec:{name:d.name,pos:d.pos,num:d.num,attrs:d.attrs},
    diffKey:d.diff||App.settings.difficulty, lengthSec:App.settings.length,
    context:'career', salt:d.season
  });
};
UI.simNextFixture=function(){
  var d=career.data, fx=career.nextFixture();
  if(!fx){ UI.showSeasonEnd(); return; }
  var myHome=fx.home===d.clubId;
  var g=career._simScore(fx.home,fx.away);
  var gf=myHome?g[0]:g[1], ga=myHome?g[1]:g[0];
  var pGoals=0;
  if(d.pos==='ST')pGoals=u.chance(0.4)?u.ri(0,2):(u.chance(0.3)?1:0);
  else if(d.pos==='LW'||d.pos==='RW'||d.pos==='CAM')pGoals=u.chance(0.25)?1:0;
  else pGoals=u.chance(0.1)?1:0;
  pGoals=Math.min(pGoals,gf);
  var pAssists=(gf-pGoals)>0&&u.chance(0.5)?1:0;
  var rating=u.clamp(6+(gf>ga?0.5:gf===ga?0.1:-0.2)+u.gauss()*0.9,4.5,9.5);
  var r2=Math.round(rating*10)/10;
  var res=career.applyMatch({gf:gf,ga:ga,goals:pGoals,assists:pAssists,rating:r2});
  career.save();
  AF.HUD.toast((gf>ga?'WIN ':gf===ga?'DRAW ':'LOSS ')+gf+'-'+ga+' · +'+res.xpGain+' XP');
  UI.show('career');
};
UI.showHalf=function(s){
  AF.HUD.hideBanner();
  var m=App.match;
  UI.$('half-score').innerHTML='<span class="chipinline" style="background:'+m.teams[0].kit.shirt+'"></span>'+m.teams[0].club.name+' <span class="vs">'+s.score[0]+' - '+s.score[1]+'</span> '+m.teams[1].club.name+'<span class="chipinline" style="background:'+m.teams[1].kit.shirt+'"></span>';
  UI.$('half-stats').innerHTML=UI.statsTable(s);
  UI.show('half');
};
UI.statsTable=function(s){
  var t0=s.stats[0],t1=s.stats[1];
  function row(label,a,b,fmt){
    return '<div class="statline"><span>'+a+'</span><span style="color:#8fb59d">'+label+'</span><span>'+b+'</span></div>';
  }
  return '<div class="card">'+
    row('POSSESSION',s.poss[0]+'%',s.poss[1]+'%')+
    row('SHOTS',t0.shots,t1.shots)+
    row('ON TARGET',t0.sot,t1.sot)+
    row('PASSES (OK)',t0.passes+' ('+t0.passesOk+')',t1.passes+' ('+t1.passesOk+')')+
    row('TACKLES',t0.tackles,t1.tackles)+
    row('FOULS',t0.fouls,t1.fouls)+
    row('CORNERS',t0.corners,t1.corners)+
  '</div>';
};
UI.showFull=function(s,extra){
  AF.HUD.hideBanner();
  var m=App.match;
  var won=(m.userSide===0&&s.score[0]>s.score[1])||(m.userSide===1&&s.score[1]>s.score[0]);
  var drew=s.score[0]===s.score[1];
  UI.$('full-title').textContent=won?'VICTORY':drew?'DRAW':'DEFEAT';
  UI.$('full-title').style.color=won?'var(--green)':drew?'var(--amber)':'var(--red)';
  UI.$('full-score').innerHTML='<span class="chipinline" style="background:'+m.teams[0].kit.shirt+'"></span>'+m.teams[0].club.name+' <span class="vs">'+s.score[0]+' - '+s.score[1]+'</span> '+m.teams[1].club.name+'<span class="chipinline" style="background:'+m.teams[1].kit.shirt+'"></span>';
  var sc='';
  s.goals.forEach(function(g){
    sc+=(sc?' · ':'')+g.min+'\u2032 '+(g.own?'OG ':'')+g.name+' ('+m.teams[g.team].club.short+')';
  });
  UI.$('full-scorers').textContent=sc||'No goals';
  UI.$('full-stats').innerHTML=UI.statsTable(s);
  var rw='<div class="rating-big">'+(s.userRating!=null?s.userRating:'—')+'</div><div class="small">YOUR RATING</div>';
  if(extra){
    rw+='<div class="xpline">+'+extra.xpGain+' XP'+(extra.levelUps?' · LEVEL UP! +'+extra.levelUps*2+' attribute pts':'')+'</div>';
  }
  if(s.userStats)rw+='<div class="small" style="margin-top:6px">'+s.userStats.goals+' goals · '+s.userStats.assists+' assists · '+s.userStats.passesOk+'/'+s.userStats.passes+' passes · '+s.userStats.tackles+' tackles</div>';
  UI.$('full-reward').innerHTML=rw;
  UI.show('full');
};
UI.showSeasonEnd=function(){
  var d=career.data;
  var pend=d._pending;
  if(!pend)pend=career.endSeason();
  UI.$('season-num').textContent=d.season;
  var champ=AF.TEAMS[pend.champion];
  var pos=career._tablePos();
  var left='<div class="card"><b style="color:var(--green)">FINAL STANDINGS</b>';
  var rows=career.sortedTable();
  left+='<table class="tbl" style="margin-top:8px">';
  rows.forEach(function(r,i){
    var c=AF.TEAMS[r.clubId];
    left+='<tr class="'+(r.clubId===d.clubId?'me':'')+'"><td>'+(i+1)+'</td><td><span class="chipinline" style="background:'+c.shirt+'"></span>'+c.name+'</td><td>'+r.pts+' pts</td></tr>';
  });
  left+='</table></div>';
  var right='<div class="card"><b style="color:var(--amber)">SEASON '+d.season+' REVIEW</b>'+
    '<div class="small" style="margin-top:8px">Champions: <b style="color:#fff">'+champ.name+'</b></div>'+
    '<div class="small">You finished <b style="color:#fff">'+pos+(pos===1?'ST':pos===2?'ND':pos===3?'RD':'TH')+'</b> with '+d.seasonStats.goals+' goals, '+d.seasonStats.assists+' assists, '+career.avgRating()+' avg rating.</div>';
  if(pend.awards&&pend.awards.length){
    right+='<div style="margin-top:10px">';
    pend.awards.forEach(function(a){ right+='<span class="pill amber">\u2605 '+a+'</span> '; });
    right+='</div>';
  }
  if(d.offers&&d.offers.length){
    right+='<div style="margin-top:12px"><b style="color:var(--amber)">TRANSFER OFFERS</b>';
    d.offers.forEach(function(o,i){
      var c=AF.TEAMS[o.clubId];
      right+='<div class="offer"><h3>'+c.name+' <span class="small">('+career.strengthOf(o.clubId)+' OVR · '+o.wage+')</span></h3>'+
      '<button class="btn small" data-acc="'+i+'">Accept</button> <button class="btn ghost small" data-rej="'+i+'">Stay</button></div>';
    });
    right+='</div>';
  } else {
    right+='<div class="small" style="margin-top:10px">No transfer offers this season. Keep performing.</div>';
  }
  right+='<div class="small" style="margin-top:10px">Season '+d.seasonStats.apps+' apps · record saved.</div></div>';
  UI.$('season-body').innerHTML=left+right;
  var accs=UI.$('season-body').querySelectorAll('[data-acc]');
  for(var i=0;i<accs.length;i++){
    accs[i].onclick=function(){
      var o=d.offers[parseInt(this.getAttribute('data-acc'),10)];
      career.acceptOffer(o.clubId);
      AF.HUD.toast('Transfer complete — welcome to '+AF.TEAMS[o.clubId].name+'!','goal');
      career.save();
      UI.showSeasonEnd();
    };
  }
  var rejs=UI.$('season-body').querySelectorAll('[data-rej]');
  for(i=0;i<rejs.length;i++){
    rejs[i].onclick=function(){
      var idx=parseInt(this.getAttribute('data-rej'),10);
      d.offers.splice(idx,1);
      career.save();
      UI.showSeasonEnd();
    };
  }
  UI.show('season');
};

/* ================= boot ================= */
if(document.readyState==='complete'||document.readyState==='interactive'){
  setTimeout(function(){ App.boot(); },50);
} else {
  document.addEventListener('DOMContentLoaded',function(){ App.boot(); });
}
})();
