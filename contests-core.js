(function (root) {
    'use strict';

    function safeLink(value) {
        try {
            const url = new URL(String(value || ''));
            return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
        } catch (_) {
            return '';
        }
    }

    function cellText(cell) {
        return String(cell?.formattedValue ?? '').trim();
    }

    function parseSheet(sheet, totalColumn) {
        const rows = sheet.data?.[0]?.rowData || [];
        const contests = [];
        let contest;
        for (const [index, row] of rows.entries()) {
            const cells = row.values || [];
            const first = cellText(cells[0]);
            if (!first && cells.every(cell => !cellText(cell))) continue;
            const link = safeLink(cells[0]?.hyperlink || first);
            if (link) {
                contest = {
                    id: sheet.properties.sheetId + '-' + index,
                    title: 'Контест ' + (contests.length + 1),
                    link,
                    headers: cells.map(cellText),
                    people: [],
                    totalColumn
                };
                contests.push(contest);
            } else if (contest && first) {
                const isCaption = cells.slice(1).every(cell => !cellText(cell))
                    && /(?:day\s*\d|[A-Z]{2,}\d{2}|олимпиад|контест|(?:^|\s)тур(?:\s|$))/iu.test(first);
                if (isCaption && contest.people.length) contest.title = first;
                else contest.people.push({
                    name: first,
                    cells: cells.map(cell => ({ text: cellText(cell), note: String(cell?.note || '') }))
                });
            }
        }
        for (const item of contests) {
            const width = Math.max(item.headers.length, ...item.people.map(person => person.cells.length));
            item.columns = Array.from({ length: width - 1 }, (_, index) => {
                const column = index + 1;
                return {
                    index: column,
                    label: item.headers[column] || (column === totalColumn ? 'Итого' : 'Столбец ' + (column + 1)),
                    total: column === totalColumn
                };
            });
        }
        return contests;
    }

    function parseSpreadsheet(spreadsheet, config) {
        return (spreadsheet.sheets || [])
            .filter(sheet => !sheet.properties.hidden)
            .flatMap(sheet => parseSheet(sheet, config.totalColumn));
    }

    function filterPeople(contest, query, order) {
        const normalize = value => value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
        const words = normalize(String(query || '').trim()).split(/\s+/).filter(Boolean);
        const people = contest.people.filter(person => words.every(word => normalize(person.name).includes(word)));
        if (order === 'name') people.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        if (order === 'total') {
            const total = person => Number(person.cells[contest.totalColumn]?.text.replace(',', '.')) || 0;
            people.sort((a, b) => total(b) - total(a));
        }
        return people;
    }

    const api = { safeLink, parseSpreadsheet, filterPeople };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.AlmanionContests = api;
}(typeof window !== 'undefined' ? window : globalThis));
