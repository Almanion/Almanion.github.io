'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function normalizedPath(value) {
    const clean = String(value || '').split('?')[0].replace(/^\/+/, '');
    return clean || 'index.html';
}

function build(options) {
    const root = path.resolve(options.root);
    const site = path.resolve(options.site);
    const config = JSON.parse(fs.readFileSync(path.join(root, 'performance', 'sw-shell.json'), 'utf8'));
    const assets = Array.from(new Set(config.assets || []));
    const digest = crypto.createHash('sha256');

    assets.forEach(function (url) {
        const relative = normalizedPath(url);
        const absolute = path.join(site, relative);
        if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
            throw new Error('Service-worker shell asset does not exist: ' + url);
        }
        digest.update(url);
        digest.update('\0');
        digest.update(fs.readFileSync(absolute));
        digest.update('\0');
    });

    const version = digest.digest('hex').slice(0, 20);
    const manifest = {
        schemaVersion: 1,
        version: version,
        generatedAt: process.env.SOURCE_DATE_EPOCH
            ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
            : null,
        shell: assets
    };
    const source = 'self.__ALMANION_SW_MANIFEST = Object.freeze(' + JSON.stringify(manifest) + ');\n';
    fs.writeFileSync(path.join(site, 'sw-manifest.js'), source, 'utf8');
    return manifest;
}

module.exports = { build, normalizedPath };
