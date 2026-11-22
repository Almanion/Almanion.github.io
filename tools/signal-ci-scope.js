"use strict";
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

// Only known presentation files bypass real-time campaign replays. All engine,
// persistence, pilot and unrecognised changes take the conservative path.
const presentation = new Set([
  "app.js",
  "development-ui.js",
  "selection-ui.js",
  "account-ui.js",
  "index.html",
  "style.css",
  "console.css",
  "view.js",
  "babylon-view.js",
  "renderer-loader.js",
  "minimap.js",
  "audio.js",
  "terrain-art.js",
]);
const tooling = new Set([
  ".github/workflows/pages.yml",
  "tools/signal-ci-scope.js",
  "tests/signal-ci-scope.test.js",
  "tools/build-signal-terrain-art.js",
]);
function classifyPresentation(files) {
  return files.every((file) => {
    if (tooling.has(file)) return true;
    if (file === "e2e/helpers/signal-frontier-version.cjs") return true;
    if (/^(?:game-source\/signal-frontier\/src|games\/signal-frontier)\/assets\/terrain\/(?:manifest\.json|(?:classic|frontier|expedition|highlands|districts|districts-east|cliff)\.webp)$/.test(file)) return true;
    if (file === "game-source/signal-frontier/src/babylon/materials.js") return true;
    if (/^game-source\/signal-frontier\/[^/]+\.md$/.test(file)) return true;
    if (/^(e2e|tests)\/signal-frontier[^/]*\.(spec|test)\.js$/.test(file))
      return true;
    const asset = file.match(
      /^(?:game-source\/signal-frontier\/src|games\/signal-frontier)\/([^/]+)$/,
    );
    return !!asset && presentation.has(asset[1]);
  });
}
// Engine changes still need full campaigns, but their UI regression surface is
// the game and its catalogue, just like presentation changes in the same game.
const simulation = new Set([
  "terrain.js",
  "engine.js",
  "support.js",
  "recon.js",
  "campaign.js",
  "persistence.js",
  "cloud-core.js",
]);
function signalFile(file) {
  if (file === "tests/helpers/signal-frontier-expedition-pilot.cjs")
    return true;
  if (classifyPresentation([file])) return true;
  const asset = file.match(
    /^(?:game-source\/signal-frontier\/src|games\/signal-frontier)\/([^/]+)$/,
  );
  return !!asset && simulation.has(asset[1]);
}
// Admin assets are loaded only by admin.html. Keep their browser, access-rule
// and non-game unit checks without replaying unrelated game campaigns.
const adminFiles = new Set([
  "admin.html", "admin-app.js", "admin-dashboard.js", "admin-dialogs.js",
  "styles/admin.css", "e2e/admin-workspace.spec.js", "e2e/helpers/admin-fixture.cjs",
  "e2e/site.spec.js", "tests/admin-structure.test.js", "tests/admin-login.test.js",
  "tests/analytics-identity.test.js",
]);
// These sources only feed the educational pages. A new or shared path falls
// back to the full suite until its dependencies have been reviewed.
function isReaderFile(file) {
  return adminFiles.has(file)
    || /^content\/(?:subjects\.json$|[\w-]+\/(?:manifest\.json$|sections\/[\w-]+\.json$))/.test(file)
    || /^(?:physics(?:-10|-exam)?|chemistry(?:-10)?|math|geometry(?:-formulas)?|russian-ege|likbez|literature-10|duty-10-1|offline|contests)\.html$/.test(file)
    || /^(?:script|note-runtime|experimental-reader|search(?:-text)?|offline-library|russian-ege|english-ui|duty|note-filter|experiment-notebook|knowledge-check|bookmarks|print-export|pdf-download)\.js$/.test(file)
    || /^(?:search-index|definition-index)\.json$/.test(file)
    || /^duty\/(?:view|editor)\.js$/.test(file)
    || /^contests(?:-core)?\.js$/.test(file)
    || /^styles\/(?:duty|contests|reader-tools|note-filter|print|site\/20-layout-content)\.css$/.test(file)
    || /^tools\/build-(?:notes|offline)\.js$/.test(file)
    || /^(?:e2e|tests)\/(?:reader-tools|site-improvements|network-resilience|duty-extra|russian-ege|experiment-notebook|image-viewer|offline-catalogue|contests)\.(?:spec|test)\.js$/.test(file)
    || file === "matcenter/20-auth.js";
}
const routing = new Set([".github/workflows/pages.yml", "tools/signal-ci-scope.js", "tests/signal-ci-scope.test.js", "tools/run-tests.js"]);
const offlineFiles = new Set(["sw.js", "performance/sw-shell.json", "tests/service-worker-resilience.test.js"]);
function isNoteContent(file) {
  return /^content\/[\w-]+\/(?:manifest\.json|sections\/[\w-]+\.json)$/.test(file)
    || /^images\/notes\/.+\.(?:svg|png|jpe?g|webp)$/.test(file);
}
function classify(files, { known = true, forceCampaign = false } = {}) {
  const changed = files.filter(file => !routing.has(file));
  if (forceCampaign || !known || !changed.length) return { suite: "all", campaign: true };
  if (changed.every(isNoteContent)) return { suite: "content", campaign: false };
  const readerOnly = changed.every(file => isReaderFile(file) || isNoteContent(file));
  if (readerOnly) return { suite: "reader", campaign: false };
  if (changed.every(file => isReaderFile(file) || isNoteContent(file) || offlineFiles.has(file))) return { suite: "web", campaign: false };
  const signalOnly = changed.every(signalFile);
  // Worker changes can affect the games' offline navigation, but do not
  // change a campaign's rules. Keep their normal browser and unit coverage.
  const needsReplay = changed.some(file => !isReaderFile(file) && !isNoteContent(file) && !classifyPresentation([file]) && !offlineFiles.has(file));
  return { suite: signalOnly ? "signal" : "all", campaign: needsReplay };
}
async function publishedBase(env, fetcher = fetch) {
  if (env.SCOPE_BASE) return env.SCOPE_BASE;
  if (!env.GITHUB_REPOSITORY || !env.GITHUB_TOKEN) return "";
  const response = await fetcher(
    `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/pages.yml/runs?branch=main&event=push&status=success&per_page=1`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw new Error(`Cannot read the published baseline (${response.status})`);
  return (await response.json()).workflow_runs?.[0]?.head_sha || "";
}
async function run() {
  let files = [],
    known = false;
  let base = "";
  try {
    base = await publishedBase(process.env);
  } catch (error) {
    console.warn(error.message);
  }
  // Compare all unpublished changes, including commits from cancelled/failed runs.
  // An unknown baseline always requires every check.
  if (/^[0-9a-f]{40}$/i.test(base) && !/^0+$/.test(base)) {
    try {
      try {
        execFileSync("git", ["cat-file", "-e", `${base}^{commit}`], {
          stdio: "ignore",
        });
      } catch {
        execFileSync(
          "git",
          ["fetch", "--no-tags", "--depth=1", "origin", base],
          { stdio: "inherit" },
        );
      }
      files = execFileSync(
        "git",
        ["diff", "--name-only", "--no-renames", "-z", base, "HEAD"],
        { encoding: "utf8" },
      )
        .split("\0")
        .filter(Boolean);
      known = true;
    } catch (error) {
      console.warn("Diff unavailable; using all checks:", error.message);
    }
  }
  const scope = classify(files, {
    known,
    forceCampaign: process.env.SCOPE_FORCE_CAMPAIGN === "true",
  });
  console.log(JSON.stringify({ ...scope, changedFiles: files.length, known }));
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `suite=${scope.suite}\ncampaign=${scope.campaign}\n`,
    );
  return scope;
}
if (require.main === module)
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { classify, publishedBase };
