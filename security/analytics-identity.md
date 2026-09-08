# Analytics identity model

## Metrics shown in the administration panel

- **Registered accounts**: distinct normalized email addresses in
  `accountDirectory`. Opening the site in another browser, Telegram, or an
  incognito window does not increase this number when the visitor signs in to
  the same account.
- **Accounts today**: distinct authenticated Firebase UIDs that produced a
  daily record today.
- **Anonymous browsers today**: distinct Firebase Anonymous Auth UIDs. This is
  deliberately labelled as browser contexts, not people.
- **Online now**: active authenticated or anonymous browser contexts. It is a
  concurrency measure, not a unique-human count.

Legacy `v_*` records remain available for historical inspection, but are not
mixed into the account totals.

## Why an exact anonymous-person count is impossible in the current website

Incognito mode and embedded browsers isolate or erase site storage. A static
website receives neither a durable device identifier nor proof that two such
contexts belong to the same person. IP address and browser fingerprinting would
still merge different people, split the same person, and create unnecessary
privacy risk, so Almanion does not use them as identity.

## Optional next level

1. Keep the account number as the canonical unique-user metric.
2. If Telegram identity is important, launch the site as a Telegram Mini App.
   Send its initialization data to a trusted backend, validate the signature,
   then map the verified Telegram user ID to a Firebase account. Never trust a
   Telegram ID supplied only by browser JavaScript.
3. If pre-login activity must be merged into an account, send both the anonymous
   and account ID tokens to the ingestion backend and create an alias only after
   verifying both tokens. Client-only aliases must not affect unique counts.
4. Add retention for anonymous telemetry after aggregate reports no longer need
   it; do not delete legacy data automatically during the migration.
