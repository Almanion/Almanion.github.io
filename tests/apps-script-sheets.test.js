const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'apps-script.gs'), 'utf8');

function makeSheet(name, values) {
    return {
        getName: () => name,
        getLastRow: () => values.length,
        getLastColumn: () => Math.max(0, ...values.map(row => row.length)),
        getDataRange: () => ({
            getDisplayValues: () => values.map(row => row.slice()),
            getValues: () => values.map(row => row.slice())
        }),
        getRange: (row, column, rowCount, columnCount) => {
            if (row === 1 && column === 1 && rowCount === 1) {
                return { getDisplayValues: () => [values[0].slice(0, columnCount)] };
            }
            return { setValue: () => {} };
        }
    };
}

function run() {
    const sheets = [
        makeSheet('9 класс 2025-2026', [
            ['Номер', 'Статус', 'Текст задачи'],
            ['1', 'Н', 'Первая задача'],
            ['2', 'Р', ''],
            ['1', 'Полезная подсказка', '']
        ]),
        makeSheet('Лето 9—10', [
            ['Номер', 'Условие', 'Класс'],
            ['2', 'Летняя задача', 'лето 9—10']
        ]),
        makeSheet('Служебный лист', [
            ['Дата', 'Комментарий'],
            ['2026-09-03', 'Не является задачей']
        ])
    ];
    const spreadsheet = {
        getSheets: () => sheets,
        getSheetByName: name => sheets.find(sheet => sheet.getName() === name) || null
    };
    const sandbox = {
        SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
        PropertiesService: {
            getScriptProperties: () => ({ getProperty: () => '' })
        },
        ContentService: {
            MimeType: { JSON: 'json' },
            createTextOutput: text => ({
                text,
                setMimeType() { return this; }
            })
        },
        console,
        JSON,
        String,
        Object,
        Array,
        RegExp
    };

    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'apps-script.gs' });
    const payload = JSON.parse(vm.runInContext('getTasks(false).text', sandbox));

    assert.equal(payload.success, true);
    assert.equal(payload.count, 2);
    assert.deepEqual(Array.from(payload.sheets), ['9 класс 2025-2026', 'Лето 9—10']);
    assert.equal(payload.tasks[0].number, '1');
    assert.equal(payload.tasks[0].numberText, '1');
    assert.equal(payload.tasks[0].description, 'Первая задача');
    assert.equal(payload.tasks[0].hint, 'Полезная подсказка');
    assert.equal(payload.tasks[0].grade, 'grade-9');
    assert.equal(payload.tasks[1].description, 'Летняя задача');
    assert.equal(payload.tasks[1].grade, 'grade-summer-9-10');

    console.log('apps script multi-sheet loading: all tests passed');
}

run();
