'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

// File names are public URLs. The shapes themselves live in the home page sprite.
const sections = [
    ['ph', 'physics', 'Физика'], ['ch', 'chemistry', 'Химия'],
    ['al', 'algebra', 'Математика'], ['geo', 'geometry', 'Геометрия'],
    ['ru', 'russian', 'Русский язык ЕГЭ'], ['lit', 'literature', 'Литература'],
    ['en', 'english', 'English'], ['ph-exam', 'physics-exam', 'Билеты по физике'],
    ['mc', 'matcenter', 'МатЦентр'], ['lik', 'likbez', 'Ликбезы'],
    ['geography', 'geography', 'География'], ['duty', 'duty', 'Дежурство'],
    ['tour', 'tour', 'Турслёт'], ['games', 'games', 'Игры'], ['contests', 'contests', 'Олимпиады']
];

function buildFavicons() {
    const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
    const home = read('index.html');
    const css = read('styles/home-dashboard.css');
    const book = read('images/almanion-wordmark.svg').match(/<path id="book-a"[^>]*\/>/)[0];
    const icons = {};
    for (const [key, symbol, title] of sections) {
        const paths = home.match(new RegExp('<symbol id="academic-' + symbol + '"[^>]*>([\\s\\S]*?)</symbol>'))[1].trim();
        const subject = symbol === 'algebra' ? 'math' : symbol;
        const palette = css.match(new RegExp('data-subject="' + subject + '"[^{}]*\\{\\s*--subject-light: (#[a-f0-9]+); --subject-dark: (#[a-f0-9]+)', 'i'));
        // Games and contests use the site's default indigo accent on the home page.
        const [, light, dark] = palette || [null, '#5147a5', '#a6aaff'];
        for (const night of [false, true]) {
            const color = night ? dark : light;
            const background = night ? '#191922' : '#f8f8fc';
            icons['favicon-' + key + (night ? '-dark' : '') + '.svg'] = [
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28">',
                '  <title>' + title + '</title>',
                '  <rect width="28" height="28" rx="6" fill="' + background + '"/>',
                '  <g transform="translate(2 2)" color="' + color + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">',
                '    ' + paths.replace(/\s*\n\s*/g, '\n    '),
                '  </g>', '</svg>', ''
            ].join('\n');
        }
    }
    for (const [file, x, y, size, radius, background] of [
        ['favicon.svg', -10, -4, 124, 22, '#26253d'],
        ['favicon-dark.svg', -10, -4, 124, 22, '#191922'],
        ['app-icon.svg', -39, -33, 180, 0, '#26253d']
    ]) {
        const dimensions = file === 'app-icon.svg' ? ' width="512" height="512"' : '';
        icons[file] = [
            '<svg xmlns="http://www.w3.org/2000/svg"' + dimensions + ' viewBox="' + [x, y, size, size].join(' ') + '">',
            '  <title>Almanion</title>',
            '  <rect x="' + x + '" y="' + y + '" width="' + size + '" height="' + size + '" rx="' + radius + '" fill="' + background + '"/>',
            '  ' + book, '</svg>', ''
        ].join('\n');
    }
    return icons;
}

if (require.main === module) {
    for (const [file, svg] of Object.entries(buildFavicons())) {
        fs.writeFileSync(path.join(root, 'favicons', file), svg);
    }
}

module.exports = { buildFavicons };
