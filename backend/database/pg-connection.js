import { Pool } from "pg";

// Create a cached connection pool
let cachedPool = null;

/**
 * Create and manage PostgreSQL connection pool for serverless environments
 * Uses raw node-postgres (pg) instead of Sequelize
 */
export async function getConnectionPool() {
  if (cachedPool) {
    try {
      const client = await cachedPool.connect();
      await client.query("SELECT NOW()");
      client.release();
      console.log("Using cached database pool");
      return cachedPool;
    } catch (error) {
      console.log("Cached pool failed, creating new pool");
      cachedPool = null;
    }
  }

  console.log("Creating new database pool");

  try {
    // Create new connection pool for Neon DB (serverless optimized)
    cachedPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        require: true,
        rejectUnauthorized: false, // For Neon DB
      },
      max: 2, // Smaller pool for serverless
      min: 0,
      connectionTimeoutMillis: 30000,
      idleTimeoutMillis: 5000,
    });

    // Test the connection
    const client = await cachedPool.connect();
    await client.query("SELECT NOW()");
    client.release();

    console.log("Connected to PostgreSQL database");
    return cachedPool;
  } catch (error) {
    console.error("PostgreSQL connection error:", error);
    cachedPool = null;
    throw error;
  }
}

/**
 * Execute a query with connection pooling
 * @param {string} query - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Object} Query result
 */
export async function executeQuery(query, params = []) {
  const pool = await getConnectionPool();
  const client = await pool.connect();

  try {
    const result = await client.query(query, params);
    return result;
  } catch (error) {
    console.error("Database query error:", error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute a transaction with multiple queries
 * @param {Function} transactionFn - Function containing transaction logic
 * @returns {*} Transaction result
 */
export async function executeTransaction(transactionFn) {
  const pool = await getConnectionPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await transactionFn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Transaction error:", error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check if the database connection is healthy
 */
export async function checkDatabaseConnection() {
  try {
    const pool = await getConnectionPool();
    const client = await pool.connect();
    const result = await client.query(
      "SELECT NOW() as current_time, version() as pg_version"
    );
    client.release();

    return {
      connected: true,
      status: "Connection healthy",
      serverTime: result.rows[0].current_time,
      version:
        result.rows[0].pg_version.split(" ")[0] +
        " " +
        result.rows[0].pg_version.split(" ")[1],
    };
  } catch (error) {
    return {
      connected: false,
      status: `Connection error: ${error.message}`,
    };
  }
}

/**
 * Close the connection pool (useful for graceful shutdown)
 */
export async function closePool() {
  if (cachedPool) {
    await cachedPool.end();
    cachedPool = null;
    console.log("Database pool closed");
  }
}

export { cachedPool };
