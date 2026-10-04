'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const BuildNotes = require('../tools/build-notes.js');

const root = path.join(__dirname, '..');
const verificationRoot = process.env.ALMANION_TEST_SITE || root;
const subjects = JSON.parse(fs.readFileSync(path.join(root, 'content', 'subjects.json'), 'utf8'));
const migrated = new Set(['physics', 'chemistry', 'math', 'geometry']);

function hrefTargets(html) {
    return Array.from(html.matchAll(/\bhref=["']#([^"']+)["']/g), match => match[1]);
}

function ignoreGeneratedIndentation(html) {
    return String(html).replace(/\r/g, '').split('\n').map(line => line.trimStart()).join('\n').trim();
}

function fileSnapshot(directory) {
    return Object.fromEntries(fs.readdirSync(directory).sort().map(name => {
        const content = fs.readFileSync(path.join(directory, name));
        return [name, crypto.createHash('sha256').update(content).digest('hex')];
    }));
}

for (const subject of subjects.filter(item => migrated.has(item.id))) {
    const sections = BuildNotes.loadSections(root, subject);
    assert.ok(sections.length > 0, `${subject.id} must have canonical sections`);
    const page = fs.readFileSync(path.join(verificationRoot, subject.page), 'utf8');

    for (const section of sections) {
        assert.equal(section.sourceFormat, BuildNotes.HTML_FRAGMENT_FORMAT);
        BuildNotes.assertSafeHtmlFragment(section.navHtml, `${subject.id}/${section.id} navigation`);
        BuildNotes.assertSafeHtmlFragment(section.contentHtml, `${subject.id}/${section.id} content`);
        const normalizedPage = ignoreGeneratedIndentation(page);
        assert.ok(normalizedPage.includes(ignoreGeneratedIndentation(section.navHtml)),
            `${subject.page} must be generated from ${section.id} navigation`);
        assert.ok(normalizedPage.includes(ignoreGeneratedIndentation(section.contentHtml)),
            `${subject.page} must be generated from ${section.id} content`);
        for (const target of hrefTargets(section.navHtml)) {
            assert.match(section.contentHtml, new RegExp(`\\bid=["']${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`),
                `${subject.id}/${section.id} navigation target #${target} must exist in its content`);
        }
    }
}

assert.throws(() => BuildNotes.assertSafeHtmlFragment('<script>alert(1)</script>', 'fixture'), /небезопасная разметка/i);
assert.throws(() => BuildNotes.assertSafeHtmlFragment('<button onclick="alert(1)">x</button>', 'fixture'), /небезопасная разметка/i);
assert.throws(() => BuildNotes.assertSafeHtmlFragment('<a href="javascript:alert(1)">x</a>', 'fixture'), /небезопасная разметка/i);

const output = fs.mkdtempSync(path.join(os.tmpdir(), 'almanion-canonical-notes-'));
try {
    BuildNotes.build({ root, output });
    const first = fileSnapshot(output);
    BuildNotes.build({ root, output });
    assert.deepEqual(fileSnapshot(output), first, 'building canonical notes twice must be byte-for-byte stable');
    for (const subject of subjects) {
        const source = fs.readFileSync(path.join(output, subject.page), 'utf8');
        const deployed = fs.readFileSync(path.join(verificationRoot, subject.page), 'utf8');
        // Asset cache versions are rewritten by the site builder. Canonical
        // navigation and content must still match exactly in the built artifact.
        const canonicalRegions = html => ['NAV', 'CONTENT'].map(kind => {
            const start = `<!-- NOTE_CONSTRUCTOR_${kind}_START -->`;
            const end = `<!-- NOTE_CONSTRUCTOR_${kind}_END -->`;
            assert.ok(html.includes(start) && html.includes(end));
            return html.slice(html.indexOf(start), html.indexOf(end));
        }).join('\n');
        assert.equal(
            verificationRoot === root ? source : canonicalRegions(source),
            verificationRoot === root ? deployed : canonicalRegions(deployed),
            `${subject.page} must be in sync with its canonical source`
        );
    }
} finally {
    fs.rmSync(output, { recursive: true, force: true });
}

console.log('canonical notes: all assertions passed');
