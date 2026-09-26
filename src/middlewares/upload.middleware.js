const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

const env = require("../config/env");
const ApiError = require("../utils/api-error");

const ensureBaseUploadDirectory = () => {
  fs.mkdirSync(env.uploadDir, {
    recursive: true,
  });
};

/**
 * This middleware runs before Multer.
 * It creates a unique job ID and a folder for that job.
 */
const prepareJob = (req, res, next) => {
  try {
    ensureBaseUploadDirectory();

    const jobId = uuidv4();
    const jobDir = path.join(env.uploadDir, jobId);

    fs.mkdirSync(jobDir, {
      recursive: true,
    });

    req.jobId = jobId;
    req.jobDir = jobDir;
    req.jobCreated = false;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Multer disk storage configuration.
 *
 * The uploaded file will be saved inside:
 * /data/jobs/{jobId}/input.all
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!req.jobDir) {
      return cb(new ApiError(500, "Job directory is missing"));
    }

    cb(null, req.jobDir);
  },

  filename: (req, file, cb) => {
    cb(null, "input.all");
  },
});

/**
 * Only allow files ending with .all
 */
const fileFilter = (req, file, cb) => {
  const originalName = file.originalname || "";

  const isValidExtension = originalName.toLowerCase().endsWith(".all");

  if (!isValidExtension) {
    return cb(new ApiError(400, "Only .all files are allowed"));
  }

  cb(null, true);
};

/**
 * Multer upload instance
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.maxFileMB * 1024 * 1024,
  },
});

module.exports = {
  upload,
  prepareJob,
};