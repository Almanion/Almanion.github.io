'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const admin = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
const emailInput = admin.match(/<input\b[^>]*\bid=["']loginEmail["'][^>]*>/i);

assert.ok(emailInput, 'admin login email field is missing');
assert.doesNotMatch(emailInput[0], /\bvalue\s*=/i, 'admin email must not be prefilled in markup');
assert.doesNotMatch(emailInput[0], /dmb23930@gmail\.com/i, 'owner email must not be shown as a placeholder');
assert.match(emailInput[0], /\bautocomplete=["']email["']/i, 'browser email autofill must remain enabled');

console.log('admin login: all tests passed');
