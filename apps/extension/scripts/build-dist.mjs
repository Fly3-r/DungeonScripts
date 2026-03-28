import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(scriptDir, "..");
const distDir = path.join(extensionDir, "dist");
const RM_OPTIONS = {
  recursive: true,
  force: true,
  maxRetries: 5,
  retryDelay: 100
};

export const targets = {
  chrome: "manifest.json",
  firefox: "manifest.firefox.json"
};

export const loadTargetManifest = async (target) => {
  const manifestSource = path.join(extensionDir, targets[target]);
  const manifest = await readFile(manifestSource, "utf8");
  return JSON.parse(manifest);
};

export const buildExtensionTarget = async (target) => {
  if (!target || !targets[target]) {
    throw new Error(
      `Unknown build target "${target}". Use one of: ${Object.keys(targets).join(", ")}.`
    );
  }

  const manifestSource = path.join(extensionDir, targets[target]);
  const targetDir = path.join(distDir, target);
  const manifestOutput = path.join(targetDir, "manifest.json");
  const sourceDir = path.join(extensionDir, "src");
  const manifest = await readFile(manifestSource, "utf8");
  const parsedManifest = JSON.parse(manifest);

  await rm(targetDir, RM_OPTIONS);
  await mkdir(targetDir, { recursive: true });
  await cp(sourceDir, path.join(targetDir, "src"), { recursive: true });
  await writeFile(manifestOutput, manifest);

  return {
    manifest: parsedManifest,
    targetDir
  };
};

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;

if (entryPath === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  const result = await buildExtensionTarget(target);
  console.log(`Built ${target} extension to ${result.targetDir}`);
}
