'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const script = fs.readFileSync(path.join(__dirname, '../../apps-script.gs'), 'utf8');
const senderScript = fs.readFileSync(path.join(__dirname, '../../tools/account-mailer/Code.gs'), 'utf8');
const senderWordmark = fs.readFileSync(path.join(__dirname, '../../tools/account-mailer/Wordmark.gs'), 'utf8');

function propertyStore(initial) {
    const data = new Map(Object.entries(initial));
    return { getScriptProperties: () => ({
        getKeys: () => [...data.keys()], getProperty: key => data.get(key) || null, getProperties: () => Object.fromEntries(data),
        setProperty: (key, value) => data.set(key, value), deleteProperty: key => data.delete(key)
    }) };
}

function mailScript({ transport, projectId = 'almanion-rules-test', now = Date.now, deliver, quota = () => 50,
    sender = 'almanion.mail@gmail.com', connected = true }) {
    const mail = [], requests = [];
    const relayUrl = 'https://script.google.com/macros/s/test-only/exec';
    const key = crypto.randomBytes(32).toString('base64');
    const shared = {
        Date: class extends Date { static now() { return now(); } },
        LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
        Utilities: {
            DigestAlgorithm: { SHA_256: 'sha256' },
            computeDigest: (algorithm, value) => crypto.createHash(algorithm).update(value).digest(),
            base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url'),
            computeHmacSha256Signature: (value, key) => Array.from(crypto.createHmac('sha256', key).update(value).digest()),
            base64Decode: value => Buffer.from(value, 'base64'),
            newBlob: (bytes, contentType, name) => ({ bytes, contentType, name }),
            getUuid: crypto.randomUUID
        },
        ContentService: { createTextOutput: text => ({ setMimeType: () => text }), MimeType: { JSON: 'json' } }
    };
    const relay = { ...shared,
        PropertiesService: propertyStore({ ALMANION_MAIL_KEY: key }),
        Session: { getEffectiveUser: () => ({ getEmail: () => sender }) },
        MailApp: { getRemainingDailyQuota: quota, sendEmail: message => (deliver || (m => mail.push(m)))(message) }
    };
    vm.createContext(relay);
    vm.runInContext(senderWordmark, relay, { filename: 'account-mailer/Wordmark.gs' });
    vm.runInContext(senderScript, relay, { filename: 'account-mailer/Code.gs' });
    const postToMailer = envelope => JSON.parse(relay.doPost({ postData: { contents: JSON.stringify(envelope) } }));
    const globals = { ...shared,
        PropertiesService: propertyStore({ FIREBASE_WEB_API_KEY: 'local', FIREBASE_PROJECT_ID: projectId,
            ALMANION_MAIL_URL: relayUrl, ALMANION_MAIL_KEY: connected ? key : '' }),
        ScriptApp: { getOAuthToken: () => 'owner' },
        UrlFetchApp: { fetch: (url, options) => {
            let status = 200, body;
            if (url === relayUrl) {
                const envelope = JSON.parse(options.payload);
                requests.push(envelope);
                body = postToMailer(envelope);
            } else {
                ({ status, body } = transport(new URL(url), options));
            }
            return { getResponseCode: () => status, getContentText: () => JSON.stringify(body) };
        } }
    };
    vm.runInNewContext(script, globals, { filename: 'apps-script.gs' });
    return {
        mail, requests, postToMailer,
        request(body, method = 'POST', queryString = '') {
            const input = { parameter: {}, postData: { contents: JSON.stringify(body) }, queryString };
            return JSON.parse((method === 'POST' ? globals.doPost : globals.doGet)(input));
        }
    };
}

function emulatorTransport(host) {
    if (!/^127\.0\.0\.1:\d+$/.test(host)) throw new Error('Expected a loopback Firebase Auth emulator');
    // Apps Script's UrlFetchApp is synchronous. Run fetch in a separate Node
    // process so the same handler can exercise a real Auth emulator in a browser test.
    const call = `const req = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
        fetch(req.url, { method: 'POST', headers: req.headers, body: req.body, signal: AbortSignal.timeout(8000) })
            .then(async r => console.log(JSON.stringify({status:r.status, body:await r.json()})))
            .catch(() => { process.exitCode=1; });`;
    return (url, options) => {
        if (url.origin !== 'https://identitytoolkit.googleapis.com') throw new Error('Unexpected API');
        const input = JSON.stringify({ url: 'http://' + host + '/' + url.hostname + url.pathname + url.search,
            body: options.payload, headers: { 'Content-Type': 'application/json', ...options.headers } });
        const response = execFileSync(process.execPath, ['-e', call], { input, encoding: 'utf8', windowsHide: true, timeout: 11000 });
        return JSON.parse(response);
    };
}
module.exports = { mailScript, emulatorTransport };
