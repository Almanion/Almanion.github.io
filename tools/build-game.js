'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const CleanCSS = require('clean-css');
const { minify_sync } = require('terser');
const { bundle: bundlePortable } = require('../game-source/orbital-courier/tools/build.cjs');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'game-source', 'orbital-courier');
const target = path.join(root, 'games', 'orbital-courier');
const pages = Object.freeze({
    home: { directory: '', title: 'Главная' },
    campaign: { directory: 'contracts/', title: 'Контракты' },
    hangar: { directory: 'hangar/', title: 'Ангар' },
    awards: { directory: 'awards/', title: 'Награды' },
    play: { directory: 'flight/', title: 'Полёт' }
});

function sourceHTML() { return fs.readFileSync(path.join(source, 'index.html'), 'utf8'); }
function releaseVersion() { return JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8')).version.split('.').slice(0, 2).join('.'); }
function assetVersion(file) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(source, file))).digest('hex').slice(0, 16); }

// The portable document is deliberately independent of the online page adapter.
function bundle() {
    return bundlePortable(script => minify_sync(script, {
        compress: false,
        mangle: false,
        format: { comments: 'some', quote_style: 3, inline_script: true }
    }).code, style => {
        const result = new CleanCSS({ level: 0, rebase: false }).minify(style);
        if (result.errors.length) throw new Error(result.errors.join('\n'));
        return result.styles;
    });
}

function onlinePage(page) {
    const definition = pages[page];
    if (!definition) throw new Error('Unknown game page: ' + page);
    const prefix = definition.directory ? '../' : './';
    let html = sourceHTML()
        .replace(/<title>[\s\S]*?<\/title>/, '<title>' + definition.title + ' — Орбитальный курьер ' + releaseVersion() + '</title>')
        .replace(/<body\b([^>]*)>/, '<body$1 data-game-navigation="pages" data-game-entry="' + page + '" data-game-base="' + prefix + '" data-page="' + page + '">')
        .replace(/\b(href|src)="(src\/([^"]+))"/g, (_, attribute, file, name) => attribute + '="' + prefix + 'assets/' + name + '?v=' + assetVersion(file) + '"')
        .replace('src="../../images/almanion-wordmark.svg', 'src="' + prefix + '../../images/almanion-wordmark.svg')
        .replace('href="../../index.html"', 'href="' + prefix + '../../index.html"');
    // The compatible hidden screens still have one canonical markup owner.
    html = html.replace(/<section\b[^>]*\bclass="[^"]*\bscreen\b[^"]*"[^>]*>/g, tag => {
        const id = tag.match(/\bid="([^"]+)"/)?.[1];
        tag = tag.replace(/\s+hidden(?:="[^"]*")?/g, '').replace(/\bclass="([^"]*)"/, (_, classes) =>
            'class="' + classes.split(/\s+/).filter(name => name && name !== 'active').concat(id === page ? ['active'] : []).join(' ') + '"');
        return id === page ? tag : tag.slice(0, -1) + ' hidden>';
    });
    html = html.replace(/<button\b([^>]*\bdata-action="nav"[^>]*)>([\s\S]*?)<\/button>/g, (_, attributes, content) => {
        const destination = attributes.match(/\bdata-page="([^"]+)"/)?.[1];
        return !pages[destination] ? '<button' + attributes + '>' + content + '</button>' :
            '<a' + attributes + ' href="' + prefix + pages[destination].directory + '">' + content + '</a>';
    });
    const eclipseLink = '<a class="eclipse-entry" href="' + prefix + 'eclipse/"><span class="eclipse-icon" aria-hidden="true"></span><span><strong>Затмение</strong><small>Операции и экспедиции</small></span><span aria-hidden="true">↗</span></a>';
    html = html.replace('</head>', '<link rel="stylesheet" href="' + prefix + 'assets/eclipse-entry.css?v=' + assetVersion('eclipse/entry.css') + '"></head>')
        .replaceAll('<!-- eclipse-entry -->', eclipseLink);
    return html.replace('<!-- offline-download -->',
        '<a class="home-download" href="' + prefix + 'offline.html" download="Orbital Courier.html">Скачать игру ↓</a>');
}

function onlineFiles() {
    const files = {};
    for (const [page, definition] of Object.entries(pages)) files[definition.directory + 'index.html'] = onlinePage(page);
    for (const match of sourceHTML().matchAll(/\b(?:href|src)="(src\/[^"]+\.(?:css|js))"/g)) {
        files['assets/' + match[1].slice(4)] = fs.readFileSync(path.join(source, match[1]), 'utf8');
    }
    const eclipseAssets = { 'eclipse-expeditions.js': 'expeditions.js', 'eclipse-engine.js': 'engine.js', 'eclipse-battle.js': 'battle.js', 'eclipse-renderer.js': 'renderer.js', 'eclipse-app.js': 'app.js', 'eclipse.css': 'eclipse.css', 'eclipse-entry.css': 'entry.css' };
    for (const [name, file] of Object.entries(eclipseAssets)) files['assets/' + name] = fs.readFileSync(path.join(source, 'eclipse', file), 'utf8');
    files['eclipse/index.html'] = fs.readFileSync(path.join(source, 'eclipse', 'index.html'), 'utf8').replace(/@@([a-z.-]+)@@/g, (_, name) => {
        const content = files['assets/' + name];
        if (!content) throw new Error('Missing Eclipse asset: ' + name);
        return '../assets/' + name + '?v=' + crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    });
    return files;
}

function build() {
    const files = onlineFiles();
    files['offline.html'] = bundle();
    fs.writeFileSync(path.join(source, 'Orbital Courier.html'), files['offline.html'], 'utf8');
    for (const file of ['LICENSE.txt', 'Инструкция.html', 'Экономика.html']) files[file] = fs.readFileSync(path.join(source, file), 'utf8');
    for (const [file, content] of Object.entries(files)) {
        const destination = path.join(target, file);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, content, 'utf8');
    }
    console.log('Prepared five campaign pages, the Eclipse operation, shared assets and portable offline.html');
}

if (require.main === module) build();
module.exports = { bundle, build, pages, onlinePage, onlineFiles };
