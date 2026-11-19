# AYK-198 — dedicated PostgreSQL search verification

Authorized scope: extend the standalone account/search branch `codex/ayk-197-198-ci-007`; no AYK-196 fixes, navigation, merge, deployment, or store changes. Base commit: `c62eb9677694ef85536b8938d9c5ec8ddea1b280`.

Before changes, numbered backup008 saved a complete bundle and was actually cloned/restored to the same base commit. Local rollback tag: `rollback/AYK-198-008-20261105`. Bundle SHA256: `2655ED212B64AC56831204642E53DEE42DBB2437D438AB2300256C0B83028897`. Retain all numbered backups; same-device loss remains a risk.

`server/tests/chat-list-search.integration.js` uses real PostgreSQL, the production model/controller/auth middleware, and loopback HTTP with synthetic accounts/messages. It owns a random database distinct from parallel suites, disables dotenv/outbound service calls, accepts only explicitly selected local test ports, bounds setup/queries, and drops only its owned database in cleanup.

Coverage: Arabic text in an older message rather than the latest preview; request title; missing/deleted content; foreign membership and title isolation; peer filter; hidden client-name privacy; apostrophes/SQL-like literal binding;105 matching conversations across pages; max100 limit/lower page and limit bounds; invalid query shape/length/filter400; unauthenticated401. The counterfactual test removes only the new predicate and its parameter from an in-memory copy of the model: the old query misses the Arabic message while title search works; the unchanged real model finds it. No production file is replaced to run that control.

CI additionally runs both runtime dependency audits and `tests/check-deploy.sh`. These independent steps run unless cancelled and retain failures; they do not deploy. Existing Node22/PostgreSQL16 integration runner automatically discovers this new suite. All existing tests/build remain in the workflow.

Local checks: JavaScript syntax and diff whitespace checks passed. PostgreSQL execution is delegated to the authorized CI branch because this Windows machine has no PostgreSQL/Linux/container runtime. The full CI outcome must be read from its immutable commit/run before claiming success. No performance benchmark, production query plan, real device, account deletion, or real private chat is covered by these tests.
