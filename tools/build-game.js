'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'game-source', 'orbital-courier');
const target = path.join(root, 'games', 'orbital-courier');

function bundle() {
    let html = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
    html = html.replace(/<link\b[^>]*>/g, tag => {
        const match = tag.match(/href="(src\/[^"]+)"/);
        return !match || !tag.includes('stylesheet') ? tag : '<style>\n' + fs.readFileSync(path.join(source, match[1]), 'utf8') + '\n</style>';
    });
    return html.replace(/<script src="(src\/[^"]+)"><\/script>/g,
        (_, file) => '<script>\n' + fs.readFileSync(path.join(source, file), 'utf8') + '\n</script>');
}

function build() {
    execFileSync(process.execPath, [path.join(source, 'tools', 'build.cjs')], { cwd: source, stdio: 'inherit' });
    fs.mkdirSync(target, { recursive: true });
    fs.copyFileSync(path.join(source, 'Orbital Courier.html'), path.join(target, 'index.html'));
    for (const file of ['LICENSE.txt', 'Инструкция.html', 'Экономика.html']) fs.copyFileSync(path.join(source, file), path.join(target, file));
    console.log('Published game build prepared at games/orbital-courier/index.html');
}

if (require.main === module) build();
module.exports = { bundle, build };
