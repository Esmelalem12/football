def patch(s, old, new, tag):
    if old not in s:
        print('MISS:', tag)
        return s
    print('OK:', tag)
    return s.replace(old, new, 1)

# ---- ui_main.js ----
src = open('js/ui_main.js').read()

old_sched = (
    "  // if real frames never arrive (throttled/background iframe), drive frames manually\n"
    "  setTimeout(function(){\n"
    "    if((App._frames||0)<2&&!App._fallbackIv){\n"
    "      var last2=Date.now();\n"
    "      App._fallbackIv=setInterval(function(){\n"
    "        var now=Date.now(); var dt2=Math.min(0.05,(now-last2)/1000); last2=now;\n"
    "        App.loopFallback(dt2);\n"
    "      },33);\n"
    "    }\n"
    "  },1500);\n"
)
src = patch(src, old_sched, "", "remove boot-only scheduler")

old_tail = (
    "  AF.__booted=true;\n"
    "  requestAnimationFrame(App.loop);\n"
    "  // if RAF is alive, cancel any fallback loop once real frames flow\n"
    "  setTimeout(function(){\n"
    "    var iv=setInterval(function(){\n"
    "      if(App._rafFrames===undefined)App._rafFrames=0;\n"
    "      if(App._fallbackIv&&(App._frames||0)>4){ clearInterval(App._fallbackIv); App._fallbackIv=null; clearInterval(iv); }\n"
    "      else if((App._frames||0)>4){ clearInterval(iv); }\n"
    "    },500);\n"
    "  },2000);\n"
    "};"
)
new_tail = (
    "  AF.__booted=true;\n"
    "  App.lastRafAt=Date.now();\n"
    "  requestAnimationFrame(App.loop);\n"
    "  // RAF health watchdog: if frame delivery stalls at ANY time (throttled preview\n"
    "  // pane, GPU policy, backgrounded tab), a fallback interval keeps the match alive\n"
    "  // until real frames resume, then hands back automatically.\n"
    "  setInterval(function(){\n"
    "    var since=Date.now()-(App.lastRafAt||0);\n"
    "    if(!App.paused&&since>900&&!App._fallbackIv){\n"
    "      var last2=Date.now();\n"
    "      App._fallbackIv=setInterval(function(){\n"
    "        var n2=Date.now(); var d2=Math.min(0.05,(n2-last2)/1000); last2=n2;\n"
    "        App.loopFallback(d2);\n"
    "      },33);\n"
    "    } else if(App._fallbackIv&&since<400){\n"
    "      clearInterval(App._fallbackIv); App._fallbackIv=null;\n"
    "    }\n"
    "  },600);\n"
    "};"
)
src = patch(src, old_tail, new_tail, "continuous RAF watchdog")

src = patch(
    src,
    "App.loop=function(t){\n  requestAnimationFrame(App.loop);",
    "App.loop=function(t){\n  App.lastRafAt=Date.now();\n  requestAnimationFrame(App.loop);",
    "raf heartbeat",
)

old_fb = (
    "App.loopFallback=function(dt){\n"
    "  // drives one frame without requestAnimationFrame (for throttled preview panes)\n"
    "  var m=App.match;"
)
new_fb = (
    "App.loopFallback=function(dt){\n"
    "  // drives frames without requestAnimationFrame (for throttled preview panes)\n"
    "  if(Date.now()-(App.lastRafAt||0)<400)return; // real frames are flowing again\n"
    "  var m=App.match;"
)
src = patch(src, old_fb, new_fb, "fallback guard")

old_hf = (
    "    AF.HUD.tick(m,dt);\n"
    "    AF.audio.update(dt,m.excite||0);\n"
    "  }\n"
    "  AF.Input.endFrame();\n"
    "};"
)
new_hf = (
    "    if(App.playing){\n"
    "      if(m.state==='half'&&!App._halfHandled){ App._halfHandled=true; UI.showHalf(m.snapshot()); }\n"
    "      if(m.state==='full'&&!App._fullHandled){ App._fullHandled=true; App.onFullTime(); }\n"
    "    }\n"
    "    AF.HUD.tick(m,dt);\n"
    "    AF.audio.update(dt,m.excite||0);\n"
    "  }\n"
    "  AF.Input.endFrame();\n"
    "};"
)
src = patch(src, old_hf, new_hf, "fallback half/full handling")

src = patch(
    src,
    "case 'blur': if(App.playing&&!App.paused)App.pause(); break;",
    "case 'blur': if(App.playing&&!App.paused&&document.visibilityState==='hidden')App.pause(); break;",
    "blur pause only when hidden",
)
open('js/ui_main.js', 'w').write(src)

# ---- input_hud.js ----
src = open('js/input_hud.js').read()
src = patch(
    src,
    "  window.addEventListener('blur',function(){ self.keys={}; self.charging=false; AF.bus.emit('ui',{type:'blur'}); });",
    "  window.addEventListener('blur',function(){ self.keys={}; self.charging=false; AF.bus.emit('ui',{type:'blur'}); });\n  document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='hidden'){ self.keys={}; self.charging=false; AF.bus.emit('ui',{type:'blur'}); } });",
    "visibilitychange",
)
open('js/input_hud.js', 'w').write(src)

# ---- match.js ----
src = open('js/match.js').read()
src = patch(
    src,
    "  this.passIntent=null; this.shot=null;\n  var team=this.teams[teamIdx], other=this.teams[1-teamIdx];",
    "  this.passIntent=null; this.shot=null;\n  this.restartStartT=this.t;\n  var team=this.teams[teamIdx], other=this.teams[1-teamIdx];",
    "restart timer stamp",
)
src = patch(
    src,
    "  if(this.state==='restart'){\n    var tk=this.restartTaker;",
    "  if(this.state==='restart'){\n    if(this.t-(this.restartStartT||0)>12)this.restartAiTakeAt=Math.min(this.restartAiTakeAt,this.t-0.01); // never let a restart hang\n    var tk=this.restartTaker;",
    "restart watchdog",
)
open('js/match.js', 'w').write(src)

# ---- sim.js ----
src = open('js/sim.js').read()
src = patch(
    src,
    "    this.vel.x=u.damp(this.vel.x,des.x,a*0.35,dt);\n    this.vel.z=u.damp(this.vel.z,des.z,a*0.35,dt);",
    "    this.vel.x=u.damp(this.vel.x,des.x,a*0.42,dt);\n    this.vel.z=u.damp(this.vel.z,des.z,a*0.42,dt);",
    "smoother accel",
)
open('js/sim.js', 'w').write(src)

print('DONE')
