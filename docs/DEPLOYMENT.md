# Deploy the saved dataset: local PostgreSQL → Neon → Vercel

The existing local movie dataset was migrated to Neon on 2026-11-12; see [verification](NEON_MIGRATION.md). Runtime configuration for the owner's Vercel import is saved privately in `.env.vercel` and is ignored by Git. The local database remains intact. The steps below describe how to repeat the migration into an empty target. Preserve the evaluated dataset rather than downloading today's IMDb data. See also [idle-compute behavior](NEON.md).

## 1. Prepare without cloud usage

- Review [public-repository checks](../CONTRIBUTING.md#before-making-the-repository-public), `git status`, and `git diff`. Commit the intended source changes, new documentation, licensed assets, and all four saved evaluation JSON files, then push to GitHub. Untracked or unpushed files do not reach Vercel. Never stage `.env` or database backups.
- Use Node 24 and pnpm 10.27.0, pinned in `.nvmrc` and `package.json`. Local checks do not prove a hosted deployment works.
- Run `pnpm install --frozen-lockfile` and `pnpm build` locally. Builds must not load data, run evaluations, or contact PostgreSQL. A local production build with inaccessible database URLs has passed; recheck after changes to imports or static pages.
- Keep the local database and its credentials intact. Store backups outside this repository. Do not provision paid resources, enable paid add-ons, or run model evaluations as part of deployment.

## 2. Copy the exact movie dataset to an EMPTY Neon target

1. Create a Neon **Free** project near the intended application region. Start at a fixed **0.25 CU** (or minimum and maximum both 0.25 where offered). Keep scale to zero enabled; Free compute suspends after **five minutes** of inactivity. Check the current console limits before provisioning; do not upgrade to complete these steps. [Compute settings](https://neon.com/docs/manage/computes), [scale to zero](https://neon.com/docs/introduction/scale-to-zero).
2. Select a fresh target database with **no application tables**, including no `ops.requests`. Confirm its host and database name. Copy the **direct**, SSL-enabled owner URL into a private local shell as `DATABASE_URL_ADMIN`; keep the source URL separately as `LOCAL_DATABASE_URL`. Do not paste credentials into commands saved in shell history, issues, or chat. Use PostgreSQL dump tools compatible with the source server and a target PostgreSQL version at least as new as the source.
3. Pause local data changes, then run this from the repository root with both URLs already exported. The archive contains the four movie tables, their rows, indexes, constraints, and comments; it deliberately excludes local request history, passwords, and role grants. Create the extension separately because a table-only dump does not include its dependencies. [Neon dump/restore guide](https://neon.com/docs/import/migrate-from-postgres).

   ```bash
   umask 077
   mkdir -p "$HOME/backups/cinequery"
   pg_dump --dbname="$LOCAL_DATABASE_URL" --format=custom \
     --no-owner --no-acl \
     --table=public.movies --table=public.ratings \
     --table=public.people --table=public.credits \
     --file="$HOME/backups/cinequery/movies.dump"
   pg_restore --list "$HOME/backups/cinequery/movies.dump"
   psql "$DATABASE_URL_ADMIN" -X -v ON_ERROR_STOP=1 \
     -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm;'
   pg_restore --dbname="$DATABASE_URL_ADMIN" --no-owner --no-acl \
     --exit-on-error --single-transaction \
     "$HOME/backups/cinequery/movies.dump"
   # Dumps preserve UNLOGGED tables from the source. Make them durable now.
   psql "$DATABASE_URL_ADMIN" -X -v ON_ERROR_STOP=1 -f db/durable.sql
   # Refresh statistics and visibility maps after the bulk restore.
   psql "$DATABASE_URL_ADMIN" -X -v ON_ERROR_STOP=1 \
     -c 'VACUUM (ANALYZE) public.movies, public.ratings, public.people, public.credits;'
   ```

   Stop on any error. Do not add `--clean`, restore over existing tables, or run `pnpm db:load`: the loader drops/recreates tables and fetches a different dataset. If a restore fails, investigate before retrying against an empty target. Never overwrite the retained local database. The durability step is required: UNLOGGED movie tables lose their rows when Neon compute restarts. Run it immediately after restoring, before leaving the database idle. It preserves existing rows, permissions, indexes, and foreign keys.

4. Generate separate strong passwords for `READER_PASSWORD` and `OPS_PASSWORD`, keep them local, then run:

   ```bash
   pnpm db:ops
   pnpm db:roles
   ```

   `cinequery_reader` gets SELECT access to the four movie tables. `cinequery_ops` gets SELECT/INSERT/UPDATE on `ops.requests` and sequence usage. Neither app connection should use the owner role. Verify privileges on the fresh target; never reuse an elevated role as an app role.

5. Compare exact row counts on source and target for all four tables, and check indexes, foreign keys, comments, and persistence. The query below must return all four tables with `relpersistence = 'p'` (permanent/logged); `u` is unsafe. For content verification, compare SHA-256 hashes of ordered `COPY (SELECT * FROM … ORDER BY …) TO STDOUT` output: order movies/ratings by `tconst`, people by `nconst`, and credits by `(tconst, ordering)`. Keep the source unchanged throughout comparison. Build the reader URL, then optionally run `pnpm eval:check-gold` against the target: it runs SQL only, consumes database compute, and does not call the model. Do not rerun saved model evaluations merely to deploy.

   ```sql
   SELECT relname, relpersistence
   FROM pg_class
   WHERE relnamespace = 'public'::regnamespace
     AND relname IN ('movies', 'ratings', 'people', 'credits');
   ```

## 3. Set runtime secrets

Use Neon's **pooled** SSL URLs for the two app roles: hostnames contain `-pooler`; retain `sslmode=require` and other supplied SSL parameters. The app uses ordinary `pg`, so no Neon driver is needed. URL-encode passwords when assembling URLs. [Connection pooling](https://neon.com/docs/connect/connection-pooling).

For the prepared deployment, import the private `.env.vercel` file into Vercel's **Production** environment, or enter its values individually. Do not import `.env.neon`: it contains owner/setup credentials. Neither file belongs in Git.

Set these server-side values in the deployment's **Production** environment:

| Variable | Value |
| --- | --- |
| `DATABASE_URL_READONLY` | Pooled SSL URL for `cinequery_reader` |
| `DATABASE_URL_OPS` | Pooled SSL URL for `cinequery_ops` |
| `ANTHROPIC_API_KEY` | Private key for the intended workspace |
| `CINEQUERY_MODEL` | `claude-haiku-5-5` (verify access in your account) |
| `CINEQUERY_EFFORT` | `medium` |
| `DAILY_SPEND_CAP_USD` | `0.50` |
| `RATE_LIMIT_PER_HOUR` | `10` |
| `MAX_CONCURRENT_REQUESTS` | `2` |
| `IP_HASH_SALT` | Private output of `openssl rand -hex 32`; keep stable |

Never put `DATABASE_URL_ADMIN`, `READER_PASSWORD`, or `OPS_PASSWORD` on Vercel. Never prefix a secret with `NEXT_PUBLIC_`. Production requires the ops connection and a private salt; do not rely on local-development fallbacks. Configure a conservative Anthropic console workspace spend limit as the provider backstop. Application rate/concurrency controls reduce abuse, and the daily cap checks recorded estimated spend; in-flight calls, failed accounting, and provider pricing changes can still overshoot it.

Keep **Preview** credentials separate: use an isolated database/branch with fresh ops history, separate roles/passwords, key, and salt within available free allowances. Do not expose production credentials to untrusted PR builds. If isolated resources are not ready, leave Preview service secrets unset and use previews for static UI only; question requests should fail closed. Scope variables explicitly and redeploy after changes. [Vercel environments](https://vercel.com/docs/deployments/environments), [environment variables](https://vercel.com/docs/environment-variables).

## 4. Import GitHub into Vercel

1. Import the reviewed GitHub repository into a Vercel project and select the Next.js framework preset and repository root. Use only the required repository permissions. [GitHub integration](https://vercel.com/docs/git/vercel-for-github).
2. Set **Install Command** to `pnpm install --frozen-lockfile` and **Build Command** to `pnpm build`; retain the framework output defaults. Do not append database setup, tests that use a database, `pnpm eval`, or `pnpm eval:all`. [Build configuration](https://vercel.com/docs/builds/configure-a-build).
3. Select **Node.js 24.x** in project settings. The repository also pins `engines.node` to `24.x`; inspect deployment build logs for the version actually selected. [Supported Node versions and overrides](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
4. Review Production/Preview variable scopes before the first deployment. The route uses the Node.js runtime and declares `maxDuration = 120`; confirm the account's effective function duration supports it without a paid upgrade. No deployment has yet verified these account settings.
5. In Vercel's **Firewall**, configure available edge WAF rules for `/api/ask` to block abusive sources and suspicious traffic before it reaches the function. App-level admission checks use PostgreSQL, so even rejected requests can wake Neon. Review firewall events and test legitimate requests after rule changes. Stay within included rules/allowances; do not enable metered features or add-ons. [Vercel WAF and plan limits](https://vercel.com/docs/vercel-firewall/vercel-waf).

## 5. Verify and leave idle

- Open `/` and `/evals` (Accuracy): they should serve static/cached content and saved scores without a database or model request. Accuracy updates when reviewed JSON is committed and rebuilt, not through live evaluations.
- Confirm missing production ops/salt configuration fails closed; check malformed JSON, the 4 KB body limit, origin checks, and generic public errors with non-billable tests. Test admission limits against a disposable local database rather than issuing repeated paid questions.
- An end-to-end question uses the model and database; make that a deliberate owner-run smoke check only when ready for that usage. Verify reader/ops permissions and accounting before sharing the URL.
- Add no polling, warm-up queries, cron jobs, automatic evals, or SQL-backed uptime monitors. Close SQL editors and other clients, wait at least five minutes after the last database query, and inspect Neon compute status. Reconnect once and verify that all four row counts survived; compare `pg_postmaster_start_time()` before and after to confirm a compute restart actually occurred. An open static page should not keep compute active; the next real question can have a cold start.
- Keep the local backup until migration and permissions are verified. If abuse occurs, block `/api/ask` at the edge first, then rotate exposed credentials and redeploy. See [security guidance](../SECURITY.md).
