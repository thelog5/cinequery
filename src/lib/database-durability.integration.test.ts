import "dotenv/config";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { expect, it } from "vitest";

const url = process.env.DATABASE_URL_ADMIN;
const local = url && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);

it.skipIf(!local)("converts restored unlogged tables without losing rows or foreign keys", async () => {
  const client = new pg.Client({ connectionString: url });
  const schema = `durability_${randomUUID().replaceAll("-", "")}`;
  await client.connect();
  try {
    await client.query(`
      CREATE SCHEMA ${schema};
      CREATE UNLOGGED TABLE ${schema}.movies (id int PRIMARY KEY);
      CREATE UNLOGGED TABLE ${schema}.people (id int PRIMARY KEY);
      CREATE UNLOGGED TABLE ${schema}.ratings (id int PRIMARY KEY REFERENCES ${schema}.movies);
      CREATE UNLOGGED TABLE ${schema}.credits (
        movie int REFERENCES ${schema}.movies,
        person int REFERENCES ${schema}.people
      );
      INSERT INTO ${schema}.movies VALUES (1);
      INSERT INTO ${schema}.people VALUES (2);
      INSERT INTO ${schema}.ratings VALUES (1);
      INSERT INTO ${schema}.credits VALUES (1, 2);
    `);
    const sql = (await readFile("db/durable.sql", "utf8")).replaceAll("public.", `${schema}.`);
    await client.query(sql);
    // Re-running the migration must also preserve the dataset.
    await client.query(sql);
    const persistence = await client.query(`
      SELECT relpersistence FROM pg_class
      WHERE relnamespace = $1::regnamespace AND relkind = 'r'
    `, [schema]);
    expect(persistence.rows).toHaveLength(4);
    expect(persistence.rows.every((r) => r.relpersistence === "p")).toBe(true);
    const data = await client.query(`SELECT c.movie, c.person, r.id AS rating_id, p.id AS person_id FROM ${schema}.credits c JOIN ${schema}.ratings r ON r.id=c.movie JOIN ${schema}.people p ON p.id=c.person`);
    expect(data.rows).toEqual([{ movie: 1, person: 2, rating_id: 1, person_id: 2 }]);
    await expect(client.query(`INSERT INTO ${schema}.credits VALUES (99, 2)`)).rejects.toMatchObject({ code: "23503" });
  } finally {
    await client.query("ROLLBACK");
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
