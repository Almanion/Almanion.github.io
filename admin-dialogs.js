(function () {
    'use strict';

    let dialogSequence = 0;

    function notify(message, options) {
        const settings = options || {};
        let stack = document.getElementById('adminToastStack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'adminToastStack';
            stack.className = 'admin-toast-stack';
            stack.setAttribute('aria-live', settings.tone === 'error' ? 'assertive' : 'polite');
            stack.setAttribute('aria-atomic', 'false');
            document.body.appendChild(stack);
        }

        const toast = document.createElement('div');
        toast.className = 'admin-toast' + (settings.tone === 'error' ? ' is-error' : '')
            + (settings.tone === 'success' ? ' is-success' : '');
        toast.setAttribute('role', settings.tone === 'error' ? 'alert' : 'status');

        const text = document.createElement('span');
        text.className = 'admin-toast-text';
        text.textContent = String(message == null ? '' : message);
        toast.appendChild(text);

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'admin-toast-close';
        close.setAttribute('aria-label', 'Закрыть уведомление');
        close.textContent = '×';
        close.addEventListener('click', function () { toast.remove(); });
        toast.appendChild(close);

        stack.appendChild(toast);
        window.setTimeout(function () {
            toast.classList.add('is-leaving');
            window.setTimeout(function () { toast.remove(); }, 180);
        }, Math.max(1800, Number(settings.duration) || 4200));
        return toast;
    }

    function focusableElements(root) {
        return Array.from(root.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )).filter(function (node) { return !node.hidden && node.getAttribute('aria-hidden') !== 'true'; });
    }

    function openDialog(options) {
        const settings = options || {};
        const previousFocus = document.activeElement;
        const id = 'admin-dialog-title-' + (++dialogSequence);
        const overlay = document.createElement('div');
        overlay.className = 'admin-dialog-overlay';

        const dialog = document.createElement('section');
        dialog.className = 'admin-dialog' + (settings.danger ? ' is-danger' : '');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', id);

        const heading = document.createElement('div');
        heading.className = 'admin-dialog-heading';
        const kicker = document.createElement('span');
        kicker.className = 'admin-dialog-kicker';
        kicker.textContent = settings.danger ? 'Требуется подтверждение' : (settings.kicker || 'Панель управления');
        const title = document.createElement('h2');
        title.id = id;
        title.textContent = settings.title || 'Подтверждение';
        heading.append(kicker, title);

        const message = document.createElement('p');
        message.className = 'admin-dialog-message';
        message.textContent = String(settings.message || '');
        dialog.append(heading, message);

        let input = null;
        if (settings.input) {
            const label = document.createElement('label');
            label.className = 'admin-dialog-field';
            const caption = document.createElement('span');
            caption.textContent = settings.inputLabel || 'Значение';
            input = document.createElement('input');
            input.type = settings.inputType || 'text';
            input.value = String(settings.value || '');
            input.placeholder = String(settings.placeholder || '');
            input.autocomplete = 'off';
            label.append(caption, input);
            dialog.appendChild(label);
        }

        const actions = document.createElement('div');
        actions.className = 'admin-dialog-actions';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'btn btn-outline';
        cancel.textContent = settings.cancelLabel || 'Отмена';
        const confirm = document.createElement('button');
        confirm.type = 'button';
        confirm.className = 'btn ' + (settings.danger ? 'btn-danger' : 'btn-primary');
        confirm.textContent = settings.confirmLabel || 'Подтвердить';
        actions.append(cancel, confirm);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);

        const inertNodes = Array.from(document.body.children).filter(function (node) { return node !== overlay; });
        const priorInert = inertNodes.map(function (node) { return node.inert === true; });
        inertNodes.forEach(function (node) { node.inert = true; });
        document.body.appendChild(overlay);

        return new Promise(function (resolve) {
            let settled = false;
            function finish(value) {
                if (settled) return;
                settled = true;
                document.removeEventListener('keydown', onKeyDown, true);
                overlay.classList.add('is-leaving');
                inertNodes.forEach(function (node, index) { node.inert = priorInert[index]; });
                window.setTimeout(function () { overlay.remove(); }, 160);
                if (previousFocus && typeof previousFocus.focus === 'function' && previousFocus.isConnected) {
                    window.setTimeout(function () { previousFocus.focus(); }, 0);
                }
                resolve(value);
            }
            function onKeyDown(event) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    finish(settings.input ? null : false);
                    return;
                }
                if (event.key !== 'Tab') return;
                const focusable = focusableElements(dialog);
                if (!focusable.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
            cancel.addEventListener('click', function () { finish(settings.input ? null : false); });
            confirm.addEventListener('click', function () { finish(settings.input ? input.value : true); });
            overlay.addEventListener('mousedown', function (event) {
                if (event.target === overlay) finish(settings.input ? null : false);
            });
            if (input) {
                input.addEventListener('keydown', function (event) {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        confirm.click();
                    }
                });
            }
            document.addEventListener('keydown', onKeyDown, true);
            window.requestAnimationFrame(function () { (input || confirm).focus(); });
        });
    }

    window.AdminUI = Object.freeze({
        notify: notify,
        alert: function (message, title) {
            return openDialog({ title: title || 'Сообщение', message: message, confirmLabel: 'Понятно', cancelLabel: 'Закрыть' });
        },
        confirm: function (message, options) {
            return openDialog(Object.assign({}, options || {}, { message: message }));
        },
        prompt: function (message, value, options) {
            return openDialog(Object.assign({}, options || {}, { message: message, input: true, value: value || '' }));
        }
    });
})();
