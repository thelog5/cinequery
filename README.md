# Cinequery

Ask movie questions in plain English. Get an answer, a chart, and the SQL behind it, from an agent whose accuracy is measured by a 100-question eval suite across four versions.

> "Which directors have made at least 6 films rated 8.0 or higher with at least 25,000 votes?"
> → an answer in a sentence, a bar chart, the query it ran, and the rows.

- **Live demo:** _coming soon_ (see [deploying](#deploying))
- **Eval results:** [`/evals`](#eval-results) on the demo, and the table below
- **Build log:** [`docs/PROGRESS.md`](docs/PROGRESS.md) records when each piece landed

## Eval results

<!-- evals:start -->
_No eval runs recorded yet (100 questions ready)._

| Version | Change | Score |
|---|---|---|
| v1 | list_tables, describe_table, run_query only | not run yet |
| v2 | Column comments and sample rows in describe_table | not run yet |
| v3 | Add search_people and search_titles | not run yet |
| v4 | 3 worked examples in the system prompt | not run yet |
<!-- evals:end -->

Each version changes exactly one thing, so each score delta has a single cause. If a version made things worse, it stays in the table.

## How it works

```mermaid
flowchart LR
  UI["Ask page<br/>(Next.js)"] -- "POST /api/ask<br/>NDJSON stream" --> API["API route<br/>rate limit + spend cap"]
  API --> Agent["Agent loop<br/>Claude, ≤ 8 tool calls"]
  Agent <-- "in-memory transport" --> MCP["MCP server<br/>5 tools"]
  MCP -- "SELECT-only role<br/>5 s timeout, 200 rows" --> DB[("Postgres<br/>IMDb movies")]
  Evals["Eval runner<br/>100 questions"] --> Agent
  Evals -- "gold SQL" --> DB
  Desktop["Claude Desktop /<br/>Claude Code"] -- stdio --> MCP
```

1. **Data (R1).** `scripts/load-imdb.ts` streams IMDb's TSV dumps straight from `datasets.imdbws.com` through gunzip into Postgres. Nothing touches disk, so the 790 MB principals file needs no local space. It keeps feature films with at least 1,000 votes, then builds trigram and filter indexes. Every column has a `COMMENT` explaining its meaning and gotchas.
2. **Tools via MCP (R2).** The agent never sees a schema dump. It calls tools on an MCP server (`src/mcp/server.ts`):

   | Tool | Input | Returns |
   |---|---|---|
   | `list_tables` | none | Table names with one-line descriptions |
   | `describe_table` | table | Columns, types, comments, 3 sample rows |
   | `search_people` | name fragment | Top 5 matches with `nconst`, professions, known-for titles |
   | `search_titles` | title fragment | Top 5 matches with `tconst`, year, rating |
   | `run_query` | SQL | Rows (max 200), row count, execution time |

   The web app runs the server in-process over an in-memory transport. The same server runs over stdio for Claude Desktop or Claude Code.
3. **Agent (R3).** `src/agent/run.ts` gives Claude at most 8 tool calls, then it calls `submit_answer` with `{answer, sql, chart}`. The server re-runs the submitted SQL, so the rows the user sees, and the rows the evals score, always come from the database, never from the model.
4. **UI (R4, R10).** A question box, five example buttons, a live list of the agent's tool calls as they happen, then the answer, a Recharts chart, the rows, and a collapsible SQL block.
5. **Evals (R5, R6, R9, R11).** `pnpm eval --version vN` runs all 100 questions and writes `evals/results/vN.json` with pass/fail, tool calls, tokens, cost, and latency per question. `/evals` and the README table read those files.

### Agent versions

| Version | Change |
|---|---|
| v1 | `list_tables`, `describe_table` (names and types only), `run_query` |
| v2 | `describe_table` adds column comments and 3 sample rows |
| v3 | adds `search_people` and `search_titles` |
| v4 | adds 3 worked examples to the system prompt (written so they don't overlap any eval question) |

### Safety (R7, R8)

| Layer | What it stops |
|---|---|
| Postgres role `cinequery_reader` | SELECT on the four movie tables only; read-only transactions by default |
| `BEGIN READ ONLY` + `SET LOCAL statement_timeout = 5s` per query | writes, and anything slower than 5 s, with a friendly message |
| SQL guard (`src/lib/sql-guard.ts`) | anything but one SELECT/WITH; write/DDL keywords; `SELECT INTO`; `pg_sleep`, `pg_read_file` and friends |
| `LIMIT 201` wrapper | more than 200 rows (truncation is reported) |
| Per-IP limit | more than 10 questions per hour (`429` + `Retry-After`) |
| Daily spend cap | new questions once today's model spend reaches `DAILY_SPEND_CAP_USD` (`503`) |
| Anthropic console workspace limit | the hard monthly backstop |

`src/mcp/server.integration.test.ts` proves the acceptance criteria: `UPDATE`/`DROP`/`DELETE` attempts are rejected and row counts don't change, and a cross join is killed at 5 seconds.

## Running locally

Requires Node 20+, pnpm, and Postgres 16+ with `pg_trgm` (Postgres.app works).

```bash
pnpm install
cp .env.example .env            # fill in DATABASE_URL_ADMIN, passwords, ANTHROPIC_API_KEY
createdb cinequery

pnpm db:load                    # ~3-10 min: download, filter, load, index
pnpm db:ops                     # rate-limit / spend tables
pnpm db:roles                   # cinequery_reader + cinequery_ops roles
pnpm eval:check-gold            # all 100 gold queries should be healthy

pnpm test                       # unit + integration tests (integration needs the DB)
pnpm ask "Who directed Heat?"   # one question from the terminal, with the tool trace
pnpm dev                        # http://localhost:3000
```

Loader flags: `--min-votes N` (default 1000), `--slim` (keep only directors, writers, and the top 5 billed cast: the PRD's fallback if the data outgrows Neon's free tier), `--unlogged` (no WAL, for a tight local disk), `--finish-only` (resume at the index step).

## Deploying

1. **Neon.** Create a project, then run the loader against it with `DATABASE_URL_ADMIN` set to the owner connection string. Run `pnpm db:load && pnpm db:ops && pnpm db:roles`.
2. **Anthropic.** Create an API key in its own workspace and set a monthly spend limit on that workspace.
3. **Vercel.** Import the repo and set `DATABASE_URL_READONLY`, `DATABASE_URL_OPS`, `ANTHROPIC_API_KEY`, `CINEQUERY_MODEL`, `DAILY_SPEND_CAP_USD`, and `IP_HASH_SALT`. Never set `DATABASE_URL_ADMIN` on Vercel. `/api/ask` sets `maxDuration = 120`.

## Using the MCP server in Claude Code or Claude Desktop

```bash
claude mcp add cinequery -- pnpm --dir /path/to/cinequery mcp
```

For Claude Desktop, add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cinequery": {
      "command": "pnpm",
      "args": ["--dir", "/path/to/cinequery", "mcp"],
      "env": { "DATABASE_URL_READONLY": "postgres://cinequery_reader:...@.../cinequery" }
    }
  }
}
```

`CINEQUERY_AGENT_VERSION=v1` exposes the v1 toolset instead of all five tools.

## Evals

Questions live in `evals/questions.jsonl`, one per line:

```json
{"id": "j12", "category": "joins", "question": "Which director has directed Robert De Niro in the most movies?", "gold_sql": "SELECT p.name FROM ...", "ordered": false}
```

There are 100 questions, 20 in each category: single table, joins, aggregation, name ambiguity (e.g. "How many movies has Nolan directed?" must resolve to Christopher Nolan), and trends over time. The five example buttons on the ask page are eval questions too, and a test keeps the two lists in sync.

**Scoring** (`evals/score.ts`): the gold SQL runs against the same database. The agent passes when its final query's values match the gold values, ignoring column names. Extra columns are allowed, numbers match within 0.01, and order matters only when `ordered` is true. Every question states its vote threshold and, where needed, its tiebreak. `pnpm eval:check-gold` flags empty results, results over 200 rows, and ties at a `LIMIT` cutoff.

```bash
pnpm eval --version v1                         # full run -> evals/results/v1.json
pnpm eval --version v3 --category joins        # partial run -> evals/results/scratch/
pnpm eval --version v4 --model claude-opus-5-5     # second model -> v4.claude-opus-5-5.json
pnpm eval:all                                  # v1-v4, then refresh the README table
```

## Numbers

| Metric | Result |
|---|---|
| Movies and credits loaded | 49,466 movies, 330,144 people, 983,681 credits (full load, 1,000+ votes) |
| Eval questions | 100 (20 × 5 categories) |
| Accuracy v1 to final | _pending eval runs_ |
| Biggest single jump and what caused it | _pending eval runs_ |
| Median latency and cost per question | _pending eval runs_ |

## Project layout

```
db/            schema.sql, indexes.sql, ops.sql
scripts/       load-imdb.ts, setup-roles.ts, ask.ts, run-all-evals.sh
src/mcp/       MCP server factory + stdio entry
src/agent/     versions, prompt, agent loop, pricing
src/lib/       read-only DB runner, SQL guard, tools, abuse controls
src/app/       ask page, /evals page, POST /api/ask
evals/         questions.jsonl, scorer, runner, gold checker, results/
```

## Credits

Movie data courtesy of [IMDb](https://www.imdb.com), from the [IMDb non-commercial datasets](https://developer.imdb.com/non-commercial-datasets/), used for personal, non-commercial purposes. Built with Claude, the Model Context Protocol TypeScript SDK, Next.js, Recharts, and PostgreSQL.
