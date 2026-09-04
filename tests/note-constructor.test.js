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

    const subsection = Model.createSubsection('Закон электромагнитной индукции', 'Закон индукции');
    assert.strictEqual(subsection.navTitle, 'Закон индукции');
    section.blocks = [Model.createBlock('definition'), Model.createBlock('paragraph')];
    const paragraphId = section.blocks[1].id;
    assert.strictEqual(Model.moveIntoContainer(section, paragraphId, section.blocks[0].id), true);
    assert.strictEqual(section.blocks[0].children[0].id, paragraphId);
    assert.strictEqual(Model.smartDashes('Причина -- следствие'), 'Причина — следствие');

    const definition = Model.createBlock('definition');
    definition.term = 'I закон Ньютона';
    definition.separator = ':';
    definition.content = 'ускорение определяется силой';
    section.blocks = [definition];
    assert.deepStrictEqual(Model.validateSection(section), []);

    const legacyDefinition = Model.normalizeBlock({ type: 'definition', title: 'Импульс:', content: 'произведение массы на скорость' }, 0);
    assert.strictEqual(legacyDefinition.term, 'Импульс');
    assert.strictEqual(legacyDefinition.separator, ':');
    assert.strictEqual(legacyDefinition.title, '');

    const legacy = Model.normalizeSection({ title: 'Раздел', navTitle: 'Раздел', blocks: [Object.assign(Model.createBlock('subsection'), { title: 'Старый подраздел' })] }, 'physics');
    assert.strictEqual(legacy.blocks.length, 0);
    assert.strictEqual(legacy.subsections.length, 1);
    assert.strictEqual(legacy.subsections[0].navTitle, 'Старый подраздел');
}

function testRenderer() {
    const section = Model.createSection('physics', '<script>alert(1)</script>');
    section.id = 'safe-section';
    section.blocks = [
        Object.assign(Model.createBlock('paragraph'), { content: '**Энергия** <img src=x>' }),
        Object.assign(Model.createBlock('definition'), { term: 'Кинетическая энергия', separator: '—', content: 'энергия движения' }),
        Object.assign(Model.createBlock('formula'), { latex: String.raw`E &= mc^2` }),
        Object.assign(Model.createBlock('image'), { src: 'javascript:alert(1)', alt: 'x' })
    ];
    section.subsections = [Object.assign(Model.createSubsection('Полное название', 'Короткое'), { id: 'short-subsection' })];
    const html = Renderer.renderSection(section);
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('<strong>Энергия</strong>'));
    assert.ok(html.includes('<div class="definition-box"><strong>Кинетическая энергия</strong> — энергия движения</div>'));
    assert.ok(html.includes('E &amp;= mc^2'));
    assert.ok(!html.includes('javascript:'));
    assert.ok(html.includes('<article id="safe-section" class="topic constructor-topic">'));
    assert.ok(html.includes('<article id="short-subsection" class="topic constructor-topic">'));
    assert.ok(!html.includes('constructor-nested-content'));
    const nav = Renderer.renderNavItem(section);
    assert.ok(nav.includes('nav-group-toggle'));
    assert.ok(nav.includes('href="#short-subsection"'));
    assert.ok(nav.includes('Короткое'));
    const nestedDefinition = Object.assign(Model.createBlock('definition'), { term: 'Сила', separator: ':', content: 'мера взаимодействия' });
    nestedDefinition.children.push(Object.assign(Model.createBlock('formula'), { latex: 'F = ma' }));
    assert.strictEqual(Renderer.renderBlock(nestedDefinition, 0), '<div class="definition-box"><strong>Сила</strong>: мера взаимодействия<div class="formula-box">\\[F = ma\\]</div></div>');
    assert.strictEqual(Renderer.renderBlock(Object.assign(Model.createBlock('remark'), { title: 'Лишний заголовок', content: 'Только текст' }), 0), '<div class="remark-box">Только текст</div>');
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
        const subsection = Model.createSubsection('Полное название подраздела', 'Короткое меню');
        subsection.id = 'test-subsection';
        subsection.children[0].content = 'Текст подраздела';
        section.subsections.push(subsection);
        fs.writeFileSync(path.join(root, 'content', 'physics', 'sections', 'test-section.json'), JSON.stringify(section));
        fs.writeFileSync(path.join(root, 'physics.html'), '<nav>' + Builder.MARKERS.navStart + '\n' + Builder.MARKERS.navEnd + '</nav><main>' + Builder.MARKERS.contentStart + '\n' + Builder.MARKERS.contentEnd + '</main>');
        const result = Builder.build({ root, output });
        const html = fs.readFileSync(path.join(output, 'physics.html'), 'utf8');
        assert.deepStrictEqual(result, { subjects: 1, sections: 1 });
        assert.ok(html.includes('href="#test-section"'));
        assert.ok(html.includes('Проверка сборки'));
        assert.ok(html.includes('href="#test-subsection"'));
        assert.ok(html.includes('Короткое меню'));
        assert.ok(html.includes('Текст подраздела'));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(output, { recursive: true, force: true });
    }
}

function testEmptySubjectBuild() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'almanion-notes-empty-source-'));
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'almanion-notes-empty-output-'));
    try {
        fs.mkdirSync(path.join(root, 'content', 'literature-10', 'sections'), { recursive: true });
        fs.writeFileSync(path.join(root, 'content', 'subjects.json'), JSON.stringify([{
            id: 'literature-10',
            title: 'Литература · 10 класс',
            page: 'literature-10.html',
            emptyMessage: 'Конспекты скоро появятся.'
        }]));
        fs.writeFileSync(path.join(root, 'content', 'literature-10', 'manifest.json'), JSON.stringify({ subject: 'literature-10', sections: [] }));
        fs.writeFileSync(path.join(root, 'literature-10.html'), '<nav>' + Builder.MARKERS.navStart + '\n' + Builder.MARKERS.navEnd + '</nav><main>' + Builder.MARKERS.contentStart + '\n' + Builder.MARKERS.contentEnd + '</main>');
        const result = Builder.build({ root, output });
        const html = fs.readFileSync(path.join(output, 'literature-10.html'), 'utf8');
        assert.deepStrictEqual(result, { subjects: 1, sections: 0 });
        assert.ok(html.includes('notes-empty-state'));
        assert.ok(html.includes('Конспекты скоро появятся.'));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(output, { recursive: true, force: true });
    }
}

testModel();
testRenderer();
testBuild();
testEmptySubjectBuild();
console.log('note-constructor tests: ok');
