# Build log

Every block of work, when it landed, and the commit that holds it. Newest at the bottom. Times are local (America/Los_Angeles unless noted).

Open questions and blockers for Logan live in the [questions doc](https://claude.ai/artifact/EQNojRrp4Kaq7LRE2TrECB).

| # | When | Block | Commit | Notes |
|---|------|-------|--------|-------|
| 1 | 2026-11-07 20:09 | Repo skeleton | `d88a300` | README, .gitignore, this log |
| 2 | 2026-11-07 20:09 | Project config | `077a144` | package.json scripts, tsconfig, next.config, .env.example |
| 3 | 2026-11-07 20:10 | Dependencies | `446e4d8` | next 16, react 19, @anthropic-ai/sdk 1.6, MCP SDK 1.32, pg, zod 4, recharts 3, tailwind 4, vitest |
| 4 | 2026-11-07 20:12 | DB schema (R1) | `05aa87a` | 4 tables per PRD, COMMENT ON every column, trigram + filter indexes in indexes.sql |
| 5 | 2026-11-07 20:12 | DB roles + ops schema (R7, R8) | `0dfec0a` | SELECT-only reader role w/ 5s timeout; ops.requests table for rate limit + spend |
| 6 | 2026-11-07 20:13 | IMDb loader script (R1) | `72dfe17` | streams 4 TSVs, no temp files; --min-votes/--slim/--unlogged flags; disk-space guard |
| 7 | 2026-11-07 20:14 | SQL guard + tests (R7) | `80ce0e9` | SELECT/WITH-only check, keyword + function denylist, LIMIT wrapper; 25 vitest cases |
| 8 | 2026-11-07 20:15 | Read-only query runner (R7) | `f40654e` | READ ONLY txn + SET LOCAL 5s timeout, 200-row cap, friendly error mapping |
| 9 | 2026-11-07 20:16 | Data tools (R2) | `dcb245a` | list_tables, describe_table (basic/rich), search_people, search_titles (trigram + popularity), run_query |
| 10 | 2026-11-07 20:17 | Agent version configs (R6) | `9833106` | v1-v4 flags: richDescribe, searchTools, workedExamples |
| 11 | 2026-11-07 20:17 | MCP server + stdio entry (R2) | `b5de1e8` | versioned McpServer factory; pnpm mcp runs it over stdio |
| 12 | 2026-11-07 20:19 | Loader hardening | `a5436b1` | first full load: 49,466 movies / 330,144 people / 983,681 credits (169 MB) before disk filled; added --finish-only + per-statement disk checks |
| 13 | 2026-11-07 20:21 | Agent types + pricing (R3, R11) | `c3ae34c` | output contract, streaming event union, per-model cost calc |
| 14 | 2026-11-07 20:21 | System prompt + submit_answer (R3, v4) | `c3ae34c` | landed in a5436b1 alongside the loader fix: grounding rules, result-shape guidance, 3 worked examples (v4), strict submit tool |
| 15 | 2026-11-07 20:21 | Agent loop (R3) | `90854e3` | in-memory MCP transport, 8-call budget, re-run final SQL, chart validation, events for R10 |
