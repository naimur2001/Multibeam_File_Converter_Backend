const express = require("express");

const jobsController = require("../controllers/jobs.controller");

const router = express.Router();

router.post("/", jobsController.createJob);

router.get("/:jobId", jobsController.getJobStatus);

router.get("/:jobId/download", jobsController.downloadLas);

module.exports = router;