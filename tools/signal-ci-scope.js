"use strict";
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

// Only known presentation files bypass real-time campaign replays. All engine,
// persistence, pilot and unrecognised changes take the conservative path.
const presentation = new Set([
  "app.js",
  "development-ui.js",
  "account-ui.js",
  "index.html",
  "style.css",
  "view.js",
  "audio.js",
]);
const tooling = new Set([
  ".github/workflows/pages.yml",
  "tools/signal-ci-scope.js",
  "tests/signal-ci-scope.test.js",
]);
function classifyPresentation(files) {
  return files.every((file) => {
    if (tooling.has(file)) return true;
    if (/^game-source\/signal-frontier\/[^/]+\.md$/.test(file)) return true;
    if (/^(e2e|tests)\/signal-frontier[^/]*\.(spec|test)\.js$/.test(file))
      return true;
    const asset = file.match(
      /^(?:game-source\/signal-frontier\/src|games\/signal-frontier)\/([^/]+)$/,
    );
    return !!asset && presentation.has(asset[1]);
  });
}
function classify(files, { known = true, forceCampaign = false } = {}) {
  const signalOnly = known && files.length > 0 && classifyPresentation(files);
  // Shared build/dependency changes still run the entire site's browser suite.
  // The engine simulations and generated-file checks remain unconditional.
  const sharedBuild = new Set([
    "package.json",
    "package-lock.json",
    "tools/build-signal.js",
  ]);
  const replay =
    !known ||
    !files.length ||
    files.some(
      (file) => !sharedBuild.has(file) && !classifyPresentation([file]),
    );
  return { signalOnly, campaign: forceCampaign || replay };
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
      `signal_only=${scope.signalOnly}\ncampaign=${scope.campaign}\n`,
    );
  return scope;
}
if (require.main === module)
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { classify, publishedBase };
