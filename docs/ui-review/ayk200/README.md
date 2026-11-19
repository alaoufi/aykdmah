# AYK-200 — account receipts, docked navigation and iPhone beta

Requested 2026-11-06. Base: `fd0d107`; live source checked independently at `e91dc414ec3d180c350a3af2223dcf18787556a2`, website1.1.11. Existing AYK-197 registration/deletion receipts were already deployed; they were retained rather than reimplemented. No backend, database migration, real account or private conversation changed.

## Changes and evidence

- Before: the coloured navigation panel ended8px above the viewport bottom. Now its safe-area padding is inside the background and the panel reaches the visible bottom. It retains the raised action, text zoom and viewport handling. A root ResizeObserver handles WebKit layout updates that can follow the resize event; it is disconnected on unmount.
- Registration: explicit Arabic success and login link, preserving existing auto-login semantics and the return target. Deletion: explicit success and home link only after server acknowledgement. Existing session-safe router receipts survive registration/logout remounts.
- Visual review found a further reproducible failure: after submitting a long form, its scroll position could leave the shorter receipt behind the sticky header. Both success views now reset scroll when their confirmed receipt appears. Browser tests assert the heading is actually within the viewport and clear of the header.
- Guide updated in all11 locales;2299 keys and interpolation variables match. Other locales retain their already translated success text.

`e2e/account-dock.e2e.mjs` intercepts every API request and blocks external traffic. It never contacts production, sends SMS, creates/deletes a real account, or reads private messages. Tests cover320/390/430 widths, normal/large text, scroll and viewport resize, acknowledged registration, login link, touch confirmation, rejected deletion, logout remount, visible deletion receipt, and home link.

Two complete final passes: Chromium85/85 and WebKit85/85 each, **340/340** total, zero page exceptions. Reports and synthetic screenshots are in `final-1/` and `final-2/`. Early desktop-WebKit pointer-coordinate failures were separated from mobile touch tests; the final suite uses mobile touch contexts and taps the full confirmation label. This is not a physical iPhone or keyboard test.

Final Linux/Docker gate from an isolated Git clone with the final source overlay: server55/55, client151/151, PostgreSQL integration238/238,11 locales/2299 keys; production build34.18s, runtime audits0/0, deploy checks pass. `suite.txt` records the actual commands' summary. No performance claim for real phones.

## Native iOS and release boundary

Private `alaoufi/apple-apps` source `a29b8d8`:1.0.1(2), same bundle ID; WKWebView automatic extra inset disabled. Mac simulator compile, signed archive/export and Apple-confirmed upload succeeded. ASC read-back confirmed `VALID`, linked to `Ay Khidma External`. Upload run42276591499; association run42277625323. Further private documentation/notes commits do not change the binary source.

No App Store production submission. Beta review has not yet been sent; external state `READY_FOR_BETA_SUBMISSION`, so the new build is not yet available to testers. Shared website changes remain un-deployed pending explicit approval for the production website that the iPhone wrapper displays. Native inset/home-indicator/keyboard and call quality remain physical-device validation, not established by these browser/compile checks.

Next: approve and release the shared website through the existing backup/testdeploy gates, verify the new public version and receipts without real account mutations, submit the exact1.0.1(2) beta candidate, then read Apple status. Two testers can test a two-party call; a single clear iPhone recording can demonstrate it. The owner's Apple review request also requires the other specified flows and reviewer information. No minimum tester count is stated in the TestFlight documentation; no acceptance guarantee is made.
