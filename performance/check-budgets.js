'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

function trackedFiles(root) {
    const output = childProcess.execFileSync('git', ['ls-files', '-z'], {
        cwd: root,
        encoding: 'utf8'
    });
    return output.split('\0').filter(Boolean);
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
        const limit = budgets.maxBytesByExtension[extension];
        if (!limit) return;
        const absolutePath = path.join(root, relativePath);
        if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return;
        const bytes = fs.statSync(absolutePath).size;
        if (!largest[extension] || bytes > largest[extension].bytes) {
            largest[extension] = { path: relativePath.replace(/\\/g, '/'), bytes };
        }
        if (bytes > limit) errors.push(relativePath + ' is ' + bytes + ' bytes; budget is ' + limit);
    });

    const workerPath = path.join(root, 'sw.js');
    const precacheEntries = countPrecacheEntries(fs.readFileSync(workerPath, 'utf8'));
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

    return { errors, largest, precacheEntries, searchSourceBytes };
}

if (require.main === module) {
    const result = check(process.argv[2]);
    if (result.errors.length) {
        result.errors.forEach(error => console.error('performance:', error));
        process.exitCode = 1;
    } else {
        console.log('performance budgets: ok; precache=' + result.precacheEntries
            + ', search-source=' + result.searchSourceBytes + ' bytes');
    }
}

module.exports = { check, countPrecacheEntries };
