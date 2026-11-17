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
        const publicDb = env.unauthenticatedContext().database();
        const token = 'a'.repeat(64);
        const replacement = 'b'.repeat(64);
        const sharing = token => ({ enabled: true, token, updatedBy: ownerUid, updatedAt: { '.sv': 'timestamp' } });
        await assertSucceeds(owner.ref().update({ contestSharing: sharing(token), ['contestLinks/' + token]: config }));
        await assertSucceeds(publicDb.ref('contestLinks/' + token).once('value'));
        await assertSucceeds(stranger.ref('contestLinks/' + token).once('value'));
        await assertFails(publicDb.ref('contestTable').once('value'));
        await assertFails(publicDb.ref('contestSharing').once('value'));
        await assertFails(publicDb.ref('contestSharing/token').once('value'));
        await assertFails(publicDb.ref('contestLinks').once('value'));
        await assertFails(publicDb.ref('contestLinks/' + replacement).once('value'));
        await assertFails(publicDb.ref('contestLinks/' + token + '/title').set('Changed'));
        await assertFails(stranger.ref('contestSharing/enabled').set(false));
        await assertFails(owner.ref('contestLinks/' + replacement).set({ ...config, spreadsheetId: 'another-sheet-identifier-0123456789' }));
        await assertFails(owner.ref('contestSharing/token').set('short'));
        await assertSucceeds(owner.ref().update({ contestSharing: sharing(replacement), ['contestLinks/' + token]: null, ['contestLinks/' + replacement]: config }));
        await assertFails(publicDb.ref('contestLinks/' + token).once('value'));
        await assertSucceeds(publicDb.ref('contestLinks/' + replacement).once('value'));
        await assertSucceeds(owner.ref().update({ contestSharing: { ...sharing(replacement), enabled: false }, ['contestLinks/' + replacement]: null }));
        await assertFails(publicDb.ref('contestLinks/' + replacement).once('value'));
        await assertSucceeds(owner.ref('contestTable').once('value'));
        console.log('Contest sharing: bearer access, hidden registry, read-only scope, rotation and revocation passed');
        console.log('Contest permissions: owner, registered viewer, denial, revocation and read-only access passed');
    } finally {
        await env.cleanup();
    }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
