const assert = require('assert');
const path = require('path');
const { audit, looksPublic } = require('../security/audit-rules');

const root = path.join(__dirname, '..');
const result = audit(root);

assert.deepStrictEqual(result.errors, [], result.errors.join('\n'));
assert.ok(result.publicRules.length > 0, 'the migration baseline must inventory existing public operations');
assert.equal(looksPublic('auth != null && auth.uid === $uid'), false);
assert.equal(looksPublic('(auth != null && auth.uid === $uid)'), false);
assert.equal(looksPublic('auth == null || auth.token.admin === true'), true);
assert.equal(looksPublic('newData.exists() || auth != null'), true);

console.log('firebase public-access baseline: all tests passed');
