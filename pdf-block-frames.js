/* PDF block frames use the same millimetre measurements as styles/print.css.
 * Transparent canvas markers survive pdfmake pagination, including repeated
 * headers and nested tables. Draw only the frames after layout, never text. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AlmanionPdfBlockFrames = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    const mm = value => value * 72 / 25.4;
    const style = Object.freeze({ radius: mm(1.8), border: mm(.25), stripe: mm(.65), paddingX: mm(4), paddingY: mm(3.4), gap: mm(3.2), fill: '#ffffff', nestedFill: '#ffffff', rule: '#cfd3da', accent: '#8c939e' });
    // PDF strokes have no CSS cascade. Resolve their colour before cloning the
    // reader DOM, and composite translucent legacy accents on white paper.
    function colour(value) {
        value = String(value || '').trim().toLowerCase();
        let channels, alpha = 1;
        if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(value)) {
            let hex = value.slice(1);
            if (hex.length <= 4) hex = [...hex].map(char => char + char).join('');
            channels = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16));
            if (hex.length === 8) alpha = parseInt(hex.slice(6), 16) / 255;
        } else if (/^rgba?\([\d\s.,%/]+\)$/.test(value)) {
            const parts = value.slice(value.indexOf('(') + 1, -1).split(/[\s,/]+/).filter(Boolean);
            if (parts.length !== 3 && parts.length !== 4) return null;
            channels = parts.slice(0, 3).map(part => parseFloat(part) * (part.endsWith('%') ? 2.55 : 1));
            if (parts[3]) alpha = parseFloat(parts[3]) / (parts[3].endsWith('%') ? 100 : 1);
        } else return null;
        if (![...channels, alpha].every(Number.isFinite) || alpha < 0 || alpha > 1 || channels.some(channel => channel < 0 || channel > 255.00001)) return null;
        return '#' + channels.map(channel => Math.round(channel * alpha + 255 * (1 - alpha)).toString(16).padStart(2, '0')).join('');
    }
    function accentFor(element, kind) {
        const view = element.ownerDocument?.defaultView;
        if (!view) return style.accent;
        const computed = view.getComputedStyle(element);
        const body = view.getComputedStyle(element.ownerDocument.body);
        return colour(computed.getPropertyValue('--print-block-accent'))
            || colour(computed.getPropertyValue('--t-' + kind) || body.getPropertyValue('--t-' + kind))
            || colour(computed.getPropertyValue('--' + kind + '-border') || body.getPropertyValue('--' + kind + '-border'))
            || style.accent;
    }
    function marker(frame, edge, ancestors = []) {
        return { canvas: [{ type: 'line', x1: 0, x2: 0, y1: 0, y2: 0, lineWidth: 0, lineOpacity: 0, pdfBlockFrame: { ...frame, edge }, pdfFrameAncestors: ancestors.map(parent => parent.id) }] };
    }
    function collect(pages, margins) {
        const records = new Map();
        pages.forEach((page, index) => {
            for (const { type, item } of page.items) {
                if (type !== 'vector' || !item.pdfBlockFrame) continue;
                const frame = item.pdfBlockFrame;
                if (!records.has(frame.id)) records.set(frame.id, { ...frame, starts: new Map(), rowEnds: new Map(), end: null });
                const record = records.get(frame.id);
                const point = { page: index, x: item.x1 - style.paddingX, y: item.y1 };
                if (frame.edge === 'start') record.starts.set(index, point);
                else {
                    if (frame.edge === 'end') record.end = point;
                    for (const id of [frame.id, ...(item.pdfFrameAncestors || [])]) {
                        const owner = records.get(id);
                        if (owner) owner.rowEnds.set(index, Math.max(owner.rowEnds.get(index) || 0, point.y));
                    }
                }
            }
        });
        // A nested table can paginate the zero-height row-end marker separately
        // from its last SVG paragraph. Include the actual leaf bounds as well.
        pages.forEach((page, index) => {
            for (const { type, item } of page.items) {
                const owners = item.pdfFrameOwners || item._node?.pdfFrameOwners;
                if (!owners?.length) continue;
                const bottom = item.y + (type === 'line' ? item.getHeight() : item._height);
                if (!Number.isFinite(bottom)) continue;
                for (const id of owners) {
                    const owner = records.get(id);
                    if (owner) owner.rowEnds.set(index, Math.max(owner.rowEnds.get(index) || 0, bottom));
                }
            }
        });
        const result = [];
        for (const frame of records.values()) {
            if (!frame.starts.size || !frame.end) throw new Error('Не удалось определить границы блока PDF.');
            const first = Math.min(...frame.starts.keys());
            for (let page = first; page <= frame.end.page; page++) {
                const start = frame.starts.get(page);
                const top = start ? start.y - style.paddingY : margins[1];
                const surfaceEnd = frame.rowEnds.get(page);
                const bottom = page === frame.end.page ? frame.end.y + style.paddingY : Math.min((surfaceEnd ?? pages[page].pageSize.height - margins[3]) + style.paddingY, pages[page].pageSize.height - margins[3]);
                const x = start ? start.x : frame.starts.get(first).x;
                if (![x, top, bottom, frame.width].every(Number.isFinite) || frame.width <= 0 || bottom <= top || x < margins[0] - 1 || x + frame.width > pages[page].pageSize.width - margins[2] + 1 || top < margins[1] - 1 || bottom > pages[page].pageSize.height - margins[3] + 1) throw new Error('Блок PDF вышел за поля страницы.');
                result.push({ id: frame.id, page, x, y: top, width: frame.width, height: bottom - top, surfaceEnd, depth: frame.depth, accent: frame.accent });
            }
        }
        return result.sort((a, b) => a.page - b.page || a.depth - b.depth || a.y - b.y);
    }
    function draw(document, frames) {
        for (const frame of frames) {
            document.switchToPage(frame.page);
            const { x, y, width: w, height: h } = frame;
            const r = Math.min(style.radius, w / 2, h / 2);
            // Frames are strokes only: no large filled rectangles consume ink.
            document.save();
            const inset = style.border / 2;
            document.lineWidth(style.border).strokeColor(style.rule).roundedRect(x + inset, y + inset, w - style.border, h - style.border, Math.max(0, r - inset)).stroke();
            document.lineWidth(style.stripe).strokeColor(frame.accent || style.accent).lineCap('round').moveTo(x + style.stripe / 2, y + r).lineTo(x + style.stripe / 2, y + h - r).stroke();
            document.restore();
        }
    }
    return Object.freeze({ style, colour, accentFor, marker, collect, draw });
});
