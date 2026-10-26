"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  { minify_sync } = require("terser");
const files = [
  "index.html",
  "style.css",
  "campaign.js",
  "engine.js",
  "view.js",
  "audio.js",
  "development-ui.js",
  "cloud-core.js",
  "persistence.js",
  "account-ui.js",
  "app.js",
];
const embedded = ["cloud-core.js", "persistence.js", "account-ui.js"];
function render(root = path.resolve(__dirname, "..")) {
  const source = path.join(root, "game-source/signal-frontier/src"),
    read = (f) =>
      fs.readFileSync(path.join(source, f), "utf8").replace(/\r\n/g, "\n"),
    out = {};
  for (const file of files) {
    let text = read(file);
    if (file === "app.js")
      text = embedded.map(read).join("\n;\n") + "\n;\n" + text;
    if (file.endsWith(".js"))
      text =
        minify_sync(text, {
          compress: false,
          mangle: false,
          format: { comments: false },
        }).code + "\n";
    else if (file === "style.css")
      text =
        text
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .join("\n") + "\n";
    else if (file === "index.html")
      text = text.replace(
        /^\s*<script src="(?:cloud-core|persistence|account-ui)\.js[^\"]*" defer><\/script>\n/gm,
        "",
      );
    out[file] = text;
  }
  return out;
}
function build(root = path.resolve(__dirname, "..")) {
  const destination = path.join(root, "games/signal-frontier"),
    out = render(root);
  fs.mkdirSync(destination, { recursive: true });
  for (const [file, text] of Object.entries(out))
    fs.writeFileSync(path.join(destination, file), text);
  return out;
}
if (require.main === module) {
  build();
  console.log("Signal Frontier: " + files.length + " production files built.");
}
module.exports = { render, build, files };
