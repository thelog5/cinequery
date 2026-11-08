/**
 * Cinequery MCP server. One factory builds the server for any agent version;
 * the web app links it to a client in-process, and src/mcp/stdio.ts exposes the
 * same server to Claude Desktop / Claude Code over stdio.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { AgentVersion } from "../agent/versions";
import { QueryError } from "../lib/db";
import { TABLES, describeTable, listTables, runQuery, searchPeople, searchTitles } from "../lib/tools";

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

function fail(err: unknown): CallToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text: message }], isError: true };
}

async function guarded(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    if (err instanceof QueryError || err instanceof Error) return fail(err);
    return fail(String(err));
  }
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;

export function createCinequeryServer(version: AgentVersion): McpServer {
  const server = new McpServer({ name: "cinequery", version: `0.1.0-${version.id}` });

  server.registerTool(
    "list_tables",
    {
      title: "List tables",
      description:
        "List the tables in the IMDb movie database with a one-line description of each. " +
        "Call this first if you don't know the schema.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => guarded(() => listTables()),
  );

  server.registerTool(
    "describe_table",
    {
      title: "Describe a table",
      description: version.richDescribe
        ? "Show a table's columns with types, nullability, and a comment explaining each column's meaning " +
          "and gotchas, plus 3 sample rows. Read this before writing SQL against a table."
        : "Show a table's columns with their types and nullability.",
      inputSchema: {
        table: z.enum(TABLES).describe("Table name"),
      },
      annotations: READ_ONLY,
    },
    async ({ table }) => guarded(() => describeTable(table, { rich: version.richDescribe })),
  );

  if (version.searchTools) {
    server.registerTool(
      "search_people",
      {
        title: "Search people by name",
        description:
          "Fuzzy-search cast and crew by name (handles partial names, surnames only, and typos). " +
          "Returns the top 5 matches ranked by name similarity and then fame, each with nconst, " +
          "professions, movie count, and their 3 best-known movies. Use the nconst in SQL instead of " +
          "matching on name, because names are not unique.",
        inputSchema: {
          name: z.string().min(1).max(200).describe("Full or partial name, e.g. 'Nolan' or 'meryl streep'"),
        },
        annotations: READ_ONLY,
      },
      async ({ name }) => guarded(() => searchPeople(name)),
    );

    server.registerTool(
      "search_titles",
      {
        title: "Search movies by title",
        description:
          "Fuzzy-search movies by title (handles partial titles and typos). Returns the top 5 matches " +
          "ranked by title similarity and then vote count, each with tconst, year, rating, and votes. " +
          "Use the tconst in SQL, because titles are not unique (remakes share titles).",
        inputSchema: {
          title: z.string().min(1).max(300).describe("Full or partial movie title, e.g. 'shawshank'"),
        },
        annotations: READ_ONLY,
      },
      async ({ title }) => guarded(() => searchTitles(title)),
    );
  }

  server.registerTool(
    "run_query",
    {
      title: "Run a read-only SQL query",
      description:
        "Run one PostgreSQL SELECT (or WITH ... SELECT) query and get back columns, rows, row count, and " +
        "execution time. Read-only; at most 200 rows are returned (truncated=true when there were more); " +
        "queries are cancelled after 5 seconds. On an error, read the message, fix the SQL, and retry.",
      inputSchema: {
        sql: z.string().min(1).max(10_000).describe("A single PostgreSQL SELECT statement"),
      },
      annotations: READ_ONLY,
    },
    async ({ sql }) => guarded(() => runQuery(sql)),
  );

  return server;
}
