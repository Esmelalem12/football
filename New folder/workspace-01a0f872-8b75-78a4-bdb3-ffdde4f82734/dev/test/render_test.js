'use strict';
/* Exercises render.js against real THREE (no WebGL): catches API/geometry errors. */
var fs=require('fs'), path=require('path'), vm=require('vm');
var grad={addColorStop(){}};
var ctxStub={canvas:null,measureText:function(){return{width:10};},createLinearGradient:function(){return grad;},createRadialGradient:function(){return grad;}};
['fillRect','strokeRect','clearRect','beginPath','moveTo','lineTo','stroke','fill','arc','ellipse','fillText','strokeText','quadraticCurveTo','bezierCurveTo','save','restore','translate','rotate','scale','drawImage','closePath','clip','rect'].forEach(function(m){ctxStub[m]=function(){};});
function mkEl(id){
  var el={id:id,children:[],style:{},value:'',textContent:'',width:300,height:150,
    classList:{add(){},remove(){},toggle(){}},
    appendChild(c){el.children.push(c);return c;},removeChild(){},addEventListener(){},
    getContext(){ctxStub.canvas=el;return ctxStub;},querySelectorAll(){return [];},
    getAttribute(){return null;},setAttribute(){},parentNode:null,get firstChild(){return null}};
  return el;
}
global.document={readyState:'complete',createElement:t=>mkEl('dyn'),getElementById:id=>mkEl(id),querySelectorAll:()=>[],addEventListener(){},body:mkEl('body')};
global.window=global; global.innerWidth=1280; global.innerHeight=720;
global.addEventListener=function(){};
global.requestAnimationFrame=function(){};
global.performance=require('perf_hooks').performance;

vm.runInThisContext(fs.readFileSync(path.join(__dirname,'..','three.min.js'),'utf8'),{filename:'three.min.js'});
function load(f){ vm.runInThisContext(fs.readFileSync(path.join(__dirname,'..','js',f),'utf8'),{filename:f}); }
load('core.js'); load('sim.js'); load('ai.js'); load('match.js'); load('render.js');
var AF=globalThis.AF, THREE=globalThis.THREE;
var THREEv=THREE.REVISION;
console.log('THREE revision:',THREEv);

var r=new AF.Renderer(mkEl('gl'));
// stub the GL renderer; use real scene graph
r.renderer={shadowMap:{enabled:false},setPixelRatio(){},setSize(){},render(){},outputEncoding:0};
r.quality='high';
r.scene=new THREE.Scene();
r.camera=new THREE.PerspectiveCamera(56,16/9,0.5,900);
try{
  r.buildStadium();
  console.log('ok: buildStadium');
}catch(e){ console.log('FAIL buildStadium:',e.message); process.exit(1); }

var m=new AF.Match({homeId:0,awayId:7,userSide:0,diffKey:'pro',lengthSec:240,
  userSpec:{name:'Test Player',pos:'ST',num:9,attrs:{pace:70,sho:66,pas:55,dri:64,def:42,phy:60}}});
try{
  r.buildMatch(m);
  console.log('ok: buildMatch, rigs:',Object.keys(r.rigs).length);
}catch(e){ console.log('FAIL buildMatch:',e.stack); process.exit(1); }
if(Object.keys(r.rigs).length!==22){ console.log('FAIL rig count'); process.exit(1); }

var App=globalThis.AF.App={settings:{aiLabels:true,radar:true}};
var t=0;
try{
  for(t=0;t<60*20;t++){
    if(m.state==='half')m.startSecondHalf();
    m.update(1/60,null);
    r.sync(1/60);
    var c=m.controlled;
    r.updateCamera(1/60,{mode:'follow',target:c?c.pos:m.ball.p,ball:m.ball.p,camYaw:0.3,camPitch:0.44,dist:9.5,zoom:1});
  }
  console.log('ok: 20s sync+camera');
}catch(e){ console.log('FAIL sync at',t,':',e.stack); process.exit(1); }

// camera modes
try{
  r.updateCamera(1/60,{mode:'tele'});
  r.updateCamera(1/60,{mode:'menu'});
  r.snapCamera();
  console.log('ok: camera modes');
}catch(e){ console.log('FAIL camera:',e.stack); process.exit(1); }

// confetti via goal event
try{
  m.goal(0);
  r.onMatchEvent({type:'goal',team:0,match:m});
  r.sync(1/60);
  console.log('ok: goal confetti, fx:',r.fx.length);
}catch(e){ console.log('FAIL confetti:',e.stack); process.exit(1); }

// dispose & rebuild
try{
  r.disposeMatch();
  r.buildMatch(m);
  r.disposeMatch();
  console.log('ok: dispose/rebuild');
}catch(e){ console.log('FAIL dispose:',e.stack); process.exit(1); }

console.log('RENDER TEST: ALL OK');
