const { spawn } = require("child_process");

const env = require("../config/env");

/**
 * Return only the last part of an error message.
 *
 * Some command-line tools print a lot of stderr output.
 * For API errors, we usually only need the end of the message.
 */
const tail = (text, maxLength = 1000) => {
  if (!text) {
    return "";
  }

  const trimmed = String(text).trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return trimmed.slice(-maxLength);
};

/**
 * Run a command safely using child_process.spawn.
 *
 * Example:
 *
 * await runCommand({
 *   command: "mbinfo",
 *   args: ["-I", "/data/jobs/job-id/input.all"],
 * });
 */
const runCommand = ({
  command,
  args = [],
  options = {},
  timeoutMs = env.commandTimeoutMs,
}) => {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let killedByTimeout = false;

    const child = spawn(command, args, {
      ...options,
    });

    const timer = setTimeout(() => {
      killedByTimeout = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);

      if (error.code === "ENOENT") {
        reject(
          new Error(
            `Required command not found: ${command}. Is MB-System installed?`
          )
        );
        return;
      }

      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      if (killedByTimeout) {
        reject(
          new Error(
            `Command timed out after ${timeoutMs}ms: ${command} ${args.join(
              " "
            )}`
          )
        );
        return;
      }

      if (code === 0) {
        resolve({
          stdout,
          stderr,
        });
        return;
      }

      const errorMessage =
        tail(stderr) || `${command} exited with code ${code}`;

      reject(new Error(errorMessage));
    });
  });
};

module.exports = {
  runCommand,
};