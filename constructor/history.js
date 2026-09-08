(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.NoteHistory = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    const DEFAULT_LIMIT = 80;
    const MERGE_WINDOW = 1100;

    function clone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function orderForMove(sections, index, delta, spacing) {
        const list = Array.isArray(sections) ? sections : [];
        const direction = Number(delta) < 0 ? -1 : 1;
        const target = Number(index) + direction;
        if (!Number.isInteger(index) || target < 0 || target >= list.length) return null;
        const gap = Math.max(1, Number(spacing) || 1000);
        const targetOrder = Number(list[target] && list[target].order) || 0;
        if (direction < 0) {
            let lower = target > 0 ? Number(list[target - 1] && list[target - 1].order) || 0 : targetOrder - gap;
            if (lower >= targetOrder) lower = targetOrder - gap;
            return lower + (targetOrder - lower) / 2;
        }
        let upper = target + 1 < list.length ? Number(list[target + 1] && list[target + 1].order) || 0 : targetOrder + gap;
        if (upper <= targetOrder) upper = targetOrder + gap;
        return targetOrder + (upper - targetOrder) / 2;
    }

    class UndoStack {
        constructor(limit) {
            this.limit = Math.max(10, Number(limit) || DEFAULT_LIMIT);
            this.undoEntries = [];
            this.redoEntries = [];
        }

        record(snapshot, label, mergeKey, timestamp) {
            if (!snapshot) return false;
            const now = Number(timestamp) || Date.now();
            const previous = this.undoEntries[this.undoEntries.length - 1];
            const canMerge = !!mergeKey && previous && previous.mergeKey === mergeKey && now - previous.timestamp <= MERGE_WINDOW;
            if (!canMerge) {
                this.undoEntries.push({
                    snapshot: clone(snapshot),
                    label: String(label || 'Изменение'),
                    mergeKey: String(mergeKey || ''),
                    timestamp: now
                });
                if (this.undoEntries.length > this.limit) this.undoEntries.splice(0, this.undoEntries.length - this.limit);
            } else {
                previous.timestamp = now;
            }
            this.redoEntries = [];
            return !canMerge;
        }

        undo(currentSnapshot) {
            const entry = this.undoEntries.pop();
            if (!entry) return null;
            this.redoEntries.push({ snapshot: clone(currentSnapshot), label: entry.label, timestamp: Date.now() });
            return { snapshot: clone(entry.snapshot), label: entry.label };
        }

        redo(currentSnapshot) {
            const entry = this.redoEntries.pop();
            if (!entry) return null;
            this.undoEntries.push({ snapshot: clone(currentSnapshot), label: entry.label, mergeKey: '', timestamp: Date.now() });
            return { snapshot: clone(entry.snapshot), label: entry.label };
        }

        clear() {
            this.undoEntries = [];
            this.redoEntries = [];
        }

        get canUndo() { return this.undoEntries.length > 0; }
        get canRedo() { return this.redoEntries.length > 0; }
        get undoLabel() { return this.canUndo ? this.undoEntries[this.undoEntries.length - 1].label : ''; }
        get redoLabel() { return this.canRedo ? this.redoEntries[this.redoEntries.length - 1].label : ''; }
    }

    function blockMap(section) {
        const result = new Map();
        function visit(blocks, scope) {
            (Array.isArray(blocks) ? blocks : []).forEach((block, index) => {
                if (!block || typeof block !== 'object') return;
                const id = String(block.id || scope + '-' + index);
                const comparable = clone(block);
                delete comparable.children;
                result.set(id, JSON.stringify(comparable));
                visit(block.children, id);
            });
        }
        visit(section && section.blocks, 'section');
        (section && Array.isArray(section.subsections) ? section.subsections : []).forEach(subsection => {
            result.set('subsection:' + subsection.id, JSON.stringify({
                title: subsection.title || '',
                navTitle: subsection.navTitle || ''
            }));
            visit(subsection.children, 'subsection:' + subsection.id);
        });
        return result;
    }

    function summarizeChanges(before, after) {
        if (!before && !after) return [];
        if (!before) return ['Создан раздел'];
        if (!after) return ['Удалён раздел'];
        const changes = [];
        if (String(before.title || '') !== String(after.title || '')) changes.push('Изменён заголовок');
        if (String(before.navTitle || '') !== String(after.navTitle || '')) changes.push('Изменено название в меню');
        if (String(before.reviewStatus || 'draft') !== String(after.reviewStatus || 'draft')) changes.push('Изменён статус проверки');
        const left = blockMap(before);
        const right = blockMap(after);
        let added = 0;
        let removed = 0;
        let edited = 0;
        right.forEach((value, id) => {
            if (!left.has(id)) added += 1;
            else if (left.get(id) !== value) edited += 1;
        });
        left.forEach((_, id) => { if (!right.has(id)) removed += 1; });
        if (added) changes.push('Добавлено блоков: ' + added);
        if (removed) changes.push('Удалено блоков: ' + removed);
        if (edited) changes.push('Изменено блоков: ' + edited);
        return changes.length ? changes : ['Служебное сохранение'];
    }

    function createRevision(section, options) {
        const source = clone(section);
        const meta = options || {};
        const createdAt = Number(meta.createdAt) || Date.now();
        return {
            id: String(createdAt) + '-' + String(Number(source && source.revision) || 0),
            revision: Number(source && source.revision) || 0,
            createdAt,
            createdBy: String(meta.createdBy || source && source.updatedBy || ''),
            createdByEmail: String(meta.createdByEmail || ''),
            label: String(meta.label || 'Автосохранение'),
            reviewStatus: String(source && source.reviewStatus || 'draft'),
            section: source
        };
    }

    function mergeRevisions() {
        const merged = new Map();
        Array.prototype.slice.call(arguments).forEach(list => {
            (Array.isArray(list) ? list : []).forEach(item => {
                if (!item || !item.section) return;
                const key = String(item.id || (item.createdAt + '-' + item.revision));
                const previous = merged.get(key);
                if (!previous || Number(item.createdAt) >= Number(previous.createdAt)) merged.set(key, clone(item));
            });
        });
        return Array.from(merged.values()).sort((a, b) => Number(b.createdAt) - Number(a.createdAt)).slice(0, 80);
    }

    function ensureReview(section) {
        const current = section && section.review && typeof section.review === 'object' ? section.review : {};
        section.review = {
            submittedAt: Number(current.submittedAt) || 0,
            submittedBy: String(current.submittedBy || ''),
            returnedAt: Number(current.returnedAt) || 0,
            returnedBy: String(current.returnedBy || ''),
            publishedAt: Number(current.publishedAt) || 0,
            publishedBy: String(current.publishedBy || ''),
            comments: Array.isArray(current.comments) ? current.comments.map(clone) : []
        };
        return section.review;
    }

    function transitionReview(section, action, actor, isOwner, timestamp) {
        if (!section) throw new Error('Раздел не выбран');
        const now = Number(timestamp) || Date.now();
        const uid = String(actor && actor.uid || '');
        const review = ensureReview(section);
        const status = String(section.reviewStatus || 'draft');
        if (action === 'submit') {
            if (status !== 'draft') throw new Error('На проверку можно отправить только черновик');
            section.reviewStatus = 'ready';
            review.submittedAt = now;
            review.submittedBy = uid;
        } else if (action === 'withdraw') {
            if (status !== 'ready') throw new Error('Отозвать можно только материал на проверке');
            section.reviewStatus = 'draft';
        } else if (action === 'return') {
            if (!isOwner) throw new Error('Вернуть материал может только главный администратор');
            if (status !== 'ready') throw new Error('Вернуть можно только материал на проверке');
            section.reviewStatus = 'draft';
            review.returnedAt = now;
            review.returnedBy = uid;
        } else if (action === 'publish') {
            if (!isOwner) throw new Error('Публиковать может только главный администратор');
            if (status !== 'ready') throw new Error('Перед публикацией отправьте материал на проверку');
            section.reviewStatus = 'published';
            review.publishedAt = now;
            review.publishedBy = uid;
        } else {
            throw new Error('Неизвестное действие проверки');
        }
        return section;
    }

    function addComment(section, actor, text, timestamp) {
        const value = String(text || '').trim();
        if (!value) throw new Error('Введите комментарий');
        const review = ensureReview(section);
        const createdAt = Number(timestamp) || Date.now();
        const comment = {
            id: 'review-' + createdAt.toString(36) + '-' + Math.random().toString(36).slice(2, 7),
            text: value,
            authorUid: String(actor && actor.uid || ''),
            authorEmail: String(actor && actor.email || ''),
            createdAt,
            resolvedAt: 0,
            resolvedBy: ''
        };
        review.comments.push(comment);
        return comment;
    }

    function resolveComment(section, commentId, actor, isOwner, timestamp) {
        const review = ensureReview(section);
        const comment = review.comments.find(item => item.id === commentId);
        if (!comment) return false;
        if (!isOwner && String(comment.authorUid) !== String(actor && actor.uid || '')) throw new Error('Закрыть комментарий может автор или главный администратор');
        comment.resolvedAt = Number(timestamp) || Date.now();
        comment.resolvedBy = String(actor && actor.uid || '');
        return true;
    }

    return {
        UndoStack,
        summarizeChanges,
        createRevision,
        mergeRevisions,
        ensureReview,
        transitionReview,
        addComment,
        resolveComment,
        orderForMove
    };
});
