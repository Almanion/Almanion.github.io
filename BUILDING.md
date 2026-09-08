# Building and publishing Almanion

Run the same verification locally that GitHub Pages runs before every deployment:

```sh
npm ci
npm run ci
```

The command runs every `tests/*.test.js` file, validates and renders note JSON through the canonical note builder, generates the search index, assembles the allowlisted static site in `_site`, and checks local HTML, CSS, manifest, and service-worker links. Performance-budget checks can grow independently as ordinary test files and are picked up automatically.

Only browser assets described by `tools/site-files.json` are copied. Tests, build tools, Firebase rules, Apps Script sources, package metadata, repository settings, and Markdown documentation are deliberately excluded from the deployed artifact.

Every successful build writes `_site/_build.json`. Its source revision, stable content digest, file count, and byte count identify the exact artifact. GitHub Actions retains the complete verified `_site` artifact (including this metadata) for 90 days, so a rollback does not depend on rebuilding changed tooling.

## Adding a new public asset type

Prefer an existing public directory. If a genuinely new file type or top-level directory is required at runtime, add the narrowest possible entry to `tools/site-files.json` and add a corresponding assertion to `tests/site-build.test.js`. Do not broadly publish repository contents.
