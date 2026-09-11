#!/usr/bin/env node
'use strict';

const DEFAULT_PATHS = ['/', '/physics.html', '/matcenter.html', '/english.html', '/note-runtime.js', '/safe-html.js'];

function parseArgs(argv) {
    const options = {
        url: '',
        revision: '',
        attempts: 18,
        delayMs: 10000,
        paths: DEFAULT_PATHS.slice()
    };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--url' && argv[index + 1]) options.url = argv[++index];
        else if (argument === '--revision' && argv[index + 1]) options.revision = argv[++index];
        else if (argument === '--attempts' && argv[index + 1]) options.attempts = Number(argv[++index]);
        else if (argument === '--delay-ms' && argv[index + 1]) options.delayMs = Number(argv[++index]);
        else if (argument === '--path' && argv[index + 1]) options.paths.push(argv[++index]);
        else throw new Error('Unknown or incomplete argument: ' + argument);
    }
    if (!options.url) throw new Error('--url is required.');
    if (!options.revision) throw new Error('--revision is required.');
    if (!Number.isInteger(options.attempts) || options.attempts < 1) throw new Error('--attempts must be a positive integer.');
    if (!Number.isFinite(options.delayMs) || options.delayMs < 0) throw new Error('--delay-ms must be non-negative.');
    return options;
}

function normalizeBaseUrl(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Production URL must use HTTP or HTTPS.');
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    url.search = '';
    url.hash = '';
    return url;
}

function sleep(milliseconds) {
    return new Promise(function (resolve) { setTimeout(resolve, milliseconds); });
}

function withCacheBuster(url, attempt) {
    const result = new URL(url);
    result.searchParams.set('_verify', Date.now() + '-' + attempt);
    return result;
}

async function fetchChecked(url, attempt) {
    const response = await fetch(withCacheBuster(url, attempt), {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(response.status + ' ' + response.statusText + ' for ' + url.pathname);
    return response;
}

async function readDeployment(baseUrl, attempt) {
    const response = await fetchChecked(new URL('_build.json', baseUrl), attempt);
    const metadata = await response.json();
    if (!metadata || !metadata.source || !metadata.source.revision || !metadata.artifact || !metadata.artifact.sha256) {
        throw new Error('_build.json is incomplete.');
    }
    return metadata;
}

async function verify(options) {
    const baseUrl = normalizeBaseUrl(options.url);
    let lastError = null;
    for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
        try {
            const metadata = await readDeployment(baseUrl, attempt);
            if (metadata.source.revision !== options.revision) {
                throw new Error('GitHub Pages still serves revision ' + metadata.source.revision + ', expected ' + options.revision + '.');
            }
            for (const relative of Array.from(new Set(options.paths))) {
                const response = await fetchChecked(new URL(String(relative).replace(/^\//, ''), baseUrl), attempt);
                const type = response.headers.get('content-type') || '';
                if (/\.(?:html|js|css)$/.test(new URL(response.url).pathname) || relative === '/') {
                    const content = await response.text();
                    if (!content.trim()) throw new Error('Empty response for ' + relative + '.');
                    if (relative === '/' && !content.includes('Конспекты')) throw new Error('The deployed home page marker is missing.');
                } else if (!type) {
                    throw new Error('Missing content type for ' + relative + '.');
                }
            }
            return { metadata: metadata, baseUrl: baseUrl.href, attempt: attempt };
        } catch (error) {
            lastError = error;
            if (attempt < options.attempts) await sleep(options.delayMs);
        }
    }
    throw lastError || new Error('Production verification failed.');
}

if (require.main === module) {
    verify(parseArgs(process.argv.slice(2))).then(function (result) {
        console.log('Production verified at ' + result.baseUrl + ' on attempt ' + result.attempt + '.');
        console.log('Revision ' + result.metadata.source.revision + ', artifact ' + result.metadata.artifact.sha256 + '.');
    }).catch(function (error) {
        console.error(error && error.stack || error);
        process.exitCode = 1;
    });
}

module.exports = { DEFAULT_PATHS, parseArgs, normalizeBaseUrl, withCacheBuster, readDeployment, verify };
