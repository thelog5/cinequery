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
