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
        theorem: 'theorem-box',
        lemma: 'lemma-box',
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
        text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');
        text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
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
        return '<div class="constructor-nested-content">' + block.children.map(child => renderBlock(child, depth + 1)).join('\n') + '</div>';
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
        const title = String(block.title || '').trim();
        const content = String(block.content || '').trim();
        const inner = (title ? '<strong>' + renderInline(title) + '</strong>' : '') +
            (title && content ? '<br>' : '') +
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
        return [
            '<section id="' + escapeHtml(id) + '" class="content-section constructor-content-section" data-constructor-section="' + escapeHtml(id) + '">',
            '    <h2 class="part-title">' + escapeHtml(title) + '</h2>',
            '    <article class="topic constructor-topic">',
            blocks.map(block => renderBlock(block, 0)).filter(Boolean).join('\n'),
            '    </article>',
            '</section>'
        ].join('\n');
    }

    function renderNavItem(section) {
        const id = escapeHtml(section && section.id || 'section');
        const title = escapeHtml(section && (section.navTitle || section.title) || 'Раздел');
        return '<li class="constructor-nav-item" data-constructor-nav="' + id + '"><a href="#' + id + '" class="nav-link">' + title + '</a></li>';
    }

    return { escapeHtml, renderInline, safeImageSource, renderBlock, renderSection, renderNavItem };
});
