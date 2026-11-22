'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),esbuild=require('esbuild');
const source=path.resolve('game-source/signal-frontier/src/babylon/prefabs.js'),compiled=esbuild.transformSync(fs.readFileSync(source,'utf8'),{format:'cjs',target:'node20'}),moduleFile=new Module(source,module);
moduleFile._compile(compiled.code,source);const {PREFAB_NAMES,prefabData,Kit}=moduleFile.exports;
assert.equal(PREFAB_NAMES.length,new Set(PREFAB_NAMES).size);
for(const required of ['medic-armour','shield-plate','grenadier-armour','armored-chassis','armored-wheel','armored-turret',
 'warden-armour','flamer-rig','bomber-core','tank-hull','tank-turret','mortar-hull','mortar-cradle','mortar-tube',
 'archive-carrier','archive-barrier','archive-power','archive-depot','mission-dock','field-console','relay-mast','watch-tower','supply-crate','ore-outcrop','matter-outcrop','rubble']){
 assert.ok(PREFAB_NAMES.includes(required),required+' must have its authored geometry');
}
let triangles=0,shadowTriangles=0;
for(const name of PREFAB_NAMES){
 const model=prefabData(name);assert.equal(model,prefabData(name),name+': immutable geometry must be reused');
 assert.equal(model.solid.uvs.length,model.solid.positions.length/3*2,name+': each solid vertex has finish and joint shading');
 assert.ok(model.solid.uvs.every(v=>Number.isFinite(v)&&v>=0&&v<=1),name+': bounded material response');
 for(const part of ['solid','shadow']){
  const d=model[part];assert.ok(d.positions.length>0,name+' '+part);assert.equal(d.positions.length%3,0);assert.equal(d.normals.length,d.positions.length);assert.equal(d.colors.length,d.positions.length/3*4);
  assert.ok(d.positions.every(Number.isFinite),name+': finite vertices');assert.ok(d.indices.every(i=>Number.isInteger(i)&&i>=0&&i<d.positions.length/3));
  for(let i=0;i<d.normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...d.normals.slice(i,i+3))-1)<1e-6,name+': unit normals');
  for(let i=0;i<d.indices.length;i+=3){
   const [ia,ib,ic]=d.indices.slice(i,i+3).map(i=>i*3),a=d.positions.slice(ia,ia+3),b=d.positions.slice(ib,ib+3),c=d.positions.slice(ic,ic+3),u=b.map((v,j)=>v-a[j]),v=c.map((v,j)=>v-a[j]),
    cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
   assert.ok(cross.reduce((n,x,j)=>n+x*d.normals[ia+j],0)>=-1e-7,name+': triangle winding follows lighting normals');
  }
 }
 triangles+=model.solid.indices.length/3;shadowTriangles+=model.shadow.indices.length/3;
 assert.ok(model.shadow.indices.length<=model.solid.indices.length,name+': seams and lamps need no redundant shadow geometry');
}
assert.ok(shadowTriangles<triangles*.85,'cosmetic surface details must not duplicate full shadow work');
assert.ok(triangles<=49476,'the complete fleet must fit the previous solid triangle budget');
const marking=new Kit().panel(0,0,6,9,3).result();
assert.equal(marking.solid.indices.length/3,6,'paint needs only one cut-corner face');
assert.equal(marking.shadow.indices.length,0,'paint must not cast a second shadow');
const outer=new Kit().box(0,0,0,20,20,20).result(),nested=new Kit().box(0,0,0,20,20,20).box(0,0,5,5,5,3).result();
assert.ok(nested.culledFaces>0,'a fully buried component must not be sent to the GPU');
assert.deepEqual(nested.solid,outer.solid,'removing a buried component preserves every exterior vertex, colour and normal');
assert.deepEqual(nested.shadow,outer.shadow,'buried components cannot change the shadow');
const catalog=JSON.parse(fs.readFileSync('game-source/signal-frontier/design/BABYLON_ART_REFERENCES.json','utf8'));
assert.equal(catalog.assets.length,20);assert.equal(catalog.assets.find(a=>a.kind==='runner').derived,true);
for(const a of catalog.assets){
 assert.match(a.sha256,/^[a-f0-9]{64}$/);const image=fs.readFileSync(path.resolve('game-source/signal-frontier/design',a.preview));
 assert.equal(image.toString('ascii',0,4),'RIFF');assert.equal(image.toString('ascii',8,12),'WEBP');
 assert.equal(image.readUInt32LE(4)+8,image.length,a.kind+': Git must preserve every binary preview byte');
}
console.log('PASS '+PREFAB_NAMES.length+' cached 3D assemblies: finite geometry, normals, winding, reduced shadow detail, and 20 verified reference mappings ('+triangles+' triangles in the full catalogue)');
