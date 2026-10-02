def patch(path, old, new, tag):
    src = open(path).read()
    if old not in src:
        print('MISS:', tag)
        return
    open(path, 'w').write(src.replace(old, new, 1))
    print('OK:', tag)

# ---------- input_hud.js ----------
# 1. set-piece prompts mention the auto-take; 'inplay' clears them
patch('js/input_hud.js',
"    case 'resume': HUD.prompt(null); break;",
"    case 'resume': case 'inplay': HUD.prompt(null); break;", 'inplay clears prompt')
patch('js/input_hud.js',
"var labels={kickoff:'KICK OFF — press E',corner:'CORNER — R: cross into the box · E: short',throwin:'THROW-IN — E: throw · Q: quick',goalkick:'',freekick:'FREE KICK — SPACE: shoot · E: pass · R: cross',penalty:'PENALTY! Aim with A/D, hold SPACE for power'};",
"var labels={kickoff:'KICK OFF — E: pass (auto in 3s)',corner:'CORNER — R: cross (auto in 3s)',throwin:'THROW-IN — auto in 3s, or E/Q now',goalkick:'',freekick:'FREE KICK — SPACE/E/R (auto in 3s)',penalty:'PENALTY! Aim A/D, hold SPACE (auto in 6s)'};", 'prompt text')

# 2. keys resync + right-button hold-to-move fallback
patch('js/input_hud.js',
"  window.addEventListener('blur',function(){ if(document.visibilityState==='hidden'){ self.keys={}; self.charging=false; AF.bus.emit('ui',{type:'blur'}); } });",
"""  window.addEventListener('blur',function(){ if(document.visibilityState==='hidden'){ self.keys={}; self.charging=false; AF.bus.emit('ui',{type:'blur'}); } });
  window.addEventListener('focus',function(){ self.keys={}; }); // fresh key state on refocus
  canvas.addEventListener('mousedown',function(e){ if(e.button===2){ self.mouse.rdown=true; e.preventDefault(); } });
  window.addEventListener('mouseup',function(e){ if(e.button===2)self.mouse.rdown=false; });""",'resync + rmb')
patch('js/input_hud.js',
"  mouse:{x:0,y:0,dx:0,dy:0,drag:false,btn:0}, wheel:0,",
"  mouse:{x:0,y:0,dx:0,dy:0,drag:false,rdown:false,btn:0}, wheel:0, _everKeyDown:false,", 'mouse state fields')
patch('js/input_hud.js',
"    if(e.repeat){self.keys[e.code]=true;return;}\n    self.keys[e.code]=true;",
"    if(e.repeat){self.keys[e.code]=true;return;}\n    self.keys[e.code]=true;\n    self._everKeyDown=true;", 'everKeyDown flag')

# 3. buildMove: right-mouse-hold moves toward pointer (camera-relative fallback)
patch('js/input_hud.js',
"""Input.buildMove=function(camYaw){
  var k=this.keys;
  var iz=(k.KeyW||k.ArrowUp?1:0)-(k.KeyS||k.ArrowDown?1:0);
  var ix=(k.KeyD||k.ArrowRight?1:0)-(k.KeyA||k.ArrowLeft?1:0);
  if(!iz&&!ix)return null;""",
"""Input.buildMove=function(camYaw){
  var k=this.keys;
  var iz=(k.KeyW||k.ArrowUp?1:0)-(k.KeyS||k.ArrowDown?1:0);
  var ix=(k.KeyD||k.ArrowRight?1:0)-(k.KeyA||k.ArrowLeft?1:0);
  if(!iz&&!ix&&this.mouse.rdown){ // hold RIGHT mouse button: move toward the pointer
    var mx=this.mouse.x, my=this.mouse.y;
    if(Math.abs(mx)>0.14||Math.abs(my)>0.14){ ix=mx; iz=-my; }
  }
  if(!iz&&!ix)return null;""",'rmb movement')

# 4. no-keyboard helper: if no key event has EVER arrived during play, guide the user
patch('js/input_hud.js',
"""HUD.tick=function(match,dt){
  if(!match)return;
  this.updateScore(match);""",
"""HUD.tick=function(match,dt){
  if(!match)return;
  if(App.playing&&match.userSide>=0&&!AF.Input._everKeyDown&&match.t>4){
    this._nkT=(this._nkT||0)+dt;
    if(this._nkT>6){
      this._nkT=-14; // re-remind after a while
      HUD.toast('NO KEYBOARD DETECTED - click the pitch once, or HOLD RIGHT MOUSE to run','yellow');
    }
  }
  this.updateScore(match);""",'no-keyboard hint')

# App reference inside HUD.tick (HUD is defined before App in same file? no - App is AF.App at runtime; fix reference)
patch('js/input_hud.js',
"  if(App.playing&&match.userSide>=0&&!AF.Input._everKeyDown&&match.t>4){",
"  var App2=window.AF&&window.AF.App?window.AF.App:null;\n  if(App2&&App2.playing&&match.userSide>=0&&!AF.Input._everKeyDown&&match.t>4){", 'app ref safe')

print('DONE')
