'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment
} = require('@firebase/rules-unit-testing');

const projectId = 'almanion-rules-test';

function auth(uid, provider, extra) {
    return Object.assign({
        firebase: { sign_in_provider: provider }
    }, extra || {});
}

function meta(uid, provider) {
    return {
        visitorId: uid,
        authProvider: provider,
        browserContext: 'web'
    };
}

(async function () {
    const environment = await initializeTestEnvironment({
        projectId: projectId,
        database: {
            rules: fs.readFileSync(path.join(__dirname, '..', 'firebase', 'database.rules.json'), 'utf8')
        }
    });
    try {
        const anonUid = 'anonymous-browser-1';
        const otherUid = 'anonymous-browser-2';
        const anonDb = environment.authenticatedContext(anonUid, auth(anonUid, 'anonymous')).database();
        const accountUid = 'account-user-1';
        const accountDb = environment.authenticatedContext(accountUid, auth(accountUid, 'password', {
            email: 'reader@example.test'
        })).database();
        const ownerDb = environment.authenticatedContext('2M2ZdLQcJAhluPjUVFNJ6MyQrdH2', auth(
            '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2',
            'password',
            { email: 'dmb23930@gmail.com' }
        )).database();

        await assertSucceeds(anonDb.ref('presence/' + anonUid).set(Object.assign(meta(anonUid, 'anonymous'), {
            page: '/', pageTitle: 'Home', timestamp: 1, userAgent: 'test'
        })));
        await assertFails(anonDb.ref('presence/' + otherUid).set(Object.assign(meta(otherUid, 'anonymous'), {
            page: '/', pageTitle: 'Home', timestamp: 1, userAgent: 'test'
        })));

        await assertSucceeds(accountDb.ref('visitors/' + accountUid).set(Object.assign(meta(accountUid, 'password'), {
            id: accountUid, firstVisit: 1, lastVisit: 2, lastPage: '/', pageViews: 1
        })));
        await assertFails(accountDb.ref('visitors/' + accountUid).update({ authProvider: 'anonymous' }));

        await assertSucceeds(anonDb.ref('dailyStats/2026-09-08/' + anonUid).set(Object.assign(meta(anonUid, 'anonymous'), {
            lastVisit: 1
        })));
        await assertSucceeds(anonDb.ref('analyticsSessions/2026-09-08/' + anonUid + '/session-1').set(Object.assign(meta(anonUid, 'anonymous'), {
            page: '/', pageTitle: 'Home', startedAt: 1, lastActive: 2,
            durationSeconds: 1, device: 'desktop', referrerHost: 'direct'
        })));
        await assertSucceeds(anonDb.ref('webVitals/2026-09-08/' + anonUid + '/session-1').set(Object.assign(meta(anonUid, 'anonymous'), {
            page: '/', deployment: 'test', lcp: 1200, cls: 0.02, inp: 80,
            navigationMs: 400, failedResources: 0, recordedAt: 2
        })));
        await assertFails(accountDb.ref('webVitals/2026-09-08/' + anonUid + '/session-2').set(Object.assign(meta(anonUid, 'password'), {
            page: '/', deployment: 'test', lcp: 1, cls: 0, inp: 0,
            navigationMs: 1, failedResources: 0, recordedAt: 2
        })));

        await environment.withSecurityRulesDisabled(async function (context) {
            await context.database().ref('directMessages/' + anonUid + '/message-1').set({
                message: 'test', read: false
            });
        });
        await assertSucceeds(anonDb.ref('directMessages/' + anonUid).once('value'));
        await assertFails(accountDb.ref('directMessages/' + anonUid).once('value'));
        await assertSucceeds(anonDb.ref('directMessages/' + anonUid + '/message-1/read').set(true));
        await assertSucceeds(ownerDb.ref('visitors').once('value'));
        await assertFails(anonDb.ref('visitors').once('value'));

        const auditRecord = {
            actorUid: '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2',
            action: 'admin_roles_updated',
            targetUid: accountUid,
            summary: 'contentEditor',
            timestamp: { '.sv': 'timestamp' }
        };
        await assertSucceeds(ownerDb.ref().update({
            ['adminRoles/' + accountUid]: {
                email: 'reader@example.test',
                siteAdmin: false,
                matcenterAdmin: false,
                contentEditor: true,
                dutyEditor: false,
                englishAccess: false,
                updatedAt: { '.sv': 'timestamp' },
                updatedBy: '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2'
            },
            'auditLog/event-role-atomic': auditRecord
        }));
        await assertSucceeds(ownerDb.ref('auditLog/event-1').set(auditRecord));
        await assertFails(ownerDb.ref('auditLog/event-1').update({ summary: 'changed later' }));
        await assertFails(accountDb.ref('auditLog/event-2').set(Object.assign({}, auditRecord, {
            actorUid: accountUid
        })));

        await assertSucceeds(ownerDb.ref('presence').remove());
        await assertSucceeds(ownerDb.ref('visitors').remove());
        await assertSucceeds(ownerDb.ref('dailyStats').remove());
        await assertSucceeds(ownerDb.ref('analyticsSessions').remove());
        await assertSucceeds(ownerDb.ref('webVitals').remove());
        await assertSucceeds(ownerDb.ref('pollResponses').remove());

        console.log('firebase rules integration: all tests passed');
    } finally {
        await environment.cleanup();
    }
})().catch(function (error) {
    console.error(error && error.stack || error);
    process.exitCode = 1;
});
