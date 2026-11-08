/**
 * Run one or more .sql files against DATABASE_URL_ADMIN.
 * Usage: tsx scripts/apply-sql.ts db/schema.sql [db/ops.sql ...]
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { env } from "../src/lib/env";

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("Usage: tsx scripts/apply-sql.ts <file.sql> [...]");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: env.adminDatabaseUrl() });
  await client.connect();
  try {
    for (const file of files) {
      const sql = await readFile(file, "utf8");
      const started = Date.now();
      await client.query(sql);
      console.log(`applied ${file} in ${Date.now() - started} ms`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
