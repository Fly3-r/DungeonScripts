import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildExtensionTarget } from "./build-dist.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..", "..");
const appsDir = path.join(repoRoot, "apps");
const gitExecutable = process.env.GIT_EXECUTABLE || "C:\\Program Files\\Git\\cmd\\git.exe";
const RM_OPTIONS = {
  recursive: true,
  force: true,
  maxRetries: 5,
  retryDelay: 100
};

const args = new Set(process.argv.slice(2));
const shouldCheckStagedChanges = args.has("--if-staged-extension-change");
const shouldStageArtifact = args.has("--stage");

const getStagedFiles = () => {
  const output = execFileSync(gitExecutable, ["diff", "--cached", "--name-only"], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
};

const hasStagedExtensionChange = (files) =>
  files.some(
    (file) => file.startsWith("apps/extension/") && !file.startsWith("apps/extension/dist/")
  );

if (shouldCheckStagedChanges) {
  const stagedFiles = getStagedFiles();
  if (!hasStagedExtensionChange(stagedFiles)) {
    console.log("No staged extension changes detected. Skipping Firefox release sync.");
    process.exit(0);
  }
}

const { manifest, targetDir } = await buildExtensionTarget("firefox");
const version = manifest.version;
const releaseDir = path.join(appsDir, `firefox-${version}`);

await rm(releaseDir, RM_OPTIONS);
await mkdir(releaseDir, { recursive: true });
await cp(targetDir, releaseDir, { recursive: true });

if (shouldStageArtifact) {
  execFileSync(gitExecutable, ["add", "--all", path.relative(repoRoot, releaseDir)], {
    cwd: repoRoot,
    stdio: "inherit"
  });
}

console.log(`Synced Firefox release to ${releaseDir}`);
