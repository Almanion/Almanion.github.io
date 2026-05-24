/**
 * matcenter — Google Apps Script backend.
 *
 * Что делает:
 *  - Возвращает все задачи из активного листа в JSON-формате, который ждёт matcenter.js.
 *  - Поддерживает изменение статуса и подсказки (action=changeStatus / action=setHint),
 *    но только если пришёл админский пароль.
 *
 * Как подключить — см. в самом конце файла (INSTRUCTIONS).
 */

// === НАСТРОЙКИ — отредактируйте перед деплоем ============================
const USER_PASSWORD  = 'CHANGE_ME_user';   // обычный пароль (для всех учеников)
const ADMIN_PASSWORD = 'CHANGE_ME_admin';  // админский пароль (даёт право менять статусы и подсказки)
// =========================================================================

// Ожидаемые заголовки колонок (первая строка листа):
// Number | NumberText | Description | Status | Hint | Grade

function doGet(e) {
  return handle(e);
}

function doPost(e) {
  return handle(e);
}

function handle(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const password = params.password || '';
    const isAdmin  = password === ADMIN_PASSWORD;
    const isUser   = isAdmin || password === USER_PASSWORD;

    if (!isUser) {
      return json({ success: false, error: 'Неверный пароль' });
    }

    const action = params.action || '';

    if (action === 'changeStatus') {
      if (!isAdmin) return json({ success: false, error: 'Недостаточно прав' });
      return changeStatus(params.taskNumber, params.newStatus);
    }

    if (action === 'setHint') {
      if (!isAdmin) return json({ success: false, error: 'Недостаточно прав' });
      return setHint(params.taskNumber, params.hintText || '');
    }

    if (action) {
      return json({ success: false, error: 'Неизвестное действие: ' + action });
    }

    return getTasks(isAdmin);
  } catch (err) {
    return json({ success: false, error: String(err && err.message || err) });
  }
}

// === Чтение задач =========================================================
function getTasks(isAdmin) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return json({ success: true, count: 0, isAdmin: isAdmin, tasks: [] });
  }

  const headers = values[0].map(function (h) { return String(h || '').trim(); });
  const tasks = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const task = {};
    let hasNumber = false;

    headers.forEach(function (h, j) {
      if (!h) return;
      const key = headerToKey(h); // Number -> number, NumberText -> numberText, ...
      const val = row[j];
      task[key] = (val === '' || val === null || val === undefined) ? '' : String(val);
      if (key === 'number' && task[key] !== '') hasNumber = true;
    });

    if (hasNumber) tasks.push(task);
  }

  return json({
    success: true,
    count: tasks.length,
    isAdmin: isAdmin,
    tasks: tasks
  });
}

// === Изменение статуса =====================================================
function changeStatus(taskNumber, newStatus) {
  if (!taskNumber) return json({ success: false, error: 'taskNumber обязателен' });

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (h) { return String(h || '').trim(); });

  const numCol = findColumn(headers, ['Number', 'number']);
  const statusCol = findColumn(headers, ['Status', 'status']);
  if (numCol === -1) return json({ success: false, error: 'Колонка Number не найдена' });
  if (statusCol === -1) return json({ success: false, error: 'Колонка Status не найдена' });

  const target = String(taskNumber).trim();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][numCol]).trim() === target) {
      sheet.getRange(i + 1, statusCol + 1).setValue(newStatus || '');
      return json({ success: true });
    }
  }
  return json({ success: false, error: 'Задача №' + taskNumber + ' не найдена' });
}

// === Изменение подсказки ==================================================
function setHint(taskNumber, hintText) {
  if (!taskNumber) return json({ success: false, error: 'taskNumber обязателен' });

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (h) { return String(h || '').trim(); });

  const numCol = findColumn(headers, ['Number', 'number']);
  const hintCol = findColumn(headers, ['Hint', 'hint']);
  if (numCol === -1) return json({ success: false, error: 'Колонка Number не найдена' });
  if (hintCol === -1) return json({ success: false, error: 'Колонка Hint не найдена' });

  const target = String(taskNumber).trim();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][numCol]).trim() === target) {
      sheet.getRange(i + 1, hintCol + 1).setValue(hintText || '');
      return json({ success: true });
    }
  }
  return json({ success: false, error: 'Задача №' + taskNumber + ' не найдена' });
}

// === Утилиты ==============================================================
function headerToKey(h) {
  // 'Number' -> 'number', 'NumberText' -> 'numberText'
  if (!h) return '';
  return h.charAt(0).toLowerCase() + h.slice(1);
}

function findColumn(headers, candidates) {
  for (let i = 0; i < candidates.length; i++) {
    const idx = headers.indexOf(candidates[i]);
    if (idx !== -1) return idx;
  }
  return -1;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================================
   INSTRUCTIONS — подключение

   1) Откройте таблицу:
      https://docs.google.com/spreadsheets/d/1JhJHikEjeU9_bMYEasf7VlqyAsJW9FRyUo4ef-6nCV4/edit

   2) Меню Extensions → Apps Script.
      Откроется редактор скрипта, привязанный к таблице.

   3) Удалите всё содержимое файла Code.gs и вставьте содержимое ЭТОГО файла.

   4) Сверху в блоке «НАСТРОЙКИ» поменяйте USER_PASSWORD и ADMIN_PASSWORD
      на свои значения (не используйте дефолтные «CHANGE_ME_...»).

   5) Сохраните проект (Ctrl/Cmd+S). При первом сохранении даст имя — например
      «matcenter-backend».

   6) Deploy → New deployment.
        - Тип: Web app
        - Description: matcenter v1 (любое)
        - Execute as: Me (ваш гугл-аккаунт)
        - Who has access: Anyone   ← важно, иначе фронт не сможет дёргать
      Нажмите Deploy. Google попросит подтвердить разрешения — соглашайтесь.

   7) После деплоя появится Web app URL вида:
        https://script.google.com/macros/s/AKfycb.../exec
      Скопируйте его.

   8) В docs/matcenter.js (строка ~6) замените значение API_ENDPOINT на этот URL.

   9) Откройте сайт, введите USER_PASSWORD. Должны загрузиться задачи.

   Дальше при изменении кода Apps Script нужно делать НОВЫЙ deploy (или Manage
   deployments → редактировать существующий и нажать Deploy). URL может остаться
   тем же — это от настройки зависит.

   Если хотите добавить ещё классы (9, 10, 11 и т.д.) в эту же таблицу —
   просто продолжайте добавлять строки на тот же лист, меняя значение в колонке
   Grade. Apps Script отдаёт всё содержимое листа сразу, фильтрация по классу
   уже происходит на фронте.
   ========================================================================== */
