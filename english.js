(function () {
    'use strict';

    const OWNER_EMAIL = 'dmb23930@gmail.com';
    const DATA_PATH = 'englishVocabulary/v1';
    const EXPECTED_WORDS = 135;

    const gate = document.getElementById('englishAccessGate');
    const gateKicker = document.getElementById('englishAccessKicker');
    const gateTitle = document.getElementById('englishAccessTitle');
    const gateMessage = document.getElementById('englishAccessMessage');
    const gateAction = document.getElementById('englishAccessAction');
    const contentNodes = Array.from(document.querySelectorAll('[data-english-content]'));

    if (!gate || !gateTitle || !gateMessage || !gateAction) return;

    let auth = null;
    let db = null;
    let currentUser = null;
    let roleRef = null;
    let authGeneration = 0;
    let retry = null;

    function normalizedEmail(user) {
        return String(user && user.email || '').trim().toLowerCase();
    }

    function isOwner(user) {
        return normalizedEmail(user) === OWNER_EMAIL;
    }

    function showGate(state, title, message, actionLabel, action) {
        document.body.classList.add('english-locked');
        gate.hidden = false;
        gate.dataset.state = state;
        gateKicker.textContent = state === 'denied' ? 'Invitation required' : 'Private section';
        gateTitle.textContent = title;
        gateMessage.textContent = message;
        gateAction.hidden = !actionLabel;
        gateAction.textContent = actionLabel || '';
        retry = typeof action === 'function' ? action : null;
        contentNodes.forEach(function (node) { node.hidden = true; });
    }

    function clearVocabulary() {
        document.querySelectorAll('.english-word-list').forEach(function (list) {
            list.replaceChildren();
        });
    }

    function normalizeItems(value) {
        const source = value && value.items;
        const items = source
            ? (Array.isArray(source) ? source.filter(Boolean) : Object.keys(source).map(function (key) { return source[key]; }))
            : [];
        const valid = items.filter(function (item) {
            return item
                && Number.isInteger(Number(item.number))
                && typeof item.term === 'string'
                && typeof item.definition === 'string'
                && typeof item.translationTerm === 'string'
                && typeof item.translation === 'string';
        }).map(function (item) {
            return {
                number: Number(item.number),
                term: item.term.trim(),
                definition: item.definition.trim(),
                translationTerm: item.translationTerm.trim(),
                translation: item.translation.trim()
            };
        }).sort(function (a, b) { return a.number - b.number; });

        const unique = new Set(items.map(function (item) { return item.number; }));
        if (items.length !== EXPECTED_WORDS || unique.size !== EXPECTED_WORDS || items[0]?.number !== 1 || items[items.length - 1]?.number !== EXPECTED_WORDS) {
            throw new Error('Vocabulary dataset is incomplete.');
        }
        return items;
    }

    function makeWordBlock(item) {
        const block = document.createElement('div');
        block.className = 'definition-box english-definition';
        block.id = 'english-word-' + String(item.number).padStart(3, '0');
        block.dataset.wordNumber = String(item.number);

        const line = document.createElement('p');
        line.className = 'english-definition-line';
        const number = document.createElement('span');
        number.className = 'english-word-number';
        number.textContent = String(item.number) + '.';
        const term = document.createElement('strong');
        term.lang = 'en';
        term.textContent = item.term;
        const separator = document.createTextNode(' — ');
        const definition = document.createElement('span');
        definition.lang = 'en';
        definition.textContent = item.definition;
        line.append(number, term, separator, definition);

        const translation = document.createElement('details');
        translation.className = 'english-translation';
        translation.dataset.noReaderSwipe = '';
        const summary = document.createElement('summary');
        summary.textContent = 'Translate';
        const translatedLine = document.createElement('p');
        translatedLine.lang = 'ru';
        const translatedTerm = document.createElement('strong');
        translatedTerm.textContent = item.translationTerm;
        translatedLine.append(translatedTerm, document.createTextNode(' — ' + item.translation));
        translation.append(summary, translatedLine);

        block.append(line, translation);
        return block;
    }

    function renderVocabulary(value) {
        const items = normalizeItems(value);
        document.querySelectorAll('.english-word-list').forEach(function (list) {
            const start = Number(list.dataset.rangeStart);
            const end = Number(list.dataset.rangeEnd);
            const fragment = document.createDocumentFragment();
            items.filter(function (item) { return item.number >= start && item.number <= end; })
                .forEach(function (item) { fragment.appendChild(makeWordBlock(item)); });
            list.replaceChildren(fragment);
        });

        gate.hidden = true;
        contentNodes.forEach(function (node) { node.hidden = false; });
        document.body.classList.remove('english-locked');
        window.dispatchEvent(new CustomEvent('almanion:content-ready', {
            detail: { root: document.getElementById('englishVocabulary') }
        }));
    }

    function showDataError(user, generation) {
        showGate(
            'error',
            'Vocabulary is unavailable',
            'The protected data could not be loaded. Check the connection and try again.',
            'Try again',
            function () { loadVocabulary(user, generation); }
        );
    }

    function loadVocabulary(user, generation) {
        if (!user || generation !== authGeneration) return;
        showGate('loading', 'Loading vocabulary…', 'Your access has been confirmed.', '', null);
        db.ref(DATA_PATH).once('value').then(function (snapshot) {
            if (generation !== authGeneration || currentUser !== user) return;
            if (!snapshot.exists()) throw new Error('Vocabulary data is missing.');
            renderVocabulary(snapshot.val());
        }).catch(function (error) {
            if (generation !== authGeneration || currentUser !== user) return;
            console.error('English vocabulary:', error);
            clearVocabulary();
            showDataError(user, generation);
        });
    }

    function stopRoleListener() {
        if (!roleRef) return;
        try { roleRef.off(); } catch (_) {}
        roleRef = null;
    }

    function checkAccess(user, generation) {
        if (isOwner(user)) {
            loadVocabulary(user, generation);
            return;
        }

        roleRef = db.ref('adminRoles/' + user.uid + '/englishAccess');
        roleRef.on('value', function (snapshot) {
            if (generation !== authGeneration || currentUser !== user) return;
            if (snapshot.val() === true) {
                loadVocabulary(user, generation);
                return;
            }
            clearVocabulary();
            showGate(
                'denied',
                'Access has not been granted',
                'The account ' + normalizedEmail(user) + ' is not on the English section access list.',
                'Open account',
                function () { window.AlmanionAccount?.openAccount(); }
            );
        }, function (error) {
            if (generation !== authGeneration || currentUser !== user) return;
            console.error('English access:', error);
            showGate('error', 'Could not verify access', 'Check the connection and try again.', 'Try again', function () {
                stopRoleListener();
                checkAccess(user, generation);
            });
        });
    }

    function onAuthStateChanged(user) {
        const generation = ++authGeneration;
        currentUser = user || null;
        stopRoleListener();
        clearVocabulary();
        if (!user) {
            showGate(
                'signed-out',
                'Sign in to continue',
                'English is a private section. Use an account that has been granted access.',
                'Sign in',
                function () { window.AlmanionAccount?.openLogin(); }
            );
            return;
        }
        showGate('loading', 'Checking access…', 'Signed in as ' + normalizedEmail(user) + '.', '', null);
        checkAccess(user, generation);
    }

    gateAction.addEventListener('click', function () {
        if (retry) retry();
    });

    try {
        if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined') throw new Error('Firebase is unavailable.');
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        auth = window.AlmanionAccount?.auth || firebase.auth();
        db = window.AlmanionAccount?.database || firebase.database();
        auth.onAuthStateChanged(onAuthStateChanged, function (error) {
            console.error('English auth:', error);
            showGate('error', 'Could not restore the account', 'Refresh the page and try again.', 'Try again', function () { location.reload(); });
        });
    } catch (error) {
        console.error('English section:', error);
        showGate('error', 'Service is unavailable', 'The account service could not be started.', 'Try again', function () { location.reload(); });
    }
}());
