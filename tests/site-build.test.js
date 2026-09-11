'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const BuildSite = require('../tools/build-site.js');
const ValidateSite = require('../tools/validate-site.js');
const ServiceWorker = require('../performance/build-service-worker.js');

const config = BuildSite.readConfig();

assert.deepStrictEqual(['b', 'A', 'a'].sort(BuildSite.compareNames), ['A', 'a', 'b']);

assert.strictEqual(BuildSite.isPublishable('index.html', config), true);
assert.strictEqual(BuildSite.isPublishable('style-new.css', config), true);
assert.strictEqual(BuildSite.isPublishable('chemistry-interactive.js', config), true);
assert.strictEqual(BuildSite.isPublishable('search-index.json', config), true);
assert.strictEqual(BuildSite.isPublishable('unexpected-debug.html', config), false);
assert.strictEqual(BuildSite.isPublishable('private-helper.js', config), false);
assert.strictEqual(BuildSite.isPublishable('styles/site/index.css', config), true);
assert.strictEqual(BuildSite.isPublishable('content/physics/manifest.json', config), true);
assert.strictEqual(BuildSite.isPublishable('dead souls/text/chapter-1.txt', config), true);
assert.strictEqual(BuildSite.isPublishable('tests/home-motion.test.js', config), false);
assert.strictEqual(BuildSite.isPublishable('tools/build-notes.js', config), false);
assert.strictEqual(BuildSite.isPublishable('firebase/database.rules.json', config), false);
assert.strictEqual(BuildSite.isPublishable('apps-script.gs', config), false);
assert.strictEqual(BuildSite.isPublishable('package.json', config), false);
assert.strictEqual(BuildSite.isPublishable('constructor/README.md', config), false);

assert.deepStrictEqual(
    ValidateSite.resolveLocalReference('styles/site/index.css', '../tokens.css?v=2#theme'),
    { pathname: 'styles/tokens.css' }
);
assert.deepStrictEqual(
    ValidateSite.resolveLocalReference('index.html', '/physics.html#mechanics'),
    { pathname: 'physics.html' }
);
assert.deepStrictEqual(
    ValidateSite.resolveLocalReference('index.html', '/?source=pwa'),
    { pathname: 'index.html' }
);
assert.strictEqual(ValidateSite.resolveLocalReference('index.html', 'https://cdn.example.test/file.js'), null);
assert.strictEqual(ValidateSite.resolveLocalReference('index.html', '#section'), null);
assert.strictEqual(ServiceWorker.normalizedPath('/?source=pwa'), 'index.html');
assert.strictEqual(ServiceWorker.normalizedPath('/styles/site/index.css?v=2'), 'styles/site/index.css');

const references = ValidateSite.htmlReferences('index.html', `
    <a href="physics.html#intro">Physics</a>
    <img src="images/example.png" srcset="images/example.png 1x, images/example@2x.png 2x">
    <script src=script.js></script>
`);
assert.deepStrictEqual(references.map(item => item.value), [
    'physics.html#intro',
    'images/example.png',
    'script.js',
    'images/example.png',
    'images/example@2x.png'
]);

function writeFixtureMetadata(site) {
    const metadata = {
        schemaVersion: 1,
        artifact: BuildSite.hashArtifact(site),
        source: { revision: 'fixture-revision', timestamp: '2026-09-07T00:00:00.000Z' },
        generator: { subjects: 0, sections: 0, search: { entries: 0, bytes: 32, version: 'fixture' } }
    };
    fs.writeFileSync(path.join(site, '_build.json'), `${JSON.stringify(metadata, null, 2)}\n`);
}

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'almanion-site-validation-'));
try {
    fs.mkdirSync(path.join(fixture, 'styles', 'site'), { recursive: true });
    fs.writeFileSync(path.join(fixture, '.nojekyll'), '');
    fs.writeFileSync(path.join(fixture, 'index.html'), '<link rel="stylesheet" href="styles/site/index.css"><a href="offline.html">Offline</a>');
    fs.writeFileSync(path.join(fixture, 'offline.html'), '<a href="/">Home</a>');
    fs.writeFileSync(path.join(fixture, 'manifest.json'), '{"start_url":"/"}');
    fs.writeFileSync(path.join(fixture, 'search-index.json'), '{"schemaVersion":1,"entries":[]}');
    fs.writeFileSync(path.join(fixture, 'sw.js'), "const APP_SHELL = ['/index.html', '/offline.html'];");
    fs.writeFileSync(path.join(fixture, 'sw-manifest.js'), 'self.__ALMANION_SW_MANIFEST = Object.freeze({"version":"fixture","shell":["/index.html","/offline.html"]});\n');
    fs.writeFileSync(path.join(fixture, 'styles', 'site', 'index.css'), 'body { background: none; }');
    writeFixtureMetadata(fixture);

    const valid = ValidateSite.validate({ site: fixture });
    assert.strictEqual(valid.metadata.source.revision, 'fixture-revision');

    fs.mkdirSync(path.join(fixture, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(fixture, 'tests', 'leak.test.js'), '');
    writeFixtureMetadata(fixture);
    assert.throws(
        () => ValidateSite.validate({ site: fixture }),
        /non-public file in artifact: tests\/leak\.test\.js/
    );
} finally {
    fs.rmSync(fixture, { recursive: true, force: true });
}

console.log('site build: all tests passed');
