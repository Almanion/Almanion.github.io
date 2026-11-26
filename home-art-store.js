(function (root) {
    'use strict';

    const MAX_DRAWING_LENGTH = 120000;
    const MAX_PHOTO_LENGTH = 192000;
    const ID = /^[-_A-Za-z0-9]{20}$/;
    const JPEG = /^\/9j\/[A-Za-z0-9+/]*([A-Za-z0-9+/]|[AEIMQUYcgkosw048]=|[AQgw]==)$/;
    const serverTime = () => ({ '.sv': 'timestamp' });

    function photoUrl(photo) {
        if (typeof photo !== 'string' || photo.length > MAX_PHOTO_LENGTH || photo.length % 4 ||
            photo.includes('\n') || photo.includes('\r') || !JPEG.test(photo)) return '';
        return 'data:image/jpeg;base64,' + photo;
    }

    function staleBackground() {
        const error = new Error('Общий фон обновился после отправки этой версии.');
        error.code = 'stale-background';
        return error;
    }

    function watch(query, decode, onData, onError) {
        const handleValue = snapshot => onData(decode(snapshot));
        query.on('value', handleValue, onError);
        return () => query.off('value', handleValue);
    }

    function entries(snapshot) {
        const proposals = [];
        snapshot.forEach(child => {
            proposals.push({ ...child.val(), id: child.key });
        });
        return proposals.sort((a, b) => b.submittedAt - a.submittedAt || b.id.localeCompare(a.id));
    }

    function create(db, actor = null) {
        const art = db.ref('homeArt');
        const published = art.child('published');
        const submissions = art.child('submissions');

        function actorId() {
            if (!actor?.uid) throw new Error('Войдите в аккаунт, чтобы работать с версиями фона.');
            return actor.uid;
        }

        function decision(entry, status, note = '') {
            if (!ID.test(entry?.id)) throw new Error('Версия фона недоступна.');
            return { status, decisionBy: actorId(), decidedAt: serverTime(), note };
        }

        async function readPublished() {
            return (await published.once('value')).val();
        }

        async function submit({ drawing, baseRevision, photo }) {
            const authorUid = actorId();
            if (typeof drawing !== 'string' || drawing.length > MAX_DRAWING_LENGTH) {
                throw new Error('Не удалось сохранить рисунок. Упростите его и попробуйте ещё раз.');
            }
            if (!Array.isArray(JSON.parse(drawing)) || (baseRevision !== 'none' && !ID.test(baseRevision))) {
                throw new Error('Версия фона недоступна.');
            }
            const hasPhoto = photo != null && photo !== '';
            if (hasPhoto && !photoUrl(photo)) throw new Error('Не удалось сохранить фото. Выберите другое изображение.');
            const proposal = submissions.push();
            await proposal.set({
                authorUid, authorEmail: actor.email, baseRevision, drawing,
                ...(hasPhoto ? { photo } : {}),
                submittedAt: serverTime(), status: 'pending'
            });
            return proposal.key;
        }

        async function approve(entry) {
            const update = decision(entry, 'published');
            const current = await readPublished();
            if (current?.revision === entry.id) return;
            if ((current?.revision || 'none') !== entry.baseRevision) throw staleBackground();
            const next = { revision: entry.id, drawing: entry.drawing, publishedAt: serverTime() };
            if (entry.photo != null) {
                if (!photoUrl(entry.photo)) throw new Error('Фото в этой версии недоступно.');
                next.photo = entry.photo;
            }
            const changes = { published: next };
            Object.entries(update).forEach(([field, value]) => {
                changes['submissions/' + entry.id + '/' + field] = value;
            });
            try {
                await art.update(changes);
            } catch (error) {
                // A second owner tab may have approved a version after our read.
                const latest = await readPublished().catch(() => null);
                if (latest?.revision === entry.id) return;
                if (latest && latest.revision !== entry.baseRevision) throw staleBackground();
                throw error;
            }
        }

        async function returnForRevision(entry, message) {
            const note = String(message || '').trim();
            if (!note || note.length > 1200) throw new Error('Оставьте комментарий до 1200 символов.');
            const update = decision(entry, 'returned', note);
            await submissions.child(entry.id).update(update);
        }

        async function withdraw(entry) {
            const update = decision(entry, 'withdrawn');
            await submissions.child(entry.id).update(update);
        }

        return Object.freeze({
            readPublished,
            watchPublished: (onData, onError) => watch(published, snapshot => snapshot.val(), onData, onError),
            watchPending: (onData, onError) => watch(submissions.orderByChild('status').equalTo('pending'), entries, onData, onError),
            watchOwn: (onData, onError) => watch(submissions.orderByChild('authorUid').equalTo(actorId()), entries, onData, onError),
            submit, approve, returnForRevision, withdraw
        });
    }

    root.AlmanionHomeArtStore = Object.freeze({ create, photoUrl });
})(window);
