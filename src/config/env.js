require("dotenv").config();
const path = require("path");

const uploadDir = path.resolve(
  process.cwd(),
  process.env.UPLOAD_DIR || "./data/jobs"
);

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),

  frontendOrigin:
    process.env.FRONTEND_ORIGIN || "http://localhost:3000",

  uploadDir,

  maxFileMB: Number(process.env.MAX_FILE_MB || 50),

  jobTtlMinutes: Number(process.env.JOB_TTL_MINUTES || 15),

  cleanupIntervalMinutes: Number(
    process.env.CLEANUP_INTERVAL_MINUTES || 5
  ),

  maxConcurrentJobs: Number(process.env.MAX_CONCURRENT_JOBS || 1),

  commandTimeoutMs: Number(process.env.COMMAND_TIMEOUT_MS || 600000),
};

// We do not want to write:
// process.env.PORT
// everywhere in the code.
// Instead, we centralize environment variables in one place.
// This makes the code cleaner.