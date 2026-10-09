// Some older conditions contain explicit TeX indices/commands without $ delimiters.
// Render only that unambiguous notation; never invent indices for plain "a1" or
// rewrite the spreadsheet, cached description, prose, URLs or code examples.
function findUndelimitedMatcenterMath(source) {
    const text = String(source || '');
    const protectedRanges = Array.from(text.matchAll(/\$\$[\s\S]*?\$\$|\$(?:\\.|[^$])*\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|`[^`]*`|https?:\/\/[^\s<>]+/g), m => [m.index, m.index + m[0].length]);
    const commands = /(?<![A-Za-z0-9_\\])(?:[A-Za-z]{1,3}(?=[_^])|\\(?:alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|rho|sigma|tau|phi|psi|omega|sum|prod|int|infty|frac|dfrac|tfrac|binom|sqrt|mathbb|mathbf|mathrm|mathcal|operatorname)(?![A-Za-z]))/g;
    const argumentCounts = { frac: 2, dfrac: 2, tfrac: 2, binom: 2, sqrt: 1, mathbb: 1, mathbf: 1, mathrm: 1, mathcal: 1, operatorname: 1 };
    function groupEnd(start) {
        if (text[start] !== '{') return -1;
        let depth = 0;
        for (let i = start; i < text.length && i - start < 4096; i++) {
            if (text[i] === '\\') { i++; continue; }
            if (text[i] === '{') depth++;
            if (text[i] === '}' && --depth === 0) return i + 1;
        }
        return -1;
    }
    const results = [];
    let match;
    while ((match = commands.exec(text))) {
        const start = match.index;
        let end = start + match[0].length;
        let valid = true;
        const command = match[0].startsWith('\\') ? match[0].slice(1) : '';
        for (let i = 0; i < (argumentCounts[command] || 0); i++) {
            while (/\s/.test(text[end] || '') && end < text.length) end++;
            const next = groupEnd(end);
            if (next < 0) { valid = false; break; }
            end = next;
        }
        while (valid && /[_^]/.test(text[end] || '') && end < text.length) {
            end++;
            while (/\s/.test(text[end] || '') && end < text.length) end++;
            if (text[end] === '{') {
                const next = groupEnd(end);
                if (next < 0) { valid = false; break; }
                end = next;
            } else if (/[A-Za-z0-9]/.test(text[end] || '')) end++;
            else { valid = false; break; }
        }
        // Do not misinterpret words such as file_name or a_nonsense as formulae.
        if (!valid || /[A-Za-z0-9_]/.test(text[end] || '') || protectedRanges.some(([a, b]) => start < b && end > a)) continue;
        results.push({ start, end, tex: text.slice(start, end) });
        commands.lastIndex = end;
    }
    return results;
}

function renderUndelimitedMatcenterMath(element) {
    if (typeof katex === 'undefined' || typeof katex.render !== 'function' || !element?.ownerDocument) return 0;
    const doc = element.ownerDocument;
    const walker = doc.createTreeWalker(element, 4);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) {
        if (!node.parentElement?.closest('.katex, .katex-error, .mc-legacy-math, script, style, textarea, pre, code, option')) nodes.push(node);
    }
    let count = 0;
    for (const textNode of nodes) {
        const source = textNode.textContent;
        const matches = findUndelimitedMatcenterMath(source);
        if (!matches.length) continue;
        const fragment = doc.createDocumentFragment();
        let offset = 0;
        for (const match of matches) {
            fragment.appendChild(doc.createTextNode(source.slice(offset, match.start)));
            const math = doc.createElement('span');
            math.className = 'mc-legacy-math';
            try {
                katex.render(match.tex, math, { throwOnError: true, trust: false });
                fragment.appendChild(math);
                count++;
            } catch (_) {
                fragment.appendChild(doc.createTextNode(match.tex));
            }
            offset = match.end;
        }
        fragment.appendChild(doc.createTextNode(source.slice(offset)));
        textNode.replaceWith(fragment);
    }
    return count;
}

if (typeof module !== 'undefined') module.exports = { findUndelimitedMatcenterMath };
