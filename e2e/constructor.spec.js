const { test, expect } = require('@playwright/test');
const installAccount = require('./helpers/constructor-account');

test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.route('**/account.js?*', route => route.fulfill({ contentType: 'text/javascript', body: `(${installAccount.toString()})();` }));
    // Work against synthetic manifests, not existing students' notes.
    await page.route('**/content/chemistry-10/manifest.json?*', route => route.fulfill({ json: { schemaVersion: 1, subject: 'chemistry-10', title: 'Chemistry', sections: [] } }));
});

async function open(page, role = 'owner') {
    await page.goto('/constructor.html?subject=chemistry-10&testRole=' + role);
    await expect(page.locator('#builderShell')).toBeVisible();
    await expect(page.locator('#saveStateText')).toHaveText('Все изменения сохранены');
}

async function create(page, title = 'Test section') {
    await page.locator('#newSectionButton').click();
    await page.locator('#newSectionTitle').fill(title);
    await page.locator('#sectionDialogForm button[type="submit"]').click();
    await expect(page.locator('#sectionTitle')).toHaveValue(title);
}

test('editor creates and reloads a draft, previews it and cannot publish', async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await open(page, 'editor');
    await expect(page.locator('#publishButton')).toBeHidden();
    await create(page);
    await page.locator('#openBlockPickerButton').click();
    await page.locator('[data-create-block="definition"]').click();
    await page.locator('[data-block-field="term"]').fill('Test term');
    await page.getByRole('textbox', { name: 'Определение', exact: true }).fill('Test definition');
    await expect(page.frameLocator('#previewFrame').locator('.definition-box')).toContainText('Test term');
    await expect(page.frameLocator('#previewFrame').locator('.definition-box')).toContainText('Test definition');
    await expect(page.locator('#saveStateText')).toHaveText('Все изменения сохранены');
    await page.screenshot({ path: testInfo.outputPath('constructor-desktop.png') });
    await page.reload();
    await expect(page.locator('[data-block-field="term"]')).toHaveValue('Test term');
    await expect(page.getByRole('textbox', { name: 'Определение', exact: true })).toHaveValue('Test definition');
    const study = page.locator('.builder-block').filter({ has: page.locator('[data-block-field="term"]') }).locator('> .builder-study-options');
    await study.locator('summary').click();
    await study.locator('[data-block-field="studyEnabled"]').selectOption('false');
    await study.locator('[data-block-field="studyTitle"]').fill('Custom study term');
    await study.locator('[data-block-field="studyFormulas"]').selectOption('exclude');
    await expect(page.frameLocator('#previewFrame').locator('.definition-box')).toHaveAttribute('data-kc-ignore', 'true');
    await expect(page.locator('#saveStateText')).toHaveText('Все изменения сохранены');
    await page.reload();
    await study.locator('summary').click();
    await expect(study.locator('[data-block-field="studyEnabled"]')).toHaveValue('false');
    await expect(study.locator('[data-block-field="studyTitle"]')).toHaveValue('Custom study term');
    await expect(study.locator('[data-block-field="studyFormulas"]')).toHaveValue('exclude');
    await page.evaluate(() => window.testCloud.offline = true);
    await page.getByRole('textbox', { name: 'Определение', exact: true }).fill('Offline revision');
    await expect(page.locator('#saveStateText')).toHaveText('Сохранено только на устройстве');
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Определение', exact: true })).toHaveValue('Offline revision');
    await expect(page.locator('#saveStateText')).toHaveText('Все изменения сохранены');
    expect(errors).toEqual([]);
});

test('a delegated editor sends the saved revision, can keep editing and can withdraw the immutable version', async ({ page }) => {
    await open(page, 'editor');
    await create(page, 'Queued section');
    const content = page.locator('[data-block-field="content"]').first();
    await content.fill('Send this exact version');
    await page.getByRole('button', { name: 'Отправить версию' }).click();
    await expect(page.locator('#submitReviewButton')).toBeDisabled();
    await expect(page.locator('#workflowStatus')).toHaveText('На проверке');
    await expect(page.locator('#publishButton')).toBeHidden();
    const submitted = await page.evaluate(() => {
        const [[id, header]] = Object.entries(window.testCloud.read('noteReviewInbox'));
        const record = window.testCloud.read('noteReviewVersions/' + id);
        const files = JSON.parse(record.bundle);
        const section = JSON.parse(files.find(file => file.path.endsWith('/sections/queued-section.json')).content);
        return { id, header, section, baseHash: record.baseHash };
    });
    expect(submitted.header.authorUid).toBe('test-editor');
    expect(submitted.header.status).toBe('pending');
    expect(submitted.baseHash).toBe('none');
    expect(submitted.section.blocks[0].content).toBe('Send this exact version');
    expect(submitted.section.revision).toBe(submitted.header.revision);
    expect(submitted.section.reviewBaseHash).toBeUndefined();

    await content.fill('Later working draft');
    await expect(page.locator('#saveStateText')).toHaveText('Все изменения сохранены');
    await expect(page.locator('#submitReviewButton')).toBeEnabled();
    await page.setViewportSize({ width: 390, height: 750 });
    await page.locator('#reviewOutboxButton').click();
    const outbox = page.getByRole('dialog', { name: 'Мои версии' });
    await expect(outbox.getByRole('link', { name: 'Queued section' })).toBeVisible();
    await outbox.getByRole('button', { name: 'Отозвать версию' }).click();
    await expect(outbox.getByText('Отозвана')).toBeVisible();
    const after = await page.evaluate(id => ({
        status: window.testCloud.read('noteReviewInbox/' + id).status,
        draft: window.testCloud.read('noteDrafts/chemistry-10/queued-section'),
        bundle: window.testCloud.read('noteReviewVersions/' + id).bundle
    }), submitted.id);
    expect(after.status).toBe('withdrawn');
    expect(after.draft.blocks[0].content).toBe('Later working draft');
    expect(JSON.parse(JSON.parse(after.bundle).find(file => file.path.endsWith('/sections/queued-section.json')).content)).toEqual(submitted.section);
});

test('a previously saved draft keeps its original canonical base after the published section changes', async ({ page }) => {
    const id = 'already-published';
    const canonical = {
        schemaVersion: 1, id, subject: 'chemistry-10', title: 'Published section', navTitle: 'Published section',
        order: 1000, revision: 1, updatedAt: 1, createdAt: 1, updatedBy: 'owner', reviewStatus: 'published',
        blocks: [{ id: 'first-block', type: 'paragraph', content: 'First published version' }]
    };
    await page.route('**/content/chemistry-10/manifest.json?*', route => route.fulfill({
        json: { schemaVersion: 1, subject: 'chemistry-10', sections: [{ id }] }
    }));
    await page.route('**/content/chemistry-10/sections/' + id + '.json?*', route => route.fulfill({ json: canonical }));
    await open(page, 'editor');
    const content = page.locator('[data-block-field="content"]').first();
    await content.fill('Editor’s version based on the first publication');
    await expect(page.locator('#saveStateText')).toHaveText('Все изменения сохранены');
    const base = await page.evaluate(id => window.testCloud.read('noteDrafts/chemistry-10/' + id).reviewBaseHash, id);
    expect(base).toMatch(/^[a-f0-9]{64}$/);

    // A canonical update with an earlier clock than the current work must not silently rebase that work on reload.
    canonical.revision = 2;
    canonical.updatedAt = 2;
    canonical.blocks[0].content = 'Second published version';
    await page.reload();
    await expect(content).toHaveValue('Editor’s version based on the first publication');
    await page.getByRole('button', { name: 'Отправить версию' }).click();
    await expect(page.locator('.builder-toast.is-error')).toContainText('На сайте уже другая версия раздела');
    expect(await page.evaluate(id => window.testCloud.read('noteDrafts/chemistry-10/' + id).reviewBaseHash, id)).toBe(base);
    expect(await page.evaluate(() => window.testCloud.read('noteReviewInbox'))).toBeNull();
    await page.locator('#historyButton').click();
    await page.locator('.builder-history-item').filter({ hasText: 'Опубликованная версия' })
        .getByRole('button', { name: 'Восстановить эту версию' }).click();
    await expect(content).toHaveValue('Second published version');
    await content.fill('Editor’s revised text based on the second publication');
    await page.getByRole('button', { name: 'Отправить версию' }).click();
    await expect(page.locator('#workflowStatus')).toHaveText('На проверке');
    expect(await page.evaluate(id => window.testCloud.read('noteDrafts/chemistry-10/' + id).reviewBaseHash, id)).not.toBe(base);
});

test('inline editor saves the current changes and opens the section on its review action', async ({ page }) => {
    const id = 'inline-review';
    const canonical = {
        schemaVersion: 1, id, subject: 'chemistry-10', title: 'Inline section', navTitle: 'Inline section',
        order: 1000, revision: 1, updatedAt: 1, createdAt: 1, updatedBy: 'owner', reviewStatus: 'published',
        blocks: [{ id: 'first-block', type: 'paragraph', content: 'Original inline note' }]
    };
    await page.addInitScript(() => { window.testDefaultRole = 'editor'; });
    await page.route('**/chemistry-10.html', route => route.fulfill({
        contentType: 'text/html',
        body: '<!DOCTYPE html><html lang="ru"><meta charset="utf-8"><body><section class="constructor-content-section" id="inline-review" data-constructor-section="inline-review"><h2>Inline section</h2><p>Original inline note</p></section><script src="/account.js?test=1"></script><script src="/note-editor.js"></script></body></html>'
    }));
    await page.route('**/content/chemistry-10/manifest.json?*', route => route.fulfill({
        json: { schemaVersion: 1, subject: 'chemistry-10', sections: [{ id }] }
    }));
    await page.route('**/content/chemistry-10/sections/' + id + '.json?*', route => route.fulfill({ json: canonical }));
    await page.goto('/chemistry-10.html');
    await page.getByRole('button', { name: 'Редактировать этот раздел' }).click();
    await page.locator('.note-inline-editor [data-field="content"]').fill('Edited inside the note');
    await page.getByRole('button', { name: 'На проверку', exact: true }).click();
    await expect(page).toHaveURL(/constructor\.html\?.*section=inline-review.*review=1/);
    await expect(page.locator('#submitReviewButton')).toBeFocused();
    await expect(page.locator('[data-block-field="content"]').first()).toHaveValue('Edited inside the note');
    expect(await page.evaluate(id => {
        const draft = window.testCloud.read('noteDrafts/chemistry-10/' + id);
        return { text: draft.blocks[0].content, hasBase: /^[a-f0-9]{64}$/.test(draft.reviewBaseHash) };
    }, id)).toEqual({ text: 'Edited inside the note', hasBase: true });
});

test('publication sends the canonical bundle and recovers from a server error', async ({ page }) => {
    await open(page);
    await create(page);
    await page.locator('#submitReviewButton').click();
    let success = false;
    const requests = [];
    await page.route('https://script.google.com/**', async route => {
        requests.push(route.request().postDataJSON());
        await route.fulfill({ json: success ? { success: true, commit: 'test-commit' } : { success: false, error: 'Test publication failure' } });
    });
    await page.locator('#publishButton').click();
    await expect(page.locator('.builder-toast.is-error')).toContainText('Test publication failure');
    await expect(page.locator('#workflowStatus')).toHaveText('На проверке');
    success = true;
    await page.locator('#publishButton').click();
    await expect(page.locator('#workflowStatus')).toHaveText('Сайт обновляется');
    expect(requests).toHaveLength(2);
    const payload = requests[1];
    expect(payload.action).toBe('publishNotes');
    expect(payload.subject).toBe('chemistry-10');
    const section = JSON.parse(payload.files.find(file => file.path.includes('/sections/')).content);
    expect(section.title).toBe('Test section');
    expect(section.reviewStatus).toBe('published');
    expect(section.review).toBeUndefined();
    const manifest = JSON.parse(payload.files.find(file => file.path.endsWith('/manifest.json')).content);
    expect(manifest.sections.some(item => item.id === section.id)).toBe(true);
    await page.reload();
    await expect(page.locator('#workflowStatus')).toHaveText('Сайт обновляется');
    // A second editor has no owner's local tracker, but must see the same
    // pending state for the accepted cloud revision.
    await page.goto('/constructor.html?subject=chemistry-10&testRole=editor');
    await expect(page.locator('#workflowStatus')).toHaveText('Сайт обновляется');
    await page.route('**/content/chemistry-10/sections/' + section.id + '.json?publication=*', route => route.fulfill({ json: section }));
    await page.getByRole('button', { name: 'Проверить публикацию' }).click();
    await expect(page.locator('#workflowStatus')).toHaveText('Опубликовано');
    await expect(page.getByRole('link', { name: 'Открыть на сайте ↗' })).toBeVisible();
});

test('anonymous users cannot open the constructor', async ({ page }) => {
    await page.goto('/constructor.html?testRole=guest');
    await expect(page.locator('#builderShell')).toBeHidden();
    await expect(page.locator('#builderGateText')).toContainText('Войдите');
});

test('first publication detects a failed GitHub build even while the public file is missing', async ({ page }, info) => {
    await page.clock.install();
    await open(page);
    await create(page, 'First publication');
    await page.locator('#submitReviewButton').click();
    let section, available = false;
    let apiChecks = 0;
    await page.route('https://script.google.com/**', async route => {
        const payload = route.request().postDataJSON();
        section = JSON.parse(payload.files.find(file => file.path.includes('/sections/')).content);
        await route.fulfill({ json: { success: true, commit: 'failed-first-commit' } });
    });
    await page.route('**/content/chemistry-10/sections/first-publication.json?publication=*', route => available ? route.fulfill({ json: section }) : route.fulfill({ status: 404, body: 'Not yet deployed' }));
    await page.route('https://api.github.com/repos/Almanion/almanion.github.io/actions/runs?*', route => {
        apiChecks++;
        return route.fulfill({ json: { workflow_runs: [{ name: 'Deploy GitHub Pages', status: 'completed', conclusion: 'failure', html_url: 'https://github.com/Almanion/almanion.github.io/actions/runs/456' }] } });
    });
    await page.locator('#publishButton').click();
    await expect(page.locator('#workflowStatus')).toHaveText('Сайт обновляется');
    await expect(page.locator('#workflowStatus')).toHaveClass(/is-pending/);
    await expect(page.locator('#workflowHint')).not.toContainText('Не удалось проверить');
    expect(apiChecks).toBe(0);
    await page.clock.fastForward(31000);
    await page.getByRole('button', { name: 'Проверить публикацию' }).click();
    await expect(page.locator('#workflowStatus')).toHaveText('Ошибка сборки');
    await expect(page.locator('#workflowStatus')).toHaveClass(/is-failed/);
    await expect(page.locator('[data-section-select="first-publication"] small')).toHaveText('Ошибка сборки');
    await expect(page.locator('[data-section-select="first-publication"] .builder-section-status')).toHaveClass(/is-failed/);
    await expect(page.locator('#workflowHint')).toContainText('сборка сайта завершилась ошибкой');
    await expect(page.getByRole('link', { name: 'Открыть сборку ↗' })).toHaveAttribute('href', /runs\/456$/);
    expect(apiChecks).toBe(1);
    await page.screenshot({ path: info.outputPath('failed-first-publication.png') });
    await page.reload();
    await expect(page.locator('#workflowStatus')).toHaveText('Ошибка сборки');
    available = true;
    await page.getByRole('button', { name: 'Проверить публикацию' }).click();
    await expect(page.locator('#workflowStatus')).toHaveText('Опубликовано');
    await expect(page.locator('#workflowStatus')).toHaveClass(/is-published/);
    await expect(page.locator('[data-section-select="first-publication"] small')).toHaveText('Опубликовано');
    await expect(page.getByRole('link', { name: 'Открыть на сайте ↗' })).toBeVisible();
});

for (const width of [320, 390]) test(`mobile editing keeps add block available and parameters compact at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await open(page);
    await create(page, 'Mobile section');
    await expect(page.locator('.builder-document-parameters')).not.toHaveAttribute('open', '');
    await expect(page.locator('#sectionNavTitle')).toBeHidden();
    await page.locator('#openBlockPickerButton').click();
    await page.locator('[data-create-block="definition"]').click();
    await page.locator('[data-block-field="term"]').fill('Force');
    await page.getByRole('textbox', { name: 'Определение', exact: true }).fill('A test definition');
    await expect(page.locator('#saveStateText')).toHaveText('Все изменения сохранены');
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    const dock = await page.locator('#addBlockDock').boundingBox();
    expect(dock.y).toBeGreaterThanOrEqual(0);
    expect(dock.y + dock.height).toBeLessThanOrEqual(width === 320 ? 568 : 844);
    const count = await page.locator('.builder-block-list > .builder-block').count();
    await page.locator('#openBlockPickerButton').click();
    await page.locator('[data-create-block="paragraph"]').click();
    await expect(page.locator('.builder-block-list > .builder-block')).toHaveCount(count + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThan(2);
});

test('publication response must not overwrite edits made while the server is processing', async ({ page }) => {
    await open(page);
    await create(page, 'Original title');
    await page.locator('#submitReviewButton').click();
    let respond;
    await page.route('https://script.google.com/**', async route => {
        await new Promise(resolve => respond = resolve);
        await route.fulfill({ json: { success: true, commit: 'test-commit' } });
    });
    await page.locator('#publishButton').click();
    await expect.poll(() => Boolean(respond)).toBe(true);
    await page.locator('#sectionTitle').fill('Newer title');
    respond();
    await expect(page.locator('.builder-toast').filter({ hasText: 'GitHub Pages' })).toBeVisible();
    await expect(page.locator('#sectionTitle')).toHaveValue('Newer title');
    await expect(page.locator('#workflowStatus')).toHaveText('Черновик');
});

test('switching sections during publication cannot change the destination or replace the other section', async ({ page }) => {
    await open(page);
    await create(page, 'First section');
    await create(page, 'Second section');
    await page.locator('[data-section-select="first-section"]').click();
    await page.locator('#submitReviewButton').click();
    let respond;
    let payload;
    await page.route('https://script.google.com/**', async route => {
        payload = route.request().postDataJSON();
        await new Promise(resolve => respond = resolve);
        await route.fulfill({ json: { success: true, commit: 'test-commit' } });
    });
    await page.locator('#publishButton').click();
    await expect.poll(() => Boolean(respond)).toBe(true);
    await page.locator('[data-section-select="second-section"]').click();
    respond();
    await expect(page.locator('.builder-toast').filter({ hasText: 'GitHub Pages' })).toBeVisible();
    await expect(page.locator('#sectionTitle')).toHaveValue('Second section');
    await expect(page.locator('#workflowStatus')).toHaveText('Черновик');
    expect(payload.sectionId).toBe('first-section');
    await page.locator('[data-section-select="first-section"]').click();
    await expect(page.locator('#workflowStatus')).toHaveText('Сайт обновляется');
});

test('real remote conflicts do not overwrite either copy and can be resolved explicitly', async ({ page }) => {
    await open(page);
    await create(page);
    await expect(page.locator('#saveStateText')).toHaveText('Все изменения сохранены');
    await page.evaluate(() => {
        const path = 'noteDrafts/chemistry-10/test-section';
        const section = window.testCloud.read(path);
        window.testCloud.write(path, { ...section, title: 'Remote title', revision: section.revision + 10, updatedAt: Date.now() + 10, updatedBy: 'other-editor' });
    });
    await page.locator('#sectionTitle').fill('Local title');
    await expect(page.locator('#saveStateText')).toHaveText('Есть более новая облачная версия');
    expect(await page.evaluate(() => window.testCloud.read('noteDrafts/chemistry-10/test-section').title)).toBe('Remote title');
    await expect(page.locator('#sectionTitle')).toHaveValue('Local title');
    await page.getByRole('button', { name: 'Загрузить облачную' }).click();
    await expect(page.locator('#sectionTitle')).toHaveValue('Remote title');
    await page.locator('#sectionTitle').fill('Resolved title');
    await expect(page.locator('#saveStateText')).toHaveText('Все изменения сохранены');
});

test('opening a subsection cannot steal focus after the user switches fields', async ({ page }) => {
    await open(page);
    await create(page);
    await page.clock.install();
    await page.evaluate(() => {
        document.querySelector('[data-add-subsection="test-section"]').click();
        document.getElementById('newSubsectionNavTitle').focus();
    });
    await page.clock.runFor(50);
    await expect(page.locator('#newSubsectionNavTitle')).toBeFocused();
    await page.locator('#newSubsectionNavTitle').fill('Short title');
    await expect(page.locator('#newSubsectionTitle')).toHaveValue('');
    await page.locator('#newSubsectionTitle').fill('Full title');
    await page.locator('#subsectionDialogForm button[type="submit"]').click();
    await expect(page.locator('#saveStateText')).toHaveText('Все изменения сохранены');
    const saved = await page.evaluate(() => window.testCloud.read('noteDrafts/chemistry-10/test-section').subsections[0]);
    expect(saved.title).toBe('Full title');
    expect(saved.navTitle).toBe('Short title');
});

test('subsections, nesting, type changes and mobile preview preserve the document', async ({ page }, testInfo) => {
    await open(page, 'editor');
    await create(page);
    await page.locator('[data-add-subsection="test-section"]').click();
    await page.locator('#newSubsectionTitle').fill('Full subsection title');
    await page.locator('#newSubsectionNavTitle').fill('Short title');
    await page.locator('#subsectionDialogForm button[type="submit"]').click();
    await page.locator('#openBlockPickerButton').click();
    await page.locator('[data-create-block="definition"]').click();
    await page.locator('[data-block-field="term"]').fill('Force');
    await page.getByRole('textbox', { name: 'Определение', exact: true }).fill('A test definition');
    await page.locator('[data-open-block-picker]').click();
    await page.locator('[data-create-block="paragraph"]').click();
    await page.locator('.builder-child-list [data-block-field="content"]').fill('Nested explanation');
    await page.locator('.builder-block').filter({ has: page.locator('[data-block-field="term"]') }).locator('> .builder-block-head [data-block-type]').selectOption('remark');
    await expect(page.frameLocator('#previewFrame').locator('.remark-box')).toContainText('A test definition');
    await expect(page.frameLocator('#previewFrame').locator('.remark-box')).toContainText('Nested explanation');
    await expect(page.locator('#saveStateText')).toHaveText('Все изменения сохранены');
    const saved = await page.evaluate(() => window.testCloud.read('noteDrafts/chemistry-10/test-section'));
    expect(saved.subsections[0].title).toBe('Full subsection title');
    expect(saved.subsections[0].navTitle).toBe('Short title');
    expect(saved.subsections[0].children.some(block => block.type === 'remark' && block.content.includes('A test definition'))).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#previewToggle').click();
    await expect(page.locator('#previewFrame')).toBeVisible();
    await expect.poll(async () => Math.abs((await page.locator('#builderPreview').boundingBox()).x)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThan(2);
    await page.screenshot({ path: testInfo.outputPath('constructor-mobile.png') });
    await page.locator('#previewCloseButton').click();
    await expect(page.locator('#sectionTitle')).toHaveValue('Full subsection title');
});
