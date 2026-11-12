# Neon migration verification

Verified on 2026-11-12T11:12:22.733Z.

The four existing movie tables were copied from local PostgreSQL 18.1 to an empty Neon PostgreSQL 18.6 database. A custom-format backup is retained privately outside the repository. No fresh IMDb load was run, and the local database was not changed.

Each source and destination table was exported with ordered `COPY ... TO STDOUT`. Row counts and SHA-256 digests matched:

| Table | Rows | Matching content SHA-256 |
| --- | ---: | --- |
| `movies` | 49,466 | `b78de15e05d03479725531208f2e1ceccda0028d5b9567790f1040c2c1305ab2` |
| `ratings` | 49,466 | `3f8e8dfa43ee13158f9b724d00634b7d6f7ae8b29ca29329602f06411ec14e90` |
| `people` | 138,864 | `d6495ad5d462a3876e0037230145deeaa71f51e2e2347ef382cc549df55c6f46` |
| `credits` | 388,558 | `df0b1126b0eba093443c14032a39b35e457a87cd08e785ac878aab922fc362d3` |

Ordering: `tconst` for movies and ratings, `nconst` for people, and `(tconst, ordering)` for credits. Schema objects, indexes, constraints, and column comments were restored with the tables; `pg_trgm` was created before restore and table statistics were analyzed afterward.

## Runtime access

- Both app connections use the Neon pooled endpoint with `sslmode=verify-full` and separate random role passwords.
- `cinequery_reader` can read movie data, cannot update it, and cannot read request history.
- `cinequery_ops` can read/insert/update request accounting, cannot read movie tables, and has no DELETE privilege.
- All **100 reference SQL queries passed** using the pooled reader connection.
- **No model calls** or paid evaluations were made during migration verification.
- Existing local request history was not copied. The Neon `ops` schema starts fresh.

The owner-only setup values remain in ignored `.env.neon`. The private `.env.vercel` contains only the nine server runtime variables for Vercel and excludes the owner URL and setup-password variables. Both files have owner-only file permissions and must never be committed or pasted into chat.

Next: import `.env.vercel` for Production in Vercel, deploy the application, and perform one deliberate end-to-end question check. Neon idle compute and account plan settings are managed in the Neon Console; no background wake-up job was added.
