'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildSubject } = require('../tools/build-notes');
const root = path.resolve(__dirname, '..');
const subjects = require('../content/subjects.json');
const russian = subjects.find(subject => subject.id === 'russian-ege');

if (process.env.ALMANION_TEST_SITE) {
    const site = process.env.ALMANION_TEST_SITE;
    const packs = JSON.parse(fs.readFileSync(path.join(site, 'offline-library.json'))).subjects;
    const available = subjects.filter(s => require(path.join(root, 'content', s.id, 'manifest.json')).sections.length);
    assert.deepEqual(packs.map(pack => pack.id), available.map(s => s.id));
    const page = fs.readFileSync(path.join(site, russian.page), 'utf8');
    const pack = packs.find(s => s.id === russian.id);
    assert.equal(pack.files.some(file => file.source.includes('/vendor/katex/')), !page.includes('data-no-math'));
}

// The same word-only course can acquire formulas on a later editor publication.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'almanion-lesson-math-'));
try {
    const sections = path.join(temp, 'content', russian.id, 'sections');
    fs.mkdirSync(sections, { recursive: true });
    fs.copyFileSync(path.join(root, russian.page), path.join(temp, russian.page));
    fs.writeFileSync(path.join(sections, '..', 'manifest.json'), JSON.stringify({ subject: russian.id, sections: ['test-lesson'] }));
    for (const text of ['слово', '\\(a=b\\)', 'слово']) {
        const section = { id: 'test-lesson', title: 'Тема', navTitle: 'Тема', subject: russian.id, blocks: [{ id: 'text-block', type: 'text', content: text }] };
        fs.writeFileSync(path.join(sections, 'test-lesson.json'), JSON.stringify(section));
        buildSubject(temp, temp, russian);
        const html = fs.readFileSync(path.join(temp, russian.page), 'utf8');
        assert.equal(html.includes('vendor/katex/katex.min.js'), text !== 'слово');
        assert.equal(html.includes('data-no-math'), text === 'слово');
    }
} finally {
    fs.rmSync(temp, { recursive: true, force: true });
}
