'use strict';
var fs=require('fs'), path=require('path'), vm=require('vm');
function load(f){ vm.runInThisContext(fs.readFileSync(path.join(__dirname,'..','js',f),'utf8'),{filename:f}); }
load('core.js'); load('sim.js'); load('ai.js'); load('match.js'); load('career.js');
var AF=globalThis.AF;
var c=AF.career;
c.new({name:'Test Guy',pos:'ST',diff:'pro'});
console.log('club:',c.club().name,'fixture r0:',JSON.stringify(c.nextFixture()));
var season=0;
while(season<2){
  var guard=0;
  while(c.data.round<c.data.fixtures.length&&guard++<30){
    var fx=c.nextFixture();
    var g=c._simScore(fx.home,fx.away);
    var myHome=fx.home===c.data.clubId;
    c.applyMatch({gf:myHome?g[0]:g[1],ga:myHome?g[1]:g[0],goals:1,assists:0,rating:7.2});
  }
  console.log('season',c.data.season,'done. champion pts:',c.sortedTable()[0].pts,'pos:',c._tablePos());
  var pend=c.endSeason();
  console.log('awards:',JSON.stringify(pend.awards),'offers:',JSON.stringify(c.data.offers));
  if(c.data.offers.length)c.acceptOffer(c.data.offers[0].clubId);
  c.newSeason();
  season++;
}
console.log('history:',JSON.stringify(c.data.history));
console.log('attrs after seasons:',JSON.stringify(c.data.attrs),'level',c.data.level,'xp',c.data.xp,'pts',c.data.pts);
// export/import round trip
var code=c.exportCode();
var ok=c.loadCode(code);
console.log('export/import roundtrip:',ok&&c.data.name==='Test Guy'?'OK':'FAIL');
// level-up check
var c2=new AF.Career(); c2.new({name:'X',pos:'CM',diff:'pro'});
var before=c2.data.level;
c2.applyMatch({gf:2,ga:0,goals:2,assists:1,rating:9.5});
c2.applyMatch({gf:3,ga:0,goals:2,assists:1,rating:9.5});
console.log('after 2 great matches: level',c2.data.level,'(was '+before+') pts',c2.data.pts,'expect >0 pts');
console.log('CAREER TEST DONE');
