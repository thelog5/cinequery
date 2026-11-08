/**
 * The five data tools behind the MCP server. Pure async functions so the same
 * code serves the stdio server, the in-process server the web app uses, and
 * unit tests.
 */
import { internalQuery, rowsToObjects, runReadOnlyQuery } from "./db";

export const TABLES = ["movies", "ratings", "people", "credits"] as const;
export type TableName = (typeof TABLES)[number];

export function isTableName(name: string): name is TableName {
  return (TABLES as readonly string[]).includes(name);
}

// ------------------------------------------------------------ list_tables
export interface TableSummary {
  table: string;
  description: string;
}

export async function listTables(): Promise<TableSummary[]> {
  const rows = await internalQuery<{ table: string; description: string | null }>(
    `SELECT c.relname AS table, obj_description(c.oid, 'pg_class') AS description
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1)
      ORDER BY array_position($1, c.relname::text)`,
    [TABLES],
  );
  return rows.map((r) => ({ table: r.table, description: r.description ?? "" }));
}

// --------------------------------------------------------- describe_table
export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  comment?: string;
}

export interface TableDescription {
  table: string;
  columns: ColumnInfo[];
  sample_rows?: Record<string, unknown>[];
}

/** Illustrative samples: rows tied to the most-voted films, not tt0000001 curiosities. */
const SAMPLE_QUERIES: Record<TableName, string> = {
  movies: `SELECT m.* FROM movies m JOIN ratings r USING (tconst) ORDER BY r.num_votes DESC LIMIT 3`,
  ratings: `SELECT * FROM ratings ORDER BY num_votes DESC LIMIT 3`,
  people: `SELECT p.* FROM credits c JOIN ratings r USING (tconst) JOIN people p USING (nconst)
            WHERE c.category = 'director' ORDER BY r.num_votes DESC LIMIT 3`,
  credits: `SELECT c.* FROM credits c JOIN ratings r USING (tconst)
            ORDER BY r.num_votes DESC, c.ordering LIMIT 3`,
};

export async function describeTable(
  table: string,
  opts: { rich: boolean },
): Promise<TableDescription> {
  if (!isTableName(table)) {
    throw new Error(`Unknown table "${table}". Tables: ${TABLES.join(", ")}.`);
  }
  const cols = await internalQuery<{ name: string; type: string; nullable: boolean; comment: string | null }>(
    `SELECT a.attname AS name,
            format_type(a.atttypid, a.atttypmod) AS type,
            NOT a.attnotnull AS nullable,
            col_description(a.attrelid, a.attnum) AS comment
       FROM pg_attribute a
      WHERE a.attrelid = ('public.' || $1)::regclass AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attnum`,
    [table],
  );

  const columns: ColumnInfo[] = cols.map((c) =>
    opts.rich
      ? { name: c.name, type: c.type, nullable: c.nullable, comment: c.comment ?? "" }
      : { name: c.name, type: c.type, nullable: c.nullable },
  );
  if (!opts.rich) return { table, columns };

  const sample = await internalQuery<Record<string, unknown>>(SAMPLE_QUERIES[table]);
  return { table, columns, sample_rows: sample };
}

// ---------------------------------------------------------- search_people
export interface PersonMatch {
  nconst: string;
  name: string;
  birth_year: number | null;
  death_year: number | null;
  professions: string[];
  movie_count: number;
  known_for: string[];
}

/**
 * Fuzzy match on name, then rank by how well-known the person is (total
 * votes across their credited movies), so "Nolan" surfaces Christopher Nolan
 * before the dozens of other Nolans.
 */
export async function searchPeople(fragment: string): Promise<PersonMatch[]> {
  const q = fragment.trim();
  if (!q) throw new Error("Provide part of a name to search for.");
  return internalQuery<PersonMatch>(
    `WITH cand AS (
       SELECT nconst, name, birth_year, death_year, professions,
              word_similarity($1, name) AS sim
         FROM people
        WHERE $1 <% name OR name ILIKE '%' || $1 || '%'
        ORDER BY sim DESC
        LIMIT 2000
     ), scored AS (
       SELECT c.*, pop.movie_count, pop.total_votes
         FROM cand c
         CROSS JOIN LATERAL (
           SELECT count(DISTINCT cr.tconst)::int AS movie_count,
                  coalesce(sum(r.num_votes), 0)::bigint AS total_votes
             FROM credits cr JOIN ratings r USING (tconst)
            WHERE cr.nconst = c.nconst
         ) pop
        ORDER BY round(c.sim::numeric, 1) DESC, pop.total_votes DESC
        LIMIT 5
     )
     SELECT s.nconst, s.name, s.birth_year, s.death_year, s.professions, s.movie_count,
            coalesce(kf.titles, '{}') AS known_for
       FROM scored s
       CROSS JOIN LATERAL (
         SELECT array_agg(t ORDER BY v DESC) AS titles FROM (
           SELECT m.title || ' (' || coalesce(m.year::text, '?') || ')' AS t, r.num_votes AS v
             FROM (SELECT DISTINCT tconst FROM credits WHERE nconst = s.nconst) cr
             JOIN movies m USING (tconst) JOIN ratings r USING (tconst)
            ORDER BY r.num_votes DESC
            LIMIT 3
         ) y
       ) kf
      ORDER BY round(s.sim::numeric, 1) DESC, s.total_votes DESC`,
    [q],
  );
}

// ---------------------------------------------------------- search_titles
export interface TitleMatch {
  tconst: string;
  title: string;
  year: number | null;
  avg_rating: number;
  num_votes: number;
}

export async function searchTitles(fragment: string): Promise<TitleMatch[]> {
  const q = fragment.trim();
  if (!q) throw new Error("Provide part of a title to search for.");
  return internalQuery<TitleMatch>(
    `SELECT m.tconst, m.title, m.year, r.avg_rating, r.num_votes
       FROM (
         SELECT tconst, title, year, word_similarity($1, title) AS sim
           FROM movies
          WHERE $1 <% title OR title ILIKE '%' || $1 || '%'
          ORDER BY sim DESC
          LIMIT 500
       ) m
       JOIN ratings r USING (tconst)
      ORDER BY round(m.sim::numeric, 1) DESC, r.num_votes DESC
      LIMIT 5`,
    [q],
  );
}

// -------------------------------------------------------------- run_query
export interface RunQueryResult {
  columns: string[];
  rows: unknown[][];
  row_count: number;
  truncated: boolean;
  execution_ms: number;
}

export async function runQuery(sql: string): Promise<RunQueryResult> {
  const r = await runReadOnlyQuery(sql);
  return {
    columns: r.columns,
    rows: r.rows,
    row_count: r.rowCount,
    truncated: r.truncated,
    execution_ms: r.elapsedMs,
  };
}

export { rowsToObjects };
