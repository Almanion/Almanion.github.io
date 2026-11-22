/* Bundle the campaign into a portable, offline HTML document. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function bundle(formatScript = source => source, formatStyle = source => source) {
    let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const logo = '../../images/almanion-wordmark.svg';
    html = html.replace('src="' + logo + '"', () =>
        'src="data:image/svg+xml;base64,' + Buffer.from(fs.readFileSync(path.resolve(root, logo), 'utf8').replace(/\r\n/g, '\n')).toString('base64') + '"');
    html = html.replace(/<link\b[^>]*>/g, tag => {
        const match = tag.match(/href="(src\/[^"]+)"/);
        if (!match || !tag.includes('stylesheet')) return tag;
        return '<style>\n' + formatStyle(fs.readFileSync(path.join(root, match[1]), 'utf8')) + '\n</style>';
    });
    return html.replace(/<script src="(src\/[^"]+)"><\/script>/g, (_, filename) => {
        const script = fs.readFileSync(path.join(root, filename), 'utf8');
        return '<script>\n' + formatScript(script) + '\n</script>';
    });
}

if (require.main === module) {
    const html = bundle();
    fs.writeFileSync(path.join(root, 'Orbital Courier.html'), html, 'utf8');
    console.log('Built Orbital Courier.html РІР‚вЂќ ' + Buffer.byteLength(html) + ' bytes; zero network dependencies.');
}
module.exports = { bundle };
