(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root?.document) { root.AlmanionDefinitions = api; api.init(root); }
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    const normalize = value => String(value || '').normalize('NFD').replace(/и\u0306/g, 'й').replace(/И\u0306/g, 'Й').replace(/\p{M}/gu, '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
    function stem(word) {
        if (!/^[а-я]{4,}$/.test(word)) return word;
        // Case/adjective endings only, bounded to a meaningful root. Do not use
        // arbitrary substring matching (e.g. "масса" must not match "массив").
        const root = word.replace(/(?:иями|иям|ием|ией|иею|ями|ами|ого|его|ему|ыми|ими|иях|ах|ях|ая|яя|ое|ее|ые|ие|ия|ию|ии|ый|ий|ой|ей|ых|их|ую|юю|ою|ею|ом|ем|ов|ев|ам|ям|а|я|ы|и|у|ю|е|о|ь)$/, '');
        return root.length >= 3 ? root : word;
    }
    function find(entries, value) {
        const query = normalize(value);
        if (!query) return [];
        const exact = entries.filter(entry => normalize(entry.term) === query);
        if (exact.length) return exact;
        if (query.length < 3) return [];
        const queryWords = query.split(' ');
        const rows = entries.map(entry => ({ entry, term: normalize(entry.term), words: normalize(entry.term).split(' ') }));
        const equivalent = (word, term) => word === term || (word.length >= 4 && stem(word) === stem(term));
        const sameTerm = rows.filter(row => row.words.length === queryWords.length && queryWords.every((word, i) => equivalent(word, row.words[i])));
        if (sameTerm.length) return sameTerm.map(row => row.entry);
        // Prefer the complete term ("Молекула") over an exact word occurring
        // inside a longer name ("Эффективный диаметр молекулы").
        const literal = rows.filter(row => (' ' + row.term + ' ').includes(' ' + query + ' '));
        if (literal.length) return literal.map(row => row.entry);
        return rows.filter(row => row.words.some((_, start) => start + queryWords.length <= row.words.length && queryWords.every((word, i) => equivalent(word, row.words[start + i])))).map(row => row.entry);
    }

    const INDEX_CACHE_KEY = 'almanion:public-definitions:v1';
    function validateIndex(data) {
        if (data?.schemaVersion !== 1 || !Array.isArray(data.entries)) throw new Error('Invalid definition index');
        return data.entries.filter(entry => typeof entry.term === 'string' && typeof entry.html === 'string'
            && /^[\w-]+\.html$/.test(entry.page) && !/^(?:english|planner|sport|tour-|duty-)/.test(entry.page)
            && typeof entry.id === 'string');
    }
    function createIndexLoader(win) {
        let index = null, request = null, refreshed = false, refreshAfter = 0;
        try {
            const cached = JSON.parse(win.localStorage.getItem(INDEX_CACHE_KEY) || 'null');
            if (cached && Date.now() - cached.savedAt < 14 * 86400000) index = validateIndex(cached);
        } catch (_) { /* Cache/storage may be unavailable; it is never required. */ }
        async function fetchIndex(url, retry) {
            // AbortSignal.timeout is missing in some Telegram/older mobile WebViews.
            const controller = typeof win.AbortController === 'function' ? new win.AbortController() : null;
            let timer;
            const timeout = new Promise((_, reject) => {
                timer = win.setTimeout(() => { controller?.abort(); reject(new Error('Definition index timed out')); }, 10000);
            });
            try {
                return await Promise.race([timeout, (async () => {
                    const response = await win.fetch(url.href, {
                        ...(controller ? { signal: controller.signal } : {}), cache: retry ? 'reload' : 'default'
                    });
                    if (!response.ok) throw new Error('Definition index unavailable');
                    const data = await response.json();
                    const entries = validateIndex(data);
                    index = entries;
                    // Only the generated public index is stored, never local/private blocks.
                    try { win.localStorage.setItem(INDEX_CACHE_KEY, JSON.stringify({ ...data, entries, savedAt: Date.now() })); } catch (_) {}
                    return entries;
                })()]);
            } finally { win.clearTimeout(timer); }
        }
        function refresh() {
            if (request) return request;
            request = (async () => {
                const url = new URL('definition-index.json', win.location.href);
                try { return await fetchIndex(url, false); }
                catch (_) {
                    // Bypass an old service-worker/CDN response, not an unbounded retry loop.
                    url.searchParams.set('publication', 'definitions');
                    await new Promise(resolve => win.setTimeout(resolve, 250));
                    return await fetchIndex(url, true);
                }
            })().then(entries => { refreshed = true; return entries; }).finally(() => { request = null; refreshAfter = Date.now() + 60000; });
            return request;
        }
        return {
            peek: () => index,
            load: function () {
                if (index) {
                    if (!refreshed && Date.now() >= refreshAfter) refresh().catch(() => {});
                    return Promise.resolve(index);
                }
                return refresh();
            }
        };
    }

    function init(win) {
        const doc = win.document;
        let popup, timer, generation = 0, current = '', anchor, dismissUntil = 0;
        const indexLoader = createIndexLoader(win);
        let preserveUntil = 0;
        const english = doc.documentElement.lang === 'en';
        const label = (ru, en) => english ? en : ru;
        function selection() {
            const selected = win.getSelection();
            if (!selected?.rangeCount || selected.isCollapsed) return null;
            const range = selected.getRangeAt(0);
            const element = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
            if (!element?.closest('.main-content') || element.closest('input, textarea, [contenteditable], .selection-definition-popover, .reader-tool-dialog')) return null;
            const text = selected.toString().trim();
            if (!text || text.length > 100 || text.split(/\s+/).length > 6) return null;
            const rect = Array.from(range.getClientRects()).find(r => r.width && r.height && r.bottom > 0 && r.top < win.innerHeight);
            return rect ? { text, range: range.cloneRange() } : null;
        }
        function close() {
            generation++; current = ''; anchor = null;
            if (popup) popup.hidden = true;
        }
        function create() {
            if (popup) return;
            popup = doc.createElement('aside');
            popup.className = 'selection-definition-popover';
            popup.setAttribute('role', 'region');
            popup.setAttribute('aria-label', label('Определение выделенного слова', 'Selected word definition'));
            popup.hidden = true;
            popup.addEventListener('pointerdown', () => { preserveUntil = Date.now() + 500; });
            popup.addEventListener('click', event => {
                if (event.target.closest('[data-definition-close]')) { dismissUntil = Date.now() + 1000; close(); }
                const link = event.target.closest('[data-definition-source]');
                if (!link) return;
                const url = new URL(link.href);
                if (url.pathname === win.location.pathname && win.experimentalReader?.isActive()) {
                    event.preventDefault();
                    win.experimentalReader.goToId(decodeURIComponent(url.hash.slice(1)), { animate: false });
                    close();
                }
            });
            doc.body.append(popup);
        }
        function shell(text) {
            create(); popup.replaceChildren(); popup.hidden = false;
            const header = doc.createElement('header');
            const title = doc.createElement('strong'); title.textContent = text;
            const button = doc.createElement('button'); button.type = 'button'; button.dataset.definitionClose = '';
            button.setAttribute('aria-label', label('Закрыть определение', 'Close definition')); button.textContent = '×';
            header.append(title, button);
            const body = doc.createElement('div'); body.className = 'selection-definition-body'; body.setAttribute('aria-live', 'polite');
            popup.append(header, body); return body;
        }
        function position() {
            if (!popup || popup.hidden || !anchor) return;
            const rect = Array.from(anchor.getClientRects()).find(r => r.width && r.height && r.bottom > 0 && r.top < win.innerHeight);
            if (!rect) { close(); return; }
            const viewport = win.visualViewport;
            const leftEdge = viewport?.offsetLeft || 0, topEdge = viewport?.offsetTop || 0;
            const width = viewport?.width || win.innerWidth, height = viewport?.height || win.innerHeight;
            const bottom = topEdge + height - (width <= 768 ? 68 : 12);
            popup.style.width = Math.min(430, width - 20) + 'px';
            const below = bottom - rect.bottom - 8, above = rect.top - topEdge - 18;
            const useAbove = below < Math.min(220, above);
            const available = Math.max(90, useAbove ? above : below);
            popup.style.maxHeight = Math.min(height * .55, available) + 'px';
            const size = popup.getBoundingClientRect();
            popup.style.left = Math.max(leftEdge + 10, Math.min(rect.left, leftEdge + width - size.width - 10)) + 'px';
            popup.style.top = Math.max(topEdge + 10, useAbove ? rect.top - size.height - 8 : Math.min(rect.bottom + 8, bottom - size.height)) + 'px';
        }
        function localDefinitions() {
            // Only data already visible to this account. Private vocabulary never
            // enters the generated public index or shared browser storage.
            return Array.from(doc.querySelectorAll('.main-content .definition-box')).flatMap(block => {
                const strong = block.querySelector('strong, b');
                if (!strong) return [];
                const term = strong.textContent.trim().replace(/\s*(?:--|—|:)\s*$/, '');
                const copy = block.cloneNode(true);
                copy.querySelectorAll('button, .personal-note-btn, .bookmark-btn, .copy-block-btn').forEach(el => el.remove());
                if (!/^\s*(?:<p\b[^>]*>\s*)?<(?:strong|b)\b/i.test(copy.innerHTML) || /^(?:определени[ея]|definition|термин|теорема|лемма|свойства|следствие|формула|формулировка)$/i.test(term)) return [];
                return [{ term, html: copy.innerHTML, page: win.location.pathname.split('/').pop(), subject: doc.querySelector('.page-header h1')?.textContent || doc.title, id: block.id || block.closest('[id]')?.id || '' }];
            });
        }
        async function showSelection(keptSelection) {
            if (Date.now() < dismissUntil) return;
            const selected = keptSelection || selection();
            if (!selected) { if (Date.now() >= preserveUntil && !popup?.contains(doc.activeElement)) close(); return; }
            anchor = selected.range;
            if (selected.text === current && popup && !popup.hidden) { position(); return; }
            current = selected.text;
            const turn = ++generation;
            const body = shell(selected.text);
            body.textContent = label('Ищем определение…', 'Looking up definition…'); position();
            const local = localDefinitions();
            const immediate = find((indexLoader.peek() || []).concat(local), selected.text);
            if (immediate.length) {
                renderMatches(immediate, body, false, selected);
                position();
            }
            let entries, unavailable = false;
            try { entries = await indexLoader.load(); }
            catch (_) { entries = []; unavailable = true; }
            if (turn !== generation || popup.hidden) return;
            const matches = find(entries.concat(local), selected.text);
            renderMatches(matches, body, unavailable, selected);
            position();
        }
        function renderMatches(matches, body, unavailable, selected) {
            const seen = new Set();
            const unique = matches.filter(entry => { const key = normalize(entry.term) + '\0' + entry.html.replace(/\s+/g, ' '); if (seen.has(key)) return false; seen.add(key); return true; });
            body.replaceChildren();
            if (!unique.length) {
                body.textContent = unavailable ? label('Словарь сайта пока недоступен', 'The site dictionary is temporarily unavailable') : label('Определение не найдено на сайте', 'No definition found on the site');
                if (unavailable) {
                    const retry = doc.createElement('button'); retry.type = 'button'; retry.textContent = label('Повторить поиск', 'Retry lookup');
                    retry.onclick = () => {
                        const native = win.getSelection();
                        native.removeAllRanges(); native.addRange(selected.range);
                        current = ''; showSelection(selected);
                    }; body.append(retry);
                }
            }
            function append(entry) {
                const article = doc.createElement('article');
                const block = doc.createElement('div'); block.className = 'definition-box';
                win.AlmanionSafeHtml.setHTML(block, entry.html);
                block.querySelectorAll('[id], [data-note-block], [data-kc-id]').forEach(el => { el.removeAttribute('id'); el.removeAttribute('data-note-block'); el.removeAttribute('data-kc-id'); });
                const link = doc.createElement('a'); link.dataset.definitionSource = ''; link.href = entry.page + '#' + encodeURIComponent(entry.id); link.textContent = entry.subject + ' ↗';
                article.append(block, link); body.append(article); win.AlmanionMath?.render(block);
            }
            unique.slice(0, 6).forEach(append);
            if (unique.length > 6) {
                const more = doc.createElement('button'); more.type = 'button'; more.textContent = label('Ещё ', 'More: ') + (unique.length - 6);
                more.onclick = () => { more.remove(); unique.slice(6).forEach(append); position(); }; body.append(more);
            }
        }
        doc.addEventListener('selectionchange', () => { clearTimeout(timer); timer = setTimeout(showSelection, 240); });
        doc.addEventListener('pointerdown', event => { if (popup && !popup.hidden && !popup.contains(event.target)) close(); });
        doc.addEventListener('keydown', event => { if (event.key === 'Escape' && popup && !popup.hidden) { dismissUntil = Date.now() + 1000; close(); } });
        win.addEventListener('scroll', position, { passive: true });
        win.addEventListener('resize', position, { passive: true });
        win.visualViewport?.addEventListener('resize', position, { passive: true });
        win.addEventListener('almanion-account-ready', () => {
            // A private page may replace its content when the account changes.
            // Never leave a snippet from the previous account in the popup.
            // Public notes, however, must not lose a lookup when the delayed
            // initial Auth callback arrives (including a signed-out callback).
            if (!doc.body.classList.contains('english-page')) return;
            clearTimeout(timer); dismissUntil = Date.now() + 1000; close();
        });
        win.addEventListener('pagehide', close);
        api.showSelection = showSelection;
        showSelection();
    }
    const api = { normalize, find, validateIndex, createIndexLoader, INDEX_CACHE_KEY, init };
    return api;
});
