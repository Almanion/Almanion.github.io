'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Model = require('../constructor/model');
const Renderer = require('../constructor/renderer');
const Watch = require('../tools/build-watch');

const original = {id:'test-experiment',type:'experiment',title:'Опыт',content:'Исходное описание.',children:[{id:'drawing',type:'image',src:'images/diagram.svg',caption:'Исходная схема'}]};
const base = Renderer.renderBlock(Model.normalizeBlock(original,0),0);
const notebook = 'Наблюдаем движение.\n\nОтсюда \\[v=s/t\\]. <script>alert(1)</script> "текст"';
const normalized = Model.normalizeBlock({...original,notebook},0);
assert.equal(normalized.notebook,notebook);
assert.equal(Model.normalizeSection({id:'one',blocks:[normalized]},'physics').blocks[0].notebook,notebook);
assert.equal(Model.normalizeBlock({...original,type:'remark',notebook},0).notebook,undefined);
assert.equal(Model.normalizeBlock({...original,notebook:'  '},0).notebook,undefined);
const html = Renderer.renderBlock(normalized,0);
assert.match(html,/data-experiment-notebook="/);
assert.doesNotMatch(html,/<script>/);
assert.equal(html.replace(/ data-experiment-notebook="[^"]*"/,''),base,'adding a variant cannot change the source text, image or stable ID');
const topics = Watch.extract('<main><article class="topic" id="one"><h3>Тема</h3>'+html+'</article></main>',{});
assert.equal(topics[0].blocks[0].id,original.id);
assert.equal(topics[0].blocks[0].type,'experiment');
assert.match(topics[0].blocks[0].html,/data-experiment-notebook/);
assert.match(topics[0].blocks[0].html,/images\/diagram.svg/);
const runtime = fs.readFileSync('note-runtime.js','utf8');
assert.match(runtime,/experiment-notebook\.js\?v=/);
const site = process.env.ALMANION_TEST_SITE;
if (site) {
    assert.ok(fs.existsSync(site+'/experiment-notebook.js'));
    assert.match(fs.readFileSync(site+'/physics-10.html','utf8'),/note-runtime\.js\?v=\d{8}-\d+/);
    assert.match(fs.readFileSync(site+'/watch/index.html','utf8'),/experiment-notebook\.js/);
    const offline = JSON.parse(fs.readFileSync(site+'/offline-library.json'));
    assert.ok(offline.subjects.every(subject=>subject.files.some(file=>file.url==='/experiment-notebook.js')));
}
console.log('experiment notebook schema, safe rendering, source identity, watch extraction and offline assets passed');
