def patch(s, old, new, tag):
    if old not in s:
        print('MISS:', tag)
        return s
    print('OK:', tag)
    return s.replace(old, new, 1)

src = open('js/match.js').read()

# 1. setupRestart: auto-take timers
src = patch(
    src,
    "  this.restartTaker=taker;\n  this.restartReady=false;\n  this.restartAiTakeAt=this.t+2;",
    "  this.restartTaker=taker;\n  this.restartReady=false;\n  var userTaker0=this.userSide===teamIdx&&taker&&taker.isUser&&!this.attract;\n  this.restartAutoDelay=userTaker0?2.4:u.rr(0.8,1.3);\n  this.restartAiTakeAt=this.t+this.restartAutoDelay;\n  this.restartGiveAt=this.t+(userTaker0?3.4:2.4);",
    'auto-take timers',
)

# 2. rewrite restart update block
old_block = (
    "  // restart taker logic\n"
    "  if(this.state==='restart'){\n"
    "    if(this.t-(this.restartStartT||0)>12)this.restartAiTakeAt=Math.min(this.restartAiTakeAt,this.t-0.01); // never let a restart hang\n"
    "    var tk=this.restartTaker;\n"
    "    if(tk){\n"
    "      if(!this.restartReady){\n"
    "        tk.moveTarget={x:this.restartPos.x,z:this.restartPos.z}; tk.sprint=false;\n"
    "        if(u.dist(tk.pos,this.restartPos)<0.9){\n"
    "          this.restartReady=true;\n"
    "          this.restartAiTakeAt=this.t+(this.attract?u.rr(0.6,1.0):(tk.isUser?u.rr(5,7):u.rr(0.7,1.5)));\n"
    "          this.emit({type:'ready',sp:this.restartType,team:this.restartTeam,user:tk.isUser&&tk.team===this.userSide&&!this.attract,taker:tk});\n"
    "        }\n"
    "      } else {\n"
    "        tk.moveTarget=null; tk.sprint=false;\n"
    "        if(this.t>this.restartAiTakeAt){ AF.AI.takeSetPiece(this); }\n"
    "      }\n"
    "    }\n"
    "    if(this.state==='restart'){ // still restarting (takeSetPiece may have resumed play)\n"
    "      var b2=this.ball;\n"
    "      b2.owner=null; b2.v.x=0;b2.v.y=0;b2.v.z=0;\n"
    "      b2.p.x=this.restartPos.x; b2.p.z=this.restartPos.z; b2.p.y=CFG.BALL_R;\n"
    "    }\n"
    "  }"
)
new_block = (
    "  // restart taker logic - restarts ALWAYS resolve automatically in ~1-3s\n"
    "  if(this.state==='restart'){\n"
    "    if(this.t-(this.restartStartT||0)>10)this.restartGiveAt=Math.min(this.restartGiveAt||1e9,this.t-0.01);\n"
    "    var tk=this.restartTaker;\n"
    "    if(tk){\n"
    "      if(!this.restartReady){\n"
    "        tk.moveTarget={x:this.restartPos.x,z:this.restartPos.z}; tk.sprint=true;\n"
    "        var arrived=u.dist(tk.pos,this.restartPos)<0.9;\n"
    "        var giveNow=this.t>=(this.restartGiveAt||1e9);\n"
    "        if(arrived||giveNow){\n"
    "          if(giveNow&&!arrived){ tk.pos.x=this.restartPos.x; tk.pos.z=this.restartPos.z; tk.vel.x=0; tk.vel.z=0; }\n"
    "          this.restartReady=true;\n"
    "          this.restartAiTakeAt=this.t+(this.restartAutoDelay||1.0);\n"
    "          this.emit({type:'ready',sp:this.restartType,team:this.restartTeam,user:tk.isUser&&tk.team===this.userSide&&!this.attract,taker:tk});\n"
    "        }\n"
    "      } else {\n"
    "        tk.moveTarget=null; tk.sprint=false;\n"
    "        if(this.t>=this.restartAiTakeAt)this.autoTakeSetPiece();\n"
    "      }\n"
    "    }\n"
    "    if(this.state==='restart'){ // still restarting (auto-take may have resumed play)\n"
    "      var b2=this.ball;\n"
    "      b2.owner=null; b2.v.x=0;b2.v.y=0;b2.v.z=0;\n"
    "      b2.p.x=this.restartPos.x; b2.p.z=this.restartPos.z; b2.p.y=CFG.BALL_R;\n"
    "    }\n"
    "  }"
)
src = patch(src, old_block, new_block, 'restart block rewritten')

# 3. autoTakeSetPiece method
src = patch(
    src,
    "Match.prototype.resumePlay=function(){",
    (
        "/* automatic set-piece resolution: simple restarts hand the ball straight to\n"
        "   the taker so play is live within seconds; kicking set pieces (corner/free\n"
        "   kick/penalty) take their kick automatically. The user can always act earlier. */\n"
        "Match.prototype.autoTakeSetPiece=function(){\n"
        "  var tk=this.restartTaker; if(!tk)return;\n"
        "  var type=this.restartType;\n"
        "  if(type==='kickoff'||type==='throwin'||type==='goalkick'){\n"
        "    this.ball.owner=tk; this.ball.spin=0; this.ball.p.y=CFG.BALL_R;\n"
        "    this.ball.lastTouch=tk; this.ball.lastTouchTeam=tk.team;\n"
        "    tk.kickCd=0;\n"
        "    if(tk.role==='GK')tk.holdT=0.7;\n"
        "    this.resumePlay();\n"
        "    this.emit({type:'inplay',team:tk.team,taker:tk});\n"
        "  } else if(type==='corner'){\n"
        "    this.actCross(tk);\n"
        "  } else if(type==='penalty'){\n"
        "    if(tk.isUser&&this.userSide>=0)this.actShoot(tk,0.85,this.userAim||u.rr(-2.2,2.2));\n"
        "    else AF.AI.takeSetPiece(this);\n"
        "  } else {\n"
        "    AF.AI.takeSetPiece(this);\n"
        "  }\n"
        "};\n"
        "Match.prototype.resumePlay=function(){"
    ),
    'autoTakeSetPiece method',
)

open('js/match.js', 'w').write(src)

# 4. backlog drop in ui_main.js
src = open('js/ui_main.js').read()
old = "    App._acc=steps===24?acc:Math.min(acc,0.05);"
new = "    if(acc>0.35)acc=0.02; // drop unsustainable backlog: stay live instead of slow-motion\n    App._acc=steps===24?acc:Math.min(acc,0.05);"
src = patch(src, old, new, 'backlog drop')
open('js/ui_main.js', 'w').write(src)

print('DONE')
