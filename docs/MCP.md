# Use Cinequery as an MCP server

The same movie-data tools used by the website can run over stdio for Claude
Code, Claude Desktop, or another MCP client. This needs Node 24, the project
dependencies, and a loaded database. The MCP server itself does not need an
Anthropic key; the client supplies the model.

## Claude Code

```bash
claude mcp add cinequery -- pnpm --dir /path/to/cinequery mcp
```

Give that process `DATABASE_URL_READONLY` for the restricted reader role.
The local `.env` can hold it; never publish a real connection string in an
MCP configuration committed to Git.

## Claude Desktop

Merge this entry into your local `claude_desktop_config.json`, replacing the
path and placeholder privately:

```json
{
  "mcpServers": {
    "cinequery": {
      "command": "pnpm",
      "args": ["--dir", "/path/to/cinequery", "mcp"],
      "env": {
        "DATABASE_URL_READONLY": "<private reader connection string>"
      }
    }
  }
}
```

## Tools and versions

The default version exposes `list_tables`, `describe_table`, `search_people`,
`search_titles`, and `run_query`. Set `CINEQUERY_AGENT_VERSION=v1` to use the
original three-tool version. SQL restrictions, the read-only transaction,
the query timeout, and row limits apply through either interface.

The website's HTTP per-IP admission controls do not apply to a locally
launched stdio process. Only give the client a restricted database role.
