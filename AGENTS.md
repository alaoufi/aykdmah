# Instructions for coding agents (Codex, Claude)

- Read `CODEX_HANDOFF.md` and `docs/PROJECT_PROGRESS.md` first. Work on top of the latest commit of `claude/deploy-setup`.
- The product name is «أي خدمة» (English: Ay Khidma). Code prefix: `ayk`.
- Arabic RTL first; every UI string goes into all five locales (`npm run i18n:check` must pass).
- Run `bash deploy/run-tests.sh` before every push. Never force-push, never commit `.env` or secrets.
- New migration → `NODE_ENV=test node scripts/append-pg-migrations.cjs`.
- Back up the database before any change that touches it on the server.
