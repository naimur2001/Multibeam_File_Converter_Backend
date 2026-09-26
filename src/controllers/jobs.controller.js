const asyncHandler = require("../utils/async-handler");
const ApiError = require("../utils/api-error");

const jobService = require("../services/job.service");
const converterService = require("../services/converter.service");

/**
 * POST /api/v1/jobs
 *
 * Upload .all file and create a conversion job.
 */
const createJob = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(
      400,
      'No file uploaded. Please send the file using form field name "file".'
    );
  }

  const job = jobService.createJob({
    id: req.jobId,
    originalFilename: req.file.originalname,
    inputPath: req.file.path,
    fileSize: req.file.size,
  });

  req.jobCreated = true;

  /**
   * Start conversion asynchronously.
   *
   * We do not await this.
   * The API should return immediately with jobId.
   */
  converterService.start(job.id);

  res.status(202).json({
    jobId: job.id,
    status: job.status,
    stage: job.stage,
    message: "File received and queued for processing",
  });
});

/**
 * GET /api/v1/jobs/:jobId
 *
 * Get current status of a job.
 */
const getJobStatus = asyncHandler(async (req, res) => {
  const { jobId } = req.params;

  const job = jobService.getJob(jobId);

  if (!job) {
    throw new ApiError(404, "Job not found");
  }

  res.status(200).json(job);
});

/**
 * GET /api/v1/jobs/:jobId/download
 *
 * Download generated LAS file.
 */
const downloadLas = asyncHandler(async (req, res) => {
  const { jobId } = req.params;

  const job = jobService.getJob(jobId);

  if (!job) {
    throw new ApiError(404, "Job not found");
  }

  if (job.status !== "completed") {
    throw new ApiError(400, "LAS file is not ready for download yet");
  }

  if (!job.outputPath) {
    throw new ApiError(400, "Output file path is missing");
  }

  res.download(job.outputPath, "converted.las");
});

module.exports = {
  createJob,
  getJobStatus,
  downloadLas,
};