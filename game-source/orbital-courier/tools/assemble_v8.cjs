'use strict';
const fs=require('fs'),path=require('path'),P=require('../src/physics.js');
const original=JSON.parse(fs.readFileSync(path.join(__dirname,'seeds-v8/original-levels.json'))),levels=structuredClone(original.levels),sectors=structuredClone(original.sectors);
const authored=['0-3','1','2'].flatMap(s=>JSON.parse(fs.readFileSync(path.join(__dirname,`../docs/authored-v8-${s}.json`))));
for(const {level}of authored)levels[level.id]=level;
sectors[5]={name:'Выбор пути',tag:'06 / ВЫБОР ПУТИ',color:'#8dbdf5',description:'Противоположные облёты и разные портальные ветви на общей карте.'};
for(const [name,color]of [['Развилки приливов','#82dce0'],['Двойная топология','#c6adff'],['Адреса созвездий','#ffc582']])sectors.push({name,color,tag:`${String(sectors.length+1).padStart(2,'0')} / ${name.toUpperCase()}`});
const results=[],witnesses=[];
for(const l of levels){const cs=l.solutions||[l.solution];const runs=[];for(const c of cs)for(const mode of ['normal','pro']){const course=l.solutions?c:mode==='pro'?(l.proSolution||c):c;const state=P.simulate(P.prepareLevel(l,mode),course.angle,course.speed).state;if(state.status!=='won')throw Error(`route ${l.id+1} ${mode}: ${state.reason}`);runs.push(state);witnesses.push({level:l.id,mode,branch:c.branch||null,angle:course.angle,speed:course.speed,time:state.t,precision:state.dockPrecision,loops:state.flybyIndex,portals:state.portalIndex,drops:state.dropIndex});}
 const limit=Math.max(.4,Math.min(.85,Math.floor((Math.min(...runs.map(s=>s.dockPrecision))-.045)*100)/100));
 const maxSpeed=l.rules?.maxLaunchSpeed||Infinity;
 l.medalRules=[{type:'delivery'}];if(l.branches){l.medalRules.push({type:'precision',limit},{type:'branches'});}else if(l.stops){l.medalRules.push({type:'precision',limit},{type:'cargo'});}else if((l.rules?.minCargo||0)>=l.cargo.length){if(maxSpeed<=l.parSpeed){l.medalRules.push({type:'precision',limit},{type:'time',limit:Math.ceil(Math.max(...runs.map(s=>s.t))*1.07*10)/10});}else l.medalRules.push({type:'economy',limit:l.parSpeed},{type:'precision',limit});}else l.medalRules.push({type:'economy',limit:l.parSpeed},{type:'cargo'});
 results.push({id:l.id,name:l.name,rules:l.medalRules,minimumWitnessPrecision:Math.min(...runs.map(s=>s.dockPrecision))});
}
if(levels.length!==80||authored.length!==16)throw Error('incomplete campaign');
fs.writeFileSync(path.join(__dirname,'../src/levels.js'),`/* Authored v8 campaign. A/B are routes in the same physical world, not replaced scenes. */\n(function(root){'use strict';const O=root.Orbital=root.Orbital||{};O.SECTORS=${JSON.stringify(sectors)};O.LEVELS=${JSON.stringify(levels)};if(typeof module!=='undefined'&&module.exports)module.exports={SECTORS:O.SECTORS,LEVELS:O.LEVELS};})(typeof globalThis!=='undefined'?globalThis:window);\n`);
fs.writeFileSync(path.join(__dirname,'../docs/medal-calibration-v8.json'),JSON.stringify(results,null,2));fs.writeFileSync(path.join(__dirname,'../docs/level-witnesses-v8.json'),JSON.stringify(witnesses,null,2));console.log('80 levels / 20 sectors / 184 normal+PRO witnesses.');
