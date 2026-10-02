def patch(path, old, new, tag):
    src = open(path).read()
    if old not in src:
        print('MISS:', tag)
        return
    open(path, 'w').write(src.replace(old, new, 1))
    print('OK:', tag)

# ================= match.js =================
# 1. USER set pieces never use AI-chosen actions:
#    deep free kicks -> possession (dribble on); only clear shots/crosses stay automatic
patch('js/match.js',
"""  } else if(type==='penalty'){
    if(tk.isUser&&this.userSide>=0)this.actShoot(tk,0.85,this.userAim||u.rr(-2.2,2.2));
    else AF.AI.takeSetPiece(this);
  } else {
    AF.AI.takeSetPiece(this);
  }
};""",
"""  } else if(type==='penalty'){
    if(tk.isUser&&this.userSide>=0)this.actShoot(tk,0.85,this.userAim||u.rr(-2.2,2.2));
    else AF.AI.takeSetPiece(this);
  } else if(type==='freekick'){
    // USER taker: never let the AI pick a pass for him. If we're in shooting
    // range, put it on goal; otherwise hand him the ball to keep dribbling.
    if(tk.isUser&&this.userSide>=0){
      var gx2=this.teams[tk.team].dir*CFG.FIELD.L/2;
      var dg2=u.dist(tk.pos,{x:gx2,z:0});
      if(dg2<26&&Math.abs(tk.pos.z)<16)this.actShoot(tk,0.85,this.userAim||u.rr(-2.2,2.2));
      else{
        this.ball.owner=tk; this.ball.spin=0; this.ball.p.y=CFG.BALL_R;
        this.ball.lastTouch=tk; this.ball.lastTouchTeam=tk.team;
        tk.kickCd=0;
        this.resumePlay();
        this.emit({type:'inplay',team:tk.team,taker:tk});
      }
    } else AF.AI.takeSetPiece(this);
  } else {
    AF.AI.takeSetPiece(this);
  }
};""",'user freekick = never AI pass')

# 2. auto-switch: never steal control from the carrier, only switch to the nearest chaser
patch('js/match.js',
"  if(this.autoSwitch&&!this.attract&&this.userSide>=0&&p.team===this.userSide&&!p.isUser&&this.controlled){\n    if(completing||u.dist(this.controlled.pos,b.p)>7){\n      this.controlled=p; this.emit({type:'switch',player:p});\n    }\n  }",
"""  if(this.autoSwitch&&!this.attract&&this.userSide>=0&&p.team===this.userSide&&!p.isUser&&this.controlled){
    var ctrl=this.controlled;
    var ctrlHasBall=ctrl===this.ball.owner;
    var manualGrace=this.t-(this._lastManualSwitchT||-9)<0.9;
    var reason=completing||(!ctrlHasBall&&!manualGrace&&u.dist(ctrl.pos,b.p)>9&&u.dist(p.pos,b.p)<u.dist(ctrl.pos,b.p)*0.55);
    if(reason){
      this.controlled=p; this.emit({type:'switch',player:p});
    }
  }""",'smart auto-switch')

# track manual switch time
patch('js/match.js',
"  if(best){ this.controlled=best; this.emit({type:'switch',player:best}); }",
"  if(best){ this.controlled=best; this._lastManualSwitchT=this.t; this.emit({type:'switch',player:best}); }", 'manual switch stamp')

# 3. user pickup prompt so it never feels like the ball acts on its own
patch('js/match.js',
"  p.kickCd=Math.max(p.kickCd,0.22);            // settle the touch before acting\n  p.aiLock={until:this.t+0.35,type:'control'}; // one beat of control before AI decisions",
"  p.kickCd=Math.max(p.kickCd,0.22);            // settle the touch before acting\n  p.aiLock={until:this.t+0.35,type:'control'}; // one beat of control before AI decisions\n  if(p.isUser&&!this.attract)this.emit({type:'youball',player:p});", 'youball event')

# ================= ai.js =================
# 4. AI teammates: never select a receiver who is practically tackled
patch('js/ai.js',
"    if(space<2)up-=10;",
"    if(space<1.6)up-=16; else if(space<2.2)up-=7;", 'tighter receiver rule')

# ================= input_hud.js =================
# 5. remove the focus-time key wipe (was eating held keys on focus juggling)
patch('js/input_hud.js',
"  window.addEventListener('focus',function(){ self.keys={}; }); // fresh key state on refocus\n",
"", 'no key wipe on focus')

# 6. youball prompt
patch('js/input_hud.js',
"    case 'resume': case 'inplay': HUD.prompt(null); break;",
"    case 'resume': case 'inplay': HUD.prompt(null); break;\n    case 'youball':\n      HUD.prompt('<span class=\"kbd\">YOU HAVE IT</span> E pass &middot; Q through &middot; SPACE shoot (hold) &middot; R cross', true);\n      if(HUD._ybT)clearTimeout(HUD._ybT);\n      HUD._ybT=setTimeout(function(){ HUD.prompt(null); },2200);\n      break;", 'youball prompt')

print('DONE')
