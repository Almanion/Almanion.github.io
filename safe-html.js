/*
 * Small allow-list sanitizer for user-authored note fragments.
 *
 * The site intentionally stores formatted HTML for exam tickets.  Those
 * fragments may come from Firebase, localStorage, or a contenteditable field,
 * so they must never be inserted into the document verbatim.
 */
(function () {
    'use strict';

    const ALLOWED_TAGS = new Set([
        'A', 'ABBR', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DETAILS', 'DIV', 'EM',
        'FIGCAPTION', 'FIGURE', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'I', 'IMG',
        'KBD', 'LI', 'MARK', 'OL', 'P', 'PRE', 'S', 'SMALL', 'SPAN', 'STRONG',
        'SUB', 'SUMMARY', 'SUP', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD',
        'TR', 'U', 'UL', 'SVG', 'G', 'PATH', 'CIRCLE', 'ELLIPSE', 'LINE',
        'POLYLINE', 'POLYGON', 'RECT', 'TEXT', 'DEFS', 'MARKER'
    ]);

    const DROP_CONTENT_TAGS = new Set([
        'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT',
        'BUTTON', 'TEXTAREA', 'SELECT', 'OPTION', 'META', 'LINK', 'BASE'
    ]);

    const GLOBAL_ATTRIBUTES = new Set([
        'class', 'title', 'role', 'dir', 'lang', 'aria-label', 'aria-hidden',
        'aria-expanded', 'aria-controls', 'aria-describedby', 'aria-labelledby',
        'data-note-block', 'data-kc-id', 'data-kc-term', 'data-kc-answer',
        'data-kc-type', 'data-bookmark-id'
    ]);

    const TAG_ATTRIBUTES = {
        A: new Set(['href', 'target', 'rel']),
        IMG: new Set(['src', 'alt', 'width', 'height', 'loading', 'decoding']),
        DETAILS: new Set(['open']),
        TD: new Set(['colspan', 'rowspan']),
        TH: new Set(['colspan', 'rowspan', 'scope']),
        SVG: new Set(['viewbox', 'width', 'height', 'fill', 'stroke', 'stroke-width', 'aria-hidden']),
        G: new Set(['fill', 'stroke', 'stroke-width', 'transform']),
        PATH: new Set(['d', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'transform']),
        CIRCLE: new Set(['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width']),
        ELLIPSE: new Set(['cx', 'cy', 'rx', 'ry', 'fill', 'stroke', 'stroke-width']),
        LINE: new Set(['x1', 'x2', 'y1', 'y2', 'fill', 'stroke', 'stroke-width', 'stroke-linecap']),
        POLYLINE: new Set(['points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin']),
        POLYGON: new Set(['points', 'fill', 'stroke', 'stroke-width', 'stroke-linejoin']),
        RECT: new Set(['x', 'y', 'rx', 'ry', 'width', 'height', 'fill', 'stroke', 'stroke-width']),
        TEXT: new Set(['x', 'y', 'dx', 'dy', 'fill', 'text-anchor', 'transform']),
        MARKER: new Set(['id', 'viewbox', 'refx', 'refy', 'markerwidth', 'markerheight', 'orient', 'markerunits'])
    };

    function isSafeUrl(value, attribute) {
        const normalized = String(value || '').trim().replace(/[\u0000-\u001f\u007f\s]+/g, '');
        if (!normalized) return true;
        if (normalized[0] === '#' || normalized[0] === '/' || normalized.startsWith('./') || normalized.startsWith('../')) {
            return true;
        }
        if (/^https?:/i.test(normalized)) return true;
        if (attribute === 'href' && /^(mailto|tel):/i.test(normalized)) return true;
        if (attribute === 'src' && /^data:image\/(?:png|gif|jpe?g|webp|avif);base64,/i.test(normalized)) return true;
        return false;
    }

    function attributeAllowed(element, name) {
        const lower = name.toLowerCase();
        if (lower.startsWith('on') || lower === 'style' || lower === 'srcdoc') return false;
        if (GLOBAL_ATTRIBUTES.has(lower)) return true;
        if (lower.startsWith('aria-')) return true;
        const tagSet = TAG_ATTRIBUTES[element.tagName];
        return !!tagSet && tagSet.has(lower);
    }

    function cleanElement(element) {
        Array.from(element.attributes).forEach(function (attribute) {
            const name = attribute.name.toLowerCase();
            if (!attributeAllowed(element, name)) {
                element.removeAttribute(attribute.name);
                return;
            }
            if ((name === 'href' || name === 'src') && !isSafeUrl(attribute.value, name)) {
                element.removeAttribute(attribute.name);
            }
        });

        if (element.tagName === 'A' && element.getAttribute('target') === '_blank') {
            element.setAttribute('rel', 'noopener noreferrer');
        }
        if (element.tagName === 'IMG') {
            if (!element.hasAttribute('loading')) element.setAttribute('loading', 'lazy');
            if (!element.hasAttribute('decoding')) element.setAttribute('decoding', 'async');
        }
    }

    function sanitizeNodeTree(root) {
        Array.from(root.childNodes).forEach(function visit(node) {
            if (node.nodeType === Node.COMMENT_NODE) {
                node.remove();
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;

            const element = node;
            if (!ALLOWED_TAGS.has(element.tagName)) {
                if (DROP_CONTENT_TAGS.has(element.tagName)) {
                    element.remove();
                    return;
                }
                const parent = element.parentNode;
                while (element.firstChild) parent.insertBefore(element.firstChild, element);
                element.remove();
                return;
            }

            cleanElement(element);
            Array.from(element.childNodes).forEach(visit);
        });
        return root;
    }

    function sanitize(html) {
        const template = document.createElement('template');
        template.innerHTML = String(html == null ? '' : html);
        sanitizeNodeTree(template.content);
        return template.innerHTML;
    }

    function setHTML(element, html) {
        if (!element) return element;
        element.innerHTML = sanitize(html);
        return element;
    }

    function toFragment(html) {
        const template = document.createElement('template');
        template.innerHTML = sanitize(html);
        return template.content.cloneNode(true);
    }

    window.AlmanionSafeHtml = Object.freeze({
        sanitize: sanitize,
        setHTML: setHTML,
        toFragment: toFragment
    });
})();
