// ============================================
// ЛИЧНЫЕ ОТМЕТКИ «РЕШЕНО» (Firebase Auth + Realtime Database)
// ============================================

const MATCENTER_SOLVED_CACHE_PREFIX = 'matcenter_solved_cache_v1_';
const MATCENTER_SOLVED_CACHE_VERSION = 1;
let personalSolvedSyncInFlight = false;
let personalSolvedOnlineHandlerReady = false;

function initPersonalSolvedTasks() {
    if (personalSolvedInitialized) return;
    personalSolvedInitialized = true;

    document.body.classList.add('matcenter-solved-ready');

    if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined') {
        document.body.classList.add('matcenter-solved-auth-unavailable');
        return;
    }

    try {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        if (typeof firebase.auth !== 'function' || typeof firebase.database !== 'function') {
            document.body.classList.add('matcenter-solved-auth-unavailable');
            return;
        }
        personalSolvedAuth = firebase.auth();
        personalSolvedDb = firebase.database();
    } catch (err) {
        document.body.classList.add('matcenter-solved-auth-unavailable');
        console.warn('⚠️ Не удалось включить личные отметки задач:', err);
        return;
    }

    personalSolvedAuth.onAuthStateChanged(handlePersonalSolvedUser);

    if (!personalSolvedOnlineHandlerReady) {
        personalSolvedOnlineHandlerReady = true;
        window.addEventListener('online', () => {
            syncPendingPersonalSolvedEntries();
        });
    }
}

function handlePersonalSolvedUser(user) {
    const previousUid = personalSolvedUser && personalSolvedUser.uid;
    const nextUid = user && user.uid;

    // Firebase может повторно сообщить о том же пользователе. Не очищаем уже
    // загруженный прогресс и не создаём второй одинаковый listener.
    if (previousUid && previousUid === nextUid && personalSolvedRef) {
        applyPersonalSolvedMarks();
        return;
    }

    if (personalSolvedRef) {
        try { personalSolvedRef.off(); } catch (_) {}
        personalSolvedRef = null;
    }

    personalSolvedUser = user || null;
    document.body.classList.toggle('matcenter-account-signed-in', !!personalSolvedUser);
    document.body.classList.toggle('matcenter-account-anonymous', !personalSolvedUser);

    if (!personalSolvedUser || !personalSolvedDb) {
        personalSolvedMap = {};
        applyPersonalSolvedMarks();
        return;
    }

    // Показываем последнюю сохранённую копию сразу, не дожидаясь сети.
    personalSolvedMap = readPersonalSolvedCache(personalSolvedUser.uid);
    applyPersonalSolvedMarks();

    personalSolvedRef = personalSolvedDb.ref(`${MATCENTER_SOLVED_DB_PATH}/${personalSolvedUser.uid}`);
    personalSolvedRef.on('value', (snap) => {
        const remoteMap = normalizePersonalSolvedMap(snap.val() || {});
        personalSolvedMap = mergePersonalSolvedMaps(personalSolvedMap, remoteMap);
        writePersonalSolvedCache();
        applyPersonalSolvedMarks();
        syncPendingPersonalSolvedEntries();
    }, (err) => {
        console.warn('⚠️ Не удалось загрузить личные отметки задач:', err);
        // Не стираем локальную копию при временной ошибке Firebase.
        applyPersonalSolvedMarks();
        showPersonalSolvedNotice('Firebase временно недоступен — показан сохранённый прогресс');
    });

    // Если в прошлый раз сеть пропала во время записи, повторяем синхронизацию.
    syncPendingPersonalSolvedEntries();
}

function getPersonalSolvedCacheKey(uid) {
    return `${MATCENTER_SOLVED_CACHE_PREFIX}${String(uid || '')}`;
}

function normalizePersonalSolvedMap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    return Object.keys(value).reduce((result, key) => {
        const entry = value[key];
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return result;

        result[key] = {
            ...entry,
            solved: entry.solved !== false,
            updatedAt: Number(entry.updatedAt) || 0,
            _pending: entry._pending === true
        };
        return result;
    }, {});
}

function readPersonalSolvedCache(uid) {
    if (!uid) return {};

    try {
        const raw = safeGet(getPersonalSolvedCacheKey(uid));
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== MATCENTER_SOLVED_CACHE_VERSION) return {};
        return normalizePersonalSolvedMap(parsed.entries);
    } catch (err) {
        console.warn('⚠️ Не удалось прочитать локальный прогресс Матцентра:', err);
        return {};
    }
}

function writePersonalSolvedCache() {
    if (!personalSolvedUser || !personalSolvedUser.uid) return;

    try {
        safeSet(getPersonalSolvedCacheKey(personalSolvedUser.uid), JSON.stringify({
            version: MATCENTER_SOLVED_CACHE_VERSION,
            updatedAt: Date.now(),
            entries: personalSolvedMap
        }));
    } catch (err) {
        console.warn('⚠️ Не удалось сохранить локальный прогресс Матцентра:', err);
    }
}

function getPersonalSolvedEntryTime(entry) {
    return entry && Number(entry.updatedAt) || 0;
}

function mergePersonalSolvedMaps(localValue, remoteValue) {
    const localMap = normalizePersonalSolvedMap(localValue);
    const remoteMap = normalizePersonalSolvedMap(remoteValue);
    const merged = {};
    const keys = new Set([...Object.keys(localMap), ...Object.keys(remoteMap)]);

    keys.forEach(key => {
        const localEntry = localMap[key];
        const remoteEntry = remoteMap[key];

        if (!localEntry) {
            merged[key] = { ...remoteEntry, _pending: false };
            return;
        }

        if (!remoteEntry) {
            // Отсутствующая серверная запись не должна обнулять локальный
            // прогресс. Восстановим её при следующей успешной синхронизации.
            merged[key] = { ...localEntry, _pending: true };
            return;
        }

        if (localEntry._pending || getPersonalSolvedEntryTime(localEntry) > getPersonalSolvedEntryTime(remoteEntry)) {
            merged[key] = { ...localEntry, _pending: true };
        } else {
            merged[key] = { ...remoteEntry, _pending: false };
        }
    });

    return merged;
}

function getRemotePersonalSolvedEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const remoteEntry = { ...entry };
    delete remoteEntry._pending;
    return remoteEntry;
}

async function syncPendingPersonalSolvedEntries() {
    if (personalSolvedSyncInFlight || !personalSolvedUser || !personalSolvedRef) return;

    const pendingKeys = Object.keys(personalSolvedMap).filter(key => personalSolvedMap[key]?._pending);
    if (pendingKeys.length === 0) return;

    const updates = {};
    const versions = {};
    pendingKeys.forEach(key => {
        updates[key] = getRemotePersonalSolvedEntry(personalSolvedMap[key]);
        versions[key] = getPersonalSolvedEntryTime(personalSolvedMap[key]);
    });

    personalSolvedSyncInFlight = true;
    try {
        await personalSolvedRef.update(updates);
        pendingKeys.forEach(key => {
            const current = personalSolvedMap[key];
            if (current && getPersonalSolvedEntryTime(current) === versions[key]) {
                current._pending = false;
            }
        });
        writePersonalSolvedCache();
    } catch (err) {
        console.warn('⚠️ Отложенная синхронизация прогресса Матцентра не выполнена:', err);
    } finally {
        personalSolvedSyncInFlight = false;
    }
}

function getSolvedTaskKey(task) {
    const grade = task && (task.grade || currentGrade || DEFAULT_GRADE);
    const number = task && task.number;
    return sanitizeFirebaseKey(`${grade}__${number}`);
}

function sanitizeFirebaseKey(value) {
    return String(value == null ? '' : value).replace(/[.#$/\[\]]/g, '_');
}

function isTaskPersonallySolved(taskOrKey) {
    const key = typeof taskOrKey === 'string' ? taskOrKey : getSolvedTaskKey(taskOrKey);
    const value = personalSolvedMap && personalSolvedMap[key];
    return !!(value && value.solved !== false);
}

function getSolvedTaskPayload(task, solved = true) {
    const payload = {
        solved: !!solved,
        grade: task.grade || currentGrade || DEFAULT_GRADE,
        number: task.number,
        numberText: task.numberText || String(task.number),
        updatedAt: Date.now()
    };

    try {
        if (solved) payload.solvedAt = firebase.database.ServerValue.TIMESTAMP;
        else payload.unsolvedAt = firebase.database.ServerValue.TIMESTAMP;
    } catch (_) {
        if (solved) payload.solvedAt = Date.now();
        else payload.unsolvedAt = Date.now();
    }

    return payload;
}

function applyPersonalSolvedMarks() {
    document.querySelectorAll('.task-card[data-solved-key]').forEach(card => {
        const key = card.dataset.solvedKey;
        setPersonalSolvedCardState(card, isTaskPersonallySolved(key), false);
    });
    updatePersonalSolvedProgress();
}

// Считает, сколько реальных задач текущего раздела пользователь отметил решёнными,
// и обновляет полосу личного прогресса. Видна только вошедшим пользователям.
function updatePersonalSolvedProgress() {
    const wrap = document.getElementById('matcenterProgress');
    if (!wrap) return;

    const realTasks = getTasksForCurrentGrade().filter(t => Number.isInteger(t.number));
    const total = realTasks.length;
    const solved = realTasks.reduce((acc, t) => acc + (isTaskPersonallySolved(t) ? 1 : 0), 0);

    // Полоса нужна только когда пользователь вошёл и в разделе есть задачи.
    if (!personalSolvedUser || total === 0) {
        wrap.hidden = true;
        hideSolvedTasksShareMenu();
        return;
    }
    wrap.hidden = false;

    const percent = total > 0 ? Math.round((solved / total) * 100) : 0;
    const countEl = document.getElementById('solvedCount');
    const totalEl = document.getElementById('solvedTotal');
    const fillEl = document.getElementById('solvedProgressFill');
    const percentEl = document.getElementById('solvedProgressPercent');

    if (countEl) countEl.textContent = solved;
    if (totalEl) totalEl.textContent = total;
    if (fillEl) fillEl.style.width = `${percent}%`;
    if (percentEl) percentEl.textContent = `${percent}%`;

    updateSolvedTasksShareButton(solved, total);
    wrap.classList.toggle('is-complete', total > 0 && solved === total);
}

function setPersonalSolvedCardState(card, solved, animate) {
    if (!card) return;
    card.classList.toggle('user-solved', !!solved);

    const btn = card.querySelector('.task-solved-check');
    if (btn) {
        btn.classList.toggle('is-solved', !!solved);
        btn.setAttribute('aria-pressed', solved ? 'true' : 'false');
        btn.setAttribute('aria-label', solved
            ? 'Убрать отметку «решено»'
            : 'Отметить задачу как решённую');
        btn.title = solved
            ? 'Убрать отметку «решено»'
            : (personalSolvedUser ? 'Отметить задачу как решённую' : 'Войдите в аккаунт, чтобы сохранять решённые задачи');
    }

    const caption = card.querySelector('.task-solved-caption');
    if (caption) caption.hidden = !solved;

    if (animate) {
        const cls = solved ? 'just-solved' : 'just-unsolved';
        card.classList.remove('just-solved', 'just-unsolved');
        void card.offsetWidth;
        card.classList.add(cls);
        setTimeout(() => card.classList.remove(cls), 720);
    }
}

async function togglePersonalSolvedTask(task, card) {
    if (!personalSolvedAuth || !personalSolvedDb) {
        showPersonalSolvedNotice('Вход в аккаунт пока недоступен');
        return;
    }

    if (!personalSolvedUser) {
        showPersonalSolvedNotice('Войдите в аккаунт, чтобы сохранять решённые задачи');
        openAccountLoginFromMatcenter();
        return;
    }

    const key = getSolvedTaskKey(task);
    const wasSolved = isTaskPersonallySolved(key);
    const nextSolved = !wasSolved;
    const btn = card ? card.querySelector('.task-solved-check') : null;

    if (btn) btn.disabled = true;
    personalSolvedMap[key] = {
        ...getSolvedTaskPayload(task, nextSolved),
        _pending: true
    };
    writePersonalSolvedCache();
    setPersonalSolvedCardState(card, nextSolved, true);
    updatePersonalSolvedProgress();

    try {
        const ref = (personalSolvedRef || personalSolvedDb.ref(`${MATCENTER_SOLVED_DB_PATH}/${personalSolvedUser.uid}`)).child(key);
        const version = getPersonalSolvedEntryTime(personalSolvedMap[key]);
        await ref.set(getRemotePersonalSolvedEntry(personalSolvedMap[key]));
        if (personalSolvedMap[key] && getPersonalSolvedEntryTime(personalSolvedMap[key]) === version) {
            personalSolvedMap[key]._pending = false;
        }
        writePersonalSolvedCache();
    } catch (err) {
        console.warn('⚠️ Не удалось сохранить личную отметку задачи:', err);
        // Локальная отметка остаётся и будет отправлена при восстановлении сети.
        writePersonalSolvedCache();
        showPersonalSolvedNotice('Отметка сохранена на устройстве и синхронизируется позже');
    } finally {
        if (btn) btn.disabled = false;
    }
}

function openAccountLoginFromMatcenter() {
    if (window.AlmanionAccount && typeof window.AlmanionAccount.openLogin === 'function') {
        window.AlmanionAccount.openLogin();
        return;
    }
    const accountBtn = document.getElementById('accountBtn');
    if (accountBtn) accountBtn.click();
}

function showPersonalSolvedNotice(message) {
    if (typeof showNotification === 'function') {
        showNotification(message);
        return;
    }

    const note = document.createElement('div');
    note.className = 'matcenter-solved-toast';
    note.textContent = message;
    document.body.appendChild(note);
    requestAnimationFrame(() => note.classList.add('show'));
    setTimeout(() => note.classList.remove('show'), 2300);
    setTimeout(() => note.remove(), 2700);
}

// ============================================
// ПОДЕЛИТЬСЯ ЛИЧНЫМ ПРОГРЕССОМ
// ============================================

function initSolvedTasksShare() {
    const btn = document.getElementById('shareSolvedTasksBtn');
    if (!btn || btn.dataset.shareReady === 'true') return;
    btn.dataset.shareReady = 'true';

    btn.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await shareSolvedTasksProgress(btn);
    });

    document.addEventListener('click', (event) => {
        const menu = document.getElementById('matcenterSolvedShareMenu');
        if (!menu || menu.hidden) return;
        if (menu.contains(event.target) || btn.contains(event.target)) return;
        hideSolvedTasksShareMenu();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') hideSolvedTasksShareMenu();
    });

    window.addEventListener('resize', hideSolvedTasksShareMenu, { passive: true });
}

function updateSolvedTasksShareButton(solved, total) {
    const btn = document.getElementById('shareSolvedTasksBtn');
    if (!btn) return;

    const count = Number(solved) || 0;
    const all = Number(total) || 0;
    btn.classList.toggle('has-solved', count > 0);
    btn.setAttribute('aria-label', count > 0
        ? `Поделиться решёнными задачами: ${count} из ${all}`
        : 'Поделиться решёнными задачами');
    btn.title = count > 0
        ? 'Поделиться решёнными задачами'
        : 'Сначала отметьте хотя бы одну задачу как решённую';
}

async function shareSolvedTasksProgress(anchorBtn) {
    const payload = buildSolvedTasksSharePayload();
    if (!payload.count) {
        hideSolvedTasksShareMenu();
        showPersonalSolvedNotice('Сначала отметьте хотя бы одну задачу как решённую');
        return;
    }

    if (navigator.share) {
        try {
            await navigator.share({
                title: payload.title,
                text: payload.text,
                url: payload.url
            });
            hideSolvedTasksShareMenu();
            return;
        } catch (err) {
            if (err && err.name === 'AbortError') return;
            console.warn('Не удалось открыть системное меню «Поделиться»:', err);
        }
    }

    showSolvedTasksShareMenu(anchorBtn, payload);
}

function buildSolvedTasksSharePayload() {
    const realTasks = getTasksForCurrentGrade()
        .filter(task => Number.isInteger(task.number));
    const solvedTasks = realTasks
        .filter(task => isTaskPersonallySolved(task))
        .sort(compareTasksForSharing);

    const count = solvedTasks.length;
    const total = realTasks.length;
    const numbers = solvedTasks.map(formatSolvedTaskNumberForShare);
    const gradeTitle = getGradeTitle(currentGrade);
    const noun = pluralRu(count, 'задачу', 'задачи', 'задач');
    const list = numbers.join(', ');
    const text = `Я решил ${count} ${noun} в МатЦентре (${gradeTitle}): ${list}`;

    return {
        title: 'Мой прогресс в МатЦентре',
        text,
        url: getMatcenterShareUrl(),
        count,
        total,
        numbers
    };
}

function compareTasksForSharing(a, b) {
    const byNumber = (Number(a.number) || 0) - (Number(b.number) || 0);
    if (byNumber !== 0) return byNumber;
    return String(a.numberText || '').localeCompare(String(b.numberText || ''), 'ru', { numeric: true });
}

function formatSolvedTaskNumberForShare(task) {
    const raw = (task && task.numberText) || (task && task.number) || '';
    return `№${String(raw).replace(/\s+/g, ' ').trim()}`;
}

function pluralRu(value, one, few, many) {
    const n = Math.abs(Number(value) || 0);
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
}

function getMatcenterShareUrl() {
    const host = window.location.hostname || '';
    const isLocal = window.location.protocol === 'file:'
        || host === 'localhost'
        || host === '127.0.0.1'
        || host === '0.0.0.0';
    if (isLocal) return 'https://almanion.github.io/matcenter.html';
    return `${window.location.origin}${window.location.pathname || '/matcenter.html'}`;
}

function showSolvedTasksShareMenu(anchorBtn, payload) {
    const menu = ensureSolvedTasksShareMenu();
    if (!menu || !anchorBtn) return;

    menu.hidden = false;
    menu.dataset.shareText = payload.text;
    menu.dataset.shareUrl = payload.url;

    const summary = menu.querySelector('.matcenter-share-summary');
    if (summary) summary.textContent = `${payload.count} из ${payload.total} решено`;

    const rect = anchorBtn.getBoundingClientRect();
    const menuWidth = Math.min(280, window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - menuWidth - 12, rect.right - menuWidth));
    const top = Math.min(window.innerHeight - 16, rect.bottom + 10);

    menu.style.width = `${menuWidth}px`;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    requestAnimationFrame(() => menu.classList.add('is-open'));
}

function ensureSolvedTasksShareMenu() {
    let menu = document.getElementById('matcenterSolvedShareMenu');
    if (menu) return menu;

    menu = document.createElement('div');
    menu.className = 'matcenter-share-menu';
    menu.id = 'matcenterSolvedShareMenu';
    menu.hidden = true;

    const title = document.createElement('div');
    title.className = 'matcenter-share-title';
    title.textContent = 'Поделиться прогрессом';

    const summary = document.createElement('div');
    summary.className = 'matcenter-share-summary';

    const telegram = document.createElement('button');
    telegram.type = 'button';
    telegram.className = 'matcenter-share-option';
    telegram.innerHTML = '<span aria-hidden="true">↗</span><span>Telegram</span>';
    telegram.addEventListener('click', () => {
        const text = menu.dataset.shareText || '';
        const url = menu.dataset.shareUrl || getMatcenterShareUrl();
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
        hideSolvedTasksShareMenu();
        window.open(shareUrl, '_blank', 'noopener,noreferrer');
    });

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'matcenter-share-option';
    copy.innerHTML = '<span aria-hidden="true">⧉</span><span>Скопировать текст</span>';
    copy.addEventListener('click', async () => {
        const text = [menu.dataset.shareText, menu.dataset.shareUrl].filter(Boolean).join('\n');
        const ok = await copySolvedShareText(text);
        hideSolvedTasksShareMenu();
        showPersonalSolvedNotice(ok ? 'Текст скопирован' : 'Не удалось скопировать текст');
    });

    menu.append(title, summary, telegram, copy);
    document.body.appendChild(menu);
    return menu;
}

function hideSolvedTasksShareMenu() {
    const menu = document.getElementById('matcenterSolvedShareMenu');
    if (!menu) return;
    menu.classList.remove('is-open');
    menu.hidden = true;
}

async function copySolvedShareText(text) {
    if (!text) return false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (_) {}
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    textarea.remove();
    return ok;
}

