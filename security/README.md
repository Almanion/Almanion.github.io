# Security hardening

`public-access-baseline.json` is an explicit inventory of Realtime Database
operations that are intentionally readable without a signed-in account.
`audit-rules.js` fails when a new public operation appears or an existing rule
changes without a matching review of the baseline.

There are no anonymous writes in the current baseline. Public reads are limited
to the published duty schedule, active polls, and public tickets.

## Implemented foundation

1. Ordinary signed-out visitors use Firebase Anonymous Auth in a secondary app;
   a signed-in site account always takes precedence for analytics identity.
2. Presence, sessions, daily statistics, poll responses, Web Vitals, visitor
   records, and private messages are bound to the authenticated UID.
3. Rules validate provider/context metadata and prevent clients from writing
   below another visitor's UID.
4. Firebase Emulator integration tests exercise successful and denied writes;
   Pages CI runs them before building or deploying the site.
5. Role changes are written atomically with an append-only audit event.

Firebase Anonymous Auth reduces casual spoofing, but one anonymous UID still
represents one browser storage context, not one human. The administration panel
therefore reports account identities separately from anonymous browsers.

## Remaining hardening

1. Enable Firebase App Check in report-only mode and measure rejected traffic.
2. Move write-heavy telemetry behind a small verified ingestion API with
   payload limits, rate limiting, and server timestamps.
3. Use the immutable owner UID and server-issued custom claims for privileged
   operations. Keep the email only as display and migration metadata.
4. Consolidate Matcenter, publishing, DeepL, and access checks behind one
   versioned API client. Remove the legacy password endpoint after all clients
   have observed the new capability version.
5. Expand the append-only audit stream from role management to every privileged
   mutation. Never store passwords, ID tokens, message text, or note contents.
6. Enforce App Check only after production has been observed in report-only
   mode and every supported browser is represented.

## Baseline update rule

Never update the baseline merely to make CI green. A baseline change must state
why public access is required and which abuse controls apply.
