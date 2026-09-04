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

    const remoteDraft = Object.assign(Model.createSection('physics', 'Черновик'), {
        revision: 4,
        updatedAt: 100,
        updatedBy: 'editor-a'
    });
    const expectedDraftVersion = Model.draftVersion(remoteDraft);
    const nextDraft = Object.assign(Model.clone(remoteDraft), { revision: 5, updatedAt: 120 });
    assert.strictEqual(Model.canReplaceRemoteDraft(remoteDraft, expectedDraftVersion, nextDraft), true);
    assert.strictEqual(Model.canReplaceRemoteDraft(null, expectedDraftVersion, nextDraft), true);
    assert.strictEqual(Model.canReplaceRemoteDraft(Object.assign(Model.clone(remoteDraft), { revision: 5, updatedAt: 110 }), expectedDraftVersion, nextDraft), true);
    assert.strictEqual(Model.canReplaceRemoteDraft(Object.assign(Model.clone(remoteDraft), { revision: 6, updatedAt: 130 }), expectedDraftVersion, nextDraft), false);
    assert.strictEqual(Model.canReplaceRemoteDraft(Object.assign(Model.clone(remoteDraft), { updatedBy: 'editor-b' }), expectedDraftVersion, nextDraft), false);

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
    assert.strictEqual(
        Renderer.renderInline(String.raw`Нижний \(I_*\), верхний \(I^*\), группа \(\mathbb Z_p^*\); **снаружи**.`),
        String.raw`Нижний \(I_*\), верхний \(I^*\), группа \(\mathbb Z_p^*\); <strong>снаружи</strong>.`
    );
    const nestedDefinition = Object.assign(Model.createBlock('definition'), { term: 'Сила', separator: ':', content: 'мера взаимодействия' });
    nestedDefinition.children.push(Object.assign(Model.createBlock('formula'), { latex: 'F = ma' }));
    assert.strictEqual(Renderer.renderBlock(nestedDefinition, 0), '<div class="definition-box"><strong>Сила</strong>: мера взаимодействия<div class="formula-box">\\[F = ma\\]</div></div>');
    assert.strictEqual(Renderer.renderBlock(Object.assign(Model.createBlock('remark'), { title: 'Замечание', content: 'Только текст' }), 0), '<div class="remark-box">Только текст</div>');
    assert.strictEqual(Renderer.renderBlock(Object.assign(Model.createBlock('remark'), { title: 'О границах применимости', content: 'Только текст' }), 0), '<div class="remark-box"><strong>О границах применимости</strong><br>Только текст</div>');
    assert.strictEqual(Renderer.renderBlock(Object.assign(Model.createBlock('reminder'), { content: 'Вспомним определение.' }), 0), '<div class="reminder-box">Вспомним определение.</div>');
    assert.strictEqual(Renderer.renderBlock(Object.assign(Model.createBlock('corollary'), { title: 'Следствие', content: 'Результат.' }), 0), '<div class="corollary-box">Результат.</div>');
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

function testNumberTheoryStructure() {
    const file = path.join(__dirname, '..', 'content', 'likbez', 'sections', 'teoriya-chisel.json');
    const experimentalStyles = fs.readFileSync(path.join(__dirname, '..', 'style-new.css'), 'utf8');
    const semanticClasses = {
        definition: 'definition-box',
        derivation: 'derivation-box',
        experiment: 'experiment-box',
        remark: 'remark-box',
        reminder: 'reminder-box',
        theorem: 'theorem-box',
        lemma: 'lemma-box',
        statement: 'statement-box',
        corollary: 'corollary-box',
        properties: 'properties-box',
        exercise: 'exercise-box',
        proof: 'proof-box',
        example: 'example-box',
        formula: 'formula-box'
    };
    const section = Model.normalizeSection(JSON.parse(fs.readFileSync(file, 'utf8')), 'likbez');
    assert.deepStrictEqual(Model.validateSection(section), []);
    const detachedTypes = new Set(['paragraph', 'formula', 'list', 'image', 'proof']);
    section.subsections.forEach(subsection => {
        subsection.children.forEach(block => {
            assert.ok(!detachedTypes.has(block.type), `${subsection.id}: блок ${block.id} должен быть вложен в смысловой контейнер`);
        });
    });
    assert.strictEqual(section.subsections[0].children[0].type, 'reminder');
    assert.strictEqual(section.subsections[5].children.find(block => block.id === 'gaussian-norm').type, 'definition');
    assert.strictEqual(section.subsections[5].children.find(block => block.id === 'norm-properties').type, 'properties');

    const visit = block => {
        if (Renderer.TYPE_LABELS[block.type]) {
            const html = Renderer.renderBlock(block, 0);
            assert.ok(
                html.includes(`class="${semanticClasses[block.type]}`),
                `${block.id}: смысловой блок ${block.type} должен сохранять семантический класс`
            );
            assert.ok(
                experimentalStyles.includes(`body.experimental .${semanticClasses[block.type]}::before`),
                `${block.id}: для блока ${block.type} должна быть верхняя плашка типа`
            );
            assert.ok(
                experimentalStyles.includes(`content: "${Renderer.TYPE_LABELS[block.type]}"`),
                `${block.id}: плашка блока ${block.type} должна называться «${Renderer.TYPE_LABELS[block.type]}»`
            );
        }
        if (block.type === 'definition') {
            assert.ok(String(block.term || '').trim(), `${block.id}: у определения должен быть термин`);
        }
        (block.children || []).forEach(visit);
    };
    section.blocks.forEach(visit);
    section.subsections.forEach(subsection => (subsection.children || []).forEach(visit));
}

testModel();
testRenderer();
testBuild();
testEmptySubjectBuild();
testNumberTheoryStructure();
console.log('note-constructor tests: ok');
