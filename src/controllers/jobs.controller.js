const createJob = async (req, res) => {
  res.status(501).json({
    message: "Job creation endpoint not implemented yet",
  });
};

const getJobStatus = async (req, res) => {
  const { jobId } = req.params;

  res.status(501).json({
    message: "Job status endpoint not implemented yet",
    jobId,
  });
};

const downloadLas = async (req, res) => {
  const { jobId } = req.params;

  res.status(501).json({
    message: "Download endpoint not implemented yet",
    jobId,
  });
};

module.exports = {
  createJob,
  getJobStatus,
  downloadLas,
};