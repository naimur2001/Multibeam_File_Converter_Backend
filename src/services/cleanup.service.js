const fs = require("fs");
const path = require("path");

const env = require("../config/env");
const jobService = require("./job.service");

// Convert minutes to milliseconds
const CLEANUP_INTERVAL_MS = env.cleanupIntervalMinutes * 60 * 1000;
const JOB_TTL_MS = env.jobTtlMinutes * 60 * 1000;

/**
 * Scans the upload directory and deletes expired job folders.
 */
const cleanupOldJobs = () => {
  console.log(`[Cleanup] Running automatic cleanup scan...`);

  // 1. Check if the upload directory exists
  if (!fs.existsSync(env.uploadDir)) {
    return;
  }

  // 2. Read all folders inside /data/jobs
  const directories = fs.readdirSync(env.uploadDir);

  directories.forEach((dirName) => {
    const dirPath = path.join(env.uploadDir, dirName);

    // Safety check: Make sure it is actually a folder
    if (!fs.statSync(dirPath).isDirectory()) {
      return;
    }

    // 3. Check how old the folder is
    const stats = fs.statSync(dirPath);
    const folderAge = Date.now() - stats.mtime.getTime();

    // 4. If folder is older than JOB_TTL_MS (15 minutes), delete it
    if (folderAge > JOB_TTL_MS) {
      console.log(`[Cleanup] Deleting expired job folder: ${dirName}`);

      try {
        // Delete the folder and all files inside it
        fs.rmSync(dirPath, { recursive: true, force: true });

        // Also remove it from our in-memory job list
        jobService.removeJob(dirName);
      } catch (error) {
        console.error(`[Cleanup] Failed to delete ${dirName}:`, error);
      }
    }
  });
};

/**
 * Starts the cleanup timer.
 */
const start = () => {
  console.log(
    `[Cleanup] Service started. Checking for expired jobs every ${env.cleanupIntervalMinutes} minutes.`
  );

  // Run once immediately when server starts
  cleanupOldJobs();

  // Then run automatically on an interval
  setInterval(cleanupOldJobs, CLEANUP_INTERVAL_MS);
};

module.exports = {
  start,
};