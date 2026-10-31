"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  { minify_sync } = require("terser"),
  CleanCSS = require("clean-css");
const esbuild = require("esbuild");
const files = [
  "index.html",
  "style.css",
  "terrain.js",
  "districts.js",
  "campaign.js",
  "recon.js",
  "engine.js",
  "construction.js",
  "support.js",
  "unit-models.js",
  "minimap.js",
  "view.js",
  "audio.js",
  "development-ui.js",
  "cloud-core.js",
  "persistence.js",
  "account-ui.js",
  "selection-ui.js",
  "app.js",
  "renderer-loader.js",
  "babylon-view.js",
  "babylon-LICENSE.txt",
];
const embedded = ["cloud-core.js", "persistence.js", "account-ui.js", "selection-ui.js", "renderer-loader.js"];
function render(root = path.resolve(__dirname, "..")) {
  const source = path.join(root, "game-source/signal-frontier/src"),
    read = (f) =>
      fs.readFileSync(path.join(source, f), "utf8").replace(/\r\n/g, "\n"),
    out = {};
  for (const file of files) {
    if(file === "babylon-LICENSE.txt") {
      out[file]=fs.readFileSync(path.join(source,"../vendor/BABYLON-LICENSE.txt"),"utf8");continue;
    }
    if(file === "babylon-view.js") {
      out[file]="/*! Babylon.js · Apache-2.0 · see babylon-LICENSE.txt */\n"+esbuild.buildSync({entryPoints:[path.join(source,file)],bundle:true,write:false,minify:true,
        format:"esm",platform:"browser",target:["es2020"],legalComments:"eof",logLevel:"silent"}).outputFiles[0].text;
      continue;
    }
    let text = read(file);
    if (file === "campaign.js")
      text =
        read("terrain.js") + "\n;\n" + read("districts.js") + "\n;\n" + text;
    if (file === "engine.js")
      text =
        read("recon.js") + "\n;\n" + read("construction.js") + "\n;\n" + read("support.js") + "\n;\n" + text;
    if (file === "app.js")
      text = embedded.map(read).join("\n;\n") + "\n;\n" + text;
    if (file === "view.js")
      text =
        read("unit-models.js") + "\n;\n" + read("minimap.js") + "\n;\n" + text;
    if (file.endsWith(".js"))
      text =
        minify_sync(text, {
          compress: false,
          mangle: false,
          format: { comments: false },
        }).code + "\n";
    else if (file === "style.css") {
      // Level 1 removes redundant syntax without reordering the cascade.
      const result = new CleanCSS({
        level: { 1: { optimizeBackground: false } },
        rebase: false,
      }).minify(text);
      if (result.errors.length) throw new Error(result.errors.join("; "));
      text = result.styles + "\n";
    } else if (file === "index.html")
      text = text.replace(
        /^\s*<script src="(?:terrain|districts|recon|construction|support|unit-models|minimap|cloud-core|persistence|account-ui|selection-ui|renderer-loader)\.js[^\"]*" defer><\/script>\n/gm,
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
