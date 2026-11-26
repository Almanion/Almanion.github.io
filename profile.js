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
    const art = window.AlmanionProfileCovers;
    const status = byId('profileStatus');
    const card = byId('profileCard');
    const compact = byId('profileCompact');
    const defaults = {
        nickname: '', telegram: '', avatar: 'initial', avatarImage: '', color: 'iris',
        background: 'solid', cover: 'orbit', coverImage: '', monogram: '', rankVisible: false
    };
    let session = null;
    let accountVersion = 0;
    let renderedCover = null;

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
    if (!art) {
        showGate('Не удалось загрузить оформление профиля.', 'Повторить', () => location.reload());
        return;
    }

    const groups = {
        avatar: [byId('profileIcons'), api.profile.icons],
        color: [byId('profileColors'), api.profile.colors],
        background: [byId('profileBackgrounds'), api.profile.backgrounds || { solid: 'Однотонный' }],
        cover: [byId('profileCovers'), art.entries]
    };
    const samples = [];
    const paintedMarks = new WeakMap();
    const coverArt = byId('profileCoverArt');
    const compactCover = byId('profileCompactCover');
    const largeAvatar = byId('profilePreviewAvatar');
    const smallAvatar = byId('profileCompactAvatar');
    const imageControls = Object.fromEntries([...form.querySelectorAll('[data-image-kind]')].map(group => {
        const kind = group.dataset.imageKind;
        const prefix = 'profile' + kind[0].toUpperCase() + kind.slice(1);
        const upload = byId(prefix + 'Upload');
        return [kind, {
            group, file: byId(prefix + 'File'), upload, remove: byId(prefix + 'Remove'),
            caption: upload.querySelector('span'), state: byId(prefix + 'ImageState'),
            error: byId(prefix + 'ImageError'), initialLabel: upload.textContent.trim(), pickerVersion: null
        }];
    }));
    const imageUrl = (value, kind) => api.profile.imageUrl?.(value, kind) || '';
    const memeIcons = new Set(api.profile.memeIcons || []);
    const memeGrid = byId('profileMemeIcons');
    const classicGrid = byId('profileClassicIcons');
    byId('profileMemeGroup').hidden = memeIcons.size === 0;
    if (typeof IntersectionObserver === 'function') {
        const coverVisibility = new IntersectionObserver(entries => {
            entries.forEach(entry => entry.target.toggleAttribute('data-cover-paused', !entry.isIntersecting));
        });
        coverVisibility.observe(coverArt);
        coverVisibility.observe(compactCover);
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
            avatarImage: imageUrl(identity.avatarImage, 'avatar') ? identity.avatarImage : '',
            color: Object.hasOwn(api.profile.colors, identity.color) ? identity.color : defaults.color,
            background: Object.hasOwn(groups.background[1], identity.background) ? identity.background : defaults.background,
            cover: Object.hasOwn(art.entries, record?.cover) ? record.cover : defaults.cover,
            coverImage: imageUrl(record?.coverImage, 'cover') ? record.coverImage : '',
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
            const sample = document.createElement('span');
            sample.className = 'profile-choice-sample';
            face.append(sample);
            if (group === 'color') {
                sample.classList.add('profile-choice-swatch');
                sample.dataset.profileColor = value;
            } else if (group === 'cover') {
                sample.classList.add('profile-cover-sample');
                sample.dataset.cover = value;
                sample.innerHTML = art.markup(value);
            } else {
                samples.push({ sample, group, value });
            }
            if (group !== 'color') {
                const caption = document.createElement('span');
                caption.className = 'profile-choice-name';
                caption.textContent = name;
                face.append(caption);
            }
            label.append(input, face);
            const target = group === 'avatar' ? (memeIcons.has(value) ? memeGrid : classicGrid) : container;
            target.append(label);
        }
    }

    for (const [group, [container, entries]] of Object.entries(groups)) buildOptions(container, group, entries);

    function paintMark(container, value, name) {
        const markup = api.profile.avatarMarkup(value, name);
        if (paintedMarks.get(container) === markup && container.firstChild) return;
        container.innerHTML = markup;
        paintedMarks.set(container, markup);
    }

    function paintCover(draft) {
        if (renderedCover?.preset === draft.cover && renderedCover.image === draft.coverImage) return;
        renderedCover = { preset: draft.cover, image: draft.coverImage };
        card.dataset.cover = compact.dataset.cover = draft.cover;
        const source = imageUrl(draft.coverImage, 'cover');
        card.toggleAttribute('data-custom-cover', !!source);
        for (const container of [coverArt, compactCover]) {
            if (!source) {
                container.innerHTML = art.markup(draft.cover);
                continue;
            }
            const photo = document.createElement('img');
            photo.className = 'profile-cover-photo';
            photo.alt = '';
            photo.decoding = 'async';
            photo.src = source;
            container.replaceChildren(photo);
        }
    }

    function paintPreview(draft, name) {
        for (const target of [card, compact, byId('profileCovers')]) target.dataset.profileColor = draft.color;
        paintCover(draft);
        paintMark(largeAvatar, draft, name);
        paintMark(smallAvatar, draft, name);
        byId('profilePreviewName').textContent = byId('profileCompactName').textContent = name;
        for (const { sample, group, value } of samples) {
            const appearance = { ...draft, [group]: value, avatarImage: '' };
            if (group !== 'avatar') appearance.avatar = 'initial';
            paintMark(sample, appearance, name);
        }
    }

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

    function editField(field, value) {
        session.draft[field] = value;
        if (normalized(field, value) === session.stored[field]) session.changed.delete(field);
        else session.changed.add(field);
        session.message = '';
        session.failed = false;
    }

    function imageError(kind, message) {
        const error = imageControls[kind].error;
        error.textContent = message;
        error.hidden = !message;
    }

    function showImageControls(draft) {
        for (const [kind, control] of Object.entries(imageControls)) {
            const custom = !!draft[kind + 'Image'];
            control.group.toggleAttribute('data-custom', custom);
            control.caption.textContent = custom ? 'Заменить' : control.initialLabel;
            if (custom) control.upload.setAttribute('aria-label', kind === 'avatar' ? 'Заменить фото аватара' : 'Заменить фото обложки');
            else control.upload.removeAttribute('aria-label');
            control.state.textContent = custom ? 'Выбрана своя фотография' : '';
            control.remove.hidden = !custom;
        }
    }

    function displayForm() {
        const { account, draft, changed, saving, connected, message } = session;
        if (changed.size) window.addEventListener('beforeunload', warnBeforeLeave);
        else window.removeEventListener('beforeunload', warnBeforeLeave);
        if (nickname.value !== draft.nickname) nickname.value = draft.nickname;
        if (telegram.value !== draft.telegram) telegram.value = draft.telegram;
        if (monogram.value !== draft.monogram) monogram.value = draft.monogram;
        nickname.placeholder = account.displayName || account.email?.split('@')[0] || 'Ваш ник';
        for (const [group, [container]] of Object.entries(groups)) {
            if (draft[group + 'Image']) {
                for (const option of container.querySelectorAll('input:checked')) option.checked = false;
                continue;
            }
            const options = form.elements.namedItem(group);
            if (options instanceof HTMLInputElement) options.checked = options.value === draft[group];
            else options.value = draft[group];
        }
        byId('rankVisible').checked = draft.rankVisible;
        byId('profileMonogramField').hidden = (draft.avatar !== 'initial' || !!draft.avatarImage) && !monogram.hasAttribute('aria-invalid');
        const name = draft.nickname.trim() || nickname.placeholder;
        const handle = normalizeTelegram(draft.telegram);
        paintPreview(draft, name);
        showImageControls(draft);
        byId('profileRankHint').textContent = draft.avatarImage && draft.rankVisible
            ? 'Другие участники рейтинга увидят выбранное фото аватара.'
            : 'По умолчанию другим участникам виден игровой псевдоним.';
        monogram.placeholder = (Array.from(name)[0] || 'А').toLocaleUpperCase('ru');
        byId('profileEmail').textContent = account.email || '';
        const contact = byId('profilePreviewTelegram');
        contact.hidden = !handle;
        contact.textContent = handle ? '@' + handle + ' ↗' : '';
        if (handle) contact.href = 'https://t.me/' + handle;
        else contact.removeAttribute('href');
        byId('profileColorName').textContent = api.profile.colors[draft.color];
        fields.disabled = saving;
        form.toggleAttribute('data-dirty', changed.size > 0);
        byId('profileSave').disabled = saving || !changed.size || !connected;
        byId('profileSave').textContent = saving ? 'Сохраняем…' : 'Сохранить';
        byId('profileReset').hidden = !changed.size || saving;
        status.dataset.state = session.failed ? 'error' : '';
        const feedback = message || (changed.size && !saving ? 'Изменения не сохранены' : '');
        status.textContent = !connected ? (saving ? 'Ждём соединения для сохранения…' : 'Нет связи. Изменения можно сохранить после подключения.') : feedback;
    }

    function setAccount(account) {
        const usable = account && !account.isAnonymous ? account : null;
        if (usable && session?.account.uid === usable.uid) return;
        accountVersion++;
        if (session) {
            session.ref.off('value', session.onRecord);
            session.connection.off('value', session.onConnection);
        }
        session = null;
        window.AlmanionProfileCrop?.close?.();
        window.removeEventListener('beforeunload', warnBeforeLeave);
        form.reset();
        fields.disabled = true;
        for (const field of ['nickname', 'telegram', 'monogram']) fieldError(field, '');
        for (const id of ['profilePreviewName', 'profileCompactName', 'profileEmail', 'profilePreviewTelegram', 'profileStatus']) byId(id).replaceChildren();
        for (const avatar of [largeAvatar, smallAvatar]) {
            avatar.replaceChildren();
            paintedMarks.delete(avatar);
        }
        renderedCover = null;
        coverArt.replaceChildren();
        compactCover.replaceChildren();
        card.removeAttribute('data-custom-cover');
        for (const { sample } of samples) sample.replaceChildren();
        showImageControls(defaults);
        for (const kind of Object.keys(imageControls)) imageError(kind, '');
        byId('profilePreviewTelegram').removeAttribute('href');
        byId('profilePreviewTelegram').hidden = true;
        nickname.placeholder = '';
        monogram.placeholder = '';
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
        editField(field, value);
        if (Object.hasOwn(imageControls, field)) {
            editField(field + 'Image', '');
            imageError(field, '');
        }
        if (event.target.hasAttribute('aria-invalid')) validateField(field);
        displayForm();
    });

    for (const [kind, control] of Object.entries(imageControls)) {
        control.upload.addEventListener('click', () => {
            if (!session?.loaded || session.saving || session.editingImage) return;
            control.pickerVersion = accountVersion;
            imageError(kind, '');
            control.file.click();
        });
        control.file.addEventListener('cancel', () => { control.pickerVersion = null; });
        control.file.addEventListener('change', async () => {
            const pickedFor = control.pickerVersion;
            control.pickerVersion = null;
            const file = control.file.files[0];
            control.file.value = '';
            const current = session;
            if (!file || !current?.loaded || current.saving || current.editingImage ||
                (pickedFor !== null && pickedFor !== accountVersion)) return;
            const crop = window.AlmanionProfileCrop;
            if (!crop) {
                imageError(kind, 'Не удалось открыть кадрирование. Обновите страницу и попробуйте ещё раз.');
                return;
            }
            current.editingImage = true;
            imageError(kind, '');
            try {
                const encoded = await crop.open({ file, kind, trigger: control.upload });
                if (!encoded || current !== session || !current.loaded) return;
                if (!imageUrl(encoded, kind)) {
                    imageError(kind, 'Не удалось подготовить фотографию. Выберите другой файл.');
                    return;
                }
                editField(kind + 'Image', encoded);
                displayForm();
            } catch (error) {
                if (current === session) imageError(kind, error?.message || 'Не удалось подготовить фотографию.');
            } finally {
                current.editingImage = false;
            }
        });
        control.remove.addEventListener('click', () => {
            if (!session?.loaded || session.saving) return;
            editField(kind + 'Image', '');
            imageError(kind, '');
            displayForm();
            control.upload.focus({ preventScroll: true });
        });
    }

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
        for (const kind of Object.keys(imageControls)) imageError(kind, '');
        displayForm();
        const selected = form.querySelector('input[name="avatar"]:checked') || imageControls.avatar.upload;
        selected.focus({ preventScroll: true });
    });

    byId('profileShowPreview').addEventListener('click', () => {
        card.focus({ preventScroll: true });
        card.scrollIntoView({ block: 'start' });
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const current = session;
        if (!current?.loaded || current.saving || current.editingImage || !current.connected || !current.changed.size) return;
        const invalid = ['nickname', 'telegram', 'monogram'].filter(key => !validateField(key));
        if (invalid.length) { displayForm(); form.elements.namedItem(invalid[0]).focus(); return; }
        const patch = {};
        for (const key of current.changed) {
            const value = normalized(key, current.draft[key]);
            const path = ['telegram', 'cover', 'coverImage', 'rankVisible'].includes(key) ? key : 'identity/' + key;
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
