class ErrorHandler extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const errorMiddleware = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.message = err.message || "Internal server error.";

  // Log all errors for debugging
  console.error(`Error (${err.statusCode}): ${err.message}`);
  if (err.stack) console.error(err.stack);

  // PostgreSQL specific error codes
  if (err.code === "22P02") {
    // invalid_text_representation (invalid UUID/format)
    const message = `Invalid ID format provided`;
    err = new ErrorHandler(message, 400);
  }
  if (err.code === "23505") {
    // unique_violation (PostgreSQL duplicate key)
    const message = `Duplicate entry already exists`;
    err = new ErrorHandler(message, 400);
  }
  if (err.code === "23503") {
    // foreign_key_violation
    const message = `Referenced record does not exist`;
    err = new ErrorHandler(message, 400);
  }
  if (err.code === "23502") {
    // not_null_violation
    const message = `Required field is missing`;
    err = new ErrorHandler(message, 400);
  }
  if (err.name === "JsonWebTokenError") {
    const message = `Json Web Token is invalid, Try again.`;
    err = new ErrorHandler(message, 400);
  }
  if (err.name === "TokenExpiredError") {
    const message = `Json Web Token is expired, Try again.`;
    err = new ErrorHandler(message, 400);
  }
  if (
    err.code === "ECONNREFUSED" ||
    err.code === "ENOTFOUND" ||
    err.code === "ETIMEDOUT" ||
    err.code === "ECONNRESET" ||
    err.message.includes("connection terminated") ||
    err.message.includes("Connection terminated") ||
    err.message.includes("ECONNRESET")
  ) {
    const message = `Database connection failed. Please try again later.`;
    err = new ErrorHandler(message, 503);
  }

  return res.status(err.statusCode).json({
    success: false,
    message: err.message,
  });
};

export default ErrorHandler;
