import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const submissionsRootDir = path.join(repoRoot, "apps", "catalog", "data", "submissions");
const packagesDir = path.join(repoRoot, "apps", "catalog", "data", "packages");
const stateDirs = {
  pending: path.join(submissionsRootDir, "pending"),
  approved: path.join(submissionsRootDir, "approved"),
  rejected: path.join(submissionsRootDir, "rejected"),
  needs_changes: path.join(submissionsRootDir, "needs_changes")
};
const stateOrder = ["pending", "approved", "needs_changes", "rejected"];
const defaultReviewer = "local-review";
const defaultMinInstallerVersion = "0.1.0";

const usage = () => {
  console.log(`Usage:
  node ./scripts/review-submissions.mjs list [state]
  node ./scripts/review-submissions.mjs show <submissionId>
  node ./scripts/review-submissions.mjs approve <submissionId> [--reviewer NAME] [--notes TEXT]
  node ./scripts/review-submissions.mjs reject <submissionId> [--reviewer NAME] [--notes TEXT]
  node ./scripts/review-submissions.mjs needs-changes <submissionId> [--reviewer NAME] [--notes TEXT]

States: pending | approved | rejected | needs_changes | all`);
};

const parseArgs = (argv) => {
  const positionals = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value.startsWith("--")) {
      const key = value.slice(2);
      const next = argv[index + 1];

      if (next && !next.startsWith("--")) {
        options[key] = next;
        index += 1;
      } else {
        options[key] = true;
      }
      continue;
    }

    positionals.push(value);
  }

  return { positionals, options };
};

const ensureSubmissionDirs = async () => {
  await Promise.all(Object.values(stateDirs).map((dir) => mkdir(dir, { recursive: true })));
};

const loadSubmissionsInState = async (state) => {
  const dir = stateDirs[state];
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(dir, entry.name));

  const submissions = [];
  for (const file of files) {
    const raw = await readFile(file, "utf8");
    submissions.push(JSON.parse(raw));
  }

  submissions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return submissions;
};

const findSubmission = async (submissionId) => {
  for (const state of stateOrder) {
    const filePath = path.join(stateDirs[state], `${submissionId}.json`);

    try {
      const raw = await readFile(filePath, "utf8");
      return {
        state,
        filePath,
        submission: JSON.parse(raw)
      };
    } catch {
      // Continue searching.
    }
  }

  return null;
};

const formatLength = (value) => `${value.length} chars`;

const buildManifestFromSubmission = (submission) => {
  const manifest = {
    id: submission.package.id,
    name: submission.package.name,
    version: submission.package.version,
    description: submission.package.description,
    author: submission.package.author,
    authorProfileUrl: submission.package.authorProfileUrl,
    ...(submission.package.thumbnailUrl ? { thumbnailUrl: submission.package.thumbnailUrl } : {}),
    minInstallerVersion: submission.package.minInstallerVersion || defaultMinInstallerVersion,
    sharedLibrary: submission.package.sharedLibrary,
    onInput: submission.package.onInput,
    onModelContext: submission.package.onModelContext,
    onOutput: submission.package.onOutput
  };

  const hash = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
  return {
    ...manifest,
    hash: `sha256:${hash}`
  };
};

const persistSubmissionState = async (current, nextStatus, options = {}) => {
  const reviewedAt = new Date().toISOString();
  const updated = {
    ...current.submission,
    status: nextStatus,
    updatedAt: reviewedAt,
    review: {
      reviewer: options.reviewer || defaultReviewer,
      reviewedAt,
      notes: options.notes || ""
    },
    ...(options.publishedManifestFile ? { publishedManifestFile: options.publishedManifestFile } : {}),
    ...(options.publishedHash ? { publishedHash: options.publishedHash } : {})
  };

  const nextFilePath = path.join(stateDirs[nextStatus], `${updated.submissionId}.json`);
  await writeFile(nextFilePath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");

  if (current.filePath !== nextFilePath) {
    await unlink(current.filePath);
  }

  return updated;
};

const listCommand = async (state) => {
  const targetStates = state === "all" ? stateOrder : [state || "pending"];

  for (const targetState of targetStates) {
    if (!stateDirs[targetState]) {
      throw new Error(`Unknown state: ${targetState}`);
    }

    const submissions = await loadSubmissionsInState(targetState);
    console.log(`\n[${targetState}] ${submissions.length} submission(s)`);

    if (submissions.length === 0) {
      continue;
    }

    for (const submission of submissions) {
      console.log(
        `${submission.submissionId} | ${submission.package.id} | ${submission.package.name} | ${submission.package.version} | ${submission.createdAt}`
      );
    }
  }
};

const showCommand = async (submissionId) => {
  const current = await findSubmission(submissionId);
  if (!current) {
    throw new Error(`Submission not found: ${submissionId}`);
  }

  const { submission, state } = current;
  console.log(`Submission ID: ${submission.submissionId}`);
  console.log(`Queue State: ${state}`);
  console.log(`Package ID: ${submission.package.id}`);
  console.log(`Name: ${submission.package.name}`);
  console.log(`Version: ${submission.package.version}`);
  console.log(`Author: ${submission.package.author}`);
  console.log(`Author Profile: ${submission.package.authorProfileUrl}`);
  console.log(`Discord Username: ${submission.contact.discordUsername}`);
  console.log(`Created At: ${submission.createdAt}`);
  console.log(`Updated At: ${submission.updatedAt}`);
  console.log(`Thumbnail URL: ${submission.package.thumbnailUrl || "(placeholder)"}`);
  console.log(`Shared Library: ${formatLength(submission.package.sharedLibrary)}`);
  console.log(`On Input: ${formatLength(submission.package.onInput)}`);
  console.log(`On Model Context: ${formatLength(submission.package.onModelContext)}`);
  console.log(`On Output: ${formatLength(submission.package.onOutput)}`);
  console.log("");
  console.log("Description:");
  console.log(submission.package.description);
  console.log("");
  console.log(`Reviewer: ${submission.review.reviewer || "(not reviewed)"}`);
  console.log(`Reviewed At: ${submission.review.reviewedAt || "(not reviewed)"}`);
  console.log(`Review Notes: ${submission.review.notes || "(none)"}`);
  if (submission.publishedManifestFile) {
    console.log(`Published Manifest: ${submission.publishedManifestFile}`);
  }
  if (submission.publishedHash) {
    console.log(`Published Hash: ${submission.publishedHash}`);
  }
};

const approveCommand = async (submissionId, options) => {
  const current = await findSubmission(submissionId);
  if (!current) {
    throw new Error(`Submission not found: ${submissionId}`);
  }

  if (current.state !== "pending") {
    throw new Error(`Only pending submissions can be approved. Current state: ${current.state}`);
  }

  const manifest = buildManifestFromSubmission(current.submission);
  const manifestPath = path.join(packagesDir, `${manifest.id}.json`);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const updated = await persistSubmissionState(current, "approved", {
    reviewer: options.reviewer,
    notes: options.notes,
    publishedManifestFile: path.relative(repoRoot, manifestPath).replace(/\\/g, "/"),
    publishedHash: manifest.hash
  });

  console.log(`Approved ${updated.submissionId}`);
  console.log(`Published ${updated.package.id} to ${updated.publishedManifestFile}`);
  console.log(`Hash ${updated.publishedHash}`);
};

const dispositionCommand = async (submissionId, nextStatus, options) => {
  const current = await findSubmission(submissionId);
  if (!current) {
    throw new Error(`Submission not found: ${submissionId}`);
  }

  if (current.state !== "pending") {
    throw new Error(`Only pending submissions can be updated. Current state: ${current.state}`);
  }

  const updated = await persistSubmissionState(current, nextStatus, options);
  console.log(`Updated ${updated.submissionId} -> ${nextStatus}`);
};

const main = async () => {
  await ensureSubmissionDirs();
  await mkdir(packagesDir, { recursive: true });

  const { positionals, options } = parseArgs(process.argv.slice(2));
  const [command, arg1] = positionals;

  if (!command || command === "help" || command === "--help") {
    usage();
    return;
  }

  if (command === "list") {
    await listCommand(arg1 || "pending");
    return;
  }

  if (command === "show") {
    if (!arg1) {
      throw new Error("show requires a submission ID.");
    }
    await showCommand(arg1);
    return;
  }

  if (command === "approve") {
    if (!arg1) {
      throw new Error("approve requires a submission ID.");
    }
    await approveCommand(arg1, options);
    return;
  }

  if (command === "reject") {
    if (!arg1) {
      throw new Error("reject requires a submission ID.");
    }
    await dispositionCommand(arg1, "rejected", options);
    return;
  }

  if (command === "needs-changes") {
    if (!arg1) {
      throw new Error("needs-changes requires a submission ID.");
    }
    await dispositionCommand(arg1, "needs_changes", options);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
