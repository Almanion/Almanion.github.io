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

    function scoreNumber(cell) {
        return Number.isFinite(cell?.number) ? cell.number : numericScore(cell?.text);
    }

    function sheetColor(cell) {
        const color = cell?.effectiveFormat?.backgroundColorStyle?.rgbColor || cell?.effectiveFormat?.backgroundColor;
        if (!color) return null;
        const [red, green, blue] = ['red', 'green', 'blue'].map(channel => Math.max(0, Math.min(1, Number(color[channel]) || 0)));
        const highest = Math.max(red, green, blue);
        const delta = highest - Math.min(red, green, blue);
        // Neutral fills belong to the spreadsheet layout, not to its score scale.
        if (delta < 0.04) return null;
        let hue;
        if (highest === red) hue = (green - blue) / delta;
        else if (highest === green) hue = (blue - red) / delta + 2;
        else hue = (red - green) / delta + 4;
        return Math.round((hue * 60 + 360) % 360) % 360;
    }

    function formatRanges(spreadsheet) {
        const ranges = [];
        for (const sheet of spreadsheet.sheets || []) {
            if (sheet.properties.hidden || !sheet.properties.title) continue;
            for (const grid of sheet.data || []) {
                let lastRow = -1;
                let lastColumn = -1;
                (grid.rowData || []).forEach((row, rowIndex) => {
                    (row.values || []).forEach((cell, columnIndex) => {
                        if (!cellText(cell)) return;
                        lastRow = Math.max(lastRow, rowIndex);
                        lastColumn = Math.max(lastColumn, columnIndex);
                    });
                });
                if (lastRow < 0 || lastColumn < 1) continue;
                const columnName = index => {
                    let name = '';
                    for (let number = index + 1; number > 0; number = Math.floor((number - 1) / 26)) name = String.fromCharCode(65 + (number - 1) % 26) + name;
                    return name;
                };
                const row = grid.startRow || 0;
                const column = grid.startColumn || 0;
                const name = "'" + sheet.properties.title.replace(/'/g, "''") + "'!";
                ranges.push(name + columnName(column + 1) + (row + 1) + ':' + columnName(column + lastColumn) + (row + lastRow + 1));
            }
        }
        return ranges;
    }

    function mergeFormats(spreadsheet, formatting) {
        for (const overlay of formatting.sheets || []) {
            const sheet = (spreadsheet.sheets || []).find(item => item.properties.sheetId === overlay.properties.sheetId);
            if (!sheet) continue;
            for (const grid of overlay.data || []) {
                (grid.rowData || []).forEach((row, rowIndex) => {
                    const absoluteRow = (grid.startRow || 0) + rowIndex;
                    for (const target of sheet.data || []) {
                        const targetRow = target.rowData?.[absoluteRow - (target.startRow || 0)];
                        if (!targetRow) continue;
                        (row.values || []).forEach((cell, columnIndex) => {
                            const targetCell = targetRow.values?.[(grid.startColumn || 0) + columnIndex - (target.startColumn || 0)];
                            // An edit between the two reads must not color a different score.
                            if (targetCell && cellText(targetCell) && cellText(targetCell) === cellText(cell)) targetCell.effectiveFormat = cell.effectiveFormat;
                        });
                    }
                });
            }
        }
        return spreadsheet;
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
                    cells: cells.map(cell => ({
                        text: cellText(cell),
                        note: String(cell?.note || ''),
                        number: Number.isFinite(cell?.effectiveValue?.numberValue) ? cell.effectiveValue.numberValue : null,
                        hue: sheetColor(cell)
                    }))
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
            const namedTotal = item.headers.findIndex((label, index) => index > 0 && /^(сумма|итого|всего|total|sum)(\s+балл(?:ы|ов|а))?$/iu.test(label.trim()));
            item.totalColumn = namedTotal > 0 ? namedTotal : (
                Number.isInteger(totalColumn) && totalColumn > 0 && totalColumn < width && !item.headers[totalColumn] ? totalColumn : -1
            );
            item.columns = Array.from({ length: width - 1 }, (_, index) => {
                const column = index + 1;
                return {
                    index: column,
                    label: item.headers[column] || (column === item.totalColumn ? 'Итого' : 'Столбец ' + (column + 1)),
                    link: item.links[column] || '',
                    total: column === item.totalColumn
                };
            });
        }
        return contests;
    }

    function parseSpreadsheet(spreadsheet, config) {
        const contests = (spreadsheet.sheets || [])
            .filter(sheet => !sheet.properties.hidden)
            .flatMap(sheet => parseSheet(sheet, config.totalColumn));
        const title = String(spreadsheet.properties?.title || '').trim();
        if (contests.length === 1 && title && !/^(новая таблица|без названия|untitled(?: spreadsheet)?)$/iu.test(title)) contests[0].title = title;
        return contests;
    }

    function filterPeople(contest, query, order) {
        const normalize = value => value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
        const words = normalize(String(query || '').trim()).split(/\s+/).filter(Boolean);
        const people = contest.people.filter(person => words.every(word => normalize(person.name).includes(word)));
        if (order === 'name') people.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        if (order === 'total') {
            const total = person => scoreNumber(person.cells[contest.totalColumn]);
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
            const score = scoreNumber(person.cells[contest.totalColumn]);
            if (score === null) return;
            if (score !== previous) rank = index + 1;
            ranks.set(person, rank);
            previous = score;
        });
        return ranks;
    }

    const api = { safeLink, numericScore, scoreNumber, sheetColor, formatRanges, mergeFormats, parseSpreadsheet, filterPeople, rankPeople };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.AlmanionContests = api;
}(typeof window !== 'undefined' ? window : globalThis));
