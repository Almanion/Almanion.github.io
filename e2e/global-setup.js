'use strict';

const path = require('node:path');
const { createServer } = require('../tools/serve-static.js');

module.exports = async function globalSetup() {
    const server = createServer(path.resolve(__dirname, '..', '_site'));
    await new Promise(function (resolve, reject) {
        server.once('error', reject);
        server.listen(4173, '127.0.0.1', function () {
            server.off('error', reject);
            resolve();
        });
    });
    return async function globalTeardown() {
        await new Promise(function (resolve) { server.close(resolve); });
    };
};
