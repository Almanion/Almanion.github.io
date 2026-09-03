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
        getElementById: id => containers.get(id) || null,
        querySelectorAll: () => []
    },
    isSummerGrade: grade => String(grade).includes('summer'),
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

const grade9Tasks = [{ taskId: 'grade-9:1', number: 1, _endpointIdx: 0 }];
const grade10Tasks = [{ taskId: 'grade-10:1', number: 1, _endpointIdx: 0 }];
const grade9Card = new FakeNode('grade-9-card');
const grade10Card = new FakeNode('grade-10-card');

assert.strictEqual(prepareRender(container, grade9Tasks, 'tasksContainer').reused, false);
container.appendChild(grade9Card);
assert.strictEqual(prepareRender(container, grade9Tasks, 'tasksContainer').reused, true);
assert.strictEqual(container.firstChild, grade9Card, 'same section should keep its DOM nodes');

context.currentGrade = 'grade-10';
assert.strictEqual(prepareRender(container, grade10Tasks, 'tasksContainer').reused, false);
container.appendChild(grade10Card);
assert.strictEqual(container.firstChild, grade10Card);

context.currentGrade = 'grade-9';
assert.strictEqual(prepareRender(container, grade9Tasks, 'tasksContainer').reused, true);
assert.strictEqual(container.firstChild, grade9Card, 'returning to a section should restore cached DOM nodes');
assert.ok(solvedRefreshes >= 2, 'restored cards should refresh personal solved state');

console.log('matcenter-render-cache.test.js: all assertions passed');
