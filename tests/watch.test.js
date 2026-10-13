'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Watch = require('../tools/build-watch');
const fixture = '<main class="main-content"><section class="content-section"><h2 class="part-title">Глава</h2><article class="topic" id="one"><h3 class="topic-title">Раздел</h3><div class="definition-box" data-note-block="term"><strong>Термостат</strong> — текст.<div class="formula-box">\\[pV=NkT\\]</div></div><div class="proof-box"><button>Показать</button><div class="proof-content" hidden><p>Доказательство.</p><img src="images/diagram.svg"></div></div><p>Заключение.</p></article></section></main>';
const topics = Watch.extract(fixture, { path:'physics-10.html' });
assert.equal(topics.length, 1);
assert.equal(topics[0].title, 'Раздел');
assert.equal(topics[0].group, 'Глава');
assert.equal(topics[0].blocks.length, 3);
assert.equal(topics[0].blocks[0].id, 'term');
assert.equal(topics[0].blocks[0].type, 'definition');
assert.ok(topics[0].blocks[0].html.includes('formula-box'), 'nested blocks stay in their parent');
assert.ok(topics[0].blocks[1].html.includes('images/diagram.svg'), 'proof images and content survive extraction');
assert.equal(Watch.extract(fixture.replace('Заключение.', 'Другое заключение.'), {}).at(0).blocks[0].id, 'term');
const markup = fs.readFileSync(path.join(__dirname, '../watch/index.html'), 'utf8');
assert.match(markup, /maximum-scale=5/);
assert.doesNotMatch(markup, /user-scalable=no|firebase|home-stars|style-new/);
const worker = fs.readFileSync(path.join(__dirname, '../watch/sw.js'), 'utf8');
assert.match(worker, /keys.length - 80/);
assert.match(worker, /4500/);
assert.match(fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8'), /key.startsWith\('almanion-watch-'\)/, 'a main-site update must preserve watch reading caches');
const site = process.env.ALMANION_TEST_SITE;
if (site) {
    const catalogue = JSON.parse(fs.readFileSync(path.join(site, 'watch/catalogue.json')));
    assert.ok(catalogue.subjects.some(subject => subject.id === 'physics-10'));
    assert.deepEqual(catalogue.subjects.find(subject => subject.id === 'russian-ege').grades, [10,11]);
    assert.ok(!catalogue.subjects.some(subject => /english|planner|sport|admin|matcenter/.test(subject.id)), 'no private data in public watch catalogue');
    for (const subject of catalogue.subjects) {
        const data = JSON.parse(fs.readFileSync(path.join(site, 'watch', subject.path)));
        assert.ok(data.topics.length > 0);
        for (const topic of data.topics) {
            assert.equal(topic.parts.reduce((sum, part) => sum + part.count, 0), topic.count);
            for (const part of topic.parts) {
                assert.match(part.path, /^data\/[a-f0-9]+\.json$/);
                assert.ok(fs.statSync(path.join(site, 'watch', part.path)).size < 100000);
            }
        }
    }
    assert.doesNotMatch(fs.readFileSync(path.join(site, 'watch/sw.js'), 'utf8'), /__WATCH_VERSION__/);
    for (const file of fs.readdirSync(path.join(site, 'watch/figures'))) assert.match(fs.readFileSync(path.join(site, 'watch/figures',file),'utf8'), /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
}
async function checkWorkerStorage() {
    for (const quotaFull of [false,true]) {
        const keys = [new Request('https://almanion.github.io/watch/catalogue.json'), ...Array.from({length:81}, (_,i) => new Request('https://almanion.github.io/watch/data/physics-' + i.toString(16).padStart(16,'0') + '.json'))];
        const deleted = [];
        const cache = { match:async () => undefined, put:async () => { if (quotaFull) throw new Error('QuotaExceededError'); }, keys:async () => keys, delete:async key => { deleted.push(key.url); return true; } };
        let handle, pending;
        vm.runInNewContext(worker, {
            self:{location:{origin:'https://almanion.github.io'},addEventListener:(name,callback) => { if (name === 'fetch') handle = callback; }},
            caches:{open:async () => cache},fetch:async () => new Response('network material'),URL,Response,AbortController,setTimeout,clearTimeout
        });
        handle({request:new Request('https://almanion.github.io/watch/watch.js'),respondWith:promise => { pending = promise; }});
        assert.equal(await (await pending).text(), 'network material', 'full offline storage must not break a valid online response');
        if (!quotaFull) {
            assert.equal(keys.length - deleted.length,80,'metadata from old publications must not grow the cache indefinitely');
            assert.ok(!deleted.some(url => url.endsWith('catalogue.json')),'keep the offline catalogue');
        }
    }
}
checkWorkerStorage().then(() => console.log('watch: canonical public materials, nested blocks, stable IDs, small chunks, bounded offline storage and zoom passed')).catch(error => { console.error(error); process.exitCode = 1; });
