"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(__dirname,".."),source=path.join(root,"game-source/signal-frontier/src/assets/terrain"),
 manifest=JSON.parse(fs.readFileSync(path.join(source,"manifest.json"))),E=require("../game-source/signal-frontier/src/engine.js");
assert.equal(manifest.sources.length,17);
assert.deepEqual(manifest.sources.filter(s=>s.id[0]==="T").map(s=>s.id),["T01","T02","T03","T04","T05","T06","T07","T11","T12","T13","T14"]);
assert.deepEqual(manifest.sources.filter(s=>s.id[0]==="D").map(s=>s.id),["D13","D14","D15","D16","D17","D18"]);
assert.deepEqual(manifest.files.map(f=>f.name),["classic.webp","frontier.webp","expedition.webp","highlands.webp","districts.webp","districts-east.webp","cliff.webp"]);
for(const f of manifest.files){
 const bytes=fs.readFileSync(path.join(source,f.name));
 assert.equal(bytes.toString("ascii",0,4),"RIFF");assert.equal(bytes.toString("ascii",8,12),"WEBP");
 assert.equal(bytes.readUInt32LE(4)+8,bytes.length,"binary asset is intact");
 assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),f.sha256);
 assert.deepEqual(bytes,fs.readFileSync(path.join(root,"games/signal-frontier/assets/terrain",f.name)),"production matches source");
 if(f.W){const world=E.map(f.name.split(".")[0]);assert.equal(f.W,world.W);assert.equal(f.H,world.H);}
 assert.ok(f.width<=4096&&f.height<=2048,"bounded texture dimensions");
 assert.ok(f.width*f.height*4*4/3<36*1024*1024,"RGBA texture including mipmaps stays below 36 MiB");
}
const district=manifest.files.find(f=>f.name==="districts.webp"),cliff=manifest.files.find(f=>f.name==="cliff.webp");
assert.ok(district.bytes+cliff.bytes<800000,"main scene downloads less than 800 KB of terrain art");
const east=manifest.files.find(f=>f.name==="districts-east.webp");
assert.ok(east.bytes+cliff.bytes<800000,"expanded scene also stays below 800 KB");
assert.ok(east.width/east.W>=district.width/district.W,"expanded map preserves western horizontal texture density");
assert.equal(east.height/east.H,district.height/district.H,"vertical texture density is unchanged");
console.log("PASS selected source provenance, six map sizes, full eastern coverage, bounded textures, WebP integrity and identical production assets");
