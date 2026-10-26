"use strict";
const assert = require("node:assert/strict");
const { classify } = require("../tools/signal-ci-scope");
const ui = [
  "game-source/signal-frontier/src/app.js",
  "games/signal-frontier/development-ui.js",
  "e2e/signal-frontier-buildings.spec.js",
  ".github/workflows/pages.yml",
];
assert.deepEqual(classify(ui), { signalOnly: true, campaign: false });
assert.deepEqual(classify(ui, { forceCampaign: true }), {
  signalOnly: true,
  campaign: true,
});
for (const file of [
  "engine.js",
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
      { signalOnly: false, campaign: true },
      file,
    );
  }
}
for (const file of [
  "playwright.config.js",
  "tests/helpers/signal-frontier-expedition-pilot.cjs",
  "style-new.css",
  "e2e/global-setup.js",
]) {
  assert.deepEqual(
    classify([...ui, file]),
    { signalOnly: false, campaign: true },
    file,
  );
}
assert.deepEqual(classify(ui, { known: false }), {
  signalOnly: false,
  campaign: true,
});
for (const file of [
  "package.json",
  "package-lock.json",
  "tools/build-signal.js",
])
  assert.deepEqual(
    classify([...ui, file]),
    { signalOnly: false, campaign: false },
    file,
  );
assert.deepEqual(classify([]), { signalOnly: false, campaign: true });
assert.deepEqual(classify(["game-source/signal-frontier/README.md"]), {
  signalOnly: true,
  campaign: false,
});
const fs = require("node:fs");
const workflow = fs.readFileSync(".github/workflows/pages.yml", "utf8");
assert.match(workflow, /needs: \[scope, build, campaign\]/);
assert.match(workflow, /needs\.build\.result == 'success'/);
assert.match(workflow, /needs\.scope\.result == 'success'/);
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
