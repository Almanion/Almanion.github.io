(function (root) {
    'use strict';

    // DOM text has already been decoded; the index builder decodes its HTML first.
    function plainText(value) {
        return String(value || '')
            .replace(/\\(?:begin|end)\{[^}]+\}/g, ' ')
            .replace(/\\(?:left|right|displaystyle|textstyle|limits)\b/g, '')
            .replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^{}]*)\}/g, '$1')
            .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2')
            .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
            .replace(/\\[a-zA-Z]+\*?/g, ' ')
            .replace(/[{}$]/g, '')
            .replace(/\s*[_^]\s*/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    const searchText = { plainText };
    if (typeof module === 'object' && module.exports) module.exports = searchText;
    else root.AlmanionSearchText = searchText;
}(typeof window !== 'undefined' ? window : globalThis));
