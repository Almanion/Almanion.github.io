'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const http = require('node:http');
const { PNG } = require('pngjs');
const { createWorkshop, MAX_FILE } = require('../tools/signal-art-workshop');
const ReferencePlans = require('../game-source/signal-frontier/design/art-workshop/reference-plan');
const { expandBuildings } = require('../game-source/signal-frontier/design/art-workshop/building-catalogue');
const {apply3DPrompts}=require('../tools/signal-art-3d-prompts');

test('historical building slots retain IDs and now reference one main 3D design', async () => {
  const catalogue = apply3DPrompts(expandBuildings(JSON.parse(await fs.readFile(path.resolve(__dirname,'../game-source/signal-frontier/design/AI_ART_KIT/prompts.json'),'utf8'))));
  const ids = catalogue.entries.map(e=>e.id);
  assert.equal(new Set(ids).size,ids.length);
  for (const kind of ['outpost','barracks','foundry','arsenal','bunker','logistics']) {
    for (const angle of [0,90,180,270]) {
      const frame = catalogue.entries.find(e=>e.id===`BUILD-${kind}-STATE-building-frame-${angle}`);
      assert.ok(frame,kind+' '+angle);
      const plan = ReferencePlans.plan(frame,catalogue);
      assert.equal(plan.refs[0].sourceId,'MODEL-'+kind);
      assert.equal(plan.refs[0].file,kind+'.png');
      assert.equal(frame.directionDegrees,angle);
    }
  }
  for (const old of catalogue.entries.filter(e=>e.legacyShared)) assert.ok(catalogue.entries.some(e=>e.templateId===old.id),old.id);
  for(const entry of catalogue.entries) assert.doesNotMatch(entry.prompt,/камер|ракурс|азимут|изометри|перспектив|градус|°|проекци|входом вниз/i,entry.id);
  const snapshot=JSON.stringify(catalogue);apply3DPrompts(catalogue);assert.equal(JSON.stringify(catalogue),snapshot,'Prompt conversion is idempotent');
  const count=ids.length;expandBuildings(catalogue);assert.equal(catalogue.entries.length,count);
});

test('every prompt has usable reference files or explicitly asks for an existing result', async () => {
  const kit = path.resolve(__dirname,'../game-source/signal-frontier/design/AI_ART_KIT');
  const catalogue = JSON.parse(await fs.readFile(path.join(kit,'prompts.json'),'utf8'));
  const ids = new Set(catalogue.entries.map(e=>e.id));
  for (const entry of catalogue.entries) {
    const plan = ReferencePlans.plan(entry,catalogue);
    assert.ok(plan.explanation,entry.id);
    assert.ok(plan.needsResult || plan.refs.some(r=>r.file),'Missing actionable reference: '+entry.id);
    for (const ref of plan.refs) {
      if (ref.file) assert.ok((await fs.stat(path.join(kit,'references',ref.file))).isFile(),entry.id+' '+ref.file);
      if (ref.sourceId) assert.ok(ids.has(ref.sourceId),'Missing source '+ref.sourceId);
    }
    if(plan.needsResult)assert.ok(plan.options.length,'No preceding task for '+entry.id);
    for(const option of plan.options)assert.ok(ids.has(option.id));
  }
  const generic=catalogue.entries.find(e=>e.id==='STATE-building-frame');
  assert.equal(ReferencePlans.plan(generic,catalogue,'MODEL-bunker').refs[0].file,'bunker.png');
  const material=catalogue.entries.find(e=>e.id==='T01');
  assert.equal(ReferencePlans.plan(material,catalogue).optional,true);
  const output=catalogue.entries.find(e=>e.id==='PREP-seam');
  assert.equal(ReferencePlans.plan(output,catalogue,'T01').refs[0].sourceId,'T01');
});

test('local art library keeps originals, assignments and selections across restart', async t => {
  const tmpRoot = path.resolve(os.tmpdir()), temp = await fs.mkdtemp(path.join(tmpRoot, 'signal-art-test-'));
  const dataDir = path.join(temp,'library'), kitDir = path.join(temp,'kit');
  await fs.mkdir(kitDir);
  await fs.writeFile(path.join(kitDir,'prompts.json'), JSON.stringify({ entries:[{id:'MODEL-hero',title:'Герой',prompt:'Промпт героя'},{id:'T01',title:'Грунт',prompt:'Промпт грунта'},{id:'BUILD-test-ready-90',title:'Отдельное направление',prompt:'Промпт направления'}],modelIndex:[] }));
  let app, base, token;
  async function start() {
    app = await createWorkshop({dataDir,kitDir});
    await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
    base='http://127.0.0.1:'+app.server.address().port;
    token=(await (await fetch(base+'/api/state')).json()).token;
  }
  const request = async (url,method='GET',body,headers={}) => {
    const res = await fetch(base+url,{method,headers:{'X-Art-Token':token,...headers},body});
    return {status:res.status,data:await res.json()};
  };
  const post = (url,body,method='PUT') => request(url,method,JSON.stringify(body),{'Content-Type':'application/json'});
  const png = new PNG({width:7,height:5});png.data.fill(180);const bytes=PNG.sync.write(png);
  const digest=crypto.createHash('sha256').update(bytes).digest('hex');
  let hero, ground;
  try {
    await start();
    await t.test('upload is durable and filename cannot choose storage path',async()=>{
      const result=await request('/api/upload/MODEL-hero','POST',Buffer.concat([bytes,bytes]),{'X-Preview-Bytes':String(bytes.length),'X-File-Name':encodeURIComponent('../Рисунок <1>.svg')});
      assert.equal(result.status,201);hero=result.data.asset;
      assert.equal(hero.ext,'png');assert.equal(hero.width,7);assert.equal(hero.height,5);assert.equal(hero.sha256,digest);
      assert.deepEqual(await fs.readFile(path.join(dataDir,hero.file)),bytes);
      assert.ok(hero.file.startsWith('files/MODEL-hero/'));assert.ok(!hero.file.includes('..'));
      assert.equal((await fs.readFile(path.join(dataDir,hero.promptFile),'utf8')).trim(),'Промпт героя');
      const duplicate=await request('/api/upload/MODEL-hero','POST',bytes);
      assert.equal(duplicate.data.duplicate,true);assert.equal(duplicate.data.asset.id,hero.id);
      assert.equal(duplicate.data.library.items['MODEL-hero'].assets.length,1);
      ground=(await request('/api/upload/T01','POST',bytes)).data.asset;
      assert.notEqual(ground.id,hero.id);
    });
    await t.test('selection belongs to its prompt and concurrent note/selection do not lose fields',async()=>{
      assert.equal((await post('/api/prompt/MODEL-hero',{selected:ground.id})).status,400);
      const results=await Promise.all([post('/api/prompt/MODEL-hero',{selected:hero.id}),post('/api/prompt/MODEL-hero',{note:'Оставить эту версию'})]);
      assert.ok(results.every(r=>r.status===200));
      const state=(await request('/api/library')).data.library;
      assert.equal(state.items['MODEL-hero'].selected,hero.id);assert.equal(state.items['MODEL-hero'].note,'Оставить эту версию');
      const selected=(await request('/api/selected')).data;
      assert.equal(selected.assets.length,1);assert.equal(selected.assets[0].absolutePath,path.join(dataDir,hero.file));
      assert.equal(selected.revision,state.revision);
    });
    await t.test('archive is reversible and never deletes the original',async()=>{
      const result=await post('/api/asset/'+hero.id,{archived:true},'PATCH');
      assert.equal(result.data.library.items['MODEL-hero'].selected,null);
      assert.deepEqual(await fs.readFile(path.join(dataDir,hero.file)),bytes);
      await post('/api/asset/'+hero.id,{archived:false},'PATCH');
      await post('/api/prompt/MODEL-hero',{selected:hero.id});
    });
    await t.test('bad images, unknown prompts and cross-site writes are rejected',async()=>{
      assert.equal((await request('/api/upload/MODEL-hero','POST',Buffer.from('<svg onload="alert(1)"></svg>'),{'Content-Type':'image/png'})).status,415);
      assert.equal((await request('/api/upload/MODEL-hero','POST',bytes.subarray(0,bytes.length-8))).status,415);
      assert.equal((await request('/api/upload/unknown','POST',bytes)).status,404);
      assert.equal((await request('/api/prompt/MODEL-hero','PUT','{}',{'X-Art-Token':''})).status,403);
      assert.equal((await request('/api/prompt/MODEL-hero','PUT','{}',{'Origin':'https://example.invalid'})).status,403);
      const badHost = await new Promise((resolve,reject)=>{
        const req=http.get(base+'/api/library',{headers:{Host:'example.invalid'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);
      });
      assert.equal(badHost,403);
      assert.equal((await request('/references/%2e%2e%2flibrary.json')).status,404);
      assert.equal((await request('/files/%2e%2e%2flibrary.json')).status,404);
      const status=await new Promise((resolve,reject)=>{
        const req=http.request(base+'/api/upload/MODEL-hero',{method:'POST',headers:{'X-Art-Token':token,'Content-Length':MAX_FILE+512*1024+1}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();
      });
      assert.equal(status,413);
    });
    await t.test('restart restores files, selected index and notes',async()=>{
      await app.idle();await new Promise(r=>app.server.close(r));
      await start();
      const state=(await request('/api/library')).data.library;
      assert.equal(state.items['MODEL-hero'].selected,hero.id);assert.equal(state.items['MODEL-hero'].note,'Оставить эту версию');
      assert.deepEqual(Buffer.from(await (await fetch(base+'/files/'+hero.id)).arrayBuffer()),bytes);
      const selected=JSON.parse(await fs.readFile(path.join(dataDir,'selected.json'),'utf8'));
      assert.equal(selected.assets[0].sha256,digest);assert.equal(selected.revision,state.revision);
    });
    await t.test('copying old uploads preserves originals, isolates selections and survives restart',async()=>{
      const copy=()=>post('/api/copy-asset',{asset:hero.id,target:'BUILD-test-ready-90'},'POST');
      const result=await copy();assert.equal(result.status,200);
      const entry=result.data.library.items['BUILD-test-ready-90'],asset=entry.assets[0];
      assert.notEqual(asset.id,hero.id);assert.equal(asset.sha256,digest);
      assert.equal(entry.selected,null);
      assert.equal(result.data.library.items['MODEL-hero'].selected,hero.id);
      assert.equal((await copy()).data.library.items['BUILD-test-ready-90'].assets.length,1);
      await post('/api/prompt/BUILD-test-ready-90',{selected:asset.id});
      await post('/api/asset/'+asset.id,{archived:true},'PATCH');
      assert.equal((await request('/api/library')).data.library.items['MODEL-hero'].selected,hero.id);
      await post('/api/asset/'+asset.id,{archived:false},'PATCH');
      await post('/api/prompt/BUILD-test-ready-90',{selected:asset.id});
      await app.idle();await new Promise(r=>app.server.close(r));await start();
      assert.equal((await request('/api/library')).data.library.items['BUILD-test-ready-90'].selected,asset.id);
      assert.deepEqual(Buffer.from(await (await fetch(base+'/files/'+asset.id)).arrayBuffer()),bytes);
      assert.equal((await post('/api/copy-asset',{asset:hero.id,target:'unknown'},'POST')).status,404);
    });
    await t.test('a damaged manifest is not silently replaced with an empty library',async()=>{
      await app.idle();await new Promise(r=>app.server.close(r));
      const file=path.join(dataDir,'library.json');await fs.writeFile(file,'{damaged');
      await assert.rejects(createWorkshop({dataDir,kitDir}),/Не удалось прочитать библиотеку/);
      assert.equal(await fs.readFile(file,'utf8'),'{damaged');
      assert.deepEqual(await fs.readFile(path.join(dataDir,hero.file)),bytes);
    });
  } finally {
    if(app?.server.listening){await app.idle();await new Promise(r=>app.server.close(r));}
    const resolved=path.resolve(temp);
    if(resolved.startsWith(tmpRoot+path.sep)&&path.basename(resolved).startsWith('signal-art-test-'))await fs.rm(resolved,{recursive:true,force:true});
  }
});
