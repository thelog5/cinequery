# Build log

Every block of work, when it landed, and the commit that holds it. Newest at the bottom. Times are the build machine's local time (EST, UTC-5).

Open questions and blockers for Logan live in the [questions doc](https://claude.ai/artifact/EQNojRrp4Kaq7LRE2TrECB).

| # | When | Block | Commit | Notes |
|---|------|-------|--------|-------|
| 1 | 2026-11-07 20:09 | Repo skeleton | `a2e9919` | README, .gitignore, this log |
| 2 | 2026-11-07 20:09 | Project config | `43c413d` | package.json scripts, tsconfig, next.config, .env.example |
| 3 | 2026-11-07 20:10 | Dependencies | `c725f51` | next 16, react 19, @anthropic-ai/sdk 1.6, MCP SDK 1.32, pg, zod 4, recharts 3, tailwind 4, vitest |
| 4 | 2026-11-07 20:12 | DB schema (R1) | `92763f4` | 4 tables per PRD, COMMENT ON every column, trigram + filter indexes in indexes.sql |
| 5 | 2026-11-07 20:12 | DB roles + ops schema (R7, R8) | `29dac4e` | SELECT-only reader role w/ 5s timeout; ops.requests table for rate limit + spend |
| 6 | 2026-11-07 20:13 | IMDb loader script (R1) | `ce7cbc1` | streams 4 TSVs, no temp files; --min-votes/--slim/--unlogged flags; disk-space guard |
| 7 | 2026-11-07 20:14 | SQL guard + tests (R7) | `6ff57f1` | SELECT/WITH-only check, keyword + function denylist, LIMIT wrapper; 25 vitest cases |
| 8 | 2026-11-07 20:15 | Read-only query runner (R7) | `106545f` | READ ONLY txn + SET LOCAL 5s timeout, 200-row cap, friendly error mapping |
| 9 | 2026-11-07 20:16 | Data tools (R2) | `fb93858` | list_tables, describe_table (basic/rich), search_people, search_titles (trigram + popularity), run_query |
| 10 | 2026-11-07 20:17 | Agent version configs (R6) | `16cd029` | v1-v4 flags: richDescribe, searchTools, workedExamples |
| 11 | 2026-11-07 20:17 | MCP server + stdio entry (R2) | `74ab371` | versioned McpServer factory; pnpm mcp runs it over stdio |
| 12 | 2026-11-07 20:19 | Loader hardening | `8698b6b` | first full load: 49,466 movies / 330,144 people / 983,681 credits (169 MB) before disk filled; added --finish-only + per-statement disk checks |
| 13 | 2026-11-07 20:21 | Agent types + pricing (R3, R11) | `ffe966c` | output contract, streaming event union, per-model cost calc |
| 14 | 2026-11-07 20:21 | System prompt + submit_answer (R3, v4) | `ffe966c` | landed in a5436b1 alongside the loader fix: grounding rules, result-shape guidance, 3 worked examples (v4), strict submit tool |
| 15 | 2026-11-07 20:21 | Agent loop (R3) | `3ffa266` | in-memory MCP transport, 8-call budget, re-run final SQL, chart validation, events for R10 |
| 16 | 2026-11-07 20:21 | CLI: pnpm ask | `5434381` | prints tool trace, answer, SQL, rows, tokens, cost |
| 17 | 2026-11-07 20:22 | Rate limit + spend cap (R8) | `503e34e` | 10/hr per hashed IP, daily USD cap, Postgres-backed; fails closed |
| 18 | 2026-11-07 20:22 | POST /api/ask (R3, R10) | `98c59fe` | JSON or NDJSON event stream; maxDuration 120 |
| 19 | 2026-11-07 20:22 | Local slim load + roles verified | `98c59fe` | slim local DB: 49,466 movies / 138,864 people / 388,558 credits (109 MB). Reader role: SELECT-only, read-only, 5s — verified DELETE/DROP denied |
| 20 | 2026-11-07 20:23 | MCP integration tests (R2, R7, acceptance) | `df46af2` | 37/37 passing locally; slow query killed at ~5s; writes rejected, counts unchanged |
| 21 | 2026-11-07 20:26 | UI shell + design tokens (R4) | `80be347` | marquee theme, light/dark, fonts, nav, IMDb credit footer |
| 22 | 2026-11-07 20:26 | Chart, SQL block, rows table (R4) | `d50dc06` | Recharts bar/line, horizontal bars for long labels, <details> SQL |
| 23 | 2026-11-07 20:26 | Ask page + live trace (R4, R10) | `62700a3` | question box, 5 examples, NDJSON stream → tool trace, answer/chart/SQL |
| 24 | 2026-11-07 20:27 | Eval scorer + tests (R5) | `6f0be87` | value matching ignoring names, ordered flag, 0.01 tolerance, column-mapping backtrack; 11 tests |
| 25 | 2026-11-07 20:28 | Question loader + gold check (R5) | `0936073` | zod-validated JSONL; flags empty, >200 rows, ties at LIMIT cutoff |
| 26 | 2026-11-07 20:29 | Eval Qs: single_table x20 | `7d44bff` | s01-s20, all gold queries healthy on local data |
| 27 | 2026-11-07 20:31 | Eval Qs: joins x20 | `6165f31` | j01-j20; tuned thresholds to remove 4 ties found in the data |
| 28 | 2026-11-07 20:32 | Eval Qs: aggregation x20 | `ba28a31` | a01-a20; 2-decimal rounding convention; fixed 1 tie |
| 29 | 2026-11-07 20:32 | Eval Qs: name_ambiguity x20 | `67a3443` | n01-n20; surnames, misspelling, duplicate titles; ids pinned in gold |
| 30 | 2026-11-07 20:34 | Eval Qs: trends x20 (100 total) | `6f28dec` | t01-t20; 20 per category, 100/100 gold healthy |
| 31 | 2026-11-07 20:34 | Example buttons ↔ evals | `9bbe3c6` | 5 examples are eval questions; consistency test |
| 32 | 2026-11-07 20:34 | De-leak worked examples | `b36d64d` | v4 examples no longer mirror eval questions; 2-dp rounding default |
| 33 | 2026-11-07 20:35 | Eval runner (R5, R11) | `341eabb` | per-question JSON w/ tokens, cost, latency; per-category accuracy; cost cap; BLOCKED on API key for real runs (B2) |
| 34 | 2026-11-07 20:35 | Agent loop tests (fake model) | `549a796` | 9 tests: budget, re-run, retries, write rejection, v1/v4 tool sets — no API key needed |
| 35 | 2026-11-07 20:37 | Chart color + mark specs | `e7e8dbd` | validated --chart token light/dark; 2px lines, 8px markers, 4px bar ends |
| 36 | 2026-11-07 20:37 | /evals page (R9) | `f408a89` | headline + biggest jump, accuracy line, category table, per-question grid, empty state |
| 37 | 2026-11-07 20:38 | Prod build + smoke test | `6bf53ed` | next build OK (/, /evals static; /api/ask dynamic). Verified live: 400 on bad input, NDJSON stream, 429 after 10/hr w/ Retry-After, 503 past daily cap |
