(function (root) {
    'use strict';

    const inboxPath = 'noteReviewInbox';
    const versionPath = 'noteReviewVersions';
    const subjects = new Set(['physics', 'math', 'geometry', 'chemistry', 'likbez', 'physics-10', 'chemistry-10', 'literature-10']);
    const validId = /^[a-z0-9][a-z0-9-]{1,63}$/;
    const validHash = /^(none|[a-f0-9]{64})$/;
    const maxBundleBytes = 9.5 * 1024 * 1024;

    function sectionPath(subject, sectionId) {
        if (!subjects.has(subject) || !validId.test(sectionId)) throw new Error('Некорректный раздел конспекта.');
        return 'content/' + subject + '/sections/' + sectionId + '.json';
    }

    async function hashSection(section) {
        if (section == null) return 'none';
        const bytes = new TextEncoder().encode(JSON.stringify(section));
        const digest = await root.crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async function readBase({ subject, sectionId }) {
        const path = sectionPath(subject, sectionId);
        const response = await root.fetch(new URL('/' + path, root.location.href) + '?review=' + Date.now(),
            { cache: 'no-store', signal: AbortSignal.timeout(12000) });
        if (response.status === 404) return { hash: 'none', section: null };
        if (!response.ok) throw new Error('Не удалось загрузить опубликованную версию.');
        const section = await response.json();
        if (section.subject !== subject || section.id !== sectionId) throw new Error('Опубликованный раздел имеет другой адрес.');
        return { hash: await hashSection(section), section };
    }

    function validateBundle(files, subject, sectionId) {
        const path = sectionPath(subject, sectionId);
        const manifest = 'content/' + subject + '/manifest.json';
        const folder = 'images/notes/' + subject + '/';
        if (!Array.isArray(files) || !files.length || files.length > 24) throw new Error('Некорректный пакет раздела.');
        const unique = new Set();
        let section;
        for (const item of files) {
            const { path: name, content, encoding } = item || {};
            if (typeof name !== 'string' || typeof content !== 'string' || unique.has(name)) throw new Error('Некорректный файл версии.');
            unique.add(name);
            if ((name === path || name === manifest) && encoding === 'utf-8') {
                if (name === path) section = JSON.parse(content);
                else {
                    const index = JSON.parse(content);
                    if (index.subject !== subject || !Array.isArray(index.sections)) throw new Error('Некорректное оглавление в пакете.');
                }
            } else if (name.startsWith(folder) && /^[a-z0-9][a-z0-9._-]{0,119}\.(?:png|apng|jpg|jpeg|webp|gif|svg|avif|bmp|ico|tif|tiff)$/i.test(name.slice(folder.length))
                && encoding === 'base64' && /^[A-Za-z0-9+/]+={0,2}$/.test(content)) {
                continue;
            } else {
                throw new Error('Недопустимый файл в пакете раздела.');
            }
        }
        if (!section || section.id !== sectionId || section.subject !== subject || !unique.has(manifest)) {
            throw new Error('Пакет не соответствует отправленному разделу.');
        }
        return section;
    }

    function entries(snapshot) {
        const result = [];
        snapshot.forEach(child => { result.push({ ...child.val(), id: child.key }); });
        return result;
    }

    function sortEntries(records) {
        return records.sort((a, b) => b.submittedAt - a.submittedAt || b.id.localeCompare(a.id));
    }

    function create({ database, user, config = root.NOTE_CONSTRUCTOR_CONFIG }) {
        const inbox = database.ref(inboxPath);
        const versions = database.ref(versionPath);
        const uid = user.uid;
        const isOwner = uid === config?.ownerUid;
        const stamp = () => root.firebase?.database?.ServerValue?.TIMESTAMP || Date.now();

        function watchMine(callback, onError) {
            const query = inbox.orderByChild('authorUid').equalTo(uid);
            const handle = snapshot => callback(sortEntries(entries(snapshot)));
            query.on('value', handle, onError);
            return () => query.off('value', handle);
        }

        function watchPending(callback, onError) {
            const active = new Map();
            let scheduled = false;
            let stopped = false;
            function flush() {
                scheduled = false;
                if (stopped || active.size !== 2) return;
                const merged = new Map();
                for (const group of active.values()) for (const entry of group) merged.set(entry.id, entry);
                callback(sortEntries([...merged.values()]));
            }
            const unsubscribers = ['pending', 'publishing'].map(status => {
                const query = inbox.orderByChild('status').equalTo(status);
                const handle = snapshot => {
                    active.set(status, entries(snapshot));
                    if (!scheduled) {
                        scheduled = true;
                        queueMicrotask(flush);
                    }
                };
                query.on('value', handle, onError);
                return () => query.off('value', handle);
            });
            return () => { stopped = true; unsubscribers.forEach(unsubscribe => unsubscribe()); };
        }

        async function submit({ section, files, baseHash }) {
            const { subject, id: sectionId, title, revision } = section;
            if (!validHash.test(baseHash || '')) throw new Error('Не удалось определить исходную версию.');
            const submitted = validateBundle(files, subject, sectionId);
            if (submitted.title !== title || Number(submitted.revision) !== Number(revision)) {
                throw new Error('Раздел изменился перед отправкой. Повторите попытку.');
            }
            const bundle = JSON.stringify(files);
            if (new TextEncoder().encode(bundle).length > maxBundleBytes ||
                files.reduce((total, file) => total + file.content.length, 0) > 9 * 1024 * 1024) {
                throw new Error('Пакет слишком большой. Уменьшите размер новых изображений.');
            }
            const id = inbox.push().key;
            await database.ref().update({
                [inboxPath + '/' + id]: { authorUid: uid, authorEmail: user.email || '', subject, sectionId, title, revision, submittedAt: stamp(), status: 'pending' },
                [versionPath + '/' + id]: { authorUid: uid, subject, sectionId, baseHash, bundle }
            });
            return id;
        }

        async function getVersion(id) {
            const stored = (await versions.child(id).once('value')).val();
            if (!stored) throw new Error('Версия недоступна.');
            const { baseHash, authorUid, subject, sectionId, bundle } = stored;
            if (!validHash.test(baseHash || '')) throw new Error('Не удалось проверить исходную версию.');
            const files = JSON.parse(bundle);
            const section = validateBundle(files, subject, sectionId);
            return Object.freeze({ id, baseHash, authorUid, subject, sectionId, files: Object.freeze(files.map(Object.freeze)), section });
        }

        function updateRecord(id, change) {
            return inbox.child(id).transaction(change, undefined, false).then(result => {
                if (!result.committed) throw new Error('Статус версии изменился. Откройте её заново.');
                return result.snapshot.val();
            });
        }

        async function decide(id, { status, note = '' }) {
            const response = note.trim();
            if (status !== 'withdrawn' && status !== 'returned') throw new Error('Неизвестное действие.');
            if (status === 'returned' && !response) throw new Error('Напишите, что нужно доработать.');
            if (response.length > 1200) throw new Error('Комментарий слишком длинный.');
            // Load the record before transaction so cold Firebase caches don't abort on null.
            await inbox.child(id).once('value');
            return updateRecord(id, record => {
                if (!record || record.status !== 'pending') return;
                if (status === 'returned' ? !isOwner : record.authorUid !== uid) return;
                return { ...record, status, note: response, decisionBy: uid, decidedAt: stamp(), commit: '' };
            });
        }

        async function publish(id, version) {
            if (!isOwner || version?.id !== id) throw new Error('Откройте версию для проверки.');
            const endpoint = config.publisherEndpoint;
            const capabilities = await root.fetch(endpoint + '?action=capabilities&_=' + Date.now(), {
                cache: 'no-store', signal: AbortSignal.timeout(12000)
            });
            if (!capabilities.ok || (await capabilities.json()).noteReviewBaseCheck !== true) {
                throw Object.assign(new Error('Сервер публикации ждёт обновления. Версия осталась в очереди.'), { code: 'publisher-unavailable' });
            }
            const record = (await inbox.child(id).once('value')).val();
            if (!record || record.authorUid !== version.authorUid || record.subject !== version.subject || record.sectionId !== version.sectionId) {
                throw new Error('Запись проверки не соответствует выбранной версии.');
            }
            if (record.status === 'published') return { commit: record.commit };
            const idToken = await user.getIdToken(true);
            const freshClaim = record.status === 'pending';
            if (freshClaim) {
                const current = await readBase(version);
                if (current.hash !== version.baseHash) {
                    throw Object.assign(new Error('Исходная версия изменилась. Верните раздел на доработку.'), { code: 'stale-base' });
                }
                await updateRecord(id, value => value?.status === 'pending'
                    ? { ...value, status: 'publishing', claimAt: stamp() } : undefined);
            } else if (record.status !== 'publishing') {
                throw new Error('Эта версия уже снята с проверки.');
            }

            const response = await root.fetch(endpoint, {
                method: 'POST', signal: AbortSignal.timeout(60000), headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'publishNotes', idToken, subject: version.subject, sectionId: version.sectionId,
                    files: version.files, expectedBaseHash: version.baseHash, reviewId: id })
            });
            const result = await response.json();
            const stale = result.code === 'stale-base' || /^NOTE_REVIEW_STALE/.test(result.error || '');
            if (stale || (freshClaim && result.code === 'review-rejected')) {
                await updateRecord(id, value => {
                    if (value?.status !== 'publishing') return;
                    const { claimAt, ...entry } = value;
                    return { ...entry, status: 'pending' };
                });
                const message = stale ? 'Исходная версия изменилась. Верните раздел на доработку.' :
                    result.error || 'Сервер отклонил публикацию. Проверьте версию.';
                throw Object.assign(new Error(message), { code: stale ? 'stale-base' : 'review-rejected' });
            }
            const commit = result.commitSha || result.commit || '';
            if (!response.ok || !result.success || !/^[0-9a-f]{40}$/.test(commit)) {
                throw new Error(result.error || 'Сервер не подтвердил публикацию. Повторите проверку публикации.');
            }
            await updateRecord(id, value => {
                if (value?.status === 'published' && value.commit === commit) return value;
                if (value?.status !== 'publishing') return;
                return { ...value, status: 'published', decisionBy: uid, decidedAt: stamp(), note: '', commit };
            });
            return { commit };
        }

        return { watchMine, watchPending, submit, getVersion, decide, publish };
    }

    const api = { create, readBase, hashSection };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.NoteReview = api;
})(globalThis);
