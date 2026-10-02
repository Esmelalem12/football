/* Browser-like smoke test with DOM stubs: boots the app, runs a career match with fake input. */
'use strict';
var fs=require('fs'), path=require('path'), vm=require('vm');

/* ---- DOM stubs ---- */
var listeners={};
function addListen(key,f){ (listeners[key]=listeners[key]||[]).push(f); }
var grad={addColorStop(){}};
var ctxStub={canvas:null,measureText:function(){return{width:10};},createLinearGradient:function(){return grad;},createRadialGradient:function(){return grad;}};
['fillRect','strokeRect','clearRect','beginPath','moveTo','lineTo','stroke','fill','arc','ellipse','fillText','strokeText','quadraticCurveTo','bezierCurveTo','save','restore','translate','rotate','scale','drawImage','closePath','clip','rect'].forEach(function(m){ctxStub[m]=function(){};});

function mkEl(id){
  var el={
    id:id, children:[], style:{}, dataset:{}, value:'Abebe Bekele',
    textContent:'', _innerHTML:'',
    classList:{add:function(){},remove:function(){},toggle:function(){}},
    appendChild:function(c){ el.children.push(c); return c; },
    removeChild:function(c){ var i=el.children.indexOf(c); if(i>=0)el.children.splice(i,1); c.parentNode=null; },
    addEventListener:function(t,f){ addListen((id||'anon')+':'+t,f); },
    getContext:function(){ ctxStub.canvas=el; return ctxStub; },
    querySelectorAll:function(){ return []; },
    getAttribute:function(){ return null; },
    setAttribute:function(){}, focus:function(){}, select:function(){},
    parentNode:null, get firstChild(){ return el.children[0]||null; },
    width:300,height:150
  };
  Object.defineProperty(el,'innerHTML',{ get:function(){return el._innerHTML;}, set:function(v){ el._innerHTML=v; el.children=[]; } });
  return el;
}
var registry={};
global.document={
  readyState:'complete',
  createElement:function(tag){ return mkEl('dyn-'+tag+'-'+Math.random()); },
  getElementById:function(id){ if(!registry[id])registry[id]=mkEl(id); return registry[id]; },
  querySelectorAll:function(){ return []; },
  addEventListener:function(t,f){ addListen('document:'+t,f); },
  body:mkEl('body')
};
global.innerWidth=1280; global.innerHeight=720;
global.window=global;
global.addEventListener=function(t,f){ addListen('window:'+t,f); };
var rafCb=null;
global.requestAnimationFrame=function(cb){ rafCb=cb; };
global.localStorage=undefined;
global.performance=require('perf_hooks').performance;
global.console=console;

/* ---- load game code (all except three-dependent bundle file) ---- */
function load(f){ vm.runInThisContext(fs.readFileSync(path.join(__dirname,'..','js',f),'utf8'),{filename:f}); }
load('core.js'); load('sim.js'); load('ai.js'); load('match.js'); load('render.js'); load('input_hud.js'); load('career.js'); load('ui_main.js');
var AF=globalThis.AF, u=AF.util;

function fire(key,ev){ (listeners[key]||[]).forEach(function(f){ f(ev||{}); }); }
function key(code){ fire('window:keydown',{code:code,preventDefault:function(){},repeat:false}); fire('window:keyup',{code:code,preventDefault:function(){}}); }

var fails=0;
function check(cond,msg){ if(!cond){ fails++; console.log('  FAIL: '+msg); } else console.log('  ok: '+msg); }

/* ---- run ---- */
setTimeout(function(){
try{
  console.log('boot...');
  check(AF.App.mode==='menu','booted to main menu');
  check(AF.App.match!==null||!AF.App.rendererOK,'attract match behind menu');

  console.log('new career flow...');
  registry['b-new'].onclick();
  registry['b-startcareer'].onclick();
  check(!!AF.career.data,'career created: '+AF.career.data.name+' at '+AF.career.club().name);
  check(AF.UI.current==='career','career hub shown');

  console.log('launch fixture...');
  registry['b-playmatch'].onclick();
  check(AF.UI.current==='prematch','prematch shown');
  registry['b-kickoff'].onclick();
  check(AF.App.playing===true,'real match started');
  check(AF.App.match.userSide===0,'user controls home team');
  check(AF.App.match.controlled&&AF.App.match.controlled.isUser,'controlled is user player');

  console.log('play 6 seconds with input...');
  var t=1;
  for(var i=0;i<360;i++){
    if(i===60)key('KeyE');
    if(i===120){ fire('window:keydown',{code:'Space',preventDefault:function(){},repeat:false}); }
    if(i===150){ fire('window:keyup',{code:'Space',preventDefault:function(){}}); }
    if(i===180)key('KeyF');
    if(i===200)key('KeyC');
    if(i===240)key('KeyQ');
    if(i===280)key('KeyR');
    fire('window:mousemove',{clientX:100+i,clientY:300,movementX:2,movementY:0});
    AF.App.loop(t/60*1000); t++;
  }
  check(AF.App.match.t>5,'sim advanced to '+AF.App.match.t.toFixed(1)+'s');
  check(isFinite(AF.App.match.ball.p.x),'ball finite');

  console.log('force half time...');
  AF.App.match.gameSec=99999;
  AF.App.loop(t/60*1000); t++;
  check(AF.App.match.state==='half','state half');
  check(AF.UI.current==='half','half screen shown');
  registry['b-secondhalf'].onclick();
  check(AF.App.match.half===2,'second half started');

  console.log('play 2 more seconds...');
  for(i=0;i<120;i++){ AF.App.loop(t/60*1000); t++; }

  console.log('force full time...');
  AF.App.match.gameSec=99999;
  AF.App.loop(t/60*1000); t++;
  check(AF.App.match.state==='full','state full');
  setTimeout(function(){
    try{
      check(AF.UI.current==='full','full-time screen shown');
      registry['b-fullcontinue'].onclick();
      check(AF.UI.current==='career','back to career hub');
      check(AF.career.data.round===1,'round advanced to 1');
      check(AF.App.playing===false,'returned to attract mode');
      console.log('pause flow...');
      registry['b-playmatch'].onclick();
      registry['b-kickoff'].onclick();
      key('KeyP');
      check(AF.UI.current==='pause','pause screen shown');
      registry['b-resume'].onclick();
      check(AF.UI.current===null,'resumed');
      registry['b-quitmatch'].onclick();
      check(AF.UI.current==='career','quit to hub');
      // pause menu via blur
      registry['b-playmatch'].onclick(); registry['b-kickoff'].onclick();
      global.document.visibilityState='hidden';
      fire('window:blur');
      var hidPause=AF.UI.current==='pause';
      global.document.visibilityState='visible';
      registry['b-resume'].onclick();
      fire('window:blur');
      check(hidPause&&AF.UI.current===null,'auto-pause only when hidden');
      global.document.visibilityState='visible';
      registry['b-quitmatch'].onclick();
      console.log(fails===0?'SMOKE TEST: ALL OK':'SMOKE TEST: '+fails+' FAILURES');
      process.exit(fails===0?0:1);
    }catch(e){ console.log('LATE ERROR:',e.stack); process.exit(1); }
  },1700);
}catch(e){ console.log('ERROR:',e.stack); process.exit(1); }
},120);
