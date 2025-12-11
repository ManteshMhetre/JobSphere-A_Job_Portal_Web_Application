import express from "express";
import { config } from "dotenv";
config({ path: "./config/config.env" });

import cors from "cors";
import cookieParser from "cookie-parser";
import {
  getConnectionPool,
  checkDatabaseConnection,
} from "./database/pg-raw-connection.js";
import { initializeDatabase, performHealthCheck } from "./database/db-utils.js";
import { errorMiddleware } from "./middlewares/error.js";
import fileUpload from "express-fileupload";
import userRouter from "./routes/userRouterRaw.js";
import jobRouter from "./routes/jobRouterRaw.js";
import applicationRouter from "./routes/applicationRouterRaw.js";
import { newsLetterCron } from "./automation/newsLetterCronRaw.js";

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:3000",
      "http://localhost:4000",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    optionsSuccessStatus: 200,
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/",
  })
);

// Enhanced health check endpoint with detailed database information
app.get("/api/health", async (req, res) => {
  try {
    // Perform comprehensive health check
    const healthCheck = await performHealthCheck();

    res.status(200).json({
      success: true,
      message: "Backend API is running successfully with Raw PostgreSQL!",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      database: {
        type: "PostgreSQL (Raw/Native)",
        status: healthCheck.connection,
        schema: healthCheck.schema,
        statistics: healthCheck.statistics,
        info: healthCheck.database,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Backend API is running but with database issues",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.get("/", (req, res) => {
  res
    .status(200)
    .send(
      "Job Portal Backend API with Raw PostgreSQL is running! Go to /api/health to check status."
    );
});

// API routes
app.use("/api/v1/user", userRouter);
app.use("/api/v1/job", jobRouter);
app.use("/api/v1/application", applicationRouter);

// Initialize database connection and schema at startup
getConnectionPool()
  .then(async () => {
    console.log("Database connection pool created successfully");

    // Initialize database schema (creates tables if they don't exist)
    await initializeDatabase();
    console.log("Database initialization completed");
  })
  .catch((err) => console.error("Initial database setup failed:", err));

// Add middleware to ensure database is connected before processing routes
app.use(async (req, res, next) => {
  // Skip connection check for health endpoints and OPTIONS requests
  if (
    req.path === "/" ||
    req.path === "/api/health" ||
    req.method === "OPTIONS"
  ) {
    return next();
  }

  try {
    // Ensure database connection pool is available
    await getConnectionPool();
    next();
  } catch (err) {
    console.error("Database connection error in middleware:", err);
    return res.status(503).json({
      success: false,
      message: "Database connection failed. Please try again later.",
      error: err.message,
    });
  }
});

// Start cron jobs only in non-serverless environments or explicitly
// In serverless, cron should be handled separately
if (process.env.NODE_ENV !== "production" || process.env.RUN_CRON === "true") {
  try {
    newsLetterCron();
  } catch (error) {
    console.error("Error starting cron jobs:", error);
  }
}

app.use(errorMiddleware);

export default app;
