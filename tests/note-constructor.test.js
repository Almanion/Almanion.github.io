'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Model = require('../constructor/model.js');
const Renderer = require('../constructor/renderer.js');
const History = require('../constructor/history.js');
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
    assert.strictEqual(Model.canReplaceRemoteDraft(null, expectedDraftVersion, nextDraft), true, 'первый пустой проход Firebase-транзакции не является конфликтом');
    assert.strictEqual(Model.canReplaceRemoteDraft(null, expectedDraftVersion), false, 'вне транзакции отсутствие ожидаемого облачного черновика остаётся конфликтом');
    assert.strictEqual(Model.canReplaceRemoteDraft(null, null, nextDraft), true);
    assert.strictEqual(Model.canReplaceRemoteDraft(Object.assign(Model.clone(remoteDraft), { revision: 5, updatedAt: 110 }), expectedDraftVersion, nextDraft), false);
    assert.strictEqual(Model.canReplaceRemoteDraft(Object.assign(Model.clone(remoteDraft), { revision: 6, updatedAt: 130 }), expectedDraftVersion, nextDraft), false);
    assert.strictEqual(Model.canReplaceRemoteDraft(Object.assign(Model.clone(remoteDraft), { updatedBy: 'editor-b' }), expectedDraftVersion, nextDraft), false);

    const deletion = { revision: 5, deletedAt: 130 };
    assert.strictEqual(Model.deletionCoversSection(deletion, remoteDraft), true);
    assert.strictEqual(Model.deletionCoversSection(deletion, Object.assign(Model.clone(remoteDraft), { revision: 6, updatedAt: 140 })), false);
    assert.strictEqual(Model.deletionCoversSection({ revision: 4, deletedAt: 90 }, remoteDraft), false);

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

    const reviewed = Model.normalizeSection({
        title: 'Проверяемый раздел',
        navTitle: 'Проверка',
        reviewStatus: 'ready',
        review: {
            submittedAt: 10,
            submittedBy: 'editor-a',
            comments: [{ id: 'review-1', text: 'Проверьте формулу', authorUid: 'editor-a', authorEmail: 'editor@example.com', createdAt: 11 }]
        },
        blocks: [Model.createBlock('paragraph')]
    }, 'physics');
    assert.strictEqual(reviewed.reviewStatus, 'ready');
    assert.strictEqual(reviewed.review.comments[0].text, 'Проверьте формулу');
    Model.touch(reviewed, 'editor-a');
    assert.strictEqual(reviewed.reviewStatus, 'draft', 'правка материала на проверке возвращает его в черновик');
}

function testHistoryAndReview() {
    const section = Model.createSection('physics', 'История');
    section.blocks[0].content = 'Первая версия';
    const undo = new History.UndoStack(20);
    undo.record(section, 'Изменён текст', 'block:text', 1000);
    section.blocks[0].content = 'Вторая версия';
    undo.record(section, 'Изменён текст', 'block:text', 1500);
    section.blocks[0].content = 'Третья версия';
    assert.strictEqual(undo.undoEntries.length, 1, 'непрерывный ввод объединяется в одну команду');
    const undone = undo.undo(section);
    assert.strictEqual(undone.snapshot.blocks[0].content, 'Первая версия');
    assert.strictEqual(undo.canRedo, true);
    const redone = undo.redo(undone.snapshot);
    assert.strictEqual(redone.snapshot.blocks[0].content, 'Третья версия');

    const before = Model.clone(section);
    section.title = 'Новая история';
    section.blocks.push(Object.assign(Model.createBlock('formula'), { latex: 'F = ma' }));
    const summary = History.summarizeChanges(before, section);
    assert.ok(summary.includes('Изменён заголовок'));
    assert.ok(summary.includes('Добавлено блоков: 1'));

    const actor = { uid: 'editor-a', email: 'editor@example.com' };
    History.transitionReview(section, 'submit', actor, false, 2000);
    assert.strictEqual(section.reviewStatus, 'ready');
    assert.throws(() => History.transitionReview(section, 'publish', actor, false, 2100), /главный администратор/);
    const comment = History.addComment(section, actor, 'Уточнить обозначение', 2200);
    assert.strictEqual(section.review.comments.length, 1);
    assert.strictEqual(History.resolveComment(section, comment.id, actor, false, 2300), true);
    assert.strictEqual(section.review.comments[0].resolvedAt, 2300);
    History.transitionReview(section, 'return', { uid: 'owner' }, true, 2400);
    assert.strictEqual(section.reviewStatus, 'draft');
    History.transitionReview(section, 'submit', actor, false, 2500);
    History.transitionReview(section, 'publish', { uid: 'owner' }, true, 2600);
    assert.strictEqual(section.reviewStatus, 'published');

    const revision = History.createRevision(section, { createdAt: 3000, createdBy: 'owner', createdByEmail: 'owner@example.com', label: 'Проверено' });
    assert.strictEqual(revision.id, '3000-' + section.revision);
    assert.strictEqual(History.mergeRevisions([revision], [revision]).length, 1);
}

function testConstructorV2Wiring() {
    const html = fs.readFileSync(path.join(__dirname, '..', 'constructor.html'), 'utf8');
    const script = fs.readFileSync(path.join(__dirname, '..', 'constructor', 'index.js'), 'utf8');
    const storage = fs.readFileSync(path.join(__dirname, '..', 'constructor', 'storage.js'), 'utf8');
    const storageRules = fs.readFileSync(path.join(__dirname, '..', 'firebase', 'storage.rules'), 'utf8');
    const databaseFragment = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'constructor', 'firebase-database-rules.fragment.json'), 'utf8'));
    assert.ok(html.includes('id="undoButton"'));
    assert.ok(html.includes('id="historyDialog"'));
    assert.ok(html.includes('firebase-storage-compat.js'));
    assert.ok(html.includes('constructor/history.js'));
    assert.ok(script.includes("event.key.toLowerCase() === 'z'"));
    assert.ok(script.includes("noteDraftHistory/"));
    assert.ok(script.includes("noteDraftAssets/"));
    assert.ok(script.includes("noteDraftDeletions/"));
    assert.ok(script.includes("History.transitionReview(section, 'publish'"));
    assert.ok(script.includes('delete publishedSection.review'));
    assert.ok(storage.includes("const REVISION_STORE = 'revisions'"));
    assert.ok(storageRules.includes('request.auth.uid == uploaderUid'));
    assert.ok(storageRules.includes("request.resource.contentType.matches('image/.*')"));
    assert.ok(databaseFragment.noteDraftHistory);
    assert.ok(databaseFragment.noteDraftAssets);
    assert.ok(databaseFragment.noteDraftDeletions);
    assert.ok(databaseFragment.noteDraftsReviewField.review);
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
    assert.ok(html.includes('<div class="definition-box" data-note-block="' + section.blocks[1].id
        + '" data-kc-id="' + section.blocks[1].id
        + '"><strong>Кинетическая энергия</strong> — энергия движения</div>'));
    assert.ok(html.includes('E &amp;= mc^2'));
    assert.ok(!html.includes('javascript:'));
    assert.ok(html.includes('<article id="safe-section" class="topic constructor-topic">'));
    assert.ok(html.includes('<article id="short-subsection" class="topic constructor-topic" data-note-block="short-subsection" data-kc-id="short-subsection">'));
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
    const nestedFormula = Object.assign(Model.createBlock('formula'), { latex: 'F = ma' });
    nestedDefinition.children.push(nestedFormula);
    assert.strictEqual(Renderer.renderBlock(nestedDefinition, 0), '<div class="definition-box" data-note-block="' + nestedDefinition.id
        + '" data-kc-id="' + nestedDefinition.id + '"><strong>Сила</strong>: мера взаимодействия<div class="formula-box" data-note-block="'
        + nestedFormula.id + '" data-kc-id="' + nestedFormula.id + '">\\[F = ma\\]</div></div>');
    const genericRemark = Object.assign(Model.createBlock('remark'), { title: 'Замечание', content: 'Только текст' });
    assert.strictEqual(Renderer.renderBlock(genericRemark, 0), '<div class="remark-box" data-note-block="' + genericRemark.id
        + '" data-kc-id="' + genericRemark.id + '">Только текст</div>');
    const titledRemark = Object.assign(Model.createBlock('remark'), { title: 'О границах применимости', content: 'Только текст' });
    assert.strictEqual(Renderer.renderBlock(titledRemark, 0), '<div class="remark-box" data-note-block="' + titledRemark.id
        + '" data-kc-id="' + titledRemark.id + '"><strong>О границах применимости</strong><br>Только текст</div>');
    const reminder = Object.assign(Model.createBlock('reminder'), { content: 'Вспомним определение.' });
    assert.strictEqual(Renderer.renderBlock(reminder, 0), '<div class="reminder-box" data-note-block="' + reminder.id
        + '" data-kc-id="' + reminder.id + '">Вспомним определение.</div>');
    const corollary = Object.assign(Model.createBlock('corollary'), { title: 'Следствие', content: 'Результат.' });
    assert.strictEqual(Renderer.renderBlock(corollary, 0), '<div class="corollary-box" data-note-block="' + corollary.id
        + '" data-kc-id="' + corollary.id + '">Результат.</div>');
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
        assert.ok(html.includes('<article id="test-subsection" class="topic constructor-topic" data-note-block="test-subsection" data-kc-id="test-subsection">'));
        assert.ok(html.includes('data-note-block="' + section.blocks[0].id + '" data-kc-id="' + section.blocks[0].id + '"'));
        assert.ok(html.includes('data-note-block="' + subsection.children[0].id + '" data-kc-id="' + subsection.children[0].id + '"'));
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
    const siteScript = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
    const constructorScript = fs.readFileSync(path.join(__dirname, '..', 'constructor', 'index.js'), 'utf8');
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
    const textFragments = [];
    const collectText = value => {
        if (typeof value === 'string') textFragments.push(value);
        else if (Array.isArray(value)) value.forEach(collectText);
        else if (value && typeof value === 'object') Object.values(value).forEach(collectText);
    };
    collectText(section);
    const noteText = textFragments.join('\n');
    assert.match(noteText, /\\divby\b/);
    assert.match(noteText, /\\ndivby\b/);
    assert.doesNotMatch(noteText, /\\nmid\b/, 'знак «не делит» должен быть записан в форме «не делится»');
    assert.strictEqual((noteText.match(/\\mid(?![A-Za-z])/g) || []).length, 8, 'обычная черта должна остаться только в обозначениях множеств');
    [siteScript, constructorScript].forEach(source => {
        assert.ok(source.includes('"\\\\divby": "\\\\mathrel{\\\\scriptstyle\\\\vdots}"'));
        assert.ok(source.includes('"\\\\ndivby": "\\\\mathrel{\\\\scriptstyle\\\\not\\\\vdots}"'));
    });
    assert.deepStrictEqual(Model.validateSection(section), []);
    const detachedTypes = new Set(['paragraph', 'formula', 'list', 'image']);
    section.subsections.forEach(subsection => {
        subsection.children.forEach(block => {
            assert.ok(!detachedTypes.has(block.type), `${subsection.id}: блок ${block.id} должен быть вложен в смысловой контейнер`);
        });
    });
    assert.strictEqual(section.subsections[0].children[0].type, 'reminder');
    assert.strictEqual(section.subsections[5].children.find(block => block.id === 'gaussian-norm').type, 'definition');
    assert.strictEqual(section.subsections[5].children.find(block => block.id === 'norm-properties').type, 'properties');

    const reciprocity = section.subsections.find(subsection => subsection.id === 'kvadratichnyy-zakon-vzaimnosti');
    const eisenstein = reciprocity.children.find(block => block.id === 'eisenstein-lemma');
    const eisensteinProof = eisenstein.children.find(block => block.id === 'eisenstein-proof');
    const eisensteinReciprocityProof = reciprocity.children.find(block => block.id === 'eisenstein-reciprocity-proof');
    const eisensteinFigure = eisensteinReciprocityProof.children.find(block => block.id === 'reciprocity-lattice');
    assert.strictEqual(eisensteinProof.children.length, 0);
    assert.strictEqual(eisensteinReciprocityProof.type, 'proof');
    assert.ok(eisensteinReciprocityProof.children.some(block => block.id === 'eisenstein-lattice-conclusion'));
    assert.strictEqual(eisensteinFigure.title, 'Геометрическая интерпретация леммы Эйзенштейна');
    assert.ok(eisensteinFigure.caption.includes('Центральная симметрия'));

    const eisensteinSvg = fs.readFileSync(path.join(__dirname, '..', eisensteinFigure.src.split('?')[0]), 'utf8');
    const countedGroup = eisensteinSvg.match(/<g class="counted">([\s\S]*?)<\/g>/);
    const pairedGroup = eisensteinSvg.match(/<g class="paired">([\s\S]*?)<\/g>/);
    assert.strictEqual((countedGroup[1].match(/<circle\b/g) || []).length, 17);
    assert.strictEqual((pairedGroup[1].match(/<circle\b/g) || []).length, 8);
    assert.ok(eisensteinSvg.includes('markerUnits="userSpaceOnUse"'));
    assert.ok(!/body\.experimental \.remark-box::before\s*\{\s*content:\s*"Замечание"/.test(experimentalStyles));

    const visit = block => {
        const html = Renderer.renderBlock(block, 0);
        if (html) {
            assert.ok(html.includes(`data-note-block="${block.id}"`), `${block.id}: блок должен сохранять id конструктора`);
            assert.ok(html.includes(`data-kc-id="${block.id}"`), `${block.id}: блок должен иметь стабильный id проверки знаний`);
        }
        if (Renderer.TYPE_LABELS[block.type]) {
            assert.ok(
                html.includes(`class="${semanticClasses[block.type]}`),
                `${block.id}: смысловой блок ${block.type} должен сохранять семантический класс`
            );
            if (block.type !== 'remark') {
                assert.ok(
                    experimentalStyles.includes(`body.experimental .${semanticClasses[block.type]}::before`),
                    `${block.id}: для блока ${block.type} должна быть верхняя плашка типа`
                );
                assert.ok(
                    experimentalStyles.includes(`content: "${Renderer.TYPE_LABELS[block.type]}"`),
                    `${block.id}: плашка блока ${block.type} должна называться «${Renderer.TYPE_LABELS[block.type]}»`
                );
            }
        }
        if (block.type === 'definition') {
            assert.ok(String(block.term || '').trim(), `${block.id}: у определения должен быть термин`);
        }
        (block.children || []).forEach(visit);
    };
    section.blocks.forEach(visit);
    section.subsections.forEach(subsection => (subsection.children || []).forEach(visit));
}

function testGeneratedStableBlockIds() {
    const root = path.join(__dirname, '..');
    const subjects = JSON.parse(fs.readFileSync(path.join(root, 'content', 'subjects.json'), 'utf8'));
    let renderedBlocks = 0;
    subjects.forEach(subject => {
        const html = fs.readFileSync(path.join(root, subject.page), 'utf8');
        const sections = Builder.loadSections(root, subject);
        const visit = block => {
            if (Renderer.renderBlock(block, 0)) {
                const id = Renderer.escapeHtml(block.id);
                assert.ok(html.includes(`data-note-block="${id}"`), `${subject.page}: отсутствует data-note-block для ${block.id}`);
                assert.ok(html.includes(`data-kc-id="${id}"`), `${subject.page}: отсутствует data-kc-id для ${block.id}`);
                renderedBlocks += 1;
            }
            (block.children || []).forEach(visit);
        };
        sections.forEach(section => {
            (section.blocks || []).forEach(visit);
            (section.subsections || []).forEach(visit);
        });
    });
    assert.ok(renderedBlocks > 300, 'каноническая сборка должна проверить все существующие учебные блоки');
}

testModel();
testHistoryAndReview();
testConstructorV2Wiring();
testRenderer();
testBuild();
testEmptySubjectBuild();
testNumberTheoryStructure();
testGeneratedStableBlockIds();
console.log('note-constructor tests: ok');
