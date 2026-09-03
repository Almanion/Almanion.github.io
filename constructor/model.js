(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.NoteModel = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    const SCHEMA_VERSION = 1;
    const MAX_NESTING_DEPTH = 4;
    const BLOCK_TYPES = {
        paragraph:  { label: 'Текст', leaf: true },
        heading:    { label: 'Малый заголовок', leaf: true },
        subsection: { label: 'Подраздел' },
        formula:    { label: 'Формула', leaf: true },
        list:       { label: 'Список', leaf: true },
        image:      { label: 'Изображение', leaf: true },
        definition: { label: 'Определение' },
        derivation: { label: 'Вывод' },
        experiment: { label: 'Эксперимент' },
        remark:     { label: 'Замечание' },
        theorem:    { label: 'Теорема' },
        lemma:      { label: 'Лемма' },
        proof:      { label: 'Доказательство' },
        example:    { label: 'Пример' }
    };

    function createId(prefix) {
        const safePrefix = String(prefix || 'block').replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'block';
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return safePrefix + '-' + crypto.randomUUID().slice(0, 8);
        }
        return safePrefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }

    function slugify(value) {
        const translit = {
            а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
            к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
            х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
        };
        return String(value || '')
            .trim()
            .toLowerCase()
            .split('')
            .map(char => translit[char] !== undefined ? translit[char] : char)
            .join('')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 64) || 'section-' + Date.now().toString(36);
    }

    function isContainerType(type) {
        return !!BLOCK_TYPES[type] && !BLOCK_TYPES[type].leaf;
    }

    function createBlock(type) {
        const normalizedType = BLOCK_TYPES[type] ? type : 'paragraph';
        const block = {
            id: createId(normalizedType),
            type: normalizedType,
            title: '',
            content: '',
            children: []
        };
        if (normalizedType === 'formula') block.latex = '';
        if (normalizedType === 'image') Object.assign(block, { src: '', alt: '', caption: '' });
        if (normalizedType === 'list') block.items = [''];
        return block;
    }

    function createSection(subject, title) {
        const now = Date.now();
        const sectionTitle = String(title || 'Новый раздел').trim();
        return {
            schemaVersion: SCHEMA_VERSION,
            id: slugify(sectionTitle),
            subject: String(subject || 'physics'),
            title: sectionTitle,
            navTitle: sectionTitle,
            blocks: [createBlock('paragraph')],
            order: now,
            revision: 1,
            createdAt: now,
            updatedAt: now,
            updatedBy: '',
            reviewStatus: 'draft'
        };
    }

    function normalizeBlock(value, depth) {
        const source = value && typeof value === 'object' ? value : {};
        const type = BLOCK_TYPES[source.type] ? source.type : 'paragraph';
        const block = {
            id: String(source.id || createId(type)),
            type,
            title: String(source.title || ''),
            content: String(source.content || ''),
            children: []
        };
        if (type === 'formula') block.latex = String(source.latex || source.content || '');
        if (type === 'image') {
            block.src = String(source.src || '');
            block.alt = String(source.alt || '');
            block.caption = String(source.caption || '');
        }
        if (type === 'list') {
            block.items = Array.isArray(source.items) ? source.items.map(item => String(item)) : String(source.content || '').split(/\r?\n/);
        }
        if (isContainerType(type) && depth < MAX_NESTING_DEPTH) {
            block.children = Array.isArray(source.children)
                ? source.children.map(child => normalizeBlock(child, depth + 1))
                : [];
        }
        return block;
    }

    function normalizeSection(value, fallbackSubject) {
        const source = value && typeof value === 'object' ? value : {};
        const now = Date.now();
        const title = String(source.title || 'Новый раздел').trim();
        return {
            schemaVersion: SCHEMA_VERSION,
            id: slugify(source.id || title),
            subject: String(source.subject || fallbackSubject || 'physics'),
            title,
            navTitle: String(source.navTitle || title).trim(),
            blocks: Array.isArray(source.blocks) ? source.blocks.map(block => normalizeBlock(block, 0)) : [],
            order: Number.isFinite(Number(source.order)) ? Number(source.order) : now,
            revision: Math.max(1, Number(source.revision) || 1),
            createdAt: Number(source.createdAt) || now,
            updatedAt: Number(source.updatedAt) || now,
            updatedBy: String(source.updatedBy || ''),
            reviewStatus: ['draft', 'ready', 'published'].includes(source.reviewStatus) ? source.reviewStatus : 'draft'
        };
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function findLocation(blocks, blockId, parentBlock, depth) {
        if (!Array.isArray(blocks)) return null;
        for (let index = 0; index < blocks.length; index += 1) {
            const block = blocks[index];
            if (block.id === blockId) return { block, list: blocks, index, parentBlock: parentBlock || null, depth: depth || 0 };
            const nested = findLocation(block.children, blockId, block, (depth || 0) + 1);
            if (nested) return nested;
        }
        return null;
    }

    function moveWithinLevel(section, blockId, delta) {
        const location = findLocation(section.blocks, blockId, null, 0);
        if (!location) return false;
        const target = location.index + delta;
        if (target < 0 || target >= location.list.length) return false;
        const item = location.list.splice(location.index, 1)[0];
        location.list.splice(target, 0, item);
        return true;
    }

    function indentBlock(section, blockId) {
        const location = findLocation(section.blocks, blockId, null, 0);
        if (!location || location.index === 0 || location.depth >= MAX_NESTING_DEPTH) return false;
        const previous = location.list[location.index - 1];
        if (!isContainerType(previous.type)) return false;
        const item = location.list.splice(location.index, 1)[0];
        previous.children = Array.isArray(previous.children) ? previous.children : [];
        previous.children.push(item);
        return true;
    }

    function outdentBlock(section, blockId) {
        const location = findLocation(section.blocks, blockId, null, 0);
        if (!location || !location.parentBlock) return false;
        const parentLocation = findLocation(section.blocks, location.parentBlock.id, null, 0);
        if (!parentLocation) return false;
        const item = location.list.splice(location.index, 1)[0];
        parentLocation.list.splice(parentLocation.index + 1, 0, item);
        return true;
    }

    function removeBlock(section, blockId) {
        const location = findLocation(section.blocks, blockId, null, 0);
        if (!location) return false;
        location.list.splice(location.index, 1);
        return true;
    }

    function duplicateBlock(section, blockId) {
        const location = findLocation(section.blocks, blockId, null, 0);
        if (!location) return null;
        const copy = clone(location.block);
        refreshIds(copy);
        location.list.splice(location.index + 1, 0, copy);
        return copy;
    }

    function refreshIds(block) {
        block.id = createId(block.type);
        (block.children || []).forEach(refreshIds);
    }

    function addChild(section, parentId, type) {
        const location = findLocation(section.blocks, parentId, null, 0);
        if (!location || !isContainerType(location.block.type) || location.depth >= MAX_NESTING_DEPTH) return null;
        const child = createBlock(type || 'paragraph');
        location.block.children.push(child);
        return child;
    }

    function moveBefore(section, sourceId, targetId) {
        const source = findLocation(section.blocks, sourceId, null, 0);
        const target = findLocation(section.blocks, targetId, null, 0);
        if (!source || !target || source.list !== target.list || sourceId === targetId) return false;
        const item = source.list.splice(source.index, 1)[0];
        const nextTarget = source.index < target.index ? target.index - 1 : target.index;
        source.list.splice(nextTarget, 0, item);
        return true;
    }

    function touch(section, uid) {
        section.updatedAt = Date.now();
        section.updatedBy = String(uid || '');
        section.revision = Math.max(1, Number(section.revision) || 1) + 1;
        if (section.reviewStatus === 'published') section.reviewStatus = 'draft';
        return section;
    }

    function validateSection(section) {
        const errors = [];
        if (!section || typeof section !== 'object') return ['Документ отсутствует'];
        if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(String(section.id || ''))) errors.push('Адрес раздела должен содержать 2–64 латинских символа, цифры или дефисы');
        if (!String(section.title || '').trim()) errors.push('Укажите название раздела');
        if (!String(section.navTitle || '').trim()) errors.push('Укажите название для меню');
        if (!Array.isArray(section.blocks) || section.blocks.length === 0) errors.push('Добавьте хотя бы один блок');
        return errors;
    }

    return {
        SCHEMA_VERSION,
        MAX_NESTING_DEPTH,
        BLOCK_TYPES,
        createId,
        slugify,
        isContainerType,
        createBlock,
        createSection,
        normalizeBlock,
        normalizeSection,
        clone,
        findLocation,
        moveWithinLevel,
        indentBlock,
        outdentBlock,
        removeBlock,
        duplicateBlock,
        addChild,
        moveBefore,
        touch,
        validateSection
    };
});
