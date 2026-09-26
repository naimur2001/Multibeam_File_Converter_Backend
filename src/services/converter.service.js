const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { spawn } = require("child_process");
const readline = require("readline");

const jobService = require("./job.service");
const processService = require("./process.service");
const env = require("../config/env");

/**
 * Very simple in-memory job queue.
 *
 * For this assessment, this is enough.
 * For production, you could replace this with Redis + BullMQ.
 */
const queue = [];
let activeJobs = 0;

/**
 * Add a job to the conversion queue.
 */
const start = (jobId) => {
  queue.push(jobId);
  setImmediate(processQueue);
};

/**
 * Process queued jobs.
 *
 * We limit concurrency using env.maxConcurrentJobs.
 */
const processQueue = async () => {
  if (activeJobs >= env.maxConcurrentJobs) {
    return;
  }

  if (queue.length === 0) {
    return;
  }

  const jobId = queue.shift();
  activeJobs += 1;

  try {
    await runConversion(jobId);
  } catch (error) {
    console.error("Conversion failed:", error);
  } finally {
    activeJobs -= 1;
    setImmediate(processQueue);
  }
};

/**
 * Main conversion pipeline.
 */
const runConversion = async (jobId) => {
  let currentStage = "queued";

  try {
    const job = jobService.getJob(jobId);

    if (!job) {
      throw new Error("Job not found");
    }

    const jobDir = path.dirname(job.inputPath);

    /**
     * Step 1:
     * Validate input file using mbinfo.
     */
    currentStage = "validating";

    jobService.updateJob(jobId, {
      status: "processing",
      stage: currentStage,
      message: "Checking file with mbinfo",
    });

    await processService.runCommand({
      command: "mbinfo",
      args: ["-I", job.inputPath],
      options: {
        cwd: jobDir,
      },
      timeoutMs: 60000,
    });

    /**
     * Step 2:
     * Preprocess Kongsberg file.
     *
     * This should create an .mb59 file.
     */
    currentStage = "preprocessing";

    jobService.updateJob(jobId, {
      status: "processing",
      stage: currentStage,
      message: "Running mbkongsbergpreprocess",
    });

    await processService.runCommand({
      command: "mbkongsbergpreprocess",
      args: ["-I", job.inputPath],
      options: {
        cwd: jobDir,
      },
      timeoutMs: env.commandTimeoutMs,
    });

    const mb59Path = await findMb59File(jobDir);

    jobService.updateJob(jobId, {
      mb59Path,
    });

    /**
     * Step 3:
     * Extract soundings using mblist.
     *
     * We also normalize the XYZ file and calculate summary info.
     */
    currentStage = "extracting";

    jobService.updateJob(jobId, {
      status: "processing",
      stage: currentStage,
      message: "Extracting soundings with mblist",
    });

    const normalizedXyzPath = path.join(jobDir, "normalized.xyz");

    const summary = await extractAndNormalizeSoundings(
      mb59Path,
      normalizedXyzPath
    );

    jobService.updateJob(jobId, {
      normalizedXyzPath,
      summary,
    });

    /**
     * Step 4:
     * Convert normalized XYZ file to LAS using PDAL.
     */
    currentStage = "converting";

    jobService.updateJob(jobId, {
      status: "processing",
      stage: currentStage,
      message: "Converting XYZ to LAS with PDAL",
    });

    const outputPath = path.join(jobDir, "output.las");

    await createLasWithPdal(normalizedXyzPath, outputPath, jobDir);

    await validateOutputFile(outputPath);

    /**
     * Done.
     */
    jobService.updateJob(jobId, {
      status: "completed",
      stage: "completed",
      message: "Conversion completed successfully",
      outputPath,
      summary,
    });
  } catch (error) {
    jobService.updateJob(jobId, {
      status: "failed",
      stage: currentStage,
      error: error.message,
      message: friendlyErrorMessage(currentStage, error),
    });
  }
};

/**
 * Find the generated .mb59 file inside the job directory.
 */
const findMb59File = async (jobDir) => {
  const files = await fsp.readdir(jobDir);

  const mb59File = files.find((file) =>
    file.toLowerCase().endsWith(".mb59")
  );

  if (!mb59File) {
    throw new Error(
      "Preprocessing did not produce an .mb59 file. The input file may be invalid or unsupported."
    );
  }

  return path.join(jobDir, mb59File);
};

/**
 * Run mblist and normalize the output.
 *
 * mblist command:
 *
 * mblist -I input.mb59 -MA -OXYZ
 *
 * Important:
 *
 * -OXYZ outputs longitude, latitude, depth.
 * Uppercase Z usually means depth positive downward.
 *
 * LAS normally expects elevation.
 * For bathymetry, we commonly store elevation as negative depth.
 *
 * So this function does:
 *
 * elevation = -depth
 */
const extractAndNormalizeSoundings = (mb59Path, normalizedXyzPath) => {
  return new Promise((resolve, reject) => {
    const child = spawn("mblist", [
      "-I",
      mb59Path,
      "-MA",
      "-OXYZ",
    ]);

    const writeStream = fs.createWriteStream(normalizedXyzPath);

    const rl = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });

    let stderr = "";
    let exitCode = null;
    let finished = false;

    let pointCount = 0;
    let minDepth = null;
    let maxDepth = null;

    const finish = (error, result) => {
      if (finished) {
        return;
      }

      finished = true;

      try {
        rl.close();
      } catch (closeError) {
        // Ignore.
      }

      try {
        writeStream.end();
      } catch (endError) {
        // Ignore.
      }

      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    };

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      if (error.code === "ENOENT") {
        finish(
          new Error(
            "Required command not found: mblist. Is MB-System installed?"
          )
        );
        return;
      }

      finish(error);
    });

    child.on("close", (code) => {
      exitCode = code;

      if (code !== 0) {
        finish(
          new Error(
            stderr.trim() || `mblist exited with code ${code}`
          )
        );
        return;
      }

      writeStream.end();
    });

    writeStream.on("finish", () => {
      if (exitCode !== 0) {
        return;
      }

      if (pointCount === 0) {
        finish(
          new Error(
            "No soundings were extracted from the input file."
          )
        );
        return;
      }

      finish(null, {
        pointCount,
        minDepth: minDepth === null ? 0 : minDepth,
        maxDepth: maxDepth === null ? 0 : maxDepth,
      });
    });

    writeStream.on("error", (error) => {
      finish(error);
    });

    /**
     * Write CSV header for PDAL.
     */
    writeStream.write("X,Y,Z\n");

    rl.on("line", (line) => {
      const trimmed = line.trim();

      if (!trimmed) {
        return;
      }

      /**
       * Skip comments or unexpected header lines.
       */
      if (trimmed.startsWith("#")) {
        return;
      }

      const parts = trimmed.split(/[\s,;]+/);

      if (parts.length < 3) {
        return;
      }

      const longitude = Number(parts[0]);
      const latitude = Number(parts[1]);
      const depth = Number(parts[2]);

      if (
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(depth)
      ) {
        return;
      }

      pointCount += 1;

      if (minDepth === null || depth < minDepth) {
        minDepth = depth;
      }

      if (maxDepth === null || depth > maxDepth) {
        maxDepth = depth;
      }

      /**
       * Convert positive-down depth to elevation.
       */
      const elevation = -depth;

      writeStream.write(`${longitude},${latitude},${elevation}\n`);
    });
  });
};

/**
 * Convert normalized XYZ file to LAS using PDAL.
 */
const createLasWithPdal = async (
  normalizedXyzPath,
  outputPath,
  jobDir
) => {
  const pipelinePath = path.join(jobDir, "pipeline.json");

  const pipeline = {
    pipeline: [
      {
        type: "readers.text",
        filename: normalizedXyzPath,
        header: "X,Y,Z",
        skip: 1,
      },
      {
        type: "writers.las",
        filename: outputPath,
        a_srs: "EPSG:4326",
        scale_x: 0.0000001,
        scale_y: 0.0000001,
        scale_z: 0.01,
        offset_x: 0,
        offset_y: 0,
        offset_z: 0,
      },
    ],
  };

  await fsp.writeFile(
    pipelinePath,
    JSON.stringify(pipeline, null, 2),
    "utf8"
  );

  await processService.runCommand({
    command: "pdal",
    args: ["pipeline", pipelinePath],
    options: {
      cwd: jobDir,
    },
    timeoutMs: env.commandTimeoutMs,
  });
};

/**
 * Basic output validation.
 */
const validateOutputFile = async (outputPath) => {
  try {
    const stats = await fsp.stat(outputPath);

    if (!stats.isFile()) {
      throw new Error("Output LAS path is not a file");
    }

    if (stats.size === 0) {
      throw new Error("Output LAS file is empty");
    }
  } catch (error) {
    throw new Error(
      "LAS output file could not be validated. Conversion may have failed."
    );
  }
};

/**
 * Convert technical errors into user-friendly messages.
 */
const friendlyErrorMessage = (stage, error) => {
  const message = error.message || String(error);

  if (message.includes("command not found")) {
    return "A required conversion tool is not installed in the server environment.";
  }

  switch (stage) {
    case "validating":
      return "The uploaded file could not be read. Please upload a valid Kongsberg .all file.";

    case "preprocessing":
      return "The file could not be preprocessed. It may be corrupt or unsupported.";

    case "extracting":
      return "Soundings could not be extracted from the file.";

    case "converting":
      return "The extracted points could not be converted to LAS format.";

    default:
      return "Conversion failed.";
  }
};

module.exports = {
  start,
};