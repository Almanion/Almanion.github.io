#!/usr/bin/env node
'use strict';

const path = require('path');
const Tests = require('./run-tests.js');
const BuildSite = require('./build-site.js');
const ValidateSite = require('./validate-site.js');

function run(root = path.resolve(__dirname, '..')) {
    const output = path.join(root, '_site');
    Tests.run(root);
    const build = BuildSite.build({ root, output });
    const validation = ValidateSite.validate({ root, site: output });
    process.stdout.write(`\nCI verification passed for ${validation.files.length} public files.\n`);
    process.stdout.write(`Artifact ${build.metadata.artifact.sha256} can be traced to ${build.metadata.source.revision}.\n`);
    return { build, validation };
}

if (require.main === module) {
    try {
        run();
    } catch (error) {
        console.error(error && error.stack || error);
        process.exitCode = 1;
    }
}

module.exports = { run };
