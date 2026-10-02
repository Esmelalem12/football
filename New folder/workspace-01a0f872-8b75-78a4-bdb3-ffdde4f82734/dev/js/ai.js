/* ============================================================
   AI FOOTBALL — ai.js : situational decision engine
   Every AI player evaluates the match state (score options, pass
   lanes, pressure, space, runs) instead of following scripts.
   ============================================================ */
(function(){
'use strict';
var G=(typeof globalThis!=='undefined')?globalThis:{};
var AF=G.AF=G.AF||{};
var u=AF.util, CFG=AF.CFG;
AF.AI=AF.AI||{};

function localX(team,pos){ return team.dir>0 ? (pos.x+CFG.FIELD.L/2)/CFG.FIELD.L : (CFG.FIELD.L/2-pos.x)/CFG.FIELD.L; }
function worldFromLocal(team,lx,lz){ return { x: team.dir*(lx*CFG.FIELD.L-CFG.FIELD.L/2), z: lz }; }

function nearestOppDist(match,teamIdx,pos){
  var opp=match.teams[1-teamIdx], best=1e9;
  for(var i=0;i<opp.players.length;i++){
    var o=opp.players[i];
    var d=u.dist(o.pos,pos);
    if(d<best)best=d;
  }
  return best;
}
function nearestOppToPoint(match,teamIdx,pos){
  var opp=match.teams[1-teamIdx], best=1e9, bp=null;
  for(var i=0;i<opp.players.length;i++){
    var o=opp.players[i], d=u.dist(o.pos,pos);
    if(d<best){best=d;bp=o;}
  }
  return { d:best, p:bp };
}
/* risk that the pass lane from->to is intercepted (0 open .. 1 blocked) */
function laneRisk(match,teamIdx,from,to){
  var opp=match.teams[1-teamIdx], risk=0;
  var dx=to.x-from.x, dz=to.z-from.z, len=Math.sqrt(dx*dx+dz*dz)||1e-6;
  var ux=dx/len, uz=dz/len;
  for(var i=0;i<opp.players.length;i++){
    var o=opp.players[i];
    var rx=o.pos.x-from.x, rz=o.pos.z-from.z;
    var proj=rx*ux+rz*uz;
    if(proj<0.3||proj>len-0.2)continue;
    var px=from.x+ux*proj, pz=from.z+uz*proj;
    var d=u.dist(o.pos,{x:px,z:pz});
    if(d<2.3) risk+=(2.3-d)/2.3;
  }
  return Math.min(1,risk*0.6);
}
function spaceAhead(match,p,dirX,dirZ,maxD){
  var opp=match.teams[1-p.team];
  var hit=maxD;
  for(var step=1.5;step<=maxD;step+=1.5){
    var px=p.pos.x+dirX*step, pz=p.pos.z+dirZ*step;
    for(var i=0;i<opp.players.length;i++){
      if(u.dist2(opp.players[i].pos,{x:px,z:pz})<3.6){ return step; }
    }
  }
  return hit;
}

/* ---------- team shape: dynamic formation anchor ---------- */
function shapeAnchor(match,p){
  var team=match.teams[p.team], b=match.ball;
  var push = team.phase==='attack'?0.15 : team.phase==='defend'?-0.16 : -0.02;
  // game-state drift: losing teams push forward late, winners drop
  var gd=team.goals-match.teams[1-p.team].goals;
  var fr=match.gameSec/5400;
  push += gd<0&&fr>0.75?0.06 : gd>0&&fr>0.75?-0.04 : 0;
  var bl=localX(team,b.p);
  var ax=u.clamp(p.slot.fx*0.74+push+bl*0.24-0.12,0.03,0.96);
  var az=p.slot.fy*29+b.p.z*0.26;
  if(p.role==='CB'||p.role==='LB'||p.role==='RB'){ az=p.slot.fy*26+b.p.z*0.16; }
  az=u.clamp(az,-30.5,30.5);
  return worldFromLocal(team,ax,az);
}

/* ---------- per-team role assignment ---------- */
function assignDefending(match,team){
  var b=match.ball, opp=match.teams[1-team.id];
  var fut=AF.Sim.futureXZ(b,0.45);
  var cand=[];
  for(var i=0;i<team.players.length;i++){
    var p=team.players[i];
    if(p.role==='GK')continue;
    if(p.isUser)continue;
    cand.push(p);
  }
  cand.sort(function(a,c){ return u.dist2(a.pos,fut)-u.dist2(c.pos,fut); });
  team.presser=cand[0]||null;
  team.cover=cand[1]||null;
  var marked={};
  for(i=0;i<cand.length;i++){
    var p2=cand[i];
    if(p2===team.presser){ p2.job='press'; setLabel(p2,'PRESS'); continue; }
    if(p2===team.cover){ p2.job='cover'; setLabel(p2,'COVER'); continue; }
    // mark nearest unmarked dangerous opponent near my zone
    var anchor=shapeAnchor(match,p2);
    var bm=null,bd=1e9;
    for(var j=0;j<opp.players.length;j++){
      var o=opp.players[j];
      if(o.role==='GK'||marked[o.id])continue;
      var ol=localX(opp,o.pos);
      if(ol>0.62)continue; // only worry about opponents in our half-ish
      var d=u.dist(o.pos,anchor);
      if(d<14&&d<bd){bd=d;bm=o;}
    }
    if(bm&&bd<14){
      marked[bm.id]=1;
      var gx=-team.dir*CFG.FIELD.L/2;
      var mx=bm.pos.x+(gx-bm.pos.x)*0.13, mz=bm.pos.z+(0-bm.pos.z)*0.1;
      p2.job='mark'; p2.markT={x:mx,z:mz}; p2.moveTarget=p2.markT;
      setLabel(p2,'MARK');
    } else {
      p2.job='anchor'; p2.moveTarget=anchor; setLabel(p2,'SHAPE');
    }
  }
}

function assignAttacking(match,team){
  var b=match.ball, owner=b.owner;
  if(!owner||owner.team!==team.id)return;
  var opp=match.teams[1-team.id];
  var ownerL=localX(team,owner.pos);
  // opponent defensive line (deepest outfielder in local coords)
  var line=0;
  for(var i=0;i<opp.players.length;i++){
    var o=opp.players[i];
    if(o.role==='GK')continue;
    var ol=localX(opp,o.pos);
    if(ol>line)line=ol;
  }
  for(i=0;i<team.players.length;i++){
    var p=team.players[i];
    if(p.role==='GK'||p===owner||p.isUser)continue;
    var az=0,ax=0,mode='anchor';
    if(p.role==='LW'||p.role==='RW'||p.role==='ST'){
      // forwards: run in behind when ball advanced
      if(ownerL>0.4){
        ax=u.clamp(line+0.12+u.rr(0,0.05),0.55,0.965);
        az=p.slot.fy*27+b.p.z*0.15;
        mode='run';
      } else { ax=p.slot.fx*0.8+ownerL*0.15+0.06; az=p.slot.fy*29; mode='width'; }
      if((p.role==='LW'||p.role==='RW')&&Math.abs(owner.pos.z)<14&&ownerL>0.62){
        // cut inside toward box when ball central & advanced
        ax=Math.min(0.95,line+0.1); az=(p.slot.fy>0?1:-1)*u.rr(2,7); mode='run';
      }
    } else if(p.role==='CAM'||p.role==='CM'){
      if(ownerL>0.5){
        ax=Math.min(0.9,Math.max(ownerL-0.02,line-0.06)); az=(p.slot.fy>=0?1:-1)*u.rr(4,10); mode='run';
      } else {
        ax=ownerL-0.10; az=(p.slot.fy>=0?1:-1)*u.rr(6,12); mode='support';
      }
    } else if(p.role==='CDM'){
      ax=Math.max(0.22,ownerL-0.22); az=b.p.z*0.3; mode='hold';
    } else { // fullbacks / CBs
      if((p.role==='LB'||p.role==='RB')&&Math.abs(owner.pos.z)>17&&Math.sign(owner.pos.z)===Math.sign(p.slot.fy)&&ownerL>0.35&&u.chance(0.5)){
        ax=Math.min(0.8,ownerL+0.10); az=Math.sign(p.slot.fy)*29; mode='overlap';
      } else {
        var a0=shapeAnchor(match,p); ax=localX(team,a0); az=a0.z; mode='anchor';
      }
    }
    p.job=mode; p.runMode=mode;
    var wp=worldFromLocal(team,u.clamp(ax,0.03,0.965),u.clamp(az,-30.5,30.5));
    if(mode==='anchor'||mode==='hold'){ p.moveTarget=wp; }
    else p.moveTarget=wp;
    setLabel(p, mode==='run'?'RUN IN BEHIND':mode==='support'?'SUPPORT':mode==='overlap'?'OVERLAP':mode==='width'?'HOLD WIDTH':mode==='hold'?'SCREEN':'SHAPE');
  }
}

function assignContest(match,team){
  var b=match.ball, fut=AF.Sim.futureXZ(b,0.4);
  var mine=null,md=1e9,second=null,sd=1e9;
  for(var i=0;i<team.players.length;i++){
    var p=team.players[i];
    if(p.role==='GK'||p.isUser)continue;
    var d=u.dist2(p.pos,fut);
    if(d<md){ second=mine; sd=md; mine=p; md=d; }
    else if(d<sd){ second=p; sd=d; }
  }
  if(mine){ mine.job='chase'; mine.moveTarget=AF.Sim.interceptPoint(mine,b); setLabel(mine,'CLOSE DOWN'); }
  if(second&&sd<64){ second.job='chase'; second.moveTarget=AF.Sim.interceptPoint(second,b); setLabel(second,'BACKUP'); }
}

function setLabel(p,txt){ if(p.aiLabel!==txt)p.aiLabel=txt; }

/* ---------- goalkeeper brain (runs every tick) ---------- */
function gkUpdate(match,gk,dt){
  var team=match.teams[gk.team], b=match.ball;
  var gx=-team.dir*CFG.FIELD.L/2;
  gk.faceBall=b.p;
  if(b.owner===gk){
    setLabel(gk,'DISTRIBUTE');
    gk.moveTarget=null; gk.sprint=false;
    gk.holdT-=dt;
    if(gk.holdT<=0){
      var best=null,bs=-1e9;
      for(var i=0;i<team.players.length;i++){
        var t=team.players[i];
        if(t===gk)continue;
        var d=u.dist(t.pos,gk.pos);
        var space=nearestOppDist(match,gk.team,t.pos);
        var sc=space*1.4-Math.abs(d-16)*0.25+(t.role==='CB'||t.role==='LB'||t.role==='RB'?4:0);
        if(space<4)sc-=20;
        if(sc>bs){bs=sc;best=t;}
      }
      if(best&&bs>3){ match.act.pass(gk,{to:best,gk:true}); }
      else{ match.act.clear(gk); }
    }
    return;
  }
  // shot stopping
  var s=match.shot;
  if(s&&!s.resolved&&s.targetTeam===gk.team){
    var vx=b.v.x;
    var tPlane=Math.abs(vx)>0.5?(gx-b.p.x)/vx:99;
    if(tPlane>0&&tPlane<0.95){
      var zAt=b.p.z+b.v.z*tPlane;
      var yAt=b.p.y+b.v.y*tPlane+0.5*CFG.GRAV*tPlane*tPlane;
      if(Math.abs(zAt)<5.2&&yAt<3.4&&yAt>-0.5){
        s.resolved=true;
        var reach=2.8*(0.5+gk.gkSkill()*0.006)*(gk.teamObj.gkMult||1);
        var dz=Math.abs(zAt-gk.pos.z), dxp=Math.abs(b.p.x-gk.pos.x);
        var react=u.rr(0,1)<(0.35+gk.gkSkill()*0.0055)*(gk.teamObj.gkMult||1);
        if(react&&dz<reach&&dxp<reach+2.5){
          gk.pos.z=u.clamp(gk.pos.z+u.clamp(zAt-gk.pos.z,-reach,reach),-3.5,3.5);
          gk.pos.x=u.clamp(b.p.x+team.dir*0.5,Math.min(gx,gx+team.dir*16),Math.max(gx,gx+team.dir*16));
          var sp=b.speed2D();
          if(sp<15+gk.gkSkill()*0.06&&u.chance(0.5+gk.gkSkill()*0.004)){
            b.owner=gk; b.v.x=0;b.v.y=0;b.v.z=0; b.p.y=1.0;
            gk.holdT=u.rr(1.2,1.9); gk.ms.saves++;
            match.addSot(s.team);
            match.emit({type:'save',player:gk,big:false});
          }else{
            b.v.x=team.dir*u.rr(5,10); b.v.z=(zAt>=0?-1:1)*u.rr(6,13); b.v.y=u.rr(2,6); b.spin=0; b.owner=null;
            gk.ms.saves++;
            match.addSot(s.team);
            match.emit({type:'save',player:gk,big:true});
          }
        }
      }
    }
  }
  // claim loose balls in our box if we can get there first
  if(!b.owner&&dbox(team,b.p)){
    var myT=u.dist(gk.pos,b.p)/Math.max(4,gk.maxSpeed());
    var oppT=1e9, op=null;
    var oppo=match.teams[1-gk.team];
    for(i=0;i<oppo.players.length;i++){ var d0=u.dist(oppo.players[i].pos,b.p)/(oppo.players[i].maxSpeed()); if(d0<oppT){oppT=d0;op=oppo.players[i];} }
    if(myT<oppT+0.2){
      setLabel(gk,'CLAIM!');
      gk.moveTarget=AF.Sim.interceptPoint(gk,b); gk.sprint=true;
      return;
    }
  }
  // standard positioning: on the ball-goal line, off the line by angle
  var dGoal=u.dist(b.p,{x:gx,z:0});
  var out=u.clamp(dGoal*0.11,0.8,5.2);
  var px=gx+(b.p.x-gx)*(out/Math.max(1,dGoal));
  var pz=u.clamp(b.p.z*(out/Math.max(1,dGoal))*1.5,-3.5,3.5);
  gk.moveTarget={x:px,z:pz}; gk.sprint=false;
  setLabel(gk,'SWEEP');
}
function dbox(team,pos){
  var gx=-team.dir*CFG.FIELD.L/2;
  return Math.abs(pos.x-gx)<CFG.FIELD.BOX_D && Math.abs(pos.z)<CFG.FIELD.BOX_W/2;
}

/* ---------- on-ball decision (utility AI) ---------- */
function carrierThink(match,p){
  var team=match.teams[p.team], opp=match.teams[1-p.team], b=match.ball, dir=team.dir;
  var noise=team.noiseMult;
  var lp=localX(team,p.pos);
  var pressD=nearestOppDist(match,p.team,p.pos);
  var gx=dir*CFG.FIELD.L/2;
  var dGoal=u.dist(p.pos,{x:gx,z:0});

  if(p.aiLock&&match.t<p.aiLock.until){ return; }
  p.aiLock=null;

  var best={u:1.7,type:'hold'};
  function cmp(uu,type,extra){
    uu+=u.gauss()*4*noise;
    if(uu>best.u)best={u:uu,type:type,extra:extra};
  }

  // --- SHOOT ---
  if(dGoal<31&&Math.abs(p.pos.z)<22){
    var gkO=opp.players[0];
    var angOpen=1-u.clamp(Math.abs(p.pos.z)/26,0,1)*0.55;
    var xg=u.clamp(1.25*Math.exp(-dGoal/11),0.02,0.9)*angOpen;
    var us=xg*(70+p.attrs.sho*0.6)*(0.9+angOpen*0.3)+(pressD<1.3?-6:4);
    if(dGoal<11)us+=12; else if(dGoal<18)us+=5;
    cmp(us,'shoot');
  }

  // --- PASSES ---
  var i,t;
  for(i=0;i<team.players.length;i++){
    t=team.players[i];
    if(t===p)continue;
    if(t.role==='GK'&&lp>0.45)continue;
    var d=u.dist(p.pos,t.pos);
    if(d<3.5||d>42)continue;
    var prog=localX(team,t.pos)-lp;
    var space=nearestOppDist(match,p.team,t.pos);
    var recv=space<3.5?0:(space>7?1:(space-3.5)/3.5);
    var risk=laneRisk(match,p.team,p.pos,t.pos);
    if(risk>0.72&&pressD>1.5)continue;
    var up=6+prog*16+(recv-0.42)*12-risk*20-Math.max(0,d-26)*0.35;
    if(t.role==='ST'||t.role==='LW'||t.role==='RW')up+=prog>0?3:0;
    if(space<1.6)up-=16; else if(space<2.2)up-=7;
    cmp(up,'pass',{to:t});
    // through ball variant
    if((t.job==='run'||t.runMode==='run')&&prog>0.04){
      var tp=worldFromLocal(team,Math.min(0.96,localX(team,t.pos)+0.13),t.pos.z);
      var behind=spaceAhead(match,t,dir,0,9);
      var ut=up+6+behind*0.8-risk*10;
      cmp(ut,'through',{to:t});
    }
  }
  // --- CROSS ---
  if(Math.abs(p.pos.z)>16&&lp>0.66){
    var boxMen=0,bt=null;
    for(i=0;i<team.players.length;i++){
      t=team.players[i];
      if(t===p||t.role==='GK')continue;
      if(localX(team,t.pos)>0.78&&Math.abs(t.pos.z)<15){ boxMen++; if(!bt||nearestOppDist(match,p.team,t.pos)>3)bt=t; }
    }
    if(boxMen>0){
      var uc=7+boxMen*5+(pressD<2.5?5:0)+(p.attrs.pas-60)*0.06;
      cmp(uc,'cross');
    }
  }
  // --- DRIBBLE ---
  var fwdx=dir, fwdz=u.clamp(-p.pos.z*0.02,-0.3,0.3);
  var fl=Math.sqrt(fwdx*fwdx+fwdz*fwdz); fwdx/=fl; fwdz/=fl;
  var ahead=spaceAhead(match,p,fwdx,fwdz,8);
  var ud=(ahead/8)*15-(pressD<2?(2-pressD)*9:0)+(lp<0.4?-3:0)+((p.role==='LW'||p.role==='RW'||p.role==='CAM')?2.5:0);
  cmp(ud,'dribble');
  // --- CLEAR (panic) ---
  if(lp<0.3&&pressD<2.4){
    cmp(30-pressD*4,'clear');
  }
  // desperate shot in the box under pressure
  if(dGoal<13&&pressD<1.6) cmp(25,'shoot');

  // telemetry
  if(typeof AF._dbg==='object'){
    if(dGoal<26)AF._dbg.nearBox=(AF._dbg.nearBox||0)+1;
    AF._dbg.picks[best.type]=(AF._dbg.picks[best.type]||0)+1;
    if(dGoal<26&&best.type!=='shoot')AF._dbg.nearBoxNoShoot=(AF._dbg.nearBoxNoShoot||0)+1;
  }
  // execute
  var L=p.aiLabel;
  if(best.type==='shoot'){
    var aimZ=0;
    if(opp.players[0]) aimZ=u.clamp(-(Math.sign(opp.players[0].pos.z)||(u.chance(0.5)?1:-1))*u.rr(1.6,3.0),-3.2,3.2);
    match.act.shoot(p,u.clamp(0.5+dGoal*0.018,0.6,1),aimZ);
    setLabel(p,'SHOOTS!');
  } else if(best.type==='pass'){
    match.act.pass(p,{to:best.extra.to}); setLabel(p,'PASS');
  } else if(best.type==='through'){
    match.act.through(p,{to:best.extra.to}); setLabel(p,'THROUGH BALL');
  } else if(best.type==='cross'){
    match.act.cross(p); setLabel(p,'CROSS');
  } else if(best.type==='clear'){
    match.act.clear(p); setLabel(p,'CLEAR');
  } else {
    // carry: steer into space
    p.aiLock={until:match.t+u.rr(0.5,0.85),type:'dribble'};
    carrySteer(match,p);
    if(L!=='DRIBBLE')setLabel(p,'DRIBBLE');
  }
}
function carrySteer(match,p){
  var team=match.teams[p.team], dir=team.dir;
  var bx=dir, bz=u.clamp(-p.pos.z*0.015,-0.25,0.25);
  // avoidance from nearby opponents
  var opp=match.teams[1-p.team];
  for(var i=0;i<opp.players.length;i++){
    var o=opp.players[i], d=u.dist(o.pos,p.pos);
    if(d<5&&d>0.01){ bx+=(p.pos.x-o.pos.x)/d*(5-d)*0.35; bz+=(p.pos.z-o.pos.z)/d*(5-d)*0.35; }
  }
  var l=Math.sqrt(bx*bx+bz*bz)||1; bx/=l; bz/=l;
  var ahead=spaceAhead(match,p,bx,bz,7);
  p.moveTarget={x:u.clamp(p.pos.x+bx*4,-52,52),z:u.clamp(p.pos.z+bz*4,-33,33)};
  p.sprint=ahead>4.5&&p.stamina>22;
}

/* ---------- set-piece AI taker ---------- */
AF.AI.takeSetPiece=function(match){
  var m=match, p=m.restartTaker;
  if(!p)return;
  var type=m.restartType, team=m.teams[p.team], dir=team.dir;
  if(type==='kickoff'){
    var target=null,bd=1e9;
    for(var i=0;i<team.players.length;i++){
      var t=team.players[i];
      if(t===p||t.role==='GK')continue;
      var d=u.dist(t.pos,p.pos);
      if(d<bd&&d>4&&d<25&&localX(team,t.pos)<0.5){bd=d;target=t;}
    }
    if(target)m.act.pass(p,{to:target}); else m.act.clear(p);
  } else if(type==='corner'){
    m.act.cross(p);
  } else if(type==='penalty'){
    var opp0=m.teams[1-p.team].players[0];
    var aim=opp0?u.clamp(-(Math.sign(opp0.pos.z)||1)*u.rr(1.8,3.0),-3.2,3.2):u.rr(-3,3);
    m.act.shoot(p,u.rr(0.75,0.95),aim);
  } else if(type==='freekick'){
    var dGoal=u.dist(p.pos,{x:dir*52.5,z:0});
    if(dGoal<26&&Math.abs(p.pos.z)<16&&u.chance(0.6)){ m.act.shoot(p,0.9,u.rr(-2.6,2.6)); }
    else if(Math.abs(p.pos.z)>19&&localX(team,p.pos)>0.6){ m.act.cross(p); }
    else carrierThinkSafePass(m,p);
  } else if(type==='goalkick'){
    gkUpdateHoldDistribution(m,p);
  } else { // throw-in
    carrierThinkSafePass(m,p);
  }
};
function carrierThinkSafePass(m,p){
  var team=m.teams[p.team],best=null,bs=-1e9;
  for(var i=0;i<team.players.length;i++){
    var t=team.players[i];
    if(t===p||t.role==='GK')continue;
    var d=u.dist(p.pos,t.pos);
    if(d<5||d>32)continue;
    var sc=nearestOppDist(m,p.team,t.pos)*2-laneRisk(m,p.team,p.pos,t.pos)*10-Math.abs(d-14)*0.3;
    if(sc>bs){bs=sc;best=t;}
  }
  if(best)m.act.pass(p,{to:best}); else m.act.clear(p);
}
function gkUpdateHoldDistribution(m,gk){
  gk.holdT=0;
  gkUpdate(m,gk,0.017);
}

/* ---------- main AI update (every sim tick) ---------- */
AF.AI.update=function(match,dt){
  if(!match)return;
  var st=match.state;
  if(st==='full'||st==='half'||st==='goal')return;
  var b=match.ball;
  var ownerTeam=b.owner?b.owner.team:(b.lastTouchTeam>=0?b.lastTouchTeam:-1);
  for(var ti=0;ti<2;ti++){
    var team=match.teams[ti];
    team.phase=ownerTeam===ti?'attack':ownerTeam===1-ti?'defend':'contest';
  }
  if(st==='restart'||st==='kickoff'){
    // everyone holds shape; taker handled by match / takeSetPiece timer
    for(ti=0;ti<2;ti++){
      var team2=match.teams[ti];
      for(var i=0;i<team2.players.length;i++){
        var p=team2.players[i];
        if(p.isUser)continue;
        if(p===match.restartTaker){ if(p.role==='GK'){gkUpdate(match,p,dt);} continue; }
        if(p.role==='GK'){ gkUpdate(match,p,dt); continue; }
        p.sprint=false;
      }
    }
    return;
  }
  // open play
  for(ti=0;ti<2;ti++){
    var team3=match.teams[ti];
    if(team3.phase==='defend')assignDefending(match,team3);
    else if(team3.phase==='attack')assignAttacking(match,team3);
    else assignContest(match,team3);
    if(team3.phase==='contest'&&team3.presser){ team3.presser.job='press'; }
  }
  for(ti=0;ti<2;ti++){
    var team4=match.teams[ti];
    for(var j=0;j<team4.players.length;j++){
      var q=team4.players[j];
      if(q.isUser){ continue; }
      if(q.role==='GK'){ gkUpdate(match,q,dt); continue; }
      if(match.t>=q.nextThink){
        q.nextThink=match.t+u.rr(0.11,0.18);
        if(b.owner===q){ carrierThink(match,q); }
        else {
          // re-assert job targets periodically
          if(q.job==='mark'&&q.markT){ /* tracked live below */ }
        }
      }
      liveSteer(match,q,dt);
    }
  }
};

function liveSteer(match,p,dt){
  var b=match.ball;
  p.faceBall=b.p;
  if(b.owner===p){ // AI carrier always moves with purpose
    carrySteer(match,p);
    return;
  }
  if(p.receiveT>0&&(!b.owner||b.owner.team===1-p.team)){
    p.job='chase';
    p.moveTarget=AF.Sim.interceptPoint(p,b);
    p.sprint=u.dist(p.pos,b.p)>2.2&&p.stamina>15;
    setLabel(p,'RECEIVE');
    return;
  }
  if(p.job==='press'){
    var team=match.teams[p.team];
    var gx=-team.dir*CFG.FIELD.L/2;
    var bx=b.p.x, bz=b.p.z;
    var d=u.dist(p.pos,b.p);
    var tx, tz;
    if(d<6){ tx=bx+(gx-bx)*0.06; tz=bz*0.97; } else { tx=bx; tz=bz; }
    p.moveTarget={x:tx,z:tz};
    p.sprint=d>2.5&&p.stamina>12;
    // AI tackle attempt (rate-limited by think tick + cooldown)
    if(b.owner&&b.owner.team===1-p.team&&d<1.9&&p.tackleCd<=0&&p.state==='idle'){
      var pr=0.36+(p.attrs.def-60)*0.004;
      if(p.team!==match.userSide)pr*=p.teamObj.tackleMult||1;
      if(u.chance(pr*0.5)) match.act.tackle(p);
    }
    return;
  }
  if(p.job==='chase'){
    p.moveTarget=AF.Sim.interceptPoint(p,b);
    p.sprint=u.dist(p.pos,b.p)>2.5&&p.stamina>15;
    return;
  }
  if(p.job==='mark'&&p.markT){
    var opp=match.teams[1-p.team];
    // follow nearest unmarked opp close to mark point
    var bm=null,bd=1e9;
    for(var i=0;i<opp.players.length;i++){
      var o=opp.players[i];
      if(o.role==='GK')continue;
      var d2=u.dist(o.pos,p.markT);
      if(d2<6&&d2<bd){bd=d2;bm=o;}
    }
    if(bm){
      var gx2=-match.teams[p.team].dir*CFG.FIELD.L/2;
      p.moveTarget={x:bm.pos.x+(gx2-bm.pos.x)*0.09,z:bm.pos.z*0.95};
      p.sprint=u.dist(p.pos,p.moveTarget)>3;
    } else p.moveTarget=p.markT;
    return;
  }
  if(p.job==='cover'&&match.ball.owner&&match.ball.owner.team===1-p.team){
    var own=match.ball.owner;
    var gx3=-match.teams[p.team].dir*CFG.FIELD.L/2;
    var cx=own.pos.x+(gx3-own.pos.x)*0.14, cz=own.pos.z*0.9;
    p.moveTarget={x:cx,z:cz}; p.sprint=u.dist(p.pos,{x:cx,z:cz})>4;
    return;
  }
  // run/support/width/overlap/anchor: moveTarget already set by assignment
  if(p.moveTarget){
    p.sprint=(p.job==='run'||p.job==='overlap'||p.job==='chase')&&p.stamina>20;
  }
}
})();
