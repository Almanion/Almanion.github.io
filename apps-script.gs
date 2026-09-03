/**
 * matcenter — Google Apps Script backend.
 *
 * Что делает:
 *  - Возвращает задачи со всех листов таблицы, где есть колонка Number или NumberText.
 *  - Один раз подтверждает Firebase-аккаунт паролем Матцентра.
 *  - После подтверждения принимает Firebase ID token, а пароль больше не передаётся.
 *  - Изменение статуса и подсказки доступно только аккаунтам с ролью admin.
 *
 * Как подключить — см. в самом конце файла (INSTRUCTIONS).
 */

const AUTH_VERSION = 2;
const ACCESS_PREFIX = 'MATCENTER_ACCESS_';
const FAILED_PREFIX = 'MATCENTER_FAILED_';

// Ожидаемые заголовки колонок (первая строка листа):
// TaskId (рекомендуется) | Number | NumberText | Description | Status | Hint | Grade

function doGet(e) {
  return handle(e);
}

function doPost(e) {
  return handle(e);
}

function handle(e) {
  try {
    const params = requestParams(e);
    const action = params.action || '';

    if (action === 'capabilities') {
      return json({
        success: true,
        authVersion: AUTH_VERSION,
        accountConfirmation: true,
        multiSheetTasks: true
      });
    }

    if (action === 'authorizeAccount') {
      return authorizeAccount(params.idToken || '', params.password || '');
    }

    if (action === 'accessStatus') {
      const identity = verifyFirebaseToken(params.idToken || '');
      const role = getAccountRole(identity.uid);
      return json({
        success: true,
        authVersion: AUTH_VERSION,
        allowed: !!role,
        isAdmin: role === 'admin'
      });
    }

    const access = resolveAccess(params);
    if (!access.allowed) {
      return json({ success: false, authVersion: AUTH_VERSION, error: 'Аккаунт не подтверждён для Матцентра' });
    }
    const isAdmin = access.role === 'admin';

    if (action === 'changeStatus') {
      if (!isAdmin) return json({ success: false, error: 'Недостаточно прав' });
      return changeStatus(params.taskNumber, params.newStatus, params.grade, params.taskId);
    }

    if (action === 'setHint') {
      if (!isAdmin) return json({ success: false, error: 'Недостаточно прав' });
      return setHint(params.taskNumber, params.hintText || '', params.grade, params.taskId);
    }

    if (action) {
      return json({ success: false, authVersion: AUTH_VERSION, error: 'Неизвестное действие: ' + action });
    }

    return getTasks(isAdmin);
  } catch (err) {
    return json({ success: false, error: String(err && err.message || err) });
  }
}

// === Чтение задач =========================================================
function getTasks(isAdmin) {
  const tasks = [];
  const sheets = getTaskSheets();

  sheets.forEach(function (sheet) {
    const values = getSheetValues(sheet);
    if (values.length < 2) return;

    const headers = values[0].map(function (h) { return String(h || '').trim(); });
    const headerKeys = headers.map(headerToKey);
    const inferredGrade = inferGradeFromSheetName(sheet.getName());

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const task = {};

      headerKeys.forEach(function (key, j) {
        if (!key) return;
        const val = row[j];
        task[key] = (val === '' || val === null || val === undefined) ? '' : String(val).trim();
      });

      // В старых таблицах номер иногда находился только в NumberText.
      const taskNumber = task.number || task.numberText;
      if (!taskNumber) continue;

      task.number = taskNumber;
      if (!task.numberText) task.numberText = taskNumber;
      task.grade = normalizeGrade(task.grade, inferredGrade);
      task.sourceSheet = sheet.getName();
      tasks.push(task);
    }
  });

  return json({
    success: true,
    count: tasks.length,
    isAdmin: isAdmin,
    sheets: sheets.map(function (sheet) { return sheet.getName(); }),
    tasks: tasks
  });
}

// === Изменение статуса =====================================================
function changeStatus(taskNumber, newStatus, grade, taskId) {
  if (!taskNumber) return json({ success: false, error: 'taskNumber обязателен' });

  const found = findTaskLocation(taskNumber, grade, taskId);
  if (found.error) return json({ success: false, error: found.error });

  const statusCol = findColumnByKey(found.headers, 'status');
  if (statusCol === -1) return json({ success: false, error: 'Колонка Status не найдена' });

  found.sheet.getRange(found.rowIndex + 1, statusCol + 1).setValue(newStatus || '');
  return json({ success: true });
}

function requestParams(e) {
  const params = Object.assign({}, (e && e.parameter) ? e.parameter : {});
  const raw = e && e.postData && e.postData.contents;
  if (!raw) return params;
  try {
    const body = JSON.parse(raw);
    if (body && typeof body === 'object') Object.assign(params, body);
  } catch (_) {}
  return params;
}

function authorizeAccount(idToken, password) {
  const identity = verifyFirebaseToken(idToken);
  const cache = CacheService.getScriptCache();
  const failedKey = FAILED_PREFIX + identity.uid;
  const failed = Number(cache.get(failedKey) || 0);
  if (failed >= 8) throw new Error('Слишком много попыток. Повторите через 15 минут');

  const properties = PropertiesService.getScriptProperties();
  const userPassword = properties.getProperty('MATCENTER_USER_PASSWORD') || '';
  const adminPassword = properties.getProperty('MATCENTER_ADMIN_PASSWORD') || '';
  let role = '';
  if (adminPassword && secureEqual(password, adminPassword)) role = 'admin';
  else if (userPassword && secureEqual(password, userPassword)) role = 'user';

  if (!role) {
    cache.put(failedKey, String(failed + 1), 900);
    throw new Error('Неверный пароль');
  }

  cache.remove(failedKey);
  properties.setProperty(ACCESS_PREFIX + identity.uid, role);
  return json({
    success: true,
    authVersion: AUTH_VERSION,
    allowed: true,
    isAdmin: role === 'admin'
  });
}

function resolveAccess(params) {
  if (params.idToken) {
    const identity = verifyFirebaseToken(params.idToken);
    const role = getAccountRole(identity.uid);
    return { allowed: !!role, role: role, uid: identity.uid };
  }

  // Только для короткого переходного периода между двумя deployment URL.
  // После обновления обоих endpoint удалите MATCENTER_ALLOW_LEGACY или задайте false.
  const properties = PropertiesService.getScriptProperties();
  if (properties.getProperty('MATCENTER_ALLOW_LEGACY') === 'true') {
    const password = params.password || '';
    const userPassword = properties.getProperty('MATCENTER_USER_PASSWORD') || '';
    const adminPassword = properties.getProperty('MATCENTER_ADMIN_PASSWORD') || '';
    if (adminPassword && secureEqual(password, adminPassword)) return { allowed: true, role: 'admin' };
    if (userPassword && secureEqual(password, userPassword)) return { allowed: true, role: 'user' };
  }
  return { allowed: false, role: '' };
}

function getAccountRole(uid) {
  return PropertiesService.getScriptProperties().getProperty(ACCESS_PREFIX + uid) || '';
}

/**
 * Запустите эту функцию один раз вручную из редактора Apps Script после
 * перехода на v2. Так Google покажет владельцу диалог для выдачи разрешения
 * script.external_request, которое нужно для проверки Firebase ID token.
 */
function authorizeExternalRequests() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('FIREBASE_WEB_API_KEY');
  if (!apiKey) throw new Error('Сначала задайте FIREBASE_WEB_API_KEY в Script properties');

  const response = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(apiKey),
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ idToken: 'permission-check' }),
      muteHttpExceptions: true
    }
  );
  Logger.log('Разрешение внешних запросов выдано. Проверочный HTTP-код: ' + response.getResponseCode());
  return 'Готово: внешние запросы разрешены';
}

function verifyFirebaseToken(idToken) {
  if (!idToken) throw new Error('Сначала войдите в аккаунт');
  const apiKey = PropertiesService.getScriptProperties().getProperty('FIREBASE_WEB_API_KEY');
  if (!apiKey) throw new Error('На сервере не задан FIREBASE_WEB_API_KEY');

  const response = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(apiKey),
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ idToken: idToken }),
      muteHttpExceptions: true
    }
  );
  if (response.getResponseCode() !== 200) throw new Error('Сессия аккаунта истекла. Войдите снова');
  const payload = JSON.parse(response.getContentText() || '{}');
  const user = payload.users && payload.users[0];
  if (!user || !user.localId) throw new Error('Не удалось проверить аккаунт');
  return { uid: user.localId, email: user.email || '' };
}

function secureEqual(left, right) {
  const a = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(left), Utilities.Charset.UTF_8);
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(right), Utilities.Charset.UTF_8);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// === Изменение подсказки ==================================================
function setHint(taskNumber, hintText, grade, taskId) {
  if (!taskNumber) return json({ success: false, error: 'taskNumber обязателен' });

  const found = findTaskLocation(taskNumber, grade, taskId);
  if (found.error) return json({ success: false, error: found.error });

  const hintCol = findColumnByKey(found.headers, 'hint');
  if (hintCol === -1) return json({ success: false, error: 'Колонка Hint не найдена' });

  found.sheet.getRange(found.rowIndex + 1, hintCol + 1).setValue(hintText || '');
  return json({ success: true });
}

// === Утилиты ==============================================================
function headerToKey(h) {
  const normalized = String(h || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_.\-]+/g, '');
  const aliases = {
    taskid: 'taskId',
    id: 'taskId',
    number: 'number',
    num: 'number',
    numbertext: 'numberText',
    description: 'description',
    condition: 'description',
    status: 'status',
    hint: 'hint',
    grade: 'grade',
    class: 'grade',
    номер: 'number',
    текстномера: 'numberText',
    условие: 'description',
    статус: 'status',
    подсказка: 'hint',
    класс: 'grade'
  };
  return aliases[normalized] || '';
}

function getSheetValues(sheet) {
  const range = sheet.getDataRange();
  return typeof range.getDisplayValues === 'function'
    ? range.getDisplayValues()
    : range.getValues();
}

function findColumnByKey(headers, key) {
  for (let i = 0; i < headers.length; i++) {
    if (headerToKey(headers[i]) === key) return i;
  }
  return -1;
}

function getTaskSheets() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const allSheets = spreadsheet.getSheets();
  const configured = String(
    PropertiesService.getScriptProperties().getProperty('MATCENTER_SHEET_NAMES') || ''
  ).trim();

  if (configured) {
    const requestedNames = configured.split(',').map(function (name) { return name.trim(); }).filter(Boolean);
    const selected = requestedNames.map(function (name) { return spreadsheet.getSheetByName(name); });
    const missing = requestedNames.filter(function (_name, index) { return !selected[index]; });
    if (missing.length) throw new Error('Не найдены листы MATCENTER_SHEET_NAMES: ' + missing.join(', '));
    return selected;
  }

  const detected = allSheets.filter(function (sheet) {
    if (sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) return false;
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    return findColumnByKey(headers, 'number') !== -1 || findColumnByKey(headers, 'numberText') !== -1;
  });

  if (!detected.length) {
    throw new Error('Не найден ни один лист с колонкой Number или NumberText');
  }
  return detected;
}

function normalizeGrade(value, fallback) {
  const raw = String(value || '').trim().toLowerCase();
  const compact = raw.replace(/[—–]/g, '-').replace(/ё/g, 'е').replace(/\s+/g, '');
  const aliases = {
    '9': 'grade-9',
    '9класс': 'grade-9',
    'grade9': 'grade-9',
    'grade-9': 'grade-9',
    '10': 'grade-10',
    '10класс': 'grade-10',
    'grade10': 'grade-10',
    'grade-10': 'grade-10',
    '11': 'grade-11',
    '11класс': 'grade-11',
    'grade11': 'grade-11',
    'grade-11': 'grade-11',
    'лето9-10': 'grade-summer-9-10',
    'summer9-10': 'grade-summer-9-10',
    'grade-summer-9-10': 'grade-summer-9-10',
    'лето10-11': 'grade-summer-10-11',
    'summer10-11': 'grade-summer-10-11',
    'grade-summer-10-11': 'grade-summer-10-11'
  };
  return aliases[compact] || fallback || 'grade-9';
}

function inferGradeFromSheetName(name) {
  const raw = String(name || '').trim().toLowerCase().replace(/[—–]/g, '-');
  if (/(лето|summer).*10\D*11/.test(raw)) return 'grade-summer-10-11';
  if (/(лето|summer).*9\D*10/.test(raw)) return 'grade-summer-9-10';
  if (/(^|\D)11(\D|$)/.test(raw)) return 'grade-11';
  if (/(^|\D)10(\D|$)/.test(raw)) return 'grade-10';
  if (/(^|\D)9(\D|$)/.test(raw)) return 'grade-9';
  return '';
}

function findColumn(headers, candidates) {
  for (let i = 0; i < candidates.length; i++) {
    const idx = headers.indexOf(candidates[i]);
    if (idx !== -1) return idx;
  }
  return -1;
}

function findTaskLocation(taskNumber, grade, taskId) {
  const locations = [];
  let ambiguousError = '';

  getTaskSheets().forEach(function (sheet) {
    const values = getSheetValues(sheet);
    if (values.length < 2) return;
    const headers = values[0].map(function (h) { return String(h || '').trim(); });
    if (taskId && findColumnByKey(headers, 'taskId') === -1) return;
    const inferredGrade = inferGradeFromSheetName(sheet.getName());
    if (
      grade &&
      findColumnByKey(headers, 'grade') === -1 &&
      inferredGrade &&
      normalizeGrade(inferredGrade, '') !== normalizeGrade(grade, '')
    ) return;
    const found = findTaskRow(values, headers, taskNumber, grade, taskId);
    if (found.rowIndex !== undefined) {
      locations.push({ sheet: sheet, values: values, headers: headers, rowIndex: found.rowIndex });
    } else if (/Найдено несколько/.test(found.error || '')) {
      ambiguousError = found.error;
    }
  });

  if (ambiguousError) return { error: ambiguousError };
  if (locations.length === 1) return locations[0];
  if (locations.length === 0) {
    return { error: 'Задача №' + taskNumber + (grade ? ' (' + grade + ')' : '') + ' не найдена' };
  }
  return { error: 'Задача №' + taskNumber + ' найдена на нескольких листах. Добавьте уникальную колонку TaskId.' };
}

function findTaskRow(values, headers, taskNumber, grade, taskId) {
  const numCol = findColumnByKey(headers, 'number');
  const numberTextCol = findColumnByKey(headers, 'numberText');
  const gradeCol = findColumnByKey(headers, 'grade');
  const taskIdCol = findColumnByKey(headers, 'taskId');

  if (taskId && taskIdCol !== -1) {
    const idTarget = String(taskId).trim();
    const idMatches = [];
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][taskIdCol]).trim() === idTarget) idMatches.push(i);
    }
    if (idMatches.length === 1) return { rowIndex: idMatches[0] };
    if (idMatches.length > 1) {
      return { error: 'TaskId должен быть уникальным: найдено строк ' + idMatches.length };
    }
    return { error: 'Задача с TaskId ' + idTarget + ' не найдена' };
  }

  if (numCol === -1 && numberTextCol === -1) return { error: 'Колонка Number или NumberText не найдена' };

  const numberTarget = String(taskNumber || '').trim();
  const gradeTarget = String(grade || '').trim();
  const matches = [];
  for (let i = 1; i < values.length; i++) {
    const rowNumber = numCol !== -1 && String(values[i][numCol] || '').trim()
      ? String(values[i][numCol]).trim()
      : String(values[i][numberTextCol] || '').trim();
    if (rowNumber !== numberTarget) continue;
    if (gradeTarget && gradeCol !== -1 && normalizeGrade(values[i][gradeCol], '') !== normalizeGrade(gradeTarget, '')) continue;
    matches.push(i);
  }

  if (matches.length === 1) return { rowIndex: matches[0] };
  if (matches.length === 0) {
    return { error: 'Задача №' + taskNumber + (gradeTarget ? ' (' + gradeTarget + ')' : '') + ' не найдена' };
  }
  return {
    error: 'Найдено несколько задач №' + taskNumber + '. Добавьте уникальную колонку TaskId или передайте Grade.'
  };
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

   4) Project Settings → Script properties. Добавьте:
        FIREBASE_WEB_API_KEY          API key из firebase-config.js
        MATCENTER_USER_PASSWORD       пароль доступа учеников
        MATCENTER_ADMIN_PASSWORD      отдельный пароль администратора
      Необязательно:
        MATCENTER_SHEET_NAMES         имена листов с задачами через запятую
      Без MATCENTER_SHEET_NAMES backend сам найдёт все листы, где в первой
      строке есть Number или NumberText.
      Пароли больше не хранятся в репозитории и не попадают в URL.

   5) Сохраните проект (Ctrl/Cmd+S). При первом сохранении даст имя — например
      «matcenter-backend».

   6) В верхнем списке функций выберите authorizeExternalRequests и нажмите Run.
      Подтвердите запрошенные Google разрешения. Этот шаг нужно выполнить один
      раз в КАЖДОМ из двух Apps Script проектов до публикации Web app.

   7) Deploy → New deployment.
        - Тип: Web app
        - Description: matcenter v2 account access
        - Execute as: Me (ваш гугл-аккаунт)
        - Who has access: Anyone   ← важно, иначе фронт не сможет дёргать
      Нажмите Deploy. Google попросит подтвердить разрешения — соглашайтесь.

   8) После деплоя появится Web app URL вида:
        https://script.google.com/macros/s/AKfycb.../exec
      Скопируйте его.

   9) В matcenter/00-core.js замените значение API_ENDPOINT на этот URL.

   10) Повторите обновление для ОБОИХ endpoint из matcenter/00-core.js. На время
      поочерёдного обновления можно поставить MATCENTER_ALLOW_LEGACY=true, но
      после обновления обоих deployment обязательно удалите это свойство.

   11) Войдите в обычный аккаунт сайта и один раз введите пароль Матцентра.
       UID получит постоянную роль user/admin в Script properties каждого endpoint.

   Дальше при изменении кода Apps Script нужно делать НОВЫЙ deploy (или Manage
   deployments → редактировать существующий и нажать Deploy). URL может остаться
   тем же — это от настройки зависит.

   Если хотите добавить ещё классы (9, 10, 11 и т.д.), можно продолжать
   добавлять строки на один лист с колонкой Grade или создать отдельные листы.
   В названии отдельного листа укажите класс (например, «9 класс») либо заполните
   Grade. Apps Script объединит все найденные листы, а фронтенд разложит задачи
   по разделам.
   ========================================================================== */
