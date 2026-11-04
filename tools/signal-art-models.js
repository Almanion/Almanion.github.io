'use strict';
const path = require('node:path');
const zlib = require('node:zlib');
const MAX_MODEL = 128 * 1024 * 1024;
const bad = message => { throw Object.assign(new Error(message), {status:415}); };

// Inspect data only. Blender files are never opened or executed by the service.
function modelInfo(bytes, filename) {
  const ext = path.extname(filename).toLowerCase().slice(1);
  if (ext === 'blend') {
    let header = bytes.subarray(0, 12);
    // Compressed .blend files are retained byte-for-byte; accept known containers.
    const gzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
    const zstd = bytes.subarray(0,4).equals(Buffer.from('28b52ffd','hex'));
    if (gzip || zstd) {
      try {
        const decompress = gzip ? zlib.gunzipSync : zlib.zstdDecompressSync;
        if (!decompress) bad('Сохраните Blender-файл без сжатия (Compress выключен).');
        header = decompress(bytes, {maxOutputLength:MAX_MODEL * 2}).subarray(0,12);
      } catch (e) { if (e.status) throw e; bad('Не удалось прочитать сжатый Blender-файл. Сохраните его без сжатия.'); }
    }
    if (!/^BLENDER[_-][vV]\d{3}$/.test(header.toString('ascii')) || bytes.length < 32) bad('Файл не похож на исправный проект Blender.');
    return {ext, mime:'application/octet-stream', role:'source', blenderVersion:header.toString('ascii',9,12)};
  }
  if (ext !== 'glb') bad('Загрузите GLB для игры или BLEND как редактируемый исходник.');
  if (bytes.length < 24 || bytes.toString('ascii',0,4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) bad('Нужен целый GLB версии 2.0.');
  let at = 12, doc, binLength = 0, chunk = 0;
  while (at + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(at), type = bytes.readUInt32LE(at+4), end = at+8+length;
    if (length % 4 || end > bytes.length) bad('Повреждена структура GLB.');
    if (!chunk && type !== 0x4e4f534a) bad('В GLB отсутствует описание модели.');
    if (type === 0x4e4f534a) {
      if (doc || length > 16*1024*1024) bad('Некорректное описание GLB.');
      try { doc = JSON.parse(bytes.toString('utf8',at+8,end).trim()); } catch { bad('Описание модели GLB повреждено.'); }
    } else if (type === 0x004e4942) {
      if (binLength) bad('В GLB найдено несколько двоичных блоков.');
      binLength = length;
    }
    at=end; chunk++;
  }
  if (at !== bytes.length || doc?.asset?.version !== '2.0' || !Array.isArray(doc.meshes) || !doc.meshes.length) bad('GLB не содержит геометрию модели.');
  // Standalone uploads must not fetch local files or remote URLs during preview.
  function checkUris(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key,item] of Object.entries(value)) {
      if (key === 'uri' && (typeof item !== 'string' || !/^data:(image\/(png|jpeg|webp)|application\/octet-stream);base64,[A-Za-z0-9+/=\r\n]+$/.test(item)))
        bad('GLB ссылается на внешние файлы. Экспортируйте геометрию и текстуры в один GLB.');
      if (typeof item === 'object') checkUris(item);
    }
  }
  checkUris(doc);
  for (const b of doc.buffers || []) if (!b.uri && (!Number.isSafeInteger(b.byteLength) || b.byteLength < 0 || b.byteLength > binLength)) bad('Данные геометрии GLB обрезаны.');
  for (const view of doc.bufferViews || []) {
    const buffer = doc.buffers?.[view.buffer], offset = view.byteOffset || 0;
    if (!buffer || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(view.byteLength) || view.byteLength < 0 || offset + view.byteLength > buffer.byteLength) bad('Некорректные границы данных GLB.');
  }
  let triangles = 0, vertices = 0;
  for (const mesh of doc.meshes) for (const p of mesh.primitives || []) {
    const position = doc.accessors?.[p.attributes?.POSITION], indices = p.indices == null ? position : doc.accessors?.[p.indices];
    if (!position || !indices || !Number.isSafeInteger(position.count) || !Number.isSafeInteger(indices.count) || position.count < 1 || indices.count < 1) bad('GLB содержит некорректную геометрию.');
    vertices += position.count;
    const mode = p.mode ?? 4;
    if (mode === 4) triangles += Math.floor(indices.count/3);
    else if (mode === 5 || mode === 6) triangles += Math.max(0, indices.count-2);
  }
  if (!vertices) bad('В GLB нет вершин.');
  return {ext, mime:'model/gltf-binary', role:'model', triangles, vertices, meshes:doc.meshes.length,
    materials:doc.materials?.length || 0, textures:doc.images?.length || 0, animations:doc.animations?.length || 0,
    extensions:doc.extensionsRequired || []};
}
module.exports = {modelInfo, MAX_MODEL};
