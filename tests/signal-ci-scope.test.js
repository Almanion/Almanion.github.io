"use strict";
const assert = require("node:assert/strict");
const { classify } = require("../tools/signal-ci-scope");
const ui = [
  "game-source/signal-frontier/src/app.js",
  "game-source/signal-frontier/src/minimap.js",
  "game-source/signal-frontier/src/babylon-view.js",
  "games/signal-frontier/babylon-view.js",
  "game-source/signal-frontier/src/renderer-loader.js",
  "games/signal-frontier/renderer-loader.js",
  "games/signal-frontier/development-ui.js",
  "e2e/signal-frontier-buildings.spec.js",
  "game-source/signal-frontier/src/terrain-art.js",
  "game-source/signal-frontier/src/babylon/materials.js",
  "game-source/signal-frontier/src/assets/terrain/manifest.json",
  "games/signal-frontier/assets/terrain/districts-east.webp",
  "tools/build-signal-terrain-art.js",
  "e2e/helpers/signal-frontier-version.cjs",
  ".github/workflows/pages.yml",
];
assert.deepEqual(classify(ui), { suite: "signal", campaign: false });
assert.deepEqual(classify(ui, { forceCampaign: true }), {
  suite: "all",
  campaign: true,
});
for (const file of [
  "engine.js",
  "recon.js",
  "campaign.js",
  "persistence.js",
  "cloud-core.js",
  "new-mechanic.js",
]) {
  for (const root of [
    "game-source/signal-frontier/src/",
    "games/signal-frontier/",
  ]) {
    assert.deepEqual(
      classify([...ui, root + file]),
      { suite: file === "new-mechanic.js" ? "all" : "signal", campaign: true },
      file,
    );
  }
}
for (const file of [
  "playwright.config.js",
  "style-new.css",
  "e2e/global-setup.js",
  "game-source/signal-frontier/src/assets/terrain/new-logic.js",
  "game-source/signal-frontier/src/babylon/new-mechanic.js",
]) {
  assert.deepEqual(
    classify([...ui, file]),
    { suite: "all", campaign: true },
    file,
  );
}
assert.deepEqual(
  classify([...ui, "tests/helpers/signal-frontier-expedition-pilot.cjs"]),
  { suite: "signal", campaign: true },
);
assert.deepEqual(classify(ui, { known: false }), {
  suite: "all",
  campaign: true,
});
for (const file of [
  "package.json",
  "package-lock.json",
  "tools/build-signal.js",
])
  assert.deepEqual(
    classify([...ui, file]),
    { suite: "all", campaign: true },
    file,
  );
assert.deepEqual(classify([]), { suite: "all", campaign: true });
assert.deepEqual(classify(["game-source/signal-frontier/README.md"]), {
  suite: "signal",
  campaign: false,
});
const fs = require("node:fs");
const note = "content/physics-10/sections/optika.json";
assert.deepEqual(classify([note, "images/notes/physics-10/optika.svg"]), { suite: "content", campaign: false });
assert.deepEqual(classify([note, "note-filter.js"]), { suite: "reader", campaign: false });
assert.deepEqual(classify([note], { forceCampaign: true }), { suite: "all", campaign: true });
assert.deepEqual(classify([note, "sw.js"]), { suite: "web", campaign: false });
assert.deepEqual(classify([note, "game-source/signal-frontier/src/engine.js"]), { suite: "all", campaign: true });
assert.deepEqual(classify([note, "unreviewed.js"]), { suite: "all", campaign: true });
assert.deepEqual(classify(["tools/signal-ci-scope.js"]), { suite: "all", campaign: true });
const readerTests = require("../tools/run-tests").listTests(".", "reader");
assert.ok(readerTests.some(file => file.endsWith("signal-ci-scope.test.js")));
assert.ok(readerTests.some(file => file.endsWith("reader-tools.test.js")));
assert.ok(!readerTests.some(file => file.endsWith("signal-frontier-long-operation.test.js")));
const workflow = fs.readFileSync(".github/workflows/pages.yml", "utf8");
const { normalizeAppearanceReferences } = require("../tools/signal-ci-scope");
const brand = ["images/almanion-wordmark.svg", "favicon.ico", "favicons/app-icon-192.png", "tools/build-favicons.js"];
const fast = { suite: "appearance", campaign: false };
const full = { suite: "all", campaign: true };
assert.deepEqual(classify(brand), fast);
assert.deepEqual(classify(["styles/home-dashboard.css", "home-stars.js"]), fast);
assert.deepEqual(classify(brand, { known: false }), full);
assert.deepEqual(classify(brand, { forceCampaign: true }), full);
for (const file of ["account.js", "games/signal-frontier/engine.js", "game-source/orbital-courier/src/levels.js", "firebase/database.rules.json"]) {
  assert.deepEqual(classify([...brand, file]), full, file);
}
const original = '<img src="../images/almanion-wordmark.svg?v=one" width="96" height="23" alt="Almanion">';
const revised = original.replace("v=one", "v=two").replace('height="23"', 'height="20"');
const embedded = src => '<img src="data:image/svg+xml;base64,' + src + '" width="74" alt="Almanion">';
for (const [file, before, after] of [
  ["physics.html", original, revised],
  ["profile.html", '<script src="profile-covers.js?v=one"></script>', '<script src="profile-covers.js?v=two"></script>'],
  ["games/orbital-courier/offline.html", embedded("YWJj"), embedded("ZGVm")],
  ["manifest.json", '"src":"/favicons/app-icon.svg?v=one"', '"src":"/favicons/app-icon.svg?v=two"'],
  ["favicon-theme.js", "var ASSET_VERSION = 'one';", "var ASSET_VERSION = 'two';"],
]) {
  const same = candidate => normalizeAppearanceReferences(file, before) === normalizeAppearanceReferences(file, candidate);
  assert.deepEqual(classify([...brand, file], { appearanceEdit: () => same(after) }), fast);
  assert.equal(same(after + "\ninitialize();"), false, file + " must preserve other edits");
}
assert.notEqual(normalizeAppearanceReferences("index.html", revised.replace("images/", "other/")),
  normalizeAppearanceReferences("index.html", revised));
const profileArtwork = content => 'const designs = {\n        aurora: `\n' + content + '`,\n};';
const normalizeProfileArt = value => normalizeAppearanceReferences("profile-covers.js", value);
const coverBefore = profileArtwork('<path d="M0 0H12"/>');
const coverAfter = profileArtwork('<image href="images/profile-covers/aurora-cel.webp"/>');
const artOnly = value => normalizeProfileArt(coverBefore) === normalizeProfileArt(value);
assert.equal(artOnly(coverAfter), true);
assert.deepEqual(classify(["profile-covers.js", "images/profile-covers/aurora-cel.webp", "styles/profile-covers.css",
  "e2e/profile-cover-motion.spec.js"], { appearanceEdit: file => file === "profile-covers.js" && artOnly(coverAfter) }), fast);
assert.equal(artOnly(coverAfter + "\ninitialize();"), false);
assert.equal(artOnly(profileArtwork('<image href="cover.webp" onload="initialize()"/>')), false);
assert.equal(artOnly(profileArtwork('${initialize()}')), false);
const orbitArtwork = (content, slot = '${orbitTracks}') =>
  profileArtwork(content + '\n            ' + slot).replace('aurora:', 'orbit:');
const oldOrbit = orbitArtwork('<ellipse/>');
const newOrbit = orbitArtwork('<mask><rect/></mask><image href="images/profile-covers/orbit-cel.webp"/>');
assert.equal(normalizeProfileArt(oldOrbit), normalizeProfileArt(newOrbit));
assert.notEqual(normalizeProfileArt(oldOrbit), normalizeProfileArt(orbitArtwork('<ellipse/>', '')));
assert.notEqual(normalizeProfileArt(oldOrbit), normalizeProfileArt(orbitArtwork('<ellipse/>', '${buildOrbitTracks()}')));
const relief = (fill, levels = 9) => profileArtwork(
  '<g fill="' + fill + '">\n            ${contourLines(225, 85, ' + levels + ', .95)}\n</g>\n<path d="${riverRoute}"/>'
).replace('aurora:', 'contours:');
assert.equal(normalizeProfileArt(relief("navy")), normalizeProfileArt(relief("teal")));
assert.notEqual(normalizeProfileArt(relief("navy")), normalizeProfileArt(relief("teal", 7)));
const signalArtwork = markup => profileArtwork(markup).replace('aurora:', 'signal:');
const signalPath = '<path d="${signalTrace}"/>';
assert.equal(normalizeProfileArt(signalArtwork('<pattern/>' + signalPath.repeat(2))),
  normalizeProfileArt(signalArtwork('<g>' + signalPath + '</g>')));
assert.notEqual(normalizeProfileArt(signalArtwork(signalPath)),
  normalizeProfileArt(signalArtwork('<path d="${drawSignal()}"/>')));
assert.ok(require("../tools/run-tests").listTests(".", "appearance").some(file => file.endsWith("site-branding.test.js")));
assert.match(workflow, /if: needs\.scope\.outputs\.suite == 'appearance'\s+run: npx playwright test e2e\/appearance\.spec\.js/);
assert.match(workflow, /needs: \[scope, build, campaign\]/);
assert.match(workflow, /needs\.build\.result == 'success'/);
assert.match(workflow, /needs\.scope\.result == 'success'/);
assert.deepEqual(classify([
  "contests.html", "contests.js", "contests-core.js",
  "styles/contests.css", "e2e/contests.spec.js", "tests/contests.test.js",
]), { suite: "reader", campaign: false });
assert.deepEqual(classify(["contests.js", "firebase/database.rules.json"]), {
  suite: "all", campaign: true,
});
const admin = [
  "admin.html", "admin-app.js", "admin-dashboard.js", "admin-dialogs.js",
  "styles/admin.css", "e2e/admin-workspace.spec.js", "e2e/helpers/admin-fixture.cjs",
  "e2e/site.spec.js", "tests/admin-structure.test.js", "tests/admin-login.test.js",
  "tests/analytics-identity.test.js",
];
assert.deepEqual(classify(admin), { suite: "reader", campaign: false });
for (const file of ["firebase/database.rules.json", "games/signal-frontier/engine.js", "admin-new.js"]) {
  assert.deepEqual(classify([...admin, file]), { suite: "all", campaign: true });
}
assert.match(
  workflow,
  /needs\.scope\.outputs\.campaign == 'false' && needs\.campaign\.result == 'skipped'/,
);
assert.match(workflow, /needs\.campaign\.result == 'success'/);
console.log(
  "PASS UI-only scope, engine and persistence changes, unknown diff, manual full run, deployment gates",
);

(async () => {
  const { publishedBase } = require("../tools/signal-ci-scope");
  const sha = "a".repeat(40),
    env = { GITHUB_REPOSITORY: "owner/repo", GITHUB_TOKEN: "test-token" };
  const fake = async (url) => {
    assert.match(url, /event=push&status=success/);
    return {
      ok: true,
      json: async () => ({ workflow_runs: [{ head_sha: sha }] }),
    };
  };
  assert.equal(
    await publishedBase(env, fake),
    sha,
    "A cancelled previous push must not become the baseline",
  );
  assert.equal(
    await publishedBase({ ...env, SCOPE_BASE: "b".repeat(40) }, () => {
      throw Error("PR must use its explicit base");
    }),
    "b".repeat(40),
  );
  assert.equal(
    await publishedBase(env, async () => ({
      ok: true,
      json: async () => ({ workflow_runs: [] }),
    })),
    "",
  );
  await assert.rejects(
    publishedBase(env, async () => ({ ok: false, status: 403 })),
    /baseline/,
  );
  assert.equal(await publishedBase({}), "");
  assert.doesNotMatch(workflow, /github\.event\.before/);
  assert.match(workflow, /actions: read/);
  console.log(
    "PASS last published baseline, cancelled pushes, explicit PR base and unavailable history",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
