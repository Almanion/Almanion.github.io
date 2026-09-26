'use strict';
const fs=require('node:fs'),path=require('node:path');require('../src/levels');const O=globalThis.Orbital,root=path.resolve(__dirname,'..');
const rows=JSON.parse(fs.readFileSync(path.join(root,'docs/authored-v11.json'),'utf8'));
if(rows.length!==4||rows.some((r,i)=>r.level.id!==76+i||r.level.stops?.length))throw Error('Four validated single-destination finale maps required');
for(const {level}of rows)O.LEVELS[level.id]=level;
O.SECTORS[19]={name:'Предел навигации',tag:'20 / ПРЕДЕЛ НАВИГАЦИИ',color:'#ff9ead',description:'Возврат к сместившемуся миру, диагональный каскад, окно встречи и шесть облётов пяти планет.'};
fs.writeFileSync(path.join(root,'src/levels.js'),`/* Authored campaign; stable IDs retain historical rewards and saves. */\n(function(root){'use strict';const O=root.Orbital=root.Orbital||{};O.SECTORS=${JSON.stringify(O.SECTORS)};O.LEVELS=${JSON.stringify(O.LEVELS)};if(typeof module!=='undefined'&&module.exports)module.exports={SECTORS:O.SECTORS,LEVELS:O.LEVELS};})(typeof globalThis!=='undefined'?globalThis:window);\n`);
