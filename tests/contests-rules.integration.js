'use strict';

const fs = require('node:fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');

(async function () {
    const env = await initializeTestEnvironment({
        projectId: 'almanion-rules-test',
        database: { rules: fs.readFileSync('firebase/database.rules.json', 'utf8') }
    });
    try {
        const ownerUid = '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2';
        const registered = uid => env.authenticatedContext(uid, {
            email: uid + '@example.test', firebase: { sign_in_provider: 'password' }
        }).database();
        const owner = registered(ownerUid);
        const viewer = registered('contest-reader');
        const stranger = registered('other-reader');
        const guest = env.authenticatedContext('guest', { firebase: { sign_in_provider: 'anonymous' } }).database();
        const config = {
            title: 'Контесты', spreadsheetId: 'test-sheet-identifier-0123456789',
            apiKey: 'test-read-only-key-0123456789', range: "'Результаты'!A1:Z1000", totalColumn: 5
        };
        await env.withSecurityRulesDisabled(async context => {
            await context.database().ref('adminRoles/contest-reader/contestsAccess').set(true);
            await context.database().ref('adminRoles/guest/contestsAccess').set(true);
        });
        await assertSucceeds(owner.ref('contestTable').set(config));
        await assertSucceeds(viewer.ref('contestTable').once('value'));
        await assertFails(stranger.ref('contestTable').once('value'));
        await assertFails(guest.ref('contestTable').once('value'));
        await assertFails(env.unauthenticatedContext().database().ref('contestTable').once('value'));
        await assertFails(viewer.ref('contestTable/title').set('Changed'));
        await assertFails(viewer.ref('adminRoles/contest-reader/contestsAccess').set(true));
        await assertFails(owner.ref('contestTable/totalColumn').set(-1));
        await assertSucceeds(owner.ref('adminRoles/contest-reader').remove());
        await assertFails(viewer.ref('contestTable').once('value'));
        console.log('Contest permissions: owner, registered viewer, denial, revocation and read-only access passed');
    } finally {
        await env.cleanup();
    }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
