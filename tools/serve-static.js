#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const MIME_TYPES = Object.freeze({
    '.avif': 'image/avif',
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.webp': 'image/webp'
});

function parseArgs(argv) {
    const options = { root: path.resolve('_site'), port: 4173, host: '127.0.0.1' };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--root' && argv[index + 1]) options.root = path.resolve(argv[++index]);
        else if (argument === '--port' && argv[index + 1]) options.port = Number(argv[++index]);
        else if (argument === '--host' && argv[index + 1]) options.host = argv[++index];
        else throw new Error('Unknown or incomplete argument: ' + argument);
    }
    if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new Error('Invalid port.');
    return options;
}

function resolveRequest(root, requestUrl) {
    let pathname;
    try { pathname = decodeURIComponent(new URL(requestUrl, 'http://local.invalid').pathname); }
    catch (_) { return null; }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const relative = path.posix.normalize(pathname.replace(/^\/+/, ''));
    if (!relative || relative === '..' || relative.startsWith('../')) return null;
    const absolute = path.resolve(root, relative);
    if (absolute !== root && !absolute.startsWith(root + path.sep)) return null;
    return absolute;
}

function createServer(root) {
    const absoluteRoot = path.resolve(root);
    return http.createServer(function (request, response) {
        const file = resolveRequest(absoluteRoot, request.url || '/');
        if (!file) {
            response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('Bad request');
            return;
        }
        fs.stat(file, function (statError, stat) {
            if (statError || !stat.isFile()) {
                response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                response.end('Not found');
                return;
            }
            response.writeHead(200, {
                'Cache-Control': 'no-store',
                'Content-Length': stat.size,
                'Content-Type': MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream'
            });
            if (request.method === 'HEAD') response.end();
            else fs.createReadStream(file).pipe(response);
        });
    });
}

if (require.main === module) {
    try {
        const options = parseArgs(process.argv.slice(2));
        if (!fs.existsSync(options.root)) throw new Error('Static root does not exist: ' + options.root);
        const server = createServer(options.root);
        let closing = false;
        function shutdown() {
            if (closing) return;
            closing = true;
            server.close(function () { process.exit(0); });
            setTimeout(function () { process.exit(0); }, 1500).unref();
        }
        process.once('SIGINT', shutdown);
        process.once('SIGTERM', shutdown);
        server.listen(options.port, options.host, function () {
            console.log('Static test server: http://' + options.host + ':' + options.port);
        });
    } catch (error) {
        console.error(error && error.stack || error);
        process.exitCode = 1;
    }
}

module.exports = { MIME_TYPES, parseArgs, resolveRequest, createServer };
