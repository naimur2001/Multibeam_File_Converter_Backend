const express = require("express");

const jobsController = require("../controllers/jobs.controller");
const {
  upload,
  prepareJob,
} = require("../middlewares/upload.middleware");

const router = express.Router();

/**
 * POST /api/v1/jobs
 *
 * Order of middleware matters:
 *
 * 1. prepareJob creates jobId and job directory
 * 2. upload.single("file") receives the uploaded file
 * 3. jobsController.createJob saves job information
 */
router.post(
  "/",
  prepareJob,
  upload.single("file"),
  jobsController.createJob
);

/**
 * GET /api/v1/jobs/:jobId
 */
router.get("/:jobId", jobsController.getJobStatus);

/**
 * GET /api/v1/jobs/:jobId/download
 */
router.get("/:jobId/download", jobsController.downloadLas);

module.exports = router;