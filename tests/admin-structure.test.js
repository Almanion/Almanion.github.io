'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'admin-app.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'admin-dashboard.js'), 'utf8');
const dialogs = fs.readFileSync(path.join(root, 'admin-dialogs.js'), 'utf8');

assert.match(html, /admin-dialogs\.js\?v=/);
assert.match(html, /admin-app\.js\?v=/);
assert.doesNotMatch(html, /\/\/ ИНИЦИАЛИЗАЦИЯ[\s\S]{1000}/,
    'the dashboard application must not remain embedded in the HTML document');
assert.doesNotMatch(app + dashboard, /\bwindow\.alert\s*=|(?<!AdminUI\.)\balert\(|(?<!AdminUI\.)\bconfirm\(|(?<!AdminUI\.)\bprompt\(/);
assert.match(dialogs, /role', 'dialog'/);
assert.match(dialogs, /aria-modal/);
assert.match(dialogs, /event\.key === 'Escape'/);
assert.match(dialogs, /event\.key !== 'Tab'/);
assert.match(app, /user\.uid === SITE_OWNER_UID/);
assert.match(dashboard, /user\.uid === SITE_OWNER_UID/);
assert.match(html, /Анонимный профиль[^<]*—[^<]*не гарантированно отдельный человек/);

console.log('admin application structure and dialogs: all tests passed');
