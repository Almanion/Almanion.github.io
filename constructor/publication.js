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
        const checks = new Map();
        try { records = JSON.parse(options.storage.getItem(key) || '{}'); } catch (_) {}
        function save() {
            try { options.storage.setItem(key, JSON.stringify(records)); } catch (_) {}
            options.onChange?.();
        }
        const id = (subject, section) => subject + '/' + section;
        function get(subject, section) { return records[id(subject, section)] || null; }
        async function json(url) {
            const response = await options.fetch(url + (url.includes('?') ? '&' : '?') + 'publication=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(12000) });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        }
        async function performCheck(record) {
            try {
                // Check the deployed section itself, not merely an accepted Git commit.
                // This also works if another commit was published in the meantime.
                const deployed = await json(record.path);
                const actual = options.normalize ? options.normalize(deployed) : deployed;
                if (await fingerprint(actual) === record.fingerprint) {
                    record.stage = 'live';
                    record.liveAt = Date.now();
                    record.error = '';
                } else {
                    const waitingStage = Date.now() - record.acceptedAt >= 5 * 60 * 1000 ? 'delayed' : 'pending';
                    const waitingError = waitingStage === 'delayed' ? 'Правки сохранены в GitHub, но ещё не появились на сайте. Проверьте сборку или повторите проверку.' : '';
                    if (record.stage !== 'failed') { record.stage = waitingStage; record.error = waitingError; }
                    if (record.commitSha && Date.now() - record.acceptedAt >= 30000 && Date.now() - (record.deploymentCheckedAt || 0) >= 60000) {
                        record.deploymentCheckedAt = Date.now();
                        try {
                            const repository = options.repository || 'Almanion/almanion.github.io';
                            const result = await json('https://api.github.com/repos/' + repository + '/actions/runs?head_sha=' + encodeURIComponent(record.commitSha) + '&per_page=5');
                            const run = (result.workflow_runs || []).find(item => item.name === 'Deploy GitHub Pages' || /pages|deploy/i.test(item.name));
                            if (run?.html_url?.startsWith('https://github.com/')) record.deploymentUrl = run.html_url;
                            if (run?.status === 'completed' && !['success', 'neutral', 'skipped'].includes(run.conclusion)) {
                                record.stage = 'failed';
                                record.error = 'Правки сохранены в GitHub, но сборка сайта завершилась ошибкой. После исправления сборки они появятся на сайте.';
                            } else if (run) {
                                record.stage = waitingStage; record.error = waitingError;
                            }
                        } catch (_) { /* Public API can be unavailable; keep the verifiable deployment status. */ }
                    }
                }
            } catch (_) {
                if (record.stage !== 'failed') {
                    record.stage = Date.now() - record.acceptedAt >= 5 * 60 * 1000 ? 'delayed' : 'pending';
                    record.error = 'Не удалось проверить сайт. Изменения отправлены; повторите проверку.';
                }
            }
            record.checkedAt = Date.now();
        }
        async function check(record) {
            // Manual checks and background polling must not overwrite each other.
            const task = (checks.get(record) || Promise.resolve()).then(() => performCheck(record));
            checks.set(record, task);
            try { await task; } finally { if (checks.get(record) === task) checks.delete(record); }
        }
        async function poll() {
            if (running || stopped) return;
            running = true;
            const pending = Object.values(records).filter(record => record.stage !== 'live');
            try { for (const record of pending) { if (stopped) break; await check(record); } }
            finally { running = false; }
            if (stopped) return;
            save();
            if (pending.some(record => record.stage === 'pending')) timer = setTimeout(poll, 15000);
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
