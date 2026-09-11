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

function serverTimestamp() {
    return { '.sv': 'timestamp' };
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
        const forgedOwnerDb = environment.authenticatedContext('forged-owner-email', auth(
            'forged-owner-email',
            'password',
            { email: 'dmb23930@gmail.com' }
        )).database();

        await assertSucceeds(anonDb.ref('presence/' + anonUid).set(Object.assign(meta(anonUid, 'anonymous'), {
            page: '/', pageTitle: 'Home', timestamp: serverTimestamp(), userAgent: 'test'
        })));
        await assertFails(anonDb.ref('presence/' + otherUid).set(Object.assign(meta(otherUid, 'anonymous'), {
            page: '/', pageTitle: 'Home', timestamp: serverTimestamp(), userAgent: 'test'
        })));

        await assertSucceeds(accountDb.ref('visitors/' + accountUid).set(Object.assign(meta(accountUid, 'password'), {
            id: accountUid, firstVisit: serverTimestamp(), lastVisit: serverTimestamp(), lastPage: '/', pageViews: 1
        })));
        await assertFails(accountDb.ref('visitors/' + accountUid).update({ authProvider: 'anonymous' }));
        await assertFails(accountDb.ref('visitors/' + accountUid).update({ firstVisit: serverTimestamp(), pageViews: 2 }));
        await assertFails(accountDb.ref('visitors/' + accountUid).update({ lastVisit: serverTimestamp(), pageViews: 3 }));
        await assertSucceeds(accountDb.ref('visitors/' + accountUid).update({
            lastVisit: serverTimestamp(),
            pageViews: 2
        }));
        await assertSucceeds(accountDb.ref('accountDirectory/' + accountUid).set({
            email: 'reader@example.test',
            displayName: 'Reader',
            lastSeen: serverTimestamp()
        }));
        await assertFails(accountDb.ref('accountDirectory/' + accountUid).update({ lastSeen: 1 }));
        await assertFails(accountDb.ref('accountDirectory/' + otherUid).set({
            email: 'reader@example.test',
            displayName: 'Reader',
            lastSeen: serverTimestamp()
        }));

        await assertSucceeds(anonDb.ref('dailyStats/2026-09-08/' + anonUid).set(Object.assign(meta(anonUid, 'anonymous'), {
            lastVisit: serverTimestamp()
        })));
        await assertSucceeds(anonDb.ref('analyticsSessions/2026-09-08/' + anonUid + '/session-1').set(Object.assign(meta(anonUid, 'anonymous'), {
            page: '/', pageTitle: 'Home', startedAt: serverTimestamp(), lastActive: serverTimestamp(),
            durationSeconds: 1, device: 'desktop', referrerHost: 'direct'
        })));
        await assertSucceeds(anonDb.ref('analyticsSessions/2026-09-08/' + anonUid + '/session-1').update({
            lastActive: serverTimestamp(),
            durationSeconds: 2
        }));
        await assertFails(anonDb.ref('analyticsSessions/2026-09-08/' + anonUid + '/session-1').update({
            lastActive: serverTimestamp(),
            durationSeconds: 1
        }));
        await assertSucceeds(anonDb.ref('webVitals/2026-09-08/' + anonUid + '/session-1').set(Object.assign(meta(anonUid, 'anonymous'), {
            page: '/', deployment: 'test', lcp: 1200, cls: 0.02, inp: 80,
            navigationMs: 400, failedResources: 0, recordedAt: serverTimestamp()
        })));
        await assertFails(accountDb.ref('webVitals/2026-09-08/' + anonUid + '/session-2').set(Object.assign(meta(anonUid, 'password'), {
            page: '/', deployment: 'test', lcp: 1, cls: 0, inp: 0,
            navigationMs: 1, failedResources: 0, recordedAt: serverTimestamp()
        })));
        await assertSucceeds(accountDb.ref('pollResponses/poll-1/' + accountUid).set(Object.assign(meta(accountUid, 'password'), {
            optionIndex: 0,
            optionText: 'Yes',
            timestamp: serverTimestamp(),
            page: '/'
        })));
        await assertFails(accountDb.ref('pollResponses/poll-2/' + accountUid).set(Object.assign(meta(accountUid, 'password'), {
            optionIndex: 0,
            optionText: 'Yes',
            timestamp: 1,
            page: '/'
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
        await assertFails(forgedOwnerDb.ref('visitors').once('value'));
        await assertFails(forgedOwnerDb.ref('adminRoles').once('value'));
        await assertFails(forgedOwnerDb.ref('adminRoles/' + accountUid).set({
            email: 'reader@example.test',
            siteAdmin: true,
            matcenterAdmin: true,
            contentEditor: true,
            dutyEditor: true,
            englishAccess: true,
            updatedAt: serverTimestamp(),
            updatedBy: 'forged-owner-email'
        }));

        const suggestion = {
            html: '<div class="definition-box">Safe suggestion</div>',
            type: 'definition-box',
            preview: 'Safe suggestion',
            author: 'reader@example.test',
            uid: accountUid,
            createdAt: serverTimestamp()
        };
        await assertSucceeds(accountDb.ref('blockSuggestions/' + accountUid + '/1788796800000').set(suggestion));
        await assertFails(accountDb.ref('blockSuggestions/' + accountUid + '/1788796800000').update({
            preview: 'Overwrite'
        }));
        await assertFails(accountDb.ref('blockSuggestions/' + anonUid + '/1788796800001').set(Object.assign({}, suggestion, {
            author: 'reader@example.test',
            uid: anonUid
        })));
        await assertFails(forgedOwnerDb.ref('blockSuggestions').once('value'));
        await assertSucceeds(ownerDb.ref('blockSuggestions').once('value'));
        await assertSucceeds(ownerDb.ref('blockSuggestions/' + accountUid + '/1788796800000').remove());

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
