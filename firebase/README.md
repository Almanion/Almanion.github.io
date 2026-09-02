# Firebase access setup

The admin interface now requires an explicit flag at `admins/<uid>` in Realtime Database.

1. Open Firebase Console → Authentication → Users and copy the administrator UID.
2. In Realtime Database create `admins/<uid>` with the boolean value `true`.
3. Publish the rules from `firebase/database.rules.json` in Realtime Database → Rules.

The client only uses the flag to display the dashboard. The rules remain the actual
security boundary and must be deployed before the public site is considered protected.

Bookmarks, knowledge-check data, solved Matcenter tasks and ticket-builder data are
stored under the Firebase UID. The account-confirmation setup for Matcenter is
documented separately in `matcenter/AUTH_SETUP.md`.
