#!/usr/bin/env node
'use strict';

// Local authoring service. Uploaded originals never enter the public game build.
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const ReferencePlans = require('../game-source/signal-frontier/design/art-workshop/reference-plan');
const { expandBuildings } = require('../game-source/signal-frontier/design/art-workshop/building-catalogue');
const { apply3DPrompts } = require('./signal-art-3d-prompts');
const { curateCatalogue } = require('./signal-art-catalogue');
const { modelInfo, MAX_MODEL } = require('./signal-art-models');
const ROOT = path.resolve(__dirname, '..');
const KIT = path.join(ROOT, 'game-source/signal-frontier/design/AI_ART_KIT');
const UI = path.join(ROOT, 'game-source/signal-frontier/design/art-workshop');
const DEFAULT_DATA = path.join(os.homedir(), 'Documents/ChatGPT/Signal-Frontier-Art-Library');
const MAX_FILE = 32 * 1024 * 1024, MAX_PREVIEW = 512 * 1024, MAX_PIXELS = 40_000_000;
const APP_ID = 'signal-frontier-art-workshop-v1';
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });
const clone = value => JSON.parse(JSON.stringify(value));
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function imageInfo(b) {
  let width, height, ext, mime;
  const bad = () => { throw fail(415, 'Нужен исправный PNG, JPEG или WebP. Анимации и SVG не поддерживаются.'); };
  if (b.length >= 33 && b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    let at = 8, ended = false, data = false;
    while (at + 12 <= b.length) {
      const length = b.readUInt32BE(at), end = at + 12 + length;
      if (end > b.length) bad();
      const type = b.toString('ascii', at + 4, at + 8);
      if (crc(b.subarray(at + 4, end - 4)) !== b.readUInt32BE(end - 4)) bad();
      if (at === 8) {
        if (type !== 'IHDR' || length !== 13) bad();
        width = b.readUInt32BE(at + 8); height = b.readUInt32BE(at + 12);
      } else if (type === 'IHDR') bad();
      if (type === 'acTL') bad();
      if (type === 'IDAT') data = true;
      at = end;
      if (type === 'IEND') { if (length || at !== b.length) bad(); ended = true; break; }
    }
    if (!ended || !data) bad();
    ext = 'png'; mime = 'image/png';
  } else if (b.length >= 20 && b[0] === 255 && b[1] === 216) {
    let at = 2, scan = false;
    while (at < b.length - 2) {
      if (b[at++] !== 255) bad();
      while (b[at] === 255) at++;
      const marker = b[at++];
      if (marker === 0xd9) break;
      if (at + 2 > b.length) bad();
      const length = b.readUInt16BE(at);
      if (length < 2 || at + length > b.length) bad();
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        if (length < 8) bad(); height = b.readUInt16BE(at + 3); width = b.readUInt16BE(at + 5);
      }
      if (marker === 0xda) { scan = true; break; }
      at += length;
    }
    if (!scan || b[b.length - 2] !== 255 || b[b.length - 1] !== 217) bad();
    ext = 'jpg'; mime = 'image/jpeg';
  } else if (b.length >= 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    if (b.readUInt32LE(4) + 8 !== b.length) bad();
    let at = 12, pixels = false;
    while (at + 8 <= b.length) {
      const type = b.toString('ascii', at, at + 4), length = b.readUInt32LE(at + 4), start = at + 8;
      if (start + length > b.length) bad();
      if (type === 'ANIM' || type === 'ANMF') bad();
      if (type === 'VP8X') {
        if (length !== 10 || (b[start] & 2)) bad();
        width = b.readUIntLE(start + 4, 3) + 1; height = b.readUIntLE(start + 7, 3) + 1;
      } else if (type === 'VP8 ') {
        if (length < 10 || !b.subarray(start + 3, start + 6).equals(Buffer.from([0x9d,1,0x2a]))) bad();
        width ||= b.readUInt16LE(start + 6) & 0x3fff; height ||= b.readUInt16LE(start + 8) & 0x3fff; pixels = true;
      } else if (type === 'VP8L') {
        if (length < 5 || b[start] !== 0x2f) bad();
        const bits = b.readUInt32LE(start + 1);
        width ||= (bits & 0x3fff) + 1; height ||= ((bits >>> 14) & 0x3fff) + 1; pixels = true;
      }
      at = start + length + (length % 2);
    }
    if (!pixels || at !== b.length) bad();
    ext = 'webp'; mime = 'image/webp';
  } else bad();
  if (!width || !height || width > 16384 || height > 16384 || width * height > MAX_PIXELS)
    throw fail(413, 'Изображение слишком большое: максимум 40 мегапикселей и 16 384 px по стороне.');
  return { width, height, ext, mime };
}
async function atomicJSON(file, data) {
  const tmp = file + '.' + crypto.randomUUID() + '.tmp';
  const handle = await fsp.open(tmp, 'wx');
  try { await handle.writeFile(JSON.stringify(data, null, 2) + '\n', 'utf8'); await handle.sync(); }
  finally { await handle.close(); }
  try { await fsp.rename(tmp, file); }
  catch (e) { await fsp.unlink(tmp).catch(() => {}); throw e; }
}
// A tiny ZIP writer for already-compressed local references; no shell or temp files.
function zipFiles(files) {
  const local=[],central=[];let offset=0;
  for(const file of files){
    const name=Buffer.from(file.name,'utf8'),bytes=file.bytes,sum=crc(bytes),header=Buffer.alloc(30),directory=Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x0800,6);header.writeUInt16LE(33,12);
    header.writeUInt32LE(sum,14);header.writeUInt32LE(bytes.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(name.length,26);
    directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x0800,8);directory.writeUInt16LE(33,14);
    directory.writeUInt32LE(sum,16);directory.writeUInt32LE(bytes.length,20);directory.writeUInt32LE(bytes.length,24);directory.writeUInt16LE(name.length,28);directory.writeUInt32LE(offset,42);
    local.push(header,name,bytes);central.push(directory,name);offset+=header.length+name.length+bytes.length;
  }
  const index=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(index.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,index,end]);
}
async function readBody(req, limit) {
  if (Number(req.headers['content-length']) > limit) throw fail(413, 'Файл превышает допустимый размер загрузки.');
  const parts = []; let size = 0;
  for await (const part of req) {
    size += part.length;
    if (size > limit) throw fail(413, 'Превышен допустимый размер загрузки.');
    parts.push(part);
  }
  return Buffer.concat(parts, size);
}
async function jsonBody(req) {
  try { return JSON.parse((await readBody(req, 16000)).toString('utf8')); }
  catch (e) { if (e.status) throw e; throw fail(400, 'Не удалось прочитать запрос. Обновите страницу.'); }
}
async function createWorkshop({ dataDir = DEFAULT_DATA, kitDir = KIT, uiDir = UI } = {}) {
  dataDir = path.resolve(dataDir);
  const fullCatalogue = apply3DPrompts(expandBuildings(JSON.parse(await fsp.readFile(path.join(kitDir, 'prompts.json'), 'utf8'))));
  const catalogue = curateCatalogue(fullCatalogue);
  const prompts = new Map([...fullCatalogue.entries,...catalogue.entries].map(p => [p.id, p]));
  const references = new Set(catalogue.modelIndex.map(m => m.kind + '.png').concat('overview.png', ReferencePlans.extraFiles));
  await fsp.mkdir(dataDir, { recursive: true });
  const stateFile = path.join(dataDir, 'library.json');
  let state;
  try { state = JSON.parse(await fsp.readFile(stateFile, 'utf8')); }
  catch (e) {
    if (e.code !== 'ENOENT') throw new Error('Не удалось прочитать библиотеку. Исходные файлы сохранены: ' + stateFile);
    state = { schema: APP_ID, revision: 0, updatedAt: null, items: {} };
    await atomicJSON(stateFile, state);
  }
  if (state.schema !== APP_ID || !state.items || !Number.isSafeInteger(state.revision)) throw new Error('Неизвестный формат библиотеки: ' + stateFile);
  const token = crypto.randomBytes(24).toString('hex');
  let queue = Promise.resolve();
  const serial = fn => { const job = queue.then(fn); queue = job.catch(() => {}); return job; };
  const prompt = id => { const p = prompts.get(id); if (!p) throw fail(404, 'Такого промпта нет в каталоге.'); return p; };
  const item = (s, id) => s.items[id] ||= { selected: null, note: '', assets: [] };
  const locate = (s, id) => {
    for (const [promptId, entry] of Object.entries(s.items)) {
      const asset = entry.assets.find(a => a.id === id);
      if (asset) return { promptId, entry, asset };
    }
    throw fail(404, 'Изображение не найдено.');
  };
  const locateModel = (s, id) => {
    for (const [promptId, entry] of Object.entries(s.items)) {
      const asset = (entry.models || []).find(a => a.id === id);
      if (asset) return {promptId,entry,asset};
    }
    throw fail(404, '3D-файл не найден.');
  };
  const selectedIndex = s => ({ schema: 'signal-frontier-selected-art-v1', revision: s.revision, updatedAt: s.updatedAt,
    note: 'Выбрано пользователем для дальнейшей работы. Это не отметка внедрения в игру. library.json — основной источник данных.',
    assets: Object.entries(s.items).flatMap(([promptId, entry]) => {
      const asset = entry.assets.find(a => a.id === entry.selected && !a.archived);
      const spec = prompts.get(promptId);
      return asset ? [{ promptId, title: spec?.title || promptId, buildingKind:spec?.buildingKind || null,
        stateId:spec?.stateId || null, directionDegrees:spec?.directionDegrees ?? null, note: entry.note, ...asset,
        absolutePath: path.join(dataDir, asset.file), promptPath: path.join(dataDir, asset.promptFile) }] : [];
    }),
    models: Object.entries(s.items).flatMap(([promptId, entry]) => {
      const image = entry.assets.find(a=>a.id===entry.selected && !a.archived);
      if (!image) return [];
      return (entry.models || []).filter(a=>!a.archived && a.sourceImageId===image.id && image[a.role==='source'?'selectedSource':'selectedModel']===a.id)
        .map(a=>({...a,promptId,title:prompts.get(promptId)?.title || promptId,absolutePath:path.join(dataDir,a.file),sourceImagePath:path.join(dataDir,image.file)}));
    }) });
  async function commit(next) {
    next.revision = state.revision + 1; next.updatedAt = new Date().toISOString();
    // The recoverable previous manifest and immutable originals survive failed saves.
    await atomicJSON(stateFile + '.backup', state);
    await atomicJSON(stateFile, next); state = next;
    await atomicJSON(path.join(dataDir, 'selected.json'), selectedIndex(state)).catch(e => console.error('Index refresh:', e.message));
  }
  await atomicJSON(path.join(dataDir, 'selected.json'), selectedIndex(state));
  const send = (res, status, value) => {
    const body = Buffer.from(JSON.stringify(value));
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length }); res.end(body);
  };
  const stream = async (res, req, file, mime, filename) => {
    const stat = await fsp.stat(file).catch(() => null);
    if (!stat?.isFile()) throw fail(404, 'Файл не найден на диске.');
    const headers = { 'Content-Type': mime, 'Content-Length': stat.size };
    if (filename) headers['Content-Disposition'] = "attachment; filename=\"image\"; filename*=UTF-8''" + encodeURIComponent(filename);
    res.writeHead(200, headers);
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const port = server.address()?.port;
      if (![ '127.0.0.1:' + port, 'localhost:' + port ].includes(req.headers.host)) throw fail(403, 'Доступ разрешён только локально.');
      const url = new URL(req.url, 'http://' + req.headers.host), p = decodeURIComponent(url.pathname);
      if (req.headers['sec-fetch-site'] === 'cross-site') throw fail(403, 'Откройте локальную мастерскую напрямую.');
      if (!['GET','HEAD'].includes(req.method)) {
        if (req.headers.origin && req.headers.origin !== url.origin) throw fail(403, 'Недопустимый источник запроса.');
        if (req.headers['x-art-token'] !== token) throw fail(403, 'Обновите страницу мастерской перед сохранением.');
      }
      if (req.method === 'GET' && p === '/api/health') return send(res, 200, { app: APP_ID, workspace: ROOT, dataDir });
      if (req.method === 'GET' && p === '/api/session') return send(res, 200, { token });
      if (req.method === 'GET' && p === '/api/state') return send(res, 200, { catalogue, library: state, token, dataDir, maxFileBytes: MAX_FILE, maxModelBytes:MAX_MODEL });
      if (req.method === 'GET' && p === '/api/library') return send(res, 200, { library: state });
      if (req.method === 'GET' && p === '/api/selected') return send(res, 200, selectedIndex(state));
      let match;
      if (req.method === 'GET' && (match=p.match(/^\/api\/generation-kit\/([a-zA-Z0-9-]+)$/))) {
        const spec=catalogue.entries.find(e=>e.id===match[1]);
        if(!spec)throw fail(404,'Объект не найден в текущем каталоге.');
        const files=[{name:'01-image-prompt.txt',bytes:Buffer.from(spec.prompt+'\n','utf8')}],seen=new Set();
        const referencesText=[];
        for(const ref of spec.referenceGuide?.refs || []) {
          const entry=state.items[ref.sourceId],selected=entry?.assets.find(a=>a.id===entry.selected && !a.archived);
          const file=selected?path.join(dataDir,selected.file):ref.file&&references.has(ref.file)?path.join(kitDir,'references',ref.file):null;
          if(!file||seen.has(file))continue;seen.add(file);
          const name='reference-'+seen.size+'.'+(selected?.ext || 'png');
          files.push({name,bytes:await fsp.readFile(file)});
          referencesText.push(name+' — '+(selected?'Выбранный дизайн «'+spec.title+'»':ref.label)+'. '+ref.role+'.');
        }
        if(spec.modelBrief)files.push({name:'02-model-budget.txt',bytes:Buffer.from(spec.modelBrief+'\n','utf8')});
        files.push({name:'START-HERE.txt',bytes:Buffer.from(spec.title+'\n\n1. Скопируйте 01-image-prompt.txt в генератор изображений. Промпт самостоятельный.\n2. При желании приложите образцы из этого комплекта; менять страницу или искать другой промпт не нужно.\n'+referencesText.join('\n')+'\n3. Загрузите результат в карточку '+spec.id+' и выберите основой.\n'+(spec.assetType==='model'?'4. Используйте выбранный рисунок в генераторе 3D. Ориентир геометрии находится в 02-model-budget.txt. Загрузите GLB и при наличии BLEND в ту же карточку.\n':'4. Для этой текстуры 3D-файл не нужен.\n'),'utf8')});
        const zip=zipFiles(files);
        res.writeHead(200,{'Content-Type':'application/zip','Content-Length':zip.length,'Content-Disposition':'attachment; filename="'+spec.id+'-generation-kit.zip"'});return res.end(zip);
      }
      if (req.method === 'POST' && (match = p.match(/^\/api\/upload-model\/([a-zA-Z0-9-]+)\/([a-f0-9-]{36})$/))) {
        const promptId=match[1], sourceImageId=match[2]; prompt(promptId);
        const source=locate(state,sourceImageId);
        if (source.promptId!==promptId || source.asset.archived) throw fail(400,'Выберите доступное изображение этого объекта.');
        let filename;
        try { filename=decodeURIComponent(String(req.headers['x-file-name'] || '')); } catch { throw fail(400,'Некорректное имя файла.'); }
        filename=filename.replace(/[\x00-\x1f\x7f\\/]/g,'_').slice(0,240);
        const bytes=await readBody(req,MAX_MODEL), info=modelInfo(bytes,filename), digest=hash(bytes);
        return await serial(async()=>{
          const next=clone(state), found=locate(next,sourceImageId), record=item(next,promptId);
          // Selection may change during a large upload; association never follows it.
          if (found.asset.archived) throw fail(409,'Исходное изображение перемещено в архив. Верните его и повторите загрузку.');
          record.models ||= [];
          const duplicate=record.models.find(a=>a.sourceImageId===sourceImageId && a.sha256===digest && a.ext===info.ext);
          if (duplicate) {
            if (duplicate.archived) { duplicate.archived=false; await commit(next); }
            return send(res,200,{asset:duplicate,duplicate:true,library:state});
          }
          const id=crypto.randomUUID(), folder='models/'+promptId, file=folder+'/'+id+'.'+info.ext;
          await fsp.mkdir(path.join(dataDir,folder),{recursive:true});
          const handle=await fsp.open(path.join(dataDir,file),'wx');
          try {await handle.writeFile(bytes);await handle.sync();} finally {await handle.close();}
          const asset={id,filename,file,sourceImageId,sourceImageHash:found.asset.sha256,...info,bytes:bytes.length,sha256:digest,createdAt:new Date().toISOString(),archived:false};
          record.models.push(asset);await commit(next);
          send(res,201,{asset,duplicate:false,library:state});
        });
      }
      if (req.method === 'PATCH' && (match=p.match(/^\/api\/model\/([a-f0-9-]{36})$/))) {
        const body=await jsonBody(req);
        if (!body || !['archived','selected'].some(k=>typeof body[k]==='boolean') || Object.keys(body).some(k=>!['archived','selected'].includes(k) || typeof body[k]!=='boolean')) throw fail(400,'Укажите выбор или состояние 3D-файла.');
        return await serial(async()=>{
          const next=clone(state), found=locateModel(next,match[1]), image=found.entry.assets.find(a=>a.id===found.asset.sourceImageId);
          const key=found.asset.role==='source'?'selectedSource':'selectedModel';
          if ('archived' in body) {found.asset.archived=body.archived;if (body.archived && image?.[key]===found.asset.id) image[key]=null;}
          if ('selected' in body) {
            if (!image || image.archived || found.asset.archived) throw fail(400,'Сначала верните изображение и модель из архива.');
            if (body.selected) image[key]=found.asset.id;
            else if (image[key]===found.asset.id) image[key]=null;
          }
          await commit(next);send(res,200,{library:state});
        });
      }
      if (['GET','HEAD'].includes(req.method) && (match=p.match(/^\/models\/([a-f0-9-]{36})$/))) {
        const {asset}=locateModel(state,match[1]);
        return await stream(res,req,path.join(dataDir,asset.file),asset.mime,asset.ext==='blend' || url.searchParams.has('download') ? asset.filename : null);
      }
      if (req.method === 'POST' && p === '/api/copy-asset') {
        const body = await jsonBody(req);
        prompt(body.target);
        return await serial(async () => {
          const next = clone(state), found = locate(next, body.asset), target = item(next, body.target);
          if (found.asset.archived) throw fail(400, 'Сначала верните изображение из архива.');
          const existing = target.assets.find(a => a.sha256 === found.asset.sha256 && !a.archived);
          if (!existing) target.assets.push({...found.asset, id:crypto.randomUUID(), copiedFrom:body.asset, selectedModel:null, selectedSource:null});
          await commit(next);
          send(res, 200, { library:state });
        });
      }
      if (req.method === 'POST' && (match = p.match(/^\/api\/upload\/([a-zA-Z0-9-]+)$/))) {
        const promptId = match[1], spec = prompt(promptId);
        const body = await readBody(req, MAX_FILE + MAX_PREVIEW);
        const previewBytes = Number(req.headers['x-preview-bytes'] || 0);
        if (!Number.isSafeInteger(previewBytes) || previewBytes < 0 || previewBytes > MAX_PREVIEW || previewBytes >= body.length) throw fail(400, 'Некорректное превью.');
        const original = body.subarray(0, body.length - previewBytes), preview = previewBytes ? body.subarray(body.length - previewBytes) : null;
        if (!original.length || original.length > MAX_FILE) throw fail(413, 'Максимум 32 МиБ на изображение.');
        const info = imageInfo(original), previewInfo = preview && imageInfo(preview);
        if (previewInfo && (previewInfo.width > 640 || previewInfo.height > 640)) throw fail(400, 'Превью слишком большое.');
        let filename;
        try { filename = decodeURIComponent(String(req.headers['x-file-name'] || 'image.' + info.ext)); } catch { throw fail(400, 'Не удалось прочитать имя файла.'); }
        filename = filename.replace(/[\x00-\x1f\x7f\\/]/g, '_').slice(0, 240) || 'image.' + info.ext;
        const digest = hash(original);
        return await serial(async () => {
          const next = clone(state), record = item(next, promptId);
          const duplicate = record.assets.find(a => a.sha256 === digest);
          if (duplicate) {
            if (duplicate.archived) { duplicate.archived = false; await commit(next); }
            return send(res, 200, { asset: duplicate, duplicate: true, library: state });
          }
          const id = crypto.randomUUID(), folder = 'files/' + promptId;
          const file = folder + '/' + id + '.' + info.ext, promptFile = folder + '/' + id + '.prompt.txt';
          const previewFile = preview ? 'previews/' + id + '.' + previewInfo.ext : null;
          await fsp.mkdir(path.join(dataDir, folder), { recursive: true });
          const handle = await fsp.open(path.join(dataDir, file), 'wx');
          try { await handle.writeFile(original); await handle.sync(); } finally { await handle.close(); }
          await fsp.writeFile(path.join(dataDir, promptFile), spec.prompt + '\n', { encoding: 'utf8', flag: 'wx' });
          if (preview) { await fsp.mkdir(path.join(dataDir, 'previews'), { recursive: true }); await fsp.writeFile(path.join(dataDir, previewFile), preview, { flag: 'wx' }); }
          const asset = { id, filename, file, promptFile, preview: previewFile, previewMime: previewInfo?.mime || null,
            ...info, bytes: original.length, sha256: digest, promptHash: hash(spec.prompt), createdAt: new Date().toISOString(), archived: false };
          record.assets.push(asset); await commit(next);
          send(res, 201, { asset, duplicate: false, library: state });
        });
      }
      if (req.method === 'PUT' && (match = p.match(/^\/api\/prompt\/([a-zA-Z0-9-]+)$/))) {
        const id = match[1]; prompt(id); const body = await jsonBody(req);
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail(400, 'Некорректные данные.');
        if ('note' in body && (typeof body.note !== 'string' || body.note.length > 8000)) throw fail(400, 'Заметка должна быть короче 8000 символов.');
        return await serial(async () => {
          const next = clone(state), record = item(next, id);
          if ('selected' in body) {
            if (body.selected !== null && !record.assets.some(a => a.id === body.selected && !a.archived)) throw fail(400, 'Выберите загруженный вариант этого объекта.');
            record.selected = body.selected;
          }
          if ('note' in body) record.note = body.note;
          await commit(next); send(res, 200, { library: state });
        });
      }
      if (req.method === 'PATCH' && (match = p.match(/^\/api\/asset\/([a-f0-9-]{36})$/))) {
        const body = await jsonBody(req);
        if (typeof body?.archived !== 'boolean') throw fail(400, 'Укажите состояние варианта.');
        return await serial(async () => {
          const next = clone(state), found = locate(next, match[1]);
          found.asset.archived = body.archived;
          if (body.archived && found.entry.selected === match[1]) found.entry.selected = null;
          await commit(next); send(res, 200, { library: state });
        });
      }
      if (['GET','HEAD'].includes(req.method) && (match = p.match(/^\/(files|previews)\/([a-f0-9-]{36})$/))) {
        const { asset } = locate(state, match[2]);
        const preview = match[1] === 'previews' && asset.preview;
        return await stream(res, req, path.join(dataDir, preview || asset.file), preview ? asset.previewMime : asset.mime, url.searchParams.has('download') ? asset.filename : null);
      }
      if (['GET','HEAD'].includes(req.method) && p.startsWith('/references/')) {
        const file = p.slice(12); if (!references.has(file)) throw fail(404, 'Референс не найден.');
        return await stream(res, req, path.join(kitDir, 'references', file), 'image/png', url.searchParams.has('download') ? file : null);
      }
      const staticFiles = { '/': ['index.html','text/html; charset=utf-8'], '/app.js':['app.js','text/javascript; charset=utf-8'], '/model-viewer.js':['model-viewer.js','text/javascript; charset=utf-8'], '/reference-plan.js':['reference-plan.js','text/javascript; charset=utf-8'], '/style.css':['style.css','text/css; charset=utf-8'] };
      if (['GET','HEAD'].includes(req.method) && staticFiles[p]) return await stream(res, req, path.join(uiDir, staticFiles[p][0]), staticFiles[p][1]);
      throw fail(404, 'Страница не найдена.');
    } catch (e) {
      if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Не удалось сохранить данные. Исходный файл не изменён; повторите попытку.' });
      else res.destroy();
      if (!e.status) console.error(e);
    }
  });
  server.requestTimeout = 120000;
  return { server, dataDir, catalogue, idle: () => queue };
}
function args(argv) {
  const options = { port: 4270, dataDir: DEFAULT_DATA, start: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port') options.port = Number(argv[++i]);
    else if (argv[i] === '--data-dir') options.dataDir = path.resolve(argv[++i]);
    else if (argv[i] === '--start') options.start = true;
    else throw new Error('Unknown argument: ' + argv[i]);
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new Error('Invalid port');
  return options;
}
async function startDetached(options) {
  const url = 'http://127.0.0.1:' + options.port;
  async function ready() {
    try { const data = await (await fetch(url + '/api/health', { signal: AbortSignal.timeout(700) })).json();
      if (data.app !== APP_ID || data.workspace !== ROOT || data.dataDir !== path.resolve(options.dataDir)) throw Object.assign(new Error('Этот адрес занят другой мастерской или приложением.'), { code: 'PORT_IN_USE' }); return true;
    } catch (e) { if (e.code === 'PORT_IN_USE') throw e; return false; }
  }
  if (!await ready()) {
    await fsp.mkdir(options.dataDir, { recursive: true });
    const log = fs.openSync(path.join(options.dataDir, 'workshop.log'), 'a');
    const child = spawn(process.execPath, [__filename, '--port', String(options.port), '--data-dir', options.dataDir], { cwd: ROOT, detached: true, windowsHide: true, stdio: ['ignore',log,log] });
    child.unref(); fs.closeSync(log);
    for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 150)); if (await ready()) { console.log(url); return; } }
    throw new Error('Мастерская не запустилась. Подробности: ' + path.join(options.dataDir, 'workshop.log'));
  }
  console.log(url);
}
if (require.main === module) (async () => {
  const options = args(process.argv.slice(2));
  if (options.start) return startDetached(options);
  const app = await createWorkshop(options);
  app.server.on('error', e => { console.error(e.message); process.exitCode = 1; });
  app.server.listen(options.port, '127.0.0.1', () => console.log('Signal art workshop: http://127.0.0.1:' + options.port + '\nLibrary: ' + app.dataDir));
})().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { createWorkshop, imageInfo, MAX_FILE, APP_ID };
