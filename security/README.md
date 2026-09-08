# Security hardening plan

`public-access-baseline.json` is a temporary, explicit inventory of Realtime
Database operations that are currently available without a signed-in account.
`audit-rules.js` fails when a new public operation appears or an existing rule
changes without a matching review of the baseline.

The baseline is not a declaration that these operations are safe. It freezes
the current surface while the protected replacement is introduced.

## Target architecture

1. Enable Firebase App Check in report-only mode and measure rejected traffic.
2. Give ordinary visitors anonymous Firebase Auth identities. Store private
   messages and telemetry below that UID instead of a browser-generated ID.
3. Move write-heavy public telemetry behind a small verified ingestion API with
   payload limits, rate limiting, and server timestamps.
4. Use the immutable owner UID and server-issued custom claims for privileged
   operations. Keep the email only as display and migration metadata.
5. Consolidate Matcenter, publishing, DeepL, and access checks behind one
   versioned API client. Remove the legacy password endpoint after all clients
   have observed the new capability version.
6. Add Firebase Emulator tests for every role and every allow/deny transition,
   then enforce App Check after production has been observed in report-only mode.
7. Record privileged mutations in an append-only audit log without storing
   passwords, ID tokens, message text, or note contents.

## Baseline update rule

Never update the baseline merely to make CI green. A baseline change must state
why anonymous access is required, which abuse controls apply, and how the route
will eventually be authenticated or removed.
