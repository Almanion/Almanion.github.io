'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'apps-script.gs'), 'utf8');
const context = { Date, Set, JSON, Object, Array, String, Number, RegExp, encodeURIComponent };
vm.runInNewContext(source + `
this.publicationHelpers = {
  mergeNoteManifest,
  removeNoteManifestSection,
  validateNoteManifest
};`, context, { filename: 'apps-script.gs' });

const { mergeNoteManifest, removeNoteManifestSection } = context.publicationHelpers;
const subject = 'physics';
const entry = id => ({ id, title: id.toUpperCase(), navTitle: id.toUpperCase(), updatedAt: 1 });
const section = id => ({ id, subject, title: id.toUpperCase(), navTitle: id.toUpperCase(), updatedAt: 10 });
const ids = manifest => Array.from(manifest.sections, item => typeof item === 'string' ? item : item.id);

const original = { schemaVersion: 1, subject, title: 'Physics', sections: [entry('alpha'), entry('beta')] };
const staleFirst = { schemaVersion: 1, subject, title: 'Physics', sections: [entry('alpha'), entry('gamma')] };
const afterFirst = mergeNoteManifest(original, staleFirst, subject, 'gamma', section('gamma'));
assert.deepStrictEqual(ids(afterFirst), ['alpha', 'gamma', 'beta']);

// A second publisher loaded the same old manifest. Its publication must not
// drop gamma, which was committed while the second browser tab was open.
const staleSecond = { schemaVersion: 1, subject, title: 'Physics', sections: [entry('alpha'), entry('delta')] };
const afterSecond = mergeNoteManifest(afterFirst, staleSecond, subject, 'delta', section('delta'));
assert.deepStrictEqual(ids(afterSecond), ['alpha', 'delta', 'gamma', 'beta']);

// A delete request also operates on the manifest read at the locked HEAD.
const afterDelete = removeNoteManifestSection(afterSecond, subject, 'beta');
assert.deepStrictEqual(ids(afterDelete), ['alpha', 'delta', 'gamma']);

assert.ok(
    source.indexOf('readGithubJsonFile(repository, manifestPath, parentSha, token)', source.indexOf('function publishNoteFiles')) !== -1,
    'publication must read the manifest from the locked parent commit'
);
assert.ok(
    source.indexOf('removeNoteManifestSection(currentManifest, subject, sectionId)', source.indexOf('function deleteNoteFiles')) !== -1,
    'deletion must merge against the manifest at the locked parent commit'
);

console.log('note publication tests: ok');
