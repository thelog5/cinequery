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
