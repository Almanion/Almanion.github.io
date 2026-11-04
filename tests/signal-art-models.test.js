'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {PNG}=require('pngjs');
const {createWorkshop}=require('../tools/signal-art-workshop');
const {modelInfo}=require('../tools/signal-art-models');
function glb(external=false){
  const doc={asset:{version:'2.0'},buffers:[{byteLength:36}],bufferViews:[{buffer:0,byteLength:36}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0};
  if(external)doc.images=[{uri:'http://example.invalid/image.png'}];
  let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
  const data=Buffer.alloc(36);data.writeFloatLE(1,12);data.writeFloatLE(1,28);
  const result=Buffer.alloc(28+json.length+data.length);
  result.write('glTF');result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);result.writeUInt32LE(json.length,12);result.writeUInt32LE(0x4e4f534a,16);json.copy(result,20);result.writeUInt32LE(data.length,20+json.length);result.writeUInt32LE(0x004e4942,24+json.length);data.copy(result,28+json.length);return result;
}
test('model inspection accepts standalone geometry and rejects renamed or externally linked files',()=>{
  assert.equal(modelInfo(glb(),'asset.glb').triangles,1);
  assert.throws(()=>modelInfo(glb(true),'asset.glb'),/внешние/);
  assert.throws(()=>modelInfo(glb().subarray(0,60),'asset.glb'),/GLB/);
  assert.throws(()=>modelInfo(Buffer.alloc(64),'asset.blend'),/Blender/);
  assert.throws(()=>modelInfo(glb(),'asset.fbx'),/GLB/);
});
test('models remain bound to their exact source images and survive restart without changing originals',async t=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'signal-model-test-')),dataDir=path.join(temp,'library'),kitDir=path.join(temp,'kit');
  await fs.mkdir(kitDir);await fs.writeFile(path.join(kitDir,'prompts.json'),JSON.stringify({modelIndex:[],entries:[{id:'MODEL-test',title:'Model',prompt:'Test'},{id:'MODEL-other',title:'Other',prompt:'Other'}]}));
  let app,base,token;
  async function start(){app=await createWorkshop({dataDir,kitDir});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;token=(await(await fetch(base+'/api/session')).json()).token;}
  async function req(url,method='GET',body,headers={}){const r=await fetch(base+url,{method,headers:{'X-Art-Token':token,...headers},body:Buffer.isBuffer(body)?body:body?JSON.stringify(body):undefined});return {status:r.status,...await r.json()};}
  const makeImage=shade=>{const p=new PNG({width:4,height:4});p.data.fill(shade);return PNG.sync.write(p);};
  const upload=(image,bytes=glb(),name='test.glb',target='MODEL-test')=>req('/api/upload-model/'+target+'/'+image,'POST',bytes,{'X-File-Name':encodeURIComponent(name)});
  async function stop(){app.server.closeAllConnections();await new Promise(r=>app.server.close(r));await app.idle();}
  try{
    await start();
    const first=(await req('/api/upload/MODEL-test','POST',makeImage(120))).asset;
    const second=(await req('/api/upload/MODEL-test','POST',makeImage(150))).asset;
    assert.equal((await upload(first.id,glb(),'bad.glb','MODEL-other')).status,400);
    const loaded=await upload(first.id);assert.equal(loaded.status,201);const model=loaded.asset;
    const duplicate=await upload(first.id);assert.equal(duplicate.asset.id,model.id);assert.equal(duplicate.duplicate,true);
    const secondModel=(await upload(second.id)).asset;assert.notEqual(secondModel.id,model.id);
    const blend=Buffer.concat([Buffer.from('BLENDER-v404'),Buffer.alloc(100)]);
    const source=(await upload(first.id,blend,'original.blend')).asset;
    await req('/api/prompt/MODEL-test','PUT',{selected:first.id});
    await Promise.all([req('/api/model/'+model.id,'PATCH',{selected:true}),req('/api/model/'+source.id,'PATCH',{selected:true})]);
    assert.equal((await req('/api/selected')).models.length,2);
    await req('/api/prompt/MODEL-test','PUT',{selected:second.id});assert.equal((await req('/api/selected')).models.length,0);
    const current=(await req('/api/library')).library.items['MODEL-test'];
    assert.equal(current.assets[0].selectedModel,model.id);assert.equal(current.models.find(a=>a.id===model.id).sourceImageId,first.id);
    await req('/api/prompt/MODEL-test','PUT',{selected:first.id});
    await stop();await start();
    const index=await req('/api/selected');assert.equal(index.models.length,2);assert.equal(index.models[0].sourceImageId,first.id);
    assert.deepEqual(await fs.readFile(path.join(dataDir,model.file)),glb());assert.deepEqual(await fs.readFile(path.join(dataDir,source.file)),blend);
    const download=await fetch(base+'/models/'+model.id+'?download=1');assert.match(download.headers.get('content-disposition'),/attachment/);assert.deepEqual(Buffer.from(await download.arrayBuffer()),glb());
    await req('/api/asset/'+first.id,'PATCH',{archived:true});assert.equal((await req('/api/selected')).models.length,0);
    assert.equal((await upload(first.id)).status,400);
    await req('/api/asset/'+first.id,'PATCH',{archived:false});await req('/api/prompt/MODEL-test','PUT',{selected:first.id});
    await req('/api/model/'+model.id,'PATCH',{archived:true});assert.equal((await req('/api/selected')).models.length,1);
    assert.equal((await req('/api/model/'+model.id,'PATCH',{selected:true})).status,400);
    const restored=await upload(first.id);assert.equal(restored.duplicate,true);assert.equal(restored.asset.archived,false);
    assert.equal((await req('/api/selected')).models.length,1,'Restoring never silently selects a model');
    assert.equal((await req('/api/model/'+model.id,'PATCH',{sourceImageId:second.id})).status,400);
    assert.equal((await req('/api/model/'+model.id,'PATCH',{selected:true},{'X-Art-Token':'wrong'})).status,403);
  }finally{if(app?.server.listening)await stop();const safe=path.resolve(temp);assert.ok(safe.startsWith(path.resolve(os.tmpdir())+path.sep+'signal-model-test-'));await fs.rm(safe,{recursive:true,force:true});}
});
module.exports={glb};
