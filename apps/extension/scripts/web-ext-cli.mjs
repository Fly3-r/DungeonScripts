import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptDir, "..", "..", "..");

const hasFlag = (args, flag) =>
  args.includes(flag) || args.some((arg) => arg.startsWith(`${flag}=`));

export const resolveNpxCommand = async () => {
  if (process.platform !== "win32") {
    return {
      command: "npx",
      argsPrefix: []
    };
  }

  const cliPath = path.join(
    process.env.ProgramFiles || "C:\\Program Files",
    "nodejs",
    "node_modules",
    "npm",
    "bin",
    "npx-cli.js"
  );

  try {
    await access(cliPath, fsConstants.F_OK);
    return {
      command: process.execPath,
      argsPrefix: [cliPath]
    };
  } catch {
    return {
      command: process.execPath,
      argsPrefix: [
        path.join(
          process.env.ProgramFiles || "C:\\Program Files",
          "nodejs",
          "node_modules",
          "npm",
          "bin",
          "npx-cli.js"
        )
      ]
    };
  }
};

export const resolveAdbExecutable = async () => {
  if (process.platform !== "win32") {
    return "adb";
  }

  const sdkRoot = process.env.ANDROID_SDK_ROOT || path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk");
  const preferredPath = path.join(sdkRoot, "platform-tools", "adb.exe");

  try {
    await access(preferredPath, fsConstants.F_OK);
    return preferredPath;
  } catch {
    return "adb";
  }
};

export const resolveSingleAndroidDevice = async () => {
  const adbExecutable = await resolveAdbExecutable();
  const { stdout } = await execFileAsync(adbExecutable, ["devices"], { cwd: repoRoot });
  const devices = stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("List of devices attached"))
    .map((line) => line.split(/\s+/u))
    .filter((parts) => parts[1] === "device")
    .map((parts) => parts[0]);

  if (devices.length === 1) {
    return devices[0];
  }

  return null;
};

export const runWebExt = async (args, { cwd = repoRoot } = {}) => {
  const { command, argsPrefix } = await resolveNpxCommand();
  const commandArgs = [...argsPrefix, "--yes", "web-ext", ...args];

  await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd,
      stdio: "inherit",
      shell: false
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal ?
            `web-ext terminated with signal ${signal}.` :
            `web-ext exited with code ${code ?? "unknown"}.`
        )
      );
    });
  });
};

export const androidRunDefaults = async (args) => {
  const nextArgs = [...args];

  if (!hasFlag(nextArgs, "--android-device") && !hasFlag(nextArgs, "--adb-device")) {
    const deviceId = process.env.ANDROID_DEVICE || await resolveSingleAndroidDevice();
    if (deviceId) {
      nextArgs.push("--android-device", deviceId);
    }
  }

  if (!hasFlag(nextArgs, "--firefox-apk")) {
    nextArgs.push("--firefox-apk", process.env.FIREFOX_ANDROID_APK || "org.mozilla.fenix");
  }

  return nextArgs;
};
