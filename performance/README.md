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

## Next implementation steps

1. Generate the service-worker asset manifest from the built site. Replace the
   manually incremented cache version with a content hash.
2. Keep only the home shell and offline essentials in the install cache. Cache
   subject pages after navigation and cap the runtime cache by count and age.
3. Preserve the last known complete response for notes and Matcenter data.
4. Load Firebase, KaTeX, administration, and editor code only on pages that use
   them. Prefetch the selected subject on pointer intent or after idle time.
5. Collect privacy-preserving LCP, CLS, INP, navigation duration, and failed
   resource counts by deployment version. Show percentiles, not individual
   browsing histories, in the administration panel.

The budgets are intentionally ceilings rather than targets. Lower them after
each migration so performance improvements cannot silently regress.
