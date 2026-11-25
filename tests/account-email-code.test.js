'use strict';
const assert = require('node:assert/strict');
const { mailScript } = require('./helpers/email-code-script');

function fixture(options = {}) {
    let now = Date.UTC(2026, 10, 25), failDelivery = false, tokens = 0, nextAction = 5;
    const users = { a: { localId: 'reader', email: 'reader@example.test' }, b: { localId: 'other', email: 'other@example.test' } };
    const actions = new Map(), mail = [];
    const script = mailScript({
        now: () => now,
        deliver(message) { if (failDelivery) throw new Error(); mail.push(message); },
        transport(url, req) {
            const body = JSON.parse(req.payload);
            switch (url.pathname) {
            case '/v1/accounts:lookup': return { status: users[body.idToken] ? 200 : 400, body: { users: [users[body.idToken]] } };
            case '/v1/accounts:sendOobCode': {
                assert.equal(req.headers.Authorization, 'Bearer owner');
                assert.equal(body.returnOobLink, true);
                assert.equal(body.requestType, 'VERIFY_EMAIL');
                const token = 'test-action-' + nextAction++;
                actions.set(token, Object.values(users).find(u => u.email === body.email));
                return { status: 200, body: { oobLink: 'https://example.test/auth?mode=verifyEmail&oobCode=' + token } };
            }
            case '/v1/accounts:update': {
                if (!actions.has(body.oobCode)) return { status: 400, body: {} };
                const user = actions.get(body.oobCode);
                user.emailVerified = true; tokens++;
                actions.delete(body.oobCode);
                return { status: 200, body: user };
            }
            default: throw new Error('Unexpected call');
            }
        }, ...options
    });
    const call = (action, token = 'a', extra = {}) => script.request({ action, idToken: token, ...extra });
    return { script, users, mail, applied: () => tokens, advance: ms => { now += ms; }, fail: value => { failDelivery = value; },
        send: (token, extra) => call('requestEmailCode', token, extra),
        code: () => mail.at(-1).body.match(/\b\d{6}\b/)[0],
        confirm: (code, token) => call('confirmEmailCode', token, { code }) };
}
{
    const f = fixture(), payload = { action: 'requestEmailCode', idToken: 'a' };
    assert.equal(f.script.request(payload, 'GET').reason, 'invalid_request');
    assert.equal(f.script.request(payload, 'POST', 'idToken=a').reason, 'invalid_request');
    assert.equal(f.send('bad').reason, 'session');
    const sent = f.send('a', { email: 'elsewhere@example.test' });
    assert.deepEqual(sent, { success: true, retryAfter: 60 });
    assert.equal(f.mail[0].to, f.users.a.email);
    assert.match(f.code(), /^0\d{5}$/);
    assert.equal(f.confirm(f.code(), 'b').reason, 'expired');
    assert.equal(f.send().retryAfter, 60);
    assert.deepEqual(f.confirm(f.code()), { success: true, verified: true });
    assert.deepEqual(f.confirm(f.code()), { success: true, verified: true });
    assert.equal(f.applied(), 1);
    assert.equal(f.mail.length, 1);
}
{
    const f = fixture();
    f.send();
    const first = f.code();
    f.advance(60000); f.send();
    assert.notEqual(f.code(), first);
    assert.equal(f.confirm(first).reason, 'wrong_code');
    assert.equal(f.confirm(f.code()).verified, true);
}
{
    const f = fixture();
    f.send();
    const wrong = f.code() === '000000' ? '000001' : '000000';
    for (let i = 0; i < 4; i++) assert.equal(f.confirm(wrong).reason, 'wrong_code');
    assert.equal(f.confirm(wrong).reason, 'attempts');
    assert.equal(f.confirm(f.code()).reason, 'expired');
    for (let i = 1; i < 5; i++) { f.advance(60000); assert.equal(f.send().success, true); }
    f.advance(60000);
    assert.ok(f.send().retryAfter >= 3000);
    f.advance(600000);
    assert.equal(f.confirm(f.code()).reason, 'expired');
    assert.equal(f.applied(), 0);
}
{
    const f = fixture();
    assert.equal(f.send().success, true);
    const [envelope] = f.script.requests;
    const forged = { ...envelope, message: envelope.message.replace('reader@example.test', 'other@example.test') };
    assert.equal(f.script.postToMailer(forged).success, false);
    assert.equal(f.script.postToMailer(envelope).success, true);
    assert.equal(f.mail.length, 1);
    f.advance(150000);
    assert.equal(f.script.postToMailer(envelope).success, false);
    assert.equal(f.mail.length, 1);
}
{
    for (const [options, reason] of [[{ connected: false }, 'unavailable'], [{ sender: 'owner@example.test' }, 'delivery'],
        [{ quota: () => 0 }, 'mail_quota']]) {
        const f = fixture(options);
        assert.equal(f.send().reason, reason);
        assert.equal(f.mail.length, 0);
    }
    const f = fixture();
    f.send();
    const first = f.code();
    f.advance(60000); f.fail(true);
    assert.equal(f.send().reason, 'delivery');
    assert.equal(f.confirm(first).verified, true);
}
{
    const f = fixture();
    f.fail(true);
    assert.equal(f.send().reason, 'delivery');
    assert.equal(f.confirm('123456').reason, 'expired');
    f.advance(60000); f.fail(false);
    f.send();
    f.users.a.email = 'updated@example.test';
    assert.equal(f.confirm(f.code()).reason, 'expired');
    assert.equal(f.applied(), 0);
}
console.log('Account email verification checks passed.');
