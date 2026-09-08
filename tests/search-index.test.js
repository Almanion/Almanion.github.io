const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseEntries, build } = require('../performance/build-search-index');

const root = path.join(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'search.js'), 'utf8');
assert.match(client, /loadBuiltIndex\(\)/, 'the browser must prefer the generated index');
assert.match(client, /Promise\.allSettled\(PAGES\.map\(loadPage\)\)/, 'legacy pages must remain a safe fallback');
const parsed = parseEntries(`
    <article class="topic" id="law">
        <h2 class="topic-title">Закон Ньютона</h2>
        <div class="definition-box"><strong>Сила</strong> — мера взаимодействия.</div>
        <button class="bookmark-btn">Не индексировать</button>
        <span class="katex-html">duplicate formula</span>
    </article>`, { path: 'physics.html', label: 'Физика' });

assert.strictEqual(parsed.length, 1);
assert.strictEqual(parsed[0].id, 'law');
assert.strictEqual(parsed[0].title, 'Закон Ньютона');
assert.match(parsed[0].text, /мера взаимодействия/);
assert.doesNotMatch(parsed[0].text, /Не индексировать|duplicate formula/);

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'almanion-search-'));
try {
    const result = build({ root, site: root, output: path.join(temporary, 'search-index.json') });
    const document = JSON.parse(fs.readFileSync(result.output, 'utf8'));
    assert.strictEqual(document.schemaVersion, 1);
    assert.match(document.version, /^[a-f0-9]{16}$/);
    assert.ok(document.entries.length > 50, 'production notes must produce a useful index');
    assert.ok(document.entries.every(entry => entry.page && entry.subject && entry.id && entry.title && entry.text));
} finally {
    fs.rmSync(temporary, { recursive: true, force: true });
}

console.log('build-time search index: all tests passed');
