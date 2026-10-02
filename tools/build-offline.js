'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const OPTIONAL = ['settings.js', 'bookmarks.js', 'personal-notes.js', 'offline-library.js', 'data-sync.js', 'account.js', 'firebase-config.js', 'knowledge-check.js', 'search.js', 'note-filter.js', 'safe-html.js', 'styles/bookmarks.css', 'styles/reader-tools.css', 'styles/site/features.css', 'styles/note-filter.css', 'vendor/ts-fsrs.umd.js'];
function build({ root, site }) {
    const subjects = JSON.parse(fs.readFileSync(path.join(root, 'content/subjects.json'), 'utf8'));
    const katexRoot = path.dirname(require.resolve('katex/package.json'));
    const dist = path.join(katexRoot, 'dist');
    const vendor = path.join(site, 'vendor/katex');
    fs.mkdirSync(vendor, { recursive: true });
    ['katex.min.css', 'katex.min.js', 'contrib/auto-render.min.js'].forEach(file => {
        fs.mkdirSync(path.dirname(path.join(vendor, file)), { recursive: true });
        fs.copyFileSync(path.join(dist, file), path.join(vendor, file));
    });
    fs.cpSync(path.join(dist, 'fonts'), path.join(vendor, 'fonts'), { recursive: true });
    fs.copyFileSync(path.join(katexRoot, 'LICENSE'), path.join(vendor, 'LICENSE.txt'));
    const catalogue = subjects.map(subject => {
        const assets = new Map();
        function add(url, source) {
            const clean = url.replace(/[?#].*$/, '');
            if (assets.has(clean)) return;
            const file = path.join(site, decodeURIComponent(source.replace(/^\//, '')));
            if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error('Missing offline dependency: ' + source);
            const bytes = fs.readFileSync(file);
            assets.set(clean, { url: clean, source: '/' + source.replace(/^\//, ''), bytes: bytes.length, sha256: hash(bytes) });
            if (!/\.(?:html|css)$/.test(source)) return;
            const text = bytes.toString('utf8');
            const references = /\b(?:src|href)\s*=\s*["']([^"'#]+)["']|(?:url\(\s*["']?|@import\s+["'])([^"')\s;]+)["']?\)?/g;
            let match;
            while ((match = references.exec(text))) {
                const ref = (match[1] || match[2]).replace(/&amp;/g, '&');
                if (/^(?:data:|mailto:|javascript:|tel:)/.test(ref)) continue;
                const resolved = new URL(ref, new URL(clean, 'https://offline.invalid/')).href;
                const katex = resolved.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/katex@([^/]+)\/dist\/(.+?)(?:[?#].*)?$/);
                if (katex) { add(resolved, 'vendor/katex/' + katex[2]); continue; }
                if (!resolved.startsWith('https://offline.invalid/')) continue;
                const relative = new URL(resolved).pathname.replace(/^\//, '');
                // Follow resources and embedded diagrams, never navigation links to
                // accounts, private subjects or unrelated pages.
                if (/\.html?$/.test(relative) && !(match[1] && /\b(?:iframe|object)\b/i.test(text.slice(Math.max(0, match.index - 15), match.index)))) continue;
                if (/\.(?:css|js|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|otf|json)$/.test(relative)) add('/' + relative, relative);
            }
        }
        add('/' + subject.page, subject.page);
        OPTIONAL.forEach(file => add('/' + file, file));
        ['index.html', 'offline.html', 'content/subjects.json', 'search-index.json', 'manifest.json'].forEach(file => add('/' + file, file));
        const manifestPath = 'content/' + subject.id + '/manifest.json';
        add('/' + manifestPath, manifestPath);
        const manifest = JSON.parse(fs.readFileSync(path.join(site, manifestPath), 'utf8'));
        (manifest.sections || []).forEach(entry => {
            const sectionPath = 'content/' + subject.id + '/sections/' + (typeof entry === 'string' ? entry : entry.id) + '.json';
            add('/' + sectionPath, sectionPath);
        });
        const files = Array.from(assets.values()).sort((a, b) => a.url.localeCompare(b.url, 'en'));
        const version = hash(JSON.stringify(files)).slice(0, 20);
        return { id: subject.id, title: subject.title, page: subject.page, version, bytes: files.reduce((sum, file) => sum + file.bytes, 0), files };
    });
    const manifest = { schemaVersion: 1, subjects: catalogue };
    fs.writeFileSync(path.join(site, 'offline-library.json'), JSON.stringify(manifest));
    return manifest;
}
module.exports = { build };
