import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

console.log(connectionString)

// For migrations (max 1 connection)
export const migrationClient = postgres(connectionString, { max: 1 });

// For queries (connection pool)
const queryClient = postgres(connectionString);
export const db = drizzle(queryClient, { schema });