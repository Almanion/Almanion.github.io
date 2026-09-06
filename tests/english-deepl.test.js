'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const page = read('english.html');
const client = read('english-deepl.js');
const css = read(path.join('styles', 'english.css'));
const worker = read('sw.js');
const backend = read('apps-script.gs');

assert.match(page, /english-deepl\.js\?v=/);
assert.match(worker, /'\/english-deepl\.js'/);
assert.match(client, /action:\s*'translateEnglish'/);
assert.match(client, /getIdToken\(true\)/);
assert.match(client, /Content-Type': 'text\/plain;charset=utf-8'/);
assert.match(client, /speechSynthesis/);
assert.match(client, /SpeechSynthesisUtterance/);
assert.match(client, /englishTranslatorMobileButton/);
assert.match(client, /english-translator-resizer/);
assert.match(client, /english-locked'[\s\S]*?&& document\.body\.classList\.contains\('english-deepl-open'\)/, 'the access observer must not mutate an already closed panel');
assert.doesNotMatch(client, /DeepL-Auth-Key|DEEPL_API_KEY/, 'the DeepL secret must not be present in browser code');
assert.match(css, /@media \(min-width: 769px\)[\s\S]*?english-deepl-open \.main-content/);
assert.match(css, /@media \(max-width: 768px\)[\s\S]*?\.english-translator-panel\s*\{[\s\S]*?width:\s*100%/);
assert.match(css, /\.english-speak-button/);

const calls = [];
const properties = {
    FIREBASE_WEB_API_KEY: 'firebase-public-key',
    DEEPL_API_KEY: 'server-only-key:fx'
};
const sandbox = {
    PropertiesService: {
        getScriptProperties: () => ({ getProperty: key => properties[key] || '' })
    },
    CacheService: {
        getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} })
    },
    UrlFetchApp: {
        fetch: (url, options) => {
            calls.push({ url, options });
            if (url.includes('identitytoolkit.googleapis.com')) {
                return {
                    getResponseCode: () => 200,
                    getContentText: () => JSON.stringify({ users: [{ localId: 'owner-uid', email: 'dmb23930@gmail.com' }] })
                };
            }
            if (url.includes('api-free.deepl.com')) {
                return {
                    getResponseCode: () => 200,
                    getContentText: () => JSON.stringify({ translations: [{ text: 'Умный перевод', detected_source_language: 'EN' }] })
                };
            }
            throw new Error('unexpected URL: ' + url);
        }
    },
    ContentService: {
        MimeType: { JSON: 'json' },
        createTextOutput: text => ({ text, setMimeType() { return this; } })
    },
    console,
    JSON,
    String,
    Object,
    Array,
    RegExp,
    Number,
    encodeURIComponent
};

vm.createContext(sandbox);
vm.runInContext(backend, sandbox, { filename: 'apps-script.gs' });
const result = JSON.parse(vm.runInContext("translateEnglish({ idToken: 'valid-token', text: 'A thoughtful sentence.' }).text", sandbox));
assert.equal(result.success, true);
assert.equal(result.translation, 'Умный перевод');
const deepLCall = calls.find(call => call.url.includes('deepl.com'));
assert.ok(deepLCall, 'DeepL API was not called');
assert.equal(deepLCall.url, 'https://api-free.deepl.com/v2/translate');
assert.equal(deepLCall.options.headers.Authorization, 'DeepL-Auth-Key server-only-key:fx');
const deepLPayload = JSON.parse(deepLCall.options.payload);
assert.deepEqual(Array.from(deepLPayload.text), ['A thoughtful sentence.']);
assert.equal(deepLPayload.source_lang, 'EN');
assert.equal(deepLPayload.target_lang, 'RU');

console.log('English DeepL workspace: all tests passed');
