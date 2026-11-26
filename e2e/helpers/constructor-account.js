// Isolated Firebase-compatible test double. Never connects to a real account/database.
module.exports = function installConstructorAccount() {
    const snapshot = (value, key) => ({
        key, val: () => structuredClone(value ?? null), exists: () => value != null,
        forEach: callback => Object.entries(value || {}).some(([id, entry]) => callback(snapshot(entry, id)) === true)
    });
    const read = path => path.split('/').filter(Boolean).reduce((value, key) => value?.[key], JSON.parse(localStorage.getItem('test:cloud') || '{}')) ?? null;
    const listeners = new Set();
    let nextReview = Number(localStorage.getItem('test:next-review')) || 0;
    function update(entries) {
        const data = JSON.parse(localStorage.getItem('test:cloud') || '{}');
        for (const [path, value] of entries) {
            const keys = path.split('/').filter(Boolean);
            let parent = data;
            keys.slice(0, -1).forEach(key => parent = parent[key] ||= {});
            parent[keys.at(-1)] = value;
        }
        localStorage.setItem('test:cloud', JSON.stringify(data));
        for (const listener of listeners) {
            if (entries.some(([path]) => path === listener.path || path.startsWith(listener.path + '/') || listener.path.startsWith(path + '/'))) {
                listener.callback(listener.snapshot());
            }
        }
    }
    const write = (path, value) => update([[path, value]]);
    window.testCloud = { read, write, offline: false };
    const requireConnection = () => { if (window.testCloud.offline) throw new Error('Offline'); };
    const ref = (path = '', key = '', filter) => {
        const getSnapshot = () => {
            const data = read(path);
            return snapshot(key && filter !== undefined
                ? Object.fromEntries(Object.entries(data || {}).filter(([, row]) => row[key] === filter))
                : data);
        };
        return {
            once: async () => { requireConnection(); return getSnapshot(); },
            set: async value => { requireConnection(); write(path, value); },
            update: async patches => {
                requireConnection();
                update(Object.entries(patches).map(([suffix, value]) => [path ? path + '/' + suffix : suffix, value]));
            },
            child: suffix => ref(path ? path + '/' + suffix : suffix),
            push: () => {
                localStorage.setItem('test:next-review', String(++nextReview));
                return { key: '-test-review-' + String(nextReview).padStart(7, '0') };
            },
            orderByChild: name => ref(path, name),
            equalTo: value => ref(path, key, value),
            limitToLast() { return this; },
            on(_event, callback) {
                listeners.add({ path, callback, snapshot: getSnapshot });
                callback(getSnapshot());
            },
            off(_event, callback) {
                for (const item of listeners) if (item.callback === callback && item.path === path) listeners.delete(item);
            },
            transaction: async change => {
                requireConnection();
                const next = change(read(path));
                if (next !== undefined) write(path, next);
                return { committed: next !== undefined, snapshot: getSnapshot() };
            }
        };
    };
    const role = new URLSearchParams(location.search).get('testRole') || window.testDefaultRole || 'owner';
    const user = role === 'guest' ? null : { uid: role === 'owner' ? '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2' : 'test-editor', email: 'test@example.invalid', getIdToken: async () => 'test-token-not-real' };
    if (role === 'editor') write('adminRoles/test-editor/contentEditor', true);
    window.AlmanionAccount = {
        auth: { onAuthStateChanged: callback => callback(user) },
        database: { ref },
        hasContentEditorAccess: async () => role === 'editor' || role === 'owner'
    };
};
