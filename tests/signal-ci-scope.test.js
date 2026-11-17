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
