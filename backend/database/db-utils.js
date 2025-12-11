import { getConnectionPool, executeQuery } from "./pg-raw-connection.js";

/**
 * Database initialization utilities for raw PostgreSQL
 * Replaces Sequelize sync functionality
 */

/**
 * Initialize database schema by running SQL schema file
 */
export async function initializeDatabase() {
  try {
    console.log("Initializing database schema...");

    // First, try migration approach
    const { migrateFromSequelize } = await import("./migration-utils.js");
    await migrateFromSequelize();

    // Then finalize the migration
    const { finalizeTableMigration } = await import("./migration-utils.js");
    await finalizeTableMigration();

    console.log("Database schema initialized successfully");
    return true;
  } catch (error) {
    console.error("Error initializing database:", error);

    // Fallback: try simple table creation
    try {
      console.log("Trying fallback table creation...");
      await createBasicTables();
      console.log("Basic tables created successfully");
      return true;
    } catch (fallbackError) {
      console.error("Fallback also failed:", fallbackError);
      throw error;
    }
  }
}

/**
 * Fallback function to create basic tables
 */
async function createBasicTables() {
  // Enable UUID extension
  await executeQuery('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // Create ENUM types
  await executeQuery(`
        DO $$ BEGIN
            CREATE TYPE user_role_enum AS ENUM ('Job Seeker', 'Employer');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$
    `);

  await executeQuery(`
        DO $$ BEGIN
            CREATE TYPE job_type_enum AS ENUM ('Full-time', 'Part-time');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$
    `);

  // Create users table with simple structure
  await executeQuery(`
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL UNIQUE,
            phone BIGINT NOT NULL,
            address TEXT NOT NULL,
            first_niche VARCHAR(255),
            second_niche VARCHAR(255), 
            third_niche VARCHAR(255),
            password VARCHAR(255) NOT NULL,
            resume_public_id VARCHAR(255),
            resume_url VARCHAR(255),
            cover_letter TEXT,
            role user_role_enum NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    `);

  // Create jobs table
  await executeQuery(`
        CREATE TABLE IF NOT EXISTS jobs (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            title VARCHAR(255) NOT NULL,
            job_type job_type_enum NOT NULL,
            location VARCHAR(255) NOT NULL,
            company_name VARCHAR(255) NOT NULL,
            introduction TEXT,
            responsibilities TEXT NOT NULL,
            qualifications TEXT NOT NULL,
            offers TEXT,
            salary VARCHAR(255) NOT NULL,
            hiring_multiple_candidates VARCHAR(10) DEFAULT 'No',
            personal_website_title VARCHAR(255),
            personal_website_url VARCHAR(255),
            job_niche VARCHAR(255) NOT NULL,
            newsletters_sent BOOLEAN DEFAULT FALSE,
            job_posted_on TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            posted_by UUID NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    `);

  // Create applications table
  await executeQuery(`
        CREATE TABLE IF NOT EXISTS applications (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            job_seeker_user_id UUID NOT NULL,
            job_seeker_name VARCHAR(255) NOT NULL,
            job_seeker_email VARCHAR(255) NOT NULL,
            job_seeker_phone BIGINT NOT NULL,
            job_seeker_address TEXT NOT NULL,
            resume_public_id VARCHAR(255),
            resume_url VARCHAR(255),
            cover_letter TEXT NOT NULL,
            job_seeker_role VARCHAR(20) NOT NULL DEFAULT 'Job Seeker',
            employer_user_id UUID NOT NULL,
            employer_role VARCHAR(20) NOT NULL DEFAULT 'Employer',
            job_id UUID NOT NULL,
            job_title VARCHAR(255) NOT NULL,
            deleted_by_job_seeker BOOLEAN DEFAULT FALSE,
            deleted_by_employer BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    `);

  console.log("Basic tables created");
}

/**
 * Check if all required tables exist
 */
export async function checkDatabaseSchema() {
  try {
    const query = `
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('users', 'jobs', 'applications')
            ORDER BY table_name
        `;

    const result = await executeQuery(query);
    const existingTables = result.rows.map((row) => row.table_name);

    const requiredTables = ["users", "jobs", "applications"];
    const missingTables = requiredTables.filter(
      (table) => !existingTables.includes(table)
    );

    return {
      exists: missingTables.length === 0,
      existingTables,
      missingTables,
      requiredTables,
    };
  } catch (error) {
    console.error("Error checking database schema:", error);
    return {
      exists: false,
      error: error.message,
    };
  }
}

/**
 * Drop all tables (use with caution)
 */
export async function dropAllTables() {
  try {
    console.log("WARNING: Dropping all tables...");

    const dropSQL = `
            DROP TABLE IF EXISTS applications CASCADE;
            DROP TABLE IF EXISTS jobs CASCADE;
            DROP TABLE IF EXISTS users CASCADE;
            DROP TYPE IF EXISTS user_role_enum CASCADE;
            DROP TYPE IF EXISTS job_type_enum CASCADE;
            DROP TYPE IF EXISTS hiring_multiple_enum CASCADE;
            DROP TYPE IF EXISTS application_role_enum CASCADE;
        `;

    await executeQuery(dropSQL);
    console.log("All tables dropped successfully");
    return true;
  } catch (error) {
    console.error("Error dropping tables:", error);
    throw error;
  }
}

/**
 * Reset database (drop and recreate all tables)
 */
export async function resetDatabase() {
  try {
    console.log("Resetting database...");
    await dropAllTables();
    await initializeDatabase();
    console.log("Database reset completed successfully");
    return true;
  } catch (error) {
    console.error("Error resetting database:", error);
    throw error;
  }
}

/**
 * Seed database with sample data (optional)
 */
export async function seedDatabase() {
  try {
    console.log("Seeding database with sample data...");

    // Check if data already exists
    const userCount = await executeQuery("SELECT COUNT(*) as count FROM users");
    if (parseInt(userCount.rows[0].count) > 0) {
      console.log("Database already contains data, skipping seed");
      return false;
    }

    // Sample data insertion can be added here
    // For now, we'll just log that seeding is available
    console.log("Seeding functionality available but no sample data defined");
    return true;
  } catch (error) {
    console.error("Error seeding database:", error);
    throw error;
  }
}

/**
 * Get database statistics
 */
export async function getDatabaseStats() {
  try {
    const queries = [
      "SELECT COUNT(*) as user_count FROM users",
      "SELECT COUNT(*) as job_count FROM jobs",
      "SELECT COUNT(*) as application_count FROM applications",
      `SELECT 
                COUNT(CASE WHEN role = 'Job Seeker' THEN 1 END) as job_seekers,
                COUNT(CASE WHEN role = 'Employer' THEN 1 END) as employers
             FROM users`,
      `SELECT 
                COUNT(CASE WHEN job_type = 'Full-time' THEN 1 END) as full_time_jobs,
                COUNT(CASE WHEN job_type = 'Part-time' THEN 1 END) as part_time_jobs
             FROM jobs`,
    ];

    const [userStats, jobStats, appStats, userRoleStats, jobTypeStats] =
      await Promise.all(queries.map((query) => executeQuery(query)));

    return {
      users: {
        total: parseInt(userStats.rows[0].user_count),
        jobSeekers: parseInt(userRoleStats.rows[0].job_seekers || 0),
        employers: parseInt(userRoleStats.rows[0].employers || 0),
      },
      jobs: {
        total: parseInt(jobStats.rows[0].job_count),
        fullTime: parseInt(jobTypeStats.rows[0].full_time_jobs || 0),
        partTime: parseInt(jobTypeStats.rows[0].part_time_jobs || 0),
      },
      applications: {
        total: parseInt(appStats.rows[0].application_count),
      },
    };
  } catch (error) {
    console.error("Error getting database stats:", error);
    throw error;
  }
}

/**
 * Database health check with detailed information
 */
export async function performHealthCheck() {
  try {
    // Check connection
    const pool = await getConnectionPool();

    // Check schema
    const schemaCheck = await checkDatabaseSchema();

    // Get stats
    const stats = await getDatabaseStats();

    // Check database version and settings
    const dbInfo = await executeQuery(`
            SELECT 
                version() as version,
                current_database() as database_name,
                current_user as current_user,
                NOW() as current_time
        `);

    return {
      connection: "healthy",
      schema: schemaCheck,
      statistics: stats,
      database: {
        version: dbInfo.rows[0].version,
        name: dbInfo.rows[0].database_name,
        user: dbInfo.rows[0].current_user,
        time: dbInfo.rows[0].current_time,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      connection: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

export default {
  initializeDatabase,
  checkDatabaseSchema,
  dropAllTables,
  resetDatabase,
  seedDatabase,
  getDatabaseStats,
  performHealthCheck,
};
