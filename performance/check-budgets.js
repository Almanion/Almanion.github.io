'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

function trackedFiles(root) {
    const output = childProcess.execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
        cwd: root,
        encoding: 'utf8'
    });
    return output.split('\0').filter(Boolean);
}

function cleanReference(value) {
    return String(value || '').trim().split('#')[0].split('?')[0];
}

function isExternalReference(value) {
    return /^(?:https?:)?\/\//i.test(String(value || '').trim());
}

function resolveLocalReference(root, fromRelativePath, value) {
    const clean = cleanReference(value);
    if (!clean || isExternalReference(clean) || /^(?:data|mailto|javascript):/i.test(clean)) return null;
    let decoded = clean;
    try { decoded = decodeURIComponent(clean); } catch (_) {}
    const relative = decoded.startsWith('/')
        ? decoded.replace(/^\/+/, '')
        : path.join(path.dirname(fromRelativePath), decoded);
    const normalized = path.normalize(relative);
    const absolute = path.resolve(root, normalized);
    if (absolute !== root && !absolute.startsWith(root + path.sep)) return null;
    return { relative: normalized.replace(/\\/g, '/'), absolute: absolute };
}

function htmlAssets(source) {
    const scripts = [];
    const styles = [];
    const external = [];
    let match;
    const scriptPattern = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
    while ((match = scriptPattern.exec(source))) {
        (isExternalReference(match[1]) ? external : scripts).push(match[1]);
    }
    const linkPattern = /<link\b([^>]+)>/gi;
    while ((match = linkPattern.exec(source))) {
        const attributes = match[1];
        if (!/\brel=["'][^"']*stylesheet[^"']*["']/i.test(attributes)) continue;
        const href = attributes.match(/\bhref=["']([^"']+)["']/i);
        if (!href) continue;
        (isExternalReference(href[1]) ? external : styles).push(href[1]);
    }
    return { scripts: scripts, styles: styles, external: external };
}

function cssImports(source) {
    const imports = [];
    const pattern = /@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?/gi;
    let match;
    while ((match = pattern.exec(source))) imports.push(match[1]);
    return imports;
}

function inspectRoute(root, page) {
    const pagePath = path.join(root, page);
    const source = fs.readFileSync(pagePath, 'utf8');
    const assets = htmlAssets(source);
    const scripts = new Map();
    const styles = new Map();
    const missing = [];

    assets.scripts.forEach(function (reference) {
        const resolved = resolveLocalReference(root, page, reference);
        if (!resolved) return;
        if (!fs.existsSync(resolved.absolute)) missing.push(resolved.relative);
        else scripts.set(resolved.relative, fs.statSync(resolved.absolute).size);
    });

    function visitStyle(from, reference) {
        const resolved = resolveLocalReference(root, from, reference);
        if (!resolved || styles.has(resolved.relative)) return;
        if (!fs.existsSync(resolved.absolute)) {
            missing.push(resolved.relative);
            return;
        }
        const content = fs.readFileSync(resolved.absolute, 'utf8');
        styles.set(resolved.relative, fs.statSync(resolved.absolute).size);
        cssImports(content).forEach(function (child) { visitStyle(resolved.relative, child); });
    }
    assets.styles.forEach(function (reference) { visitStyle(page, reference); });

    return {
        page: page,
        localJsBytes: Array.from(scripts.values()).reduce(function (sum, value) { return sum + value; }, 0),
        localCssBytes: Array.from(styles.values()).reduce(function (sum, value) { return sum + value; }, 0),
        localRequests: scripts.size + styles.size,
        externalRequests: new Set(assets.external).size,
        scripts: Array.from(scripts.keys()),
        styles: Array.from(styles.keys()),
        missing: Array.from(new Set(missing))
    };
}

function checkRouteBudget(route, budget, errors) {
    const comparisons = [
        ['localJsBytes', 'maxInitialLocalJsBytes', 'initial local JS bytes'],
        ['localCssBytes', 'maxInitialLocalCssBytes', 'initial local CSS bytes'],
        ['localRequests', 'maxInitialLocalRequests', 'initial local requests'],
        ['externalRequests', 'maxExternalRequests', 'external script/style requests']
    ];
    if (route.missing.length) errors.push(route.page + ' references missing assets: ' + route.missing.join(', '));
    comparisons.forEach(function (entry) {
        const actual = route[entry[0]];
        const limit = budget[entry[1]];
        if (Number.isFinite(limit) && actual > limit) {
            errors.push(route.page + ' has ' + actual + ' ' + entry[2] + '; budget is ' + limit);
        }
    });
}

function countPrecacheEntries(source) {
    const match = source.match(/const\s+APP_SHELL\s*=\s*\[([\s\S]*?)\];/);
    if (!match) return 0;
    return (match[1].match(/^\s*['"]\//gm) || []).length;
}

function check(rootDir) {
    const root = path.resolve(rootDir || path.join(__dirname, '..'));
    const budgets = JSON.parse(fs.readFileSync(path.join(root, 'performance', 'budgets.json'), 'utf8'));
    const errors = [];
    const largest = {};

    trackedFiles(root).forEach(relativePath => {
        const extension = path.extname(relativePath).toLowerCase();
        const normalizedPath = relativePath.replace(/\\/g, '/');
        const pathLimits = budgets.maxBytesByPath || {};
        const limit = pathLimits[normalizedPath] || budgets.maxBytesByExtension[extension];
        if (!limit) return;
        const absolutePath = path.join(root, relativePath);
        if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return;
        const bytes = fs.statSync(absolutePath).size;
        if (!largest[extension] || bytes > largest[extension].bytes) {
            largest[extension] = { path: normalizedPath, bytes };
        }
        if (bytes > limit) errors.push(relativePath + ' is ' + bytes + ' bytes; budget is ' + limit);
    });

    const shellConfigPath = path.join(root, 'performance', 'sw-shell.json');
    const precacheEntries = fs.existsSync(shellConfigPath)
        ? new Set(JSON.parse(fs.readFileSync(shellConfigPath, 'utf8')).assets || []).size
        : countPrecacheEntries(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'));
    if (precacheEntries > budgets.maxPrecacheEntries) {
        errors.push('sw.js precaches ' + precacheEntries + ' URLs; budget is ' + budgets.maxPrecacheEntries);
    }

    const searchSourceBytes = budgets.searchSourcePages.reduce((sum, relativePath) => {
        const absolutePath = path.join(root, relativePath);
        return sum + (fs.existsSync(absolutePath) ? fs.statSync(absolutePath).size : 0);
    }, 0);
    if (searchSourceBytes > budgets.maxSearchSourceBytes) {
        errors.push('search source pages total ' + searchSourceBytes + ' bytes; budget is ' + budgets.maxSearchSourceBytes);
    }

    const routes = Object.keys(budgets.routes || {}).map(function (page) {
        const route = inspectRoute(root, page);
        checkRouteBudget(route, budgets.routes[page], errors);
        return route;
    });

    return { errors, largest, precacheEntries, searchSourceBytes, routes };
}

if (require.main === module) {
    const result = check(process.argv[2]);
    if (result.errors.length) {
        result.errors.forEach(error => console.error('performance:', error));
        process.exitCode = 1;
    } else {
        console.log('performance budgets: ok; precache=' + result.precacheEntries
            + ', search-source=' + result.searchSourceBytes + ' bytes');
        result.routes.forEach(function (route) {
            console.log('  ' + route.page + ': js=' + route.localJsBytes + ', css=' + route.localCssBytes
                + ', local-requests=' + route.localRequests + ', external=' + route.externalRequests);
        });
    }
}

module.exports = { check, countPrecacheEntries, inspectRoute, htmlAssets, cssImports };
