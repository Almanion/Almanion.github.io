#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const BuildSite = require('./build-site.js');

const REQUIRED_FILES = [
    '.nojekyll',
    '_build.json',
    'index.html',
    'manifest.json',
    'offline.html',
    'search-index.json',
    'sw.js',
    'sw-manifest.js'
];

function parseArgs(argv) {
    const options = {
        root: path.resolve(__dirname, '..'),
        site: null
    };
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--root' && argv[index + 1]) options.root = path.resolve(argv[++index]);
        else if (argv[index] === '--site' && argv[index + 1]) options.site = path.resolve(argv[++index]);
        else throw new Error(`Unknown or incomplete argument: ${argv[index]}`);
    }
    if (!options.site) options.site = path.join(options.root, '_site');
    return options;
}

function addReference(references, source, kind, value) {
    const normalized = String(value || '').trim().replace(/&amp;/g, '&');
    if (normalized) references.push({ source, kind, value: normalized });
}

function htmlReferences(relative, content) {
    const references = [];
    const markup = String(content || '')
        .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script\s*>)/gi, '$1$2')
        .replace(/(<style\b[^>]*>)[\s\S]*?(<\/style\s*>)/gi, '$1$2');
    const attributes = /\b(href|src|poster|action)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
    let match;
    const tags = markup.match(/<[a-z][^>]*>/gi) || [];
    for (const tag of tags) {
        while ((match = attributes.exec(tag))) {
            addReference(references, relative, match[1].toLowerCase(), match[2] ?? match[3] ?? match[4]);
        }
        attributes.lastIndex = 0;
    }

    const srcsets = /\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
    for (const tag of tags) {
        while ((match = srcsets.exec(tag))) {
            const value = match[1] ?? match[2] ?? match[3] ?? '';
            for (const candidate of value.split(',')) addReference(references, relative, 'srcset', candidate.trim().split(/\s+/)[0]);
        }
        srcsets.lastIndex = 0;
    }
    return references;
}

function cssReferences(relative, content) {
    const references = [];
    const urls = /url\(\s*(["']?)(.*?)\1\s*\)/gis;
    let match;
    while ((match = urls.exec(content))) addReference(references, relative, 'css-url', match[2]);
    return references;
}

function manifestReferences(relative, content) {
    const references = [];
    const manifest = JSON.parse(content);
    const visit = value => {
        if (Array.isArray(value)) return value.forEach(visit);
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
            if ((key === 'src' || key === 'url' || key === 'start_url') && typeof child === 'string') {
                addReference(references, relative, `manifest-${key}`, child);
            }
            visit(child);
        }
    };
    visit(manifest);
    return references;
}

function serviceWorkerReferences(relative, content) {
    const references = [];
    const shell = content.match(/\bconst\s+APP_SHELL\s*=\s*\[([\s\S]*?)\];/);
    const strings = /(["'])(.*?)\1/g;
    let match;
    if (shell) {
        while ((match = strings.exec(shell[1]))) addReference(references, relative, 'app-shell', match[2]);
        return references;
    }
    const imports = /importScripts\(\s*(["'])(.*?)\1\s*\)/g;
    while ((match = imports.exec(content))) addReference(references, relative, 'worker-import', match[2]);
    if (!references.length) throw new Error(`${relative}: neither an app shell nor a generated manifest import was found.`);
    return references;
}

function serviceWorkerManifestReferences(relative, content) {
    const references = [];
    const match = String(content || '').match(/Object\.freeze\((\{[\s\S]*\})\);?\s*$/);
    if (!match) throw new Error(`${relative}: generated service-worker manifest was not recognized.`);
    const manifest = JSON.parse(match[1]);
    if (!manifest || !Array.isArray(manifest.shell) || !manifest.version) {
        throw new Error(`${relative}: generated service-worker manifest is incomplete.`);
    }
    manifest.shell.forEach(value => addReference(references, relative, 'app-shell', value));
    return references;
}

function isExternalOrVirtual(reference) {
    return reference.startsWith('#')
        || reference.startsWith('//')
        || reference.startsWith('data:')
        || reference.startsWith('blob:')
        || reference.startsWith('mailto:')
        || reference.startsWith('tel:')
        || reference.startsWith('javascript:')
        || /^[a-z][a-z0-9+.-]*:/i.test(reference);
}

function resolveLocalReference(source, reference) {
    if (!reference || isExternalOrVirtual(reference)) return null;
    let url;
    try {
        const sourceUrl = `https://almanion.invalid/${source.replace(/^\/+/, '')}`;
        url = new URL(reference, sourceUrl);
    } catch (_error) {
        return { error: `invalid URL: ${reference}` };
    }
    let pathname;
    try {
        pathname = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    } catch (_error) {
        return { error: `invalid URL encoding: ${reference}` };
    }
    if (!pathname || pathname.endsWith('/')) pathname += 'index.html';
    pathname = path.posix.normalize(pathname);
    if (pathname === '..' || pathname.startsWith('../')) return { error: `path escapes the site: ${reference}` };
    return { pathname };
}

function collectReferences(site, files) {
    const references = [];
    for (const relative of files) {
        const extension = path.posix.extname(relative).toLowerCase();
        if (!['.html', '.css', '.json', '.js'].includes(extension)) continue;
        const content = fs.readFileSync(path.join(site, relative), 'utf8');
        if (extension === '.html') references.push(...htmlReferences(relative, content));
        else if (extension === '.css') references.push(...cssReferences(relative, content));
        else if (relative === 'manifest.json') references.push(...manifestReferences(relative, content));
        else if (relative === 'sw.js') references.push(...serviceWorkerReferences(relative, content));
        else if (relative === 'sw-manifest.js') references.push(...serviceWorkerManifestReferences(relative, content));
    }
    return references;
}

function validateMetadata(site) {
    const metadataPath = path.join(site, '_build.json');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    const actual = BuildSite.hashArtifact(site);
    if (!metadata.artifact || metadata.artifact.sha256 !== actual.sha256
        || metadata.artifact.fileCount !== actual.fileCount
        || metadata.artifact.bytes !== actual.bytes) {
        throw new Error('_build.json does not match the assembled site contents.');
    }
    if (!metadata.source || !metadata.source.revision || !metadata.source.timestamp) {
        throw new Error('_build.json is missing rollback source metadata.');
    }
    return metadata;
}

function validate(options) {
    const site = path.resolve(options.site);
    if (!fs.existsSync(site) || !fs.statSync(site).isDirectory()) throw new Error(`Site directory does not exist: ${site}`);
    const config = BuildSite.readConfig(options.config);
    const files = BuildSite.walkFiles(site);
    const fileSet = new Set(files);
    const errors = [];

    for (const required of REQUIRED_FILES) {
        if (!fileSet.has(required)) errors.push(`missing required file: ${required}`);
    }
    for (const relative of files) {
        if (relative === '.nojekyll' || relative === '_build.json') continue;
        if (!BuildSite.isPublishable(relative, config)) errors.push(`non-public file in artifact: ${relative}`);
    }

    let references = [];
    try {
        references = collectReferences(site, files);
    } catch (error) {
        errors.push(error.message);
    }
    for (const reference of references) {
        const resolved = resolveLocalReference(reference.source, reference.value);
        if (!resolved) continue;
        if (resolved.error) {
            errors.push(`${reference.source} (${reference.kind}): ${resolved.error}`);
            continue;
        }
        if (!fileSet.has(resolved.pathname)) {
            errors.push(`${reference.source} (${reference.kind}) -> missing ${resolved.pathname}`);
        }
    }

    let metadata = null;
    if (fileSet.has('_build.json')) {
        try {
            metadata = validateMetadata(site);
        } catch (error) {
            errors.push(error.message);
        }
    }
    if (errors.length) throw new Error(`Static site validation failed:\n- ${[...new Set(errors)].join('\n- ')}`);
    return { files, references, metadata };
}

if (require.main === module) {
    try {
        const result = validate(parseArgs(process.argv.slice(2)));
        console.log(`Static site valid: ${result.files.length} files, ${result.references.length} local-reference candidates checked.`);
        if (result.metadata) console.log(`Rollback revision: ${result.metadata.source.revision}`);
    } catch (error) {
        console.error(error && error.stack || error);
        process.exitCode = 1;
    }
}

module.exports = {
    REQUIRED_FILES,
    parseArgs,
    htmlReferences,
    cssReferences,
    manifestReferences,
    serviceWorkerReferences,
    serviceWorkerManifestReferences,
    resolveLocalReference,
    collectReferences,
    validateMetadata,
    validate
};
