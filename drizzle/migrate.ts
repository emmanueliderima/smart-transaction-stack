import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { migrationClient } from "../src/db/index";

const db = drizzle(migrationClient);

console.log("Running migrations...");

async function main() {
  await migrate(db, { migrationsFolder: "./drizzle/migrations" });
  console.log("migration done...")
}

main()
  .catch((e) => {
    console.error("migration failed", e)
  })
  .finally(async () => {
    await migrationClient.end();
  })