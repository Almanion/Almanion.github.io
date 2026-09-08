'use strict';

const fs = require('fs');
const path = require('path');

function normalizeRule(value) {
    return typeof value === 'boolean' ? String(value) : String(value || '').replace(/\s+/g, ' ').trim();
}

function ruleAt(root, route, access) {
    const node = route.split('/').filter(Boolean).reduce((value, segment) => {
        return value && typeof value === 'object' ? value[segment] : undefined;
    }, root);
    return node && typeof node === 'object' ? node[access] : undefined;
}

function collectAccessRules(node, route, output) {
    if (!node || typeof node !== 'object') return;
    ['.read', '.write'].forEach(access => {
        if (Object.prototype.hasOwnProperty.call(node, access)) {
            output.push({ route: route.join('/'), access, rule: normalizeRule(node[access]) });
        }
    });
    Object.entries(node).forEach(([key, value]) => {
        if (!key.startsWith('.') && value && typeof value === 'object') {
            collectAccessRules(value, route.concat(key), output);
        }
    });
}

function looksPublic(rule) {
    if (rule === 'true') return true;
    if (!rule || rule === 'false') return false;
    // Treat a rule as protected only when authentication is an unconditional
    // leading gate. Everything else is intentionally classified as public so
    // constructs such as `auth == null || ...` cannot slip past the baseline.
    return !/^\(*\s*auth\s*!=\s*null\s*&&/.test(rule);
}

function expectedMap(baseline) {
    const expected = new Map();
    Object.entries(baseline.publicReads || {}).forEach(([route, rule]) => {
        expected.set(route + '|.read', normalizeRule(rule));
    });
    Object.entries(baseline.anonymousWrites || {}).forEach(([route, rule]) => {
        expected.set(route + '|.write', normalizeRule(rule));
    });
    return expected;
}

function audit(rootDir) {
    const projectRoot = path.resolve(rootDir || path.join(__dirname, '..'));
    const baselinePath = path.join(projectRoot, 'security', 'public-access-baseline.json');
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const rulesDocument = JSON.parse(fs.readFileSync(path.join(projectRoot, baseline.rulesFile), 'utf8'));
    const rules = rulesDocument.rules || {};
    const declarations = [];
    collectAccessRules(rules, [], declarations);

    const actual = new Map(
        declarations
            .filter(item => looksPublic(item.rule))
            .map(item => [item.route + '|' + item.access, item.rule])
    );
    const expected = expectedMap(baseline);
    const errors = [];

    if (normalizeRule(rules['.read']) !== 'false' || normalizeRule(rules['.write']) !== 'false') {
        errors.push('Корень Realtime Database должен запрещать чтение и запись по умолчанию.');
    }

    actual.forEach((rule, key) => {
        if (!expected.has(key)) errors.push('Новая незащищённая операция: ' + key.replace('|', ' ') + ' = ' + rule);
        else if (expected.get(key) !== rule) errors.push('Изменилось публичное правило: ' + key.replace('|', ' '));
    });
    expected.forEach((rule, key) => {
        if (!actual.has(key)) errors.push('Baseline устарел или правило стало защищённым: ' + key.replace('|', ' '));
    });

    return { errors, publicRules: Array.from(actual.entries()).map(([key, rule]) => ({ key, rule })) };
}

if (require.main === module) {
    const result = audit(process.argv[2]);
    if (result.errors.length) {
        result.errors.forEach(error => console.error('security:', error));
        process.exitCode = 1;
    } else {
        console.log('security baseline: ' + result.publicRules.length + ' intentional public operations');
    }
}

module.exports = { audit, collectAccessRules, looksPublic, normalizeRule };
