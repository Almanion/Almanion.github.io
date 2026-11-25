(() => {
    'use strict';
    const api = window.AlmanionAccount;
    if (!api?.auth) return;
    const byId = id => document.getElementById(id);
    const panel = byId('email'), form = byId('emailCodeForm'), input = byId('emailCode');
    const send = byId('emailSend'), haveCode = byId('emailHaveCode'), error = byId('emailError');
    const endpoint = api.auth.emulatorConfig || api.auth.app?.options?.projectId !== 'almanion-70120'
        ? '/__account/email-code'
        : 'https://script.google.com/macros/s/AKfycbyR_Iz_fyg2s-bviRtkvF1Zz_KMdRCUgpoIVT1CF-lG6UiNkVfvor_nMXILPzk8xslA/exec';
    const messages = {
        session: 'Сессия истекла. Войдите снова.', no_email: 'У аккаунта нет адреса почты.',
        unavailable: 'Сервис подтверждения временно недоступен. Попробуйте ещё раз.',
        network: 'Сервис не ответил. Проверьте подключение и попробуйте снова.',
        delivery: 'Письмо не удалось отправить. Попробуйте ещё раз.',
        mail_quota: 'Сегодня лимит писем исчерпан. Попробуйте завтра.',
        wrong_code: 'Код не подошёл. Проверьте шесть цифр из последнего письма.',
        expired: 'Срок кода истёк. Получите новый код.',
        attempts: 'Лимит попыток исчерпан. Получите новый код.',
        rate: 'Новый код можно будет запросить позже.',
        busy: 'Предыдущий запрос ещё обрабатывается. Попробуйте чуть позже.'
    };
    let session, timer;

    function persist(state) {
        try { sessionStorage.setItem(state.key, JSON.stringify([state.until, state.sentAt])); } catch {}
    }
    function showError(message) {
        error.textContent = message;
        error.hidden = !message;
    }
    function render() {
        clearTimeout(timer);
        panel.hidden = !session;
        if (!session) { byId('emailState').textContent = ''; return; }
        const { user, entering, busy, until, sentAt } = session;
        const verified = user.emailVerified;
        const seconds = Math.max(0, Math.ceil((until - Date.now()) / 1000));
        byId('emailTitle').textContent = verified ? 'Почта подтверждена' : 'Подтверждение почты';
        panel.dataset.verified = String(verified);
        const status = byId('emailState');
        const fresh = sentAt && Date.now() < sentAt + 600000;
        status.hidden = verified || !fresh;
        const message = !status.hidden ? 'Письмо отправлено на ' + user.email + '. Код действует 10 минут.' : '';
        if (status.textContent !== message) status.textContent = message;
        form.hidden = verified || !entering;
        input.disabled = !!busy;
        form.querySelector('button').disabled = !!busy || !/^[0-9]{6}$/.test(input.value);
        form.querySelector('button').textContent = busy === 'confirmEmailCode' ? 'Проверяем…' : 'Подтвердить';
        send.hidden = verified;
        send.disabled = !!busy || seconds > 0;
        send.textContent = busy === 'requestEmailCode' ? 'Отправляем…' : seconds
            ? 'Повторить через ' + Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')
            : sentAt ? 'Получить новый код' : 'Получить код';
        haveCode.hidden = verified || entering;
        haveCode.disabled = !!busy;
        if (!verified && seconds) timer = setTimeout(render, 1000);
    }
    function bind(user) {
        const key = user?.email && !user.isAnonymous ? 'almanion:email:' + user.uid : '';
        if (session?.key === key && session.address === user.email) { session.user = user; render(); return; }
        if (session) { try { sessionStorage.removeItem(session.key); } catch {} }
        session?.controller?.abort();
        session = null;
        input.value = '';
        showError('');
        if (key) {
            let stored;
            try { stored = JSON.parse(sessionStorage.getItem(key)); } catch {}
            const [until, sentAt] = Array.isArray(stored) ? stored : [];
            session = { user, key, address: user.email, until: Number(until) || 0, sentAt: Number(sentAt) || 0, entering: Date.now() < sentAt + 600000, busy: '' };
        }
        render();
    }
    async function submit(action) {
        const state = session;
        if (!state || state.busy || state.user.emailVerified) return;
        const controller = new AbortController();
        state.controller = controller;
        state.busy = action;
        const code = input.value;
        const timeout = setTimeout(() => controller.abort(), 25000);
        showError(''); render();
        try {
            const idToken = await state.user.getIdToken();
            if (state !== session) return;
            const response = await fetch(endpoint, {
                method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
                body: JSON.stringify({ action, idToken, ...(action === 'confirmEmailCode' ? { code } : {}) }),
                credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal
            });
            if (!response.ok) throw new Error('unavailable');
            const result = await response.json();
            if (state !== session) return;
            if (result.retryAfter) state.until = Date.now() + Math.min(3600, Number(result.retryAfter)) * 1000;
            if (!result.success) {
                if (['attempts', 'expired'].includes(result.reason)) { state.sentAt = 0; input.value = ''; }
                throw new Error(result.reason || 'unavailable');
            }
            if (result.verified) {
                await state.user.reload();
                if (state !== session) return;
                await state.user.getIdToken(true);
                if (state !== session) return;
                if (!state.user.emailVerified) throw new Error('unavailable');
                state.until = state.sentAt = 0;
                input.value = '';
            } else if (action === 'requestEmailCode' && result.retryAfter) {
                state.entering = true;
                state.sentAt = Date.now();
                input.value = '';
            } else { throw new Error('unavailable'); }
        } catch (err) {
            if (state === session) showError(messages[err.message] || (err instanceof TypeError || err.name === 'AbortError' ? messages.network : messages.unavailable));
        } finally {
            clearTimeout(timeout);
            if (state === session) {
                state.busy = ''; state.controller = null;
                persist(state); render();
                if (action === 'requestEmailCode' && !form.hidden && error.hidden) input.focus();
            }
        }
    }
    input.addEventListener('input', () => { input.value = input.value.replace(/[^0-9]/g, '').slice(0, 6); showError(''); render(); });
    haveCode.addEventListener('click', () => { session.entering = true; render(); input.focus(); });
    send.addEventListener('click', () => submit('requestEmailCode'));
    form.addEventListener('submit', event => { event.preventDefault(); if (/^[0-9]{6}$/.test(input.value)) submit('confirmEmailCode'); });
    api.auth.onAuthStateChanged(bind);
})();
