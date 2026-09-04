(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.NoteRenderer = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    const CONTAINER_CLASSES = {
        definition: 'definition-box',
        derivation: 'derivation-box',
        experiment: 'experiment-box',
        remark: 'remark-box',
        reminder: 'reminder-box',
        theorem: 'theorem-box',
        lemma: 'lemma-box',
        statement: 'statement-box',
        corollary: 'corollary-box',
        properties: 'properties-box',
        exercise: 'exercise-box',
        proof: 'proof-box',
        example: 'example-box'
    };

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function renderInline(value) {
        let text = escapeHtml(value);
        const inlineMath = [];
        text = text.replace(/\\\([\s\S]*?\\\)/g, match => {
            const index = inlineMath.push(match) - 1;
            return '\uE000' + index + '\uE001';
        });
        text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');
        text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
        text = text.replace(/\uE000(\d+)\uE001/g, (match, index) => inlineMath[Number(index)] || match);
        return text.replace(/\n/g, '<br>');
    }

    function safeImageSource(value) {
        const src = String(value || '').trim().replace(/\\/g, '/');
        if (!src) return '';
        if (/^(?:https:\/\/|\/?images\/|\.\.?\/images\/)/i.test(src) && !/^\/\//.test(src) && !/["'<>]/.test(src)) return src;
        return '';
    }

    function renderChildren(block, depth) {
        if (!Array.isArray(block.children) || block.children.length === 0) return '';
        return block.children.map(child => renderBlock(child, depth + 1)).filter(Boolean).join('\n');
    }

    function definitionParts(block) {
        let term = String(block.term || block.title || '').trim();
        let separator = block.separator === ':' ? ':' : '—';
        const trailingSeparator = term.match(/\s*(--|—|:)\s*$/);
        if (!block.term && trailingSeparator) {
            separator = trailingSeparator[1] === ':' ? ':' : '—';
            term = term.slice(0, trailingSeparator.index).trim();
        }
        return { term, separator };
    }

    function renderBlock(block, depth) {
        if (!block || typeof block !== 'object' || depth > 4) return '';
        const type = String(block.type || 'paragraph');
        if (type === 'heading') return '<h4 class="subsection-title">' + renderInline(block.title || block.content) + '</h4>';
        if (type === 'formula') {
            const latex = String(block.latex || block.content || '').trim();
            return latex ? '<div class="formula-box">\\[' + escapeHtml(latex) + '\\]</div>' : '';
        }
        if (type === 'list') {
            const items = Array.isArray(block.items) ? block.items : String(block.content || '').split(/\r?\n/);
            const rendered = items.filter(item => String(item).trim()).map(item => '<li>' + renderInline(item) + '</li>').join('');
            return rendered ? '<ul class="constructor-note-list">' + rendered + '</ul>' : '';
        }
        if (type === 'image') {
            const src = safeImageSource(block.src);
            if (!src) return '';
            const caption = String(block.caption || '').trim();
            return '<figure class="constructor-note-image" data-note-block="' + escapeHtml(block.id || '') + '">' +
                '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(block.alt || caption || '') + '" loading="lazy" decoding="async">' +
                (caption ? '<figcaption>' + renderInline(caption) + '</figcaption>' : '') +
                '</figure>';
        }
        if (type === 'paragraph') {
            const content = String(block.content || '').trim();
            return content ? '<p>' + renderInline(content) + '</p>' : '';
        }

        if (type === 'subsection') {
            const title = String(block.title || '').trim();
            const content = String(block.content || '').trim();
            return '<section class="constructor-subsection">' +
                (title ? '<h3 class="topic-title">' + renderInline(title) + '</h3>' : '') +
                (content ? '<p>' + renderInline(content) + '</p>' : '') +
                renderChildren(block, depth || 0) +
                '</section>';
        }

        const className = CONTAINER_CLASSES[type];
        if (!className) return '';
        if (type === 'definition') {
            const parts = definitionParts(block);
            const content = String(block.content || '').trim();
            const separator = parts.separator === ':' ? ': ' : ' — ';
            const inner = (parts.term ? '<strong>' + renderInline(parts.term) + '</strong>' : '') +
                (parts.term && (content || (block.children || []).length) ? separator : '') +
                (content ? renderInline(content) : '') +
                renderChildren(block, depth || 0);
            return inner ? '<div class="definition-box">' + inner + '</div>' : '';
        }
        const title = String(block.title || '').trim();
        const content = String(block.content || '').trim();
        const showTitle = type !== 'remark' && type !== 'derivation';
        const inner = (showTitle && title ? '<strong>' + renderInline(title) + '</strong>' : '') +
            (showTitle && title && content ? '<br>' : '') +
            (content ? renderInline(content) : '') +
            renderChildren(block, depth || 0);
        if (type === 'derivation') {
            return '<div class="derivation-box"><div class="derivation-content show">' + inner + '</div></div>';
        }
        if (type === 'proof') {
            return '<div class="proof-box"><div class="proof-content show">' + inner + '</div></div>';
        }
        return '<div class="' + className + '">' + inner + '</div>';
    }

    function renderSection(section) {
        const id = String(section && section.id || 'section');
        const title = String(section && section.title || 'Раздел');
        const blocks = Array.isArray(section && section.blocks) ? section.blocks : [];
        const subsections = Array.isArray(section && section.subsections) ? section.subsections : [];
        const renderedBlocks = blocks.map(block => renderBlock(block, 0)).filter(Boolean);
        const rootTopic = renderedBlocks.length ? [
            '    <article id="' + escapeHtml(id) + '" class="topic constructor-topic">',
            '        <h3 class="topic-title">' + (subsections.length ? 'Обзор' : renderInline(title)) + '</h3>',
            renderedBlocks.join('\n'),
            '    </article>'
        ].join('\n') : '';
        const subsectionHtml = subsections.map(subsection => {
            const subsectionId = escapeHtml(subsection && subsection.id || 'subsection');
            const subsectionTitle = String(subsection && subsection.title || 'Подраздел');
            const children = Array.isArray(subsection && subsection.children) ? subsection.children : [];
            return [
                '    <article id="' + subsectionId + '" class="topic constructor-topic">',
                '        <h3 class="topic-title">' + renderInline(subsectionTitle) + '</h3>',
                (String(subsection && subsection.content || '').trim() ? '        <p>' + renderInline(subsection.content) + '</p>' : ''),
                children.map(block => renderBlock(block, 0)).filter(Boolean).join('\n'),
                '    </article>'
            ].join('\n');
        }).join('\n');
        return [
            '<section class="content-section constructor-content-section" data-constructor-section="' + escapeHtml(id) + '">',
            (subsections.length ? '    <h2 class="part-title">' + escapeHtml(title) + '</h2>' : ''),
            rootTopic,
            subsectionHtml,
            '</section>'
        ].join('\n');
    }

    function renderNavItem(section) {
        const id = escapeHtml(section && section.id || 'section');
        const title = escapeHtml(section && (section.navTitle || section.title) || 'Раздел');
        const subsections = Array.isArray(section && section.subsections) ? section.subsections : [];
        if (subsections.length) {
            const overview = Array.isArray(section && section.blocks) && section.blocks.some(block => !!renderBlock(block, 0))
                ? '<li><a href="#' + id + '" class="nav-link">Обзор</a></li>'
                : '';
            return '<li class="nav-group">' +
                '<button class="nav-group-toggle" type="button"><span class="toggle-icon">▼</span>' + title + '</button>' +
                '<ul class="nav-submenu">' + overview + subsections.map(subsection => {
                    const subsectionId = escapeHtml(subsection && subsection.id || 'subsection');
                    const subsectionTitle = escapeHtml(subsection && (subsection.navTitle || subsection.title) || 'Подраздел');
                    return '<li><a href="#' + subsectionId + '" class="nav-link">' + subsectionTitle + '</a></li>';
                }).join('') + '</ul></li>';
        }
        return '<li class="constructor-nav-item" data-constructor-nav="' + id + '"><a href="#' + id + '" class="nav-link">' + title + '</a></li>';
    }

    return { escapeHtml, renderInline, safeImageSource, renderBlock, renderSection, renderNavItem };
});
