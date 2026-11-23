'use strict';

const { minify_sync } = require('terser');

const readerScripts = new Set(['note-runtime.js', 'english-ui.js', 'knowledge-check.js', 'favicon-theme.js']);

function compileReaderScript(source) {
    return minify_sync(source, { ecma: 2020, format: { comments: /^!/ } }).code + '\n';
}

module.exports = { readerScripts, compileReaderScript };
