import nextEnv from "@next/env";
import pg from "pg";
nextEnv.loadEnvConfig(process.cwd());
const email = process.argv[2]?.trim().toLowerCase();
if (!email) throw new Error("Usage: npm run admin:promote -- registered-email@example.com");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const result = await client.query("UPDATE profiles SET role='admin' WHERE email=$1", [email]);
  if (!result.rowCount) throw new Error("Register this account on the website first");
  console.log("Account promoted to administrator");
} finally { await client.end(); }
