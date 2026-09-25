const express = require("express");

const jobsRoutes = require("./jobs.routes");

const router = express.Router();

router.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "multibeam-converter-backend",
    timestamp: new Date().toISOString(),
  });
});

router.use("/jobs", jobsRoutes);

module.exports = router;