-- Database initialization script for JobSphere Portal
-- This replaces Sequelize models with raw SQL

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create ENUM types
DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM ('Job Seeker', 'Employer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE job_type_enum AS ENUM ('Full-time', 'Part-time');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE hiring_multiple_enum AS ENUM ('Yes', 'No');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE application_role_enum AS ENUM ('Job Seeker', 'Employer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(30) NOT NULL CHECK (length(name) >= 3 AND length(name) <= 30),
    email VARCHAR(255) NOT NULL UNIQUE,
    phone BIGINT NOT NULL,
    address TEXT NOT NULL,
    first_niche VARCHAR(255),
    second_niche VARCHAR(255),
    third_niche VARCHAR(255),
    password VARCHAR(255) NOT NULL CHECK (length(password) >= 8),
    resume_public_id VARCHAR(255),
    resume_url VARCHAR(255),
    cover_letter TEXT,
    role user_role_enum NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Add email validation constraint
    CONSTRAINT email_format_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Jobs table
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
    hiring_multiple_candidates hiring_multiple_enum DEFAULT 'No',
    personal_website_title VARCHAR(255),
    personal_website_url VARCHAR(255),
    job_niche VARCHAR(255) NOT NULL,
    newsletters_sent BOOLEAN DEFAULT FALSE,
    job_posted_on TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    posted_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Applications table
CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Job Seeker Info
    job_seeker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_seeker_name VARCHAR(255) NOT NULL,
    job_seeker_email VARCHAR(255) NOT NULL CHECK (job_seeker_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    job_seeker_phone BIGINT NOT NULL,
    job_seeker_address TEXT NOT NULL,
    resume_public_id VARCHAR(255),
    resume_url VARCHAR(255),
    cover_letter TEXT NOT NULL,
    job_seeker_role application_role_enum NOT NULL DEFAULT 'Job Seeker',
    
    -- Employer Info
    employer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    employer_role application_role_enum NOT NULL DEFAULT 'Employer',
    
    -- Job Info
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    job_title VARCHAR(255) NOT NULL,
    
    -- Deletion flags
    deleted_by_job_seeker BOOLEAN DEFAULT FALSE,
    deleted_by_employer BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_jobs_posted_by ON jobs(posted_by);
CREATE INDEX IF NOT EXISTS idx_jobs_job_niche ON jobs(job_niche);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_job_seeker_user_id ON applications(job_seeker_user_id);
CREATE INDEX IF NOT EXISTS idx_applications_employer_user_id ON applications(employer_user_id);
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at DESC);

-- Create trigger function to update updated_at automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for auto-updating updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create a view for job listings with poster information
CREATE OR REPLACE VIEW job_listings_with_poster AS
SELECT 
    j.id,
    j.title,
    j.job_type,
    j.location,
    j.company_name,
    j.introduction,
    j.responsibilities,
    j.qualifications,
    j.offers,
    j.salary,
    j.hiring_multiple_candidates,
    j.personal_website_title,
    j.personal_website_url,
    j.job_niche,
    j.newsletters_sent,
    j.job_posted_on,
    j.created_at,
    j.updated_at,
    j.posted_by,
    u.name as poster_name,
    u.email as poster_email
FROM jobs j
JOIN users u ON j.posted_by = u.id;