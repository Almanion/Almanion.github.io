(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root?.document) { root.AlmanionDefinitions = api; api.init(root); }
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';
    const normalize = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
    function stem(word) {
        if (!/^[а-я]{5,}$/.test(word)) return word;
        // Case/adjective endings only, bounded to a meaningful root. Do not use
        // arbitrary substring matching (e.g. "масса" must not match "массив").
        const root = word.replace(/(?:иями|ями|ами|ого|ему|ыми|ими|иях|ах|ях|ая|яя|ое|ее|ые|ие|ый|ий|ой|ей|ых|их|ую|юю|ою|ею|ом|ем|ов|ев|ам|ям|а|я|ы|и|у|ю|е|о|ь)$/, '');
        return root.length >= 4 ? root : word;
    }
    function find(entries, value) {
        const query = normalize(value);
        if (!query) return [];
        const exact = entries.filter(entry => normalize(entry.term) === query);
        if (exact.length) return exact;
        if (query.length < 3) return [];
        const words = entries.filter(entry => (' ' + normalize(entry.term) + ' ').includes(' ' + query + ' '));
        if (words.length) return words;
        const queryStem = query.split(' ').map(stem).join(' ');
        return entries.filter(entry => (' ' + normalize(entry.term).split(' ').map(stem).join(' ') + ' ').includes(' ' + queryStem + ' '));
    }

    function init(win) {
        const doc = win.document;
        let popup, timer, index, request, generation = 0, current = '', anchor, dismissUntil = 0;
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
        async function loadIndex() {
            if (index) return index;
            if (!request) request = win.fetch('definition-index.json', { signal: AbortSignal.timeout(12000) }).then(response => {
                if (!response.ok) throw new Error('Definition index unavailable');
                return response.json();
            }).then(data => {
                if (data.schemaVersion !== 1 || !Array.isArray(data.entries)) throw new Error('Invalid definition index');
                index = data.entries.filter(entry => typeof entry.term === 'string' && typeof entry.html === 'string' && /^[\w-]+\.html$/.test(entry.page) && typeof entry.id === 'string');
                return index;
            }).finally(() => { request = null; });
            return request;
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
        async function showSelection() {
            if (Date.now() < dismissUntil) return;
            const selected = selection();
            if (!selected) { if (Date.now() >= preserveUntil && !popup?.contains(doc.activeElement)) close(); return; }
            anchor = selected.range;
            if (selected.text === current && popup && !popup.hidden) { position(); return; }
            current = selected.text;
            const turn = ++generation;
            const body = shell(selected.text);
            body.textContent = label('Ищем определение…', 'Looking up definition…'); position();
            let entries, unavailable = false;
            try { entries = await loadIndex(); }
            catch (_) { entries = []; unavailable = true; }
            if (turn !== generation || popup.hidden) return;
            const matches = find(entries.concat(localDefinitions()), selected.text);
            const seen = new Set();
            const unique = matches.filter(entry => { const key = normalize(entry.term) + '\0' + entry.html.replace(/\s+/g, ' '); if (seen.has(key)) return false; seen.add(key); return true; });
            body.replaceChildren();
            if (!unique.length) {
                body.textContent = unavailable ? label('Не удалось проверить весь сайт. Повторить', 'Unable to search the site. Retry') : label('Определение не найдено на сайте', 'No definition found on the site');
                if (unavailable) {
                    const retry = doc.createElement('button'); retry.type = 'button'; retry.textContent = label('Повторить поиск', 'Retry lookup');
                    retry.onclick = () => { current = ''; showSelection(); }; body.append(retry);
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
            position();
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
            clearTimeout(timer); dismissUntil = Date.now() + 1000; close();
        });
        win.addEventListener('pagehide', close);
        api.showSelection = showSelection;
        showSelection();
    }
    const api = { normalize, find, init };
    return api;
});
