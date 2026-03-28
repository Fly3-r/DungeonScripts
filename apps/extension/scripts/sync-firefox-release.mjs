import { readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildExtensionTarget } from "./build-dist.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..", "..");
const appsDir = path.join(repoRoot, "apps");
const powershellExecutable =
  process.env.POWERSHELL_EXECUTABLE ||
  "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const RM_OPTIONS = {
  recursive: true,
  force: true,
  maxRetries: 5,
  retryDelay: 100
};

const escapePowerShellString = (value) => String(value).replace(/'/g, "''");
const FIREFOX_ARTIFACT_RE = /^firefox-.+(?:\.xpi|\.zip)?$/u;

const removeLegacyFirefoxArtifacts = async () => {
  const entries = await readdir(appsDir, { withFileTypes: true });
  const removals = entries
    .filter((entry) => FIREFOX_ARTIFACT_RE.test(entry.name))
    .map((entry) => rm(path.join(appsDir, entry.name), RM_OPTIONS));

  await Promise.all(removals);
};

const { manifest, targetDir } = await buildExtensionTarget("firefox");
const version = manifest.version;
const archiveBasePath = path.join(appsDir, `firefox-${version}`);
const zipPath = `${archiveBasePath}.zip`;
const xpiPath = `${archiveBasePath}.xpi`;

await removeLegacyFirefoxArtifacts();

execFileSync(
  powershellExecutable,
  [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `Compress-Archive -Path (Join-Path '${escapePowerShellString(targetDir)}' '*') -DestinationPath '${escapePowerShellString(zipPath)}' -Force`
  ],
  {
    cwd: repoRoot,
    stdio: "inherit"
  }
);

await rename(zipPath, xpiPath);

console.log(`Synced Firefox release to ${xpiPath}`);
