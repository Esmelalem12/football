/* ============================================================
   AI FOOTBALL — sim: squad generation, player/ball entities, physics
   No DOM / THREE references: fully testable headless.
   ============================================================ */
(function(){
'use strict';
var G=(typeof globalThis!=='undefined')?globalThis:{};
var AF=G.AF=G.AF||{};
var u=AF.util, CFG=AF.CFG;

/* ---- squad generation (stable per club via seed) ---- */
AF.genSquad=function(club, salt){
  var rng=u.mulberry32((club.id+1)*7919+(salt||0)*104729);
  var used={}, out=[];
  for(var i=0;i<AF.SLOTS.length;i++){
    var slot=AF.SLOTS[i];
    // pick names via rng (deterministic)
    var fn=AF.NAME_FIRST[Math.floor(rng()*AF.NAME_FIRST.length)];
    var ln=AF.NAME_LAST[Math.floor(rng()*AF.NAME_LAST.length)];
    var guard=0;
    while(used[ln]&&guard++<40){ ln=AF.NAME_LAST[Math.floor(rng()*AF.NAME_LAST.length)]; }
    used[ln]=1;
    var bias=AF.ROLE_BIAS[slot.role]||{};
    var attrs={};
    ['pace','sho','pas','dri','def','phy'].forEach(function(k){
      var b=club.strength+(bias[k]||0);
      attrs[k]=u.clamp(Math.round(b+(rng()*10-5)),32,93);
    });
    out.push({ role:slot.role, name:fn+' '+ln, num:AF.NUMS[i], attrs:attrs, slotIdx:i });
  }
  return out;
};

/* ---- player entity ---- */
function PlayerSim(o){
  this.id=o.id; this.team=o.team; this.teamObj=o.teamObj;
  this.role=o.role; this.slot=o.slot; this.slotIdx=o.slotIdx;
  this.name=o.name; this.num=o.num||9; this.attrs=o.attrs;
  this.isUser=!!o.isUser;
  this.pos={x:0,z:0}; this.vel={x:0,z:0}; this.facing=0;
  this.userMove=null; this.moveTarget=null; this.sprint=false; this.sprintNow=false;
  this.stamina=100;
  this.state='idle'; this.stateT=0;          // idle | tackle | fall | stumble
  this.tackleCd=0; this.kickCd=0; this.noCtrlT=0; this.headCd=0; this.receiveT=0;
  this.nextThink=0; this.aiLock=null; this.aiLabel=''; this.runMode=''; this.runTarget=null;
  this.holdT=0;                              // GK holding ball
  this.skillMult=1;                          // difficulty scaling (opponent team)
  this.animKick=0;                           // visual kick animation timer
  this.ms={goals:0,assists:0,shots:0,passes:0,passesOk:0,tackles:0,fouls:0,saves:0,lost:0}; // match stats
}
PlayerSim.prototype.maxSpeed=function(){
  var s=5.7+this.attrs.pace*0.032;
  if(this.sprint&&this.stamina>6) s*=1.17;
  s*=this.skillMult;
  if(this.teamObj) s*=this.teamObj.speedMult;
  return s;
};
PlayerSim.prototype.accel=function(){ return (8.5+this.attrs.pace*0.045)*this.skillMult; };
PlayerSim.prototype.gkSkill=function(){ return this.attrs.def*this.skillMult; };

/* integrate one tick. controller (user input or AI) sets userMove/moveTarget/sprint before. */
PlayerSim.prototype.drive=function(dt){
  // timers
  if(this.tackleCd>0)this.tackleCd-=dt;
  if(this.kickCd>0)this.kickCd-=dt;
  if(this.noCtrlT>0)this.noCtrlT-=dt;
  if(this.headCd>0)this.headCd-=dt;
  if(this.receiveT>0)this.receiveT-=dt;
  if(this.animKick>0)this.animKick-=dt;

  var ax=0,az=0, des={x:0,z:0}, want=false;
  if(this.state==='tackle'){
    this.stateT-=dt;
    var k=Math.max(0,this.stateT/0.45);
    des.x=this.vel.x*1.0; des.z=this.vel.z*1.0; want=true;
    if(this.stateT<=0){ this.state='idle'; }
    this.vel.x=u.damp(this.vel.x,des.x,3,dt); this.vel.z=u.damp(this.vel.z,des.z,3,dt);
  } else if(this.state==='fall'||this.state==='stumble'){
    this.stateT-=dt;
    this.vel.x*=Math.exp(-4*dt); this.vel.z*=Math.exp(-4*dt);
    if(this.stateT<=0) this.state='idle';
  } else {
    var mv=null;
    if(this.isUser&&this.userMove){ mv=this.userMove; }
    else if(this.moveTarget){
      var dx=this.moveTarget.x-this.pos.x, dz=this.moveTarget.z-this.pos.z;
      var d=Math.sqrt(dx*dx+dz*dz);
      if(d>0.28){ mv={x:dx/d,z:dz/d}; if(d<1.2){ mv.x*=d/1.2; mv.z*=d/1.2; } }
    }
    if(mv){
      want=true;
      var sp=this.maxSpeed();
      var mlen=Math.sqrt(mv.x*mv.x+mv.z*mv.z);
      if(mlen>1){ mv.x/=mlen; mv.z/=mlen; }
      this.sprintNow=this.sprint&&this.stamina>6;
      des.x=mv.x*sp; des.z=mv.z*sp;
      // user-only: instant redirect when starting or cutting hard (no overspeed)
      if(this.isUser){
        var cs=Math.sqrt(this.vel.x*this.vel.x+this.vel.z*this.vel.z);
        var vdot=this.vel.x*mv.x+this.vel.z*mv.z;
        if(cs<1.6||vdot<cs*sp*0.2){
          var w2=u.clamp(dt*22,0,0.55);
          var tvx=mv.x*Math.max(cs,sp*0.5), tvz=mv.z*Math.max(cs,sp*0.5);
          this.vel.x+=(tvx-this.vel.x)*w2;
          this.vel.z+=(tvz-this.vel.z)*w2;
        }
      }
    } else { this.sprintNow=false; }
    var a=this.accel();
    var resp=this.isUser?(want?1.35:1.0):0.55; // user reacts ~2.4x faster, stops hard
    this.vel.x=u.damp(this.vel.x,des.x,a*resp,dt);
    this.vel.z=u.damp(this.vel.z,des.z,a*resp,dt);
    // absolute speed cap (never exceed 1.25x max speed, even after cuts/kicks)
    var s2=Math.sqrt(this.vel.x*this.vel.x+this.vel.z*this.vel.z);
    var cap=this.maxSpeed()*1.25;
    if(s2>cap&&s2>0.01){ this.vel.x*=cap/s2; this.vel.z*=cap/s2; }
  }
  this.pos.x+=this.vel.x*dt; this.pos.z+=this.vel.z*dt;
  // pitch bounds (small margin)
  var LX=CFG.FIELD.L/2+2.5, LZ=CFG.FIELD.W/2+2.5;
  if(this.role==='GK'){ LX=CFG.FIELD.L/2+1; }
  if(this.pos.x<-LX){this.pos.x=-LX;this.vel.x=0;}
  if(this.pos.x> LX){this.pos.x= LX;this.vel.x=0;}
  if(this.pos.z<-LZ){this.pos.z=-LZ;this.vel.z=0;}
  if(this.pos.z> LZ){this.pos.z= LZ;this.vel.z=0;}
  // facing
  var spd=Math.sqrt(this.vel.x*this.vel.x+this.vel.z*this.vel.z);
  var target=this.facing;
  if(spd>0.6) target=Math.atan2(this.vel.z,this.vel.x);
  else if(this.faceBall){ target=Math.atan2(this.faceBall.z-this.pos.z,this.faceBall.x-this.pos.x); }
  this.facing=u.angDamp(this.facing,target,13,dt);
  // stamina
  if(this.sprintNow) this.stamina=Math.max(0,this.stamina-6*dt);
  else if(spd>2) this.stamina=Math.min(100,this.stamina+1.1*dt);
  else this.stamina=Math.min(100,this.stamina+4.5*dt);
  return spd;
};

/* ---- ball entity ---- */
function BallSim(){
  this.p={x:0,y:CFG.BALL_R,z:0}; this.v={x:0,y:0,z:0};
  this.spin=0; this.owner=null; this.lastTouch=null; this.lastTouchTeam=-1;
  this.kickShieldT=0; this.kickShieldP=null;
}
BallSim.prototype.update=function(dt){
  if(this.kickShieldT>0)this.kickShieldT-=dt;
  if(this.owner){
    var o=this.owner;
    var lead=0.55+(o.sprintNow?0.5:0);
    var tx=o.pos.x+Math.cos(o.facing)*lead;
    var tz=o.pos.z+Math.sin(o.facing)*lead;
    this.v.x=(tx-this.p.x)*9; this.v.z=(tz-this.p.z)*9; this.v.y=0;
    var cap=(o.maxSpeed()||7)*1.4;
    var vl=Math.sqrt(this.v.x*this.v.x+this.v.z*this.v.z);
    if(vl>cap){ this.v.x*=cap/vl; this.v.z*=cap/vl; }
    this.p.x+=this.v.x*dt; this.p.z+=this.v.z*dt; this.p.y=CFG.BALL_R;
    return;
  }
  // free flight
  this.v.y+=CFG.GRAV*dt;
  var drag=Math.exp(-0.10*dt);
  this.v.x*=drag; this.v.z*=drag;
  // magnus (curl)
  if(Math.abs(this.spin)>0.01){
    var sp=Math.sqrt(this.v.x*this.v.x+this.v.z*this.v.z);
    this.v.x+=-this.v.z/sp*this.spin*sp*0.045;
    this.v.z+= this.v.x/sp*this.spin*sp*0.045;
    this.spin*=Math.exp(-0.8*dt);
  }
  this.p.x+=this.v.x*dt; this.p.y+=this.v.y*dt; this.p.z+=this.v.z*dt;
  if(this.p.y<CFG.BALL_R){
    this.p.y=CFG.BALL_R;
    if(this.v.y<-1.2){ this.v.y*=-0.55; if(AF.audio)AF.audio.bounce(); }
    else this.v.y=0;
    var fr=Math.exp(-1.25*dt);
    this.v.x*=fr; this.v.z*=fr;
  }
};
BallSim.prototype.speed2D=function(){ return Math.sqrt(this.v.x*this.v.x+this.v.z*this.v.z); };

/* ---- ball kicking helpers ---- */
AF.Sim={
  /* kick ball from `from` toward `to`. speed = 2D speed. lofted: solve ballistic vy to land on target */
  kick:function(ball,from,to,speed,mode){
    var dx=to.x-from.x, dz=to.z-from.z;
    var d=Math.sqrt(dx*dx+dz*dz)||1e-6;
    var ux=dx/d, uz=dz/d;
    var vy;
    if(mode==='ground') vy=0.4;
    else if(mode==='loft'){ var t=d/Math.max(6,speed); vy=u.clamp(0.5*Math.abs(CFG.GRAV)*t,2,11.5); }
    else if(mode==='chip') vy=u.clamp(0.5*Math.abs(CFG.GRAV)*(d/Math.max(6,speed))*1.25,3,12);
    else vy=u.clamp(d*0.10+1.2,0.8,6.5); // shot: mostly flat
    var vh=Math.sqrt(Math.max(4,speed*speed-vy*vy));
    ball.v.x=ux*vh; ball.v.z=uz*vh; ball.v.y=vy;
    ball.p.x=from.x; ball.p.y=Math.max(CFG.BALL_R,from.y||CFG.BALL_R); ball.p.z=from.z;
    ball.owner=null;
    ball.kickShieldT=0.45;
    ball.lastTouch=null;
  },
  futureXZ:function(ball,t){
    // cheap prediction: exponential ground friction + linear air
    var f=Math.exp(-1.0*Math.min(t,1.4));
    return { x:ball.p.x+ball.v.x*(1-f), z:ball.p.z+ball.v.z*(1-f) };
  },
  interceptPoint:function(p,ball){
    var t=0, pt;
    for(var i=0;i<4;i++){
      pt=AF.Sim.futureXZ(ball,t);
      t=Math.min(2.2,u.dist(p.pos,pt)/(p.maxSpeed()*0.85+0.1));
    }
    return pt||{x:ball.p.x,z:ball.p.z};
  },
  leadPoint:function(p,ball,speed){
    var t=u.dist({x:ball.p.x,z:ball.p.z},p.pos)/Math.max(8,speed);
    return AF.Sim.futureXZ(ball,t*0.8);
  }
};
AF.PlayerSim=PlayerSim;
AF.BallSim=BallSim;
})();
