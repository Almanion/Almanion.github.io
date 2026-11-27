'use strict';

const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block', reducedMotion: 'no-preference' });

async function openCovers(page) {
    await page.route('**/__cover-motion.html', route => route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><meta charset="utf-8">
            <link rel="stylesheet" href="/styles/profile-covers.css">
            <style> .cover { width: min(92vw, 960px); height: 200px; } </style>
            <body class="profile-page"><div id="profileCoverArt" class="cover"></div><div id="thumbnail" class="cover"></div>
            <script src="/profile-covers.js"></script>
            <script>
                document.getElementById('profileCoverArt').innerHTML = AlmanionProfileCovers.markup('orbit');
                document.getElementById('thumbnail').innerHTML = AlmanionProfileCovers.markup('orbit');
            </script>`
    }));
    await page.goto('/__cover-motion.html');
    await expect(page.locator('#profileCoverArt .profile-cover-orbit-lane')).toHaveCount(3);
    await expect(page.locator('#profileCoverArt image')).toHaveAttribute('href', 'images/profile-covers/orbit-cel.webp');
}

test('each moon stays round and centered on its own ellipse through a full turn', async ({ page }) => {
    await openCovers(page);
    const lanes = page.locator('#profileCoverArt .profile-cover-orbit-lane');
    for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 568 }]) {
        await page.setViewportSize(viewport);
        const measured = await lanes.evaluateAll(tracks => Promise.all(tracks.map(async lane => {
            const ring = lane.querySelector('ellipse'), moon = lane.querySelector('.profile-cover-satellite');
            const animations = lane.getAnimations({ subtree: true });
            const inverse = ring.getScreenCTM().inverse();
            const results = [];
            for (const step of [0, .043, .137, .254, .417, .588, .743, .897, .998]) {
                for (const animation of animations) {
                    animation.pause();
                    animation.currentTime = animation.effect.getTiming().duration * step;
                }
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                const matrix = moon.getScreenCTM();
                const position = new DOMPoint(0, 0).matrixTransform(matrix).matrixTransform(inverse);
                const ratio = Math.hypot(position.x / ring.rx.baseVal.value, position.y / ring.ry.baseVal.value);
                const scaleX = Math.hypot(matrix.a, matrix.b);
                const scaleY = Math.hypot(matrix.c, matrix.d);
                results.push({ position: [position.x, position.y], ratio, scaleRatio: scaleX / scaleY });
            }
            return { active: animations.length, results };
        })));
        for (const track of measured) {
            expect(track.active).toBe(2);
            for (const sample of track.results) {
                expect(sample.ratio).toBeCloseTo(1, 4);
                expect(sample.scaleRatio).toBeCloseTo(1, 4);
            }
            expect(Math.hypot(...track.results[0].position.map((value, index) => value - track.results[3].position[index]))).toBeGreaterThan(60);
        }
    }
});

test('cover thumbnails stay still and the live cover follows reduced movement settings', async ({ page }) => {
    await openCovers(page);
    const planet = page.locator('#profileCoverArt .profile-cover-orbit-turn').first();
    await expect(planet).toHaveCSS('animation-name', 'profile-cover-revolve');
    await expect(page.locator('#thumbnail .profile-cover-orbit-turn').first()).toHaveCSS('animation-name', 'none');
    await page.evaluate(() => { document.documentElement.dataset.pageMotion = 'medium'; });
    await expect(planet).toHaveCSS('animation-name', 'none');
    await expect(page.locator('#profileCoverArt .profile-cover-shimmer').first()).toHaveCSS('animation-name', 'profile-cover-glow');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('#profileCoverArt .profile-cover-shimmer').first()).toHaveCSS('animation-name', 'none');
});

test('each illustrated cover has live motion while the plain cover stays still', async ({ page }) => {
    await openCovers(page);
    const artwork = await page.locator('#profileCoverArt').evaluate(cover => {
        const { entries, markup } = window.AlmanionProfileCovers;
        return Object.keys(entries).map(id => {
            cover.innerHTML = markup(id);
            return [id, cover.getAnimations({ subtree: true }).length];
        });
    });
    expect(artwork.filter(([id]) => id !== 'plain').every(([, count]) => count > 0)).toBe(true);
    expect(artwork.find(([id]) => id === 'plain')).toEqual(['plain', 0]);
});

test('illustrated covers load and animate their own layers only in the live preview', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCovers(page);
    const live = page.locator('#profileCoverArt');
    for (const [id, image, layer, name, property = 'transform'] of [
        ['terrazzo', 'terrazzo-cel.webp', '.profile-cover-lustre', 'profile-cover-lustre'],
        ['waves', 'waves-detailed.webp', '.profile-cover-swell', 'profile-cover-swell'],
        ['aurora', 'aurora-cel.webp', '.profile-cover-veil', 'profile-cover-fold'],
        ['contours', null, '.profile-cover-contour-pulse', 'profile-cover-contour-light', 'opacity'],
        ['ink', null, '.profile-cover-ink-spread', 'profile-cover-ink-wetting', 'stroke-dashoffset'],
        ['garden', null, '.profile-cover-leaf-open', 'profile-cover-leaf-unfurl']
    ]) {
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        const download = image
            ? page.waitForResponse(response => response.url().endsWith('/images/profile-covers/' + image))
            : null;
        await live.evaluate((element, preset) => {
            const markup = window.AlmanionProfileCovers.markup;
            element.innerHTML = markup(preset);
            document.getElementById('thumbnail').innerHTML = markup(preset);
        }, id);
        if (download) expect((await download).ok()).toBe(true);
        else await expect(live.locator("svg image")).toHaveCount(0);
        await expect(live.locator('svg')).toHaveAttribute('preserveAspectRatio', 'xMidYMid slice');

        const animated = live.locator(layer).first();
        await expect(animated).toHaveCSS('animation-name', name);
        await expect(page.locator('#thumbnail ' + layer).first()).toHaveCSS('animation-name', 'none');
        const frames = await animated.evaluate(async (element, cssProperty) => {
            const animation = element.getAnimations()[0];
            animation.pause();
            await animation.ready;
            const { delay, duration } = animation.effect.getTiming();
            return [.03, .13, .53, .83].map(phase => {
                animation.currentTime = delay + duration * (2 + phase);
                return getComputedStyle(element).getPropertyValue(cssProperty);
            });
        }, property);
        expect(new Set(frames).size).toBeGreaterThan(1);

        await live.evaluate(element => element.setAttribute('data-cover-paused', ''));
        await expect(animated).toHaveCSS('animation-play-state', 'paused');
        await live.evaluate(element => element.removeAttribute('data-cover-paused'));
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await expect(animated).toHaveCSS('animation-name', 'none');
    }
});

test('the eclipse moves the moon across a stationary sun and aligns both discs at midpass', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCovers(page);
    const live = page.locator('#profileCoverArt');
    await live.evaluate(element => { element.innerHTML = window.AlmanionProfileCovers.markup('eclipse'); });

    const moon = live.locator('.profile-cover-eclipse-moon');
    const corona = live.locator('.profile-cover-eclipse-corona');
    await expect(moon).toHaveCSS('animation-name', 'profile-cover-eclipse-pass');
    await expect(corona).toHaveCSS('animation-name', 'profile-cover-corona-shift');
    const [rise, center, set] = await moon.evaluate(async element => {
        const sun = element.closest('svg').querySelector('.profile-cover-eclipse-sun');
        const motion = element.getAnimations()[0];
        motion.pause();
        await motion.ready;
        const { delay, duration } = motion.effect.getTiming();
        return [0, .5, .99].map(fraction => {
            motion.currentTime = delay + duration * (2 + fraction);
            const { x, y } = new DOMPoint().matrixTransform(element.getScreenCTM()).matrixTransform(sun.getScreenCTM().inverse());
            return [x, y];
        });
    });
    expect(rise[0]).toBeLessThan(-15);
    expect(rise[1]).toBeGreaterThan(4);
    expect(center[0]).toBeCloseTo(0);
    expect(center[1]).toBeCloseTo(0);
    expect(set[0]).toBeGreaterThan(15);
    expect(set[1]).toBeLessThan(-4);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(moon).toHaveCSS('animation-name', 'none');
    await expect(corona).toHaveCSS('animation-name', 'none');
});
