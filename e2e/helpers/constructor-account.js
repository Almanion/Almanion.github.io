// Isolated Firebase-compatible test double. Never connects to a real account/database.
module.exports = function installConstructorAccount() {
    const snapshot = value => ({ val: () => structuredClone(value ?? null), exists: () => value != null });
    const read = path => path.split('/').filter(Boolean).reduce((value, key) => value?.[key], JSON.parse(localStorage.getItem('test:cloud') || '{}')) ?? null;
    const write = (path, value) => {
        const data = JSON.parse(localStorage.getItem('test:cloud') || '{}');
        const keys = path.split('/').filter(Boolean);
        let parent = data;
        keys.slice(0, -1).forEach(key => parent = parent[key] ||= {});
        parent[keys.at(-1)] = value;
        localStorage.setItem('test:cloud', JSON.stringify(data));
    };
    window.testCloud = { read, write, offline: false };
    const ref = (path = '') => ({
        once: async () => { if (window.testCloud.offline) throw new Error('Offline'); return snapshot(read(path)); },
        set: async value => { if (window.testCloud.offline) throw new Error('Offline'); write(path, value); },
        limitToLast() { return this; },
        transaction: async update => {
            if (window.testCloud.offline) throw new Error('Offline');
            const next = update(read(path));
            if (next !== undefined) write(path, next);
            return { committed: next !== undefined, snapshot: snapshot(read(path)) };
        }
    });
    const role = new URLSearchParams(location.search).get('testRole') || 'owner';
    const user = role === 'guest' ? null : { uid: role === 'owner' ? '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2' : 'test-editor', email: 'test@example.invalid', getIdToken: async () => 'test-token-not-real' };
    if (role === 'editor') write('adminRoles/test-editor/contentEditor', true);
    window.AlmanionAccount = { auth: { onAuthStateChanged: callback => callback(user) }, database: { ref } };
};
