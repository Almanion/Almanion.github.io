"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(__dirname,".."),source=path.join(root,"game-source/signal-frontier/src/assets/terrain"),
 manifest=JSON.parse(fs.readFileSync(path.join(source,"manifest.json"))),E=require("../game-source/signal-frontier/src/engine.js");
assert.equal(manifest.sources.length,17);
assert.deepEqual(manifest.sources.filter(s=>s.id[0]==="T").map(s=>s.id),["T01","T02","T03","T04","T05","T06","T07","T11","T12","T13","T14"]);
for(const f of manifest.files){
 const bytes=fs.readFileSync(path.join(source,f.name));
 assert.equal(bytes.toString("ascii",0,4),"RIFF");assert.equal(bytes.toString("ascii",8,12),"WEBP");
 assert.equal(bytes.readUInt32LE(4)+8,bytes.length,"binary asset is intact");
 assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),f.sha256);
 assert.deepEqual(bytes,fs.readFileSync(path.join(root,"games/signal-frontier/assets/terrain",f.name)),"production matches source");
 if(f.W){const world=E.map(f.name.split(".")[0]);assert.equal(f.W,world.W);assert.equal(f.H,world.H);}
 assert.ok(f.size<=2048,"bounded texture allocation");
}
const district=manifest.files.find(f=>f.name==="districts.webp"),cliff=manifest.files.find(f=>f.name==="cliff.webp");
assert.ok(district.bytes+cliff.bytes<800000,"main scene downloads less than 800 KB of terrain art");
console.log("PASS selected source provenance, five map sizes, bounded textures, WebP integrity and identical production assets");
