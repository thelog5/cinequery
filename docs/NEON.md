# Neon deployment and idle compute

The app works with ordinary PostgreSQL connection strings, including Neon's pooled endpoints. There is no Neon-specific driver to install.

## When the database runs

- Loading the homepage, viewing images, and opening the Accuracy page make no database requests. Both pages are static; accuracy scores come from committed JSON files.
- The database is contacted when someone submits a question to `POST /api/ask`. Request tracking and the agent's movie queries run at that point.
- The app opens connections lazily and closes idle connections after five seconds. It has no background polling, warm-up queries, cron jobs, or database health pings.
- Build and deployment do not run evaluations or load IMDb data. Those are explicit terminal commands and consume compute while running.

Neon Free suspends compute after about five minutes without queries. Closing the app's connections does not suspend Neon immediately: the inactivity window still counts. A real question wakes it again, so the first answer after an idle period can take a little longer. Keeping a browser tab open does not keep it awake.

## Connect a Neon project

1. Create a Free project near the region where the website will run. Keep scale to zero enabled and start with a fixed 0.25 CU compute rather than a larger compute.
2. In Neon's connection dialog, copy the **direct**, SSL-enabled owner connection string. Set it as `DATABASE_URL_ADMIN` locally for setup only. Keep local database credentials backed up privately before replacing them.
3. Set strong, separate `READER_PASSWORD` and `OPS_PASSWORD` values. Initialize an empty Neon database with:

   ```bash
   pnpm db:load
   pnpm db:ops
   pnpm db:roles
   pnpm eval:check-gold
   ```

   `db:load` recreates the movie tables: run it only on the intended empty target. It downloads the current IMDb dataset; to preserve the exact dataset used for the saved evaluations, migrate the existing movie tables with `pg_dump`/`pg_restore` instead, then run `db:ops` and `db:roles`. Do not repeat full evaluation runs just to deploy: the saved results already ship with the website.

4. Build SSL connection strings for `cinequery_reader` and `cinequery_ops`, using those passwords and the same Neon database. Enable **Connection pooling** in the dialog: app hostnames should contain `-pooler`. Keep `sslmode=require` in both URLs.
5. Configure the deployed website with:

   ```text
   DATABASE_URL_READONLY=<pooled cinequery_reader URL>
   DATABASE_URL_OPS=<pooled cinequery_ops URL>
   ANTHROPIC_API_KEY=<your API key>
   CINEQUERY_MODEL=claude-haiku-5-5
   DAILY_SPEND_CAP_USD=0.50
   RATE_LIMIT_PER_HOUR=10
   IP_HASH_SALT=<a private random value>
   ```

   Do not configure `DATABASE_URL_ADMIN`, `READER_PASSWORD`, or `OPS_PASSWORD` on the website. Create `IP_HASH_SALT` with `openssl rand -hex 32` and keep it stable.

6. Deploy the normal `pnpm build` output. Ask one question to verify access, then leave the app idle. Check the Neon compute status after at least five minutes, closing Neon SQL Editor and other tools that might issue queries. Avoid uptime monitors that submit movie questions or run SQL health checks.

On Neon's current Free plan, 100 CU-hours would provide approximately 400 active hours at a fixed 0.25 CU. Spreading isolated questions throughout the day also incurs each five-minute idle window. Storage and traffic limits apply separately.

Sources: [Scale to Zero](https://neon.com/docs/introduction/scale-to-zero), [Connection pooling](https://neon.com/docs/connect/connection-pooling), [Pricing](https://neon.com/pricing).
