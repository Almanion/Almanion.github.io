'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {density,temperatures,speeds,diagrams}=require('../tools/generate-maxwell-note-diagrams');
for(const T of temperatures){
 let area=0;const h=.0005;for(let v=0;v<25;v+=h)area+=(density(v,T)+density(v+h,T))*h/2;
 assert.ok(Math.abs(area-1)<1e-8,'Maxwell curve must have unit area');
 assert.equal(density(0,T),0);
 assert.ok(density(1,T)>0);
 const peak=Math.sqrt(T);assert.ok(density(peak,T)>density(peak-.005,T));assert.ok(density(peak,T)>density(peak+.005,T));
 assert.ok(density(25,T)<1e-40,'large-speed tail tends to zero');
}
assert.ok(speeds.probable<speeds.mean&&speeds.mean<speeds.rms,'characteristic speeds must be in the correct order');
for(let i=1;i<temperatures.length;i++){
 const before=temperatures[i-1],after=temperatures[i];
 assert.ok(Math.sqrt(before)<Math.sqrt(after));
 assert.ok(density(Math.sqrt(before),before)>density(Math.sqrt(after),after));
}
for(const [name,render] of Object.entries(diagrams)){
 const text=fs.readFileSync(path.join(__dirname,'../images/notes/physics-10',name),'utf8').replace(/\r\n/g,'\n');
 assert.equal(text,render(),'published diagram must match the checked generator');
}
console.log('Maxwell diagrams: normalization, peaks, tails, speed ordering and generated files passed');
