import { executeQuery, executeTransaction } from "../database/pg-connection.js";
import { convertPhoneToNumber } from "../utils/phoneUtils.js";

/**
 * Application Model - Raw SQL implementation to replace Sequelize Application model
 */

export const ApplicationModel = {
  /**
   * Create a new job application
   */
  async create(applicationData) {
    const {
      jobSeekerUserId,
      jobSeekerName,
      jobSeekerEmail,
      jobSeekerPhone,
      jobSeekerAddress,
      resumePublicId,
      resumeUrl,
      coverLetter,
      employerUserId,
      jobId,
      jobTitle,
    } = applicationData;

    const query = `
            INSERT INTO applications (
                job_seeker_user_id, job_seeker_name, job_seeker_email, job_seeker_phone,
                job_seeker_address, resume_public_id, resume_url, cover_letter,
                job_seeker_role, employer_user_id, employer_role, job_id, job_title
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
        `;

    const values = [
      jobSeekerUserId,
      jobSeekerName,
      jobSeekerEmail,
      jobSeekerPhone,
      jobSeekerAddress,
      resumePublicId || null,
      resumeUrl || null,
      coverLetter,
      "Job Seeker",
      employerUserId,
      "Employer",
      jobId,
      jobTitle,
    ];

    const result = await executeQuery(query, values);
    return this.formatApplication(result.rows[0]);
  },

  /**
   * Find application by ID
   */
  async findById(id) {
    const query = "SELECT * FROM applications WHERE id = $1";
    const result = await executeQuery(query, [id]);
    return result.rows[0] ? this.formatApplication(result.rows[0]) : null;
  },

  async findByIdWithDetails(id) {
    const query = `
            SELECT 
                a.*,
                j.title as job_title_full,
                j.company_name,
                j.location as job_location,
                j.salary,
                js.name as job_seeker_name_full,
                js.email as job_seeker_email_full,
                emp.name as employer_name,
                emp.email as employer_email
            FROM applications a
            JOIN jobs j ON a.job_id = j.id
            JOIN users js ON a.job_seeker_user_id = js.id
            JOIN users emp ON a.employer_user_id = emp.id
            WHERE a.id = $1
        `;

    const result = await executeQuery(query, [id]);
    return result.rows[0]
      ? this.formatApplicationWithDetails(result.rows[0])
      : null;
  },

  /**
   * Check if application already exists
   */
  async findExisting(jobSeekerUserId, jobId) {
    const query = `
            SELECT * FROM applications 
            WHERE job_seeker_user_id = $1 AND job_id = $2
            AND deleted_by_job_seeker = false AND deleted_by_employer = false
        `;
    const result = await executeQuery(query, [jobSeekerUserId, jobId]);
    return result.rows[0] ? this.formatApplication(result.rows[0]) : null;
  },

  /**
   * Update application by ID
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
            UPDATE applications 
            SET ${fields.join(", ")}, updated_at = NOW() 
            WHERE id = $${paramCount}
            RETURNING *
        `;

    const result = await executeQuery(query, values);
    return result.rows[0] ? this.formatApplication(result.rows[0]) : null;
  },

  /**
   * Soft delete application (mark as deleted by job seeker)
   */
  async deleteByJobSeeker(id, jobSeekerUserId) {
    const query = `
            UPDATE applications 
            SET deleted_by_job_seeker = true, updated_at = NOW()
            WHERE id = $1 AND job_seeker_user_id = $2
            RETURNING *
        `;
    const result = await executeQuery(query, [id, jobSeekerUserId]);
    return result.rows[0] ? this.formatApplication(result.rows[0]) : null;
  },

  /**
   * Soft delete application (mark as deleted by employer)
   */
  async deleteByEmployer(id, employerUserId) {
    const query = `
            UPDATE applications 
            SET deleted_by_employer = true, updated_at = NOW()
            WHERE id = $1 AND employer_user_id = $2
            RETURNING *
        `;
    const result = await executeQuery(query, [id, employerUserId]);
    return result.rows[0] ? this.formatApplication(result.rows[0]) : null;
  },

  /**
   * Hard delete application
   */
  async hardDelete(id) {
    const query = "DELETE FROM applications WHERE id = $1 RETURNING *";
    const result = await executeQuery(query, [id]);
    return result.rows[0] ? this.formatApplication(result.rows[0]) : null;
  },

  /**
   * Find applications by job seeker
   */
  async findByJobSeeker(jobSeekerUserId, filters = {}) {
    let query = `
            SELECT 
                a.*,
                j.title as job_title_full,
                j.company_name,
                j.location as job_location,
                j.salary,
                emp.name as employer_name,
                emp.email as employer_email
            FROM applications a
            JOIN jobs j ON a.job_id = j.id
            JOIN users emp ON a.employer_user_id = emp.id
            WHERE a.job_seeker_user_id = $1 AND a.deleted_by_job_seeker = false
        `;

    const values = [jobSeekerUserId];
    let paramCount = 2;

    // Add filters
    if (filters.jobId) {
      query += ` AND a.job_id = $${paramCount}`;
      values.push(filters.jobId);
      paramCount++;
    }

    query += " ORDER BY a.created_at DESC";

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
    return result.rows.map((app) => this.formatApplicationWithDetails(app));
  },

  /**
   * Find applications by employer
   */
  async findByEmployer(employerUserId, filters = {}) {
    let query = `
            SELECT 
                a.*,
                j.title as job_title_full,
                j.company_name,
                j.location as job_location,
                js.name as job_seeker_name_full,
                js.email as job_seeker_email_full
            FROM applications a
            JOIN jobs j ON a.job_id = j.id
            JOIN users js ON a.job_seeker_user_id = js.id
            WHERE a.employer_user_id = $1 AND a.deleted_by_employer = false
        `;

    const values = [employerUserId];
    let paramCount = 2;

    // Add filters
    if (filters.jobId) {
      query += ` AND a.job_id = $${paramCount}`;
      values.push(filters.jobId);
      paramCount++;
    }

    query += " ORDER BY a.created_at DESC";

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
    return result.rows.map((app) => this.formatApplicationWithDetails(app));
  },

  /**
   * Find applications by job ID
   */
  async findByJobId(jobId, employerUserId = null) {
    let query = `
            SELECT 
                a.*,
                js.name as job_seeker_name_full,
                js.email as job_seeker_email_full,
                js.phone as job_seeker_phone_full
            FROM applications a
            JOIN users js ON a.job_seeker_user_id = js.id
            WHERE a.job_id = $1 AND a.deleted_by_employer = false
        `;

    const values = [jobId];
    let paramCount = 2;

    if (employerUserId) {
      query += ` AND a.employer_user_id = $${paramCount}`;
      values.push(employerUserId);
    }

    query += " ORDER BY a.created_at DESC";

    const result = await executeQuery(query, values);
    return result.rows.map((app) => this.formatApplicationWithDetails(app));
  },

  /**
   * Count applications with filters
   */
  async countApplications(filters = {}) {
    let query = "SELECT COUNT(*) as total FROM applications WHERE 1=1";
    const values = [];
    let paramCount = 1;

    if (filters.jobSeekerUserId) {
      query += ` AND job_seeker_user_id = $${paramCount} AND deleted_by_job_seeker = false`;
      values.push(filters.jobSeekerUserId);
      paramCount++;
    }

    if (filters.employerUserId) {
      query += ` AND employer_user_id = $${paramCount} AND deleted_by_employer = false`;
      values.push(filters.employerUserId);
      paramCount++;
    }

    if (filters.jobId) {
      query += ` AND job_id = $${paramCount}`;
      values.push(filters.jobId);
      paramCount++;
    }

    const result = await executeQuery(query, values);
    return parseInt(result.rows[0].total);
  },

  /**
   * Format application object (convert snake_case to camelCase)
   */
  formatApplication(application) {
    if (!application) return null;

    return {
      id: application.id,
      jobSeekerUserId: application.job_seeker_user_id,
      jobSeekerName: application.job_seeker_name,
      jobSeekerEmail: application.job_seeker_email,
      jobSeekerPhone: application.job_seeker_phone,
      jobSeekerAddress: application.job_seeker_address,
      resumePublicId: application.resume_public_id,
      resumeUrl: application.resume_url,
      coverLetter: application.cover_letter,
      jobSeekerRole: application.job_seeker_role,
      employerUserId: application.employer_user_id,
      employerRole: application.employer_role,
      jobId: application.job_id,
      jobTitle: application.job_title,
      deletedByJobSeeker: application.deleted_by_job_seeker,
      deletedByEmployer: application.deleted_by_employer,
      createdAt: application.created_at,
      updatedAt: application.updated_at,
    };
  },

  /**
   * Format application with additional details
   */
  formatApplicationWithDetails(application) {
    const formattedApp = this.formatApplication(application);

    if (formattedApp) {
      // Add job details if available
      if (application.job_title_full) {
        formattedApp.job = {
          title: application.job_title_full,
          companyName: application.company_name,
          location: application.job_location,
          salary: application.salary,
        };
      }

      // Add job seeker details if available
      if (application.job_seeker_name_full) {
        formattedApp.jobSeeker = {
          name: application.job_seeker_name_full,
          email: application.job_seeker_email_full,
          phone: application.job_seeker_phone_full,
        };
      }

      // Add employer details if available
      if (application.employer_name) {
        formattedApp.employer = {
          name: application.employer_name,
          email: application.employer_email,
        };
      }
    }

    return formattedApp;
  },

  /**
   * Convert camelCase to snake_case for database fields
   */
  convertToSnakeCase(str) {
    const conversions = {
      jobSeekerUserId: "job_seeker_user_id",
      jobSeekerName: "job_seeker_name",
      jobSeekerEmail: "job_seeker_email",
      jobSeekerPhone: "job_seeker_phone",
      jobSeekerAddress: "job_seeker_address",
      resumePublicId: "resume_public_id",
      resumeUrl: "resume_url",
      coverLetter: "cover_letter",
      jobSeekerRole: "job_seeker_role",
      employerUserId: "employer_user_id",
      employerRole: "employer_role",
      jobId: "job_id",
      jobTitle: "job_title",
      deletedByJobSeeker: "deleted_by_job_seeker",
      deletedByEmployer: "deleted_by_employer",
      createdAt: "created_at",
      updatedAt: "updated_at",
    };
    return conversions[str] || str;
  },

  /**
   * Validate application data
   */
  validateApplicationData(applicationData) {
    const errors = [];

    if (!applicationData.jobSeekerUserId) {
      errors.push("Job seeker user ID is required");
    }

    if (
      !applicationData.jobSeekerName ||
      applicationData.jobSeekerName.trim().length === 0
    ) {
      errors.push("Job seeker name is required");
    }

    if (
      !applicationData.jobSeekerEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicationData.jobSeekerEmail)
    ) {
      errors.push("Valid job seeker email is required");
    }

    if (!applicationData.jobSeekerPhone) {
      errors.push("Job seeker phone is required");
    } else {
      // Convert phone to number using utility
      const phoneNumber = convertPhoneToNumber(applicationData.jobSeekerPhone);
      if (phoneNumber === null) {
        errors.push(
          "Please provide a valid job seeker phone number (10-15 digits)"
        );
      }
    }

    if (
      !applicationData.jobSeekerAddress ||
      applicationData.jobSeekerAddress.trim().length === 0
    ) {
      errors.push("Job seeker address is required");
    }

    if (
      !applicationData.coverLetter ||
      applicationData.coverLetter.trim().length === 0
    ) {
      errors.push("Cover letter is required");
    }

    if (!applicationData.employerUserId) {
      errors.push("Employer user ID is required");
    }

    if (!applicationData.jobId) {
      errors.push("Job ID is required");
    }

    if (
      !applicationData.jobTitle ||
      applicationData.jobTitle.trim().length === 0
    ) {
      errors.push("Job title is required");
    }

    return errors;
  },
};

export default ApplicationModel;
