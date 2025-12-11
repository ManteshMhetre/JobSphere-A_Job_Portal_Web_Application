import {
  executeQuery,
  executeTransaction,
} from "../database/pg-raw-connection.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { convertPhoneToNumber } from "../utils/phoneUtils.js";

/**
 * User Model - Raw SQL implementation to replace Sequelize User model
 */

export const UserModel = {
  /**
   * Create a new user
   */
  async create(userData) {
    const {
      name,
      email,
      phone,
      address,
      password,
      role,
      firstNiche,
      secondNiche,
      thirdNiche,
      coverLetter,
      resumePublicId,
      resumeUrl,
    } = userData;

    // Hash password before storing
    const hashedPassword = await bcrypt.hash(password, 10);

    const query = `
            INSERT INTO users (
                name, email, phone, address, password, role,
                first_niche, second_niche, third_niche, cover_letter,
                resume_public_id, resume_url
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `;

    const values = [
      name,
      email,
      phone,
      address,
      hashedPassword,
      role,
      firstNiche || null,
      secondNiche || null,
      thirdNiche || null,
      coverLetter || null,
      resumePublicId || null,
      resumeUrl || null,
    ];

    const result = await executeQuery(query, values);
    return this.formatUser(result.rows[0]);
  },

  /**
   * Find user by ID
   */
  async findById(id) {
    const query = "SELECT * FROM users WHERE id = $1";
    const result = await executeQuery(query, [id]);
    return result.rows[0] ? this.formatUser(result.rows[0]) : null;
  },

  /**
   * Find user by email
   */
  async findByEmail(email) {
    const query = "SELECT * FROM users WHERE email = $1";
    const result = await executeQuery(query, [email]);
    return result.rows[0] ? this.formatUser(result.rows[0]) : null;
  },

  /**
   * Update user by ID
   */
  async updateById(id, updateData) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updateData)) {
      if (value !== undefined) {
        // Convert camelCase to snake_case for database
        const dbField = this.convertToSnakeCase(key);

        // Hash password if being updated
        if (key === "password") {
          fields.push(`${dbField} = $${paramCount}`);
          values.push(await bcrypt.hash(value, 10));
        } else {
          fields.push(`${dbField} = $${paramCount}`);
          values.push(value);
        }
        paramCount++;
      }
    }

    if (fields.length === 0) {
      throw new Error("No fields to update");
    }

    values.push(id); // Add ID for WHERE clause

    const query = `
            UPDATE users 
            SET ${fields.join(", ")}, updated_at = NOW() 
            WHERE id = $${paramCount}
            RETURNING *
        `;

    const result = await executeQuery(query, values);
    return result.rows[0] ? this.formatUser(result.rows[0]) : null;
  },

  /**
   * Delete user by ID
   */
  async deleteById(id) {
    const query = "DELETE FROM users WHERE id = $1 RETURNING *";
    const result = await executeQuery(query, [id]);
    return result.rows[0] ? this.formatUser(result.rows[0]) : null;
  },

  /**
   * Find all users with optional filtering
   */
  async findAll(filters = {}) {
    let query = "SELECT * FROM users WHERE 1=1";
    const values = [];
    let paramCount = 1;

    // Add filters
    if (filters.role) {
      query += ` AND role = $${paramCount}`;
      values.push(filters.role);
      paramCount++;
    }

    if (filters.email) {
      query += ` AND email ILIKE $${paramCount}`;
      values.push(`%${filters.email}%`);
      paramCount++;
    }

    // Add ordering
    query += " ORDER BY created_at DESC";

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
    return result.rows.map((user) => this.formatUser(user));
  },

  /**
   * Find users by job niche (for newsletter)
   */
  async findByJobNiche(jobNiche) {
    const query = `
            SELECT * FROM users 
            WHERE role = 'Job Seeker'
            AND (first_niche = $1 OR second_niche = $1 OR third_niche = $1)
            ORDER BY created_at DESC
        `;
    const result = await executeQuery(query, [jobNiche]);
    return result.rows.map((user) => this.formatUserResponse(user));
  },

  /**
   * Compare password for authentication
   */
  async comparePassword(user, enteredPassword) {
    return await bcrypt.compare(enteredPassword, user.password);
  },

  /**
   * Generate JWT token for user
   */
  generateJWTToken(user) {
    return jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE,
    });
  },

  /**
   * Format user object (convert snake_case to camelCase and remove sensitive data)
   */
  formatUser(user) {
    if (!user) return null;

    const formattedUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      address: user.address,
      firstNiche: user.first_niche,
      secondNiche: user.second_niche,
      thirdNiche: user.third_niche,
      password: user.password, // Keep for authentication, remove in responses
      resumePublicId: user.resume_public_id,
      resumeUrl: user.resume_url,
      coverLetter: user.cover_letter,
      role: user.role,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };

    // Add the getJWTToken method to the user object
    formattedUser.getJWTToken = function () {
      return jwt.sign({ id: this.id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE,
      });
    };

    return formattedUser;
  },

  /**
   * Get user without password (for responses)
   */
  formatUserResponse(user) {
    const formattedUser = this.formatUser(user);
    if (formattedUser) {
      delete formattedUser.password;
    }
    return formattedUser;
  },

  /**
   * Convert camelCase to snake_case for database fields
   */
  convertToSnakeCase(str) {
    const conversions = {
      firstNiche: "first_niche",
      secondNiche: "second_niche",
      thirdNiche: "third_niche",
      resumePublicId: "resume_public_id",
      resumeUrl: "resume_url",
      coverLetter: "cover_letter",
      createdAt: "created_at",
      updatedAt: "updated_at",
    };
    return conversions[str] || str;
  },

  /**
   * Validate user data
   */
  validateUserData(userData) {
    const errors = [];

    if (
      !userData.name ||
      userData.name.length < 3 ||
      userData.name.length > 30
    ) {
      errors.push("Name must be between 3 and 30 characters");
    }

    if (!userData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email)) {
      errors.push("Please provide a valid email");
    }

    if (!userData.phone) {
      errors.push("Please provide a phone number");
    } else {
      try {
        convertPhoneToNumber(userData.phone);
      } catch (error) {
        errors.push(error.message);
      }
    }

    if (
      !userData.password ||
      userData.password.length < 8 ||
      userData.password.length > 32
    ) {
      errors.push("Password must be between 8 and 32 characters");
    }

    if (!userData.role || !["Job Seeker", "Employer"].includes(userData.role)) {
      errors.push('Role must be either "Job Seeker" or "Employer"');
    }

    if (
      userData.role === "Job Seeker" &&
      (!userData.firstNiche || !userData.secondNiche || !userData.thirdNiche)
    ) {
      errors.push("Job Seekers must provide three job niches");
    }

    return errors;
  },
};

export default UserModel;
