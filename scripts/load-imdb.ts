/**
 * R1: download IMDb's public TSV dumps, keep movies with enough votes, and
 * load them into Postgres with indexes.
 *
 * Files are streamed straight from datasets.imdbws.com through gunzip into
 * batched INSERTs — nothing is written to disk, so the 1 GB+ principals dump
 * never needs local space.
 *
 * Usage:
 *   tsx scripts/load-imdb.ts [--min-votes 1000] [--slim]
 *
 *   --min-votes N  keep movies with at least N votes (PRD default 1000)
 *   --slim         Neon fallback from the PRD risk table: keep only directors,
 *                  writers, and the top 5 billed actors/actresses per movie
 *   Tables always use durable LOGGED storage, including on Neon.
 *   --finish-only  skip the download and only run the post-load steps
 *                  (orphan cleanup, indexes, grants) — resumes a load that
 *                  failed at the index stage
 */
import "dotenv/config";
import { readFile, statfs } from "node:fs/promises";
import readline from "node:readline";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { createGunzip } from "node:zlib";
import pg from "pg";
import { env } from "../src/lib/env";

const BASE_URL = "https://datasets.imdbws.com";
const BATCH = 5000;
// Stop before exhausting the disk during loading or index creation.
const MIN_FREE_BYTES = 150 * 1024 * 1024;
const SEP = "\u001f"; // unit separator: safe to join arrays that may contain commas

// ---------------------------------------------------------------- args
function parseArgs(argv: string[]) {
  const opts = { minVotes: 1000, slim: false, finishOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--min-votes") opts.minVotes = Number(argv[++i]);
    else if (a === "--slim") opts.slim = true;
    else if (a === "--unlogged") {
      throw new Error("--unlogged is no longer supported: movie data must survive database restarts.");
    }
    else if (a === "--finish-only") opts.finishOnly = true;
    else throw new Error(`Unknown argument ${a}`);
  }
  if (!Number.isInteger(opts.minVotes) || opts.minVotes < 0) {
    throw new Error("--min-votes must be a non-negative integer");
  }
  return opts;
}

// ------------------------------------------------------------- helpers
const nul = (v: string | undefined) => (v === undefined || v === "\\N" ? null : v);
const int = (v: string | undefined) => {
  const s = nul(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
};

/** Stream a gzipped TSV from IMDb, yielding each data row split on tabs. */
async function* tsvRows(file: string): AsyncGenerator<string[]> {
  const res = await fetch(`${BASE_URL}/${file}`);
  if (!res.ok || !res.body) throw new Error(`GET ${file} failed: ${res.status}`);
  const input = Readable.fromWeb(res.body as unknown as WebReadableStream).pipe(createGunzip());
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let first = true;
  for await (const line of lines) {
    if (first) {
      first = false;
      continue; // header
    }
    if (line) yield line.split("\t");
  }
}

async function assertDiskSpace() {
  const s = await statfs(process.cwd());
  const free = Number(s.bavail) * Number(s.bsize);
  if (free < MIN_FREE_BYTES) {
    throw new Error(
      `Only ${(free / 1024 / 1024).toFixed(0)} MB free on disk; stopping before Postgres runs out of space.`,
    );
  }
}

function progress(label: string, scanned: number, kept: number) {
  process.stdout.write(`\r  ${label}: scanned ${scanned.toLocaleString()}, kept ${kept.toLocaleString()}   `);
}

// -------------------------------------------------------------- insert
type Batch = unknown[][]; // column-major: one array per column

async function flush(client: pg.Client, sql: string, cols: Batch) {
  if (cols[0].length === 0) return;
  await client.query(sql, cols);
  for (const c of cols) c.length = 0;
}

const INSERT_MOVIES = `
  INSERT INTO movies (tconst, title, year, runtime_min, genres)
  SELECT t, ti, y, r, CASE WHEN g IS NULL THEN '{}'::text[] ELSE string_to_array(g, ',') END
  FROM unnest($1::text[], $2::text[], $3::int[], $4::int[], $5::text[]) AS u(t, ti, y, r, g)`;

const INSERT_RATINGS = `
  INSERT INTO ratings (tconst, avg_rating, num_votes)
  SELECT * FROM unnest($1::text[], $2::numeric[], $3::int[])`;

const INSERT_CREDITS = `
  INSERT INTO credits (tconst, nconst, category, characters, ordering)
  SELECT t, n, c, CASE WHEN ch IS NULL THEN NULL ELSE string_to_array(ch, E'\\x1f') END, o
  FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::int[]) AS u(t, n, c, ch, o)`;

const INSERT_PEOPLE = `
  INSERT INTO people (nconst, name, birth_year, death_year, professions)
  SELECT n, nm, b, d, CASE WHEN p IS NULL THEN '{}'::text[] ELSE string_to_array(p, ',') END
  FROM unnest($1::text[], $2::text[], $3::int[], $4::int[], $5::text[]) AS u(n, nm, b, d, p)`;

/** title.principals stores characters as a JSON array string: ["Red"]. */
function parseCharacters(raw: string | null): string | null {
  if (raw === null) return null;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length > 0 ? arr.map(String).join(SEP) : null;
  } catch {
    return raw;
  }
}

// ---------------------------------------------------------------- main
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const started = Date.now();
  console.log(`Loading IMDb movies with >= ${opts.minVotes} votes${opts.slim ? " (slim credits)" : ""}`);

  const client = new pg.Client({ connectionString: env.adminDatabaseUrl() });
  await client.connect();
  // Keep sorts, hashes, and index builds in memory instead of spilling temp
  // files to disk (the orphan-cleanup anti-join spilled ~100 MB otherwise).
  await client.query("SET maintenance_work_mem = '512MB'");
  await client.query("SET work_mem = '512MB'");

  try {
    if (!opts.finishOnly) await loadTables(client, opts);
    await finish(client);
    console.log(`Done in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  } finally {
    await client.end();
  }
}

async function loadTables(client: pg.Client, opts: ReturnType<typeof parseArgs>) {
  console.log("1/6 recreating tables");
  await client.query(await readFile("db/schema.sql", "utf8"));

  // --- ratings: the vote filter decides everything downstream ---------
  console.log("2/6 title.ratings.tsv.gz");
  const ratings = new Map<string, { avg: string; votes: number }>();
  let scanned = 0;
  for await (const [tconst, avg, votes] of tsvRows("title.ratings.tsv.gz")) {
    scanned++;
    const v = Number(votes);
    if (v >= opts.minVotes) ratings.set(tconst, { avg, votes: v });
  }
  console.log(`  ${ratings.size.toLocaleString()} titles of any type pass the vote filter`);

  // --- movies -------------------------------------------------------
  console.log("3/6 title.basics.tsv.gz");
  const movieIds = new Set<string>();
  const mCols: Batch = [[], [], [], [], []];
  const rCols: Batch = [[], [], []];
  scanned = 0;
  for await (const row of tsvRows("title.basics.tsv.gz")) {
    scanned++;
    // tconst titleType primaryTitle originalTitle isAdult startYear endYear runtimeMinutes genres
    const [tconst, type, title, , , startYear, , runtime, genres] = row;
    if (type !== "movie") continue;
    const r = ratings.get(tconst);
    if (!r) continue;
    movieIds.add(tconst);
    mCols[0].push(tconst);
    mCols[1].push(title);
    mCols[2].push(int(startYear));
    mCols[3].push(int(runtime));
    mCols[4].push(nul(genres));
    rCols[0].push(tconst);
    rCols[1].push(r.avg);
    rCols[2].push(r.votes);
    if (mCols[0].length >= BATCH) {
      await flush(client, INSERT_MOVIES, mCols);
      await flush(client, INSERT_RATINGS, rCols);
    }
    if (scanned % 250_000 === 0) progress("basics", scanned, movieIds.size);
  }
  await flush(client, INSERT_MOVIES, mCols);
  await flush(client, INSERT_RATINGS, rCols);
  ratings.clear();
  progress("basics", scanned, movieIds.size);
  console.log();

  // --- credits ------------------------------------------------------
  console.log("4/6 title.principals.tsv.gz (largest file, a few minutes)");
  const personIds = new Set<string>();
  const cCols: Batch = [[], [], [], [], []];
  let creditCount = 0;
  let currentMovie = "";
  let actorsSeen = 0;
  scanned = 0;
  for await (const row of tsvRows("title.principals.tsv.gz")) {
    scanned++;
    if (scanned % 1_000_000 === 0) progress("principals", scanned, creditCount);
    // tconst ordering nconst category job characters
    const [tconst, ordering, nconst, category, , characters] = row;
    if (!movieIds.has(tconst)) continue;
    if (tconst !== currentMovie) {
      currentMovie = tconst;
      actorsSeen = 0;
    }
    if (opts.slim) {
      const isCast = category === "actor" || category === "actress";
      if (isCast) actorsSeen++;
      const keep = category === "director" || category === "writer" || (isCast && actorsSeen <= 5);
      if (!keep) continue;
    }
    personIds.add(nconst);
    cCols[0].push(tconst);
    cCols[1].push(nconst);
    cCols[2].push(category);
    cCols[3].push(parseCharacters(nul(characters)));
    cCols[4].push(int(ordering));
    creditCount++;
    if (cCols[0].length >= BATCH) {
      await assertDiskSpace();
      await flush(client, INSERT_CREDITS, cCols);
    }
  }
  await flush(client, INSERT_CREDITS, cCols);
  progress("principals", scanned, creditCount);
  console.log();

  // --- people -------------------------------------------------------
  console.log("5/6 name.basics.tsv.gz");
  const pCols: Batch = [[], [], [], [], []];
  let peopleCount = 0;
  scanned = 0;
  for await (const row of tsvRows("name.basics.tsv.gz")) {
    scanned++;
    // nconst primaryName birthYear deathYear primaryProfession knownForTitles
    const [nconst, name, birth, death, professions] = row;
    if (!personIds.has(nconst)) continue;
    pCols[0].push(nconst);
    pCols[1].push(name);
    pCols[2].push(int(birth));
    pCols[3].push(int(death));
    pCols[4].push(nul(professions) || null);
    peopleCount++;
    if (pCols[0].length >= BATCH) {
      await assertDiskSpace();
      await flush(client, INSERT_PEOPLE, pCols);
    }
    if (scanned % 1_000_000 === 0) progress("names", scanned, peopleCount);
  }
  await flush(client, INSERT_PEOPLE, pCols);
  progress("names", scanned, peopleCount);
  console.log();
}

async function finish(client: pg.Client) {
  // Also repair persistence when resuming a load made by an older loader.
  await client.query(await readFile("db/durable.sql", "utf8"));
  // A handful of principals reference people missing from name.basics;
  // drop those so the foreign key can be added.
  const orphans = await client.query(
    "DELETE FROM credits c WHERE NOT EXISTS (SELECT 1 FROM people p WHERE p.nconst = c.nconst)",
  );
  if (orphans.rowCount) console.log(`  dropped ${orphans.rowCount} credits with no matching person`);

  // --- indexes ------------------------------------------------------
  console.log("6/6 building indexes and foreign keys");
  // One statement at a time so a disk check runs before each index build.
  const statements = (await readFile("db/indexes.sql", "utf8"))
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await assertDiskSpace();
    await client.query(stmt);
  }
  // Recreating tables drops grants; restore them if the reader role exists.
  await client.query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cinequery_reader') THEN
      GRANT SELECT ON movies, ratings, people, credits TO cinequery_reader;
    END IF; END $$`);

  const counts = await client.query<{ t: string; n: string; size: string }>(`
    SELECT t, n::text, pg_size_pretty(pg_total_relation_size(t::regclass)) AS size FROM (
      SELECT 'movies' AS t, count(*) AS n FROM movies UNION ALL
      SELECT 'ratings', count(*) FROM ratings UNION ALL
      SELECT 'people', count(*) FROM people UNION ALL
      SELECT 'credits', count(*) FROM credits) x`);
  console.log("\nLoaded:");
  for (const r of counts.rows) console.log(`  ${r.t.padEnd(8)} ${Number(r.n).toLocaleString().padStart(10)} rows  ${r.size}`);
  const db = await client.query<{ size: string }>("SELECT pg_size_pretty(pg_database_size(current_database())) AS size");
  console.log(`  database size: ${db.rows[0].size}`);
}

main().catch((err) => {
  console.error("\n", err);
  process.exit(1);
});
