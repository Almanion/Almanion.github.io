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
    const status = byId('profileStatus');
    const defaults = { nickname: '', telegram: '', avatar: 'initial', color: 'iris' };
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
            color: Object.hasOwn(api.profile.colors, identity.color) ? identity.color : defaults.color
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
            } else {
                const swatch = document.createElement('span');
                swatch.className = 'profile-choice-swatch';
                swatch.dataset.profileColor = value;
                face.append(swatch);
            }
            label.append(input, face);
            container.append(label);
        }
    }

    buildOptions(byId('profileIcons'), 'avatar', api.profile.icons);
    buildOptions(byId('profileColors'), 'color', api.profile.colors);

    function fieldError(field, message) {
        const input = field === 'nickname' ? nickname : telegram;
        const error = byId(field + 'Error');
        error.textContent = message;
        error.hidden = !message;
        if (message) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
    }

    function normalized(field, value) {
        if (field === 'nickname') return value.trim();
        if (field === 'telegram') return normalizeTelegram(value);
        return value;
    }

    function validateField(field) {
        const value = normalized(field, session.draft[field]);
        let message = '';
        if (field === 'telegram' && value === null) message = 'Введите @username или ссылку на профиль Telegram.';
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
        nickname.placeholder = account.displayName || account.email?.split('@')[0] || 'Ваш ник';
        for (const group of ['avatar', 'color']) form.elements.namedItem(group).value = draft[group];
        const name = draft.nickname.trim() || nickname.placeholder;
        const handle = normalizeTelegram(draft.telegram);
        byId('profileCard').dataset.profileColor = draft.color;
        byId('profilePreviewAvatar').innerHTML = api.profile.avatarMarkup(draft, name);
        byId('profileIcons').querySelector('.profile-mark').textContent = (Array.from(name)[0] || 'А').toLocaleUpperCase('ru');
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
        for (const field of ['nickname', 'telegram']) fieldError(field, '');
        for (const id of ['profilePreviewAvatar', 'profilePreviewName', 'profileEmail', 'profilePreviewTelegram', 'profileStatus']) byId(id).replaceChildren();
        byId('profilePreviewTelegram').removeAttribute('href');
        byId('profilePreviewTelegram').hidden = true;
        nickname.placeholder = '';
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
        session.draft[field] = event.target.value;
        if (normalized(field, event.target.value) === session.stored[field]) session.changed.delete(field);
        else session.changed.add(field);
        if (event.target.hasAttribute('aria-invalid')) validateField(field);
        session.message = '';
        session.failed = false;
        displayForm();
    });

    for (const input of [nickname, telegram]) {
        input.addEventListener('blur', () => { if (session?.loaded && session.changed.has(input.name)) validateField(input.name); });
    }

    byId('profileReset').addEventListener('click', () => {
        if (!session?.loaded || session.saving) return;
        session.draft = { ...session.stored };
        session.changed.clear();
        session.message = '';
        session.failed = false;
        fieldError('nickname', '');
        fieldError('telegram', '');
        displayForm();
        form.querySelector('input[name="avatar"]:checked').focus({ preventScroll: true });
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const current = session;
        if (!current?.loaded || current.saving || !current.connected || !current.changed.size) return;
        const invalid = ['nickname', 'telegram'].filter(key => !validateField(key));
        if (invalid.length) { form.elements.namedItem(invalid[0]).focus(); return; }
        const patch = {};
        for (const key of current.changed) {
            const value = normalized(key, current.draft[key]);
            patch[key === 'telegram' ? key : 'identity/' + key] = value === defaults[key] ? null : value;
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
