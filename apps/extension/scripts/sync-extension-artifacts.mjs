import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildExtensionTarget } from "./build-dist.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..", "..");
const appsDir = path.join(repoRoot, "apps");
const artifactDir = path.join(repoRoot, "dist");
const powershellExecutable =
  process.env.POWERSHELL_EXECUTABLE ||
  "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const RM_OPTIONS = {
  recursive: true,
  force: true,
  maxRetries: 5,
  retryDelay: 100
};

const ARTIFACT_SPECS = [
  {
    target: "chrome",
    fileName: (version) => `Chrome-Desktop-${version}.zip`
  },
  {
    target: "firefox",
    fileName: (version) => `Firefox-Desktop-${version}.zip`
  },
  {
    target: "firefox-android",
    fileName: (version) => `Firefox-Mobile-${version}.xpi`
  }
];

const DIST_ARTIFACT_RE = /^(?:Chrome-Desktop|Firefox-Desktop|Firefox-Mobile)-.+\.(?:zip|xpi)$/u;
const LEGACY_APPS_ARTIFACT_RE = /^(?:extension-.+\.zip|firefox-.+\.(?:zip|xpi))$/u;

const escapePowerShellString = (value) => String(value).replace(/'/g, "''");

const readDirSafe = async (directoryPath) => {
  try {
    return await readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }

    throw error;
  }
};

const removeMatchingArtifacts = async (directoryPath, pattern) => {
  const entries = await readDirSafe(directoryPath);
  const removals = entries
    .filter((entry) => pattern.test(entry.name))
    .map((entry) => rm(path.join(directoryPath, entry.name), RM_OPTIONS));

  await Promise.all(removals);
};

const archiveDirectory = (sourceDir, destinationPath) => {
  execFileSync(
    powershellExecutable,
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      [
        "Add-Type -AssemblyName System.IO.Compression",
        "Add-Type -AssemblyName System.IO.Compression.FileSystem",
        `$sourceDir = '${escapePowerShellString(sourceDir)}'`,
        `$destination = '${escapePowerShellString(destinationPath)}'`,
        "$stream = [System.IO.File]::Open($destination, [System.IO.FileMode]::CreateNew)",
        "$files = Get-ChildItem -Path $sourceDir -Recurse -File",
        "$archive = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create, $false)",
        "try {",
        "  foreach ($file in $files) {",
        "    $relativePath = $file.FullName.Substring($sourceDir.Length + 1).Replace('\\', '/')",
        "    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $relativePath, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null",
        "  }",
        "}",
        "finally {",
        "  if ($archive) { $archive.Dispose() }",
        "  if ($stream) { $stream.Dispose() }",
        "}"
      ].join("\n")
    ],
    {
      cwd: repoRoot,
      stdio: "inherit"
    }
  );
};

const builtTargets = [];

for (const spec of ARTIFACT_SPECS) {
  const result = await buildExtensionTarget(spec.target);
  builtTargets.push({
    ...result,
    artifactName: spec.fileName(result.manifest.version)
  });
}

const versions = new Set(builtTargets.map((target) => target.manifest.version));
if (versions.size !== 1) {
  throw new Error("Extension targets do not share a single version number.");
}

await mkdir(artifactDir, { recursive: true });
await Promise.all([
  removeMatchingArtifacts(artifactDir, DIST_ARTIFACT_RE),
  removeMatchingArtifacts(appsDir, LEGACY_APPS_ARTIFACT_RE)
]);

for (const target of builtTargets) {
  archiveDirectory(target.targetDir, path.join(artifactDir, target.artifactName));
}

console.log(
  `Synced extension artifacts to ${artifactDir}: ${builtTargets
    .map((target) => target.artifactName)
    .join(", ")}`
);
