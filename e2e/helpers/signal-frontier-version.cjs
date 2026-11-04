"use strict";
const fs = require("node:fs"), path = require("node:path");
// Keep the stale-page guard tied to the release being built, across upgrades.
const html = fs.readFileSync(path.resolve(__dirname, "../../game-source/signal-frontier/src/index.html"), "utf8");
const match = html.match(/class="edition"[^>]*>[\s\S]*?<span>(\d+\.\d+\.\d+)<\/span>/);
if (!match) throw new Error("Signal Frontier release version is missing from the source home screen");
module.exports = { editionVersion: match[1] };
