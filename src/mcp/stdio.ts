/**
 * Run the Cinequery MCP server over stdio for Claude Desktop or Claude Code.
 *
 *   claude mcp add cinequery -- pnpm --dir /path/to/cinequery mcp
 *
 * Needs DATABASE_URL_READONLY. CINEQUERY_AGENT_VERSION picks the toolset
 * (default v4, which exposes all five tools).
 */
import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getVersion } from "../agent/versions";
import { createCinequeryServer } from "./server";

async function main() {
  const version = getVersion(process.env.CINEQUERY_AGENT_VERSION);
  const server = createCinequeryServer(version);
  await server.connect(new StdioServerTransport());
  // stdout carries the protocol; log to stderr only.
  console.error(`cinequery MCP server (${version.id}) ready on stdio`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
