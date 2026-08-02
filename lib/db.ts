import { Pool } from "pg";

const globalForDatabase = globalThis as unknown as {
  salesDatabasePool?: Pool;
};

function createDatabasePool(): Pool {
  const connectionString =
    process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  const pool = new Pool({
    connectionString,

    // Небольшой сервер и один экземпляр CRM.
    max: 3,
    min: 0,

    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,

    application_name:
      "cardigans-sales",
  });

  pool.on("error", (error) => {
    console.error(
      "Unexpected PostgreSQL pool error:",
      error,
    );
  });

  return pool;
}

export function getDb(): Pool {
  if (!globalForDatabase.salesDatabasePool) {
    globalForDatabase.salesDatabasePool =
      createDatabasePool();
  }

  return globalForDatabase.salesDatabasePool;
}
