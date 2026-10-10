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

    // Only future, explicitly annotated rows acquire series metadata.
    sheets.push(makeSheet('10 класс 2026-2027', [
        ['Номер', 'Условие', 'TaskId', 'SeriesId', 'SeriesTitle', 'SeriesDate', 'AcademicYear'],
        ['1', 'Новая задача', '2026-s1-t1', '2026-s1', 'Делимость', '26.09.2026', '2026/2027']
    ]));
    const extended = JSON.parse(vm.runInContext('getTasks(false).text', sandbox));
    assert.deepEqual(extended.tasks.slice(0, 2), payload.tasks, 'legacy payload is unchanged');
    assert.equal(extended.tasks[2].taskId, '2026-s1-t1');
    assert.equal(extended.tasks[2].seriesId, '2026-s1');
    assert.equal(extended.tasks[2].seriesDate, '26.09.2026');
    assert.equal(extended.tasks[2].seriesTitle, 'Делимость');
    assert.equal(extended.tasks[2].academicYear, '2026/2027');

    const campSheet = makeSheet('Лагерь 2026', [
        ['Номер', 'Условие', 'Класс', 'TaskId', 'SeriesId', 'Название серии', 'Дата серии'],
        ['1', 'Дословное условие $x^2+1$.', 'grade-camp-2026', 'camp-2026-t001', 'camp-2026-add-01', 'Добавка №1. 8 августа 2026 года.', '08.08.2026']
    ]);
    const opened=[];
    sandbox.SpreadsheetApp.openById = id => { opened.push(id); return { getSheetByName: name => name === 'Лагерь 2026' ? campSheet : null }; };
    sandbox.PropertiesService.getScriptProperties = () => ({ getProperty: key => key === 'MATCENTER_CAMP_2026_SPREADSHEET_ID' ? 'camp-test-sheet' : '' });
    const campPayload = JSON.parse(vm.runInContext('getTasks(false, getCamp2026Sheets()).text', sandbox));
    assert.equal(campPayload.count, 1);
    assert.equal(campPayload.tasks[0].grade, 'grade-camp-2026');
    assert.equal(campPayload.tasks[0].description, 'Дословное условие $x^2+1$.');
    assert.deepEqual(JSON.parse(vm.runInContext('getTasks(false).text', sandbox)), extended, 'camp must not change existing archives');
    assert.equal(vm.runInContext("findTaskLocation('1', 'grade-camp-2026', 'camp-2026-t001').sheet.getName()", sandbox), 'Лагерь 2026');
    assert.ok(opened.every(id => id === 'camp-test-sheet'));
    const readCount = opened.length;
    sandbox.resolveAccess = () => ({ allowed: false, role: '' });
    const denied = JSON.parse(vm.runInContext("handle({postData:{contents:JSON.stringify({action:'campTasks'})}}).text", sandbox));
    assert.equal(denied.success, false);
    assert.equal(opened.length, readCount, 'unauthorized request must never open the camp spreadsheet');
    sandbox.PropertiesService.getScriptProperties = () => ({ getProperty: () => '' });
    assert.throws(() => vm.runInContext('getCamp2026Sheets()', sandbox), /ещё не подключена/);

    const changedProperties = [];
    sandbox.PropertiesService.getScriptProperties = () => ({ setProperty: (key, value) => changedProperties.push([key, value]) });
    assert.throws(() => vm.runInContext('connectCamp2026Spreadsheet()', sandbox), /134 задачами/);
    assert.equal(changedProperties.length, 0, 'setup refuses an incomplete workbook');
    sandbox.SpreadsheetApp.openById = () => ({ getSheetByName: () => ({ getLastRow: () => 135 }) });
    vm.runInContext('connectCamp2026Spreadsheet()', sandbox);
    assert.deepEqual(changedProperties, [['MATCENTER_CAMP_2026_SPREADSHEET_ID', '1mUZyK3PHBjYD3_6ouI7PeVrtt7S3e3zVMNC-u6pUAOU']]);

    const yearSheet = makeSheet('10 класс 2026-2027', [
        ['Number','Description','Grade','TaskId','SeriesId','SeriesTitle','AcademicYear','Parts'],
        ['16','Exact future text','grade-10','g10-2026-t016','g10-2026-s02','Серия 2','2026/2027','["a","b"]']
    ]);
    sandbox.PropertiesService.getScriptProperties = () => ({getProperty:key=>key==='MATCENTER_ACADEMIC_YEAR_SPREADSHEET_IDS'?'year-test-id':''});
    let yearReads=0;
    sandbox.SpreadsheetApp.openById = id => {
        assert.equal(id,'year-test-id'); yearReads++;
        return {getSheets:()=>[yearSheet]};
    };
    const yearlyPayload = JSON.parse(vm.runInContext('getTasks(false,getAcademicYearSheets()).text',sandbox));
    assert.equal(yearlyPayload.tasks.length,1);
    assert.equal(yearlyPayload.tasks[0].parts,'["a","b"]');
    assert.equal(yearlyPayload.tasks[0].description,'Exact future text');
    assert.equal(vm.runInContext("findTaskLocation('16','grade-10','g10-2026-t016').sheet.getName()",sandbox),'10 класс 2026-2027');
    const previousReads=yearReads;
    const deniedYear=JSON.parse(vm.runInContext("handle({postData:{contents:JSON.stringify({action:'academicYearTasks'})}}).text",sandbox));
    assert.equal(deniedYear.success,false);
    assert.equal(yearReads,previousReads,'unauthorized future-year requests cannot read Sheets');
    sandbox.resolveAccess=()=>({allowed:true,role:'user'});
    const allowedYear=JSON.parse(vm.runInContext("handle({postData:{contents:JSON.stringify({action:'academicYearTasks'})}}).text",sandbox));
    assert.equal(allowedYear.count,1);
    const readOnly=JSON.parse(vm.runInContext("handle({postData:{contents:JSON.stringify({action:'changeStatus',taskId:'g10-2026-t016'})}}).text",sandbox));
    assert.equal(readOnly.success,false);
    assert.match(readOnly.error,/Недостаточно прав/);
    assert.deepEqual(JSON.parse(vm.runInContext('getTasks(false).text',sandbox)),extended,'future years do not mutate legacy archives');
    console.log('apps script multi-sheet loading: all tests passed');
}

run();
