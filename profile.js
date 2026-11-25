(() => {
    'use strict';

    const byId = id => document.getElementById(id);
    const api = window.AlmanionAccount;
    const gate = byId('profileGate');
    const editor = byId('profileEditor');
    const form = byId('profileForm');
    const fields = byId('profileFields');
    const nickname = byId('profileNickname');
    const telegram = byId('profileTelegram');
    const monogram = byId('profileMonogram');
    const covers = { orbit: 'Орбиты', hills: 'Вершины', waves: 'Волны', plain: 'Без рисунка' };
    const status = byId('profileStatus');
    const defaults = { nickname: '', telegram: '', avatar: 'initial', color: 'iris', shape: 'circle', cover: 'orbit', monogram: '', rankVisible: false };
    let session = null;

    function warnBeforeLeave(event) {
        event.preventDefault();
        event.returnValue = '';
    }

    function showGate(message, label, action) {
        editor.hidden = true;
        gate.hidden = false;
        byId('profileGateMessage').textContent = message;
        const button = byId('profileGateAction');
        button.hidden = !label;
        button.textContent = label || '';
        button.onclick = action || null;
    }

    if (!api) {
        showGate('Не удалось подключиться к аккаунту.', 'Повторить', () => location.reload());
        return;
    }

    function normalizeTelegram(value) {
        const text = value.trim();
        if (!text) return '';
        const direct = text.match(/^(?:https?:\/\/)?t\.me\/([^/?#]+)\/?$/i);
        const subdomain = text.match(/^(?:https?:\/\/)?([a-z0-9_]+)\.t\.me\/?$/i);
        const handle = direct?.[1] || subdomain?.[1] || text.replace(/^@/, '');
        return /^[a-z][a-z0-9_]{0,30}[a-z0-9]$/i.test(handle) ? handle : null;
    }

    function readProfile(record) {
        const identity = record?.identity || {};
        return {
            nickname: typeof identity.nickname === 'string' ? identity.nickname : '',
            telegram: typeof record?.telegram === 'string' ? record.telegram : '',
            avatar: Object.hasOwn(api.profile.icons, identity.avatar) ? identity.avatar : defaults.avatar,
            color: Object.hasOwn(api.profile.colors, identity.color) ? identity.color : defaults.color,
            shape: Object.hasOwn(api.profile.shapes, identity.shape) ? identity.shape : defaults.shape,
            cover: Object.hasOwn(covers, record?.cover) ? record.cover : defaults.cover,
            monogram: identity.monogram || '', rankVisible: record?.rankVisible === true
        };
    }

    function buildOptions(container, group, entries) {
        for (const [value, description] of Object.entries(entries)) {
            const name = group === 'avatar' ? description[0] : description;
            const label = document.createElement('label');
            label.className = 'profile-choice';
            label.title = name;
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = group;
            input.value = value;
            input.setAttribute('aria-label', name);
            const face = document.createElement('span');
            face.className = 'profile-choice-face';
            face.setAttribute('aria-hidden', 'true');
            if (group === 'avatar') {
                face.innerHTML = api.profile.avatarMarkup({ avatar: value }, 'А');
            } else if (group === 'color') {
                const swatch = document.createElement('span');
                swatch.className = 'profile-choice-swatch';
                swatch.dataset.profileColor = value;
                face.append(swatch);
            } else {
                const sample = document.createElement('i');
                sample.dataset[group] = value;
                if (group === 'cover') {
                    const art = byId('profileCard').querySelector('[data-art="' + value + '"]');
                    if (art) sample.append(art.cloneNode(true));
                }
                face.append(sample, document.createTextNode(name));
            }
            label.append(input, face);
            container.append(label);
        }
    }

    buildOptions(byId('profileIcons'), 'avatar', api.profile.icons);
    buildOptions(byId('profileColors'), 'color', api.profile.colors);
    buildOptions(byId('profileShapes'), 'shape', api.profile.shapes);
    buildOptions(byId('profileCovers'), 'cover', covers);

    function fieldError(field, message) {
        const input = form.elements.namedItem(field);
        const error = byId(field + 'Error');
        error.textContent = message;
        error.hidden = !message;
        if (message) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
    }

    function normalized(field, value) {
        if (field === 'nickname') return value.trim();
        if (field === 'telegram') return normalizeTelegram(value);
        if (field === 'monogram') return value.trim().toUpperCase();
        return value;
    }

    function validateField(field) {
        const value = normalized(field, session.draft[field]);
        let message = '';
        if (field === 'telegram' && value === null) message = 'Введите @username или ссылку на профиль Telegram.';
        if (field === 'monogram' && value && !/^[А-ЯЁA-Z0-9]{1,2}$/.test(value)) message = 'Введите одну или две русские или латинские буквы либо цифры.';
        if (field === 'nickname' && (value.length > 32 || /[<>\x00-\x1f\x7f]/.test(value))) {
            message = 'Ник может содержать до 32 символов. Уберите угловые скобки и управляющие знаки.';
        }
        fieldError(field, message);
        return !message;
    }

    function displayForm() {
        const { account, draft, changed, saving, connected, message } = session;
        if (changed.size) window.addEventListener('beforeunload', warnBeforeLeave);
        else window.removeEventListener('beforeunload', warnBeforeLeave);
        if (nickname.value !== draft.nickname) nickname.value = draft.nickname;
        if (telegram.value !== draft.telegram) telegram.value = draft.telegram;
        if (monogram.value !== draft.monogram) monogram.value = draft.monogram;
        nickname.placeholder = account.displayName || account.email?.split('@')[0] || 'Ваш ник';
        for (const group of ['avatar', 'color', 'shape', 'cover']) form.elements.namedItem(group).value = draft[group];
        byId('rankVisible').checked = draft.rankVisible;
        byId('profileMonogramField').hidden = draft.avatar !== 'initial' && !monogram.hasAttribute('aria-invalid');
        const name = draft.nickname.trim() || nickname.placeholder;
        const handle = normalizeTelegram(draft.telegram);
        byId('profileCard').dataset.profileColor = draft.color;
        byId('profileCard').dataset.cover = draft.cover;
        byId('profilePreviewAvatar').innerHTML = api.profile.avatarMarkup(draft, name);
        monogram.placeholder = (Array.from(name)[0] || 'А').toLocaleUpperCase('ru');
        byId('profileIcons').querySelector('.profile-mark').textContent = draft.monogram.trim().toUpperCase() || monogram.placeholder;
        byId('profilePreviewName').textContent = name;
        byId('profileEmail').textContent = account.email || '';
        const contact = byId('profilePreviewTelegram');
        contact.hidden = !handle;
        contact.textContent = handle ? '@' + handle + ' ↗' : '';
        if (handle) contact.href = 'https://t.me/' + handle;
        else contact.removeAttribute('href');
        byId('profileColorName').textContent = api.profile.colors[draft.color];
        fields.disabled = saving;
        byId('profileSave').disabled = saving || !changed.size || !connected;
        byId('profileSave').textContent = saving ? 'Сохраняем…' : 'Сохранить';
        byId('profileReset').hidden = !changed.size || saving;
        status.dataset.state = session.failed ? 'error' : '';
        status.textContent = !connected ? (saving ? 'Ждём соединения для сохранения…' : 'Нет связи. Изменения можно сохранить после подключения.') : message;
    }

    function setAccount(account) {
        const usable = account && !account.isAnonymous ? account : null;
        if (usable && session?.account.uid === usable.uid) return;
        if (session) {
            session.ref.off('value', session.onRecord);
            session.connection.off('value', session.onConnection);
        }
        session = null;
        window.removeEventListener('beforeunload', warnBeforeLeave);
        form.reset();
        fields.disabled = true;
        for (const field of ['nickname', 'telegram', 'monogram']) fieldError(field, '');
        for (const id of ['profilePreviewAvatar', 'profilePreviewName', 'profileEmail', 'profilePreviewTelegram', 'profileStatus']) byId(id).replaceChildren();
        byId('profilePreviewTelegram').removeAttribute('href');
        byId('profilePreviewTelegram').hidden = true;
        nickname.placeholder = '';
        monogram.placeholder = '';
        byId('profileIcons').querySelector('.profile-mark').textContent = 'А';
        if (!usable) {
            showGate('Войдите, чтобы открыть свой профиль.', 'Войти', api.openLogin);
            return;
        }
        showGate('Загружаем профиль…');
        const current = {
            account: usable, ref: api.database.ref('accountProfiles/' + usable.uid),
            connection: api.database.ref('.info/connected'), connected: false, loaded: false,
            draft: { ...defaults }, stored: { ...defaults }, changed: new Set(), saving: false, message: '', failed: false
        };
        session = current;
        current.onConnection = snap => {
            if (session !== current) return;
            current.connected = snap.val() === true;
            if (current.loaded) displayForm();
            else if (!current.connected) showGate('Подключаемся к профилю…', 'Повторить', () => location.reload());
        };
        current.onRecord = snap => {
            if (session !== current) return;
            current.stored = readProfile(snap.val());
            for (const key of Object.keys(defaults)) {
                if (!current.changed.has(key)) current.draft[key] = current.stored[key];
            }
            current.loaded = true;
            gate.hidden = true;
            editor.hidden = false;
            displayForm();
        };
        current.connection.on('value', current.onConnection);
        current.ref.on('value', current.onRecord, () => {
            if (session !== current) return;
            current.loaded = false;
            showGate('Не удалось загрузить профиль.', 'Повторить', () => {
                setAccount(null);
                setAccount(api.getUser());
            });
        });
    }

    form.addEventListener('input', event => {
        const field = event.target.name;
        if (!session?.loaded || session.saving || !Object.hasOwn(defaults, field)) return;
        const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        session.draft[field] = value;
        if (normalized(field, value) === session.stored[field]) session.changed.delete(field);
        else session.changed.add(field);
        if (event.target.hasAttribute('aria-invalid')) validateField(field);
        session.message = '';
        session.failed = false;
        displayForm();
    });

    for (const input of [nickname, telegram, monogram]) {
        input.addEventListener('blur', () => { if (session?.loaded && session.changed.has(input.name)) validateField(input.name); });
    }

    byId('profileReset').addEventListener('click', () => {
        if (!session?.loaded || session.saving) return;
        session.draft = { ...session.stored };
        session.changed.clear();
        session.message = '';
        session.failed = false;
        for (const field of ['nickname', 'telegram', 'monogram']) fieldError(field, '');
        displayForm();
        form.querySelector('input[name="avatar"]:checked').focus({ preventScroll: true });
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const current = session;
        if (!current?.loaded || current.saving || !current.connected || !current.changed.size) return;
        const invalid = ['nickname', 'telegram', 'monogram'].filter(key => !validateField(key));
        if (invalid.length) { displayForm(); form.elements.namedItem(invalid[0]).focus(); return; }
        const patch = {};
        for (const key of current.changed) {
            const value = normalized(key, current.draft[key]);
            const path = ['telegram', 'cover', 'rankVisible'].includes(key) ? key : 'identity/' + key;
            patch[path] = value === defaults[key] ? null : value;
        }
        current.saving = true;
        current.failed = false;
        current.message = '';
        displayForm();
        try {
            await current.ref.update(patch);
            if (session !== current) return;
            current.changed.clear();
            current.draft = { ...current.stored };
            current.message = 'Изменения сохранены';
        } catch (_) {
            if (session !== current) return;
            current.failed = true;
            current.message = 'Не удалось сохранить. Попробуйте ещё раз.';
        } finally {
            if (session === current) { current.saving = false; displayForm(); }
        }
    });

    window.addEventListener('almanion-account-ready', event => setAccount(event.detail.user));
    if (api.isReady()) setAccount(api.getUser());
})();
