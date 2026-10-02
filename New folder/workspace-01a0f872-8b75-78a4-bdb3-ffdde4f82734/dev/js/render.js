/* ============================================================
   AI FOOTBALL — render.js : Three.js presentation layer
   ============================================================ */
(function(){
'use strict';
var G=(typeof globalThis!=='undefined')?globalThis:{};
var AF=G.AF=G.AF||{};
var u=AF.util, CFG=AF.CFG;
var T=function(){ return G.THREE; };

function makeCanvas(w,h){ var c=document.createElement('canvas'); c.width=w; c.height=h; return c; }

AF.Renderer=function(canvas){
  this.canvas=canvas;
  this.ok=false;
  this.match=null;
  this.rigs={};
  this.fx=[];
  this.menuAngle=0;
  this.camPos=null; this.lookPos=null;
  this.camSnapT=0;
  this.labelT=0;
  this._bus=AF.bus.on('match',this.onMatchEvent.bind(this));
};

AF.Renderer.prototype.init=function(quality){
  var THREE=T();
  if(!THREE)throw new Error('THREE missing');
  this.quality=quality||'high';
  var r=this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:true});
  r.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  // richer 3D output: tone mapping makes the floodlights, grass and kits read
  // less like flat canvas art and more like a lit stadium scene.
  if(THREE.ACESFilmicToneMapping)r.toneMapping=THREE.ACESFilmicToneMapping;
  r.toneMappingExposure=1.08;
  if('physicallyCorrectLights' in r)r.physicallyCorrectLights=true;
  var self=this;
  this.canvas.addEventListener('webglcontextlost',function(e){
    e.preventDefault();
    if(typeof console!=='undefined')console.warn('WebGL context lost');
  });
  this.canvas.addEventListener('webglcontextrestored',function(){
    try{
      self.disposeMatch();
      self.init(self.quality);
      if(AF.App&&AF.App.match){ self.buildMatch(AF.App.match); }
    }catch(err){
      if(typeof console!=='undefined')console.error(err);
      if(window.location)window.location.reload();
    }
  });
  r.setSize(window.innerWidth,window.innerHeight,false);
  r.shadowMap.enabled=this.quality==='high';
  r.shadowMap.type=THREE.PCFSoftShadowMap;
  if(THREE.sRGBEncoding)r.outputEncoding=THREE.sRGBEncoding;
  var scene=this.scene=new THREE.Scene();
  // sky gradient (screen-space background)
  var sky=makeCanvas(2,512), sctx=sky.getContext('2d');
  var grd=sctx.createLinearGradient(0,0,0,512);
  grd.addColorStop(0,'#27476e'); grd.addColorStop(0.55,'#2c5d8f'); grd.addColorStop(0.85,'#88a7c5'); grd.addColorStop(1,'#a8c4d8');
  sctx.fillStyle=grd; sctx.fillRect(0,0,2,512);
  var skyTex=new THREE.CanvasTexture(sky);
  if(THREE.sRGBEncoding)skyTex.encoding=THREE.sRGBEncoding;
  scene.background=skyTex;
  scene.fog=new THREE.Fog(0x8fb4d6,95,230);
  var cam=this.camera=new THREE.PerspectiveCamera(62,window.innerWidth/window.innerHeight,0.35,900);
  cam.position.set(0,30,-70);
  // lights
  var hemi=new THREE.HemisphereLight(0xcfe5ff,0x2a4d22,0.95);
  scene.add(hemi);
  var sun=new THREE.DirectionalLight(0xfff2d8,1.05);
  sun.position.set(45,80,25);
  if(this.quality==='high'){
    sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048);
    sun.shadow.camera.left=-70; sun.shadow.camera.right=70;
    sun.shadow.camera.top=60; sun.shadow.camera.bottom=-60;
    sun.shadow.camera.near=10; sun.shadow.camera.far=220;
    sun.shadow.bias=-0.0006;
  }
  scene.add(sun);
  this.buildStadium();
  var self=this;
  window.addEventListener('resize',function(){ self.resize(); });
  this.ok=true;
};
AF.Renderer.prototype.resize=function(){
  if(!this.renderer)return;
  this.renderer.setSize(window.innerWidth,window.innerHeight,false);
  this.camera.aspect=window.innerWidth/window.innerHeight;
  this.camera.updateProjectionMatrix();
};
AF.Renderer.prototype.setQuality=function(q){
  this.quality=q;
  this.renderer.shadowMap.enabled=q==='high';
};
/* auto performance mode: trims the expensive stuff, keeps the look */
AF.Renderer.prototype.setPerfMode=function(on){
  if(!this.renderer)return;
  if(on){
    this.renderer.shadowMap.enabled=false;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1)*0.8);
  } else {
    this.renderer.shadowMap.enabled=this.quality==='high';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  }
};

/* ---------------- stadium ---------------- */
AF.Renderer.prototype.buildStadium=function(){
  var THREE=T();
  var F=CFG.FIELD;
  var scene=this.scene;
  // ground apron
  var ground=new THREE.Mesh(new THREE.PlaneGeometry(340,260),new THREE.MeshLambertMaterial({color:0x14501c}));
  ground.rotation.x=-Math.PI/2; ground.position.y=-0.02;
  scene.add(ground);
  // pitch with painted lines
  var pw=2048, ph=pw*F.W/F.L;
  var pc=makeCanvas(pw,ph), g=pc.getContext('2d');
  // grass stripes
  var stripes=14;
  for(var i=0;i<stripes;i++){
    g.fillStyle=i%2?'#2f8f3c':'#28802f';
    g.fillRect(i*pw/stripes,0,pw/stripes+1,ph);
  }
  // subtle mow texture
  g.globalAlpha=0.05;
  for(i=0;i<800;i++){ g.fillStyle=u.chance(0.5)?'#ffffff':'#000000'; g.fillRect(Math.random()*pw,Math.random()*ph,3,3); }
  g.globalAlpha=1;
  // lines
  g.strokeStyle='#f4f9f4'; g.lineWidth=pw*0.0022; g.lineCap='round';
  var X=function(x){ return (x/F.L+0.5)*pw; };
  var Z=function(z){ return (z/F.W+0.5)*ph; };
  g.strokeRect(X(-F.L/2+0.1),Z(-F.W/2+0.1),X(F.L/2-0.1)-X(-F.L/2+0.1),Z(F.W/2-0.1)-Z(-F.W/2+0.1));
  g.beginPath(); g.moveTo(X(0),Z(-F.W/2)); g.lineTo(X(0),Z(F.W/2)); g.stroke();
  g.beginPath(); g.ellipse(X(0),Z(0),F.CIRCLE/F.L*pw,F.CIRCLE/F.W*ph,0,0,Math.PI*2); g.stroke();
  g.beginPath(); g.ellipse(X(0),Z(0),0.3/F.L*pw,0.3/F.W*ph,0,0,Math.PI*2); g.fillStyle='#f4f9f4'; g.fill();
  for(var s=-1;s<=1;s+=2){
    // penalty box
    g.strokeRect(X(s*F.L/2-(s>0?F.BOX_D:-F.BOX_D)*s),Z(-F.BOX_W/2),F.BOX_D/F.L*pw,F.BOX_W/F.W*ph);
    // six yard box
    g.strokeRect(X(s*F.L/2-(s>0?F.SIX_D:-F.SIX_D)*s),Z(-F.SIX_W/2),F.SIX_D/F.L*pw,F.SIX_W/F.W*ph);
    // penalty spot
    g.beginPath(); g.ellipse(X(s*(F.L/2-F.SPOT)),Z(0),0.3/F.L*pw,0.3/F.W*ph,0,0,Math.PI*2); g.fill();
    // D arc
    g.beginPath();
    var a=Math.acos((F.BOX_D-F.SPOT)/F.CIRCLE);
    g.ellipse(X(s*(F.L/2-F.SPOT)),Z(0),F.CIRCLE/F.L*pw,F.CIRCLE/F.W*ph,0,s>0?Math.PI-a:-a,s>0?Math.PI+a:a,s<0);
    g.stroke();
    // corner arcs
    for(var c2=-1;c2<=1;c2+=2){
      g.beginPath(); g.ellipse(X(s*(F.L/2)),Z(c2*F.W/2),1.5/F.L*pw,1.5/F.W*ph,0,0,Math.PI*2); g.stroke();
    }
  }
  var pitchTex=new THREE.CanvasTexture(pc);
  pitchTex.anisotropy=8;
  var pitch=new THREE.Mesh(new THREE.PlaneGeometry(F.L,F.W),new THREE.MeshLambertMaterial({map:pitchTex}));
  pitch.rotation.x=-Math.PI/2; pitch.receiveShadow=true;
  scene.add(pitch);
  this.addRaisedPitchLines();
  this.addGrassVolume();
  // goals + nets
  this.buildGoal(1); this.buildGoal(-1);
  // ad boards
  var adTex=(function(){
    var c=makeCanvas(1024,64), x=c.getContext('2d');
    x.fillStyle='#0b0f12'; x.fillRect(0,0,1024,64);
    x.font='900 34px Arial'; x.textBaseline='middle';
    var msgs=['AI FOOTBALL','RISE TO GLORY','ARENA'];
    var cols=['#22e06c','#ffffff','#ffcf3f'];
    for(var i=0;i<6;i++){
      x.fillStyle=cols[i%3];
      x.fillText(msgs[i%3],20+i*180,34);
    }
    var t=new THREE.CanvasTexture(c); t.wrapS=THREE.RepeatWrapping; t.repeat.x=2; return t;
  })();
  var adMat=new THREE.MeshBasicMaterial({map:adTex});
  function board(w,x2,z2,ry){
    var m=new THREE.Mesh(new THREE.BoxGeometry(w,0.95,0.12),adMat);
    m.position.set(x2,0.48,z2); m.rotation.y=ry;
    scene.add(m);
  }
  board(F.L+6,0,F.W/2+3,Math.PI); board(F.L+6,0,-(F.W/2+3),0);
  // stands (4 raked tiers of crowd)
  var crowdTex=(function(){
    var c=makeCanvas(512,128), x=c.getContext('2d');
    x.fillStyle='#33404d'; x.fillRect(0,0,512,128);
    var cols=['#c62828','#1565c0','#f9a825','#2e7d32','#e8e8e8','#37474f','#6a1b9a','#ef6c00'];
    for(var r2=0;r2<10;r2++){
      for(var cci=0;cci<90;cci++){
        x.fillStyle=cols[Math.floor(Math.random()*cols.length)];
        x.globalAlpha=0.55+Math.random()*0.45;
        x.fillRect(cci*5.6+Math.random()*2,r2*12.8+Math.random()*3,3.4,4.6);
      }
    }
    x.globalAlpha=1;
    var t=new THREE.CanvasTexture(c); t.wrapS=THREE.RepeatWrapping; t.wrapT=THREE.RepeatWrapping; return t;
  })();
  function stand(len, dist, ry, side){
    var grp=new THREE.Group();
    var tex=crowdTex.clone(); tex.needsUpdate=true; tex.repeat.set(Math.round(len/22),1.2);
    // low, open crowd rake — nothing tall, no walls, no roof
    var seat=new THREE.Mesh(new THREE.BoxGeometry(len,9,12),new THREE.MeshLambertMaterial({map:tex}));
    seat.position.set(0,4.6,6.4);
    seat.rotation.x=0.38;
    grp.add(seat);
    // stepped risers and aisles give the stadium real depth in screenshots
    var riserMat=new THREE.MeshLambertMaterial({color:0x26323c});
    for(var rr=0;rr<5;rr++){
      var riser=new THREE.Mesh(new THREE.BoxGeometry(len,0.18,0.42),riserMat);
      riser.position.set(0,1.55+rr*1.55,2.1+rr*2.05);
      grp.add(riser);
    }
    var aisleMat=new THREE.MeshLambertMaterial({color:0xb8c5cf});
    for(var aa=-2;aa<=2;aa+=2){
      var aisle=new THREE.Mesh(new THREE.BoxGeometry(1.05,0.12,11.5),aisleMat);
      aisle.position.set(aa*len/7,4.75,6.35); aisle.rotation.x=0.38;
      grp.add(aisle);
    }
    // slim light top edge so the rake reads clean from the pitch
    var lip=new THREE.Mesh(new THREE.BoxGeometry(len,0.35,1.2),new THREE.MeshLambertMaterial({color:0x9fb4c4}));
    lip.position.set(0,9.2,11.6);
    grp.add(lip);
    // place
    if(ry===0)grp.position.set(0,0,-(F.W/2+dist));
    else if(ry===Math.PI)grp.position.set(0,0,F.W/2+dist);
    else if(ry===-Math.PI/2)grp.position.set(F.L/2+dist,0,0);
    else grp.position.set(-(F.L/2+dist),0,0);
    grp.rotation.y=ry;
    scene.add(grp);
  }
  stand(F.L+26,13,0);          // north (z-)
  stand(F.L+26,13,Math.PI);    // south
  stand(F.W+10,20,-Math.PI/2); // east (x+)
  stand(F.W+10,20,Math.PI/2);  // west
  // floodlights
  var glowTex=(function(){
    var c=makeCanvas(64,64), x=c.getContext('2d');
    var gr=x.createRadialGradient(32,32,2,32,32,30);
    gr.addColorStop(0,'rgba(255,255,230,1)'); gr.addColorStop(0.35,'rgba(255,255,200,0.45)'); gr.addColorStop(1,'rgba(255,255,200,0)');
    x.fillStyle=gr; x.fillRect(0,0,64,64);
    return new THREE.CanvasTexture(c);
  })();
  var poles=[[F.L/2+8,F.W/2+8],[-(F.L/2+8),F.W/2+8],[F.L/2+8,-(F.W/2+8)],[-(F.L/2+8),-(F.W/2+8)]];
  for(i=0;i<poles.length;i++){
    var pole=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.5,30,8),new THREE.MeshLambertMaterial({color:0x39424e}));
    pole.position.set(poles[i][0],15,poles[i][1]);
    scene.add(pole);
    var head=new THREE.Mesh(new THREE.BoxGeometry(4.6,2.2,0.7),new THREE.MeshLambertMaterial({color:0x222a33,emissive:0xbfd4ff,emissiveIntensity:0.7}));
    head.position.set(poles[i][0],30.5,poles[i][1]);
    head.lookAt(0,0,0);
    scene.add(head);
    var spr=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,transparent:true,opacity:0.85,depthWrite:false}));
    spr.scale.set(9,9,1);
    spr.position.set(poles[i][0],30.5,poles[i][1]);
    scene.add(spr);
    var cone=new THREE.Mesh(new THREE.ConeGeometry(7.5,28,24,1,true),new THREE.MeshBasicMaterial({color:0xfff6c8,transparent:true,opacity:0.055,side:THREE.DoubleSide,depthWrite:false}));
    cone.position.set(poles[i][0],16.2,poles[i][1]);
    cone.lookAt(0,0.4,0);
    scene.add(cone);
  }
  // corner flags
  var flagPos=[[F.L/2,F.W/2],[-F.L/2,F.W/2],[F.L/2,-F.W/2],[-F.L/2,-F.W/2]];
  for(i=0;i<4;i++){
    var fl=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,1.6,6),new THREE.MeshLambertMaterial({color:0xeeeeee}));
    fl.position.set(flagPos[i][0],0.8,flagPos[i][1]);
    scene.add(fl);
    var fg=new THREE.Mesh(new THREE.PlaneGeometry(0.42,0.3),new THREE.MeshBasicMaterial({color:0xffd400,side:THREE.DoubleSide}));
    fg.position.set(flagPos[i][0]+0.22,1.45,flagPos[i][1]);
    scene.add(fg);
  }
};

AF.Renderer.prototype.addRaisedPitchLines=function(){
  var THREE=T(), F=CFG.FIELD, scene=this.scene;
  var mat=new THREE.MeshLambertMaterial({color:0xf7fff4,emissive:0x223322,emissiveIntensity:0.18});
  var y=0.018, thick=0.085;
  function slab(w,d,x,z){
    var m=new THREE.Mesh(new THREE.BoxGeometry(w,0.018,d),mat);
    m.position.set(x,y,z); m.receiveShadow=true; scene.add(m); return m;
  }
  // touchlines and halfway line are actual raised geometry now, not only painted pixels.
  slab(F.L,thick,0,-F.W/2); slab(F.L,thick,0,F.W/2);
  slab(thick,F.W,-F.L/2,0); slab(thick,F.W,F.L/2,0);
  slab(thick,F.W,0,0);
  for(var s=-1;s<=1;s+=2){
    var bx=s*(F.L/2-F.BOX_D/2), sx=s*(F.L/2-F.SIX_D/2);
    slab(thick,F.BOX_W,bx-s*F.BOX_D/2,0);
    slab(F.BOX_D,thick,bx,-F.BOX_W/2); slab(F.BOX_D,thick,bx,F.BOX_W/2);
    slab(thick,F.SIX_W,sx-s*F.SIX_D/2,0);
    slab(F.SIX_D,thick,sx,-F.SIX_W/2); slab(F.SIX_D,thick,sx,F.SIX_W/2);
    var spot=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.16,0.02,18),mat);
    spot.rotation.x=Math.PI/2; spot.position.set(s*(F.L/2-F.SPOT),y+0.01,0); scene.add(spot);
  }
  var centre=new THREE.Mesh(new THREE.TorusGeometry(F.CIRCLE,thick*0.42,8,96),mat);
  centre.rotation.x=Math.PI/2; centre.position.set(0,y+0.014,0); scene.add(centre);
  var dot=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.2,0.02,20),mat);
  dot.rotation.x=Math.PI/2; dot.position.set(0,y+0.018,0); scene.add(dot);
};

AF.Renderer.prototype.addGrassVolume=function(){
  var THREE=T(), F=CFG.FIELD;
  if(this.quality==='lite')return;
  // A light sprinkling of tiny vertical blades near the camera height gives parallax,
  // making still images read as 3D without adding heavy models.
  var mat=new THREE.MeshLambertMaterial({color:0x3fa54a});
  var geo=new THREE.ConeGeometry(0.025,0.34,3);
  var count=520;
  var inst=THREE.InstancedMesh?new THREE.InstancedMesh(geo,mat,count):null;
  if(!inst)return;
  var mtx=new THREE.Matrix4(), pos=new THREE.Vector3(), quat=new THREE.Quaternion(), sc=new THREE.Vector3();
  for(var i=0;i<count;i++){
    var x=(Math.random()-0.5)*F.L*0.96, z=(Math.random()-0.5)*F.W*0.96;
    // keep the pitch markings readable
    if(Math.abs(x)<0.2||Math.abs(Math.abs(z)-F.W/2)<0.5||Math.abs(Math.abs(x)-F.L/2)<0.5){ i--; continue; }
    pos.set(x,0.16,z);
    quat.setFromEuler(new THREE.Euler((Math.random()-0.5)*0.28,Math.random()*Math.PI,(Math.random()-0.5)*0.28));
    var h=0.65+Math.random()*0.8; sc.set(0.65+Math.random()*0.8,h,0.65+Math.random()*0.8);
    mtx.compose(pos,quat,sc); inst.setMatrixAt(i,mtx);
  }
  inst.castShadow=false; inst.receiveShadow=true;
  this.scene.add(inst);
};

AF.Renderer.prototype.makeBlobShadow=function(w,d,opacity){
  var THREE=T();
  var sh=new THREE.Mesh(new THREE.CircleGeometry(1,32),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:opacity||0.22,depthWrite:false}));
  sh.rotation.x=-Math.PI/2; sh.scale.set(w||0.55,d||0.28,1); sh.position.y=0.022; return sh;
};
AF.Renderer.prototype.buildGoal=function(side){
  var THREE=T(), F=CFG.FIELD;
  var grp=new THREE.Group();
  var mat=new THREE.MeshLambertMaterial({color:0xffffff,emissive:0x556655,emissiveIntensity:0.6});
  var postGeo=new THREE.CylinderGeometry(0.06,0.06,F.GOAL_H,8);
  var p1=new THREE.Mesh(postGeo,mat); p1.position.set(0,F.GOAL_H/2,-F.GOAL_W/2);
  var p2=new THREE.Mesh(postGeo,mat); p2.position.set(0,F.GOAL_H/2,F.GOAL_W/2);
  var bar=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,F.GOAL_W+0.12,8),mat);
  bar.rotation.x=Math.PI/2; bar.position.set(0,F.GOAL_H,0);
  grp.add(p1);grp.add(p2);grp.add(bar);
  // net texture
  var netTex=(function(){
    var c=makeCanvas(128,128), x=c.getContext('2d');
    x.clearRect(0,0,128,128);
    x.strokeStyle='rgba(255,255,255,0.75)'; x.lineWidth=1.2;
    for(var i=0;i<=16;i++){
      x.beginPath();x.moveTo(i*8,0);x.lineTo(i*8,128);x.stroke();
      x.beginPath();x.moveTo(0,i*8);x.lineTo(128,i*8);x.stroke();
    }
    var t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
  })();
  function net(w2,h2,px,py,pz,rx,ry2,ru,rv){
    var t=netTex.clone(); t.needsUpdate=true; t.repeat.set(ru,rv);
    var m=new THREE.Mesh(new THREE.PlaneGeometry(w2,h2),new THREE.MeshBasicMaterial({map:t,transparent:true,opacity:0.38,side:THREE.DoubleSide,depthWrite:false}));
    m.position.set(px,py,pz); m.rotation.x=rx||0; m.rotation.y=ry2||0;
    grp.add(m);
  }
  var D=1.9;
  net(F.GOAL_W,F.GOAL_H, side*D,F.GOAL_H/2,0, 0,Math.PI/2, 7,3);          // back
  net(D,F.GOAL_H, side*D/2,F.GOAL_H/2,-F.GOAL_W/2, 0,0, 2,3);             // sides
  net(D,F.GOAL_H, side*D/2,F.GOAL_H/2,F.GOAL_W/2, 0,0, 2,3);
  net(F.GOAL_W,D, side*D/2,F.GOAL_H,0, Math.PI/2,0, 7,1);                 // top
  grp.position.set(side*F.L/2,0,0);
  this.scene.add(grp);
};

/* ---------------- human faces (procedural painted + 3D hair) ---------------- */
var HAIR_COLS=['#0e0c0a','#1c1512','#2b1a10','#4a2f1a','#6b4a2a','#b5651d','#e8d27a','#d8c58a','#22c05a'];
AF.FACES={};
var STAR_DEFS=[
  {key:'messias',   name:'L. Messias',   skin:'#e8b98c', hair:'short',  hairCol:'#3a2a18', brow:3.5, ang:-4,  iris:'#5a4632', beard:'beard',   smile:2,  nose:1.0 },
  {key:'ronaldone', name:'C. Ronaldone', skin:'#d9a06f', hair:'fade',   hairCol:'#181210', brow:5,   ang:-8,  iris:'#3a2a18', beard:'none',    smile:-2, nose:0.9 },
  {key:'neymarinho',name:'Neymarinho Jr',skin:'#e8c39a', hair:'mohawk', hairCol:'#241a12', brow:3,   ang:-3,  iris:'#3f5a2e', beard:'goatee',  smile:3,  nose:0.95},
  {key:'mbappini',  name:'K. Mbappini',  skin:'#a96b3f', hair:'spiky',  hairCol:'#0e0c0a', brow:3.5, ang:-2,  iris:'#2b2b2b', beard:'none',    smile:4,  nose:1.0 },
  {key:'salahud',   name:'M. Salahud',   skin:'#d9a06f', hair:'curly',  hairCol:'#191410', brow:4,   ang:-5,  iris:'#3a2a18', beard:'beard',   smile:1,  nose:1.0 },
  {key:'haalbond',  name:'E. Haalbond',  skin:'#f2c9a0', hair:'bun',    hairCol:'#e8d27a', brow:5.5, ang:-10, iris:'#3f5a2e', beard:'stubble', smile:-1, nose:1.1 },
  {key:'bruynex',   name:'K. Bruynex',   skin:'#f2c9a0', hair:'short',  hairCol:'#b5651d', brow:4,   ang:-4,  iris:'#4a6a8a', beard:'stubble', smile:0,  nose:1.0 },
  {key:'ramostar',  name:'S. Ramostar',  skin:'#d9a06f', hair:'fade',   hairCol:'#101010', brow:4,   ang:-6,  iris:'#2b2b2b', beard:'none',    smile:-2, nose:0.9 },
  {key:'henriq',    name:'T. Henriq',    skin:'#8a5430', hair:'bald',   hairCol:'#111111', brow:4.5, ang:-7,  iris:'#2b2b2b', beard:'goatee',  smile:0,  nose:1.0 },
  {key:'kompanyx',  name:'V. Kompanyx',  skin:'#c98a58', hair:'buzz',   hairCol:'#d8c58a', brow:5,   ang:-6,  iris:'#3a2a18', beard:'beard',   smile:0,  nose:1.05},
  {key:'modricho',  name:'L. Modricho',  skin:'#f2c9a0', hair:'short',  hairCol:'#6b4a2a', brow:3,   ang:-3,  iris:'#5a8a9a', beard:'stubble', smile:1,  nose:1.0 },
  {key:'kaneyo',    name:'H. Kaneyo',    skin:'#f2c9a0', hair:'fade',   hairCol:'#4a3520', brow:4,   ang:-4,  iris:'#3a5a2e', beard:'none',    smile:0,  nose:1.0 },
  {key:'pogbazz',   name:'P. Pogbazz',   skin:'#8a5430', hair:'mohawk', hairCol:'#22c05a', brow:4,   ang:-5,  iris:'#2b2b2b', beard:'none',    smile:2,  nose:1.0 },
  {key:'grizmanni', name:'A. Grizmanni', skin:'#e8c39a', hair:'short',  hairCol:'#4a3a22', brow:3,   ang:-2,  iris:'#4a6a8a', beard:'stubble', smile:2,  nose:0.95},
  {key:'lukakonga', name:'R. Lukakonga', skin:'#a96b3f', hair:'buzz',   hairCol:'#141210', brow:5,   ang:-5,  iris:'#2b2b2b', beard:'stubble', smile:1,  nose:1.1 },
  {key:'vandijko',  name:'V. van Dijko', skin:'#e8b98c', hair:'bun',    hairCol:'#2b2118', brow:4.5, ang:-6,  iris:'#3a2a18', beard:'none',    smile:0,  nose:1.05}
];
AF.FACES.stars=STAR_DEFS;
var RND_SKINS=['#f2c9a0','#e8b98c','#e8c39a','#d9a06f','#c98a58','#a96b3f','#8a5430','#6b4026'];
var RND_HAIR=['buzz','short','fade','curly','afro','bun','spiky','mohawk','bald'];
AF.FACES.randomFace=function(rng){
  rng=rng||Math.random;
  var pick=function(a){ return a[Math.floor(rng()*a.length)]; };
  var p={
    key:'', skin:pick(RND_SKINS), hair:pick(RND_HAIR), hairCol:pick(HAIR_COLS),
    brow:2.5+rng()*2.5, ang:-(rng()*6), iris:pick(['#3a2a18','#4a3520','#2b3a55','#3f5a2e','#2b2b2b']),
    beard: rng()<0.4?pick(['stubble','stubble','beard','goatee','moustache']):'none',
    smile:-2+rng()*6, nose:0.85+rng()*0.3
  };
  p.key=['r',p.skin,p.hair,p.hairCol,p.brow.toFixed(1),p.ang,p.iris,p.beard,p.smile.toFixed(1),p.nose.toFixed(2)].join('|');
  return p;
};
var faceTexCache={};
function faceTexture(f){
  if(faceTexCache[f.key])return faceTexCache[f.key];
  var keys=Object.keys(faceTexCache);
  if(keys.length>80){ keys.slice(0,40).forEach(function(k){ faceTexCache[k].dispose(); delete faceTexCache[k]; }); }
  var W=256,H=256,c=makeCanvas(W,H),x=c.getContext('2d');
  var cx=64; // u=0.25 -> front of THREE sphere
  // base skin
  x.fillStyle=f.skin; x.fillRect(0,0,W,H);
  // head shading
  var sh=x.createRadialGradient(cx,110,10,cx,120,90);
  sh.addColorStop(0,'rgba(255,255,255,0.10)'); sh.addColorStop(0.7,'rgba(0,0,0,0)'); sh.addColorStop(1,'rgba(0,0,0,0.22)');
  x.fillStyle=sh; x.fillRect(0,0,W,H);
  // forehead highlight
  x.fillStyle='rgba(255,255,255,0.09)';
  x.beginPath(); x.ellipse(cx,80,34,20,0,0,Math.PI*2); x.fill();
  // cheek blush
  x.fillStyle='rgba(190,90,70,0.12)';
  x.beginPath(); x.ellipse(cx-27,148,10,6,0,0,Math.PI*2); x.fill();
  x.beginPath(); x.ellipse(cx+27,148,10,6,0,0,Math.PI*2); x.fill();
  // ear shadows at sides
  x.fillStyle='rgba(0,0,0,0.15)';
  x.beginPath(); x.ellipse(cx-40,124,5,9,0,0,Math.PI*2); x.fill();
  x.beginPath(); x.ellipse(cx+40,124,5,9,0,0,Math.PI*2); x.fill();
  // eye sockets
  x.fillStyle='rgba(0,0,0,0.08)';
  x.beginPath(); x.ellipse(cx-16,116,11,7,0,0,Math.PI*2); x.fill();
  x.beginPath(); x.ellipse(cx+16,116,11,7,0,0,Math.PI*2); x.fill();
  // eyes
  [-16,16].forEach(function(off){
    var ex=cx+off, ey=116;
    x.fillStyle='#f8f6f2';
    x.beginPath(); x.ellipse(ex,ey,8.4,5.2,0,0,Math.PI*2); x.fill();
    x.strokeStyle='rgba(60,40,30,0.7)'; x.lineWidth=0.8;
    x.beginPath(); x.ellipse(ex,ey,8.4,5.2,0,0,Math.PI*2); x.stroke();
    x.fillStyle=f.iris;
    x.beginPath(); x.arc(ex+1.5,ey+0.4,3.5,0,Math.PI*2); x.fill();
    x.fillStyle='#101010';
    x.beginPath(); x.arc(ex+1.5,ey+0.4,1.7,0,Math.PI*2); x.fill();
    x.fillStyle='rgba(255,255,255,0.9)';
    x.beginPath(); x.arc(ex+0.1,ey-1.1,1.0,0,Math.PI*2); x.fill();
    // upper lid line
    x.strokeStyle='rgba(40,25,18,0.85)'; x.lineWidth=1.6;
    x.beginPath(); x.arc(ex,ey+1,7.2,Math.PI*1.15,Math.PI*1.85); x.stroke();
    // eyebrow
    x.strokeStyle=f.hairCol; x.lineWidth=f.brow+1; x.lineCap='round';
    x.beginPath();
    x.moveTo(ex-8,ey-8-f.ang*0.12);
    x.quadraticCurveTo(ex,ey-11-f.ang*0.28,ex+8,ey-8+f.ang*0.12);
    x.stroke();
  });
  // nose
  var ns=f.nose;
  x.strokeStyle='rgba(0,0,0,0.13)'; x.lineWidth=2.4*ns; x.lineCap='round';
  x.beginPath(); x.moveTo(cx-1,126); x.quadraticCurveTo(cx-2*ns,140,cx-1.5,149); x.stroke();
  x.fillStyle='rgba(0,0,0,0.28)';
  x.beginPath(); x.arc(cx-4*ns,152,1.5,0,Math.PI*2); x.fill();
  x.beginPath(); x.arc(cx+3*ns,152,1.5,0,Math.PI*2); x.fill();
  x.fillStyle='rgba(255,255,255,0.10)';
  x.beginPath(); x.ellipse(cx-3*ns,138,2.5,6,0,0,Math.PI*2); x.fill();
  // mouth
  var my=170, mw=8+Math.abs(f.smile)*0.6, cur=f.smile*0.55;
  x.strokeStyle='rgba(70,35,30,0.9)'; x.lineWidth=2.2; x.lineCap='round';
  x.beginPath(); x.moveTo(cx-mw,my); x.quadraticCurveTo(cx,my+cur,cx+mw,my); x.stroke();
  x.strokeStyle='rgba(150,80,70,0.55)'; x.lineWidth=3;
  x.beginPath(); x.moveTo(cx-mw*0.7,my+2.5); x.quadraticCurveTo(cx,my+3+cur,cx+mw*0.7,my+2.5); x.stroke();
  // facial hair
  var hb='rgba(22,18,15,';
  if(f.beard==='stubble'){
    x.fillStyle=hb+'0.20)';
    x.beginPath(); x.ellipse(cx,178,26,20,0,0,Math.PI*2); x.fill();
    x.fillRect(cx-10,158,20,6);
  } else if(f.beard==='beard'){
    x.fillStyle=hb+'0.88)';
    x.beginPath(); x.ellipse(cx,180,25,19,0,0,Math.PI*2); x.fill();
    x.beginPath(); x.ellipse(cx-33,152,5,14,0.2,0,Math.PI*2); x.fill();
    x.beginPath(); x.ellipse(cx+33,152,5,14,-0.2,0,Math.PI*2); x.fill();
    x.fillStyle=f.skin;
    x.beginPath(); x.ellipse(cx,my+1,mw+2,4.5,0,0,Math.PI*2); x.fill();
    x.strokeStyle='rgba(70,35,30,0.9)'; x.lineWidth=2;
    x.beginPath(); x.moveTo(cx-mw,my); x.quadraticCurveTo(cx,my+cur,cx+mw,my); x.stroke();
  } else if(f.beard==='goatee'){
    x.fillStyle=hb+'0.85)';
    x.beginPath(); x.ellipse(cx,186,9,8,0,0,Math.PI*2); x.fill();
    x.fillRect(cx-7,159,14,5);
  } else if(f.beard==='moustache'){
    x.fillStyle=hb+'0.85)';
    x.fillRect(cx-9,161,18,4.5);
  }
  // sideburns
  x.fillStyle=hb+'0.8)';
  x.fillRect(cx-36,96,5,30);
  x.fillRect(cx+31,96,5,30);
  // hairline tint (helps blend 3D hair)
  x.fillStyle=hb+'0.45)';
  x.beginPath(); x.ellipse(cx,44,40,26,0,0,Math.PI*2); x.fill();
  var t=new (THREEC().CanvasTexture)(c);
  if(THREEC().sRGBEncoding)t.encoding=THREEC().sRGBEncoding;
  faceTexCache[f.key]=t;
  return t;
}
function THREEC(){ return T(); }

/* 3D hair meshes (head-local coords, head r=0.115 at rig y 1.63) */
function addHair(g,f){
  var THREE=T();
  var hc=kitMat(f.hairCol);
  var hy=1.63;
  function cap(r,sy){
    var h=new THREE.Mesh(sphGeo(r),hc);
    h.scale.set(1,sy,1); h.position.y=hy+0.012; h.castShadow=true;
    g.add(h); return h;
  }
  switch(f.hair){
    case 'buzz': cap(0.118,0.82); break;
    case 'fade': cap(0.120,0.68); break;
    case 'short':
      cap(0.121,0.85);
      var fr=new THREE.Mesh(boxGeo(0.15,0.035,0.05),hc);
      fr.position.set(0,hy+0.075,0.095); g.add(fr);
      break;
    case 'afro':
      var af=new THREE.Mesh(sphGeo(0.155),hc);
      af.scale.set(1,0.92,1); af.position.y=hy+0.055; af.castShadow=true; g.add(af);
      break;
    case 'curly':
      cap(0.119,0.8);
      [[0.05,0.07,0.06],[-0.06,0.06,0.05],[0.01,0.09,-0.04],[-0.03,0.07,0.09]].forEach(function(o){
        var b=new THREE.Mesh(sphGeo(0.062),hc); b.position.set(o[0],hy+0.075+o[1]*0.5,o[2]); g.add(b);
      });
      break;
    case 'mohawk':
      cap(0.120,0.66);
      var mh=new THREE.Mesh(boxGeo(0.05,0.075,0.24),hc);
      mh.position.set(0,hy+0.105,-0.005); g.add(mh);
      break;
    case 'bun':
      cap(0.120,0.8);
      var bun=new THREE.Mesh(sphGeo(0.052),hc);
      bun.position.set(0,hy+0.075,-0.115); g.add(bun);
      break;
    case 'spiky':
      cap(0.118,0.75);
      for(var i=0;i<4;i++){
        var sp=new THREE.Mesh(new THREE.ConeGeometry(0.026,0.075,6),hc);
        sp.position.set((i%2?0.045:-0.045),hy+0.115,(i<2?0.05:-0.045));
        g.add(sp);
      }
      break;
    case 'bald': default: break;
  }
}

/* ---------------- player rigs ---------------- */
var geoCache={};
function sphGeo(r){ var k='s'+r; if(!geoCache[k]){geoCache[k]=new (T()).SphereGeometry(r,18,14);} return geoCache[k]; }
function cylGeo(r,h){ var k='c'+r+'_'+h; if(!geoCache[k]){geoCache[k]=new (T()).CylinderGeometry(r,r,h,16);} return geoCache[k]; }
function boxGeo(w,h,d){ var k='b'+w+'_'+h+'_'+d; if(!geoCache[k]){geoCache[k]=new (T()).BoxGeometry(w,h,d);} return geoCache[k]; }
function kitMat(hex){ return new (T()).MeshLambertMaterial({color:new (T()).Color(hex)}); }
AF.Renderer.prototype.makeRig=function(kit,num,skin,face){
  var THREE=T();
  var g=new THREE.Group();
  g.rotation.order='YXZ';
  var shirt=kitMat(kit.shirt), shorts=kitMat(kit.shorts), sock=kitMat(kit.sock);
  if(face&&face.skin)skin=face.skin;
  var skinM=kitMat(skin), dark=kitMat('#15181d');
  function capsule(parent,mat,r,len,x2,y2,z2){
    var grp=new THREE.Group(); grp.position.set(x2,y2,z2);
    var cylH=Math.max(0.02,len-2*r);
    var cyl=new THREE.Mesh(cylGeo(r,cylH),mat); cyl.castShadow=true; grp.add(cyl);
    var c1=new THREE.Mesh(sphGeo(r),mat); c1.position.y=cylH/2; grp.add(c1);
    var c2=new THREE.Mesh(sphGeo(r),mat); c2.position.y=-cylH/2; grp.add(c2);
    parent.add(grp); return grp;
  }
  function msh(parent,geo,mat,x2,y2,z2){
    var m=new THREE.Mesh(geo,mat); m.position.set(x2,y2,z2); parent.add(m); return m;
  }
  // torso + shoulders
  capsule(g,shirt,0.145,0.54,0,1.2,0);
  msh(g,boxGeo(0.27,0.12,0.19),shirt,0,1.45,0.01);
  // shorts
  msh(g,boxGeo(0.32,0.2,0.24),shorts,0,0.9,0);
  // neck + human head (painted face + ears + nose + 3D hair)
  msh(g,cylGeo(0.045,0.08),skinM,0,1.51,0);
  face=face||AF.FACES.randomFace();
  var faceMat=new THREE.MeshLambertMaterial({map:faceTexture(face)});
  var head=new THREE.Mesh(new THREE.SphereGeometry(0.115,16,12),faceMat);
  head.position.y=1.63; head.castShadow=true; g.add(head);
  var earL=msh(g,sphGeo(0.028),skinM,-0.112,1.63,0); earL.scale.set(0.6,1,0.8);
  var earR=msh(g,sphGeo(0.028),skinM,0.112,1.63,0); earR.scale.set(0.6,1,0.8);
  var nose=new THREE.Mesh(sphGeo(0.022),skinM);
  nose.position.set(0,1.605,0.108); nose.scale.set(0.85,1.05,1.1/face.nose);
  g.add(nose);
  addHair(g,face);
  // arms: shoulder pivot -> sleeve (shirt) -> elbow pivot -> forearm (skin) + hand
  function arm(side){
    var sh=new THREE.Group(); sh.position.set(0.215*side,1.44,0); g.add(sh);
    capsule(sh,shirt,0.055,0.26,0,-0.11,0);
    var elb=new THREE.Group(); elb.position.set(0,-0.24,0); sh.add(elb);
    capsule(elb,skinM,0.048,0.24,0,-0.1,0);
    msh(elb,sphGeo(0.05),skinM,0,-0.22,0);
    sh.rotation.z=-0.09*side;
    return {sh:sh,elb:elb};
  }
  var aL=arm(1), aR=arm(-1);
  // legs: hip pivot -> thigh (skin) -> knee pivot -> sock shin + boots
  function leg(side){
    var hip=new THREE.Group(); hip.position.set(0.095*side,0.8,0); g.add(hip);
    capsule(hip,skinM,0.07,0.36,0,-0.17,0);
    var knee=new THREE.Group(); knee.position.set(0,-0.36,0); hip.add(knee);
    capsule(knee,sock,0.058,0.36,0,-0.16,0);
    msh(knee,boxGeo(0.11,0.08,0.23),dark,0,-0.36,0.045);
    msh(knee,sphGeo(0.05),dark,0,-0.345,0.14);
    return {hip:hip,knee:knee};
  }
  var lL=leg(1), lR=leg(-1);
  // shirt number on the back
  var nc=makeCanvas(96,96), nx=nc.getContext('2d');
  nx.fillStyle='rgba(255,255,255,0.95)';
  nx.font='900 62px Arial'; nx.textAlign='center'; nx.textBaseline='middle';
  nx.fillText(String(num),48,52);
  var nm=new THREE.Mesh(new THREE.PlaneGeometry(0.26,0.26),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(nc),transparent:true}));
  nm.position.set(0,1.22,-0.168); nm.rotation.y=Math.PI;
  g.add(nm);
  g.userData={legL:lL.hip,legR:lR.hip,kneeL:lL.knee,kneeR:lR.knee,armL:aL.sh,armR:aR.sh,elbL:aL.elb,elbR:aR.elb,phase:Math.random()*6,prevYaw:0};
  return g;
};

AF.Renderer.prototype.buildMatch=function(match){
  var THREE=T();
  this.disposeMatch();
  this.match=match;
  var grp=this.matchGroup=new THREE.Group();
  this.scene.add(grp);
  this.rigs={};
  var skins=['#f0c8a0','#c98d5f','#8d5a3a','#5f3d26'];
  for(var ti=0;ti<2;ti++){
    var team=match.teams[ti];
    for(var i=0;i<team.players.length;i++){
      var p=team.players[i];
      var kit=p.role==='GK'?{shirt:p.gkColor,shorts:'#111111',sock:p.gkColor}:team.kit;
      var rig=this.makeRig(kit,p.num,skins[(p.id+ti)%skins.length],p.face);
      grp.add(rig);
      var pShadow=this.makeBlobShadow(0.52,0.28,0.24);
      grp.add(pShadow);
      rig.userData.shadow=pShadow;
      rig.rotation.y=Math.PI/2-p.facing;
      rig.position.set(p.pos.x,0,p.pos.z);
      pShadow.position.set(p.pos.x,0.024,p.pos.z);
      this.rigs[p.id]={rig:rig,p:p};
    }
  }
  // referee
  var refRig=this.makeRig({shirt:'#1a1a1a',shorts:'#1a1a1a',sock:'#1a1a1a'},0,'#e0b090',AF.FACES.randomFace());
  refRig.userData.isRef=true;
  this.refRig=refRig;
  grp.add(refRig);
  var refShadow=this.makeBlobShadow(0.48,0.25,0.2);
  grp.add(refShadow); refRig.userData.shadow=refShadow;
  // ball
  var bc=makeCanvas(128,64), bx=bc.getContext('2d');
  bx.fillStyle='#fafafa'; bx.fillRect(0,0,128,64);
  bx.fillStyle='#111';
  for(var yy=0;yy<2;yy++)for(var xx=0;xx<4;xx++){
    bx.beginPath(); bx.arc(16+xx*32+(yy%2)*16,16+yy*32,7,0,Math.PI*2); bx.fill();
  }
  var ball=new THREE.Mesh(new THREE.SphereGeometry(CFG.BALL_R,16,12),new THREE.MeshLambertMaterial({map:new THREE.CanvasTexture(bc)}));
  ball.castShadow=true;
  this.ballMesh=ball;
  grp.add(ball);
  this.ballShadow=this.makeBlobShadow(0.24,0.24,0.28);
  grp.add(this.ballShadow);
  // controlled indicator ring + name tag
  var ring=new THREE.Mesh(new THREE.RingGeometry(0.5,0.72,28),new THREE.MeshBasicMaterial({color:0xffe93c,transparent:true,opacity:0.9,side:THREE.DoubleSide,depthWrite:false}));
  ring.rotation.x=-Math.PI/2; ring.position.y=0.03;
  this.ring=ring; grp.add(ring);
  var ring2=new THREE.Mesh(new THREE.RingGeometry(0.3,0.42,22),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.45,side:THREE.DoubleSide,depthWrite:false}));
  ring2.rotation.x=-Math.PI/2; ring2.position.y=0.03;
  this.ring2=ring2; grp.add(ring2);
  this.nameSprite=this.makeTextSprite('',1.45,0.38);
  grp.add(this.nameSprite);
  if(match.userSide>=0){
    var mk=new THREE.Mesh(new THREE.ConeGeometry(0.42,0.85,4),new THREE.MeshBasicMaterial({color:new THREE.Color(match.teams[match.userSide].kit.shirt),transparent:true,opacity:0.9}));
    mk.rotation.x=Math.PI;
    this.attackMarker=mk;
    grp.add(mk);
  }
  // AI intent labels
  this.labelSprites={};
  for(ti=0;ti<2;ti++){
    var team2=match.teams[ti];
    for(i=0;i<team2.players.length;i++){
      var pp=team2.players[i];
      var sp=this.makeTextSprite('',1.25,0.34);
      sp.visible=false;
      grp.add(sp);
      this.labelSprites[pp.id]=sp;
    }
  }
};
AF.Renderer.prototype.makeTextSprite=function(text,w2,h2){
  var c=makeCanvas(256,64), x=c.getContext('2d');
  var tex=new THREE.CanvasTexture(c);
  var spr=new (T()).Sprite(new (T()).SpriteMaterial({map:tex,transparent:true,depthWrite:false}));
  spr.scale.set(w2,h2,1);
  spr.userData={canvas:c,tex:tex,text:'__init'};
  this.setSpriteText(spr,text);
  return spr;
};
AF.Renderer.prototype.setSpriteText=function(spr,text){
  if(spr.userData.text===text)return;
  spr.userData.text=text;
  var x=spr.userData.canvas.getContext('2d');
  x.clearRect(0,0,256,64);
  x.font='900 30px Arial'; x.textAlign='center'; x.textBaseline='middle';
  x.lineWidth=6; x.strokeStyle='rgba(0,0,0,0.85)';
  x.strokeText(text,128,34);
  x.fillStyle='#ffffff';
  x.fillText(text,128,34);
  spr.userData.tex.needsUpdate=true;
};
AF.Renderer.prototype.disposeMatch=function(){
  if(!this.matchGroup)return;
  var grp=this.matchGroup;
  grp.traverse(function(o){
    if(o.geometry)o.geometry.dispose();
    if(o.material){
      if(o.material.map)o.material.map.dispose();
      o.material.dispose();
    }
  });
  this.scene.remove(grp);
  this.matchGroup=null; this.rigs={}; this.ballMesh=null; this.ballShadow=null; this.refRig=null; this.attackMarker=null;
  this.labelSprites={}; this.fx=[];
  this.match=null;
};

/* ---------------- per-frame sync ---------------- */
AF.Renderer.prototype.sync=function(dt){
  var match=this.match;
  if(!match)return;
  var THREE=T();
  // players
  this.time=(this.time||0)+dt;
  for(var key in this.rigs){
    var rec=this.rigs[key];
    var p=rec.p, rig=rec.rig, ud=rig.userData;
    rig.position.x=p.pos.x; rig.position.z=p.pos.z;
    rig.rotation.y=Math.PI/2-p.facing;
    var spd=Math.sqrt(p.vel.x*p.vel.x+p.vel.z*p.vel.z);
    ud.phase+=dt*(1.1+spd*2.35);
    var stride=u.clamp(spd/6.5,0,1);
    var s=Math.sin(ud.phase);
    var swing=0.95*stride;
    ud.legL.rotation.x=s*swing;
    ud.legR.rotation.x=-s*swing;
    ud.kneeL.rotation.x=Math.max(0,Math.sin(ud.phase+2.5))*1.2*stride;
    ud.kneeR.rotation.x=Math.max(0,Math.sin(ud.phase+2.5+Math.PI))*1.2*stride;
    ud.armL.rotation.x=-s*0.8*stride;
    ud.armR.rotation.x=s*0.8*stride;
    ud.elbL.rotation.x=-(0.15+Math.max(0,s)*0.7)*stride-0.06;
    ud.elbR.rotation.x=-(0.15+Math.max(0,-s)*0.7)*stride-0.06;
    var bl=this.match.ball;
    if(p.role==='GK'&&bl.owner===p&&p.holdT>0){
      ud.armL.rotation.x=u.damp(ud.armL.rotation.x,-1.3,8,dt);
      ud.armR.rotation.x=u.damp(ud.armR.rotation.x,-1.3,8,dt);
      ud.elbL.rotation.x=u.damp(ud.elbL.rotation.x,-0.5,8,dt);
      ud.elbR.rotation.x=u.damp(ud.elbR.rotation.x,-0.5,8,dt);
    }
    if(p.animKick>0){
      var kk=1-p.animKick/0.3;
      ud.legR.rotation.x=Math.sin(kk*Math.PI)*-1.5;
      ud.kneeR.rotation.x=kk<0.45?kk*2.4:Math.max(0,1.08-(kk-0.45)*2.4);
    }
    var lean=p.state==='tackle'?-1.2:p.state==='fall'?-1.45:p.state==='stumble'?-0.45:0.06+stride*0.16;
    rig.rotation.x=u.damp(rig.rotation.x,lean,9,dt);
    var py=ud.prevYaw===undefined?p.facing:ud.prevYaw;
    var yawRate=u.normAng(p.facing-py)/Math.max(dt,0.001);
    ud.prevYaw=p.facing;
    rig.rotation.z=u.damp(rig.rotation.z,u.clamp(-yawRate*0.05,-0.13,0.13),6,dt);
    var bob=Math.abs(Math.cos(ud.phase))*0.05*stride;
    rig.position.y=(p.state==='fall'?-0.25:(p.state==='tackle'?-0.15:0))+bob;
    if(ud.shadow){
      ud.shadow.position.set(p.pos.x,0.026,p.pos.z);
      var ss=1+stride*0.16;
      ud.shadow.scale.set(0.52*ss,0.28*(1+stride*0.08),1);
      ud.shadow.material.opacity=p.state==='fall'?0.32:0.22;
    }
    // AI label
    var ls=this.labelSprites[p.id];
    if(ls){
      if(AF.App&&AF.App.settings.aiLabels){
        ls.visible=true;
        ls.position.set(p.pos.x,2.35,p.pos.z);
        if(this.labelT<=0)this.setSpriteText(ls,p.aiLabel||'');
      } else ls.visible=false;
    }
  }
  // attack-goal marker so you always know which way you strike
  if(this.attackMarker){
    var umk=this.match.userSide;
    if(umk>=0){
      var mteam=this.match.teams[umk];
      var gxm=mteam.dir*CFG.FIELD.L/2;
      this.attackMarker.visible=true;
      this.attackMarker.position.set(gxm-mteam.dir*1.2,3.8+Math.sin(this.time*2.4)*0.28,0);
      this.attackMarker.rotation.y=this.time*1.5;
    } else this.attackMarker.visible=false;
  }
  if(this.refRig&&match.ref){
    this.refRig.position.set(match.ref.pos.x,0,match.ref.pos.z);
    if(this.refRig.userData.shadow)this.refRig.userData.shadow.position.set(match.ref.pos.x,0.026,match.ref.pos.z);
    this.refRig.rotation.y=Math.PI/2-Math.atan2(match.ball.p.z-match.ref.pos.z,match.ball.p.x-match.ref.pos.x);
    var rud=this.refRig.userData;
    var rsp=Math.sin(rud.phase+=dt*4);
    rud.legL.rotation.x=rsp*0.4; rud.legR.rotation.x=-rsp*0.4;
  }
  if(this.ballMesh){
    var b=match.ball;
    this.ballMesh.position.set(b.p.x,b.p.y,b.p.z);
    this.ballMesh.rotation.x+=b.v.z*dt*4;
    this.ballMesh.rotation.z-=b.v.x*dt*4;
    if(this.ballShadow){
      this.ballShadow.position.set(b.p.x,0.027,b.p.z);
      var bs=u.clamp(1.15-b.p.y*0.16,0.34,1.15);
      this.ballShadow.scale.set(0.24*bs,0.24*bs,1);
      this.ballShadow.material.opacity=u.clamp(0.28-b.p.y*0.05,0.06,0.28);
    }
  }
  // controlled ring & name
  var c=match.controlled;
  if(this.ring){
    if(c){ this.ring.visible=true; this.ring.position.set(c.pos.x,0.04,c.pos.z);
      var pulse=1+Math.sin(this.labelT*40)*0.0001;
      this.ring.scale.set(pulse,pulse,1);
    } else this.ring.visible=false;
  }
  if(this.ring2){
    var pi=match.passIntent;
    if(pi&&pi.to){ this.ring2.visible=true; this.ring2.position.set(pi.to.pos.x,0.04,pi.to.pos.z); }
    else this.ring2.visible=false;
  }
  if(this.nameSprite){
    var cam2=this.camera; var cd2=c?u.dist(c.pos,{x:cam2.position.x,z:cam2.position.z}):99;
    if(c&&cd2>4.2){ this.nameSprite.visible=true;
      this.nameSprite.position.set(c.pos.x,2.02,c.pos.z);
      this.setSpriteText(this.nameSprite,c.num+' '+c.name.split(' ').pop().toUpperCase());
    } else this.nameSprite.visible=false;
  }
  if(this.labelT<=0)this.labelT=0.22;
  this.labelT-=dt;
  // fx particles
  for(var i=this.fx.length-1;i>=0;i--){
    var f=this.fx[i];
    f.life-=dt;
    if(f.life<=0){ this.scene.remove(f.points); f.points.geometry.dispose(); f.points.material.dispose(); this.fx.splice(i,1); continue; }
    var pos=f.points.geometry.attributes.position;
    for(var j2=0;j2<f.vel.length;j2++){
      f.vel[j2].y-=9.8*dt;
      pos.array[j2*3]+=f.vel[j2].x*dt;
      pos.array[j2*3+1]+=f.vel[j2].y*dt;
      pos.array[j2*3+2]+=f.vel[j2].z*dt;
      if(pos.array[j2*3+1]<0.1)pos.array[j2*3+1]=0.1;
    }
    pos.needsUpdate=true;
    f.points.material.opacity=Math.min(1,f.life);
  }
};
AF.Renderer.prototype.onMatchEvent=function(ev){
  if(!this.match||ev.match!==this.match)return;
  if(ev.type==='goal'){
    this.burst(ev.team);
  }
};
AF.Renderer.prototype.burst=function(teamIdx){
  var THREE=T();
  if(!this.match)return;
  var team=this.match.teams[teamIdx];
  var gx=team.dir*CFG.FIELD.L/2;
  var N=160;
  var pos=new Float32Array(N*3), vel=[], col=[];
  var c1=new THREE.Color(team.kit.shirt), c2=new THREE.Color(0xffffff);
  for(var i=0;i<N;i++){
    pos[i*3]=gx-team.dir*u.rr(2,10);
    pos[i*3+1]=u.rr(8,17);
    pos[i*3+2]=u.rr(-24,24);
    vel.push({x:u.rr(-2,2),y:u.rr(1,5),z:u.rr(-2,2)});
    var cc=u.chance(0.5)?c1:c2;
    col.push(cc.r,cc.g,cc.b);
  }
  var geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  geo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(col),3));
  var pts=new THREE.Points(geo,new THREE.PointsMaterial({size:0.32,vertexColors:true,transparent:true,depthWrite:false}));
  this.scene.add(pts);
  this.fx.push({points:pts,vel:vel,life:2.8});
};

/* ---------------- camera ---------------- */
AF.Renderer.prototype.updateCamera=function(dt,st){
  var THREE=T();
  var cam=this.camera;
  var mode=st.mode;
  if(mode==='menu'){
    this.menuAngle+=dt*0.045;
    var r2=66;
    cam.position.set(Math.sin(this.menuAngle)*r2,20+Math.sin(this.menuAngle*0.7)*4,Math.cos(this.menuAngle)*r2);
    var bl=this.match?this.match.ball.p:{x:0,z:0};
    this.lookPos=this.lookPos||new THREE.Vector3(0,1,0);
    this.lookPos.lerp(new THREE.Vector3(bl.x*0.4,0.5,bl.z*0.4),1-Math.exp(-1.5*dt));
    cam.lookAt(this.lookPos);
    return;
  }
  if(mode==='tele'){
    var b=this.match?this.match.ball.p:{x:0,z:0};
    var tx=u.clamp(b.x*0.85,-40,40);
    cam.position.set(u.damp(cam.position.x,tx,3,dt),24,-(CFG.FIELD.W/2+28));
    this.lookPos=this.lookPos||new THREE.Vector3();
    this.lookPos.lerp(new THREE.Vector3(tx*0.95,0.85,b.z*0.6),1-Math.exp(-4*dt));
    cam.lookAt(this.lookPos);
    return;
  }
  // follow
  var tgt=st.target||{x:0,z:0};
  var ball=st.ball||{x:0,z:0};
  var dist=st.dist*(st.zoom||1);
  var yaw=st.camYaw, pitch=st.camPitch||0.42;
  var cx=tgt.x-Math.sin(yaw)*dist;
  var cz=tgt.z-Math.cos(yaw)*dist;
  var cy=1.15+Math.sin(pitch)*dist*1.25;
  if(!this.camPos)this.camPos=new THREE.Vector3(cx,cy,cz);
  var k=this.camSnapT>0?14:5.5;
  this.camSnapT-=dt;
  this.camPos.x=u.damp(this.camPos.x,cx,k,dt);
  this.camPos.y=u.damp(this.camPos.y,cy,k,dt);
  this.camPos.z=u.damp(this.camPos.z,cz,k,dt);
  cam.position.copy(this.camPos);
  // look target: blend controlled player and ball
  var bd=u.dist(tgt,ball);
  var m=u.clamp(bd/32,0.12,0.5);
  var lx=tgt.x+(ball.x-tgt.x)*m, lz=tgt.z+(ball.z-tgt.z)*m;
  if(!this.lookPos)this.lookPos=new THREE.Vector3(lx,1,lz);
  this.lookPos.x=u.damp(this.lookPos.x,lx,7,dt);
  this.lookPos.y=u.damp(this.lookPos.y,1.35,7,dt);
  this.lookPos.z=u.damp(this.lookPos.z,lz,7,dt);
  cam.lookAt(this.lookPos);
};
AF.Renderer.prototype.snapCamera=function(){ this.camSnapT=0.6; };
AF.Renderer.prototype.render=function(){ if(this.renderer)this.renderer.render(this.scene,this.camera); };
})();
