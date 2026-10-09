'use strict';

// Migrate an existing table backend without replacing its table handling,
// properties or deployment. Authentication functions come from the main server.
function upgradeMatcenterAuth(source, canonical) {
    const original = String(source).replace(/\r\n/g, '\n');
    const main = String(canonical).replace(/\r\n/g, '\n');
    if (!/const AUTH_VERSION = 2;/.test(original)) throw new Error('Expected the existing v2 backend');
    const owner = main.match(/^const SITE_OWNER_UID = '[^']+';/m);
    if (!owner || !/^const AUTH_VERSION = 3;/m.test(main)) throw new Error('Canonical v3 authentication is missing');
    function authFunction(text, name, next) {
        const start = text.indexOf('function ' + name + '(');
        const end = text.indexOf('function ' + next + '(', start);
        if (start < 0 || end <= start) throw new Error('Missing authentication function: ' + name);
        return text.slice(start, end);
    }
    let updated = original.replace('const AUTH_VERSION = 2;', 'const AUTH_VERSION = 3;')
        .replace(/^const SITE_OWNER_EMAIL = '[^']+';/m, owner[0])
        .replace('accountConfirmation: true,', 'accountConfirmation: true,\n        legacyAuth: false,');
    for (const [name, next] of [['resolveAccess', 'getAccountRole'], ['getAccountRole', 'hasFirebaseMatcenterAdminRole']]) {
        updated = updated.replace(authFunction(updated, name, next), authFunction(main, name, next));
    }
    if (updated.includes('SITE_OWNER_EMAIL') || !updated.includes('const SITE_OWNER_UID')) throw new Error('Owner identity migration is incomplete');
    if (!updated.includes('legacyAuth: false')) throw new Error('Authentication capabilities migration is incomplete');
    return updated;
}

module.exports = { upgradeMatcenterAuth };
