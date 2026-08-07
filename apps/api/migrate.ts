import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";

const client = new SQL(process.env.DATABASE_URL || "postgres://rawtoh:rawtoh@localhost:5432/twitch");
const db = drizzle(client);

console.log("Running migrations...");
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations complete.");

client.close();
