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

    function numericScore(value) {
        const text = String(value ?? '').trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.').replace('−', '-');
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
        const number = Number(text);
        return Number.isFinite(number) ? number : null;
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
                    links: cells.map(cell => safeLink(cell?.hyperlink)),
                    people: [],
                    totalColumn
                };
                contests.push(contest);
            } else if (contest && first) {
                const isCaption = cells.slice(1).every(cell => !cellText(cell))
                    && /(?:day\s*\d|[A-Z]{2,}\d{2}|олимпиад|контест|(?:^|\s)тур(?:\s|$))/iu.test(first);
                if (isCaption && contest.people.length) contest.title = first;
                else contest.people.push({
                    id: sheet.properties.sheetId + '-' + index,
                    name: first,
                    cells: cells.map(cell => ({ text: cellText(cell), note: String(cell?.note || '') }))
                });
            }
        }
        for (const item of contests) {
            // Sheets may include many trailing cells which only have formatting.
            const hasValue = index => item.headers[index] || item.people.some(person => {
                const cell = person.cells[index];
                return cell?.text || cell?.note;
            });
            let width = Math.max(item.headers.length, ...item.people.map(person => person.cells.length));
            while (width > 1 && !hasValue(width - 1)) width--;
            item.columns = Array.from({ length: width - 1 }, (_, index) => {
                const column = index + 1;
                return {
                    index: column,
                    label: item.headers[column] || (column === totalColumn ? 'Итого' : 'Столбец ' + (column + 1)),
                    link: item.links[column] || '',
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
            const total = person => numericScore(person.cells[contest.totalColumn]?.text);
            people.sort((a, b) => {
                const left = total(a);
                const right = total(b);
                if (left === null) return right === null ? 0 : 1;
                if (right === null) return -1;
                return right - left;
            });
        }
        return people;
    }

    function rankPeople(contest) {
        const ranks = new Map();
        let previous = null;
        let rank = 0;
        filterPeople(contest, '', 'total').forEach((person, index) => {
            const score = numericScore(person.cells[contest.totalColumn]?.text);
            if (score === null) return;
            if (score !== previous) rank = index + 1;
            ranks.set(person, rank);
            previous = score;
        });
        return ranks;
    }

    const api = { safeLink, numericScore, parseSpreadsheet, filterPeople, rankPeople };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.AlmanionContests = api;
}(typeof window !== 'undefined' ? window : globalThis));
