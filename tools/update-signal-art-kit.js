'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {apply3DPrompts}=require('./signal-art-3d-prompts');
const {curateCatalogue}=require('./signal-art-catalogue');
const {TEXTURES,textureBrief}=require('./signal-art-textures');
const kit=path.resolve(__dirname,'../game-source/signal-frontier/design/AI_ART_KIT');
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
(async()=>{
  const full=apply3DPrompts(JSON.parse(await fs.readFile(path.join(kit,'prompts.json'),'utf8')));
  for(const entry of full.entries)if(Object.hasOwn(TEXTURES,entry.id))Object.assign(entry,textureBrief(entry.id),{promptVersion:7});
  const c=curateCatalogue(full);
  // Keep legacy IDs as storage metadata; exported tasks contain only current pages.
  await fs.writeFile(path.join(kit,'prompts.json'),JSON.stringify(full,null,2)+'\n');
  await fs.writeFile(path.join(kit,'active-prompts.json'),JSON.stringify(c,null,2)+'\n');
  await fs.writeFile(path.join(kit,'PROMPTS.txt'),c.title+'\n\n'+c.note+'\n\n'+c.entries.map(e=>e.id+' · '+e.title+'\n'+e.prompt).join('\n\n'+'—'.repeat(64)+'\n\n')+'\n');
  await fs.writeFile(path.join(kit,'PROMPTS.html'),'<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Signal Frontier · промпты для 3D</title><style>body{max-width:1000px;margin:40px auto;padding:0 24px;font:16px/1.65 system-ui;background:#f4f6f1;color:#234334}article{margin:28px 0;border-top:1px solid #cbd9c7;padding-top:18px}pre{white-space:pre-wrap;font:inherit}small{color:#607763}summary{cursor:pointer}a{color:#286b4d}</style><h1>Signal Frontier · изображения для 3D</h1><p>'+esc(c.note)+'</p><p>Загрузки изображений и моделей: <a href="http://127.0.0.1:4270/">локальная мастерская</a>.</p>'+c.entries.map(e=>'<article id="'+e.id+'"><small>'+esc(e.category)+' · '+e.id+(e.legacy?' · дополнительный образец':'')+'</small><h2>'+esc(e.title)+'</h2><details><summary>Промпт</summary><pre>'+esc(e.prompt)+'</pre></details></article>').join('')+'</html>');
  console.log('Updated '+c.entries.length+' prompts; image originals and saved prompt snapshots untouched.');
})().catch(e=>{console.error(e);process.exitCode=1;});
