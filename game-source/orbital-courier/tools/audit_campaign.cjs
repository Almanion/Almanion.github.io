'use strict';
const fs=require('node:fs'),path=require('node:path');require('../src/levels');const C=require('../src/campaign'),P=require('../src/physics'),O=globalThis.Orbital;
const rows=[];
for(const id of C.order){const l=O.LEVELS[id],courses=l.solutions||[l.solution],routes=[];
 for(const course of courses){const base=P.prepareLevel(l),centre=P.simulate(base,course.angle,course.speed).state;let near=0,broad=0;
  for(const da of [-.2,-.1,0,.1,.2])for(const dv of [-1,0,1]){const s=P.simulate(base,course.angle+da,course.speed+dv).state;if(s.status==='won'&&(!course.branch||s.branchId===course.branch))near++;}
  for(const da of [-1,-.5,0,.5,1])for(const dv of [-4,-2,0,2,4]){const s=P.simulate(base,course.angle+da,course.speed+dv).state;if(s.status==='won'&&(!course.branch||s.branchId===course.branch))broad++;}
  const frozen=structuredClone(l);for(const p of frozen.planets)delete p.motion;delete frozen.target.motion;
  const frozenState=P.simulate(P.prepareLevel(frozen),course.angle,course.speed).state;
  routes.push({branch:course.branch||null,won:centre.status==='won',nearWinsOf15:near,broadWinsOf25:broad,flybys:centre.flybyIndex,portals:centre.portalIndex,time:centre.t,frozenCourseWon:frozenState.status==='won'});
 }
 const angle=Math.atan2(l.start.y-l.target.y,l.target.x-l.start.x)*180/Math.PI;
 rows.push({id,number:C.number(id),tier:C.tiers.indexOf(C.tier(id))+1,name:l.name,straightCourseWon:P.simulate(P.prepareLevel(l),angle,l.solution.speed).state.status==='won',routes});
}
const tiers=C.tiers.map((t,i)=>{const maps=rows.filter(r=>r.tier===i+1),r=maps.flatMap(m=>m.routes);return {name:t.name,contracts:maps.length,averageBroadWinsOf25:r.reduce((n,r)=>n+r.broadWinsOf25,0)/r.length,averageFlybys:r.reduce((n,r)=>n+r.flybys,0)/r.length,averageTime:r.reduce((n,r)=>n+r.time,0)/r.length};});
const report={date:'2026-09-26',method:'Fixed deterministic local grids around authored courses, base equipment, normal mode. This measures local tolerance, not human difficulty or all solutions.',tiers,rows};
fs.writeFileSync(path.join(__dirname,'../docs/campaign-audit-v11.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(tiers,null,2));
if(rows.some(r=>r.routes.some(c=>!c.won||c.nearWinsOf15<3)))throw Error('An isolated or invalid reference course requires review');
if(rows.filter(r=>r.id>=76).some(r=>r.straightCourseWon))throw Error('New finale admits a direct-course shortcut');
