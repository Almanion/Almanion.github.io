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
    const style = Object.freeze({ radius: mm(1.8), border: mm(.25), stripe: mm(.65), paddingX: mm(4), paddingY: mm(3.4), gap: mm(3.2), fill: '#f6f7f9', nestedFill: '#fbfbfc', rule: '#cfd3da', accent: '#8c939e' });
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
                result.push({ id: frame.id, page, x, y: top, width: frame.width, height: bottom - top, surfaceEnd, depth: frame.depth });
            }
        }
        return result.sort((a, b) => a.page - b.page || a.depth - b.depth || a.y - b.y);
    }
    function draw(document, frames) {
        for (const frame of frames) {
            document.switchToPage(frame.page);
            const { x, y, width: w, height: h } = frame;
            const r = Math.min(style.radius, w / 2, h / 2), k = .5522847498;
            // The table already painted a light surface. Trim its four square
            // corners against the containing surface, without covering content.
            const surround = frame.depth === 0 ? '#ffffff' : frame.depth === 1 ? style.fill : style.nestedFill;
            const corners = [
                `M${x},${y} L${x+r},${y} C${x+r-k*r},${y} ${x},${y+r-k*r} ${x},${y+r} Z`,
                `M${x+w},${y} L${x+w},${y+r} C${x+w},${y+r-k*r} ${x+w-r+k*r},${y} ${x+w-r},${y} Z`,
                `M${x+w},${y+h} L${x+w-r},${y+h} C${x+w-r+k*r},${y+h} ${x+w},${y+h-r+k*r} ${x+w},${y+h-r} Z`,
                `M${x},${y+h} L${x},${y+h-r} C${x},${y+h-r+k*r} ${x+r-k*r},${y+h} ${x+r},${y+h} Z`
            ];
            document.save();
            if (Number.isFinite(frame.surfaceEnd) && frame.surfaceEnd < y + h) {
                document.fillColor(frame.depth ? style.nestedFill : style.fill).rect(x, frame.surfaceEnd, w, y + h - frame.surfaceEnd).fill();
            }
            document.fillColor(surround);
            for (const path of corners) document.path(path).fill();
            const inset = style.border / 2;
            document.lineWidth(style.border).strokeColor(style.rule).roundedRect(x + inset, y + inset, w - style.border, h - style.border, Math.max(0, r - inset)).stroke();
            document.lineWidth(style.stripe).strokeColor(style.accent).lineCap('round').moveTo(x + style.stripe / 2, y + r).lineTo(x + style.stripe / 2, y + h - r).stroke();
            document.restore();
        }
    }
    return Object.freeze({ style, marker, collect, draw });
});
