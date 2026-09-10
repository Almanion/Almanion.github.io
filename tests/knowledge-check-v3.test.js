const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'knowledge-check.js'), 'utf8');
const fsrsSource = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'ts-fsrs.umd.js'), 'utf8');
const DAY = 86400000;

class FakeClassList {
    constructor(owner) {
        this.owner = owner;
    }

    contains(name) {
        return this.owner.className.split(/\s+/).filter(Boolean).includes(name);
    }

    add(...names) {
        const current = new Set(this.owner.className.split(/\s+/).filter(Boolean));
        names.forEach(name => current.add(name));
        this.owner.className = Array.from(current).join(' ');
    }

    remove(...names) {
        const removed = new Set(names);
        this.owner.className = this.owner.className
            .split(/\s+/)
            .filter(name => name && !removed.has(name))
            .join(' ');
    }
}

class FakeElement {
    constructor(tagName, options = {}) {
        this.tagName = String(tagName || 'div').toUpperCase();
        this.nodeType = 1;
        this.parentElement = null;
        this.className = options.className || '';
        this.id = options.id || '';
        this._text = options.text || '';
        this.attributes = { ...(options.attributes || {}) };
        if (this.id) this.attributes.id = this.id;
        if (this.className) this.attributes.class = this.className;
        this.dataset = {};
        Object.entries(this.attributes).forEach(([name, value]) => {
            if (!name.startsWith('data-')) return;
            const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
            this.dataset[key] = String(value);
        });
        this.children = [];
        this.classList = new FakeClassList(this);
        (options.children || []).forEach(child => this.appendChild(child));
    }

    appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    get parentNode() {
        return this.parentElement;
    }

    get childNodes() {
        return this.children;
    }

    get firstElementChild() {
        return this.children[0] || null;
    }

    get nextElementSibling() {
        if (!this.parentElement) return null;
        const index = this.parentElement.children.indexOf(this);
        return this.parentElement.children[index + 1] || null;
    }

    get previousElementSibling() {
        if (!this.parentElement) return null;
        const index = this.parentElement.children.indexOf(this);
        return index > 0 ? this.parentElement.children[index - 1] : null;
    }

    remove() {
        if (!this.parentElement) return;
        const index = this.parentElement.children.indexOf(this);
        if (index >= 0) this.parentElement.children.splice(index, 1);
        this.parentElement = null;
    }

    get textContent() {
        return this._text + this.children.map(child => child.textContent).join('');
    }

    get innerText() {
        return this.textContent;
    }

    set textContent(value) {
        this._text = String(value || '');
        this.children = [];
    }

    get innerHTML() {
        return escapeHTML(this._text) + this.children.map(child => child.outerHTML).join('');
    }

    set innerHTML(value) {
        this._text = String(value || '');
        this.children = [];
    }

    get outerHTML() {
        const attributes = Object.entries(this.attributes)
            .map(([name, value]) => ` ${name}="${escapeHTML(String(value))}"`)
            .join('');
        return `<${this.tagName.toLowerCase()}${attributes}>${this.innerHTML}</${this.tagName.toLowerCase()}>`;
    }

    getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name)
            ? this.attributes[name]
            : null;
    }

    setAttribute(name, value) {
        this.attributes[name] = String(value);
        if (name === 'id') this.id = String(value);
        if (name === 'class') this.className = String(value);
        if (name.startsWith('data-')) {
            const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
            this.dataset[key] = String(value);
        }
    }

    hasAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name);
    }

    removeAttribute(name) {
        delete this.attributes[name];
        if (name === 'id') this.id = '';
        if (name === 'class') this.className = '';
    }

    cloneNode(deep = false) {
        return new FakeElement(this.tagName, {
            id: this.id,
            className: this.className,
            text: this._text,
            attributes: { ...this.attributes },
            children: deep ? this.children.map(child => child.cloneNode(true)) : []
        });
    }

    matches(selector) {
        let simple = selector.trim();
        if (!simple) return false;
        if (simple.includes('>')) simple = simple.split('>').pop().trim();
        if (simple.includes(' ')) simple = simple.split(/\s+/).pop();
        if (simple === '*') return true;
        if (simple.startsWith('.')) return this.classList.contains(simple.slice(1));
        if (simple.startsWith('#')) return this.id === simple.slice(1);
        const dataMatch = simple.match(/^\[data-([a-z0-9-]+)(?:="([^"]*)")?\]$/i);
        if (dataMatch) {
            const attr = 'data-' + dataMatch[1];
            if (!Object.prototype.hasOwnProperty.call(this.attributes, attr)) return false;
            return dataMatch[2] == null || String(this.attributes[attr]) === dataMatch[2];
        }
        return this.tagName === simple.toUpperCase();
    }

    querySelectorAll(selector) {
        const selectors = String(selector).split(',').map(value => value.trim()).filter(Boolean);
        const result = [];
        const visit = node => {
            node.children.forEach(child => {
                if (selectors.some(item => child.matches(item))) result.push(child);
                visit(child);
            });
        };
        visit(this);
        return result;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }
}

function escapeHTML(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function element(tagName, options) {
    return new FakeElement(tagName, options);
}

function strong(text) {
    return element('strong', { text });
}

function noteBox(kind, sourceId, title, body = 'Содержимое карточки') {
    return element('div', {
        id: sourceId,
        className: `${kind}-box`,
        attributes: {
            id: sourceId,
            class: `${kind}-box`,
            'data-kc-id': sourceId,
            'data-block-id': sourceId,
            'data-note-block': sourceId
        },
        children: [strong(title), element('span', { text: ` — ${body}` })]
    });
}

function topicFixture(id, boxes, title = 'Механика') {
    return element('article', {
        id,
        className: 'topic',
        attributes: { id, class: 'topic' },
        children: [element('h2', { className: 'topic-title', attributes: { class: 'topic-title' }, text: title }), ...boxes]
    });
}

function fakeDocument(topics = []) {
    const byId = new Map();
    const index = node => {
        if (node.id) byId.set(node.id, node);
        node.children.forEach(index);
    };
    topics.forEach(index);
    return {
        readyState: 'loading',
        addEventListener: () => {},
        querySelectorAll: () => [],
        getElementById: id => byId.get(id) || null,
        createElement: tagName => element(tagName)
    };
}

function loadScheduler(options = {}) {
    const pathname = options.pathname || '/test.html';
    const initialStore = options.initialStore || {};
    const writes = [];
    const events = [];
    const window = {
        safeStorageGet: () => JSON.stringify(initialStore),
        safeStorageSet: (key, value) => {
            writes.push({ key, value });
            return options.storageResult !== false;
        },
        addEventListener: () => {},
        dispatchEvent: event => events.push(event),
        KC: {}
    };
    const sandbox = {
        window,
        location: { pathname },
        document: options.document || fakeDocument(),
        CustomEvent: function CustomEvent(type, init) {
            this.type = type;
            this.detail = init && init.detail;
        },
        console,
        Date,
        Math,
        JSON,
        Map,
        Set,
        Object,
        Array,
        Number,
        String
    };
    const context = vm.createContext(sandbox);
    if (options.withFsrs) {
        vm.runInContext(fsrsSource, context, { filename: 'vendor/ts-fsrs.umd.js' });
        window.FSRS = sandbox.FSRS;
    }
    vm.runInContext(source, context, { filename: 'knowledge-check.js' });
    return { scheduler: window.__kcFSRS, window, writes, events };
}

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function requireFunction(object, name) {
    assert.equal(typeof object[name], 'function', `window.__kcFSRS.${name} должен быть экспортирован`);
    return object[name];
}

const now = Date.UTC(2026, 8, 2, 12, 0, 0);
const { scheduler } = loadScheduler();

// Все смысловые блоки доступны на обычной странице: проверка знаний не требует
// специальной разметки карточек внутри конспекта.
const expectedKinds = [
    'definition',
    'formula',
    'derivation',
    'remark',
    'theorem',
    'lemma',
    'statement',
    'corollary',
    'properties',
    'proof',
    'experiment',
    'example'
];
assert.deepEqual(
    Array.from(scheduler.studyProfile().types, type => type.kind),
    expectedKinds
);

// Карточки извлекаются прямо из существующих блоков и могут быть отфильтрованы
// по типу до построения очереди.
const allBoxes = expectedKinds.map((kind, index) => noteBox(kind, `source-${kind}`, `Термин ${index + 1}`));
const allKindsTopic = topicFixture('all-kinds', allBoxes);
const allKindsScheduler = loadScheduler({ document: fakeDocument([allKindsTopic]) }).scheduler;
const extractedAll = plain(allKindsScheduler.extractCards(['all-kinds']));
assert.deepEqual(new Set(extractedAll.map(card => card.kind)), new Set(expectedKinds));
const extractedSelected = plain(allKindsScheduler.extractCards(['all-kinds'], ['definition', 'formula', 'proof']));
assert.deepEqual(new Set(extractedSelected.map(card => card.kind)), new Set(['definition', 'formula', 'proof']));
assert.equal(extractedSelected.length, 3);

const unannotatedDefinition = element('div', {
    className: 'definition-box',
    attributes: { class: 'definition-box' },
    children: [
        strong('Импульс'),
        element('span', { text: ' — векторная величина, равная произведению массы тела на его скорость.' })
    ]
});
const unannotatedTopic = topicFixture('plain-existing-notes', [unannotatedDefinition]);
const [unannotatedCard] = plain(loadScheduler({ document: fakeDocument([unannotatedTopic]) }).scheduler
    .extractCards(['plain-existing-notes']));
assert.ok(unannotatedCard, 'обычный существующий блок без data-атрибутов должен извлекаться');
assert.equal(unannotatedCard.kind, 'definition');
assert.equal(unannotatedCard.term, 'Импульс');
assert.ok(unannotatedCard.id, 'для обычного блока должен вычисляться воспроизводимый ID');

// Заголовок типа «Определение» не может стать вопросом «дайте определение
// Определению». Если внутри блока есть настоящий выделенный термин, берём его.
const genericDefinition = element('div', {
    id: 'inertial-system',
    className: 'definition-box',
    attributes: {
        id: 'inertial-system',
        class: 'definition-box',
        'data-kc-id': 'inertial-system',
        'data-block-id': 'inertial-system'
    },
    children: [
        strong('Определение'),
        element('span', { text: ': ' }),
        strong('Инерциальная система отсчёта'),
        element('span', { text: ' — система отсчёта, в которой выполняется первый закон Ньютона.' })
    ]
});
const genericTopic = topicFixture('generic-title', [genericDefinition]);
const genericScheduler = loadScheduler({ document: fakeDocument([genericTopic]) }).scheduler;
const [genericCard] = plain(genericScheduler.extractCards(['generic-title']));
assert.ok(genericCard, 'блок с общим заголовком всё равно должен давать карточку');
assert.notEqual(genericCard.term.trim().toLocaleLowerCase('ru-RU'), 'определение');
assert.match(genericCard.term, /инерциальн/i);

// Исправление заголовка карточки не должно обнулить прогресс, который старая
// версия сохраняла под буквальным strong «Определение».
const legacyGenericStore = {
    'generic-title::0::Определение': {
        v: 2,
        phase: 'review',
        stability: 7,
        difficulty: 5,
        last: now - 8 * DAY,
        due: now - DAY,
        reps: 6,
        lapses: 1
    }
};
const legacyGenericScheduler = loadScheduler({
    initialStore: legacyGenericStore,
    document: fakeDocument([genericTopic.cloneNode(true)])
}).scheduler;
const [migratedGenericCard] = legacyGenericScheduler.extractCards(['generic-title']);
const migratedGenericPlan = plain(legacyGenericScheduler.buildRecommendation([migratedGenericCard], now));
assert.equal(migratedGenericPlan.queue.length, 1);
assert.notEqual(migratedGenericPlan.queue[0].type, 'new',
    'старый прогресс generic-definition должен мигрировать на стабильный ID');

// Идентификатор опирается на постоянный sourceId, а не на индекс блока, его
// положение или изменяемую формулировку.
const stableCardId = requireFunction(scheduler, 'stableCardId');
const stableBefore = stableCardId({
    topicId: 'mechanics',
    kind: 'definition',
    sourceId: 'newton-first-law',
    position: 1,
    term: 'Первый закон Ньютона',
    answerText: 'Старая редакция определения'
});
const stableAfter = stableCardId({
    topicId: 'mechanics',
    kind: 'definition',
    sourceId: 'newton-first-law',
    position: 99,
    term: 'I закон Ньютона',
    answerText: 'Исправленная редакция определения'
});
assert.equal(stableAfter, stableBefore);
assert.notEqual(
    stableCardId({ topicId: 'mechanics', kind: 'definition', sourceId: 'newton-second-law', term: 'Первый закон Ньютона' }),
    stableBefore
);

// Перестановка блоков в самом конспекте также не меняет извлечённые ID.
const reorderedA = topicFixture('reordered', [
    noteBox('definition', 'law-one', 'Первый закон'),
    noteBox('definition', 'law-two', 'Второй закон')
]);
const idsBefore = loadScheduler({ document: fakeDocument([reorderedA]) }).scheduler
    .extractCards(['reordered'])
    .reduce((result, card) => ({ ...result, [card.term]: card.id }), {});
const reorderedB = topicFixture('reordered', [
    noteBox('definition', 'law-two', 'Второй закон'),
    noteBox('definition', 'law-one', 'Первый закон')
]);
const idsAfter = loadScheduler({ document: fakeDocument([reorderedB]) }).scheduler
    .extractCards(['reordered'])
    .reduce((result, card) => ({ ...result, [card.term]: card.id }), {});
assert.deepEqual(plain(idsAfter), plain(idsBefore));

function plainDefinition(term, body) {
    return element('div', {
        className: 'definition-box',
        attributes: { class: 'definition-box' },
        children: [strong(term), element('span', { text: ` — ${body}` })]
    });
}

const fallbackOrderA = topicFixture('fallback-order', [
    plainDefinition('Сила', 'мера взаимодействия тел'),
    plainDefinition('Масса', 'мера инертности тела')
]);
const fallbackIdsBefore = loadScheduler({ document: fakeDocument([fallbackOrderA]) }).scheduler
    .extractCards(['fallback-order'])
    .reduce((result, card) => ({ ...result, [card.term]: card.id }), {});
const fallbackOrderB = topicFixture('fallback-order', [
    plainDefinition('Масса', 'мера инертности тела'),
    plainDefinition('Сила', 'мера взаимодействия тел')
]);
const fallbackIdsAfter = loadScheduler({ document: fakeDocument([fallbackOrderB]) }).scheduler
    .extractCards(['fallback-order'])
    .reduce((result, card) => ({ ...result, [card.term]: card.id }), {});
assert.deepEqual(plain(fallbackIdsAfter), plain(fallbackIdsBefore));

// Сохранённые подтверждения не теряются при нормализации состояния.
const pendingState = scheduler.normalizeState({
    v: 3,
    phase: 'relearning',
    stability: 8,
    difficulty: 6,
    due: now + 60000,
    last: now,
    reps: 11,
    lapses: 2,
    pendingConfirmations: 2,
    reviewEvents: [{ id: 'event-1', grade: 1, at: now }]
});
assert.equal(pendingState.pendingConfirmations, 2);
assert.deepEqual(plain(pendingState.reviewEvents), [{ id: 'event-1', grade: 1, at: now }]);

// По умолчанию и в режиме all дневного лимита нет. Числовой размер ограничивает
// только текущую удобную сессию, не удаляя и не перенося остальные карточки.
const manyCards = Array.from({ length: 60 }, (_, index) => ({
    id: `new-${index}`,
    topicId: `topic-${index % 4}`,
    kind: index % 2 ? 'definition' : 'formula'
}));
const unlimited = plain(scheduler.buildRecommendation(manyCards, now));
assert.equal(unlimited.queue.length, 60);
assert.equal(unlimited.deferred, 0);
const explicitAll = plain(scheduler.buildRecommendation(manyCards, now, { limit: 'all' }));
assert.equal(explicitAll.queue.length, 60);
assert.equal(explicitAll.deferred, 0);
const shortSession = plain(scheduler.buildRecommendation(manyCards, now, { limit: 12 }));
assert.equal(shortSession.queue.length, 12);
assert.equal(shortSession.deferred, 48);
assert.equal(shortSession.dueTotal + shortSession.newTotal, 60);

// Фильтр типа действует и на рекомендательную очередь, даже если вызывающая
// сторона передала полный набор карточек.
const formulasOnly = plain(scheduler.buildRecommendation(manyCards, now, { limit: 'all', kinds: ['formula'] }));
assert.equal(formulasOnly.queue.length, 30);
assert.ok(formulasOnly.queue.every(item => item.card.kind === 'formula'));

// Базовые свойства четырёх оценок проверяются по результатам планировщика.
const reviewState = {
    v: 3,
    phase: 'review',
    stability: 10,
    difficulty: 5,
    last: now - 10 * DAY,
    due: now,
    reps: 8,
    lapses: 1,
    pendingConfirmations: 0,
    reviewEvents: []
};
const projections = [1, 2, 3, 4].map(grade => plain(scheduler.project(reviewState, grade, now)));
assert.ok(projections.every((result, index) => result.lastGrade === index + 1));
assert.ok(projections.every(result => result.reps === reviewState.reps + 1));
assert.ok(projections.every((result, index) => {
    const events = result.reviewEvents || [];
    return events.length === 1 && events[0].grade === index + 1 && events[0].at === now;
}), 'каждая оценка должна давать сериализуемое событие повторения');
assert.equal(projections[0].lapses, reviewState.lapses + 1);
assert.ok(projections.slice(1).every(result => result.lapses === reviewState.lapses));
assert.equal(projections[0].phase, 'relearning');
assert.ok(projections[1].intervalDays < projections[2].intervalDays);
assert.ok(projections[2].intervalDays < projections[3].intervalDays);

// Основной production-путь с локально поставляемой библиотекой FSRS также
// выполняется, а не остаётся непроверенной веткой за fallback-планировщиком.
const officialFsrs = loadScheduler({ withFsrs: true }).scheduler;
const fsrsProjections = [1, 2, 3, 4].map(grade => plain(officialFsrs.project(reviewState, grade, now)));
assert.ok(fsrsProjections.every(result => result.schedulerVersion === 'fsrs-6@5.4.2'));
assert.ok(fsrsProjections.every(result => Number.isFinite(result.due) && result.due > now));
assert.ok(fsrsProjections.every(result => result.reviewEvents.length === 1));
assert.equal(fsrsProjections[0].phase, 'relearning');
assert.ok(fsrsProjections[0].stability < reviewState.stability);
assert.ok(fsrsProjections[2].due < fsrsProjections[3].due);

// Каждая из четырёх оценок действительно записывается в хранилище и отправляет
// событие синхронизации. Проверяем наблюдаемое поведение, а не текст реализации.
const persistenceHarness = loadScheduler();
const persistState = requireFunction(persistenceHarness.scheduler, 'persistState');
projections.forEach((projection, index) => {
    persistState(`graded-${index + 1}`, projection, { now: now + index + 1 });
});
assert.equal(persistenceHarness.writes.length, 4);
assert.equal(persistenceHarness.events.length, 4);
const latestWrite = persistenceHarness.writes.at(-1);
assert.equal(latestWrite.key, 'kc_fsrs_/test.html');
const persistedStore = JSON.parse(latestWrite.value);
for (let grade = 1; grade <= 4; grade++) {
    assert.equal(persistedStore[`graded-${grade}`].lastGrade, grade);
}
assert.equal(persistedStore.__meta.schema, 3);
persistenceHarness.events.forEach(event => {
    assert.equal(event.type, 'kc-store-changed');
    assert.equal(event.detail.key, 'kc_fsrs_/test.html');
    assert.equal(event.detail.persisted, true);
    assert.ok(event.detail.store && event.detail.updatedAt);
});
const failedPersistence = loadScheduler({ storageResult: false });
requireFunction(failedPersistence.scheduler, 'persistState')('failed-card', projections[2], { now });
assert.equal(failedPersistence.writes.length, 1);
assert.equal(failedPersistence.events.length, 1);
assert.equal(failedPersistence.events[0].detail.persisted, false);
const reloadedScheduler = loadScheduler({ initialStore: persistedStore }).scheduler;
for (let grade = 1; grade <= 4; grade++) {
    assert.equal(reloadedScheduler.normalizeState(persistedStore[`graded-${grade}`]).lastGrade, grade);
}

// Внутрисессионные подтверждения сериализуются и не превращаются в новые
// долговременные повторения. Один промах создаёт только одно изменение
// long-term stability, а быстрые подтверждения завершают доучивание.
const sessionTransition = requireFunction(scheduler, 'sessionTransition');
const serializeSession = requireFunction(scheduler, 'serializeSession');
const restoreSession = requireFunction(scheduler, 'restoreSession');
const undoSession = requireFunction(scheduler, 'undoSession');
const sessionCard = {
    id: 'kc:mechanics:definition:newton-first-law',
    topicId: 'mechanics',
    kind: 'definition',
    term: 'Первый закон Ньютона',
    backHTML: '<strong>Первый закон Ньютона</strong> — ...'
};
const initialSession = {
    queue: [{ card: sessionCard, type: 'review' }],
    selectedTopicIds: ['mechanics'],
    selectedKinds: ['definition'],
    limit: 'all',
    startedAt: now,
    reviewed: 0,
    again: 0,
    recalled: 0,
    planned: 1,
    cardStats: {},
    mastered: {},
    states: { [sessionCard.id]: reviewState },
    undoStack: []
};

const missed = sessionTransition(initialSession, initialSession.queue[0], 1, now);
assert.equal(initialSession.reviewed, 0, 'чистый переход не должен мутировать исходную сессию');
assert.equal(initialSession.states[sessionCard.id].pendingConfirmations, 0);
assert.equal(missed.state.pendingConfirmations, 2);
assert.equal(missed.event.grade, 1);
assert.ok(missed.state.stability < reviewState.stability);
const stabilityAfterMiss = missed.state.stability;

let hardLoopSession = restoreSession(serializeSession(missed.session), [sessionCard]);
let hardLoopState = missed.state;
for (let attempt = 0; attempt < 20; attempt++) {
    const repeatedItem = hardLoopSession.queue.find(item => item.card.id === sessionCard.id);
    const repeated = sessionTransition(hardLoopSession, repeatedItem, 2, now + (attempt + 1) * 30000);
    hardLoopSession = repeated.session;
    hardLoopState = repeated.state;
}
assert.equal(hardLoopState.stability, stabilityAfterMiss);
assert.ok(hardLoopState.pendingConfirmations > 0);

const firstConfirmationItem = missed.session.queue.find(item => item.card.id === sessionCard.id);
assert.ok(firstConfirmationItem, 'ошибочная карточка должна вернуться в очередь');
const firstConfirmation = sessionTransition(missed.session, firstConfirmationItem, 3, now + 60000);
assert.equal(firstConfirmation.state.pendingConfirmations, 1);
assert.equal(firstConfirmation.state.stability, stabilityAfterMiss);
const secondConfirmationItem = firstConfirmation.session.queue.find(item => item.card.id === sessionCard.id);
const secondConfirmation = sessionTransition(firstConfirmation.session, secondConfirmationItem, 4, now + 2 * 60000);
assert.equal(secondConfirmation.state.pendingConfirmations, 0);
assert.equal(secondConfirmation.state.stability, stabilityAfterMiss);

const serialized = serializeSession(firstConfirmation.session);
assert.equal(typeof serialized, 'string');
assert.doesNotThrow(() => JSON.parse(serialized));
const restored = restoreSession(serialized, [sessionCard]);
assert.ok(restored, 'корректный снимок сессии должен восстанавливаться');
assert.deepEqual(plain(restored.selectedTopicIds), ['mechanics']);
assert.deepEqual(plain(restored.selectedKinds), ['definition']);
assert.equal(restored.states[sessionCard.id].pendingConfirmations, 1);
assert.ok(restored.queue.some(item => item.card.id === sessionCard.id));
assert.deepEqual(plain(restoreSession(serializeSession(restored), [sessionCard])), plain(restored));
assert.doesNotThrow(() => restoreSession('{повреждённый json', [sessionCard]));
assert.equal(restoreSession('{повреждённый json', [sessionCard]), null);

// Undo возвращает карточку, расписание и счётчики к состоянию до последнего
// ответа. При этом причинная история получает компенсирующее событие: иначе
// уже отправленная в облако оценка воскресла бы после следующего merge.
const undone = undoSession(firstConfirmation.session);
assert.ok(undone && undone.session, 'undoSession должен вернуть восстановленную сессию');
assert.equal(undone.state.pendingConfirmations, 2);
assert.equal(undone.state.stability, stabilityAfterMiss);
assert.equal(undone.event.mode, 'undo');
assert.deepEqual(plain(undone.event.undoes), [firstConfirmation.event.id]);
assert.equal(undone.state.reviewEvents.length, firstConfirmation.state.reviewEvents.length + 1);
assert.ok(undone.state.reviewEvents.some(event => event.id === firstConfirmation.event.id));
assert.ok(undone.state.reviewEvents.some(event => event.id === undone.event.id));
assert.equal(undone.session.reviewed, missed.session.reviewed);
assert.doesNotThrow(() => JSON.parse(serializeSession(undone.session)));

// Отмена первой оценки делает карточку снова новой, но не удаляет причинную
// историю. Следующая оценка обязана быть потомком tombstone, чтобы облачная
// копия отменённой попытки больше не могла её вытеснить.
const freshCard = { ...sessionCard, id: 'kc:mechanics:definition:fresh-card', term: 'Новая карточка' };
const freshSession = {
    queue: [{ card: freshCard, type: 'new' }],
    selectedTopicIds: ['mechanics'],
    selectedKinds: ['definition'],
    limit: 'all',
    startedAt: now,
    updatedAt: now,
    reviewed: 0,
    again: 0,
    recalled: 0,
    planned: 1,
    cardStats: {},
    mastered: {},
    states: { [freshCard.id]: null },
    undoStack: []
};
const firstFreshGrade = sessionTransition(freshSession, freshSession.queue[0], 3, now);
const cancelledFreshGrade = undoSession(firstFreshGrade.session, [freshCard]);
assert.equal(cancelledFreshGrade.state.fresh, true);
assert.equal(scheduler.normalizeState(cancelledFreshGrade.state), null);
assert.equal(cancelledFreshGrade.state.reviewEvents.length, 2);
const regradedFresh = sessionTransition(
    cancelledFreshGrade.session,
    cancelledFreshGrade.session.queue[0],
    4,
    now + 2 * 60000
);
assert.equal(regradedFresh.state.fresh, false);
assert.equal(regradedFresh.state.lastGrade, 4);
assert.equal(regradedFresh.state.reviewEvents.length, 3);
assert.ok(regradedFresh.state.reviewEvents.some(event => event.mode === 'undo'));

console.log('knowledge-check v3 contract: all tests passed');
