const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1000, height: 1300 } });
        const name = path.resolve(__dirname, '../project-docs/Дорожная_карта_Almanion');
        const review = path.resolve(__dirname, '../test-results/roadmap');
        fs.mkdirSync(review, { recursive: true });
        await page.goto(pathToFileURL(name + '.html').href);
        await page.pdf({
            path: name + '.pdf', printBackground: true, preferCSSPageSize: true,
            displayHeaderFooter: true, headerTemplate: '<span></span>',
            footerTemplate: '<div style="width:100%;font-size:8px;color:#586174;margin:0 17mm 0 20mm;display:flex;justify-content:space-between"><span>Almanion · Дорожная карта проекта · 26.09.2026</span><span class="pageNumber"></span></div>'
        });
        console.log('Screen page geometry:', await page.locator('.sheet').evaluateAll(nodes => nodes.map(el => ({ height: el.getBoundingClientRect().height, scroll: el.scrollHeight }))));
        for (let i = 0; i < 3; i++) await page.locator('.sheet').nth(i).screenshot({ path: path.join(review, `page-${i + 1}.png`) });
        const count = [...fs.readFileSync(name + '.pdf').toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
        console.log('PDF pages:', count);
        if (count !== 3) throw new Error('Expected exactly three PDF pages');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
