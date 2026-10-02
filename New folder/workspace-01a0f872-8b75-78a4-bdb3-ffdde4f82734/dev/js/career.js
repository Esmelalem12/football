/* ============================================================
   AI FOOTBALL — career.js : "Rise to Glory" career mode
   ============================================================ */
(function(){
'use strict';
var G=(typeof globalThis!=='undefined')?globalThis:{};
var AF=G.AF=G.AF||{};
var u=AF.util;

var SAVE_KEY='afrtg_career_v1';
var CLUB_COUNT=AF.TEAMS.length;
var XP_BASE=60, XP_PER_LEVEL=18;

function Career(){ this.data=null; this.storageOK=true; }
Career.prototype.xpNeed=function(level){ return XP_BASE+level*XP_PER_LEVEL; };

Career.prototype.new=function(opts){
  var attrs={};
  var tpl=AF.POS_TEMPLATES[opts.pos]||AF.POS_TEMPLATES.ST;
  for(var k in tpl)attrs[k]=tpl[k];
  this.data={
    v:1, name:opts.name||'New Talent', pos:opts.pos||'ST', num:{ST:9,LW:11,RW:7,CAM:10,CM:8,CDM:6,LB:3,RB:2,CB:4}[opts.pos]||9,
    attrs:attrs, xp:0, level:1, pts:0,
    season:1, clubId:0, round:0,
    seasonStats:{apps:0,goals:0,assists:0,ratings:[]},
    history:[], trophies:[], offers:[],
    diff:opts.diff||'pro'
  };
  this._genFixtures();
  this._initTable();
  return this.data;
};
Career.prototype._initTable=function(){
  var rows={};
  for(var i=0;i<CLUB_COUNT;i++)rows[i]={clubId:i,p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0};
  this.data.table=rows;
};
/* double round robin via circle method */
Career.prototype._genFixtures=function(){
  var n=CLUB_COUNT, rounds=[], ids=[];
  for(var i=0;i<n;i++)ids.push(i);
  var rng=u.mulberry32(this.data.season*7717+13);
  for(i=0;i<40;i++){ var a=Math.floor(rng()*n), b=Math.floor(rng()*n); var tmp=ids[a]; ids[a]=ids[b]; ids[b]=tmp; }
  var half=n/2;
  for(var r=0;r<n-1;r++){
    var round=[];
    for(i=0;i<half;i++){
      var h=ids[i], a2=ids[n-1-i];
      round.push((r%2===0)?[h,a2]:[a2,h]);
    }
    rounds.push(round);
    var fixed=ids[0];
    ids.splice(0,1); ids.push(ids.shift()); ids.unshift(fixed);
  }
  var mirrored=rounds.map(function(rd){ return rd.map(function(fx){ return [fx[1],fx[0]]; }); });
  this.data.fixtures=rounds.concat(mirrored);
};
Career.prototype.club=function(){ return AF.TEAMS[this.data.clubId]; };
Career.prototype.nextFixture=function(){
  var d=this.data, fx=d.fixtures[d.round];
  if(!fx)return null;
  for(var i=0;i<fx.length;i++)if(fx[i][0]===d.clubId||fx[i][1]===d.clubId)return {home:fx[i][0],away:fx[i][1],round:d.round};
  return null;
};
Career.prototype.strengthOf=function(clubId){ return AF.TEAMS[clubId].strength; };
Career.prototype.userOverall=function(){
  var a=this.data.attrs, sum=0, n=0;
  for(var k in a){ sum+=a[k]; n++; }
  return Math.round(sum/n);
};
/* apply the user's played match + simulate the rest of the round */
Career.prototype.applyMatch=function(played){
  var d=this.data;
  var fx=this.nextFixture();
  var myHome=fx.home===d.clubId;
  var gf=myHome?played.gf:played.ga, ga=myHome?played.ga:played.gf;
  var me=d.table[d.clubId], opp=d.table[myHome?fx.away:fx.home];
  me.p++; opp.p++; me.gf+=gf; me.ga+=ga; opp.gf+=ga; opp.ga+=gf;
  if(gf>ga){me.w++;me.pts+=3;opp.l++;}
  else if(gf<ga){opp.w++;opp.pts+=3;me.l++;}
  else{me.d++;opp.d++;me.pts++;opp.pts++;}
  // season stats & xp
  var ss=d.seasonStats;
  ss.apps++; ss.goals+=played.goals; ss.assists+=played.assists; ss.ratings.push(played.rating);
  var res=gf>ga?'W':gf<ga?'L':'D';
  var xpGain=Math.round(played.rating*8+played.goals*22+played.assists*14+(res==='W'?16:res==='D'?8:3));
  var levelUps=0;
  d.xp+=xpGain;
  while(d.xp>=this.xpNeed(d.level)){ d.xp-=this.xpNeed(d.level); d.level++; d.pts+=2; levelUps++; }
  d.round++;
  this._simRestOfRound(fx);
  return {xpGain:xpGain, levelUps:levelUps, res:res};
};
Career.prototype._simRestOfRound=function(except){
  var d=this.data, fx=d.fixtures[except.round];
  for(var i=0;i<fx.length;i++){
    var f=fx[i];
    if(f[0]===except.home&&f[1]===except.away)continue;
    var g=this._simScore(f[0],f[1]);
    var h=d.table[f[0]], a=d.table[f[1]];
    h.p++;a.p++;h.gf+=g[0];h.ga+=g[1];a.gf+=g[1];a.ga+=g[0];
    if(g[0]>g[1]){h.w++;h.pts+=3;a.l++;}
    else if(g[0]<g[1]){a.w++;a.pts+=3;h.l++;}
    else{h.d++;a.d++;h.pts++;a.pts++;}
  }
};
Career.prototype._simScore=function(h,a){
  var dh=this.strengthOf(h)-this.strengthOf(a);
  var xh=u.clamp(1.35+dh*0.05,0.2,4), xa=u.clamp(1.15-dh*0.05,0.15,3.5);
  return [this._poisson(xh),this._poisson(xa)];
};
Career.prototype._poisson=function(lambda){
  var L=Math.exp(-lambda),k=0,p=1;
  do{ k++; p*=Math.random(); }while(p>L);
  return k-1;
};
Career.prototype.sortedTable=function(){
  var d=this.data, rows=[];
  for(var k in d.table)rows.push(d.table[k]);
  rows.sort(function(a,b){
    if(b.pts!==a.pts)return b.pts-a.pts;
    var gda=b.gf-b.ga, gdd=a.gf-a.ga;
    if(gda!==gdd)return gda-gdd;
    return b.gf-a.gf;
  });
  return rows;
};
Career.prototype.spendPoint=function(attr){
  var d=this.data;
  if(d.pts<=0||d.attrs[attr]>=95)return false;
  d.attrs[attr]++; d.pts--;
  return true;
};
Career.prototype.avgRating=function(){
  var r=this.data.seasonStats.ratings;
  if(!r.length)return 0;
  var s=0; for(var i=0;i<r.length;i++)s+=r[i];
  return Math.round(s/r.length*10)/10;
};
/* season rollover: awards + transfers */
Career.prototype.endSeason=function(){
  var d=this.data;
  var table=this.sortedTable();
  var champion=table[0].clubId;
  var awards=[];
  var ss=d.seasonStats;
  var rivalTop=Math.round(9+this.strengthOf(7)*0.14+u.rr(0,6));
  if(ss.goals>=rivalTop&&ss.goals>0){ d.trophies.push({season:d.season,name:'Golden Boot',detail:ss.goals+' goals'}); awards.push('GOLDEN BOOT — '+ss.goals+' goals'); }
  var ar=this.avgRating();
  if(ar>=7.4&&ss.apps>=4){ d.trophies.push({season:d.season,name:'Player of the Season',detail:ar+' avg rating'}); awards.push('PLAYER OF THE SEASON — '+ar+' avg'); }
  if(champion===d.clubId){ d.trophies.push({season:d.season,name:'League Champion',detail:'Season '+d.season}); awards.push('LEAGUE CHAMPION'); }
  // transfer offers from bigger clubs
  d.offers=[];
  var perf=ar+ss.goals*0.07+ss.assists*0.04;
  var cur=this.strengthOf(d.clubId);
  if(ss.apps>=3){
    var candidates=[];
    for(var i=0;i<CLUB_COUNT;i++){
      if(i===d.clubId)continue;
      var s2=this.strengthOf(i);
      if(s2>cur+1&&u.chance(u.clamp((perf-6.1)*0.4+(s2-cur)*0.03,0.05,0.85)))candidates.push(i);
    }
    candidates.sort(function(a,b){return this.strengthOf(b)-this.strengthOf(a);}.bind(this));
    candidates=candidates.slice(0,2);
    for(i=0;i<candidates.length;i++){
      d.offers.push({clubId:candidates[i],wage:Math.round((this.strengthOf(candidates[i])-50)*1.8+u.rr(5,40))+'k/wk'});
    }
  }
  d._pending={champion:champion,awards:awards,rivalTop:rivalTop,seasonClub:d.clubId,seasonPos:this._tablePos()};
  return d._pending;
};
Career.prototype.acceptOffer=function(clubId){
  this.data.clubId=clubId;
  this.data.offers=[];
};
Career.prototype.newSeason=function(){
  var d=this.data;
  var pend=d._pending||{};
  d.history.push({season:d.season,clubId:pend.seasonClub!=null?pend.seasonClub:d.clubId,apps:d.seasonStats.apps,goals:d.seasonStats.goals,assists:d.seasonStats.assists,rating:this.avgRating(),pos:pend.seasonPos||this._tablePos()});
  d.season++;
  d.round=0;
  d.seasonStats={apps:0,goals:0,assists:0,ratings:[]};
  d.offers=[];
  this._initTable();
  this._genFixtures();
  this.save();
};
Career.prototype._tablePos=function(){
  var rows=this.sortedTable();
  for(var i=0;i<rows.length;i++)if(rows[i].clubId===this.data.clubId)return i+1;
  return 0;
};
/* ---------- persistence ---------- */
Career.prototype.save=function(){
  try{
    if(typeof localStorage!=='undefined'&&localStorage){
      localStorage.setItem(SAVE_KEY,JSON.stringify(this.data));
      this.storageOK=true;
    }
  }catch(e){ this.storageOK=false; }
  this.lastJSON=JSON.stringify(this.data);
};
Career.prototype.hasSave=function(){
  try{
    if(typeof localStorage!=='undefined'&&localStorage&&localStorage.getItem(SAVE_KEY))return true;
  }catch(e){}
  return !!this._loadedFromCode;
};
Career.prototype.load=function(){
  try{
    if(typeof localStorage!=='undefined'&&localStorage){
      var raw=localStorage.getItem(SAVE_KEY);
      if(raw){ this.data=JSON.parse(raw); return true; }
    }
  }catch(e){}
  return false;
};
Career.prototype.loadCode=function(code){
  try{
    var json=decodeURIComponent(escape(atob(code.trim())));
    var d=JSON.parse(json);
    if(!d||!d.attrs||!d.table)return false;
    this.data=d;
    this._loadedFromCode=true;
    this.save();
    return true;
  }catch(e){ return false; }
};
Career.prototype.exportCode=function(){
  return btoa(unescape(encodeURIComponent(JSON.stringify(this.data))));
};
Career.prototype.clearSave=function(){
  try{ if(typeof localStorage!=='undefined'&&localStorage)localStorage.removeItem(SAVE_KEY); }catch(e){}
};

AF.Career=Career;
AF.career=new Career();
})();
