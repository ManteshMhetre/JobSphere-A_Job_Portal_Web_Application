import { executeQuery } from "./pg-connection.js";

/**
 * Check existing database schema and migrate if necessary
 */

/**
 * Check if tables exist and what their column structure is
 */
export async function checkExistingSchema() {
  try {
    // Check if tables exist
    const tablesQuery = `
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('users', 'jobs', 'applications', 'Users', 'Jobs', 'Applications')
            ORDER BY table_name
        `;

    const tablesResult = await executeQuery(tablesQuery);
    const existingTables = tablesResult.rows.map((row) => row.table_name);

    console.log("Existing tables:", existingTables);

    // Check column structure for each table
    const schemaInfo = {};

    for (const tableName of existingTables) {
      const columnsQuery = `
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = $1
                ORDER BY ordinal_position
            `;

      const columnsResult = await executeQuery(columnsQuery, [tableName]);
      schemaInfo[tableName] = columnsResult.rows;
    }

    return {
      existingTables,
      schemaInfo,
      hasSequelizeTables: existingTables.some((table) =>
        ["Users", "Jobs", "Applications"].includes(table)
      ),
      hasRawTables: existingTables.some((table) =>
        ["users", "jobs", "applications"].includes(table)
      ),
    };
  } catch (error) {
    console.error("Error checking existing schema:", error);
    return {
      existingTables: [],
      schemaInfo: {},
      hasSequelizeTables: false,
      hasRawTables: false,
      error: error.message,
    };
  }
}

/**
 * Migrate from Sequelize schema to raw PostgreSQL schema
 */
export async function migrateFromSequelize() {
  try {
    console.log("Starting migration from Sequelize to Raw PostgreSQL...");

    // First, check what exists
    const schemaCheck = await checkExistingSchema();
    console.log("Schema check result:", schemaCheck);

    if (schemaCheck.hasSequelizeTables) {
      console.log("Found Sequelize tables, migrating data...");

      // Create new tables with correct schema
      await createRawTables();

      // Migrate data from Sequelize tables to new tables
      await migrateTableData();

      // Optionally drop old tables (commented out for safety)
      // await dropSequelizeTables();

      console.log("Migration completed successfully!");
      return true;
    } else if (schemaCheck.hasRawTables) {
      console.log("Raw PostgreSQL tables already exist, no migration needed");
      return true;
    } else {
      console.log("No existing tables found, creating fresh schema...");
      await createRawTables();
      return true;
    }
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}

/**
 * Create raw PostgreSQL tables with correct schema
 */
async function createRawTables() {
  console.log("Creating raw PostgreSQL tables...");

  // Enable UUID extension
  await executeQuery('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // Create ENUM types
  const enumQueries = [
    `DO $$ BEGIN
            CREATE TYPE user_role_enum AS ENUM ('Job Seeker', 'Employer');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$`,

    `DO $$ BEGIN
            CREATE TYPE job_type_enum AS ENUM ('Full-time', 'Part-time');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$`,

    `DO $$ BEGIN
            CREATE TYPE hiring_multiple_enum AS ENUM ('Yes', 'No');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$`,
  ];

  for (const query of enumQueries) {
    await executeQuery(query);
  }

  // Create users table
  await executeQuery(`
        CREATE TABLE IF NOT EXISTS users_new (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(30) NOT NULL CHECK (length(name) >= 3 AND length(name) <= 30),
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
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            CONSTRAINT email_format_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$')
        )
    `);

  // Create jobs table
  await executeQuery(`
        CREATE TABLE IF NOT EXISTS jobs_new (
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
            hiring_multiple_candidates hiring_multiple_enum DEFAULT 'No',
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
        CREATE TABLE IF NOT EXISTS applications_new (
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

  console.log("Raw PostgreSQL tables created successfully");
}

/**
 * Migrate data from Sequelize tables to new raw tables
 */
async function migrateTableData() {
  console.log("Migrating data from Sequelize tables...");

  // Migrate users data
  try {
    await executeQuery(`
            INSERT INTO users_new (id, name, email, phone, address, first_niche, second_niche, third_niche, 
                                  password, resume_public_id, resume_url, cover_letter, role, created_at, updated_at)
            SELECT id, name, email, phone, address, "firstNiche", "secondNiche", "thirdNiche",
                   password, "resumePublicId", "resumeUrl", "coverLetter", role, "createdAt", "updatedAt"
            FROM "Users"
            WHERE NOT EXISTS (SELECT 1 FROM users_new WHERE users_new.id = "Users".id)
        `);
    console.log("Users data migrated successfully");
  } catch (error) {
    console.log("Users migration error (might not exist):", error.message);
  }

  // Migrate jobs data
  try {
    await executeQuery(`
            INSERT INTO jobs_new (id, title, job_type, location, company_name, introduction, responsibilities,
                                 qualifications, offers, salary, hiring_multiple_candidates, personal_website_title,
                                 personal_website_url, job_niche, newsletters_sent, job_posted_on, posted_by, 
                                 created_at, updated_at)
            SELECT id, title, "jobType", location, "companyName", introduction, responsibilities,
                   qualifications, offers, salary, "hiringMultipleCandidates", "personalWebsiteTitle",
                   "personalWebsiteUrl", "jobNiche", "newsLettersSent", "jobPostedOn", "postedBy",
                   "createdAt", "updatedAt"
            FROM "Jobs"
            WHERE NOT EXISTS (SELECT 1 FROM jobs_new WHERE jobs_new.id = "Jobs".id)
        `);
    console.log("Jobs data migrated successfully");
  } catch (error) {
    console.log("Jobs migration error (might not exist):", error.message);
  }

  // Migrate applications data
  try {
    await executeQuery(`
            INSERT INTO applications_new (id, job_seeker_user_id, job_seeker_name, job_seeker_email,
                                         job_seeker_phone, job_seeker_address, resume_public_id, resume_url,
                                         cover_letter, job_seeker_role, employer_user_id, employer_role,
                                         job_id, job_title, deleted_by_job_seeker, deleted_by_employer,
                                         created_at, updated_at)
            SELECT id, "jobSeekerUserId", "jobSeekerName", "jobSeekerEmail", "jobSeekerPhone",
                   "jobSeekerAddress", "resumePublicId", "resumeUrl", "coverLetter", "jobSeekerRole",
                   "employerUserId", "employerRole", "jobId", "jobTitle", "deletedByJobSeeker",
                   "deletedByEmployer", "createdAt", "updatedAt"
            FROM "Applications"
            WHERE NOT EXISTS (SELECT 1 FROM applications_new WHERE applications_new.id = "Applications".id)
        `);
    console.log("Applications data migrated successfully");
  } catch (error) {
    console.log(
      "Applications migration error (might not exist):",
      error.message
    );
  }
}

/**
 * Rename tables to final names
 */
export async function finalizeTableMigration() {
  console.log("Finalizing table migration...");

  try {
    // Drop old tables and rename new ones
    await executeQuery("DROP TABLE IF EXISTS users CASCADE");
    await executeQuery("DROP TABLE IF EXISTS jobs CASCADE");
    await executeQuery("DROP TABLE IF EXISTS applications CASCADE");

    await executeQuery("ALTER TABLE users_new RENAME TO users");
    await executeQuery("ALTER TABLE jobs_new RENAME TO jobs");
    await executeQuery("ALTER TABLE applications_new RENAME TO applications");

    // Add foreign key constraints
    await executeQuery(
      "ALTER TABLE jobs ADD CONSTRAINT fk_jobs_posted_by FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE CASCADE"
    );
    await executeQuery(
      "ALTER TABLE applications ADD CONSTRAINT fk_applications_job_seeker FOREIGN KEY (job_seeker_user_id) REFERENCES users(id) ON DELETE CASCADE"
    );
    await executeQuery(
      "ALTER TABLE applications ADD CONSTRAINT fk_applications_employer FOREIGN KEY (employer_user_id) REFERENCES users(id) ON DELETE CASCADE"
    );
    await executeQuery(
      "ALTER TABLE applications ADD CONSTRAINT fk_applications_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE"
    );

    // Create indexes
    await executeQuery(
      "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)"
    );
    await executeQuery(
      "CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)"
    );
    await executeQuery(
      "CREATE INDEX IF NOT EXISTS idx_jobs_posted_by ON jobs(posted_by)"
    );
    await executeQuery(
      "CREATE INDEX IF NOT EXISTS idx_jobs_job_niche ON jobs(job_niche)"
    );

    console.log("Table migration finalized successfully");
    return true;
  } catch (error) {
    console.error("Error finalizing migration:", error);
    throw error;
  }
}

export default {
  checkExistingSchema,
  migrateFromSequelize,
  finalizeTableMigration,
};
