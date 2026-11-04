'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {PNG}=require('pngjs');
const {yauzl}=require(path.join(path.dirname(require.resolve('playwright-core/package.json')),'lib/utilsBundle.js'));
const {curateCatalogue}=require('../tools/signal-art-catalogue');
const {createWorkshop}=require('../tools/signal-art-workshop');
const kit=path.resolve(__dirname,'../game-source/signal-frontier/design/AI_ART_KIT');
async function unzip(bytes){
  return new Promise((resolve,reject)=>yauzl.fromBuffer(bytes,{lazyEntries:true},(error,zip)=>{
    if(error)return reject(error);const files={};zip.on('error',reject);zip.on('end',()=>resolve(files));
    zip.on('entry',entry=>zip.openReadStream(entry,(err,stream)=>{if(err)return reject(err);const parts=[];stream.on('error',reject);stream.on('data',b=>parts.push(b));stream.on('end',()=>{files[entry.fileName]=Buffer.concat(parts);zip.readEntry();});}));zip.readEntry();
  }));
}
test('active catalogue matches game models, keeps loaded surface materials and has independent prompts',async()=>{
  const full=JSON.parse(await fs.readFile(path.join(kit,'prompts.json'),'utf8')),before=JSON.stringify(full),c=curateCatalogue(full);
  const modelIds=Object.keys(require('../game-source/signal-frontier/src/engine').C).map(k=>'MODEL-'+k).concat('MODEL-bastion-south','O01','O02','O03','O04','O05');
  assert.deepEqual(c.entries.filter(e=>e.assetType==='model').map(e=>e.id).sort(),modelIds.sort());
  assert.deepEqual(c.stats,{models:34,textures:20});assert.equal(c.entries.length,54);
  assert.equal(new Set(c.entries.map(e=>e.id)).size,54);assert.equal(JSON.stringify(full),before,'Source archive unchanged');
  for(const e of c.entries){
    assert.doesNotMatch(e.id,/^(CARD|STATE|MOTION|PREP|STYLE|BUILD|UI|TECH)-/);
    assert.doesNotMatch(e.prompt,/утвержд[её]н|MODEL-|STYLE-|references\/|камер|ракурс|азимут|градус|°|строго сверху|вправо|влево|входом вниз/);
    assert.ok(e.prompt.length>500,e.id);assert.equal(e.referenceGuide.needsResult,false);
    for(const r of e.referenceGuide.refs){assert.ok((await fs.stat(path.join(kit,'references',r.file))).size>0);if(r.sourceId)assert.equal(r.sourceId,e.id);}
    if(e.assetType==='model'){
      const g=e.geometry;assert.ok(g.triangles.min<=g.triangles.target && g.triangles.target<=g.triangles.max);
      assert.equal(g.quads.min*2,g.triangles.min);assert.equal(g.quads.max*2,g.triangles.max);assert.ok(e.modelBrief.includes(String(g.triangles.target)));
    }else{
      assert.equal(e.geometry,null);assert.match(e.id,/^T\d\d$|^D1[3-8]$/);
      assert.equal(e.promptVersion,7);assert.match(e.prompt,/космического корабля/);
      assert.equal(e.generationSize,e.id.startsWith('D')?512:1024);
      assert.ok(e.prompt.includes(e.generationSize+' × '+e.generationSize));
      assert.deepEqual(e.referenceGuide.refs.map(r=>r.file),['deck-palette.png']);
      assert.ok(e.referenceGuide.refs.every(r=>!r.sourceId),'Old mineral images must not override the new deck palette');
    }
  }
  assert.match(c.entries.find(e=>e.id==='MODEL-bastion-south').prompt,/Южный вражеский бастион/);
  assert.match(c.entries.find(e=>e.id==='MODEL-artillery').prompt,/двух гусеницах/);
});
test('generation ZIP contains the exact standalone prompt, budget and selected image without changing the library',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'signal-kit-test-')),app=await createWorkshop({dataDir:temp});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
  try{
    const state=await(await fetch(base+'/api/state')).json();assert.equal(state.catalogue.count,54);
    const headers={'X-Art-Token':state.token},png=new PNG({width:8,height:8});png.data.fill(160);const bytes=PNG.sync.write(png);
    const image=await(await fetch(base+'/api/upload/MODEL-drone',{method:'POST',headers,body:bytes})).json();
    await fetch(base+'/api/prompt/MODEL-drone',{method:'PUT',headers,body:JSON.stringify({selected:image.asset.id})});
    const before=await fs.readFile(path.join(temp,'library.json'),'utf8');
    const response=await fetch(base+'/api/generation-kit/MODEL-drone');assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/MODEL-drone-generation-kit.zip/);
    const files=await unzip(Buffer.from(await response.arrayBuffer()));
    assert.deepEqual(files['reference-1.png'],bytes);
    assert.equal(files['01-image-prompt.txt'].toString().trim(),state.catalogue.entries.find(e=>e.id==='MODEL-drone').prompt);
    assert.match(files['02-model-budget.txt'].toString(),/3000 треугольников/);assert.match(files['START-HERE.txt'].toString(),/MODEL-drone/);
    assert.ok(files['reference-2.png'].length>0);assert.equal(await fs.readFile(path.join(temp,'library.json'),'utf8'),before);
    const texture=await unzip(Buffer.from(await(await fetch(base+'/api/generation-kit/D13')).arrayBuffer()));assert.equal(texture['02-model-budget.txt'],undefined);assert.match(texture['01-image-prompt.txt'].toString(),/прозрачным фоном/);
    assert.match(texture['01-image-prompt.txt'].toString(),/512 × 512/);
    assert.deepEqual(texture['reference-1.png'],await fs.readFile(path.join(kit,'references/deck-palette.png')));
    assert.equal((await fetch(base+'/api/generation-kit/CARD-drone')).status,404);
  }finally{app.server.closeAllConnections();await new Promise(r=>app.server.close(r));assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep+'signal-kit-test-'));await fs.rm(temp,{recursive:true,force:true});}
});
