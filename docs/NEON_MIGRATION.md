# Neon migration verification

Initial content verification: 2026-11-12T11:12:22.733Z. Restored and reverified after the durability repair on 2026-11-12; see below.

The four existing movie tables were copied from local PostgreSQL 18.1 to an empty Neon PostgreSQL 18.6 database. A custom-format backup is retained privately outside the repository. No fresh IMDb load was run, and the local database was not changed.

Each source and destination table was exported with ordered `COPY ... TO STDOUT`. Row counts and SHA-256 digests matched:

| Table | Rows | Matching content SHA-256 |
| --- | ---: | --- |
| `movies` | 49,466 | `b78de15e05d03479725531208f2e1ceccda0028d5b9567790f1040c2c1305ab2` |
| `ratings` | 49,466 | `3f8e8dfa43ee13158f9b724d00634b7d6f7ae8b29ca29329602f06411ec14e90` |
| `people` | 138,864 | `d6495ad5d462a3876e0037230145deeaa71f51e2e2347ef382cc549df55c6f46` |
| `credits` | 388,558 | `df0b1126b0eba093443c14032a39b35e457a87cd08e785ac878aab922fc362d3` |

Ordering: `tconst` for movies and ratings, `nconst` for people, and `(tconst, ordering)` for credits. Schema objects, indexes, constraints, and column comments were restored with the tables; `pg_trgm` was created before restore and table statistics were analyzed afterward.

## Durability repair

The first migration preserved the local tables' UNLOGGED storage setting. Content and permission checks passed, but those checks missed persistence. All four movie tables were later found empty after Neon compute restarted. UNLOGGED data is unsuitable for Neon's disposable compute storage.

The existing empty tables were converted to LOGGED storage before restoring data only from the retained private backup. Parents were converted and loaded before dependent tables. No schema, role password, request history, or Vercel configuration was replaced. The local database remained unchanged.

- All four row counts and ordered content hashes matched again.
- `pg_class.relpersistence` is now `p` for all four movie tables and `ops.requests`.
- Both restricted pooled roles passed their permission checks again.
- All 100 reference SQL queries passed again without model calls.
- The deployed streaming API answered the average-runtime-by-decade question with 13 rows and a line chart; recorded model cost was approximately $0.00092.
- After more than six minutes without queries, the next connection confirmed a compute restart: `pg_postmaster_start_time()` changed from 2026-11-12T11:34:33.041Z to 2026-11-12T11:47:56.022Z. All four row counts survived. The pooled reader still found The Godfather (1972) and returned all 13 decade rows. Checked at 2026-11-12T11:48:45.058Z.
- Post-restore `VACUUM (ANALYZE)` refreshed statistics and visibility maps. Subsequent individual table counts took 91–110 ms with the reader's unchanged five-second statement timeout. The full cold count audit used a longer transaction-local verification timeout; app limits were not changed.

The loader no longer accepts `--unlogged`. `db/durable.sql` and `pnpm db:durable` convert restored tables to logged storage, and the deployment guide now requires checking persistence and row counts after an idle cycle. An integration test checks that conversion preserves data and foreign keys and can be repeated safely.

## Runtime access

- Both app connections use the Neon pooled endpoint with `sslmode=verify-full` and separate random role passwords.
- `cinequery_reader` can read movie data, cannot update it, and cannot read request history.
- `cinequery_ops` can read/insert/update request accounting, cannot read movie tables, and has no DELETE privilege.
- All **100 reference SQL queries passed** using the pooled reader connection.
- The reference-query checks make **no model calls**. A separate live diagnostic and a post-repair question were used to verify the deployed API; no full paid evaluation was rerun.
- Existing local request history was not copied. Live Neon request accounting was preserved during the repair.

The owner-only setup values remain in ignored `.env.neon`. The private `.env.vercel` contains only the nine server runtime variables for Vercel and excludes the owner URL and setup-password variables. Both files have owner-only file permissions and must never be committed or pasted into chat.

The application is deployed at [cinequerymovie.vercel.app](https://cinequerymovie.vercel.app). Neon idle compute and account plan settings remain managed in the Neon Console; no background wake-up job was added.
