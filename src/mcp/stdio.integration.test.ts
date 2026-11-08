/**
 * Spawns the real stdio entry point the way Claude Desktop / Claude Code do,
 * and talks MCP to it over pipes. Skipped without DATABASE_URL_READONLY.
 */
import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL_READONLY);

describe.skipIf(!hasDb)("stdio MCP server", () => {
  it(
    "starts over stdio, lists tools, and answers a query",
    async () => {
      const transport = new StdioClientTransport({
        command: "pnpm",
        args: ["exec", "tsx", "src/mcp/stdio.ts"],
        env: { ...(process.env as Record<string, string>), CINEQUERY_AGENT_VERSION: "v3" },
        stderr: "ignore",
      });
      const client = new Client({ name: "stdio-test", version: "0" });
      await client.connect(transport);
      try {
        const { tools } = await client.listTools();
        expect(tools.map((t) => t.name).sort()).toEqual(
          ["describe_table", "list_tables", "run_query", "search_people", "search_titles"],
        );
        const res = await client.callTool({ name: "search_titles", arguments: { title: "heat" } });
        const text = (res.content as { text: string }[])[0].text;
        expect(JSON.parse(text)[0]).toMatchObject({ tconst: "tt0113277", year: 1995 });
      } finally {
        await client.close();
      }
    },
    30_000,
  );
});
