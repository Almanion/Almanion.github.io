'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'account.js'), 'utf8');
const resetSource = source.slice(source.indexOf('    const PASSWORD_RESET_COMPLETE ='), source.indexOf('    function doEmail('));
assert.ok(resetSource.includes('auth.sendPasswordResetEmail(email)'), 'recovery must use the Firebase password reset API');

function harness(action) {
    const status = { hidden: true, textContent: '' };
    const attributes = new Map();
    const form = {
        querySelector: selector => selector === '#accResetStatus' ? status : null,
        setAttribute: (key, value) => attributes.set(key, value),
        removeAttribute: key => attributes.delete(key)
    };
    const calls = [];
    const errors = [];
    const context = {
        authBusy: false,
        auth: { sendPasswordResetEmail: email => { calls.push(email); return action(); } },
        clearError() { errors.length = 0; },
        showError: message => errors.push(message),
        document: { getElementById: id => id === 'accForm' ? form : null },
        setAuthBusy(value) { context.authBusy = value; }
    };
    vm.runInNewContext(resetSource + '\nthis.reset = sendPasswordReset; this.message = passwordResetMessage; this.complete = PASSWORD_RESET_COMPLETE;', context);
    return { context, calls, errors, form, status, attributes };
}

(async function () {
    let resolve;
    const pending = harness(() => new Promise(done => { resolve = done; }));
    const request = pending.context.reset('student@example.invalid', pending.form);
    assert.equal(pending.context.authBusy, true);
    assert.equal(pending.attributes.get('aria-busy'), 'true');
    assert.equal(pending.status.textContent, 'Отправляем письмо…');
    pending.context.reset('duplicate@example.invalid', pending.form);
    await Promise.resolve();
    assert.deepEqual(pending.calls, ['student@example.invalid'], 'repeated submissions must not send duplicate mail');
    resolve();
    await request;
    assert.equal(pending.context.authBusy, false);
    assert.equal(pending.attributes.has('aria-busy'), false);
    assert.equal(pending.status.hidden, false);
    assert.equal(pending.status.textContent, pending.context.complete);
    assert.deepEqual(pending.errors, []);

    for (const code of ['auth/user-not-found', 'auth/user-disabled']) {
        const hiddenAccount = harness(() => Promise.reject({ code, message: 'Private account information' }));
        await hiddenAccount.context.reset('student@example.invalid', hiddenAccount.form);
        assert.equal(hiddenAccount.status.textContent, pending.status.textContent, `${code} must have identical completion text`);
        assert.deepEqual(hiddenAccount.errors, []);
    }

    for (const code of ['auth/invalid-email', 'auth/network-request-failed', 'auth/too-many-requests', 'auth/internal-error']) {
        const failed = harness(() => Promise.reject({ code, message: 'Private account information' }));
        await failed.context.reset('student@example.invalid', failed.form);
        assert.equal(failed.status.hidden, true);
        assert.equal(failed.context.authBusy, false);
        assert.equal(failed.errors.length, 1);
        assert.ok(!failed.errors[0].includes('Private account information'));
        assert.ok(!failed.errors[0].includes(code), 'raw SDK errors must not be exposed');
    }

    const syncFailure = harness(() => { throw { code: 'auth/network-request-failed' }; });
    await syncFailure.context.reset('student@example.invalid', syncFailure.form);
    assert.equal(syncFailure.context.authBusy, false, 'synchronous SDK errors must unlock the controls');
    assert.equal(syncFailure.errors.length, 1);

    const closed = harness(() => Promise.reject({ code: 'auth/network-request-failed' }));
    closed.context.document.getElementById = () => null;
    await closed.context.reset('student@example.invalid', closed.form);
    assert.deepEqual(closed.errors, [], 'an old request must not write an error into a newly opened form');

    console.log('account password recovery: all tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
