'use strict';
async function setupAdmin(page, options = {}) {
    await page.route('https://www.gstatic.com/firebasejs/**', function (route) {
        return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });
    await page.addInitScript(function (options) {
        const owner = { uid: '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2', email: 'dmb23930@gmail.com' };
        const editor = { uid: 'editor-1', email: 'editor@example.com' };
        const values = {
            '.info': { connected: true, serverTimeOffset: 0 },
            accountDirectory: {
                '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2': { email: owner.email, displayName: 'Owner', lastSeen: Date.now() },
                'editor-1': { email: 'editor@example.com', displayName: 'Editor', lastSeen: Date.now() - 1000 }
            },
            adminRoles: {
                'editor-1': { email: 'editor@example.com', contentEditor: true }
            },
            contestTable: { title: 'Контесты', spreadsheetId: 'test-sheet-identifier-0123456789', apiKey: 'test-read-only-key-0123456789', range: "'Scores'!A1:Z1000", totalColumn: 5 },
            presence: {
                session1: { visitorId: 'visitor-1', page: '/physics-10.html', timestamp: Date.now(), userAgent: 'Desktop' }
            },
            visitors: {
                'visitor-1': { lastVisit: Date.now(), pageViews: 3, lastPage: '/physics-10.html' }
            },
            visitorNames: { 'visitor-1': 'Test visitor' },
            polls: {
                poll1: { question: 'Test poll', description: 'For controls', options: ['Yes', 'No'], active: false, createdAt: Date.now() },
                poll2: { question: 'Active poll', description: 'For controls', options: ['One', 'Two'], active: true, createdAt: Date.now() - 1000 }
            },
            pollResponses: {
                poll1: {
                    'visitor-1': { optionIndex: 0, optionText: 'Yes', timestamp: Date.now() }
                }
            }
        };
        function valueAt(path) {
            const parts = String(path || '').split('/').filter(Boolean);
            let value = values;
            for (const part of parts) value = value && typeof value === 'object' ? value[part] : null;
            return value == null ? null : value;
        }
        function snapshot(value, key) {
            return {
                key: key || null,
                val: function () { return value; },
                forEach: function (callback) {
                    Object.entries(value || {}).forEach(function (entry) {
                        callback(snapshot(entry[1], entry[0]));
                    });
                }
            };
        }
        let failedAccountDirectoryListener = !options.failDirectoryStartup;
        const listeners = new Map();
        const authListeners = [];
        const reads = [];
        const delayedDirectory = [];
        const delayedRoles = [];
        if (options.role === 'admin') values.adminRoles['editor-1'].siteAdmin = true;
        function ref(path) {
            const reference = {
                key: 'mock-key',
                on: function (_event, callback) {
                    reads.push(path);
                    if (path === 'accountDirectory' && !failedAccountDirectoryListener) {
                        failedAccountDirectoryListener = true;
                        throw new Error('mock listener startup failure');
                    }
                    if (!listeners.has(path)) listeners.set(path, new Set());
                    listeners.get(path).add(callback);
                    setTimeout(function () { if (listeners.get(path)?.has(callback)) callback(snapshot(valueAt(path))); }, 0);
                    return callback;
                },
                off: function (_event, callback) {
                    if (callback) listeners.get(path)?.delete(callback);
                    else listeners.get(path)?.clear();
                },
                once: function () {
                    reads.push(path);
                    if (path === 'accountDirectory' && options.deferDirectory) return new Promise(resolve => delayedDirectory.push(() => resolve(snapshot(valueAt(path)))));
                    if (path === 'adminRoles' && options.deferRoles) return new Promise(resolve => delayedRoles.push(() => resolve(snapshot(valueAt(path)))));
                    return Promise.resolve(snapshot(valueAt(path)));
                },
                orderByChild: function () { return reference; },
                push: function (value) { return value === undefined ? { key: 'mock-key' } : Promise.resolve(); },
                set: function () { return Promise.resolve(); },
                remove: function () { return Promise.resolve(); },
                update: function (updates) {
                    for (const [key, value] of Object.entries(updates)) {
                        const parts = [path, key].filter(Boolean).join('/').split('/');
                        let parent = values;
                        for (const part of parts.slice(0, -1)) parent = parent[part] ||= {};
                        if (value === null) delete parent[parts.at(-1)];
                        else parent[parts.at(-1)] = value;
                    }
                    return Promise.resolve();
                }
            };
            return reference;
        }
        const auth = {
            currentUser: options.signedOut ? null : (options.role === 'admin' ? editor : owner),
            onAuthStateChanged: function (callback) { authListeners.push(callback); setTimeout(function () { callback(auth.currentUser); }, 0); },
            signInWithEmailAndPassword: function () { setUser(owner); return Promise.resolve({ user: owner }); },
            signOut: function () { setUser(null); return Promise.resolve(); }
        };
        function setUser(user) {
            auth.currentUser = user;
            authListeners.forEach(callback => callback(user));
        }
        window.adminFixture = {
            owner: () => setUser(owner),
            admin: () => {
                values.adminRoles['editor-1'].siteAdmin = true;
                setUser({ uid: 'editor-1', email: 'editor@example.com' });
            },
            logout: () => setUser(null),
            reads: () => [...reads],
            flushDirectory: () => { options.deferDirectory = false; delayedDirectory.splice(0).forEach(resolve => resolve()); },
            flushRoles: () => { options.deferRoles = false; delayedRoles.splice(0).forEach(resolve => resolve()); },
            listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0)
        };
        const database = function () { return { ref: ref }; };
        database.ServerValue = { TIMESTAMP: Date.now() };
        window.firebase = {
            initializeApp: function () {},
            auth: function () { return auth; },
            database: database
        };
    }, options);
}
module.exports = { setupAdmin };
