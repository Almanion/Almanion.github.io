'use strict';

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './e2e',
    globalSetup: require.resolve('./e2e/global-setup.js'),
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 2 : 1,
    timeout: 30000,
    expect: { timeout: 7000 },
    reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
    use: {
        baseURL: 'http://127.0.0.1:4173',
        browserName: 'chromium',
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure'
    }
});
