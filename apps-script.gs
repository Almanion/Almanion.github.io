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

const AUTH_VERSION = 3;
const ACCESS_PREFIX = 'MATCENTER_ACCESS_';
const FAILED_PREFIX = 'MATCENTER_FAILED_';
const SITE_OWNER_UID = '2M2ZdLQcJAhluPjUVFNJ6MyQrdH2';
const DEFAULT_FIREBASE_DATABASE_URL = 'https://almanion-70120-default-rtdb.europe-west1.firebasedatabase.app';

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
      const scriptProperties = PropertiesService.getScriptProperties();
      return json({
        success: true,
        authVersion: AUTH_VERSION,
        accountConfirmation: true,
        legacyAuth: false,
        multiSheetTasks: true,
        notePublisher: true,
        noteDeletion: true,
        deeplTranslate: true,
        deeplReady: !!scriptProperties.getProperty('DEEPL_API_KEY')
      });
    }

    // Публикация конспектов не зависит от доступа в Матцентр. Firebase-токен
    // проверяется отдельно, а изменять GitHub может только владелец сайта.
    if (action === 'publisherCapabilities') {
      const publisherIdentity = requireSiteOwner(params.idToken || '');
      return json({
        success: true,
        owner: publisherIdentity.email,
        ready: !!PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN'),
        noteDeletion: true
      });
    }

    if (action === 'publishNotes') {
      const publisherIdentity = requireSiteOwner(params.idToken || '');
      return publishNoteFiles(publisherIdentity, params);
    }

    if (action === 'deleteNotes') {
      const publisherIdentity = requireSiteOwner(params.idToken || '');
      return deleteNoteFiles(publisherIdentity, params);
    }

    // Перевод английских конспектов не зависит от доступа к Матцентру.
    // Проверяем отдельную роль englishAccess и держим ключ DeepL только на сервере.
    if (action === 'translateEnglish') {
      return translateEnglish(params);
    }

    if (action === 'authorizeAccount') {
      return authorizeAccount(params.idToken || '', params.password || '');
    }

    if (action === 'accessStatus') {
      const identity = verifyFirebaseToken(params.idToken || '');
      const role = getAccountRole(identity, params.idToken || '');
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

    const sheetTasks = [];
    const legacyHints = {};

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

      const description = String(task.description || '').trim();
      const status = String(task.status || '').trim();

      // В таблице 2025/2026 ниже основного массива находится небольшой
      // справочник «номер → подсказка». Его строки используют первые две
      // колонки и раньше ошибочно становились пустыми задачами. Сохраняем
      // содержательные строки как подсказки, а все строки без условия не
      // включаем в выдачу.
      if (!description) {
        if (isLegacyHintValue(status)) legacyHints[String(taskNumber).trim()] = status;
        continue;
      }

      task.number = taskNumber;
      if (!task.numberText) task.numberText = taskNumber;
      task.grade = normalizeGrade(task.grade, inferredGrade);
      task.sourceSheet = sheet.getName();
      sheetTasks.push(task);
    }

    sheetTasks.forEach(function (task) {
      const legacyHint = legacyHints[String(task.number || task.numberText || '').trim()];
      if (!task.hint && legacyHint) task.hint = legacyHint;
      tasks.push(task);
    });
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
  role = getAccountRole(identity, idToken) || role;
  return json({
    success: true,
    authVersion: AUTH_VERSION,
    allowed: true,
    isAdmin: role === 'admin'
  });
}

function resolveAccess(params) {
  if (!params.idToken) return { allowed: false, role: '' };
  const identity = verifyFirebaseToken(params.idToken);
  const role = getAccountRole(identity, params.idToken);
  return { allowed: !!role, role: role, uid: identity.uid };
}

function getAccountRole(identityOrUid, idToken) {
  const identity = typeof identityOrUid === 'object'
    ? identityOrUid
    : { uid: String(identityOrUid || ''), email: '' };
  // Владелец проекта всегда имеет обе административные роли. Это правило
  // дублируется в Firebase Rules, поэтому одной клиентской проверки недостаточно.
  if (identity.uid === SITE_OWNER_UID) return 'admin';
  if (idToken && hasFirebaseMatcenterAdminRole(identity.uid, idToken)) return 'admin';

  return PropertiesService.getScriptProperties().getProperty(ACCESS_PREFIX + identity.uid) || '';
}

function hasFirebaseMatcenterAdminRole(uid, idToken) {
  if (!uid || !idToken) return false;
  const properties = PropertiesService.getScriptProperties();
  const databaseUrl = String(
    properties.getProperty('FIREBASE_DATABASE_URL') || DEFAULT_FIREBASE_DATABASE_URL
  ).replace(/\/$/, '');

  try {
    const response = UrlFetchApp.fetch(
      databaseUrl + '/adminRoles/' + encodeURIComponent(uid) + '/matcenterAdmin.json?auth=' + encodeURIComponent(idToken),
      { method: 'get', muteHttpExceptions: true }
    );
    return response.getResponseCode() === 200 && JSON.parse(response.getContentText() || 'false') === true;
  } catch (_) {
    // Сбой проверки роли не должен лишать пользователя обычного доступа.
    return false;
  }
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
  return {
    uid: user.localId,
    email: user.email || '',
    emailVerified: user.emailVerified === true
  };
}

function requireSiteOwner(idToken) {
  const identity = verifyFirebaseToken(idToken);
  if (identity.uid !== SITE_OWNER_UID) {
    throw new Error('Публиковать конспекты может только владелец сайта');
  }
  return identity;
}

function requireEnglishAccess(idToken) {
  const identity = verifyFirebaseToken(idToken);
  if (identity.uid === SITE_OWNER_UID) return identity;

  const uid = String(identity.uid || '');
  const properties = PropertiesService.getScriptProperties();
  const databaseUrl = String(
    properties.getProperty('FIREBASE_DATABASE_URL') || DEFAULT_FIREBASE_DATABASE_URL
  ).replace(/\/$/, '');
  const response = UrlFetchApp.fetch(
    databaseUrl + '/adminRoles/' + encodeURIComponent(uid) + '/englishAccess.json?auth=' + encodeURIComponent(idToken),
    { method: 'get', muteHttpExceptions: true }
  );
  const allowed = response.getResponseCode() === 200
    && JSON.parse(response.getContentText() || 'false') === true;
  if (!allowed) throw new Error('English section access has not been granted for this account');
  return identity;
}

function translateEnglish(params) {
  const idToken = String(params.idToken || '');
  const identity = requireEnglishAccess(idToken);
  const text = String(params.text || '').trim();
  if (!text) throw new Error('Enter English text to translate');
  if (text.length > 5000) throw new Error('The text is too long. The limit is 5,000 characters');

  const properties = PropertiesService.getScriptProperties();
  const authKey = String(properties.getProperty('DEEPL_API_KEY') || '').trim();
  if (!authKey) throw new Error('DeepL has not been configured on the server yet');

  // Простое серверное ограничение защищает личную квоту от случайного цикла
  // запросов на клиенте. Счётчик живёт десять минут и не хранит текст.
  const cache = CacheService.getScriptCache();
  const rateKey = 'DEEPL_REQUESTS_' + identity.uid;
  const requestCount = Number(cache.get(rateKey) || 0);
  if (requestCount >= 45) throw new Error('Too many translation requests. Try again in a few minutes');
  cache.put(rateKey, String(requestCount + 1), 600);

  const configuredBase = String(properties.getProperty('DEEPL_API_URL') || '').trim().replace(/\/$/, '');
  const apiBase = configuredBase || (/\:fx$/i.test(authKey)
    ? 'https://api-free.deepl.com'
    : 'https://api.deepl.com');
  if (!/^https:\/\/api(?:-free)?\.deepl\.com$/i.test(apiBase)) {
    throw new Error('DEEPL_API_URL must point to the official DeepL API');
  }

  const response = fetchDeepLWithRetry(apiBase + '/v2/translate', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'DeepL-Auth-Key ' + authKey },
    payload: JSON.stringify({
      text: [text],
      source_lang: 'EN',
      target_lang: 'RU',
      preserve_formatting: true
    }),
    muteHttpExceptions: true
  });
  const responseCode = response.getResponseCode();
  let payload = {};
  try { payload = JSON.parse(response.getContentText() || '{}'); } catch (_) {}
  const translated = payload.translations && payload.translations[0] && payload.translations[0].text;
  if (responseCode < 200 || responseCode >= 300 || !translated) {
    if (responseCode === 403) throw new Error('DeepL rejected the API key or plan');
    if (responseCode === 456) throw new Error('The DeepL character quota has been reached');
    if (responseCode === 429) throw new Error('DeepL is temporarily limiting requests. Wait a minute and try again');
    throw new Error('DeepL translation failed (HTTP ' + responseCode + ')');
  }

  return json({
    success: true,
    translation: String(translated),
    detectedSourceLanguage: String(payload.translations[0].detected_source_language || 'EN')
  });
}

function fetchDeepLWithRetry(url, options) {
  const retryDelays = [500, 1500, 3500];
  let response = null;

  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    // DeepL рекомендует повторять 429 и временные 5xx с экспоненциальной
    // задержкой. Ошибки ключа и квоты, напротив, повторять бессмысленно.
    if (code !== 429 && (code < 500 || code >= 600)) return response;
    if (attempt === retryDelays.length) return response;

    let delay = retryDelays[attempt];
    try {
      const headers = response.getAllHeaders ? response.getAllHeaders() : {};
      const retryAfter = Number(headers['Retry-After'] || headers['retry-after'] || 0);
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        delay = Math.min(8000, Math.max(delay, retryAfter * 1000));
      }
    } catch (_) {}
    Utilities.sleep(delay);
  }
  return response;
}

// === Публикация конспектов в GitHub =======================================
function noteManifestEntryId(entry) {
  return typeof entry === 'string' ? entry : entry && entry.id;
}

function validateNoteManifest(manifest, subject) {
  if (!manifest || manifest.subject !== subject || !Array.isArray(manifest.sections)) {
    throw new Error('Manifest does not match the selected subject');
  }
  const ids = manifest.sections.map(noteManifestEntryId);
  if (ids.some(function (id) { return !/^[a-z0-9][a-z0-9-]{1,63}$/.test(String(id || '')); })) {
    throw new Error('Manifest contains an invalid section id');
  }
  if (new Set(ids).size !== ids.length) throw new Error('Manifest contains duplicate section ids');
  return manifest;
}

function mergeNoteManifest(currentManifest, requestedManifest, subject, sectionId, section) {
  validateNoteManifest(currentManifest, subject);
  validateNoteManifest(requestedManifest, subject);
  if (!section || section.id !== sectionId || section.subject !== subject) throw new Error('Section file does not match publication request');

  const requestedIds = requestedManifest.sections.map(noteManifestEntryId);
  const requestedEntry = requestedManifest.sections.find(function (entry) { return noteManifestEntryId(entry) === sectionId; });
  if (!requestedEntry) throw new Error('Published section is missing from manifest');

  const nextEntry = {
    id: sectionId,
    title: String(section.title || ''),
    navTitle: String(section.navTitle || section.title || ''),
    updatedAt: Number(section.updatedAt) || Date.now()
  };
  const entries = currentManifest.sections.filter(function (entry) { return noteManifestEntryId(entry) !== sectionId; });
  const targetIndex = requestedIds.indexOf(sectionId);
  let insertAt = entries.length;
  let anchored = false;
  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    const previousIndex = entries.findIndex(function (entry) { return noteManifestEntryId(entry) === requestedIds[index]; });
    if (previousIndex !== -1) {
      insertAt = previousIndex + 1;
      anchored = true;
      break;
    }
  }
  if (!anchored) {
    for (let index = targetIndex + 1; index < requestedIds.length; index += 1) {
      const nextIndex = entries.findIndex(function (entry) { return noteManifestEntryId(entry) === requestedIds[index]; });
      if (nextIndex !== -1) {
        insertAt = nextIndex;
        break;
      }
    }
  }
  entries.splice(insertAt, 0, nextEntry);
  return Object.assign({}, currentManifest, { sections: entries });
}

function removeNoteManifestSection(currentManifest, subject, sectionId) {
  validateNoteManifest(currentManifest, subject);
  return Object.assign({}, currentManifest, {
    sections: currentManifest.sections.filter(function (entry) { return noteManifestEntryId(entry) !== sectionId; })
  });
}

function readGithubJsonFile(repository, path, ref, token) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const payload = githubRequest('get', repository, '/contents/' + encodedPath + '?ref=' + encodeURIComponent(ref), token);
  if (!payload || payload.encoding !== 'base64' || !payload.content) throw new Error('GitHub did not return ' + path);
  const text = Utilities.newBlob(Utilities.base64Decode(String(payload.content).replace(/\s/g, ''))).getDataAsString('UTF-8');
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new Error(path + ' contains invalid JSON');
  }
}

function publishNoteFiles(identity, params) {
  const files = Array.isArray(params.files) ? params.files : [];
  if (!files.length || files.length > 24) throw new Error('Некорректный набор файлов публикации');

  const subject = String(params.subject || '');
  const sectionId = String(params.sectionId || '');
  if (!/^(physics|math|geometry|chemistry|likbez|physics-10|chemistry-10|literature-10)$/.test(subject)) throw new Error('Неизвестный предмет');
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(sectionId)) throw new Error('Некорректный адрес раздела');

  let totalLength = 0;
  const normalizedFiles = files.map(function (file) {
    const path = String(file && file.path || '').replace(/\\/g, '/');
    const content = String(file && file.content || '');
    const encoding = file && file.encoding === 'base64' ? 'base64' : 'utf-8';
    if (!isAllowedNotePath(path, subject, sectionId)) throw new Error('Публикация пути запрещена: ' + path);
    if (encoding === 'base64' && !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) throw new Error('Некорректное изображение');
    totalLength += content.length;
    return { path: path, content: content, encoding: encoding };
  });
  const manifestPath = 'content/' + subject + '/manifest.json';
  const sectionPath = 'content/' + subject + '/sections/' + sectionId + '.json';
  const manifestFiles = normalizedFiles.filter(function (file) { return file.path === manifestPath && file.encoding === 'utf-8'; });
  const sectionFiles = normalizedFiles.filter(function (file) { return file.path === sectionPath && file.encoding === 'utf-8'; });
  if (manifestFiles.length !== 1 || sectionFiles.length !== 1) throw new Error('Publication requires exactly one manifest and one section file');
  let requestedManifest;
  let requestedSection;
  try {
    requestedManifest = JSON.parse(manifestFiles[0].content);
    requestedSection = JSON.parse(sectionFiles[0].content);
  } catch (_) {
    throw new Error('Manifest or section file contains invalid JSON');
  }
  validateNoteManifest(requestedManifest, subject);
  if (!requestedSection || requestedSection.id !== sectionId || requestedSection.subject !== subject) {
    throw new Error('Section file does not match publication request');
  }
  if (totalLength > 9 * 1024 * 1024) throw new Error('Пакет публикации слишком велик');

  const properties = PropertiesService.getScriptProperties();
  const token = properties.getProperty('GITHUB_TOKEN') || '';
  if (!token) throw new Error('На сервере не задан GITHUB_TOKEN');
  const repository = properties.getProperty('GITHUB_REPOSITORY') || 'Almanion/Almanion.github.io';
  const branch = properties.getProperty('GITHUB_BRANCH') || 'main';
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Некорректный GITHUB_REPOSITORY');
  if (!/^[A-Za-z0-9._\/-]+$/.test(branch)) throw new Error('Некорректный GITHUB_BRANCH');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ref = githubRequest('get', repository, '/git/ref/heads/' + branch, token);
    const parentSha = ref.object && ref.object.sha;
    if (!parentSha) throw new Error('GitHub не вернул текущий commit');
    const parentCommit = githubRequest('get', repository, '/git/commits/' + parentSha, token);
    const baseTreeSha = parentCommit.tree && parentCommit.tree.sha;
    if (!baseTreeSha) throw new Error('GitHub не вернул дерево файлов');

    const currentManifest = readGithubJsonFile(repository, manifestPath, parentSha, token);
    manifestFiles[0].content = JSON.stringify(
      mergeNoteManifest(currentManifest, requestedManifest, subject, sectionId, requestedSection),
      null,
      2
    ) + '\n';

    const treeItems = normalizedFiles.map(function (file) {
      const blob = githubRequest('post', repository, '/git/blobs', token, {
        content: file.content,
        encoding: file.encoding
      });
      return { path: file.path, mode: '100644', type: 'blob', sha: blob.sha };
    });
    const tree = githubRequest('post', repository, '/git/trees', token, {
      base_tree: baseTreeSha,
      tree: treeItems
    });
    const commit = githubRequest('post', repository, '/git/commits', token, {
      message: 'Publish ' + subject + ' notes: ' + sectionId,
      tree: tree.sha,
      parents: [parentSha],
      author: { name: 'Конструктор конспектов', email: identity.email }
    });
    githubRequest('patch', repository, '/git/refs/heads/' + branch, token, {
      sha: commit.sha,
      force: false
    });
    return json({ success: true, commitSha: commit.sha, files: normalizedFiles.length });
  } finally {
    lock.releaseLock();
  }
}

function deleteNoteFiles(identity, params) {
  const subject = String(params.subject || '');
  const sectionId = String(params.sectionId || '');
  if (!/^(physics|math|geometry|chemistry|likbez|physics-10|chemistry-10|literature-10)$/.test(subject)) throw new Error('Неизвестный предмет');
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(sectionId)) throw new Error('Некорректный адрес раздела');

  const files = Array.isArray(params.files) ? params.files : [];
  if (files.length !== 1) throw new Error('Для удаления требуется обновлённый манифест');
  const manifestPath = 'content/' + subject + '/manifest.json';
  const manifestFile = files[0] || {};
  if (String(manifestFile.path || '').replace(/\\/g, '/') !== manifestPath) throw new Error('Некорректный файл манифеста');
  const manifestContent = String(manifestFile.content || '');
  if (!manifestContent || manifestContent.length > 1024 * 1024) throw new Error('Некорректный манифест');
  let manifest;
  try {
    manifest = JSON.parse(manifestContent);
  } catch (error) {
    throw new Error('Манифест содержит некорректный JSON');
  }
  if (!manifest || manifest.subject !== subject || !Array.isArray(manifest.sections)) {
    throw new Error('Манифест не соответствует выбранному предмету');
  }
  const manifestSectionIds = manifest.sections.map(function (entry) {
    return typeof entry === 'string' ? entry : entry && entry.id;
  });
  if (manifestSectionIds.includes(sectionId)) throw new Error('Удаляемый раздел остался в манифесте');
  if (manifestSectionIds.some(function (id) { return !/^[a-z0-9][a-z0-9-]{1,63}$/.test(String(id || '')); })) {
    throw new Error('Манифест содержит некорректный адрес раздела');
  }
  if (new Set(manifestSectionIds).size !== manifestSectionIds.length) throw new Error('Манифест содержит повторяющиеся разделы');

  const requestedDeletes = Array.isArray(params.deletePaths) ? params.deletePaths : [];
  const deletePaths = Array.from(new Set(requestedDeletes.map(function (path) {
    return String(path || '').replace(/\\/g, '/');
  }).filter(Boolean)));
  const sectionPath = 'content/' + subject + '/sections/' + sectionId + '.json';
  if (!deletePaths.includes(sectionPath)) throw new Error('Не указан файл удаляемого раздела');
  if (!deletePaths.length || deletePaths.length > 64) throw new Error('Некорректный набор удаляемых файлов');
  deletePaths.forEach(function (path) {
    if (!isAllowedNoteDeletePath(path, subject, sectionId)) throw new Error('Удаление пути запрещено: ' + path);
  });

  const properties = PropertiesService.getScriptProperties();
  const token = properties.getProperty('GITHUB_TOKEN') || '';
  if (!token) throw new Error('На сервере не задан GITHUB_TOKEN');
  const repository = properties.getProperty('GITHUB_REPOSITORY') || 'Almanion/Almanion.github.io';
  const branch = properties.getProperty('GITHUB_BRANCH') || 'main';
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Некорректный GITHUB_REPOSITORY');
  if (!/^[A-Za-z0-9._\/-]+$/.test(branch)) throw new Error('Некорректный GITHUB_BRANCH');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ref = githubRequest('get', repository, '/git/ref/heads/' + branch, token);
    const parentSha = ref.object && ref.object.sha;
    if (!parentSha) throw new Error('GitHub не вернул текущий commit');
    const parentCommit = githubRequest('get', repository, '/git/commits/' + parentSha, token);
    const baseTreeSha = parentCommit.tree && parentCommit.tree.sha;
    if (!baseTreeSha) throw new Error('GitHub не вернул дерево файлов');

    const currentManifest = readGithubJsonFile(repository, manifestPath, parentSha, token);
    const finalManifestContent = JSON.stringify(removeNoteManifestSection(currentManifest, subject, sectionId), null, 2) + '\n';
    const manifestBlob = githubRequest('post', repository, '/git/blobs', token, {
      content: finalManifestContent,
      encoding: 'utf-8'
    });
    const treeItems = [{ path: manifestPath, mode: '100644', type: 'blob', sha: manifestBlob.sha }]
      .concat(deletePaths.map(function (path) {
        return { path: path, mode: '100644', type: 'blob', sha: null };
      }));
    const tree = githubRequest('post', repository, '/git/trees', token, {
      base_tree: baseTreeSha,
      tree: treeItems
    });
    const commit = githubRequest('post', repository, '/git/commits', token, {
      message: 'Delete ' + subject + ' notes: ' + sectionId,
      tree: tree.sha,
      parents: [parentSha],
      author: { name: 'Конструктор конспектов', email: identity.email }
    });
    githubRequest('patch', repository, '/git/refs/heads/' + branch, token, {
      sha: commit.sha,
      force: false
    });
    return json({ success: true, commitSha: commit.sha, deleted: deletePaths.length });
  } finally {
    lock.releaseLock();
  }
}

function isAllowedNotePath(path, subject, sectionId) {
  if (path === 'content/' + subject + '/manifest.json') return true;
  if (path === 'content/' + subject + '/sections/' + sectionId + '.json') return true;
  return new RegExp('^images/notes/' + subject + '/[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$').test(path);
}

function isAllowedNoteDeletePath(path, subject, sectionId) {
  if (path === 'content/' + subject + '/sections/' + sectionId + '.json') return true;
  return new RegExp('^images/notes/' + subject + '/[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$').test(path);
}

function githubRequest(method, repository, resource, token, body) {
  const options = {
    method: method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    muteHttpExceptions: true
  };
  if (body !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }
  const response = UrlFetchApp.fetch('https://api.github.com/repos/' + repository + resource, options);
  const code = response.getResponseCode();
  const text = response.getContentText() || '{}';
  let payload;
  try { payload = JSON.parse(text); } catch (_) { payload = {}; }
  if (code < 200 || code >= 300) {
    const message = payload && payload.message ? payload.message : 'HTTP ' + code;
    throw new Error('GitHub: ' + message);
  }
  return payload;
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
    текстзадачи: 'description',
    условие: 'description',
    статус: 'status',
    подсказка: 'hint',
    класс: 'grade'
  };
  return aliases[normalized] || '';
}

function isLegacyHintValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  return !/^(?:Р|Н|П|От|\?)$/i.test(normalized);
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
         FIREBASE_DATABASE_URL         databaseURL из firebase-config.js
         MATCENTER_USER_PASSWORD       пароль доступа учеников
         MATCENTER_ADMIN_PASSWORD      отдельный пароль администратора
         GITHUB_TOKEN                  fine-grained token с Contents: Read and write
         DEEPL_API_KEY                 ключ DeepL API для встроенного перевода
      Необязательно:
        MATCENTER_SHEET_NAMES         имена листов с задачами через запятую
        GITHUB_REPOSITORY             по умолчанию Almanion/Almanion.github.io
        GITHUB_BRANCH                 по умолчанию main
        DEEPL_API_URL                 https://api-free.deepl.com для старого API Free;
                                      https://api.deepl.com для остальных планов
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

   10) Повторите обновление для ОБОИХ endpoint из matcenter/00-core.js. Оба
       deployment должны работать на v3: старый вход с паролем в URL удалён.

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
