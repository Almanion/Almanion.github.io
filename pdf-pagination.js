/* Print page zero is the contents; all later pages have a single serial number.
 * Heading IDs let the contents use actual PDF layout, not estimated heights. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AlmanionPdfPagination = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    function heading(text, level, entries, options = {}) {
        text = String(text || '').replace(/\s+/g, ' ').trim();
        const id = 'pdf-heading-' + entries.length;
        entries.push({ id, text, level });
        return { text, id, fontSize: level === 0 ? 16 : 13, bold: true, margin: [0, 4, 0, 9], headlineLevel: 1, newSection: true, ...options };
    }
    function contents(entries, locations, english) {
        return {
            stack: [
                { text: english ? 'Contents' : 'Содержание', fontSize: 18, bold: true, margin: [0, 0, 0, 16] },
                { table: { widths: ['*', 36], dontBreakRows: true, body: entries.map(entry => [
                    { text: entry.text, linkToDestination: entry.id, bold: entry.level === 0, margin: [entry.level * 12, entry.level === 0 ? 4 : 0, 6, 0] },
                    { text: String(locations?.[entry.id] ?? 0), linkToDestination: entry.id, alignment: 'right', margin: [0, entry.level === 0 ? 4 : 0, 0, 0] }
                ]) }, layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 2, paddingBottom: () => 2 }, fontSize: 9.5, lineHeight: 1.15 }
            ],
            pageBreak: 'after'
        };
    }
    function locate(pages, entries) {
        const wanted = new Set(entries.map(entry => entry.id));
        const result = {};
        pages.forEach((page, index) => {
            for (const { type, item } of page.items) {
                const id = item._node?.id;
                if (type === 'line' && wanted.has(id) && result[id] === undefined) result[id] = index;
            }
        });
        if (entries.some(entry => result[entry.id] === undefined)) throw new Error('Не удалось определить страницы содержания.');
        return result;
    }
    function verify(locations, actual) {
        if (Object.keys(locations).some(id => locations[id] !== actual[id])) throw new Error('Страницы содержания изменились при подготовке PDF. Повторите экспорт.');
    }
    function copy(value) {
        if (Array.isArray(value)) return value.map(copy);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
        return value;
    }
    function footer(page) {
        return { columns: [{ text: '@Almanion239' }, { text: String(page - 1), alignment: 'right' }], margin: [39.69, 16, 39.69, 0], fontSize: 9, color: '#535963' };
    }
    return Object.freeze({ heading, contents, locate, verify, copy, footer });
});
