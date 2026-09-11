const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class FakeNode {
    constructor(name = '') {
        this.name = name;
        this.dataset = {};
        this.children = [];
        this.parentNode = null;
        this.listeners = new Map();
    }

    get childNodes() {
        return this.children;
    }

    get firstChild() {
        return this.children[0] || null;
    }

    hasChildNodes() {
        return this.children.length > 0;
    }

    appendChild(node) {
        if (node.isFragment) {
            while (node.firstChild) this.appendChild(node.firstChild);
            return node;
        }
        if (node.parentNode) {
            const index = node.parentNode.children.indexOf(node);
            if (index >= 0) node.parentNode.children.splice(index, 1);
        }
        node.parentNode = this;
        this.children.push(node);
        return node;
    }

    replaceChildren(...nodes) {
        this.children.forEach(node => { node.parentNode = null; });
        this.children = [];
        nodes.forEach(node => this.appendChild(node));
    }

    remove() {
        if (!this.parentNode) return;
        const index = this.parentNode.children.indexOf(this);
        if (index >= 0) this.parentNode.children.splice(index, 1);
        this.parentNode = null;
    }

    addEventListener(type, listener) {
        this.listeners.set(type, listener);
    }

    querySelectorAll() {
        return [];
    }
}

class FakeFragment extends FakeNode {
    constructor() {
        super('fragment');
        this.isFragment = true;
    }
}

const containers = new Map();
let solvedRefreshes = 0;
const context = vm.createContext({
    console,
    currentGrade: 'grade-9',
    currentFilter: 'all-tasks',
    isAdmin: false,
    document: {
        createDocumentFragment: () => new FakeFragment(),
        createElement: name => new FakeNode(name),
        getElementById: id => containers.get(id) || null,
        querySelectorAll: () => []
    },
    setTimeout,
    clearTimeout,
    isSummerGrade: grade => String(grade).includes('summer'),
    getTasksForCurrentGrade: () => [],
    applyPersonalSolvedMarks: () => { solvedRefreshes += 1; }
});

const renderSource = fs.readFileSync(
    path.join(__dirname, '..', 'matcenter', '50-render.js'),
    'utf8'
);
vm.runInContext(renderSource, context, { filename: 'matcenter/50-render.js' });

const prepareRender = vm.runInContext('prepareMatcenterRender', context);
const container = new FakeNode('tasksContainer');
containers.set('tasksContainer', container);

// Function declarations in a script context are replaceable global bindings.
context.FakeCard = FakeNode;
vm.runInContext('createTaskElement = task => { const card = new FakeCard(task.taskId); card.task = task; return card; };', context);

const tasks = Array.from({ length: 130 }, (_, index) => ({
    taskId: `grade-9:${index + 1}`,
    number: index + 1,
    _endpointIdx: 0
}));
context.tasks = tasks;
vm.runInContext("displayTasks(tasks, 'tasksContainer')", context);
assert.strictEqual(container.children.length, 49, 'first frame should contain 48 cards and the continuation control');
assert.strictEqual(container.children.filter(node => node.name !== 'button').length, 48);

vm.runInContext("renderNextMatcenterBatch(matcenterRenderSessions.get(document.getElementById('tasksContainer')))", context);
assert.strictEqual(container.children.length, 121, 'second frame should add 72 cards and keep one continuation control');

vm.runInContext("renderNextMatcenterBatch(matcenterRenderSessions.get(document.getElementById('tasksContainer')))", context);
assert.strictEqual(container.children.length, 130, 'the final frame should contain every task without a sentinel');
assert.strictEqual(container.dataset.renderComplete, 'true');

const priorSession = vm.runInContext("matcenterRenderSessions.get(document.getElementById('tasksContainer'))", context);
context.currentGrade = 'grade-10';
context.tasks = [{ taskId: 'grade-10:1', number: 1, _endpointIdx: 0 }];
vm.runInContext("displayTasks(tasks, 'tasksContainer')", context);
assert.strictEqual(priorSession.cancelled, true, 'changing section must cancel obsolete rendering work');
assert.strictEqual(container.children.length, 1);
assert.ok(solvedRefreshes >= 3, 'every rendered batch should apply personal solved state');

assert.match(renderSource, /IntersectionObserver/);
assert.match(renderSource, /MATCENTER_INITIAL_RENDER_COUNT = 48/);
assert.doesNotMatch(renderSource, /MATCENTER_RENDER_CACHE_LIMIT/);

console.log('matcenter progressive rendering: all assertions passed');
