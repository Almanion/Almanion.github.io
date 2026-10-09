'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// The page and all its imported styles must identify their exact contents.
// Unique filenames survive even an old worker's ignoreSearch cache lookup.
function build(site) {
    const paths = new Map();
    const visiting = new Set();
    const local = (from, value) => {
        if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) return null;
        const resolved = new URL(value, 'https://build.invalid/' + from);
        return decodeURIComponent(resolved.pathname).replace(/^\//, '');
    };
    function stylesheet(file) {
        if (paths.has('/' + file)) return paths.get('/' + file);
        if (visiting.has(file)) throw new Error('Circular stylesheet import: ' + file);
        visiting.add(file);
        let css = fs.readFileSync(path.join(site, file), 'utf8');
        css = css.replace(/(@import\s+(?:url\(\s*)?)(?:"([^"]+)"|'([^']+)'|([^\s;)'"(]+))(\s*\)?)/gi,
            (all, before, double, single, bare, after) => {
                const child = local(file, double || single || bare);
                return child ? before + '"' + stylesheet(child) + '"' + after : all;
            });
        // Root-level style-new.css moves under styles/releases; preserve all
        // font/image references independently of the copied file's directory.
        css = css.replace(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)/gi,
            (all, double, single, bare) => {
                const value = double || single || bare;
                const target = local(file, value);
                if (!target || value.startsWith('/')) return all;
                const resolved = new URL(value, 'https://build.invalid/' + file);
                return 'url("/' + target + resolved.search + resolved.hash + '")';
            });
        const version = crypto.createHash('sha256').update(css).digest('hex').slice(0, 16);
        const folder = file.includes('/') ? path.posix.dirname(file) : 'styles/releases';
        const name = path.posix.basename(file, '.css') + '.' + version + '.css';
        const output = folder + '/' + name;
        fs.mkdirSync(path.join(site, folder), { recursive: true });
        fs.writeFileSync(path.join(site, output), css);
        paths.set('/' + file, '/' + output);
        visiting.delete(file);
        return '/' + output;
    }
    const home = path.join(site, 'index.html');
    const html = fs.readFileSync(home, 'utf8').replace(/<link\b[^>]*>/gi, tag => {
        if (!/\brel=["']stylesheet["']/i.test(tag)) return tag;
        return tag.replace(/\bhref=(["'])([^"']+)\1/i, (all, quote, value) => {
            const file = local('index.html', value);
            return file ? 'href=' + quote + stylesheet(file) + quote : all;
        });
    });
    fs.writeFileSync(home, html);
    return paths;
}

module.exports = { build };
