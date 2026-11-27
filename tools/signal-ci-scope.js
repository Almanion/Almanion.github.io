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
// These assets only feed MatCenter. Its interface and access checks still run
// with the other educational pages.
const matcenterFiles = new Set([
  "matcenter.html", "matcenter/20-auth.js", "matcenter/50-render.js",
  "matcenter/75-print.js", "matcenter/runtime.js",
  "styles/matcenter-refresh.css", "styles/matcenter-print.css",
  "e2e/matcenter-workspace.spec.js", "tests/matcenter-performance.test.js",
]);
// These sources only feed the educational pages. A new or shared path falls
// back to the full suite until its dependencies have been reviewed.
function isReaderFile(file) {
  return adminFiles.has(file) || matcenterFiles.has(file)
    || /^content\/(?:subjects\.json$|[\w-]+\/(?:manifest\.json$|sections\/[\w-]+\.json$))/.test(file)
    || /^(?:physics(?:-10|-exam)?|chemistry(?:-10)?|math|geometry(?:-formulas)?|russian-ege|likbez|literature-10|duty-10-1|offline|contests)\.html$/.test(file)
    || /^(?:script|note-runtime|experimental-reader|search(?:-text)?|offline-library|russian-ege|english-ui|duty|note-filter|experiment-notebook|knowledge-check|bookmarks|print-export|pdf-download)\.js$/.test(file)
    || /^(?:search-index|definition-index)\.json$/.test(file)
    || /^duty\/(?:view|editor)\.js$/.test(file)
    || /^contests(?:-core)?\.js$/.test(file)
    || /^styles\/(?:duty|contests|reader-tools|note-filter|print|knowledge-check|site\/20-layout-content)\.css$/.test(file)
    || /^tools\/build-(?:notes|offline)\.js$/.test(file)
    || /^(?:e2e|tests)\/(?:reader-tools|site-improvements|network-resilience|duty-extra|russian-ege|experiment-notebook|image-viewer|offline-catalogue|contests|reader-study-layout|layout-usability|learning-label|knowledge-tables|note-runtime)\.(?:spec|test)\.js$/.test(file);
}
const routing = new Set([".github/workflows/pages.yml", "tools/signal-ci-scope.js", "tests/signal-ci-scope.test.js", "tools/run-tests.js"]);
const offlineFiles = new Set(["sw.js", "performance/sw-shell.json", "tests/service-worker-resilience.test.js"]);
function isNoteContent(file) {
  return /^content\/[\w-]+\/(?:manifest\.json|sections\/[\w-]+\.json)$/.test(file)
    || /^images\/notes\/.+\.(?:svg|png|jpe?g|webp)$/.test(file);
}
const appearanceFiles = new Set([
  "images/almanion-wordmark.svg", "favicon.ico", "home-stars.js", "tools/build-favicons.js",
  "e2e/appearance.spec.js", "e2e/star-waves.spec.js", "tests/star-waves.test.js", "tests/site-branding.test.js",
  "tests/favicon-theme.test.js", "e2e/profile-cover-motion.spec.js", "e2e/account-profile.spec.js",
  "e2e/profile-textures.spec.js",
]);

function isAppearanceAsset(file) {
  return appearanceFiles.has(file)
    || /^images\/profile-covers\/[\w-]+\.webp$/.test(file)
    || /^favicons\/[\w-]+\.(svg|ico|png)$/.test(file)
    || /^(?:style-new|styles\/(?:[\w-]+\/)*[\w-]+|constructor\/index|watch\/watch|games\/catalog)\.css$/.test(file);
}

function mayReferenceAppearance(file) {
  return file.endsWith(".html") || ["manifest.json", "performance/sw-shell.json", "favicon-theme.js",
    "profile-covers.js", "profile.js", "account.js"].includes(file);
}

// Compare the complete contents of mixed files. A logo revision or its intrinsic
// dimensions can change, but even a one-line change to a handler must remain visible.
function normalizeAppearanceReferences(file, source) {
  if (file === "account.js") {
    return source.replace(/^    const avatarColors = \{\n([^}]+)\n    \};$/m, (block, fields) => {
      const keys = fields.split(",").map(field => field.match(/^\s*([a-z]+): '[А-ЯЁа-яё -]+'\s*$/)?.[1]);
      if (keys.includes(undefined) || new Set(keys).size !== keys.length) return block;
      return "    const avatarColors = {" + keys.sort().join(",") + "};";
    });
  }
  if (file === "profile.js") {
    // Treat only the visibility of the existing caption as presentation.
    const caption = [
      "const caption = document.createElement('span');",
      "caption.className = 'profile-choice-name';",
      "caption.textContent = name;",
      "face.append(caption);",
    ];
    const guard = ["            if (group !== 'color') {",
      ...caption.map(line => "                " + line), "            }"].join("\n");
    return source.replace(guard, caption.map(line => "            " + line).join("\n"));
  }
  if (file === "profile.html") {
    source = source.replace(/((?:account|profile)\.js)\?v=[\w.-]+(?=")/g, "$1");
  }
  if (file === "favicon-theme.js") {
    return source.replace(/^(\s*var ASSET_VERSION = ')[\w.-]+(';\s*)$/m, "$1VERSION$2");
  }
  if (file === "profile-covers.js") {
    // Preserve the existing drawing expressions and the rest of the renderer.
    const art = /^( {8}(?:orbit|hills|waves|eclipse|aurora|contours|terrazzo|ink|garden|signal): `)([^`]*)(`)(?=,?\r?$)/gm;
    const drawingSlot = /^[ \t]*\$\{(?:orbitTracks|contourLines\(\d+, \d+, \d+, \d*\.\d+\))\}(?=[ \t]*\r?$)/gm;
    const pathSlot = /\bd="\$\{(?:riverRoute|signalTrace)\}"/g;
    const otherMarkup = /<(?!\/?(?:defs|linearGradient|radialGradient|stop|rect|g|path|circle|ellipse|image|clipPath|mask|use|pattern)(?=[\s/>]))|\bon[\w:-]+\s*=|javascript\s*:/i;
    return source.replace(art, (original, start, markup, end) => {
      const svg = markup.replace(drawingSlot, "").replace(pathSlot, 'd=""');
      if (svg.includes("$") || otherMarkup.test(svg)) return original;
      const slots = [...(markup.match(drawingSlot) || []), ...new Set(markup.match(pathSlot) || [])]
        .map(slot => slot.trim()).join("");
      return start + "ARTWORK" + slots + end;
    });
  }
  const asset = /(images\/almanion-wordmark\.svg|favicons\/[\w-]+\.(?:svg|png|ico)|(?:favicon-theme|home-stars|profile-covers)\.js|\.css)\?v=[\w.-]+(?=["'])/g;
  const normalized = source.replace(asset, "$1");
  if (!file.endsWith(".html")) return normalized;
  return normalized.replace(/<img\s[^<>]*>/gi, tag => {
    if (!/\balt="Almanion"/.test(tag)) return tag;
    if (!/\bsrc="(?:[^"]*\/)?almanion-wordmark\.svg"/.test(tag)
        && !/\bsrc="data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+"/.test(tag)) return tag;
    return tag.replace(/(\bsrc="data:image\/svg\+xml;base64,)[A-Za-z0-9+/=]+"/, '$1LOGO"')
      .replace(/\b(width|height)="\d+"/g, '$1="SIZE"');
  });
}

function onlyAppearanceReferences(base, file) {
  if (!mayReferenceAppearance(file)) return false;
  const read = revision => execFileSync("git", ["show", revision + ":" + file], {
    encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    return normalizeAppearanceReferences(file, read(base)) === normalizeAppearanceReferences(file, read("HEAD"));
  } catch {
    return false; // A new, deleted or unreadable mixed file needs its normal checks.
  }
}

function classify(files, { known = true, forceCampaign = false, appearanceEdit = () => false } = {}) {
  const changed = files.filter(file => !routing.has(file));
  if (forceCampaign || !known || !changed.length) return { suite: "all", campaign: true };
  if (changed.every(file => isAppearanceAsset(file) || appearanceEdit(file))) {
    return { suite: "appearance", campaign: false };
  }
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
    appearanceEdit: file => onlyAppearanceReferences(base, file),
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
module.exports = { classify, publishedBase, normalizeAppearanceReferences };
