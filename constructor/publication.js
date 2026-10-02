(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.NotePublication = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    function canonical(value) {
        if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
        if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
        return JSON.stringify(value);
    }
    async function fingerprint(value) {
        const bytes = new TextEncoder().encode(canonical(value));
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    function create(options) {
        const key = 'note-publications-v1:' + options.owner;
        let records = {}, timer, stopped = false, running = false;
        try { records = JSON.parse(options.storage.getItem(key) || '{}'); } catch (_) {}
        function save() {
            try { options.storage.setItem(key, JSON.stringify(records)); } catch (_) {}
            options.onChange?.();
        }
        const id = (subject, section) => subject + '/' + section;
        function get(subject, section) { return records[id(subject, section)] || null; }
        async function json(url) {
            const response = await options.fetch(url + '?publication=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(12000) });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        }
        async function check(record) {
            try {
                // Check the deployed section itself, not merely an accepted Git commit.
                // This also works if another commit was published in the meantime.
                const deployed = await json(record.path);
                const actual = options.normalize ? options.normalize(deployed) : deployed;
                if (await fingerprint(actual) === record.fingerprint) {
                    record.stage = 'live';
                    record.liveAt = Date.now();
                    record.error = '';
                } else record.error = '';
            } catch (_) { record.error = 'Не удалось проверить сайт. Изменения отправлены; повторите проверку.'; }
            record.checkedAt = Date.now();
        }
        async function poll() {
            if (running || stopped) return;
            running = true;
            const pending = Object.values(records).filter(record => record.stage !== 'live' && Date.now() - record.acceptedAt < 5 * 60 * 1000);
            try { for (const record of pending) { if (stopped) break; await check(record); } }
            finally { running = false; }
            if (stopped) return;
            save();
            if (pending.some(record => record.stage !== 'live')) timer = setTimeout(poll, 10000);
        }
        async function track(subject, section, commitSha, publishedSection) {
            const value = options.normalize ? options.normalize(publishedSection) : publishedSection;
            const version = JSON.stringify({ revision: Number(publishedSection.revision) || 0, updatedAt: Number(publishedSection.updatedAt) || 0, updatedBy: String(publishedSection.updatedBy || '') });
            const record = { subject, section, version, commitSha: String(commitSha || ''), fingerprint: await fingerprint(value), path: 'content/' + subject + '/sections/' + section + '.json', acceptedAt: Date.now(), checkedAt: 0, stage: 'pending', error: '' };
            records[id(subject, section)] = record;
            save();
            clearTimeout(timer);
            poll();
            return record;
        }
        async function retry(subject, section) {
            const record = get(subject, section);
            if (!record || stopped) return;
            await check(record);
            save();
        }
        return { get, track, retry, start: poll, stop() { stopped = true; clearTimeout(timer); } };
    }
    return { canonical, fingerprint, create };
});
