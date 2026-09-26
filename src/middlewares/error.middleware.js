const fs = require("fs");

const ApiError = require("../utils/api-error");
const env = require("../config/env");

const cleanupFailedRequest = (req) => {
  if (!req.jobDir) {
    return;
  }

  try {
    fs.rmSync(req.jobDir, {
      recursive: true,
      force: true,
    });
  } catch (error) {
    console.error("Failed to cleanup job directory:", error);
  }
};

const errorHandler = (err, req, res, next) => {
  console.error(err);

  // Multer file size error
  if (err.name === "MulterError" && err.code === "LIMIT_FILE_SIZE") {
    if (!req.jobCreated) {
      cleanupFailedRequest(req);
    }

    return res.status(413).json({
      error: `File is too large. Maximum size is ${env.maxFileMB} MB.`,
    });
  }

  // Custom API error
  if (err instanceof ApiError) {
    if (!req.jobCreated) {
      cleanupFailedRequest(req);
    }

    return res.status(err.statusCode).json({
      error: err.message,
      details: err.details || undefined,
    });
  }

  // Unknown server error
  if (!req.jobCreated) {
    cleanupFailedRequest(req);
  }

  return res.status(500).json({
    error: "Internal server error",
  });
};

module.exports = errorHandler;


// Why we need this
// If something fails, we want one central place to handle the error.
// Examples:
// Invalid file type
// File too large
// Missing file
// Job not found
// MB-System conversion failed