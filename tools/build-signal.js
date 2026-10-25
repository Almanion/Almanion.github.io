"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const source = path.join(root, "game-source/signal-frontier/src");
const destination = path.join(root, "games/signal-frontier");
const files = ["index.html", "style.css", "engine.js", "view.js", "app.js"];
fs.mkdirSync(destination, { recursive: true });
for (const file of files)
  fs.copyFileSync(path.join(source, file), path.join(destination, file));
console.log(`Signal Frontier: ${files.length} files built.`);
