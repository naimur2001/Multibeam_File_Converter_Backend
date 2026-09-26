const jobs = new Map();

const createJob = ({ id, originalFilename, inputPath, fileSize }) => {
  const now = new Date().toISOString();

  const job = {
    id,
    status: "queued",
    stage: "received",
    message: "File received and queued for processing",

    originalFilename,
    fileSize,

    inputPath,
    mb59Path: null,
    xyzPath: null,
    normalizedXyzPath: null,
    outputPath: null,

    error: null,

    summary: {
      pointCount: 0,
      minDepth: null,
      maxDepth: null,
    },

    createdAt: now,
    updatedAt: now,
  };

  jobs.set(id, job);

  return { ...job };
};

const getJob = (id) => {
  const job = jobs.get(id);

  if (!job) {
    return null;
  }

  return { ...job };
};

const updateJob = (id, updates) => {
  const job = jobs.get(id);

  if (!job) {
    return null;
  }

  const updatedJob = {
    ...job,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  jobs.set(id, updatedJob);

  return { ...updatedJob };
};


const removeJob = (id) => {
  jobs.delete(id);
};

module.exports = {
  createJob,
  getJob,
  updateJob,
  removeJob, 
};