# AYK-197 — local account and search changes, 2026-11-05

Work is isolated in `aykdmah-ui`, branch `claude/deploy-setup`, based on remote HEAD `82b4bacc385811bfd691e2834f7c92502be77444`. The previous 20 staged AYK-196 files in sibling `aykdmah` remain untouched. No commit, push, deployment, store upload, live account deletion, or private-chat inspection was performed.

## Changes

- Registration displays a success card and `/login` link after the server response, including when no referral code is returned. Existing automatic login, optional referral-code copy, continuation and return destination remain. The service verifies the success envelope before setting a token. Duplicate submissions are locked while awaiting verification/registration.
- Account deletion requires `success: true` and `data.deleted: true`. Errors and blocking jobs remain visible; retry is possible. Password input is cleared after acknowledgement and repeated submissions are suppressed. A clear success receipt remains after logout.
- Independent review identified that `App.jsx` keys routes by `sessionEpoch`: local success state was erased on registration/logout. Confirmed receipts now use router state and account identity to survive that remount and avoid showing another signed-in account's receipt. Passwords and tokens are never put in router state.
- Conversation-list search previously matched only request titles and peer identity fields. It now also matches non-deleted message content through a correlated `EXISTS`, retaining the existing membership/privacy filters and applying search before pagination.
- All 11 locales contain the new registration text; both signup guide sections describe confirmed account outcomes.

## Unfinished iPhone navigation requirement

The latest scope is **native iPhone only**: opaque navigation anchored at the bottom, with safe area. Android and all ordinary browsers must remain unchanged. No navigation styles were changed.

The Library reference was resolved and `prepare_materialize` was called using an explicit local destination. The required transfer helpers were read and saved unchanged, but the computer has no functioning Python runtime. The Windows alias first failed inside the sandbox; checking outside it confirmed `Python was not found`. Standard Python installation locations were absent. No image bytes were materialized or inspected, so the required visual precondition remains unmet. No transfer restriction was bypassed. Signed transfer data remains outside the repository and must never be published.

The repository identifies Android as a Trusted Web Activity (`android/README.md`, `android/twa-manifest.json`) using the live website. These web UI changes would be delivered by an authorized website deployment and cache refresh without inherently requiring a new APK. Existing documentation describes iOS as a WKWebView shell (`docs/CALL_COMPATIBILITY.md`), but the exact current external TestFlight build's URL/cache/native-inset behavior was not verified here. No claim is made that TestFlight or an APK has been updated. Native shell changes, if required, need a new signed build and separate release verification.

## Backups and rollback

Outside the repository, retained permanently without automatic deletion:

- `backups/AYK-197-003-20261105/source-before.bundle`, plus `previous-work.patch` preserving all AYK-196 changes. Actual restore into `003/restore-check` produced tree `fb6f0d34407cabf7dab839c482ad57d926246b61`, identical to the previous staged work. Bundle SHA256 `A15540525CCE94D108252CD5CD816BE94DFBAA2A55D1F86EE6D5FAF134DC77E8`; patch SHA256 `B7490E0A3A9273D51EF72BFE45E34000C394DFDFEF808ED1B711B27D1133B94E`.
- Local tag `rollback/AYK-197-003-20261105` points to the clean base.
- `backups/AYK-197-004-20261105/accounts-wip.patch` and `accountSuccess.test.mjs` capture account work before adding chat search. Actually restored into `004/restore-check`. This is an intermediate checkpoint, not the final patch. Patch SHA256 `8E67DD45C788E9806E48B8913230D59D110A352770C9BBC174A798E22A213270`.

These copies are on one device. Disk failure or loss can destroy all copies; no independent off-device backup or unlimited available space has been established. No private data was uploaded.

## Verification and limits

- Account handler regression tests: 6/6 passed (pending response, repeated submit, malformed response, retry, blocked jobs, logout failure, referral-code/no-code and OTP).
- Independent review's two blocking remount findings were fixed and re-reviewed. Mounted integration in workspace `verification/account-render-tests/integration.jsx` and `run.mjs` passed using real AuthProvider/authService/router/pages and mocked transport: pending registration has no success, both referral variants survive epoch changes, the login link opens LoginPage, deletion survives logout/token clearing, and another account cannot see the receipt. Run `node run.mjs` inside that folder; its isolated test dependencies are recorded in package-lock.json. This is a React renderer test, not a device/browser pixel test.
- New search regression tests: 5/5 passed. Query-contract coverage checks bindings and retained access/privacy filters. An in-memory SQLite fixture executes the actual new message predicate with `LIKE` substituted for PostgreSQL `ILIKE`: historical Arabic content, absent/deleted matches, membership isolation and pagination. This does not validate PostgreSQL collation, the entire PostgreSQL query, or production performance. Leading-wildcard content matching may scan messages within candidate conversations.
- Locale check: 11 languages, 2298 matching keys/interpolation variables.
- Production frontend build passed; existing large-chunk/recovery-script warnings remain.
- Full frontend run at this stage: 141/145 passed; four failures match the previous baseline environment limitations (Windows symlink permissions, test loader/path behavior, and localization environment). See workspace `verification/AYK-197-client-tests.txt`.
- Windows Node 26 is installed; project targets Node 22. No Linux distribution, Docker, or PostgreSQL runtime is available. Required Linux/PostgreSQL deployment gate and real iPhone/Android device checks have not been run. This is not a production-ready signoff.
