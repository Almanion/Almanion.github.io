const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

for (const palette of ['prism', 'graphite']) for (const dark of [false, true]) {
    test(`readable labels and status colors: ${palette} ${dark}`, async ({ page }, testInfo) => {
        await page.goto('/physics.html');
        const failures = await page.evaluate(({ palette, dark }) => {
            document.body.className = `experimental exp-${palette}${dark ? ' exp-dark' : ''}`;
            const css = getComputedStyle(document.body);
            const rgb = hex => hex.trim().replace('#', '').match(/../g).map(x => parseInt(x, 16));
            const luminance = a => a.map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((sum, x, i) => sum + x * [.2126,.7152,.0722][i], 0);
            const ratio = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
            const color = name => rgb(css.getPropertyValue(name));
            const failures = [];
            for (const bg of ['--exp-bg','--exp-surface','--exp-surface-2','--exp-accent-soft']) {
                for (const ink of ['--exp-text','--exp-text-dim','--exp-text-faint']) {
                    const r = ratio(color(ink),color(bg));
                    if (r < 4.5) failures.push(`${ink} on ${bg}: ${r.toFixed(2)}`);
                }
            }
            for (const name of ['definition','theorem','lemma','statement','corollary','example','formula','proof','derivation','experiment','exercise','properties','system','remark','reminder']) {
                const ink = color('--t-' + name);
                const bg = color('--exp-surface').map((x,i) => x*.86 + ink[i]*.14);
                const r = ratio(ink,bg);
                if (r < 4.5) failures.push(`chip ${name}: ${r.toFixed(2)}`);
            }
            for (const name of ['success','warning','error']) {
                const ink = color('--' + name + '-color');
                const bg = color('--exp-surface-2').map((x,i) => x*.86 + ink[i]*.14);
                const r = ratio(ink,bg);
                if (r < 4.5) failures.push(`status ${name}: ${r.toFixed(2)}`);
            }
            return failures;
        }, { palette, dark });
        expect(failures).toEqual([]);
        await page.locator('.definition-box').first().screenshot({ path: testInfo.outputPath('definition.png') });
    });
}

test('custom page buttons use a readable foreground in dark themes', async ({ page }) => {
    for (const [path, prefix] of [['duty-10-1.html','duty'],['tour-10-1.html','tour'],['planner.html','planner'],['sport.html','planner']]) {
        await page.goto('/' + path);
        for (const dark of [false, true]) {
            const value = await page.evaluate(({ prefix, dark }) => {
                document.body.classList.add('experimental','exp-prism');
                document.body.classList.toggle('exp-dark',dark);
                return getComputedStyle(document.body).getPropertyValue('--' + prefix + '-on-accent').trim();
            }, { prefix, dark });
            expect(value).toBe(dark ? '#16161f' : '#fff');
        }
    }
});

test('constructor faint text remains readable on every panel', async ({ page }) => {
    await page.goto('/constructor.html');
    const failures = await page.evaluate(() => {
        const rgb = hex => hex.trim().replace('#','').match(/../g).map(x=>parseInt(x,16)/255);
        const lum = hex => rgb(hex).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
        const failures=[];
        for(const palette of ['prism','graphite']) for(const theme of ['light','dark']) {
            document.documentElement.dataset.palette=palette;
            document.documentElement.dataset.theme=theme;
            const css=getComputedStyle(document.documentElement);
            for(const bg of ['bg','panel','panel-soft','panel-raised','accent-soft']) {
                const a=lum(css.getPropertyValue('--builder-faint')),b=lum(css.getPropertyValue('--builder-'+bg));
                const r=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
                if(r<4.5)failures.push(`${palette} ${theme} ${bg}: ${r.toFixed(2)}`);
            }
        }
        return failures;
    });
    expect(failures).toEqual([]);
});

test('admin status colors remain defined without the shared token stylesheet', async ({ page }) => {
    await page.goto('/admin.html');
    const colors = await page.evaluate(() => {
        document.body.className = 'admin-page experimental exp-prism';
        const css = getComputedStyle(document.body);
        return ['success','warning','danger'].map(name => css.getPropertyValue('--' + name).trim());
    });
    expect(colors).toEqual(['#116b32','#8a4f00','#b91c1c']);
});
