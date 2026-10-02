/* ============================================================
   AI FOOTBALL — match.js : match controller (rules, actions, stats)
   ============================================================ */
(function(){
'use strict';
var G=(typeof globalThis!=='undefined')?globalThis:{};
var AF=G.AF=G.AF||{};
var u=AF.util, CFG=AF.CFG;

AF.POS_SLOT_MAP={GK:0,LB:1,CB:2,RB:4,CDM:5,CM:6,CAM:7,LW:8,ST:9,RW:10};

function hex2rgb(h){ h=h.replace('#',''); return { r:parseInt(h.substr(0,2),16), g:parseInt(h.substr(2,2),16), b:parseInt(h.substr(4,2),16) }; }
function colorDist(a,b){ var A=hex2rgb(a),B=hex2rgb(b); return Math.abs(A.r-B.r)+Math.abs(A.g-B.g)+Math.abs(A.b-B.b); }

function Match(o){
  this.opts=o;
  // one shared star-signing pool per match so both clubs never sign the same star
  if(AF.FACES&&AF.FACES.stars&&AF.FACES.stars.length){
    var prng=u.mulberry32((o.homeId*13+o.awayId*7+17)+(o.salt||0)*101);
    var pool=[];
    for(var pi=0;pi<AF.FACES.stars.length;pi++)pool.push(pi);
    for(pi=pool.length-1;pi>0;pi--){ var ex=Math.floor(prng()*(pi+1)); var tmp=pool[pi]; pool[pi]=pool[ex]; pool[ex]=tmp; }
    this._starPool=pool;
  }
  this.attract=!!o.attract;
  this.userSide=(o.userSide===0||o.userSide===1)?o.userSide:-1;
  this.diff=AF.DIFFS[o.diffKey||'pro'];
  this.lengthSec=o.lengthSec||360;
  this.timeScale=5400/this.lengthSec;
  this.autoSwitch=o.autoSwitch!==false;
  this.salt=o.salt||0;
  this.t=0; this.gameSec=0; this.half=1;
  this.added1=u.ri(0,60); this.added2=u.ri(45,165);
  this.paused=false;
  this.goals=[]; this.shot=null; this._shotId=0;
  this.lastPass=null; this.passIntent=null;
  this.userCharge=0; this.userAim=0; this.excite=0;
  var home=AF.TEAMS[o.homeId], away=AF.TEAMS[o.awayId];
  this.teams=[this.mkTeam(0,home,+1), this.mkTeam(1,away,-1)];
  // kit clash: away switches to alt kit
  if(colorDist(home.shirt,away.shirt)<160&&colorDist(home.shirt,away.shirt)<colorDist(home.shirt,'#ffffff')){
    this.teams[1].kit={shirt:away.alt, shorts:away.altShorts||'#222222', sock:away.alt};
  } else {
    this.teams[1].kit={shirt:away.shirt, shorts:away.shorts, sock:away.sock};
  }
  this.teams[0].kit={shirt:home.shirt, shorts:home.shorts, sock:home.sock};
  this.ball=new AF.BallSim();
  this.controlled=this.userSide>=0?this.findUserPlayer():null;
  this.ref={pos:{x:0,z:10}};
  var self=this;
  this.act={
    pass:function(p,o){ self.actPass(p,o); },
    through:function(p,o){ self.actThrough(p,o); },
    cross:function(p){ self.actCross(p); },
    shoot:function(p,pw,aim){ self.actShoot(p,pw,aim); },
    tackle:function(p){ self.actTackle(p); },
    clear:function(p){ self.actClear(p); }
  };
  this.firstKick=u.ri(0,1);
  this.setupRestart('kickoff',this.firstKick,{x:0,z:0},true);
}
Match.prototype.emit=function(ev){ ev.match=this; AF.bus.emit('match',ev); };

Match.prototype.mkTeam=function(idx,club,dir){
  var team={ id:idx, club:club, dir:dir, goals:0, players:[], phase:'contest', presser:null, cover:null,
    speedMult:1, noiseMult:1, tackleMult:1, diffTackle:1,
    st:{shots:0,sot:0,passes:0,passesOk:0,tackles:0,fouls:0,corners:0,poss:0},
    kit:{shirt:club.shirt,shorts:club.shorts,sock:club.sock} };
  var squad=AF.genSquad(club,this.salt);
  var gkColor=idx===0?'#ff8f00':'#00acc1';
  for(var i=0;i<squad.length;i++){
    var s=squad[i];
    var p=new AF.PlayerSim({ id:idx*100+i, team:idx, teamObj:team, role:s.role, slot:AF.SLOTS[s.slotIdx], slotIdx:s.slotIdx,
      name:s.name, num:s.num, attrs:s.attrs });
    p.gkColor=gkColor;
    team.players.push(p);
  }
  if(this.userSide>=0&&this.userSide===idx&&this.opts.userSpec){
    var us=this.opts.userSpec;
    var slotIdx=AF.POS_SLOT_MAP[us.pos]!==undefined?AF.POS_SLOT_MAP[us.pos]:9;
    for(i=0;i<team.players.length;i++){
      if(team.players[i].slotIdx===slotIdx){
        var up=new AF.PlayerSim({ id:idx*100+i, team:idx, teamObj:team, role:AF.SLOTS[slotIdx].role, slot:AF.SLOTS[slotIdx], slotIdx:slotIdx,
          name:us.name, num:us.num||10, attrs:us.attrs, isUser:true });
        up.gkColor=gkColor;
        team.players[i]=up; break;
      }
    }
  }
  // difficulty scaling for the AI opponent (and slight boost to user's AI teammates on easy)
  if(this.userSide>=0&&idx!==this.userSide){
    team.speedMult=this.diff.speed; team.noiseMult=this.diff.noise; team.tackleMult=this.diff.tackle;
    team.gkMult=this.diff.gk;
    for(i=0;i<team.players.length;i++)team.players[i].skillMult=this.diff.skill;
  } else {
    team.gkMult=1;
  }
  // ---- faces & world-star signings (face system lives in render.js; degrade gracefully headless) ----
  var frng=u.mulberry32(club.id*977+(this.salt||0)*131+5);
  if(!AF.FACES)AF.FACES={stars:[],randomFace:function(){return null;}};
  var starIdx=this._starPool||[];
  var starBase=idx*3; // home draws first 3, away the next 3
  var starSlots=[9,7,2]; // ST, CAM, CB get the marquee names
  var sUsed=0;
  for(i=0;i<team.players.length;i++){
    var fp=team.players[i];
    if(fp.isUser){ fp.face=AF.FACES.stars.length?AF.FACES.stars[(club.id*3+i)%AF.FACES.stars.length]:null; continue; }
    var sPos=starSlots.indexOf(fp.slotIdx);
    if(sPos>=0&&sUsed<3&&fp.role!=='GK'&&AF.FACES.stars.length>0){
      var star=AF.FACES.stars[starIdx[(starBase+sUsed)%starIdx.length]];
      sUsed++;
      fp.face=star; fp.star=true;
      fp.name=star.name;
      for(var ak in fp.attrs)fp.attrs[ak]=Math.min(95,fp.attrs[ak]+3);
    } else {
      fp.face=AF.FACES.randomFace(frng);
    }
  }
  return team;
};
Match.prototype.findUserPlayer=function(){
  var t=this.teams[this.userSide];
  for(var i=0;i<t.players.length;i++)if(t.players[i].isUser)return t.players[i];
  return t.players[9];
};
Match.prototype.userTeam=function(){ return this.userSide>=0?this.teams[this.userSide]:null; };

/* ---------- restarts / set pieces ---------- */
Match.prototype.setupRestart=function(type,teamIdx,pos,teleport){
  this.state='restart';
  this.restartType=type; this.restartTeam=teamIdx; this.restartPos={x:u.clamp(pos.x,-51.5,51.5),z:u.clamp(pos.z,-33,33)};
  this.restartStartT=this.t;
  var team=this.teams[teamIdx], other=this.teams[1-teamIdx];
  // choose taker
  var taker=null;
  if(type==='kickoff'){
    for(var i=0;i<team.players.length;i++)if(team.players[i].slotIdx===9){taker=team.players[i];break;}
    if(!taker)taker=team.players[9];
  } else if(type==='goalkick'){
    taker=team.players[0];
  } else if(type==='penalty'){
    if(this.userSide===teamIdx)taker=this.findUserPlayer();
    else { var bs=-1; for(i=1;i<team.players.length;i++){ var p=team.players[i]; if(p.attrs.sho>bs){bs=p.attrs.sho;taker=p;} } }
  } else {
    var bd=1e9;
    for(i=1;i<team.players.length;i++){
      var q=team.players[i];
      var d=u.dist(q.pos,this.restartPos);
      if(type==='corner'&&(q.slotIdx===8||q.slotIdx===10))d*=0.5;
      if(d<bd){bd=d;taker=q;}
    }
  }
  this.restartTaker=taker;
  this.restartReady=false;
  var userTaker0=this.userSide===teamIdx&&taker&&taker.isUser&&!this.attract;
  this.restartAutoDelay=userTaker0?2.4:u.rr(0.8,1.3);
  this.restartAiTakeAt=this.t+this.restartAutoDelay;
  this.restartGiveAt=this.t+(userTaker0?3.4:2.4);
  this.ball.owner=null; this.ball.v.x=0;this.ball.v.y=0;this.ball.v.z=0;this.ball.spin=0;
  this.ball.p.x=this.restartPos.x; this.ball.p.z=this.restartPos.z; this.ball.p.y=CFG.BALL_R;
  if(taker&&type==='goalkick')taker.holdT=0.5;
  // positioning
  team.phase='attack'; other.phase='defend';
  for(var ti=0;ti<2;ti++){
    var tm=this.teams[ti];
    for(i=0;i<tm.players.length;i++){
      var p2=tm.players[i];
      if(p2===taker)continue;
      if(type==='kickoff'){
        var lx=Math.min(p2.slot.fx,0.46);
        var lz=p2.slot.fy*24;
        if(p2.slotIdx===9&&ti===teamIdx){ lx=0.505; lz=-1.2; }
        var wp={x:tm.dir*(lx*CFG.FIELD.L-CFG.FIELD.L/2),z:lz};
        if(teleport){ p2.pos.x=wp.x;p2.pos.z=wp.z;p2.vel.x=0;p2.vel.z=0;p2.facing=Math.atan2(-wp.z,-wp.x); }
        p2.moveTarget=wp;
      } else if(type==='penalty'){
        var gx=-tm.dir*CFG.FIELD.L/2;
        var px=p2.pos.x,pz=p2.pos.z;
        var inBox=Math.abs(px-gx)<CFG.FIELD.BOX_D+1.5&&Math.abs(pz)<CFG.FIELD.BOX_W/2+1.5;
        if(inBox&&p2.role!=='GK'){
          px=gx+tm.dir*(CFG.FIELD.BOX_D+2.5); pz=u.clamp(pz,-14,14);
        }
        if(p2.role==='GK'&&tm.id!==teamIdx){ px=gx+tm.dir*0.4; pz=0; }
        if(teleport||inBox){ p2.pos.x=px;p2.pos.z=pz; }
        p2.moveTarget={x:px,z:pz};
      } else {
        var anchor=this.shapeAnchorStatic(p2);
        if(teleport&&type==='kickoff'){}
        p2.moveTarget=anchor;
      }
    }
  }
  // corner: send attackers in
  if(type==='corner'){
    var dir=team.dir, gx2=dir*CFG.FIELD.L/2;
    var attackZ=this.restartPos.z>=0?-1:1;
    var n=0;
    for(i=0;i<team.players.length;i++){
      var at=team.players[i];
      if(at===taker||at.role==='GK'||at.role==='CB')continue;
      if(n<4&&(at.role==='ST'||at.slotIdx===7||at.slotIdx===6||at.role==='LW'||at.role==='RW')){
        at.moveTarget={x:gx2-dir*u.rr(6,13),z:attackZ*u.rr(1,8)}; n++;
      }
    }
  }
  if(teleport&&taker){ taker.pos.x=this.restartPos.x; taker.pos.z=this.restartPos.z; taker.vel.x=0;taker.vel.z=0;
    taker.facing=Math.atan2(-this.restartPos.z,-this.restartPos.x); }
  if(taker&&type==='corner'){ taker.pos.x=this.restartPos.x; taker.pos.z=this.restartPos.z; }
  var userTaker=this.userSide===teamIdx&&taker&&taker.isUser&&!this.attract;
  if(userTaker){ this.controlled=taker; }
  this.emit({type:'setpiece',sp:type,team:teamIdx,user:userTaker,taker:taker});
};
Match.prototype.shapeAnchorStatic=function(p){
  var team=this.teams[p.team], b=this.ball;
  var push=team.phase==='attack'?0.12:-0.16;
  var bl=team.dir>0?(b.p.x+52.5)/105:(52.5-b.p.x)/105;
  var ax=u.clamp(p.slot.fx*0.74+push+bl*0.2-0.1,0.03,0.96);
  var az=u.clamp(p.slot.fy*27+b.p.z*0.2,-30,30);
  return {x:team.dir*(ax*CFG.FIELD.L-CFG.FIELD.L/2),z:az};
};
/* automatic set-piece resolution: simple restarts hand the ball straight to
   the taker so play is live within seconds; kicking set pieces (corner/free
   kick/penalty) take their kick automatically. The user can always act earlier. */
Match.prototype.autoTakeSetPiece=function(){
  var tk=this.restartTaker; if(!tk)return;
  var type=this.restartType;
  if(type==='kickoff'||type==='throwin'||type==='goalkick'){
    this.ball.owner=tk; this.ball.spin=0; this.ball.p.y=CFG.BALL_R;
    this.ball.lastTouch=tk; this.ball.lastTouchTeam=tk.team;
    tk.kickCd=0;
    if(tk.role==='GK')tk.holdT=0.7;
    this.resumePlay();
    this.emit({type:'inplay',team:tk.team,taker:tk});
  } else if(type==='corner'){
    this.actCross(tk);
  } else if(type==='penalty'){
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
};
Match.prototype.resumePlay=function(){
  if(this.state==='restart'){
    this.state='play';
    this.restartTaker=null;
    this.emit({type:'resume'});
  }
};
Match.prototype.userTake=function(kind,power){
  var t=this.restartTaker; if(!t)return;
  var type=this.restartType;
  if(type==='corner'){ this.actCross(t); return; }
  if(type==='penalty'){ this.actShoot(t,power||0.85,this.userAim||u.rr(-2.4,2.4)); return; }
  if(kind==='cross'){ this.actCross(t); return; }
  if(kind==='through'){ this.actThrough(t,{}); return; }
  if(kind==='shot'&&type==='freekick'){ this.actShoot(t,power||0.85,this.userAim||0); return; }
  this.actPass(t,{});
};

/* ---------- actions (shared by user input & AI) ---------- */
Match.prototype.canAct=function(p){ return (this.ball.owner===p)||(this.state==='restart'&&this.restartTaker===p); };
Match.prototype.afterKick=function(p){
  this.ball._lastKicker=p;
  p.kickCd=0.5; p.animKick=0.3;
  if(this.state==='restart')this.resumePlay();
};
Match.prototype.bestPassTarget=function(p,aimDir,through){
  var team=this.teams[p.team], best=null,bs=-1e9;
  for(var i=0;i<team.players.length;i++){
    var t=team.players[i];
    if(t===p)continue;
    if(t.role==='GK')continue;
    var d=u.dist(p.pos,t.pos);
    if(d<3||d>(through?45:38))continue;
    var dx=t.pos.x-p.pos.x, dz=t.pos.z-p.pos.z, dl=Math.sqrt(dx*dx+dz*dz);
    var dirDot=aimDir?(dx/dl)*aimDir.x+(dz/dl)*aimDir.z:0;
    var space=u.len(0,0);
    var sp=1e9;
    var opp=this.teams[1-p.team];
    for(var j=0;j<opp.players.length;j++)sp=Math.min(sp,u.dist(opp.players[j].pos,t.pos));
    var risk=this.laneRisk(p.pos,t.pos,1-p.team);
    var sc=dirDot*2.4+(sp>5?2:sp*0.3)-risk*2.2-(d>28?1.2:0)+((through&&t.job==='run')?2.5:0);
    if(sc>bs){bs=sc;best=t;}
  }
  return best;
};
Match.prototype.laneRisk=function(from,to,oppIdx){
  var opp=this.teams[oppIdx], risk=0;
  var dx=to.x-from.x,dz=to.z-from.z,len=Math.sqrt(dx*dx+dz*dz)||1e-6;
  var ux=dx/len,uz=dz/len;
  for(var i=0;i<opp.players.length;i++){
    var o=opp.players[i];
    var rx=o.pos.x-from.x,rz=o.pos.z-from.z;
    var proj=rx*ux+rz*uz;
    if(proj<0.5||proj>len-0.3)continue;
    var d=u.dist(o.pos,{x:from.x+ux*proj,z:from.z+uz*proj});
    if(d<2)risk+=(2-d)/2;
  }
  return Math.min(1,risk*0.6);
};
Match.prototype.actPass=function(p,opts){
  if(p.kickCd>0||!this.canAct(p))return;
  var b=this.ball, team=this.teams[p.team];
  var to=opts&&opts.to?opts.to:this.bestPassTarget(p,p.isUser?(p.userMove||{x:Math.cos(p.facing),z:Math.sin(p.facing)}):null,false);
  if(!to)return;
  var speed=u.clamp(8+u.dist(p.pos,to.pos)*0.38,10,20);
  var err=(92-p.attrs.pas)*0.004+(opts.gk?0:0);
  var lead=AF.Sim.leadPoint(to,b,speed);
  lead.x+=u.gauss()*err*speed*0.5; lead.z+=u.gauss()*err*speed*0.5;
  lead.x=u.clamp(lead.x,-53,53); lead.z=u.clamp(lead.z,-34,34);
  AF.Sim.kick(b,{x:b.p.x,y:b.p.y,z:b.p.z},lead,speed,'ground');
  b.spin=0;
  b.lastTouch=p; b.lastTouchTeam=p.team;
  to.receiveT=1.5;
  this.passIntent={to:to,team:p.team,t:this.t};
  p.ms.passes++; team.st.passes++;
  this.lastPass={p:p,t:this.t};
  this.emit({type:'kick',power:0.3,player:p});
  this.afterKick(p);
};
Match.prototype.actThrough=function(p,opts){
  if(p.kickCd>0||!this.canAct(p))return;
  var b=this.ball, team=this.teams[p.team], dir=team.dir;
  var to=(opts&&opts.to)||this.bestPassTarget(p,p.isUser?(p.userMove||{x:dir,z:0}):null,true);
  if(!to){this.actPass(p,opts);return;}
  var space=0;
  for(var s=2;s<=12;s+=2){
    var px=to.pos.x+dir*s;
    var blocked=false;
    var opp=this.teams[1-p.team];
    for(var j=0;j<opp.players.length;j++)if(u.dist(opp.players[j].pos,{x:px,z:to.pos.z})<2.5){blocked=true;break;}
    if(blocked)break;
    space=s;
  }
  var target={x:u.clamp(to.pos.x+dir*(4+space*0.7),-52,52),z:u.clamp(to.pos.z+u.gauss()*2,-33,33)};
  var speed=u.clamp(13+u.dist(p.pos,target)*0.35,15,22);
  AF.Sim.kick(b,{x:b.p.x,y:b.p.y,z:b.p.z},target,speed,'ground');
  b.lastTouch=p; b.lastTouchTeam=p.team;
  to.receiveT=2.0;
  this.passIntent={to:to,team:p.team,t:this.t};
  p.ms.passes++; team.st.passes++;
  this.lastPass={p:p,t:this.t};
  this.emit({type:'kick',power:0.45,player:p});
  this.afterKick(p);
};
Match.prototype.actCross=function(p){
  if(p.kickCd>0||!this.canAct(p))return;
  var b=this.ball, team=this.teams[p.team], dir=team.dir;
  var target=null, bd=1e9;
  for(var i=0;i<team.players.length;i++){
    var t=team.players[i];
    if(t===p||t.role==='GK')continue;
    if(team.dir*t.pos.x>38&&Math.abs(t.pos.z)<16){
      var d=u.dist(t.pos,p.pos);
      if(d<bd){bd=d;target=t;}
    }
  }
  if(!target)target={pos:{x:dir*u.rr(40,48),z:u.rr(-7,7)}};
  var aim={x:u.clamp(target.pos.x+dir*2,-52,52),z:u.clamp(target.pos.z*0.8,-10,10)};
  AF.Sim.kick(b,{x:b.p.x,y:b.p.y,z:b.p.z},aim,u.clamp(14+u.dist(p.pos,aim)*0.28,16,24),'loft');
  b.lastTouch=p; b.lastTouchTeam=p.team;
  var nearest=this.nearestTeamMateInBox(p.team);
  if(nearest){ nearest.receiveT=2.0; this.passIntent={to:nearest,team:p.team,t:this.t}; }
  p.ms.passes++; team.st.passes++;
  this.lastPass={p:p,t:this.t};
  this.emit({type:'kick',power:0.5,player:p});
  this.emit({type:'cross',player:p});
  this.afterKick(p);
};
Match.prototype.nearestTeamMateInBox=function(teamIdx){
  var team=this.teams[teamIdx],best=null,bd=1e9;
  for(var i=0;i<team.players.length;i++){
    var t=team.players[i];
    if(t.role==='GK')continue;
    var gx=team.dir*CFG.FIELD.L/2;
    if(team.dir*t.pos.x>gx-team.dir*16.5&&Math.abs(t.pos.z)<20){
      var d=Math.abs(t.pos.z)+Math.abs(gx-team.dir*t.pos.x);
      if(d<bd){bd=d;best=t;}
    }
  }
  return best;
};
Match.prototype.actShoot=function(p,power,aimZ){
  if(p.kickCd>0||!this.canAct(p))return;
  var b=this.ball, team=this.teams[p.team];
  var gx=team.dir*CFG.FIELD.L/2;
  var dGoal=u.dist(p.pos,{x:gx,z:0});
  var press=this.nearestOppDist(p.pos,1-p.team);
  var sigma=(1+dGoal/34)*(1.3-p.attrs.sho*0.009)*(power>0.85?1.5:1)*(press<1.6?1.7:1);
  if(this.restartType==='penalty')sigma*=0.35;
  var aim=u.clamp(aimZ||0,-3.3,3.3)+u.gauss()*sigma*0.9;
  var speed=u.clamp(15+power*13+p.attrs.sho*0.06,16,31);
  AF.Sim.kick(b,{x:b.p.x,y:b.p.y,z:b.p.z},{x:gx,z:aim},speed,'shot');
  b.v.y*= (0.55+power*0.75)+u.gauss()*sigma*0.4;
  b.v.y=u.clamp(b.v.y,-2,9);
  b.lastTouch=p; b.lastTouchTeam=p.team;
  p.ms.shots++; team.st.shots++;
  this.shot={id:++this._shotId,shooter:p,team:p.team,targetTeam:1-p.team,resolved:false,t0:this.t};
  this.emit({type:'kick',power:0.6+power*0.4,player:p});
  this.emit({type:'shot',player:p,power:power,dist:dGoal});
  this.afterKick(p);
};
Match.prototype.actClear=function(p){
  if(p.kickCd>0||!this.canAct(p))return;
  var b=this.ball, team=this.teams[p.team];
  var dir=team.dir;
  var tx=u.clamp(p.pos.x+dir*u.rr(18,34),-51,51);
  var tz=(Math.abs(p.pos.z)>12? -Math.sign(p.pos.z): (u.chance(0.5)?1:-1))*u.rr(8,26);
  AF.Sim.kick(b,{x:b.p.x,y:b.p.y,z:b.p.z},{x:tx,z:tz},u.rr(16,21),'chip');
  b.lastTouch=p; b.lastTouchTeam=p.team;
  this.emit({type:'kick',power:0.7,player:p});
  this.afterKick(p);
};
Match.prototype.nearestOppDist=function(pos,teamIdx){
  var opp=this.teams[teamIdx],best=1e9;
  for(var i=0;i<opp.players.length;i++)best=Math.min(best,u.dist(opp.players[i].pos,pos));
  return best;
};
Match.prototype.actTackle=function(p){
  if(p.tackleCd>0||p.state!=='idle')return;
  p.tackleCd=1.15;
  var b=this.ball;
  // poke a loose ball (only when it is moving away fast; otherwise try to control it)
  var pbd=u.dist(p.pos,b.p);
  if(!b.owner&&pbd<1.4&&b.p.y<0.6&&b.speed2D()>6){
    AF.Sim.kick(b,{x:b.p.x,y:b.p.y,z:b.p.z},{x:p.pos.x+Math.cos(p.facing)*4,z:p.pos.z+Math.sin(p.facing)*4},8,'ground');
    b.lastTouch=p; b.lastTouchTeam=p.team;
    p.kickCd=0.5; p.animKick=0.25;
    this.emit({type:'kick',power:0.25,player:p});
    return;
  }
  var victim=b.owner&&b.owner.team===1-p.team?b.owner:null;
  p.state='tackle'; p.stateT=0.45;
  var tx=victim?victim.pos.x:b.p.x, tz=victim?victim.pos.z:b.p.z;
  var dx=tx-p.pos.x, dz=tz-p.pos.z, dl=Math.sqrt(dx*dx+dz*dz)||1;
  p.vel.x=dx/dl*7; p.vel.z=dz/dl*7;
  if(!victim)return;
  if(victim.role==='GK')return; // keepers can't be tackled when holding
  var facingOk=Math.cos(p.facing)*(dx/dl)+Math.sin(p.facing)*(dz/dl)>0.1;
  var success=0.5+(p.attrs.def-victim.attrs.dri)*0.006+(facingOk?0.12:-0.08);
  if(p.team!==this.userSide&&this.userSide>=0)success*=this.diff.tackle*0.92;
  if(u.chance(u.clamp(success,0.12,0.88))){
    // clean tackle
    b.owner=null;
    b.v.x=Math.cos(p.facing)*5+u.gauss(); b.v.z=Math.sin(p.facing)*5+u.gauss(); b.v.y=0;
    b.lastTouch=p; b.lastTouchTeam=p.team;
    victim.noCtrlT=0.6; victim.state='stumble'; victim.stateT=0.55; victim.ms.lost++;
    p.ms.tackles++; this.teams[p.team].st.tackles++;
    this.emit({type:'tackle',player:p,good:true});
  } else if(u.dist(p.pos,victim.pos)<1.6&&u.chance(0.4-p.attrs.def*0.0015)){
    // foul -> brief freeze, then free kick / penalty
    p.ms.fouls++; this.teams[p.team].st.fouls++;
    victim.state='fall'; victim.stateT=1.0;
    p.state='stumble'; p.stateT=0.8;
    var gxV=-this.teams[victim.team].dir*CFG.FIELD.L/2;
    var inBox=Math.abs(victim.pos.x-gxV)<CFG.FIELD.BOX_D&&Math.abs(victim.pos.z)<CFG.FIELD.BOX_W/2;
    this.emit({type:'foul',player:p,victim:victim,card:u.chance(0.2)?'yellow':null,box:inBox});
    this.audioWhistle('single');
    b.owner=null; b.v.x=0;b.v.y=0;b.v.z=0;
    this.state='foul'; this.stateT=1.0;
    this.foulNext={team:victim.team,box:inBox,pos:{x:victim.pos.x,z:victim.pos.z}};
  } else {
    // beaten by the dribble
    p.state='stumble'; p.stateT=0.8;
    this.emit({type:'tackle',player:p,good:false});
  }
};
Match.prototype.audioWhistle=function(kind){ this.emit({type:'whistle',kind:kind}); };
Match.prototype.addSot=function(teamIdx){ if(this.teams[teamIdx])this.teams[teamIdx].st.sot++; };

/* ---------- possession / first touch / headers ---------- */
Match.prototype.possession=function(){
  var b=this.ball;
  if(b.owner)return;
  for(var ti=0;ti<2;ti++){
    var team=this.teams[ti];
    for(var i=0;i<team.players.length;i++){
      var p=team.players[i];
      if(p.noCtrlT>0||p.kickCd>0||p.state!=='idle')continue;
      if(b.kickShieldT>0&&b._lastKicker===p)continue;
      var d=u.dist(p.pos,b.p);
      var bonusR=this.passIntent&&this.passIntent.to===p?0.85:0;
      if(d<CFG.CONTROL_R+bonusR&&b.p.y<1.55){
        var sp=b.speed2D();
        var isTarget=this.passIntent&&this.passIntent.to===p;
        if(sp>13+p.attrs.dri*0.07||(sp>15&&!isTarget&&u.chance(0.5))){
          b.v.x*=0.3;b.v.z*=0.3;b.v.y*=0.3;
          b.v.x+=u.gauss()*1.6;b.v.z+=u.gauss()*1.6;
          b.p.y=CFG.BALL_R; p.noCtrlT=0.13;
          b.lastTouch=p; b.lastTouchTeam=p.team;
        } else this.capture(p);
        return;
      }
      if(d<1.1&&b.p.y>=1.55&&b.p.y<2.45&&p.headCd<=0&&b.speed2D()>3){
        this.header(p); return;
      }
    }
  }
  // random deflections off bodies
  if(b.speed2D()>12&&b.p.y<1.4){
    for(ti=0;ti<2;ti++){
      var tm=this.teams[ti];
      for(i=0;i<tm.players.length;i++){
        var q=tm.players[i];
        if(b._lastKicker===q)continue;
        if(u.dist(q.pos,b.p)<0.55&&u.chance(0.45)){
          b.v.x*=-0.25; b.v.z=u.rr(-7,7); b.v.y=u.rr(0.5,3);
          b.lastTouch=q; b.lastTouchTeam=q.team; q.noCtrlT=0.1;
          return;
        }
      }
    }
  }
};
Match.prototype.capture=function(p){
  var b=this.ball;
  b.owner=p; b.spin=0; b.lastTouch=p; b.lastTouchTeam=p.team;
  p.receiveT=0;
  p.kickCd=Math.max(p.kickCd,0.22);            // settle the touch before acting
  p.aiLock={until:this.t+0.35,type:'control'}; // one beat of control before AI decisions
  if(p.isUser&&!this.attract)this.emit({type:'youball',player:p});
  if(p.role==='GK'){ p.holdT=u.rr(1.2,1.8); b.p.y=1.0; return; }
  var completing=false;
  if(this.passIntent){
    if(p.team===this.passIntent.team){
      completing=true;
      p.ms.passesOk++; this.teams[p.team].st.passesOk++;
    }
    this.passIntent=null;
  }
  if(this.autoSwitch&&!this.attract&&this.userSide>=0&&p.team===this.userSide&&!p.isUser&&this.controlled){
    var ctrl=this.controlled;
    var ctrlHasBall=ctrl===this.ball.owner;
    var manualGrace=this.t-(this._lastManualSwitchT||-9)<0.9;
    var reason=completing||(!ctrlHasBall&&!manualGrace&&u.dist(ctrl.pos,b.p)>9&&u.dist(p.pos,b.p)<u.dist(ctrl.pos,b.p)*0.55);
    if(reason){
      this.controlled=p; this.emit({type:'switch',player:p});
    }
  }
};
Match.prototype.header=function(p){
  var b=this.ball, team=this.teams[p.team];
  p.headCd=1.0;
  var gx=team.dir*CFG.FIELD.L/2;
  var dGoal=u.dist(p.pos,{x:gx,z:0});
  b.lastTouch=p; b.lastTouchTeam=p.team;
  if(dGoal<19&&Math.abs(p.pos.z)<18){
    AF.Sim.kick(b,{x:b.p.x,y:b.p.y,z:b.p.z},{x:gx,z:u.rr(-3,3)},14+p.attrs.phy*0.06,'shot');
    p.ms.shots++; team.st.shots++;
    this.shot={id:++this._shotId,shooter:p,team:p.team,targetTeam:1-p.team,resolved:false,t0:this.t};
    this.emit({type:'header',player:p,shot:true});
  } else {
    AF.Sim.kick(b,{x:b.p.x,y:b.p.y,z:b.p.z},{x:u.clamp(p.pos.x+team.dir*25,-51,51),z:u.rr(-20,20)},13,'chip');
    this.emit({type:'header',player:p,shot:false});
  }
};

/* ---------- goals & rules ---------- */
Match.prototype.rules=function(){
  var b=this.ball;
  if(b.owner){
    if(Math.abs(b.p.x)>CFG.FIELD.L/2+0.4||Math.abs(b.p.z)>CFG.FIELD.W/2+0.4){ b.owner=null; }
    else return;
  }
  var prev=this.prevBall||b.p;
  // goal?
  if(Math.abs(b.p.x)>CFG.FIELD.L/2+0.12){
    var side=b.p.x>0?1:-1;
    var t=( (side*(CFG.FIELD.L/2))-prev.x*side )/Math.max(0.001,Math.abs(b.p.x-prev.x));
    var zAt=prev.z+(b.p.z-prev.z)*u.clamp(t,0,1);
    var yAt=prev.y+(b.p.y-prev.y)*u.clamp(t,0,1);
    var scoring=-1;
    for(var i=0;i<2;i++)if(this.teams[i].dir===side)scoring=i;
    if(Math.abs(zAt)<3.58&&yAt<2.38&&yAt>-0.2&&scoring>=0){
      this.goal(scoring);
      return;
    }
    // corner or goal kick
    var defTeam=-1;
    for(i=0;i<2;i++)if(this.teams[i].dir===-side)defTeam=i;
    var lt=b.lastTouchTeam;
    if(lt===defTeam){
      this.teams[1-defTeam].st.corners++;
      this.setupRestart('corner',1-defTeam,{x:side*(CFG.FIELD.L/2-0.5),z:zAt>=0?CFG.FIELD.W/2-0.5:-CFG.FIELD.W/2+0.5},false);
    } else {
      this.setupRestart('goalkick',defTeam,{x:side*(CFG.FIELD.L/2-CFG.FIELD.SIX_D-1),z:u.clamp(zAt,-8,8)*0.4},false);
    }
    return;
  }
  if(Math.abs(b.p.z)>CFG.FIELD.W/2+0.15){
    var throwTeam=b.lastTouchTeam>=0?1-b.lastTouchTeam:u.ri(0,1);
    this.setupRestart('throwin',throwTeam,{x:u.clamp(b.p.x,-50,50),z:Math.sign(b.p.z)*(CFG.FIELD.W/2-0.3)},false);
  }
};
Match.prototype.goal=function(teamIdx){
  var b=this.ball;
  var scorer=b.lastTouch||null;
  var own=scorer&&scorer.team!==teamIdx;
  this.teams[teamIdx].goals++;
  this.teams[teamIdx].st.sot++;
  if(scorer&&!own)scorer.ms.goals++;
  if(this.lastPass&&!own&&this.t-this.lastPass.t<8&&this.lastPass.p.team===teamIdx&&this.lastPass.p!==scorer){
    this.lastPass.p.ms.assists++;
  }
  this.goals.push({team:teamIdx,name:scorer?scorer.name:'Own goal',min:Math.max(1,Math.ceil(this.displaySec()/60)),own:own});
  this.lastGoalTeam=teamIdx;
  this.shot=null; this.passIntent=null;
  this.state='goal'; this.stateT=3.4;
  this.emit({type:'goal',team:teamIdx,scorer:scorer,own:own,score:[this.teams[0].goals,this.teams[1].goals]});
};
Match.prototype.displaySec=function(){
  var cap=this.half===1?2700+this.added1:5400+this.added2;
  return Math.min(this.gameSec,cap);
};

/* ---------- main update ---------- */
Match.prototype.update=function(dt,intents){
  if(this.paused)return;
  this.t+=dt;
  if(this.state==='play'||this.state==='restart')this.gameSec+=dt*this.timeScale;
  if(!this.attract&&this.userSide>=0&&intents)this.applyIntents(intents);
  AF.AI.update(this,dt);
  // restart taker logic - restarts ALWAYS resolve automatically in ~1-3s
  if(this.state==='restart'){
    if(this.t-(this.restartStartT||0)>10)this.restartGiveAt=Math.min(this.restartGiveAt||1e9,this.t-0.01);
    var tk=this.restartTaker;
    if(tk){
      if(!this.restartReady){
        tk.moveTarget={x:this.restartPos.x,z:this.restartPos.z}; tk.sprint=true;
        var arrived=u.dist(tk.pos,this.restartPos)<0.9;
        var giveNow=this.t>=(this.restartGiveAt||1e9);
        if(arrived||giveNow){
          if(giveNow&&!arrived){ tk.pos.x=this.restartPos.x; tk.pos.z=this.restartPos.z; tk.vel.x=0; tk.vel.z=0; }
          this.restartReady=true;
          this.restartAiTakeAt=this.t+(this.restartAutoDelay||1.0);
          this.emit({type:'ready',sp:this.restartType,team:this.restartTeam,user:tk.isUser&&tk.team===this.userSide&&!this.attract,taker:tk});
        }
      } else {
        tk.moveTarget=null; tk.sprint=false;
        if(this.t>=this.restartAiTakeAt)this.autoTakeSetPiece();
      }
    }
    if(this.state==='restart'){ // still restarting (auto-take may have resumed play)
      var b2=this.ball;
      b2.owner=null; b2.v.x=0;b2.v.y=0;b2.v.z=0;
      b2.p.x=this.restartPos.x; b2.p.z=this.restartPos.z; b2.p.y=CFG.BALL_R;
    }
  }
  // players
  for(var ti=0;ti<2;ti++){
    var team=this.teams[ti];
    for(var i=0;i<team.players.length;i++)team.players[i].drive(dt);
  }
  this.collide();
  // referee drifts with play
  var b=this.ball;
  var rx=u.clamp(b.p.x*0.8,-45,45), rz=u.clamp(b.p.z+12*(b.p.z>=0?-1:1),-30,30);
  this.ref.pos.x=u.damp(this.ref.pos.x,rx,1.2,dt);
  this.ref.pos.z=u.damp(this.ref.pos.z,rz,1.2,dt);
  if(this.state==='play'){
    this.prevBall={x:b.p.x,y:b.p.y,z:b.p.z};
    b.update(dt);
    if(b.owner&&b.owner.role==='GK'&&b.owner.holdT>0){
      var gk=b.owner;
      b.p.x=gk.pos.x+Math.cos(gk.facing)*0.4; b.p.z=gk.pos.z+Math.sin(gk.facing)*0.4; b.p.y=1.0;
      b.v.x=0;b.v.y=0;b.v.z=0;
    } else {
      this.possession();
    }
    this.rules();
    // possession stats
    var pt=b.owner?b.owner.team:b.lastTouchTeam;
    if(pt>=0)this.teams[pt].st.poss+=dt;
  } else if(this.state==='goal'){
    this.stateT-=dt;
    if(this.stateT<=0){
      this.setupRestart('kickoff',1-this.lastGoalTeam,{x:0,z:0},true);
    }
  } else if(this.state==='foul'){
    this.stateT-=dt;
    if(this.stateT<=0){
      var fn=this.foulNext; this.foulNext=null;
      if(fn){
        if(fn.box)this.setupRestart('penalty',fn.team,{x:this.teams[fn.team].dir*(CFG.FIELD.L/2-CFG.FIELD.SPOT),z:0},false);
        else this.setupRestart('freekick',fn.team,fn.pos,false);
      } else this.state='play';
    }
  }
  // half / full time
  if(this.half===1&&this.gameSec>=2700+this.added1&&(this.state==='play'||this.state==='restart')){
    this.state='half';
    this.audioWhistle('half');
    this.emit({type:'halftime'});
  } else if(this.half===2&&this.gameSec>=5400+this.added2&&(this.state==='play'||this.state==='restart')){
    this.state='full';
    this.audioWhistle('full');
    this.emit({type:'fulltime'});
  }
  if(this.shot&&this.t-this.shot.t0>2.5)this.shot=null;
  // excitement (crowd audio)
  var dg=Math.min(u.dist(b.p,{x:52.5,z:0}),u.dist(b.p,{x:-52.5,z:0}));
  var ex=u.clamp(1-dg/45,0,1)*0.7;
  if(this.state==='goal')ex=1;
  this.excite=u.damp(this.excite,ex,3,dt);
};
Match.prototype.startSecondHalf=function(){
  this.half=2; this.gameSec=2700;
  for(var ti=0;ti<2;ti++){
    var team=this.teams[ti];
    team.dir*=-1;
    for(var i=0;i<team.players.length;i++)team.players[i].stamina=100;
  }
  this.setupRestart('kickoff',1-this.firstKick,{x:0,z:0},true);
};
Match.prototype.collide=function(){
  var all=[];
  for(var ti=0;ti<2;ti++){ var t=this.teams[ti]; for(var i=0;i<t.players.length;i++)all.push(t.players[i]); }
  for(var a=0;a<all.length;a++){
    for(var c=a+1;c<all.length;c++){
      var A=all[a],B=all[c];
      var dx=B.pos.x-A.pos.x,dz=B.pos.z-A.pos.z;
      var d2=dx*dx+dz*dz;
      if(d2<0.36&&d2>0.0001){
        var d=Math.sqrt(d2), push=(0.6-d)/2;
        var ux=dx/d,uz=dz/d;
        A.pos.x-=ux*push;A.pos.z-=uz*push;
        B.pos.x+=ux*push;B.pos.z+=uz*push;
      }
    }
  }
};
Match.prototype.applyIntents=function(it){
  var c=this.controlled; if(!c)return;
  this.userCharge=it.charge||0;
  if(this.state==='restart'&&this.restartTaker===c&&this.restartReady){
    c.userMove=null; c.sprint=false;
    var gx=this.teams[c.team].dir*CFG.FIELD.L/2;
    var gdx=gx-c.pos.x, gdz=-c.pos.z, gl=Math.sqrt(gdx*gdx+gdz*gdz)||1;
    if(it.move){ this.userAim=u.clamp((( -gdz/gl)*it.move.x+(gdx/gl)*it.move.z)*3.4,-3.3,3.3); }
    for(var i=0;i<it.actions.length;i++){
      var a=it.actions[i];
      if(a.t==='pass')this.userTake('pass');
      else if(a.t==='cross')this.userTake('cross');
      else if(a.t==='through')this.userTake('through');
      else if(a.t==='shoot')this.userTake(this.restartType==='freekick'||this.restartType==='penalty'?'shot':'cross',a.power);
    }
    return;
  }
  if(this.state!=='play')return;
  c.userMove=it.move; c.sprint=!!it.sprint;
  var b=this.ball;
  var gx2=this.teams[c.team].dir*CFG.FIELD.L/2;
  var gdx2=gx2-c.pos.x, gdz2=-c.pos.z, gl2=Math.sqrt(gdx2*gdx2+gdz2*gdz2)||1;
  var aim=0;
  if(it.move)aim=u.clamp(((-gdz2/gl2)*it.move.x+(gdx2/gl2)*it.move.z)*3.6,-3.3,3.3);
  for(i=0;i<it.actions.length;i++){
    var act=it.actions[i];
    if(act.t==='switch')this.switchPlayer();
    else if(act.t==='tackle')this.actTackle(c);
    else if(this.canAct(c)){
      if(act.t==='pass')this.actPass(c,{});
      else if(act.t==='through')this.actThrough(c,{});
      else if(act.t==='cross')this.actCross(c);
      else if(act.t==='shoot')this.actShoot(c,act.power,aim);
    }
  }
};
Match.prototype.switchPlayer=function(){
  if(this.userSide<0)return;
  var team=this.teams[this.userSide], b=this.ball;
  var best=null,bs=1e9;
  for(var i=1;i<team.players.length;i++){
    var p=team.players[i];
    if(p===this.controlled)continue;
    var d=u.dist(p.pos,b.p);
    if(d<bs){bs=d;best=p;}
  }
  if(best){ this.controlled=best; this._lastManualSwitchT=this.t; this.emit({type:'switch',player:best}); }
};

/* ---------- ratings & summary ---------- */
Match.prototype.playerRating=function(p){
  var s=p.ms;
  var r=6.0+s.goals*1.1+s.assists*0.7+s.passesOk*0.05+s.tackles*0.3+s.shots*0.04-s.fouls*0.2-s.lost*0.04;
  return u.clamp(Math.round(r*10)/10,3,10);
};
Match.prototype.snapshot=function(){
  var poss0=this.teams[0].st.poss, poss1=this.teams[1].st.poss;
  var tot=Math.max(0.1,poss0+poss1);
  return {
    score:[this.teams[0].goals,this.teams[1].goals],
    clock:u.fmtClock(this.displaySec()), half:this.half,
    poss:[Math.round(poss0/tot*100),Math.round(poss1/tot*100)],
    stats:[this.teams[0].st,this.teams[1].st],
    goals:this.goals,
    userRating:this.userSide>=0&&this.findUserPlayer()?this.playerRating(this.findUserPlayer()):null,
    userStats:this.userSide>=0?this.findUserPlayer().ms:null,
    userTeam:this.userSide
  };
};
AF.Match=Match;
})();
