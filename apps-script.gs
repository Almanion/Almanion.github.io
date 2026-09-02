/**
 * matcenter — Google Apps Script backend.
 *
 * Что делает:
 *  - Возвращает все задачи из активного листа в JSON-формате, который ждут модули matcenter/.
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
      return json({ success: true, authVersion: AUTH_VERSION, accountConfirmation: true });
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
function changeStatus(taskNumber, newStatus, grade, taskId) {
  if (!taskNumber) return json({ success: false, error: 'taskNumber обязателен' });

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (h) { return String(h || '').trim(); });

  const statusCol = findColumn(headers, ['Status', 'status']);
  if (statusCol === -1) return json({ success: false, error: 'Колонка Status не найдена' });

  const found = findTaskRow(values, headers, taskNumber, grade, taskId);
  if (found.error) return json({ success: false, error: found.error });

  sheet.getRange(found.rowIndex + 1, statusCol + 1).setValue(newStatus || '');
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

function verifyFirebaseToken(idToken) {
  if (!idToken) throw new Error('Сначала войдите в аккаунт Almanion');
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

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (h) { return String(h || '').trim(); });

  const hintCol = findColumn(headers, ['Hint', 'hint']);
  if (hintCol === -1) return json({ success: false, error: 'Колонка Hint не найдена' });

  const found = findTaskRow(values, headers, taskNumber, grade, taskId);
  if (found.error) return json({ success: false, error: found.error });

  sheet.getRange(found.rowIndex + 1, hintCol + 1).setValue(hintText || '');
  return json({ success: true });
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

function findTaskRow(values, headers, taskNumber, grade, taskId) {
  const numCol = findColumn(headers, ['Number', 'number']);
  const gradeCol = findColumn(headers, ['Grade', 'grade']);
  const taskIdCol = findColumn(headers, ['TaskId', 'taskId', 'ID', 'Id', 'id']);

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
  }

  if (numCol === -1) return { error: 'Колонка Number не найдена' };

  const numberTarget = String(taskNumber || '').trim();
  const gradeTarget = String(grade || '').trim();
  const matches = [];
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][numCol]).trim() !== numberTarget) continue;
    if (gradeTarget && gradeCol !== -1 && String(values[i][gradeCol]).trim() !== gradeTarget) continue;
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
      Пароли больше не хранятся в репозитории и не попадают в URL.

   5) Сохраните проект (Ctrl/Cmd+S). При первом сохранении даст имя — например
      «matcenter-backend».

   6) Deploy → New deployment.
        - Тип: Web app
        - Description: matcenter v2 account access
        - Execute as: Me (ваш гугл-аккаунт)
        - Who has access: Anyone   ← важно, иначе фронт не сможет дёргать
      Нажмите Deploy. Google попросит подтвердить разрешения — соглашайтесь.

   7) После деплоя появится Web app URL вида:
        https://script.google.com/macros/s/AKfycb.../exec
      Скопируйте его.

   8) В matcenter/00-core.js замените значение API_ENDPOINT на этот URL.

   9) Повторите обновление для ОБОИХ endpoint из matcenter/00-core.js. На время
      поочерёдного обновления можно поставить MATCENTER_ALLOW_LEGACY=true, но
      после обновления обоих deployment обязательно удалите это свойство.

   10) Войдите в обычный аккаунт Almanion и один раз введите пароль Матцентра.
       UID получит постоянную роль user/admin в Script properties каждого endpoint.

   Дальше при изменении кода Apps Script нужно делать НОВЫЙ deploy (или Manage
   deployments → редактировать существующий и нажать Deploy). URL может остаться
   тем же — это от настройки зависит.

   Если хотите добавить ещё классы (9, 10, 11 и т.д.) в эту же таблицу —
   просто продолжайте добавлять строки на тот же лист, меняя значение в колонке
   Grade. Apps Script отдаёт всё содержимое листа сразу, фильтрация по классу
   уже происходит на фронте.
   ========================================================================== */
