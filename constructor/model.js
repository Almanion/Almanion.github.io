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
        subsection: { label: 'Подраздел', structural: true },
        formula:    { label: 'Формула', leaf: true },
        list:       { label: 'Список', leaf: true },
        image:      { label: 'Изображение', leaf: true },
        definition: { label: 'Определение' },
        derivation: { label: 'Вывод' },
        experiment: { label: 'Эксперимент' },
        remark:     { label: 'Замечание' },
        reminder:   { label: 'Напоминание' },
        theorem:    { label: 'Теорема' },
        lemma:      { label: 'Лемма' },
        statement:  { label: 'Утверждение' },
        corollary:  { label: 'Следствие' },
        properties: { label: 'Свойства' },
        exercise:   { label: 'Упражнение' },
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
        if (normalizedType === 'definition') Object.assign(block, { term: '', separator: '—' });
        if (normalizedType === 'reminder') block.title = 'Напоминание';
        if (normalizedType === 'formula') block.latex = '';
        if (normalizedType === 'image') Object.assign(block, { src: '', alt: '', caption: '' });
        if (normalizedType === 'list') block.items = [''];
        return block;
    }

    function createSection(subject, title) {
        const now = Date.now();
        const sectionTitle = smartDashes(String(title || 'Новый раздел')).trim();
        return {
            schemaVersion: SCHEMA_VERSION,
            id: slugify(sectionTitle),
            subject: String(subject || 'physics'),
            title: sectionTitle,
            navTitle: sectionTitle,
            blocks: [createBlock('paragraph')],
            subsections: [],
            order: now,
            revision: 1,
            createdAt: now,
            updatedAt: now,
            updatedBy: '',
            reviewStatus: 'draft'
        };
    }

    function createSubsection(title, navTitle) {
        const subsectionTitle = smartDashes(String(title || 'Новый подраздел')).trim();
        const block = createBlock('subsection');
        block.id = slugify(subsectionTitle);
        block.title = subsectionTitle;
        block.navTitle = smartDashes(String(navTitle || subsectionTitle)).trim();
        block.children = [createBlock('paragraph')];
        return block;
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
        if (type === 'definition') {
            let term = String(source.term || source.title || '').trim();
            let separator = source.separator === ':' ? ':' : '—';
            const trailingSeparator = term.match(/\s*(--|—|:)\s*$/);
            if (!source.term && trailingSeparator) {
                separator = trailingSeparator[1] === ':' ? ':' : '—';
                term = term.slice(0, trailingSeparator.index).trim();
            }
            block.term = term;
            block.separator = separator;
            block.title = '';
        }
        if ((type === 'remark' || type === 'derivation') && block.title) {
            block.content = block.title + (block.content ? '\n' + block.content : '');
            block.title = '';
        }
        if (type === 'reminder' && !block.title) block.title = 'Напоминание';
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
        const normalizedBlocks = Array.isArray(source.blocks) ? source.blocks.map(block => normalizeBlock(block, 0)) : [];
        const legacySubsections = normalizedBlocks.filter(block => block.type === 'subsection');
        const subsectionSources = Array.isArray(source.subsections) ? source.subsections : legacySubsections;
        const subsections = subsectionSources.map(item => {
            const subsection = normalizeBlock(Object.assign({}, item, { type: 'subsection' }), 0);
            subsection.id = slugify(item && (item.id || item.title) || subsection.id);
            subsection.navTitle = String(item && (item.navTitle || item.title) || 'Подраздел').trim();
            return subsection;
        });
        return {
            schemaVersion: SCHEMA_VERSION,
            id: slugify(source.id || title),
            subject: String(source.subject || fallbackSubject || 'physics'),
            title,
            navTitle: String(source.navTitle || title).trim(),
            blocks: normalizedBlocks.filter(block => block.type !== 'subsection'),
            subsections,
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

    function maxChildDepth(block) {
        const children = Array.isArray(block && block.children) ? block.children : [];
        if (!children.length) return 0;
        return 1 + Math.max.apply(null, children.map(maxChildDepth));
    }

    function moveIntoContainer(section, sourceId, targetId) {
        const source = findLocation(section.blocks, sourceId, null, 0);
        const target = findLocation(section.blocks, targetId, null, 0);
        if (!source || !target || sourceId === targetId || !isContainerType(target.block.type)) return false;
        if (findLocation(source.block.children, targetId, source.block, source.depth + 1)) return false;
        if (target.depth + 1 + maxChildDepth(source.block) > MAX_NESTING_DEPTH) return false;
        const item = source.list.splice(source.index, 1)[0];
        target.block.children = Array.isArray(target.block.children) ? target.block.children : [];
        target.block.children.push(item);
        return true;
    }

    function smartDashes(value) {
        return String(value == null ? '' : value).replace(/--/g, '—');
    }

    function touch(section, uid) {
        section.updatedAt = Date.now();
        section.updatedBy = String(uid || '');
        section.revision = Math.max(1, Number(section.revision) || 1) + 1;
        if (section.reviewStatus === 'published') section.reviewStatus = 'draft';
        return section;
    }

    function draftVersion(section) {
        if (!section) return null;
        return {
            revision: Number(section.revision) || 0,
            updatedAt: Number(section.updatedAt) || 0,
            updatedBy: String(section.updatedBy || '')
        };
    }

    function sameDraftVersion(section, expected) {
        if (!section || !expected) return !section && !expected;
        const actual = draftVersion(section);
        return actual.revision === Number(expected.revision || 0)
            && actual.updatedAt === Number(expected.updatedAt || 0)
            && actual.updatedBy === String(expected.updatedBy || '');
    }

    function canReplaceRemoteDraft(remoteSection, expectedVersion, nextSection) {
        if (sameDraftVersion(remoteSection, expectedVersion)) return true;
        if (!nextSection) return false;
        // Realtime Database may first invoke a transaction with an empty local
        // cache and then retry it with the real server value.
        if (!remoteSection) return true;
        const actual = draftVersion(remoteSection);
        const next = draftVersion(nextSection);
        // A delayed autosave from the same account is safe to replace with a
        // newer local revision. Other authors and newer cloud data still win.
        return !!actual.updatedBy
            && actual.updatedBy === next.updatedBy
            && actual.revision <= next.revision
            && actual.updatedAt <= next.updatedAt;
    }

    function validateSection(section) {
        const errors = [];
        if (!section || typeof section !== 'object') return ['Документ отсутствует'];
        if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(String(section.id || ''))) errors.push('Адрес раздела должен содержать 2–64 латинских символа, цифры или дефисы');
        if (!String(section.title || '').trim()) errors.push('Укажите название раздела');
        if (!String(section.navTitle || '').trim()) errors.push('Укажите название для меню');
        const subsections = Array.isArray(section.subsections) ? section.subsections : [];
        if ((!Array.isArray(section.blocks) || section.blocks.length === 0) && subsections.length === 0) errors.push('Добавьте хотя бы один блок или подраздел');
        const subsectionIds = subsections.map(item => String(item && item.id || ''));
        if (subsections.some(item => !item || !item.title || !item.navTitle)) errors.push('Укажите названия подразделов и подписи для меню');
        if (subsectionIds.some(id => !/^[a-z0-9][a-z0-9-]{1,63}$/.test(id))) errors.push('Адрес подраздела должен содержать 2–64 латинских символа, цифры или дефисы');
        if (new Set(subsectionIds).size !== subsectionIds.length) errors.push('Адреса подразделов не должны повторяться');
        const definitionWithoutTerm = [section.blocks].concat(subsections.map(item => item && item.children))
            .some(blocks => hasInvalidDefinition(blocks));
        if (definitionWithoutTerm) errors.push('Укажите термин во всех блоках определений');
        return errors;
    }

    function hasInvalidDefinition(blocks) {
        return Array.isArray(blocks) && blocks.some(block => {
            if (!block || typeof block !== 'object') return false;
            if (block.type === 'definition' && !String(block.term || block.title || '').trim()) return true;
            return hasInvalidDefinition(block.children);
        });
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
        createSubsection,
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
        moveIntoContainer,
        smartDashes,
        touch,
        draftVersion,
        canReplaceRemoteDraft,
        validateSection
    };
});
