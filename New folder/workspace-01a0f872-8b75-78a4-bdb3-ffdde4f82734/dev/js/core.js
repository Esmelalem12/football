/* ============================================================
   AI FOOTBALL: RISE TO GLORY — core: utils, config, audio
   ============================================================ */
(function(){
'use strict';
var G = (typeof globalThis!=='undefined')?globalThis:{};
var AF = G.AF = G.AF || {};

/* ---------------- utilities ---------------- */
var u = AF.util = {};
u.clamp = function(v,a,b){ return v<a?a:(v>b?b:v); };
u.lerp  = function(a,b,t){ return a+(b-a)*t; };
u.damp  = function(a,b,k,dt){ return u.lerp(a,b,1-Math.exp(-k*dt)); };
u.len   = function(x,z){ return Math.sqrt(x*x+z*z); };
u.dist  = function(a,b){ var dx=a.x-b.x,dz=a.z-b.z; return Math.sqrt(dx*dx+dz*dz); };
u.dist2 = function(a,b){ var dx=a.x-b.x,dz=a.z-b.z; return dx*dx+dz*dz; };
u.normAng=function(a){ while(a>Math.PI)a-=2*Math.PI; while(a<-Math.PI)a+=2*Math.PI; return a; };
u.angLerp=function(a,b,t){ return a+u.normAng(b-a)*t; };
u.angDamp=function(a,b,k,dt){ return u.angLerp(a,b,1-Math.exp(-k*dt)); };
u.rand  = function(){ return Math.random(); };
u.rr    = function(a,b){ return a+Math.random()*(b-a); };
u.ri    = function(a,b){ return Math.floor(a+Math.random()*(b-a+1)); };
u.chance=function(p){ return Math.random()<p; };
u.pick  = function(arr){ return arr[Math.floor(Math.random()*arr.length)]; };
u.gauss = function(){ return (Math.random()+Math.random()+Math.random()-1.5)/1.5; };
u.mulberry32=function(seed){ var t=seed>>>0; return function(){ t+=0x6D2B79F5; var r=Math.imul(t^(t>>>15),1|t); r^=r+Math.imul(r^(r>>>7),61|r); return ((r^(r>>>14))>>>0)/4294967296; }; };
u.fmtClock=function(sec){ sec=Math.max(0,Math.floor(sec)); var m=Math.floor(sec/60); var s=sec%60; return (m<10?'0':'')+m+':'+(s<10?'0':'')+s; };
u.esc=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
u.mix=function(c1,c2,t){ return { r:u.lerp(c1.r,c2.r,t), g:u.lerp(c1.g,c2.g,t), b:u.lerp(c1.b,c2.b,t) }; };

/* ---------------- event bus ---------------- */
var bus = AF.bus = { _:{} };
bus.on = function(t,f){ (bus._[t]=bus._[t]||[]).push(f); return f; };
bus.off = function(t,f){ var l=bus._[t]; if(l){ var i=l.indexOf(f); if(i>=0)l.splice(i,1); } };
bus.emit = function(t,d){ var l=bus._[t]; if(l){ for(var i=0;i<l.length;i++){ try{ l[i](d); }catch(e){ if(typeof console!=='undefined')console.error(e); } } } };

/* ---------------- configuration ---------------- */
AF.CFG = {
  FIELD:{ L:105, W:68, GOAL_W:7.32, GOAL_H:2.44, BOX_D:16.5, BOX_W:40.32, SIX_D:5.5, SIX_W:18.32, SPOT:11, CIRCLE:9.15 },
  BALL_R:0.15,
  CONTROL_R:1.5,
  GRAV:-23
};

AF.DIFFS = {
  amateur:{ key:'amateur', label:'Amateur',   skill:0.80, speed:0.94, noise:1.9, gk:0.85, tackle:0.75, press:0.85 },
  pro:    { key:'pro',     label:'Pro',       skill:0.92, speed:1.00, noise:1.0, gk:1.00, tackle:1.00, press:1.00 },
  world:  { key:'world',   label:'World Class',skill:1.02, speed:1.04, noise:0.7, gk:1.14, tackle:1.12, press:1.10 },
  legend: { key:'legend',  label:'Legend',    skill:1.10, speed:1.08, noise:0.5, gk:1.28, tackle:1.25, press:1.22 }
};

/* 8-club league. strength ~ overall rating. alt = away kit when colours clash */
AF.TEAMS = [
  { id:0, name:'Addis United',    short:'ADD', strength:62, shirt:'#c62828', shorts:'#ffffff', sock:'#c62828', alt:'#1a1a1a', altShorts:'#1a1a1a', crest:'#c62828' },
  { id:1, name:'Rift Valley FC',  short:'RVF', strength:64, shirt:'#2e7d32', shorts:'#ffffff', sock:'#2e7d32', alt:'#f5f5f5', altShorts:'#2e7d32', crest:'#2e7d32' },
  { id:2, name:'Blue Nile SC',    short:'BNL', strength:66, shirt:'#1565c0', shorts:'#0d3c73', sock:'#1565c0', alt:'#ffd54f', altShorts:'#0d3c73', crest:'#1565c0' },
  { id:3, name:'Nairobi Stars',   short:'NBO', strength:68, shirt:'#f9a825', shorts:'#212121', sock:'#f9a825', alt:'#fafafa', altShorts:'#212121', crest:'#f9a825' },
  { id:4, name:'Lagos City',      short:'LAG', strength:71, shirt:'#4fc3f7', shorts:'#ffffff', sock:'#4fc3f7', alt:'#263238', altShorts:'#263238', crest:'#4fc3f7' },
  { id:5, name:'Accra Warriors',  short:'ACC', strength:74, shirt:'#b71c1c', shorts:'#1a1a1a', sock:'#b71c1c', alt:'#e8e8e8', altShorts:'#b71c1c', crest:'#b71c1c' },
  { id:6, name:'Dakar Saints',    short:'DAK', strength:77, shirt:'#f5f5f5', shorts:'#2e7d32', sock:'#f5f5f5', alt:'#1b5e20', altShorts:'#1b5e20', crest:'#2e7d32' },
  { id:7, name:'Cairo Kings',     short:'CAI', strength:82, shirt:'#d4af37', shorts:'#12143c', sock:'#d4af37', alt:'#7b1fa2', altShorts:'#12143c', crest:'#d4af37' }
];

/* 4-3-3 formation slots: fx 0=own goal..1=opp goal, fy -1=left..1=right (attacking frame) */
AF.SLOTS = [
  { role:'GK',  fx:0.030, fy:0.00 },
  { role:'LB',  fx:0.190, fy:-0.72 },
  { role:'CB',  fx:0.140, fy:-0.24 },
  { role:'CB',  fx:0.140, fy:0.24 },
  { role:'RB',  fx:0.190, fy:0.72 },
  { role:'CDM', fx:0.300, fy:0.00 },
  { role:'CM',  fx:0.400, fy:-0.42 },
  { role:'CAM', fx:0.470, fy:0.30 },
  { role:'LW',  fx:0.620, fy:-0.80 },
  { role:'ST',  fx:0.690, fy:0.05 },
  { role:'RW',  fx:0.620, fy:0.80 }
];
AF.NUMS = [1,3,4,5,2,6,8,10,11,9,7];

AF.ROLE_BIAS = {
  GK: { pace:-8,  sho:-25, pas:-8, dri:-20, def:12,  phy:6  },
  LB: { pace:8,   sho:-14, pas:0,  dri:-2,  def:8,   phy:0  },
  CB: { pace:-2,  sho:-20, pas:-6, dri:-10, def:12,  phy:8  },
  RB: { pace:8,   sho:-14, pas:0,  dri:-2,  def:8,   phy:0  },
  CDM:{ pace:0,   sho:-8,  pas:4,  dri:-2,  def:10,  phy:6  },
  CM: { pace:0,   sho:-2,  pas:6,  dri:2,   def:0,   phy:0  },
  CAM:{ pace:2,   sho:3,   pas:7,  dri:5,   def:-6,  phy:-2 },
  LW: { pace:8,   sho:2,   pas:2,  dri:8,   def:-16, phy:-4 },
  ST: { pace:6,   sho:10,  pas:-2, dri:4,   def:-20, phy:2  },
  RW: { pace:8,   sho:2,   pas:2,  dri:8,   def:-16, phy:-4 }
};

/* career start attribute templates per playing position */
AF.POS_TEMPLATES = {
  ST: { pace:70, sho:66, pas:55, dri:64, def:42, phy:60 },
  LW: { pace:73, sho:58, pas:57, dri:68, def:40, phy:54 },
  RW: { pace:73, sho:58, pas:57, dri:68, def:40, phy:54 },
  CAM:{ pace:64, sho:60, pas:68, dri:67, def:44, phy:55 },
  CM: { pace:62, sho:55, pas:68, dri:62, def:55, phy:60 },
  CDM:{ pace:60, sho:48, pas:64, dri:56, def:66, phy:68 },
  LB: { pace:68, sho:45, pas:58, dri:56, def:64, phy:62 },
  RB: { pace:68, sho:45, pas:58, dri:56, def:64, phy:62 },
  CB: { pace:60, sho:40, pas:52, dri:48, def:68, phy:70 }
};
AF.POS_LIST = ['ST','LW','RW','CAM','CM','CDM','LB','CB','RB'];
AF.ATTR_INFO = [
  { k:'pace', label:'Pace' },
  { k:'sho',  label:'Shooting' },
  { k:'pas',  label:'Passing' },
  { k:'dri',  label:'Dribbling' },
  { k:'def',  label:'Defending' },
  { k:'phy',  label:'Physical' }
];

AF.NAME_FIRST = ['Kofi','Abebe','Tariq','Jomo','Segun','Kwame','Marius','Ibrahim','Yusuf','Dani','Lucas','Marco','Rafa','Emeka','Tunde','Selam','Awet','Hirut','Nia','Sadio','Ismael','Omar','Riyad','Yaya','Didier','Samuel','Elias','Dawit','Jonas','Pierre','Karim','Cheikh','Femi','Baraka','Zewditu','Amina','Grace','Fatou','Leyla','Theo'];
AF.NAME_LAST  = ['Bekele','Haile','Okafor','Mensah','Diallo','Traore','Keita','Osei','Boateng','Mutua','Kimani','Adebayo','Eze','Ndiaye','Sanogo','Tesfaye','Girma','Abebe','Desta','Silva','Costa','Moreau','Keller','Rossi','Novak','Berg','Duval','Kone','Camara','Mbaye','Owusu','Asante','Nkemdi','Farah','Wolde','Jallow','Sesay','Cisse','Toure','Mwangi'];

/* ---------------- settings ---------------- */
AF.SETTINGS_KEY = 'afrtg_settings_v2';
AF.defaultSettings = function(){
  return { length:360, difficulty:'pro', camMode:'follow', quality:'auto', sound:true, autoswitch:true, aiLabels:false, radar:true };
};
AF.loadSettings = function(){
  var s = AF.defaultSettings();
  try{
    var raw = (typeof localStorage!=='undefined') ? localStorage.getItem(AF.SETTINGS_KEY) : null;
    if(raw){ var o = JSON.parse(raw); for(var k in s){ if(o[k]!==undefined) s[k]=o[k]; } }
  }catch(e){}
  return s;
};
AF.saveSettings = function(s){
  try{ if(typeof localStorage!=='undefined') localStorage.setItem(AF.SETTINGS_KEY, JSON.stringify(s)); }catch(e){}
};

/* ---------------- procedural audio ---------------- */
function AudioSys(){
  this.ctx=null; this.enabled=true; this.ok=false;
  this.crowdGain=null; this.crowdTarget=0.05; this.excite=0;
}
AudioSys.prototype.init=function(){
  if(this.ctx) return;
  try{
    var AC = G.AudioContext||G.webkitAudioContext; if(!AC) return;
    this.ctx = new AC();
    var ctx=this.ctx;
    this.master = ctx.createGain(); this.master.gain.value=0.9; this.master.connect(ctx.destination);
    // crowd: two filtered noise layers
    var len = ctx.sampleRate*2;
    var buf = ctx.createBuffer(1,len,ctx.sampleRate);
    var d = buf.getChannelData(0);
    for(var i=0;i<len;i++) d[i]=Math.random()*2-1;
    this.noiseBuf=buf;
    var mk=function(freq,q,g0){
      var src=ctx.createBufferSource(); src.buffer=buf; src.loop=true;
      var f=ctx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=freq; f.Q.value=q;
      var g=ctx.createGain(); g.gain.value=g0;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      return g;
    }.bind(this);
    this.crowdGain = mk(420,0.45,0.05);
    this.crowdGain2 = mk(190,0.6,0.05);
    this.ok=true;
  }catch(e){ this.ctx=null; this.ok=false; }
};
AudioSys.prototype.resume=function(){ if(this.ctx&&this.ctx.state==='suspended'){ try{this.ctx.resume();}catch(e){} } };
AudioSys.prototype.setEnabled=function(on){ this.enabled=!!on; if(this.master) this.master.gain.value=on?0.9:0; };
AudioSys.prototype.update=function(dt,excite){
  if(!this.ok) return;
  this.excite = u.damp(this.excite, excite||0, 2.5, dt);
  var g = 0.045 + this.excite*0.16;
  try{
    this.crowdGain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.25);
    this.crowdGain2.gain.setTargetAtTime(0.045+this.excite*0.10, this.ctx.currentTime, 0.3);
  }catch(e){}
};
AudioSys.prototype._env=function(node,t0,a,peak,dec){ var g=this.ctx.createGain(); g.gain.setValueAtTime(0.0001,t0); g.gain.exponentialRampToValueAtTime(peak,t0+a); g.gain.exponentialRampToValueAtTime(0.0001,t0+a+dec); node.connect(g); g.connect(this.master); return g; };
AudioSys.prototype.kick=function(power){
  if(!this.ok||!this.enabled) return; var ctx=this.ctx,t=ctx.currentTime;
  var o=ctx.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(120,t); o.frequency.exponentialRampToValueAtTime(45,t+0.12);
  this._env(o,t,0.005,0.25+0.3*power,0.14); o.start(t); o.stop(t+0.2);
  var n=ctx.createBufferSource(); n.buffer=this.noiseBuf;
  var f=ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=900;
  n.connect(f); this._env(f,t,0.002,0.12+0.15*power,0.07); n.start(t); n.stop(t+0.12);
};
AudioSys.prototype.bounce=function(){
  if(!this.ok||!this.enabled) return; var ctx=this.ctx,t=ctx.currentTime;
  var o=ctx.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(180,t); o.frequency.exponentialRampToValueAtTime(80,t+0.06);
  this._env(o,t,0.003,0.06,0.06); o.start(t); o.stop(t+0.1);
};
AudioSys.prototype.whistle=function(kind){
  if(!this.ok||!this.enabled) return; var ctx=this.ctx;
  var times = kind==='full'?[0,0.35,0.7]:(kind==='half'?[0,0.35]:[0]);
  for(var i=0;i<times.length;i++){
    var t=ctx.currentTime+times[i];
    var o=ctx.createOscillator(); o.type='square'; o.frequency.value=2350;
    var lfo=ctx.createOscillator(); lfo.frequency.value=38; var lg=ctx.createGain(); lg.gain.value=120;
    lfo.connect(lg); lg.connect(o.frequency);
    this._env(o,t,0.01,0.08, times.length>1?0.22:0.55);
    o.start(t); o.stop(t+0.9); lfo.start(t); lfo.stop(t+0.9);
  }
};
AudioSys.prototype.cheer=function(big){
  if(!this.ok||!this.enabled) return; var ctx=this.ctx,t=ctx.currentTime;
  var n=ctx.createBufferSource(); n.buffer=this.noiseBuf; n.loop=true;
  var f=ctx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=750; f.Q.value=0.4;
  n.connect(f);
  var g=ctx.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(big?0.5:0.22,t+0.25); g.gain.exponentialRampToValueAtTime(0.0001,t+(big?3.2:1.4));
  f.connect(g); g.connect(this.master); n.start(t); n.stop(t+3.6);
};
AudioSys.prototype.horn=function(){
  if(!this.ok||!this.enabled) return; var ctx=this.ctx,t=ctx.currentTime;
  var self=this;
  [220,277,330].forEach(function(fr){
    var o=ctx.createOscillator(); o.type='sawtooth'; o.frequency.value=fr;
    self._env(o,t,0.03,0.05,0.7); o.start(t); o.stop(t+0.8);
  });
};
AudioSys.prototype.click=function(){
  if(!this.ok||!this.enabled) return; var ctx=this.ctx,t=ctx.currentTime;
  var o=ctx.createOscillator(); o.type='triangle'; o.frequency.setValueAtTime(900,t); o.frequency.exponentialRampToValueAtTime(500,t+0.05);
  this._env(o,t,0.002,0.05,0.05); o.start(t); o.stop(t+0.09);
};
AF.audio = new AudioSys();
})();
