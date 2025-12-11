import { executeQuery, executeTransaction } from "../database/pg-connection.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Job Model - Raw SQL implementation to replace Sequelize Job model
 */

export const JobModel = {
  /**
   * Create a new job posting
   */
  async create(jobData) {
    const {
      title,
      jobType,
      location,
      companyName,
      introduction,
      responsibilities,
      qualifications,
      offers,
      salary,
      hiringMultipleCandidates,
      personalWebsiteTitle,
      personalWebsiteUrl,
      jobNiche,
      postedBy,
    } = jobData;

    const query = `
            INSERT INTO jobs (
                title, job_type, location, company_name, introduction,
                responsibilities, qualifications, offers, salary,
                hiring_multiple_candidates, personal_website_title, personal_website_url,
                job_niche, posted_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
        `;

    const values = [
      title,
      jobType,
      location,
      companyName,
      introduction || null,
      responsibilities,
      qualifications,
      offers || null,
      salary,
      hiringMultipleCandidates || "No",
      personalWebsiteTitle || null,
      personalWebsiteUrl || null,
      jobNiche,
      postedBy,
    ];

    const result = await executeQuery(query, values);
    return this.formatJob(result.rows[0]);
  },

  /**
   * Find job by ID
   */
  async findById(id) {
    const query = "SELECT * FROM jobs WHERE id = $1";
    const result = await executeQuery(query, [id]);
    return result.rows[0] ? this.formatJob(result.rows[0]) : null;
  },

  /**
   * Find job by ID with poster information
   */
  async findByIdWithPoster(id) {
    const query = `
            SELECT 
                j.*,
                u.name as poster_name,
                u.email as poster_email,
                u.role as poster_role
            FROM jobs j
            JOIN users u ON j.posted_by = u.id
            WHERE j.id = $1
        `;
    const result = await executeQuery(query, [id]);
    return result.rows[0] ? this.formatJobWithPoster(result.rows[0]) : null;
  },

  /**
   * Update job by ID
   */
  async updateById(id, updateData) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updateData)) {
      if (value !== undefined) {
        const dbField = this.convertToSnakeCase(key);
        fields.push(`${dbField} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (fields.length === 0) {
      throw new Error("No fields to update");
    }

    values.push(id);

    const query = `
            UPDATE jobs 
            SET ${fields.join(", ")}, updated_at = NOW() 
            WHERE id = $${paramCount}
            RETURNING *
        `;

    const result = await executeQuery(query, values);
    return result.rows[0] ? this.formatJob(result.rows[0]) : null;
  },

  /**
   * Delete job by ID
   */
  async deleteById(id) {
    const query = "DELETE FROM jobs WHERE id = $1 RETURNING *";
    const result = await executeQuery(query, [id]);
    return result.rows[0] ? this.formatJob(result.rows[0]) : null;
  },

  /**
   * Find all jobs with optional filtering
   */
  async findAll(filters = {}) {
    let query = `
            SELECT 
                j.*,
                u.name as poster_name,
                u.email as poster_email
            FROM jobs j
            JOIN users u ON j.posted_by = u.id
            WHERE 1=1
        `;
    const values = [];
    let paramCount = 1;

    // Add filters
    if (filters.jobNiche) {
      query += ` AND j.job_niche = $${paramCount}`;
      values.push(filters.jobNiche);
      paramCount++;
    }

    if (filters.jobType) {
      query += ` AND j.job_type = $${paramCount}`;
      values.push(filters.jobType);
      paramCount++;
    }

    if (filters.location) {
      query += ` AND j.location ILIKE $${paramCount}`;
      values.push(`%${filters.location}%`);
      paramCount++;
    }

    if (filters.companyName) {
      query += ` AND j.company_name ILIKE $${paramCount}`;
      values.push(`%${filters.companyName}%`);
      paramCount++;
    }

    if (filters.postedBy) {
      query += ` AND j.posted_by = $${paramCount}`;
      values.push(filters.postedBy);
      paramCount++;
    }

    if (filters.search) {
      query += ` AND (
                j.title ILIKE $${paramCount} OR 
                j.company_name ILIKE $${paramCount} OR 
                j.job_niche ILIKE $${paramCount}
            )`;
      values.push(`%${filters.search}%`);
      paramCount++;
    }

    // Add ordering
    query += " ORDER BY j.created_at DESC";

    // Add pagination
    if (filters.limit) {
      query += ` LIMIT $${paramCount}`;
      values.push(filters.limit);
      paramCount++;
    }

    if (filters.offset) {
      query += ` OFFSET $${paramCount}`;
      values.push(filters.offset);
    }

    const result = await executeQuery(query, values);
    return result.rows.map((job) => this.formatJobWithPoster(job));
  },

  /**
   * Find jobs by user ID (jobs posted by a user)
   */
  async findByUserId(userId, filters = {}) {
    let query = "SELECT * FROM jobs WHERE posted_by = $1";
    const values = [userId];
    let paramCount = 2;

    // Add additional filters if provided
    if (filters.jobNiche) {
      query += ` AND job_niche = $${paramCount}`;
      values.push(filters.jobNiche);
      paramCount++;
    }

    query += " ORDER BY created_at DESC";

    if (filters.limit) {
      query += ` LIMIT $${paramCount}`;
      values.push(filters.limit);
      paramCount++;
    }

    if (filters.offset) {
      query += ` OFFSET $${paramCount}`;
      values.push(filters.offset);
    }

    const result = await executeQuery(query, values);
    return result.rows.map((job) => this.formatJob(job));
  },

  /**
   * Count jobs with filters
   */
  async countJobs(filters = {}) {
    let query = "SELECT COUNT(*) as total FROM jobs WHERE 1=1";
    const values = [];
    let paramCount = 1;

    if (filters.jobNiche) {
      query += ` AND job_niche = $${paramCount}`;
      values.push(filters.jobNiche);
      paramCount++;
    }

    if (filters.postedBy) {
      query += ` AND posted_by = $${paramCount}`;
      values.push(filters.postedBy);
      paramCount++;
    }

    const result = await executeQuery(query, values);
    return parseInt(result.rows[0].total);
  },

  /**
   * Update newsletter sent status for jobs
   */
  async markNewsletterSent(jobIds) {
    if (!jobIds || jobIds.length === 0) return;

    const placeholders = jobIds.map((_, index) => `$${index + 1}`).join(",");
    const query = `
            UPDATE jobs 
            SET newsletters_sent = true, updated_at = NOW()
            WHERE id IN (${placeholders})
        `;

    await executeQuery(query, jobIds);
  },

  /**
   * Get jobs that need newsletter to be sent
   */
  async getJobsForNewsletter() {
    const query = `
            SELECT j.*, u.name as poster_name, u.email as poster_email
            FROM jobs j
            JOIN users u ON j.posted_by = u.id
            WHERE j.newsletters_sent = false
            AND j.created_at >= NOW() - INTERVAL '24 hours'
            ORDER BY j.created_at DESC
        `;

    const result = await executeQuery(query);
    return result.rows.map((job) => this.formatJobWithPoster(job));
  },

  /**
   * Format job object (convert snake_case to camelCase)
   */
  formatJob(job) {
    if (!job) return null;

    return {
      id: job.id,
      title: job.title,
      jobType: job.job_type,
      location: job.location,
      companyName: job.company_name,
      introduction: job.introduction,
      responsibilities: job.responsibilities,
      qualifications: job.qualifications,
      offers: job.offers,
      salary: job.salary,
      hiringMultipleCandidates: job.hiring_multiple_candidates,
      personalWebsiteTitle: job.personal_website_title,
      personalWebsiteUrl: job.personal_website_url,
      jobNiche: job.job_niche,
      newsLettersSent: job.newsletters_sent,
      jobPostedOn: job.job_posted_on,
      postedBy: job.posted_by,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
    };
  },

  /**
   * Format job with poster information
   */
  formatJobWithPoster(job) {
    const formattedJob = this.formatJob(job);
    if (formattedJob && job.poster_name) {
      formattedJob.poster = {
        name: job.poster_name,
        email: job.poster_email,
        role: job.poster_role,
      };
    }
    return formattedJob;
  },

  /**
   * Convert camelCase to snake_case for database fields
   */
  convertToSnakeCase(str) {
    const conversions = {
      jobType: "job_type",
      companyName: "company_name",
      hiringMultipleCandidates: "hiring_multiple_candidates",
      personalWebsiteTitle: "personal_website_title",
      personalWebsiteUrl: "personal_website_url",
      jobNiche: "job_niche",
      newsLettersSent: "newsletters_sent",
      jobPostedOn: "job_posted_on",
      postedBy: "posted_by",
      createdAt: "created_at",
      updatedAt: "updated_at",
    };
    return conversions[str] || str;
  },

  /**
   * Validate job data
   */
  validateJobData(jobData) {
    const errors = [];

    if (!jobData.title || jobData.title.trim().length === 0) {
      errors.push("Job title is required");
    }

    if (
      !jobData.jobType ||
      !["Full-time", "Part-time"].includes(jobData.jobType)
    ) {
      errors.push('Job type must be either "Full-time" or "Part-time"');
    }

    if (!jobData.location || jobData.location.trim().length === 0) {
      errors.push("Job location is required");
    }

    if (!jobData.companyName || jobData.companyName.trim().length === 0) {
      errors.push("Company name is required");
    }

    if (
      !jobData.responsibilities ||
      jobData.responsibilities.trim().length === 0
    ) {
      errors.push("Job responsibilities are required");
    }

    if (!jobData.qualifications || jobData.qualifications.trim().length === 0) {
      errors.push("Job qualifications are required");
    }

    if (!jobData.salary || jobData.salary.trim().length === 0) {
      errors.push("Salary information is required");
    }

    if (!jobData.jobNiche || jobData.jobNiche.trim().length === 0) {
      errors.push("Job niche is required");
    }

    if (!jobData.postedBy) {
      errors.push("Posted by user ID is required");
    }

    return errors;
  },
};

export default JobModel;
