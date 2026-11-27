'use strict';

const { test, expect } = require('@playwright/test');
test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

test('tablet contents overlay preserves reading width and the desktop preference', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1000 });
    await page.goto('/physics-10.html');
    const topic = page.locator('article.exp-reader-current');
    const opener = page.getByRole('button', { name: 'Развернуть меню навигации' });
    const sidebar = page.locator('#sidebar');
    for (const width of [769, 820, 1024]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(opener).toBeVisible();
        const before = await topic.boundingBox();
        expect(before.width).toBeGreaterThan(570);
        await opener.click();
        await expect(sidebar).toHaveJSProperty('inert', false);
        expect(Math.abs((await topic.boundingBox()).width - before.width)).toBeLessThan(2);
        await page.keyboard.press('Escape');
        await expect(opener).toBeFocused();
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(sidebar).toHaveJSProperty('inert', false);
    await page.getByRole('button', { name: 'Свернуть меню навигации' }).click();
    await page.setViewportSize({ width: 820, height: 1000 });
    await opener.click();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(sidebar).toHaveJSProperty('inert', true);
});

test('home searches across subjects on demand, restores focus and opens the exact paragraph', async ({ page }) => {
    const indices = [];
    page.on('request', request => { if (request.url().endsWith('/search-index.json')) indices.push(request.url()); });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const quick = page.getByRole('button', { name: 'Поиск по конспектам' });
    await quick.click();
    await expect(page.locator('#searchInput')).toBeFocused();
    expect(indices).toHaveLength(0);
    await page.keyboard.press('Escape');
    await expect(quick).toBeFocused();
    await page.keyboard.press('Control+k');
    await page.locator('#searchInput').fill('Дальтона');
    const result = page.locator('.search-result-item').filter({ hasText: 'Закон Дальтона' }).first();
    await expect(result).toBeVisible();
    expect(await result.innerText()).not.toMatch(/\\[()[\]]|Дальтонадавление/);
    const target = await result.getAttribute('href');
    await page.locator('#searchInput').fill('Дальтон');
    await expect(result).toBeVisible();
    expect(indices).toHaveLength(1);
    await result.click();
    await expect(page).toHaveURL(target);
});

test('broad searches reveal additional matches without another download', async ({ page }) => {
    let downloads = 0;
    const entries = Array.from({ length: 42 }, (_, i) => ({
        page: 'physics-10.html', id: 'law-' + i, subject: 'Физика', title: 'Закон ' + i, text: 'Закон давления ' + i
    }));
    await page.route('**/search-index.json', route => {
        downloads++;
        return route.fulfill({ json: { schemaVersion: 1, version: 'sample', entries } });
    });
    await page.goto('/');
    await page.locator('#homeSearchOpen').click();
    await page.locator('#searchInput').fill('закон');
    await expect(page.getByRole('option')).toHaveCount(36);
    await page.getByRole('button', { name: 'Показать ещё' }).click();
    await expect(page.getByRole('option')).toHaveCount(42);
    await expect(page.locator('#searchInput')).toHaveAttribute('aria-activedescendant', 'siteSearchOption36');
    expect(downloads).toBe(1);
});

test('homepage search keeps its results while closing and can be reopened mid-fade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    const dialog = page.locator('#homeSearchDialog');
    const input = dialog.locator('input');
    const open = page.locator('#homeSearchOpen');
    await open.click();
    await input.fill('давление');
    await expect(dialog.getByRole('option').first()).toBeVisible();
    await dialog.evaluate(element => Promise.all(element.getAnimations().map(effect => effect.finished)));

    const stayedOpen = await dialog.evaluate(element => {
        const height = element.offsetHeight;
        document.getElementById('homeSearchClose').click();
        const keptResults = element.matches(':modal[data-closing]') && element.offsetHeight === height;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
        return keptResults && !element.hasAttribute('data-closing');
    });
    expect(stayedOpen).toBe(true);
    await expect(input).toBeFocused();
    await expect(dialog.getByRole('option').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();
    await expect(input).toHaveValue('');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.keyboard.press('Control+k');
    await expect(input).toBeFocused();
    expect(await dialog.evaluate(element => {
        document.getElementById('homeSearchClose').click();
        return element.open;
    })).toBe(false);
});

test('the current paragraph starts a scoped session and preserves the custom deck', async ({ page }) => {
    await page.goto('/physics-10.html');
    await page.locator('#knowledgeCheckBtn').click();
    const paragraph = await page.locator('article.exp-reader-current').getAttribute('id');
    await expect(page.locator('#kcReviewOverlay')).toBeVisible();
    const saved = await page.evaluate(() => Object.keys(localStorage).map(key => {
        try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
    }).find(value => Array.isArray(value?.selectedTopicIds)));
    expect(saved.selectedTopicIds).toEqual([paragraph]);
    await page.locator('#kcChooseTopics').click();
    await page.locator('#kcSizeOptions > summary').click();
    await page.locator('[data-limit="15"]').click();
    await page.locator('#kcConfigure').click();
    await expect(page.locator('#kcQuestionTitle')).toBeFocused();
    await page.reload();
    await page.locator('#knowledgeCheckBtn').click();
    await expect(page.locator('#kcReviewOverlay')).toBeVisible();
    await page.locator('#kcChooseTopics').click();
    await expect(page.locator('[data-limit="15"]')).toHaveAttribute('aria-pressed', 'true');
});

const cyclePage = '/physics-10.html#razbor-gazovykh-tsiklov';
const cycleSource = '[data-kc-id="thermo-lesson-rectangle-cycle-calculation"]';

test('tablet learning opens from the toolbar and topic search keeps the selection scoped', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1000 });
    await page.goto(cyclePage);
    const learn = page.locator('.note-reader-controls').getByRole('button', { name: 'Учить', exact: true });
    await expect(learn).toBeInViewport();
    await expect(page.locator('#sidebar')).toHaveJSProperty('inert', true);
    await expect(page.locator('#knowledgeCheckBtn')).toBeHidden();
    await learn.click();
    await expect(page.locator('#kcProgressCopy')).toHaveText('Закреплено 0 из 9');
    await page.getByRole('button', { name: 'Выбрать темы' }).click();
    await expect(page.locator('#kcQuickStart')).toBeHidden();
    await expect(page.locator('#kcTypeOptions')).toHaveJSProperty('open', false);
    expect(await page.locator('#kcDeckList .kc-topic-group').count()).toBeGreaterThan(1);
    await expect(page.locator('#kcSelectChoices details[open]')).toHaveCount(0);
    await page.locator('#kcTopicOptions > summary').click();
    await page.locator('#kcSelectAll').click();
    const search = page.getByRole('searchbox', { name: 'Поиск тем' });
    await search.fill('неизвестная тема');
    await expect(page.getByText('Темы не найдены')).toBeVisible();
    await search.fill('теплота кпд циклов');
    await expect(page.locator('#kcDeckList .kc-deck')).toHaveCount(1);
    await page.locator('#kcSelectAll').click();
    await expect(page.locator('#kcDeckList .kc-deck')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#kcTypesHeading').click();
    await page.locator('#kcTypeList [data-kind="derivation"]').click();
    const count = Number(await page.locator('#kcStartCount').textContent());
    expect(count).toBeGreaterThan(0);
    await page.locator('#kcStart').click();
    await expect(page.locator('#kcProgressCopy')).toHaveText('Закреплено 0 из ' + count);
    await page.keyboard.press('Escape');
    await expect(learn).toBeFocused();
});

test('starting again needs confirmation and cancelling preserves the saved answers and queue', async ({ page }) => {
    await page.goto(cyclePage);
    const launch = page.locator('#knowledgeCheckBtn');
    const session = () => page.evaluate(() => JSON.parse(AlmanionKCStorage.get('kc_session_v3_' + location.pathname)));
    await launch.click();
    await expect(page.locator('#kcFront')).toBeVisible();
    const firstId = (await session()).queue[0].cardId;
    await page.locator('#kcFront').click();
    await page.locator('#kcGrades [data-g="1"]').click();
    await page.locator('#kcPauseBtn').click();
    const saved = await session();
    expect(saved.reviewed).toBe(1);
    await expect(page.locator('#kcResumeSession')).toContainText('Осталось 9 карточек');
    await expect(page.locator('#kcQuickStart')).toBeHidden();
    await page.locator('#kcRestartSession').click();
    await expect(page.locator('#kcStartConfirmation')).toBeVisible();
    expect(await session()).toEqual(saved);
    await page.keyboard.press('Escape');
    await expect(page.locator('#kcRestartSession')).toBeFocused();
    expect(await session()).toEqual(saved);
    await page.reload();
    await launch.click();
    await expect(page.locator('#kcReviewOverlay')).toBeVisible();
    expect((await session()).queue).toEqual(saved.queue);
    await page.locator('#kcPauseBtn').click();
    await page.locator('#kcRestartSession').click();
    await page.locator('#kcConfirmStart').click();
    await expect(page.locator('#kcReviewOverlay')).toBeVisible();
    expect((await session()).reviewed).toBe(0);
    const progress = await page.evaluate(() => JSON.parse(AlmanionKCStorage.get('kc_fsrs_' + location.pathname)));
    expect(progress[firstId].reviewEvents).toHaveLength(1);
});

test('Enter opens the note source, then Return to card resumes the same question', async ({ page }) => {
    await page.goto(cyclePage);
    await page.locator('#knowledgeCheckBtn').click();
    const question = page.locator('#kcQuestion');
    await expect(question).toContainText('Прямоугольный цикл');
    await expect(question).toContainText('Теплота на каждом участке и КПД');
    await expect(page.locator('#kcPromptContext img')).toHaveJSProperty('complete', true);
    await expect(page.locator('#kcBack')).toBeHidden();
    await page.locator('#kcGoToSource').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#kcReviewOverlay')).toBeHidden();
    await expect(page.locator(cycleSource)).toBeFocused();
    await expect(page.locator(cycleSource)).toBeInViewport();
    await page.getByRole('button', { name: 'Вернуться к карточке' }).click();
    await expect(question).toContainText('Прямоугольный цикл');
    await expect(page.locator('#kcBack')).toBeHidden();
    await page.keyboard.press('Space');
    await expect(page.locator('#kcBack')).toBeVisible();
    await expect(page.locator('#kcPromptContext')).toHaveJSProperty('open', false);
});

test.describe('touch study', () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 320, height: 568 } });
    test('bookmarks start on the dialog and only focus search when tapped', async ({ page }) => {
        await page.goto('/physics-10.html');
        const open = page.locator('#expBottomNav').getByRole('button', { name: 'Закладки' });
        await open.tap();
        await expect(page.locator('#bookmarksModal')).toBeFocused();
        const input = page.locator('#bookmarksSearch');
        await expect(input).not.toBeFocused();
        await input.tap();
        await expect(input).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(page.locator('#bookmarksModal')).toBeHidden();
    });

    test('a finger draft can be compared, resumed, erased with a pen and undone', async ({ page, browserName }) => {
        test.skip(browserName !== 'chromium', 'The hardware pen protocol is exercised in Chromium.');
        await page.goto('/physics-10.html');
        const learn = page.locator('#expBottomNav').getByRole('button', { name: 'Учить' });
        await learn.tap();
        const sheet = page.locator('#kcSketch canvas');
        const pad = page.locator('#kcSketch');
        await expect(sheet).toBeVisible();
        await pad.getByRole('button', { name: 'Коралловый' }).tap();
        await sheet.scrollIntoViewIfNeeded();
        const box = await sheet.boundingBox();
        const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        const client = await page.context().newCDPSession(page);
        // Real browser touch and barrel button events exercise pointer capture and compositing.
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...center, x: center.x - 25 }] });
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...center, x: center.x + 25 }] });
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        const pixel = () => sheet.evaluate(el => [...el.getContext('2d').getImageData(el.width >> 1, el.height >> 1, 1, 1).data]);
        const first = await pixel();
        expect(first[3]).toBeGreaterThan(160);
        expect(first[0]).toBeGreaterThan(first[1]);
        for (const [type, button, buttons, offset, force] of [
            ['mousePressed', 'right', 2, -10, 0], ['mousePressed', 'left', 3, -10, .6],
            ['mouseMoved', 'none', 3, 10, .6], ['mouseReleased', 'left', 2, 10, 0], ['mouseReleased', 'right', 0, 10, 0]
        ]) {
            await client.send('Input.dispatchMouseEvent', { type, button, buttons, x: center.x, y: center.y + offset, pointerType: 'pen', force });
        }
        expect((await pixel())[3]).toBe(0);
        await pad.getByRole('button', { name: 'Отменить штрих' }).tap();
        expect(await pixel()).toEqual(first);
        await pad.getByRole('button', { name: 'Вернуть штрих' }).tap();
        expect((await pixel())[3]).toBe(0);
        await pad.getByRole('button', { name: 'Отменить штрих' }).tap();
        await page.setViewportSize({ width: 568, height: 320 });
        await expect.poll(async () => (await pixel())[3]).toBeGreaterThan(160);
        await page.setViewportSize({ width: 320, height: 568 });
        await page.locator('#kcFront').tap();
        await expect(sheet).toBeHidden();
        await pad.getByRole('button', { name: 'Черновик' }).tap();
        expect(await pixel()).toEqual(first);
        await page.locator('#kcPauseBtn').tap();
        await page.reload();
        await learn.tap();
        await expect(page.locator('#kcBack')).toBeVisible();
        await pad.getByRole('button', { name: 'Черновик' }).tap();
        expect(await pixel()).toEqual(first);
        await pad.getByRole('button', { name: 'Очистить черновик' }).tap();
        expect((await pixel())[3]).toBe(0);
        await pad.getByRole('button', { name: 'Отменить штрих' }).tap();
        expect(await pixel()).toEqual(first);
        await page.locator('#kcGrades [data-g="2"]').tap();
        await page.locator('#kcRepeatNow').tap();
        await expect(sheet).toBeVisible();
        expect((await pixel())[3]).toBe(0);
    });

    test('two fingers move and zoom the paper without drawing, scrolling the card or losing ink', async ({ page, browserName }) => {
        test.skip(browserName !== 'chromium', 'Native multi-touch input is sent through Chromium.');
        await page.goto('/physics-10.html');
        const learn = page.locator('#expBottomNav').getByRole('button', { name: 'Учить' });
        await learn.tap();
        const pad = page.locator('#kcSketch');
        const canvas = pad.locator('canvas');
        const reset = pad.getByRole('button', { name: 'Вернуть исходный вид черновика' });
        const undo = pad.getByRole('button', { name: 'Отменить штрих' });
        let center;
        async function locatePaper() {
            await canvas.scrollIntoViewIfNeeded();
            const box = await canvas.boundingBox();
            center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        }
        await locatePaper();
        const client = await page.context().newCDPSession(page);
        const point = (x, y, id = 1) => ({ x: center.x + x, y: center.y + y, id });
        const touch = (type, ...points) => client.send('Input.dispatchTouchEvent', { type, touchPoints: points });
        async function dot(x, y) {
            await touch('touchStart', point(x, y));
            await touch('touchEnd');
        }
        async function movePair(start, end) {
            await touch('touchStart', ...start);
            await touch('touchMove', ...end);
            await touch('touchEnd');
        }
        const opacity = (x, y) => canvas.evaluate((node, offset) => {
            const rect = node.getBoundingClientRect();
            const px = Math.round((.5 + offset.x / rect.width) * node.width);
            const py = Math.round((.5 + offset.y / rect.height) * node.height);
            const pixels = node.getContext('2d').getImageData(px - 1, py - 1, 3, 3).data;
            return Math.max(...pixels.filter((_, index) => index % 4 === 3));
        }, { x, y });
        const scroll = () => page.locator('#kcContent').evaluate(el => [el.scrollTop, window.visualViewport.scale]);
        const initialScroll = await scroll();
        await dot(-14, -12);
        // The original dot sits between the two fingers, off centre.
        await movePair([point(-34, -12), point(6, -12, 2)], [point(-23, 15), point(57, 15, 2)]);
        await expect(reset).toHaveText('200%');
        await expect.poll(() => opacity(17, 15)).toBeGreaterThan(160);
        expect(await opacity(-14, -12)).toBe(0);
        expect(await scroll()).toEqual(initialScroll);
        // Draw on fresh paper beyond the original phone screen.
        const from = [point(-25, 34), point(25, 34, 2)];
        const to = [point(-25, -42), point(25, -42, 2)];
        for (let i = 0; i < 4; i++) await movePair(from, to);
        await dot(0, 0);
        await page.locator('#kcPauseBtn').tap();
        await page.reload();
        await learn.tap();
        await expect(reset).toHaveText('200%');
        await expect.poll(() => opacity(0, 0)).toBeGreaterThan(160);
        await reset.tap();
        await expect(reset).toBeDisabled();
        await expect.poll(() => opacity(-14, -12)).toBeGreaterThan(160);
        // Centring and navigation are not part of the drawing's undo history.
        await undo.tap();
        await expect.poll(() => opacity(-14, -12)).toBeGreaterThan(160);
        await undo.tap();
        await expect(undo).toBeDisabled();
        expect(await opacity(-14, -12)).toBe(0);
        await locatePaper();
        const close = [point(-3, 0), point(3, 0, 2)];
        const wide = [point(-60, 0), point(60, 0, 2)];
        await movePair(close, wide);
        await expect(reset).toHaveText('400%');
        await movePair(wide, close);
        await expect(reset).toHaveText('25%');
        await expect(undo).toBeDisabled();
        await expect(pad.getByRole('button', { name: 'Вернуть штрих' })).toBeEnabled();
        await reset.tap();
        await locatePaper();
        await touch('touchStart', point(-22, 0));
        await touch('touchMove', point(-20, 0));
        await touch('touchStart', point(-20, 0), point(20, 0, 2));
        await touch('touchCancel');
        await expect(undo).toBeDisabled();
        await touch('touchStart', point(-35, 18));
        await touch('touchMove', point(3, 18));
        await touch('touchStart', point(3, 18), point(50, 18, 2));
        await touch('touchEnd');
        await expect.poll(() => opacity(-14, 18)).toBeGreaterThan(160);
        await undo.tap();
        await expect(undo).toBeDisabled();
    });

    test('each pause has its own bubble paths and phases at the faster tempo', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.goto('/physics-10.html');
        await page.locator('#expBottomNav').getByRole('button', { name: 'Учить' }).tap();
        const art = page.locator('#kcManualPause .kc-pause-art');
        const paths = () => art.locator('.kc-bubble-orbit').evaluateAll(els => els.map(el => el.getAttribute('style')));
        await page.locator('#kcPauseBtn').tap();
        await expect(art.locator('.kc-bubble').first()).toHaveCSS('animation-duration', '5s');
        const first = await paths();
        expect(first).toHaveLength(4);
        await page.locator('#kcResumeSession').tap();
        await page.locator('#kcPauseBtn').tap();
        expect(await paths()).not.toEqual(first);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await expect(art.locator('.kc-bubble-orbit').first()).toHaveCSS('animation-name', 'none');
        await expect(art.locator('.kc-bubble').first()).toHaveCSS('animation-name', 'none');
    });

    test('timed confirmations honour the chosen interval and can be turned off during a wait', async ({ page }) => {
        await page.clock.install();
        await page.goto('/physics-10.html');
        const learn = page.locator('#expBottomNav').getByRole('button', { name: 'Учить' });
        await learn.tap();
        await page.locator('#kcPauseBtn').tap();
        await expect(page.locator('#kcPauseValue')).toHaveText('1 мин');
        await page.locator('#kcPauseOptions > summary').tap();
        await page.getByRole('button', { name: '15 с', exact: true }).tap();
        await page.locator('#kcResumeSession').tap();
        await page.locator('#kcFront').tap();
        await page.locator('#kcGrades [data-g="1"]').tap();
        await expect(page.locator('#kcWaitTime')).toBeVisible();
        await expect(page.locator('#kcWaitTime')).toHaveText(/0:1[45]/);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await expect(page.locator('.kc-intermission .kc-bubble').first()).toHaveCSS('animation-name', 'none');
        await page.clock.fastForward(16_000);
        await expect(page.locator('#kcFront')).toBeVisible();
        await page.locator('#kcFront').tap();
        await page.locator('#kcGrades [data-g="2"]').tap();
        await page.locator('#kcDisablePauses').tap();
        await expect(page.locator('#kcFront')).toBeVisible();
        await page.locator('#kcFront').tap();
        await page.locator('#kcGrades [data-g="1"]').tap();
        await expect(page.locator('#kcFront')).toBeVisible();
        await expect(page.locator('#kcWaitTime')).toHaveCount(0);
        await page.goto('/chemistry-10.html');
        await learn.tap();
        await page.locator('#kcPauseBtn').tap();
        await expect(page.locator('#kcPauseValue')).toHaveText('Без пауз');
        await page.locator('#kcPauseOptions > summary').tap();
        await page.getByRole('button', { name: '1 мин', exact: true }).tap();
        await expect(page.locator('#kcPauseValue')).toHaveText('1 мин');
    });
    test('a long answer scrolls under fixed ratings, and a wide equation pans independently', async ({ page }) => {
        await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
        await page.goto(cyclePage);
        // A single TeX line deliberately wider than even a landscape handset.
        await page.locator(cycleSource + ' .derivation-content').evaluate(block => {
            const line = document.createElement('p');
            line.textContent = '\\[\\overbrace{a_1+a_2+a_3+a_4+a_5+a_6+a_7+a_8+a_9+a_{10}+a_{11}+a_{12}+a_{13}+a_{14}+a_{15}}^{S}=0\\]';
            block.append(line);
        });
        const launch = page.locator('#expBottomNav').getByRole('button', { name: 'Учить' });
        await launch.tap();
        await expect(page.locator('#kcPromptContext img')).toBeVisible();
        await page.locator('#kcFront').tap();
        const content = page.locator('#kcContent');
        const answer = page.locator('#kcBack');
        const equation = answer.locator('[data-kc-scrollable]').last();
        const ratings = page.locator('#kcGrades');
        await expect(answer).toBeVisible();
        await expect(page.locator('#kcQuestion')).toBeHidden();
        await expect(answer.locator('.katex-error')).toHaveCount(0);
        await expect(ratings.getByRole('button')).toHaveCount(4);
        await expect(ratings).toBeInViewport({ ratio: 1 });
        await expect(equation).toHaveAttribute('tabindex', '0');
        await equation.scrollIntoViewIfNeeded();
        const offset = await content.evaluate(node => node.scrollTop);
        expect(offset).toBeGreaterThan(200);
        expect(await equation.evaluate(node => {
            node.scrollLeft = node.scrollWidth;
            return node.scrollLeft;
        })).toBeGreaterThan(200);
        expect(await content.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
        await page.locator('#kcPauseBtn').tap();
        await page.locator('#kcResumeSession').tap();
        await expect(answer).toBeVisible();
        await expect.poll(() => content.evaluate(node => node.scrollTop)).toBeGreaterThan(offset - 25);
        await expect(ratings).toBeInViewport({ ratio: 1 });
        await ratings.getByRole('button', { name: /Легко/ }).tap();
        await expect(answer).toBeHidden();
        await expect(content).toHaveJSProperty('scrollTop', 0);
    });
});

test('course navigation follows published sections and browser history', async ({ page }) => {
    await page.goto('/likbez.html');
    const courses = page.getByRole('combobox', { name: 'Курс ликбеза' });
    const names = await courses.locator('option').allTextContents();
    expect(names).toEqual(expect.arrayContaining(['Интеграл Римана', 'Линейная алгебра', 'Теория чисел']));
    await courses.selectOption({ label: 'Линейная алгебра' });
    const algebra = await courses.inputValue();
    await expect(page.locator('article.exp-reader-current')).toHaveAttribute('id', algebra);
    await courses.selectOption({ label: 'Теория чисел' });
    await expect(page.locator('article.exp-reader-current')).toHaveAttribute('id', await courses.inputValue());
    await page.goBack();
    await expect(courses).toHaveValue(algebra);
    await expect(page.locator('article.exp-reader-current')).toHaveAttribute('id', algebra);
});

test('the alphabet jumps to the first matching stress word, above the fold and clear of the toolbar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/russian-ege.html#stress-all');
    const words = page.locator('#stress-all [data-stress-all-grid] > .accent-word-card');
    const alphabet = page.getByRole('combobox', { name: 'Перейти к словам на букву' });
    const actual = await words.evaluateAll(cards => [...new Set(cards.map(c => c.dataset.searchWord[0].toUpperCase()))].sort((a,b) => a.localeCompare(b,'ru')));
    expect(await alphabet.locator('option').allTextContents()).toEqual(['Выбрать букву', ...actual]);
    const count = await words.count();
    await alphabet.selectOption('Ш');
    const first = page.locator('#stress-all [data-search-word^="ш"]').first();
    await expect(first).toBeFocused();
    await expect(first).toBeInViewport();
    expect((await first.boundingBox()).y).toBeGreaterThanOrEqual((await page.locator('.note-reader-controls').boundingBox()).height);
    expect(await words.count()).toBe(count);
});

async function scrollToBottom(page, offset = 0) {
    return page.evaluate(px => {
        const root = document.scrollingElement;
        window.scrollTo({ top: root.scrollHeight - root.clientHeight - px, behavior: 'instant' });
        return window.scrollY;
    }, offset);
}

test('the wheel eases into the next title and needs five steps after reaching the bottom', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.clock.install();
    await page.goto('/physics-10.html#izoprotsessy-gazovye-zakony');
    const current = page.locator('article.exp-reader-current');
    const preview = page.locator('.reader-pull-preview');
    const nextTitle = await page.locator('.exp-reader-footer-next strong').innerText();
    await page.evaluate(() => document.fonts.ready);
    // Keep native wheel events in the same gesture even when trace capture delays input.
    await page.clock.pauseAt(new Date(Date.now() + 2000));
    await scrollToBottom(page, 45);
    await page.mouse.move(850, 845);
    await page.mouse.wheel(0, 120);
    await expect.poll(() => page.evaluate(() => {
        const root = document.scrollingElement;
        return root.scrollHeight - root.scrollTop - root.clientHeight;
    })).toBeLessThanOrEqual(4);
    for (let step = 0; step < 2; step++) {
        await page.clock.runFor(16);
        await page.mouse.wheel(0, 120);
    }
    await expect(preview).toBeHidden();
    await expect(current).toHaveAttribute('id', 'izoprotsessy-gazovye-zakony');

    const origin = await scrollToBottom(page);
    await page.clock.runFor(300); // A new wheel gesture, after the scroll that reached the bottom.
    await page.evaluate(() => {
        const scroll = window.scrollTo.bind(window);
        window.scrollTo = (...args) => {
            window.readerPullScrollBehavior = args[0]?.behavior;
            scroll(...args);
        };
        window.addEventListener('animationstart', event => {
            if (event.target.dataset.noteEntrance === 'pull') {
                window.readerPullDuration = getComputedStyle(event.target).animationDuration;
            }
        });
    });
    await page.mouse.wheel(0, 120);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(origin + 20);
    expect(await page.evaluate(() => window.readerPullScrollBehavior)).toBe('smooth');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveText(nextTitle);
    await expect(current).toHaveAttribute('id', 'izoprotsessy-gazovye-zakony');
    await page.clock.runFor(1510);
    await expect(preview).toBeHidden();
    expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(origin, 0);

    for (let step = 0; step < 4; step++) {
        await page.mouse.wheel(0, 120);
        await page.clock.runFor(32);
    }
    await expect(preview).toBeVisible();
    await expect(current).toHaveAttribute('id', 'izoprotsessy-gazovye-zakony');
    await page.evaluate(() => {
        window.addEventListener('wheel', event => {
            // Deliver the momentum tail in the same burst even when CI is recording a heavy page.
            const target = document.elementFromPoint(event.clientX, event.clientY);
            const tail = new WheelEvent('wheel', { deltaY: 24, bubbles: true, cancelable: true });
            window.readerConsumedMomentum = !target.dispatchEvent(tail);
        }, { once: true, passive: true });
    });
    await page.mouse.wheel(0, 120);
    await expect(current.locator('.topic-title')).toHaveText(nextTitle);
    expect(await page.evaluate(() => window.readerConsumedMomentum)).toBe(true);
    await page.clock.resume();
    await expect.poll(() => page.evaluate(() => window.readerPullDuration)).toBe('0.525s');
});

test('a short tablet topic reveals its successor from the bottom margin with reduced motion', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/physics-10.html');
    const preview = page.locator('.reader-pull-preview');
    const current = page.locator('article.exp-reader-current');
    await expect(current).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.evaluate(() => {
        const root = document.scrollingElement;
        return root.scrollHeight - root.clientHeight;
    })).toBeLessThanOrEqual(4);
    const origin = await scrollToBottom(page);
    const nextTitle = await page.locator('.exp-reader-footer-next strong').innerText();
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 2000));
    await page.mouse.move(410, 1130);
    await page.mouse.wheel(0, 65);
    await expect(preview).toHaveText(nextTitle);
    // Settings can finish loading during the pull and reapply the current reader mode.
    await page.evaluate(() => window.dispatchEvent(new Event('experimental-mode-changed')));
    await expect(preview.locator('strong')).toBeInViewport();
    await expect(preview.locator('strong')).toHaveCSS('transform', 'none');
    await expect(current).toHaveCSS('scale', 'none');
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(origin + 10);
    for (let step = 0; step < 4; step++) {
        await page.clock.runFor(16);
        await page.mouse.wheel(0, 80);
    }
    await expect(current.locator('.topic-title')).toHaveText(nextTitle);
});

test.describe('touch reader', () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
    test('a fresh upward pull at the bottom advances exactly once', async ({ page, browserName }) => {
        test.skip(browserName !== 'chromium', 'Native touch input below uses the Chromium debugging protocol');
        await page.goto('/physics-10.html');
        const current = page.locator('article.exp-reader-current');
        const ids = await page.locator('.main-content .content-section > .topic[id]').evaluateAll(nodes => nodes.map(n => n.id));
        const client = await page.context().newCDPSession(page);
        async function start() {
            const point = await page.evaluate(() => {
                for (let y = innerHeight - 100; y > 180; y -= 12) {
                    for (const x of [40, 120, innerWidth / 2]) {
                        const el = document.elementFromPoint(x, y);
                        if (el?.closest('.main-content') && !el.closest('a,button,input,textarea,select,label,img,table,pre,code,.katex-display')) return { x, y };
                    }
                }
                throw Error('There is no reading area for the touch');
            });
            await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
            return {
                move: dy => client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y - dy }] }),
                end: () => client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
                cancel: () => client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
            };
        }
        async function pull(distance) {
            const drag = await start();
            for (let i = 1; i <= 6; i++) await drag.move(distance * i / 6);
            await drag.end();
        }
        const preview = page.locator('.reader-pull-preview');
        const title = preview.locator('strong');
        await expect(current).toHaveAttribute('id', ids[0]);
        await scrollToBottom(page, 65);
        await pull(285);
        await expect(current).toHaveAttribute('id', ids[0]);
        const origin = await scrollToBottom(page);
        const partial = await start();
        await partial.move(45);
        await expect(title).toHaveText(await page.locator('.exp-reader-footer-next strong').innerText());
        const small = await title.boundingBox();
        await partial.move(150);
        await expect.poll(async () => (await title.boundingBox()).width).toBeGreaterThan(small.width);
        expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(origin + 30);
        await expect(current).toHaveAttribute('id', ids[0]);
        await partial.cancel();
        await expect(preview).toBeHidden();
        expect(Math.abs(await page.evaluate(() => window.scrollY) - origin)).toBeLessThan(3);

        const full = await start();
        await full.move(48);
        await full.move(110);
        await full.move(240);
        await expect(current).toHaveAttribute('id', ids[0]);
        await full.move(255);
        await expect(current).toHaveAttribute('id', ids[1]);
        await full.move(315);
        await full.end();
        await expect(current).toHaveAttribute('id', ids[1]);
        await page.evaluate(last => window.experimentalReader.goToId(last), ids.at(-1));
        await scrollToBottom(page);
        await pull(280);
        await expect(preview).toBeHidden();
        await expect(current).toHaveAttribute('id', ids.at(-1));
    });
});
