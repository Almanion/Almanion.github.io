#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const NoteModel = require('../constructor/model.js');
const NoteRenderer = require('../constructor/renderer.js');

const MARKERS = {
    navStart: '<!-- NOTE_CONSTRUCTOR_NAV_START -->',
    navEnd: '<!-- NOTE_CONSTRUCTOR_NAV_END -->',
    contentStart: '<!-- NOTE_CONSTRUCTOR_CONTENT_START -->',
    contentEnd: '<!-- NOTE_CONSTRUCTOR_CONTENT_END -->'
};

const HTML_FRAGMENT_FORMAT = 'html-fragment-v1';

function parseArgs(argv) {
    const result = { root: process.cwd(), output: process.cwd() };
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--root' && argv[i + 1]) result.root = path.resolve(argv[++i]);
        else if (argv[i] === '--output' && argv[i + 1]) result.output = path.resolve(argv[++i]);
    }
    return result;
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function replaceMarked(source, start, end, replacement, file) {
    const startIndex = source.indexOf(start);
    const endIndex = source.indexOf(end);
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
        throw new Error('Не найдены маркеры конструктора в ' + file);
    }
    const lineStart = source.lastIndexOf('\n', startIndex) + 1;
    const indent = (source.slice(lineStart, startIndex).match(/^\s*/) || [''])[0];
    const rendered = replacement.trim()
        ? replacement.trim().split('\n').map(line => line ? indent + line : '').join('\n') + '\n'
        : '';
    return source.slice(0, startIndex) + start + '\n' + rendered + indent + end + source.slice(endIndex + end.length);
}

function assertSafeSectionId(id) {
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(String(id || ''))) {
        throw new Error('Недопустимый id раздела: ' + id);
    }
}

function assertSafeHtmlFragment(value, field, sectionPath) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(sectionPath + ': поле ' + field + ' должно содержать HTML');
    }
    const forbidden = [
        /<\s*(?:script|iframe|object|embed|base|meta|link)\b/i,
        /\son[a-z]+\s*=/i,
        /(?:href|src)\s*=\s*["']?\s*javascript:/i,
        /(?:href|src)\s*=\s*["']?\s*data\s*:\s*text\/html/i,
        /<!--\s*NOTE_CONSTRUCTOR_/i
    ];
    if (forbidden.some(pattern => pattern.test(value))) {
        throw new Error(sectionPath + ': небезопасная разметка в поле ' + field);
    }
}

function normalizeHtmlFragmentSection(raw, subject, id, sectionPath) {
    const errors = [];
    if (!raw || raw.sourceFormat !== HTML_FRAGMENT_FORMAT) errors.push('неизвестный sourceFormat');
    if (raw.id !== id) errors.push('id внутри файла не совпадает с именем файла');
    if (raw.subject !== subject.id) errors.push('предмет внутри файла не совпадает с папкой');
    if (typeof raw.title !== 'string' || !raw.title.trim()) errors.push('не задан title');
    if (errors.length) throw new Error(sectionPath + ': ' + errors.join('; '));

    assertSafeHtmlFragment(raw.navHtml, 'navHtml', sectionPath);
    assertSafeHtmlFragment(raw.contentHtml, 'contentHtml', sectionPath);
    if (!/<section\b[^>]*class=["'][^"']*\bcontent-section\b/i.test(raw.contentHtml)) {
        throw new Error(sectionPath + ': contentHtml должен содержать корневой .content-section');
    }

    return {
        schemaVersion: Number(raw.schemaVersion) || 1,
        sourceFormat: HTML_FRAGMENT_FORMAT,
        id,
        subject: subject.id,
        title: raw.title.trim(),
        navHtml: raw.navHtml.trim(),
        contentHtml: raw.contentHtml.trim(),
        order: Number(raw.order) || 0
    };
}

function loadSections(root, subject) {
    const manifestPath = path.join(root, 'content', subject.id, 'manifest.json');
    const manifest = readJson(manifestPath);
    if (manifest.subject !== subject.id || !Array.isArray(manifest.sections)) {
        throw new Error('Некорректный манифест: ' + manifestPath);
    }
    const seen = new Set();
    return manifest.sections.map(entry => {
        const id = typeof entry === 'string' ? entry : entry && entry.id;
        assertSafeSectionId(id);
        if (seen.has(id)) throw new Error('Раздел ' + id + ' повторяется в ' + manifestPath);
        seen.add(id);
        const sectionPath = path.join(root, 'content', subject.id, 'sections', id + '.json');
        const raw = readJson(sectionPath);
        if (raw && raw.sourceFormat === HTML_FRAGMENT_FORMAT) {
            return normalizeHtmlFragmentSection(raw, subject, id, sectionPath);
        }
        const section = NoteModel.normalizeSection(raw, subject.id);
        const errors = NoteModel.validateSection(section);
        if (section.id !== id) errors.push('id внутри файла не совпадает с именем файла');
        if (section.subject !== subject.id) errors.push('предмет внутри файла не совпадает с папкой');
        if (errors.length) throw new Error(sectionPath + ': ' + errors.join('; '));
        return section;
    });
}

function renderSectionNav(section) {
    return section.sourceFormat === HTML_FRAGMENT_FORMAT
        ? section.navHtml
        : NoteRenderer.renderNavItem(section);
}

function renderSectionContent(section) {
    return section.sourceFormat === HTML_FRAGMENT_FORMAT
        ? section.contentHtml
        : NoteRenderer.renderSection(section);
}

function buildSubject(root, output, subject) {
    const sourcePath = path.join(root, subject.page);
    const targetPath = path.join(output, subject.page);
    const sections = loadSections(root, subject);
    const nav = sections.map(renderSectionNav).join('\n');
    const content = sections.length
        ? sections.map(renderSectionContent).join('\n\n')
        : renderEmptySubject(subject);
    let html = fs.readFileSync(sourcePath, 'utf8');
    html = replaceMarked(html, MARKERS.navStart, MARKERS.navEnd, nav, subject.page);
    html = replaceMarked(html, MARKERS.contentStart, MARKERS.contentEnd, content, subject.page);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, html);
    return sections.length;
}

function renderEmptySubject(subject) {
    if (!subject.emptyMessage) return '';
    return [
        '<section class="content-section notes-empty-state" aria-label="Материалы пока не добавлены">',
        '    <div class="notes-empty-icon" aria-hidden="true">',
        '        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
        '    </div>',
        '    <h2>Материалы готовятся</h2>',
        '    <p>' + NoteRenderer.escapeHtml(subject.emptyMessage) + '</p>',
        '</section>'
    ].join('\n');
}

function build(options) {
    const subjects = readJson(path.join(options.root, 'content', 'subjects.json'));
    let total = 0;
    subjects.forEach(subject => { total += buildSubject(options.root, options.output, subject); });
    return { subjects: subjects.length, sections: total };
}

if (require.main === module) {
    try {
        const result = build(parseArgs(process.argv.slice(2)));
        console.log('Конспекты собраны: ' + result.subjects + ' предметов, ' + result.sections + ' новых разделов.');
    } catch (error) {
        console.error(error && error.stack || error);
        process.exitCode = 1;
    }
}

module.exports = {
    MARKERS,
    HTML_FRAGMENT_FORMAT,
    parseArgs,
    replaceMarked,
    assertSafeHtmlFragment,
    normalizeHtmlFragmentSection,
    loadSections,
    renderEmptySubject,
    buildSubject,
    build
};
