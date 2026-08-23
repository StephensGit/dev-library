import pg from "pg";

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

await client.connect();

const result = await client.query("SELECT current_database()");

console.log("Connected to:", result.rows[0].current_database);

await client.end();