'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Model = require('../constructor/model.js');
const Renderer = require('../constructor/renderer.js');
const Builder = require('../tools/build-notes.js');

function testModel() {
    const section = Model.createSection('physics', 'Электромагнитная индукция');
    assert.strictEqual(section.id, 'elektromagnitnaya-indukciya');
    section.blocks = [Model.createBlock('subsection'), Model.createBlock('formula')];
    const formulaId = section.blocks[1].id;
    assert.strictEqual(Model.indentBlock(section, formulaId), true);
    assert.strictEqual(section.blocks[0].children[0].id, formulaId);
    assert.strictEqual(Model.outdentBlock(section, formulaId), true);
    assert.strictEqual(section.blocks[1].id, formulaId);
    const copy = Model.duplicateBlock(section, formulaId);
    assert.notStrictEqual(copy.id, formulaId);
    assert.strictEqual(Model.moveWithinLevel(section, copy.id, -1), true);
    assert.strictEqual(section.blocks[1].id, copy.id);
    assert.deepStrictEqual(Model.validateSection(section), []);
}

function testRenderer() {
    const section = Model.createSection('physics', '<script>alert(1)</script>');
    section.id = 'safe-section';
    section.blocks = [
        Object.assign(Model.createBlock('paragraph'), { content: '**Энергия** <img src=x>' }),
        Object.assign(Model.createBlock('formula'), { latex: String.raw`E &= mc^2` }),
        Object.assign(Model.createBlock('image'), { src: 'javascript:alert(1)', alt: 'x' })
    ];
    const html = Renderer.renderSection(section);
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('<strong>Энергия</strong>'));
    assert.ok(html.includes('E &amp;= mc^2'));
    assert.ok(!html.includes('javascript:'));
    assert.strictEqual(Renderer.safeImageSource('//example.com/track.png'), '');
}

function testBuild() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'almanion-notes-source-'));
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'almanion-notes-output-'));
    try {
        fs.mkdirSync(path.join(root, 'content', 'physics', 'sections'), { recursive: true });
        fs.writeFileSync(path.join(root, 'content', 'subjects.json'), JSON.stringify([{ id: 'physics', title: 'Физика', page: 'physics.html' }]));
        fs.writeFileSync(path.join(root, 'content', 'physics', 'manifest.json'), JSON.stringify({ subject: 'physics', sections: [{ id: 'test-section' }] }));
        const section = Model.createSection('physics', 'Тестовый раздел');
        section.id = 'test-section';
        section.blocks[0].content = 'Проверка сборки';
        fs.writeFileSync(path.join(root, 'content', 'physics', 'sections', 'test-section.json'), JSON.stringify(section));
        fs.writeFileSync(path.join(root, 'physics.html'), '<nav>' + Builder.MARKERS.navStart + '\n' + Builder.MARKERS.navEnd + '</nav><main>' + Builder.MARKERS.contentStart + '\n' + Builder.MARKERS.contentEnd + '</main>');
        const result = Builder.build({ root, output });
        const html = fs.readFileSync(path.join(output, 'physics.html'), 'utf8');
        assert.deepStrictEqual(result, { subjects: 1, sections: 1 });
        assert.ok(html.includes('href="#test-section"'));
        assert.ok(html.includes('Проверка сборки'));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(output, { recursive: true, force: true });
    }
}

testModel();
testRenderer();
testBuild();
console.log('note-constructor tests: ok');
