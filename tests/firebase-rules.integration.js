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
        const tourEditorUid = 'tour-editor-1';
        const tourEditorDb = environment.authenticatedContext(tourEditorUid, auth(tourEditorUid, 'password', {
            email: 'tour-editor@example.test'
        })).database();
        const ordinaryUid = 'ordinary-user-1';
        const ordinaryDb = environment.authenticatedContext(ordinaryUid, auth(ordinaryUid, 'password', {
            email: 'ordinary@example.test'
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
            tourEditor: true,
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
                tourEditor: false,
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

        await assertSucceeds(ownerDb.ref('adminRoles/' + tourEditorUid).set({
            email: 'tour-editor@example.test',
            siteAdmin: false,
            matcenterAdmin: false,
            contentEditor: false,
            dutyEditor: false,
            tourEditor: true,
            englishAccess: false,
            updatedAt: serverTimestamp(),
            updatedBy: '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2'
        }));

        const personA = 'p_0123456789abcdef01234567';
        const personB = 'p_89abcdef0123456701234567';
        const rosterPayload = function (revision, uid) {
            return {
                version: 1,
                className: '10-1',
                revision: revision,
                updatedAt: serverTimestamp(),
                updatedBy: uid,
                members: {
                    [personA]: { displayName: 'Аня Примерова', order: 1, active: true },
                    [personB]: { displayName: 'Борис Примеров', order: 2, active: true }
                }
            };
        };
        await assertSucceeds(ownerDb.ref('classRosters/grade10_1').set(rosterPayload(
            1,
            '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2'
        )));
        await assertSucceeds(ownerDb.ref('classRosters/grade10_1').once('value'));
        await assertSucceeds(tourEditorDb.ref('classRosters/grade10_1').once('value'));
        await assertFails(anonDb.ref('classRosters/grade10_1').once('value'));
        await assertFails(ordinaryDb.ref('classRosters/grade10_1').once('value'));
        await assertFails(forgedOwnerDb.ref('classRosters/grade10_1').once('value'));
        await assertFails(tourEditorDb.ref('classRosters/grade10_1').set(rosterPayload(2, tourEditorUid)));
        await assertFails(ownerDb.ref('classRosters/grade10_1').remove());
        const invalidRoster = rosterPayload(2, '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2');
        invalidRoster.members.person_without_hash = { displayName: 'Ошибка', order: 3, active: true };
        await assertFails(ownerDb.ref('classRosters/grade10_1').set(invalidRoster));

        const tourPayload = function (revision, uid) {
            return {
                version: 1,
                className: '10-1',
                eventKey: 'autumn2026',
                revision: revision,
                updatedAt: serverTimestamp(),
                updatedBy: uid,
                info: {
                    title: 'Туристический слёт 10-1',
                    startDate: '2026-09-17',
                    endDate: '2026-09-19',
                    location: 'Озеро Уловное',
                    route: 'Санкт-Петербург — Колосково',
                    departure: '17 сентября после четвёртого урока',
                    return: '19 сентября, время уточняется',
                    leader: 'Алёна Александровна Лобанова'
                },
                schedule: {
                    departure: {
                        title: 'Отправление', date: '2026-09-17', order: 1,
                        timeLabel: '14:19', startTime: '14:19', location: 'Финляндский вокзал', note: ''
                    }
                },
                activities: {
                    orientation: {
                        title: 'Ориентирование', order: 1,
                        participants: { [personA]: true }
                    }
                },
                meals: {
                    'dinner-day-1': {
                        date: '2026-09-17', type: 'dinner', title: 'Ужин', order: 1, note: '',
                        participants: { [personB]: true }
                    }
                },
                tents: {
                    'tent-1': {
                        title: 'Палатка 1', order: 1, capacity: 4, note: '',
                        participants: { [personA]: true, [personB]: true }
                    }
                },
                people: {
                    [personA]: 'Аня Примерова',
                    [personB]: 'Борис Примеров'
                }
            };
        };

        await assertSucceeds(anonDb.ref('classTour/grade10_1/autumn2026').once('value'));
        await assertFails(anonDb.ref('classTour/grade10_1/autumn2026').set(tourPayload(1, anonUid)));
        await assertFails(ordinaryDb.ref('classTour/grade10_1/autumn2026').set(tourPayload(1, ordinaryUid)));
        await assertFails(forgedOwnerDb.ref('classTour/grade10_1/autumn2026').set(tourPayload(1, 'forged-owner-email')));
        await assertSucceeds(ownerDb.ref('classTour/grade10_1/autumn2026').set(tourPayload(
            1,
            '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2'
        )));
        await assertSucceeds(tourEditorDb.ref('classTour/grade10_1/autumn2026').set(tourPayload(2, tourEditorUid)));
        await assertFails(tourEditorDb.ref('classTour/grade10_1/autumn2026').remove());
        const emptyAssignmentsTour = tourPayload(3, tourEditorUid);
        delete emptyAssignmentsTour.activities.orientation.participants;
        delete emptyAssignmentsTour.meals['dinner-day-1'].participants;
        delete emptyAssignmentsTour.tents['tent-1'].participants;
        delete emptyAssignmentsTour.people;
        await assertSucceeds(tourEditorDb.ref('classTour/grade10_1/autumn2026').set(emptyAssignmentsTour));
        const invalidTour = tourPayload(4, tourEditorUid);
        invalidTour.activities.orientation.participants[personA] = false;
        await assertFails(tourEditorDb.ref('classTour/grade10_1/autumn2026').set(invalidTour));
        const unknownFieldTour = tourPayload(4, tourEditorUid);
        unknownFieldTour.unsafe = true;
        await assertFails(tourEditorDb.ref('classTour/grade10_1/autumn2026').set(unknownFieldTour));
        const unknownPerson = 'p_aaaaaaaaaaaaaaaaaaaaaaaa';
        const unknownPersonTour = tourPayload(4, tourEditorUid);
        unknownPersonTour.activities.orientation.participants[unknownPerson] = true;
        unknownPersonTour.people[unknownPerson] = 'Посторонний участник';
        await assertFails(tourEditorDb.ref('classTour/grade10_1/autumn2026').set(unknownPersonTour));
        const renamedPersonTour = tourPayload(4, tourEditorUid);
        renamedPersonTour.people[personA] = 'Другое имя';
        await assertFails(tourEditorDb.ref('classTour/grade10_1/autumn2026').set(renamedPersonTour));
        const endWithoutStartTour = tourPayload(4, tourEditorUid);
        delete endWithoutStartTour.schedule.departure.startTime;
        endWithoutStartTour.schedule.departure.endTime = '15:00';
        await assertFails(tourEditorDb.ref('classTour/grade10_1/autumn2026').set(endWithoutStartTour));
        await assertFails(tourEditorDb.ref('classTour/grade10_1/autumn2026').set(tourPayload(5, tourEditorUid)));

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
