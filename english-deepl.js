(function () {
    'use strict';

    const API_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyR_Iz_fyg2s-bviRtkvF1Zz_KMdRCUgpoIVT1CF-lG6UiNkVfvor_nMXILPzk8xslA/exec';
    const MAX_TEXT_LENGTH = 5000;
    const WIDTH_STORAGE_KEY = 'englishDeepLWidth';
    const MOBILE_QUERY = window.matchMedia('(max-width: 768px)');
    const ICON_TRANSLATE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h8M8 3v2m1.5 0c-.55 3.25-2.15 5.65-5 7.35M6 8.8c1.15 1.55 2.45 2.7 4.35 3.7M13 19l3.5-8 3.5 8m-5.7-4h4.4"/></svg>';
    const ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    const ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>';
    const ICON_SPEAKER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6.5 9H3v6h3.5l4.5 4V5Z"/><path d="M15 9.5a4 4 0 0 1 0 5M17.8 6.8a7.5 7.5 0 0 1 0 10.4"/></svg>';

    let panel = null;
    let input = null;
    let output = null;
    let status = null;
    let translateButton = null;
    let copyButton = null;
    let count = null;
    let lastSelection = '';
    let restoreFocus = null;
    let activeSpeechButton = null;
    let requestController = null;
    const translationCache = new Map();

    function safeStoredWidth() {
        try { return Number(localStorage.getItem(WIDTH_STORAGE_KEY)) || 390; } catch (_) { return 390; }
    }

    function clampWidth(value) {
        return Math.round(Math.min(680, Math.max(320, Math.min(window.innerWidth * 0.5, Number(value) || 390))));
    }

    function applyWidth(value, save) {
        const width = clampWidth(value);
        document.body.style.setProperty('--english-translator-width', width + 'px');
        if (save) {
            try { localStorage.setItem(WIDTH_STORAGE_KEY, String(width)); } catch (_) {}
        }
        return width;
    }

    function setStatus(message, state) {
        if (!status) return;
        status.textContent = message || '';
        status.dataset.state = state || '';
    }

    function updateCount() {
        if (!input || !count) return;
        count.textContent = input.value.length.toLocaleString('en-US') + ' / ' + MAX_TEXT_LENGTH.toLocaleString('en-US');
        count.classList.toggle('is-over', input.value.length > MAX_TEXT_LENGTH);
        translateButton.disabled = !input.value.trim() || input.value.length > MAX_TEXT_LENGTH || !!requestController;
    }

    function buildPanel() {
        if (panel) return;
        panel = document.createElement('aside');
        panel.className = 'english-translator-panel';
        panel.id = 'englishTranslatorPanel';
        panel.setAttribute('aria-label', 'DeepL Translate');
        panel.setAttribute('aria-hidden', 'true');
        panel.inert = true;
        panel.innerHTML =
            '<div class="english-translator-resizer" role="separator" tabindex="0" aria-label="Resize translator" aria-orientation="vertical"></div>' +
            '<header class="english-translator-header"><div class="english-translator-title">' + ICON_TRANSLATE + '<div><strong>DeepL Translate</strong><span>English to Russian</span></div></div>' +
                '<button class="english-translator-close" type="button" aria-label="Close translator">' + ICON_CLOSE + '</button></header>' +
            '<div class="english-translator-body">' +
                '<div class="english-language-row"><span>English</span><span aria-hidden="true">→</span><span>Russian</span></div>' +
                '<label class="english-translator-field"><span class="visually-hidden">English text</span><textarea maxlength="5000" spellcheck="true" placeholder="Type or paste English text…"></textarea></label>' +
                '<div class="english-translator-input-meta"><button class="english-use-selection" type="button">Use selected text</button><span class="english-translator-count">0 / 5,000</span></div>' +
                '<button class="english-translate-submit" type="button">Translate</button>' +
                '<p class="english-translator-status" role="status" aria-live="polite"></p>' +
                '<section class="english-translator-result" aria-label="Russian translation"><div class="english-translator-result-head"><span>Translation</span><button type="button" aria-label="Copy translation" hidden>' + ICON_COPY + '</button></div><p tabindex="0">The translation will appear here.</p></section>' +
            '</div>' +
            '<footer class="english-translator-footer"><a href="https://www.deepl.com/translator" target="_blank" rel="noopener noreferrer">Powered by DeepL</a><span>Pronunciation uses your browser voice</span></footer>';
        document.body.appendChild(panel);

        input = panel.querySelector('textarea');
        output = panel.querySelector('.english-translator-result p');
        status = panel.querySelector('.english-translator-status');
        translateButton = panel.querySelector('.english-translate-submit');
        copyButton = panel.querySelector('.english-translator-result-head button');
        count = panel.querySelector('.english-translator-count');

        panel.querySelector('.english-translator-close').addEventListener('click', closePanel);
        panel.querySelector('.english-use-selection').addEventListener('click', useSelection);
        translateButton.addEventListener('click', translate);
        copyButton.addEventListener('click', copyTranslation);
        input.addEventListener('input', updateCount);
        input.addEventListener('keydown', function (event) {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') translate();
        });
        wireResizer(panel.querySelector('.english-translator-resizer'));
        updateCount();
    }

    function makeLauncher(id, className, label) {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = id;
        button.className = className;
        button.setAttribute('aria-controls', 'englishTranslatorPanel');
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-label', 'Open DeepL Translate');
        button.innerHTML = ICON_TRANSLATE + '<span>' + label + '</span>';
        button.addEventListener('click', openPanel);
        return button;
    }

    function addLaunchers() {
        const sidebarActions = document.querySelector('.sidebar-actions');
        if (sidebarActions && !document.getElementById('englishTranslatorSidebarButton')) {
            sidebarActions.appendChild(makeLauncher('englishTranslatorSidebarButton', 'knowledge-check-btn english-translator-sidebar-button', 'DeepL'));
        }

        const bottomNav = document.getElementById('expBottomNav');
        if (bottomNav && !document.getElementById('englishTranslatorMobileButton')) {
            const button = makeLauncher('englishTranslatorMobileButton', 'exp-bn-item english-translator-mobile-button', 'DeepL');
            button.querySelector('span').classList.add('exp-bn-label');
            const accountButton = bottomNav.lastElementChild;
            bottomNav.insertBefore(button, accountButton || null);
        }
    }

    function syncLauncherState(open) {
        ['englishTranslatorSidebarButton', 'englishTranslatorMobileButton'].forEach(function (id) {
            const button = document.getElementById(id);
            if (!button) return;
            button.setAttribute('aria-expanded', open ? 'true' : 'false');
            button.classList.toggle('is-active', open);
        });
    }

    function openPanel() {
        if (document.body.classList.contains('english-locked')) return;
        buildPanel();
        restoreFocus = document.activeElement;
        if (!input.value.trim() && lastSelection) {
            input.value = lastSelection.slice(0, MAX_TEXT_LENGTH);
            updateCount();
        }
        document.body.classList.add('english-deepl-open');
        panel.setAttribute('aria-hidden', 'false');
        panel.inert = false;
        syncLauncherState(true);
        window.requestAnimationFrame(function () { input.focus({ preventScroll: true }); });
    }

    function closePanel() {
        if (!panel) return;
        document.body.classList.remove('english-deepl-open');
        panel.setAttribute('aria-hidden', 'true');
        panel.inert = true;
        syncLauncherState(false);
        if (requestController) requestController.abort();
        if (restoreFocus && document.contains(restoreFocus)) restoreFocus.focus({ preventScroll: true });
    }

    function captureSelection() {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.rangeCount) return;
        const anchor = selection.anchorNode && (selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement);
        if (!anchor || !anchor.closest('.english-vocabulary') || anchor.closest('[lang="ru"], .english-translator-panel')) return;
        const selected = selection.toString().replace(/\s+/g, ' ').trim();
        if (selected) lastSelection = selected.slice(0, MAX_TEXT_LENGTH);
    }

    function useSelection() {
        captureSelection();
        if (!lastSelection) {
            setStatus('Select English text in the notes first.', 'notice');
            return;
        }
        input.value = lastSelection;
        updateCount();
        setStatus('', '');
        input.focus();
    }

    async function translate() {
        const text = input.value.trim();
        if (!text || text.length > MAX_TEXT_LENGTH || translateButton.disabled) return;
        if (translationCache.has(text)) {
            showTranslation(translationCache.get(text));
            return;
        }

        const auth = window.AlmanionAccount && window.AlmanionAccount.auth
            ? window.AlmanionAccount.auth
            : (typeof firebase !== 'undefined' ? firebase.auth() : null);
        const user = auth && auth.currentUser;
        if (!user) {
            setStatus('Sign in before using DeepL Translate.', 'error');
            return;
        }

        translateButton.disabled = true;
        translateButton.classList.add('is-loading');
        translateButton.textContent = 'Translating…';
        setStatus('', '');
        requestController = new AbortController();
        const timeout = window.setTimeout(function () { requestController.abort(); }, 25000);
        try {
            const idToken = await user.getIdToken(true);
            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'translateEnglish', idToken: idToken, text: text }),
                signal: requestController.signal
            });
            if (!response.ok) throw new Error('The translation service returned HTTP ' + response.status + '.');
            const payload = await response.json();
            if (!payload || payload.success !== true || !payload.translation) {
                throw new Error(payload && payload.error || 'DeepL translation is unavailable.');
            }
            translationCache.set(text, payload.translation);
            showTranslation(payload.translation);
        } catch (error) {
            let message = error && error.name === 'AbortError'
                ? 'The request took too long. Check the connection and try again.'
                : String(error && error.message || 'Could not translate the text.');
            if (/Неизвестное действие|unknown action/i.test(message)) {
                message = 'The DeepL backend has not been deployed yet.';
            }
            setStatus(message.replace(/^Error:\s*/, ''), 'error');
        } finally {
            window.clearTimeout(timeout);
            requestController = null;
            translateButton.classList.remove('is-loading');
            translateButton.textContent = 'Translate';
            updateCount();
        }
    }

    function showTranslation(text) {
        output.textContent = text;
        output.classList.add('has-translation');
        copyButton.hidden = false;
        setStatus('', '');
    }

    async function copyTranslation() {
        const text = output.textContent.trim();
        if (!text || !output.classList.contains('has-translation')) return;
        try {
            await navigator.clipboard.writeText(text);
            setStatus('Translation copied.', 'success');
        } catch (_) {
            setStatus('Could not copy the translation.', 'error');
        }
    }

    function wireResizer(resizer) {
        let startX = 0;
        let startWidth = 0;
        function stopResize(event) {
            document.body.classList.remove('english-translator-resizing');
            if (event && resizer.hasPointerCapture(event.pointerId)) resizer.releasePointerCapture(event.pointerId);
            applyWidth(parseFloat(getComputedStyle(document.body).getPropertyValue('--english-translator-width')), true);
        }
        resizer.addEventListener('pointerdown', function (event) {
            if (MOBILE_QUERY.matches || event.button !== 0) return;
            startX = event.clientX;
            startWidth = panel.getBoundingClientRect().width;
            resizer.setPointerCapture(event.pointerId);
            document.body.classList.add('english-translator-resizing');
        });
        resizer.addEventListener('pointermove', function (event) {
            if (!resizer.hasPointerCapture(event.pointerId)) return;
            applyWidth(startWidth + startX - event.clientX, false);
        });
        resizer.addEventListener('pointerup', stopResize);
        resizer.addEventListener('pointercancel', stopResize);
        resizer.addEventListener('keydown', function (event) {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const current = panel.getBoundingClientRect().width;
            applyWidth(current + (event.key === 'ArrowLeft' ? 24 : -24), true);
        });
    }

    function preferredEnglishVoice() {
        if (!('speechSynthesis' in window)) return null;
        const voices = window.speechSynthesis.getVoices().filter(function (voice) { return /^en(?:-|_)/i.test(voice.lang); });
        return voices.find(function (voice) { return /^en-GB/i.test(voice.lang) && voice.localService; })
            || voices.find(function (voice) { return voice.localService; })
            || voices.find(function (voice) { return /^en-GB/i.test(voice.lang); })
            || voices[0]
            || null;
    }

    function stopSpeech() {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        if (activeSpeechButton) activeSpeechButton.classList.remove('is-speaking');
        activeSpeechButton = null;
    }

    function speakDefinition(button, block) {
        if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
            setStatus('Speech is not supported by this browser.', 'error');
            openPanel();
            return;
        }
        if (activeSpeechButton === button && window.speechSynthesis.speaking) {
            stopSpeech();
            return;
        }
        stopSpeech();
        const line = block.querySelector('.english-definition-line');
        const phrase = String(line && line.textContent || '').replace(/^\s*\d+\.\s*/, '').trim();
        if (!phrase) return;
        const utterance = new SpeechSynthesisUtterance(phrase);
        const voice = preferredEnglishVoice();
        if (voice) utterance.voice = voice;
        utterance.lang = voice && voice.lang || 'en-GB';
        utterance.rate = 0.92;
        utterance.pitch = 1;
        utterance.onend = utterance.onerror = function () {
            button.classList.remove('is-speaking');
            if (activeSpeechButton === button) activeSpeechButton = null;
        };
        activeSpeechButton = button;
        button.classList.add('is-speaking');
        window.speechSynthesis.speak(utterance);
    }

    function addSpeechButtons(root) {
        if (!root || !root.querySelectorAll) return;
        root.querySelectorAll('.english-definition').forEach(function (block) {
            if (block.querySelector('.english-speak-button')) return;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'english-speak-button';
            button.dataset.noReaderSwipe = '';
            button.setAttribute('aria-label', 'Read this definition aloud');
            button.setAttribute('title', 'Listen');
            button.innerHTML = ICON_SPEAKER;
            button.addEventListener('click', function (event) {
                event.stopPropagation();
                speakDefinition(button, block);
            });
            block.appendChild(button);
        });
    }

    function observeAccessState() {
        const observer = new MutationObserver(function () {
            if (document.body.classList.contains('english-locked')) closePanel();
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    function init() {
        applyWidth(safeStoredWidth(), false);
        buildPanel();
        addLaunchers();
        addSpeechButtons(document);
        observeAccessState();
        document.addEventListener('selectionchange', captureSelection);
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && document.body.classList.contains('english-deepl-open')) closePanel();
        });
        window.addEventListener('resize', function () {
            if (!MOBILE_QUERY.matches) applyWidth(safeStoredWidth(), false);
        });
        window.addEventListener('pagehide', stopSpeech);
    }

    window.addEventListener('almanion:content-ready', function (event) {
        addSpeechButtons(event.detail && event.detail.root || document);
        addLaunchers();
    });
    document.addEventListener('DOMContentLoaded', init, { once: true });

    window.AlmanionEnglishTools = {
        openTranslator: openPanel,
        closeTranslator: closePanel,
        addSpeechButtons: addSpeechButtons
    };
}());
