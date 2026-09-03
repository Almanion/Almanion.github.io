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
        ? replacement.trim().split('\n').map(line => indent + line).join('\n') + '\n'
        : '';
    return source.slice(0, startIndex) + start + '\n' + rendered + indent + end + source.slice(endIndex + end.length);
}

function assertSafeSectionId(id) {
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(String(id || ''))) {
        throw new Error('Недопустимый id раздела: ' + id);
    }
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
        const section = NoteModel.normalizeSection(readJson(sectionPath), subject.id);
        const errors = NoteModel.validateSection(section);
        if (section.id !== id) errors.push('id внутри файла не совпадает с именем файла');
        if (section.subject !== subject.id) errors.push('предмет внутри файла не совпадает с папкой');
        if (errors.length) throw new Error(sectionPath + ': ' + errors.join('; '));
        return section;
    });
}

function buildSubject(root, output, subject) {
    const sourcePath = path.join(root, subject.page);
    const targetPath = path.join(output, subject.page);
    const sections = loadSections(root, subject);
    const nav = sections.map(NoteRenderer.renderNavItem).join('\n');
    const content = sections.map(NoteRenderer.renderSection).join('\n\n');
    let html = fs.readFileSync(sourcePath, 'utf8');
    html = replaceMarked(html, MARKERS.navStart, MARKERS.navEnd, nav, subject.page);
    html = replaceMarked(html, MARKERS.contentStart, MARKERS.contentEnd, content, subject.page);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, html);
    return sections.length;
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

module.exports = { MARKERS, parseArgs, replaceMarked, loadSections, buildSubject, build };
