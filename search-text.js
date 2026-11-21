(function (root) {
    'use strict';

    const symbols = {
        alpha: 'α', beta: 'β', gamma: 'γ', Gamma: 'Γ', delta: 'δ', Delta: 'Δ',
        epsilon: 'ε', varepsilon: 'ε', eta: 'η', theta: 'θ', lambda: 'λ', mu: 'μ',
        nu: 'ν', pi: 'π', rho: 'ρ', sigma: 'σ', Sigma: 'Σ', tau: 'τ', phi: 'φ',
        varphi: 'φ', chi: 'χ', omega: 'ω', Omega: 'Ω', cdot: '·', times: '×',
        le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈',
        equiv: '≡', pm: '±', to: '→', rightarrow: '→', Rightarrow: '⇒', iff: '⇔',
        infty: '∞', int: '∫', sum: '∑', prod: '∏', partial: '∂', in: '∈',
        subset: '⊂', cup: '∪', cap: '∩', circ: '°', divby: '⋮'
    };
    const scripts = { '_': '₀₁₂₃₄₅₆₇₈₉₊₋', '^': '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻' };

    // The same display text is used for live paragraphs and the published index.
    function plainText(value) {
        return String(value || '')
            .replace(/\\(?:begin|end)\{[^}]+\}/g, ' ')
            .replace(/\\(?:left|right|displaystyle|textstyle|limits)\b/g, '')
            .replace(/\\[()[\]]/g, '')
            .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname|overline|vec)\{([^{}]*)\}/g, '$1')
            .replace(/\\(?:dfrac|tfrac|frac)\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2')
            .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
            .replace(/([_^])(?:\{([\d+-]+)\}|(\d))/g, (_, kind, group, digit) =>
                [...(group || digit)].map(ch => scripts[kind]['0123456789+-'.indexOf(ch)]).join(''))
            .replace(/\\(?:quad|qquad|enspace|hfill)\b|\\[,;:! ]/g, ' ')
            .replace(/\\([a-zA-Z]+)\*?/g, (_, name) => symbols[name] || name)
            .replace(/[{}$]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    const searchText = { plainText };
    if (typeof module === 'object' && module.exports) module.exports = searchText;
    else root.AlmanionSearchText = searchText;
}(typeof window !== 'undefined' ? window : globalThis));
