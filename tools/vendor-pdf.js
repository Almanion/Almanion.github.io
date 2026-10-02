'use strict';
// Reproducible copies from the exact versions in package-lock.json.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'vendor', 'pdf');
fs.mkdirSync(out, { recursive: true });
for (const [source, target] of [
    ['pdfmake/build/pdfmake.min.js', 'pdfmake.min.js'],
    ['pdfmake/LICENSE', 'pdfmake-LICENSE.txt'],
    ['mathjax/es5/tex-svg.js', 'tex-svg.js'],
    ['mathjax/LICENSE', 'mathjax-LICENSE.txt']
]) fs.copyFileSync(path.join(root, 'node_modules', source), path.join(out, target));
console.log('PDF dependencies copied from locked packages.');
