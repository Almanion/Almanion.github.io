'use strict';

const assert = require('node:assert/strict');
const { parseSpreadsheet, filterPeople, safeLink } = require('../contests-core');
const row = (...values) => ({ values: values.map(value => ({ formattedValue: value })) });
const spreadsheet = { sheets: [{ properties: { sheetId: 0 }, data: [{ rowData: [
    row('https://example.test/contest/1', 'a', 'b', 'c', 'd'),
    row('Ёлкин', '0', '', '25', '100', '125'),
    row('Алексей', '', '0', '0', '0', '0'),
    row('SCHOOL26DAY1'),
    row(),
    row('https://example.test/contest/2', 'Задача 1', 'Задача 2'),
    row('<img src=x onerror=alert(1)>', '0', '1'),
    row('Тур 2')
] }] }] };
const contests = parseSpreadsheet(spreadsheet, { totalColumn: 5 });
assert.equal(contests.length, 2);
assert.equal(contests[0].title, 'SCHOOL26DAY1');
assert.equal(contests[0].people[0].cells[1].text, '0');
assert.equal(contests[0].people[0].cells[2].text, '');
assert.equal(contests[0].columns.at(-1).label, 'Итого');
assert.equal(contests[0].columns.at(-1).total, true);
assert.equal(contests[1].columns[0].label, 'Задача 1');
assert.equal(contests[1].title, 'Тур 2');
assert.equal(contests[1].people.length, 1);
assert.equal(contests[1].people[0].name, '<img src=x onerror=alert(1)>');
assert.deepEqual(filterPeople(contests[0], 'елк', 'source').map(p => p.name), ['Ёлкин']);
assert.deepEqual(filterPeople(contests[0], '', 'name').map(p => p.name), ['Алексей', 'Ёлкин']);
assert.equal(filterPeople(contests[0], '', 'total')[0].name, 'Ёлкин');
assert.equal(contests[0].people[0].name, 'Ёлкин', 'sorting must preserve the source order');
assert.equal(safeLink('javascript:alert(1)'), '');
assert.equal(safeLink('data:text/html,hello'), '');
assert.deepEqual(parseSpreadsheet({ sheets: [] }, { totalColumn: 5 }), []);
assert.deepEqual(parseSpreadsheet({ sheets: [{ ...spreadsheet.sheets[0], properties: { hidden: true } }] }, { totalColumn: 5 }), []);
console.log('Contest tables: grouping, original scores, missing cells, captions, filtering and safe links passed');
