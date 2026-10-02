# Performance preparation

The first performance milestone is measurement, not a framework rewrite.
`budgets.json` records ceilings close to the current production baseline and
`check-budgets.js` prevents an accidental large regression.

## Current foundation

1. The Pages build generates a compact `search-index.json`; the browser uses it
   first and keeps the previous page-by-page parser as a compatibility fallback.
2. Network-first requests have a finite timeout and the runtime cache has a hard
   entry cap, so a slow connection cannot leave navigation waiting indefinitely.
3. CI checks size ceilings, the number of pre-cached URLs, and the aggregate
   size of legacy search sources.

## Implemented milestone

1. Generate the service-worker asset manifest from the built site. Replace the
   manually incremented cache version with a content hash.
2. Keep only the home shell and offline essentials in the install cache. Cache
   subject pages after navigation and cap the runtime cache by count and age.
3. Preserve the last known complete response for notes and Matcenter data.
4. Administration and editor code stay page-specific; subject documents are
   prefetched only on pointer intent/focus or after an idle home-page window.
5. Collect privacy-preserving LCP, CLS, INP, navigation duration, and failed
   resource counts by deployment version. Show percentiles, not individual
   browsing histories, in the administration panel.

Matcenter keeps its own last complete task payload because its source is a
cross-origin Apps Script endpoint. Notes JSON and the generated search index are
validated before the service worker replaces a cached response.

The budgets are intentionally ceilings rather than targets. Lower them after
each migration so performance improvements cannot silently regress.

October reader changes: search, study and export scripts load on intent; editor
code loads only for editors. Authentication still restores in the background to
keep study progress correctly scoped. The small first-click launchers add about
3 KB (chemistry's initial-JS ceiling is 139 KB); the substantially larger feature
scripts no longer load on every visit. PDF libraries have separate explicit file
ceilings and are never part of initial loading or the service-worker shell.

Offline subject packs are opt-in, hash-verified and kept in separate durable
caches, outside the runtime eviction limit. Personal-note buttons follow the
existing lazy bookmark observer instead of eagerly decorating every chapter.
