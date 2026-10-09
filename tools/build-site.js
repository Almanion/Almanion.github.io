#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const NotesBuilder = require('./build-notes.js');
const SearchIndex = require('../performance/build-search-index.js');
const DefinitionIndex = require('../performance/build-definition-index.js');
const ServiceWorker = require('../performance/build-service-worker.js');
const OfflineLibrary = require('./build-offline.js');

const CONFIG_PATH = path.join(__dirname, 'site-files.json');

function normalizeRelative(file) {
    return String(file || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function compareNames(left, right) {
    return left === right ? 0 : (left < right ? -1 : 1);
}

function parseArgs(argv) {
    const options = {
        root: path.resolve(__dirname, '..'),
        output: null
    };
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--root' && argv[index + 1]) options.root = path.resolve(argv[++index]);
        else if (argv[index] === '--output' && argv[index + 1]) options.output = path.resolve(argv[++index]);
        else throw new Error(`Unknown or incomplete argument: ${argv[index]}`);
    }
    if (!options.output) options.output = path.join(options.root, '_site');
    return options;
}

function readConfig(file = CONFIG_PATH) {
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    config.rootFiles = new Set(config.rootFiles || []);
    config.rootExtensions = new Set(config.rootExtensions || []);
    config.deniedPaths = (config.deniedPaths || []).map(normalizeRelative);
    config.directories = Object.fromEntries(Object.entries(config.directories || {}).map(([directory, extensions]) => [
        normalizeRelative(directory),
        new Set(extensions)
    ]));
    return config;
}

function isDenied(relative, config) {
    const normalized = normalizeRelative(relative);
    return config.deniedPaths.some(denied => normalized === denied || normalized.startsWith(`${denied}/`));
}

function isPublishable(relative, config) {
    const normalized = normalizeRelative(relative);
    if (!normalized || normalized.includes('/../') || normalized.startsWith('../') || isDenied(normalized, config)) return false;
    const parts = normalized.split('/');
    const extension = path.posix.extname(normalized).toLowerCase();
    if (parts.length === 1) return config.rootFiles.has(normalized) || config.rootExtensions.has(extension);
    const allowedExtensions = config.directories[parts[0]];
    return Boolean(allowedExtensions && allowedExtensions.has(extension));
}

function trackedFiles(root) {
    const output = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' });
    return output.split('\0').filter(Boolean).map(normalizeRelative).sort(compareNames);
}

function assertSafeOutput(root, output) {
    const relative = path.relative(root, output);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Build output must be a child directory of the repository: ${output}`);
    }
}

function resetOutput(root, output) {
    assertSafeOutput(root, output);
    fs.rmSync(output, { recursive: true, force: true });
    fs.mkdirSync(output, { recursive: true });
}

function copyPublicFiles(root, output, config) {
    const files = trackedFiles(root).filter(file => isPublishable(file, config));
    for (const relative of files) {
        const source = path.join(root, relative);
        const stat = fs.lstatSync(source);
        if (!stat.isFile()) throw new Error(`Public input must be a regular file: ${relative}`);
        const target = path.join(output, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
    }
    return files;
}

function gitValue(root, args, fallback = 'unknown') {
    try {
        return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim() || fallback;
    } catch (_error) {
        return fallback;
    }
}

function walkFiles(directory, prefix = '') {
    const files = [];
    const entries = fs.readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => compareNames(left.name, right.name));
    for (const entry of entries) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...walkFiles(absolute, relative));
        else if (entry.isFile()) files.push(relative);
        else throw new Error(`Build output contains a non-regular entry: ${relative}`);
    }
    return files;
}

function hashArtifact(output) {
    const digest = crypto.createHash('sha256');
    let bytes = 0;
    const files = walkFiles(output).filter(file => file !== '_build.json');
    for (const relative of files) {
        const content = fs.readFileSync(path.join(output, relative));
        const fileHash = crypto.createHash('sha256').update(content).digest('hex');
        bytes += content.length;
        digest.update(relative, 'utf8');
        digest.update('\0');
        digest.update(fileHash, 'ascii');
        digest.update('\0');
        digest.update(String(content.length), 'ascii');
        digest.update('\n');
    }
    return { sha256: digest.digest('hex'), fileCount: files.length, bytes };
}

function writeMetadata(root, output, notes, search, serviceWorker) {
    const revision = process.env.GITHUB_SHA || gitValue(root, ['rev-parse', 'HEAD']);
    const sourceTimestamp = process.env.SOURCE_DATE_EPOCH
        ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
        : gitValue(root, ['show', '-s', '--format=%cI', revision]);
    const metadata = {
        schemaVersion: 1,
        artifact: hashArtifact(output),
        source: {
            revision,
            timestamp: sourceTimestamp
        },
        generator: {
            subjects: notes.subjects,
            sections: notes.sections,
            search: {
                entries: search.entries,
                bytes: search.bytes,
                version: search.version
            },
            serviceWorker: {
                version: serviceWorker.version,
                shellEntries: serviceWorker.shell.length
            }
        }
    };
    fs.writeFileSync(path.join(output, '_build.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
    return metadata;
}

function updateSubjectStatus(home, subject, active) {
    const page = subject.page.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // The badge can contain an icon span. Match the entire badge, not just
    // its first closing span, or the icon leaves orphan text in the card.
    const badge = '<span class="status-badge[^>]*>(?:<span\\b[^>]*>[\\s\\S]*?<\\/span>\\s*)?[^<]*<\\/span>';
    const pattern = new RegExp('(<a\\b[^>]*href="' + page + '"[^>]*class="subject-card"[\\s\\S]*?)(' + badge + ')([\\s\\S]*?<\\/a>)');
    const status = active ? '<span class="status-badge status-active">Активно</span>' : '<span class="status-badge">Готовится</span>';
    return home.replace(pattern, '$1' + status + '$3');
}

function build(options) {
    const root = path.resolve(options.root);
    const output = path.resolve(options.output);
    const config = readConfig(options.config || CONFIG_PATH);
    resetOutput(root, output);
    const copied = copyPublicFiles(root, output, config);
    const notes = NotesBuilder.build({ root, output });
    // Invalidate only the changed reading utilities. Existing service workers
    // may still hold earlier query-versioned copies during a deployment.
    for (const file of walkFiles(output).filter(file => file.endsWith('.html'))) {
        const absolute = path.join(output, file);
        const html = fs.readFileSync(absolute, 'utf8');
        const updated = html.replace(/((?:src|href)=["'](?:(?:note-runtime|settings|bookmarks|script|print-export|experimental-reader|home-dashboard|duty)\.js|constructor\/(?:index|publication)\.(?:js|css)|styles\/(?:admin|copy-blocks|home-dashboard|print)\.css|styles\/site\/(?:reader|index)\.css))(?:\?[^"']*)?(["'])/g, '$1?v=20261006-1$2')
            .replace(/(src=["'](?:note-runtime|print-export)\.js)\?v=20261006-1(["'])/g, '$1?v=20261007-1$2')
            .replace(/((?:src|href)=["'](?:settings\.js|home-dashboard\.js|styles\/home-dashboard\.css))\?v=20261006-1(["'])/g, '$1?v=20261009-1$2');
        if (updated !== html) fs.writeFileSync(absolute, updated);
    }
    // Status follows published materials, including sections added later by the
    // editor. Do not advertise an empty subject as active.
    const homePath = path.join(output, 'index.html');
    let home = fs.readFileSync(homePath, 'utf8');
    JSON.parse(fs.readFileSync(path.join(root, 'content', 'subjects.json'), 'utf8')).forEach(subject => {
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'content', subject.id, 'manifest.json'), 'utf8'));
        home = updateSubjectStatus(home, subject, manifest.sections.length > 0);
    });
    fs.writeFileSync(homePath, home);
    const search = SearchIndex.build({
        root,
        site: output,
        output: path.join(output, 'search-index.json')
    });
    DefinitionIndex.build({ root, site: output });
    OfflineLibrary.build({ root, site: output });
    const serviceWorker = ServiceWorker.build({ root, site: output });
    fs.writeFileSync(path.join(output, '.nojekyll'), '', 'utf8');
    const metadata = writeMetadata(root, output, notes, search, serviceWorker);
    return { copied: copied.length, notes, search, serviceWorker, metadata, output };
}

if (require.main === module) {
    try {
        const result = build(parseArgs(process.argv.slice(2)));
        console.log(`Static site built: ${result.metadata.artifact.fileCount} files, ${result.metadata.artifact.bytes} bytes.`);
        console.log(`Artifact SHA-256: ${result.metadata.artifact.sha256}`);
    } catch (error) {
        console.error(error && error.stack || error);
        process.exitCode = 1;
    }
}

module.exports = {
    normalizeRelative,
    compareNames,
    parseArgs,
    readConfig,
    isDenied,
    isPublishable,
    trackedFiles,
    assertSafeOutput,
    walkFiles,
    hashArtifact,
    build,
    updateSubjectStatus
};
