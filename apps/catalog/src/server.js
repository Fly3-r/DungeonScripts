import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { appendFile, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const packagesDir = path.join(appRoot, "data", "packages");
const publicDir = path.join(appRoot, "public");
const submissionsRootDir = path.join(appRoot, "data", "submissions");
const submissionStateDirs = {
  pending: path.join(submissionsRootDir, "pending"),
  approved: path.join(submissionsRootDir, "approved"),
  rejected: path.join(submissionsRootDir, "rejected"),
  needs_changes: path.join(submissionsRootDir, "needs_changes")
};
const submissionStates = Object.keys(submissionStateDirs);
const runtimeDir = path.resolve(
  appRoot,
  process.env.TELEMETRY_STORAGE_DIR || "./data/runtime"
);
const telemetryLogFile = path.join(runtimeDir, "install-success.ndjson");
const dedupeFile = path.join(runtimeDir, "install-success.ids.json");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3000);
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://${host}:${port}`;
const defaultMinInstallerVersion = process.env.DEFAULT_MIN_INSTALLER_VERSION || "0.1.0";
const adminUsername = process.env.CATALOG_ADMIN_USERNAME || "admin";
const adminPassword = process.env.CATALOG_ADMIN_PASSWORD || "";
const adminConfigured = typeof adminPassword === "string" && adminPassword.trim().length > 0;
const allowedEventKeys = [
  "event",
  "installId",
  "packageId",
  "packageVersion",
  "leafCount",
  "timestamp"
];
const API_BASE_PATH = "/api/v1";
const DEFAULT_THUMBNAIL_PATH = "/assets/thumbnail-placeholder.svg";
const PACKAGE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

const json = (res, statusCode, payload, headers = {}) => {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body, "utf8"),
    ...headers
  });
  res.end(body);
};

const notFound = (res) => {
  json(res, 404, { ok: false, error: "Not found" });
};

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

const normalizeMultilineText = (value) => value.replace(/\r\n/g, "\n");

const parseJsonBody = async (req, maxBytes = 10_000) => {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new Error("Payload too large.");
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
};

const timingSafeStringEquals = (left, right) => {
  const leftHash = createHash("sha256").update(left, "utf8").digest();
  const rightHash = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftHash, rightHash);
};

const getAdminAuthState = (req) => {
  if (!adminConfigured) {
    return {
      configured: false,
      authenticated: false,
      username: adminUsername
    };
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith("Basic ")) {
    return {
      configured: true,
      authenticated: false,
      username: adminUsername
    };
  }

  let decoded = "";
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return {
      configured: true,
      authenticated: false,
      username: adminUsername
    };
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex < 0) {
    return {
      configured: true,
      authenticated: false,
      username: adminUsername
    };
  }

  const providedUsername = decoded.slice(0, separatorIndex);
  const providedPassword = decoded.slice(separatorIndex + 1);
  return {
    configured: true,
    authenticated:
      timingSafeStringEquals(providedUsername, adminUsername) &&
      timingSafeStringEquals(providedPassword, adminPassword),
    username: adminUsername
  };
};

const requireAdminAuth = (req, res) => {
  const state = getAdminAuthState(req);
  if (!state.configured) {
    json(res, 503, {
      ok: false,
      error: "Admin review is not configured.",
      configured: false
    });
    return false;
  }

  if (!state.authenticated) {
    res.writeHead(401, {
      "WWW-Authenticate": 'Basic realm="AID One-Click Admin"'
    });
    res.end();
    return false;
  }

  return true;
};

const ensureRuntimeDir = async () => {
  await mkdir(runtimeDir, { recursive: true });
};

const ensureSubmissionDirs = async () => {
  await Promise.all(
    Object.values(submissionStateDirs).map((dir) => mkdir(dir, { recursive: true }))
  );
};

const sanitizeMarkdownPreview = (value) =>
  value
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/[\*_`>#]/g, " ")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildDescriptionPreview = (value) => {
  const preview = sanitizeMarkdownPreview(value || "");
  if (!preview) {
    return "No description provided.";
  }

  return preview.length > 220 ? `${preview.slice(0, 217)}...` : preview;
};

const getPublicAssetUrl = (value, fallback = DEFAULT_THUMBNAIL_PATH) => {
  const candidate =
    typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;

  try {
    return new URL(candidate).toString();
  } catch {
    return new URL(candidate, publicBaseUrl).toString();
  }
};

const getSafeUrl = (value) => {
  if (!isNonEmptyString(value)) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
};

const normalizePackageManifest = (entry) => ({
  ...entry,
  author: isNonEmptyString(entry.author) ? entry.author.trim() : "Unknown",
  authorProfileUrl: getSafeUrl(entry.authorProfileUrl),
  thumbnailUrl: getPublicAssetUrl(entry.thumbnailUrl)
});

const loadPackages = async () => {
  const entries = await readdir(packagesDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(packagesDir, entry.name));

  const manifests = [];
  for (const file of files) {
    const raw = await readFile(file, "utf8");
    manifests.push(normalizePackageManifest(JSON.parse(raw)));
  }

  manifests.sort((a, b) => a.name.localeCompare(b.name));
  return manifests;
};

const loadPackageById = async (packageId) => {
  const manifests = await loadPackages();
  return manifests.find((entry) => entry.id === packageId) || null;
};

const loadDedupeIds = async () => {
  try {
    const raw = await readFile(dedupeFile, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const storeDedupeIds = async (ids) => {
  await writeFile(dedupeFile, JSON.stringify(ids, null, 2));
};

const loadInstallCounts = async () => {
  try {
    const raw = await readFile(telemetryLogFile, "utf8");
    const counts = new Map();

    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }

      try {
        const event = JSON.parse(line);
        if (event?.event !== "script_install_succeeded" || typeof event.packageId !== "string") {
          continue;
        }

        counts.set(event.packageId, (counts.get(event.packageId) || 0) + 1);
      } catch {
        // Ignore malformed telemetry lines.
      }
    }

    return counts;
  } catch {
    return new Map();
  }
};
const loadSubmissionsInState = async (state) => {
  const dir = submissionStateDirs[state];
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

const loadSubmissionCounts = async () => {
  const counts = {};

  for (const state of submissionStates) {
    counts[state] = (await loadSubmissionsInState(state)).length;
  }

  return counts;
};

const findSubmissionRecord = async (submissionId) => {
  for (const state of submissionStates) {
    const filePath = path.join(submissionStateDirs[state], `${submissionId}.json`);

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

const resolveSubmissionStates = (filter) => {
  if (!filter || filter === "all") {
    return submissionStates;
  }

  if (!submissionStateDirs[filter]) {
    throw new Error(`Unknown submission state: ${filter}`);
  }

  return [filter];
};

const buildPackageSummary = (entry, installCounts) => ({
  id: entry.id,
  name: entry.name,
  version: entry.version,
  description: buildDescriptionPreview(entry.description),
  author: entry.author,
  authorProfileUrl: entry.authorProfileUrl,
  thumbnailUrl: getPublicAssetUrl(entry.thumbnailUrl),
  installCount: installCounts.get(entry.id) || 0
});

const normalizeSubmissionForAdmin = (entry, state) => ({
  ...entry,
  status: state,
  package: {
    ...entry.package,
    author: isNonEmptyString(entry.package.author) ? entry.package.author.trim() : "Unknown",
    authorProfileUrl: getSafeUrl(entry.package.authorProfileUrl),
    thumbnailUrl: entry.package.thumbnailUrl || DEFAULT_THUMBNAIL_PATH,
    thumbnailPreviewUrl: getPublicAssetUrl(entry.package.thumbnailUrl),
    descriptionPreview: buildDescriptionPreview(entry.package.description)
  }
});

const buildSubmissionSummary = (entry, state) => {
  const normalized = normalizeSubmissionForAdmin(entry, state);
  return {
    submissionId: normalized.submissionId,
    status: normalized.status,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    package: {
      id: normalized.package.id,
      name: normalized.package.name,
      version: normalized.package.version,
      author: normalized.package.author,
      authorProfileUrl: normalized.package.authorProfileUrl,
      thumbnailPreviewUrl: normalized.package.thumbnailPreviewUrl,
      descriptionPreview: normalized.package.descriptionPreview
    },
    contact: {
      discordUsername: normalized.contact.discordUsername
    },
    review: normalized.review,
    publishedManifestFile: normalized.publishedManifestFile || null,
    publishedHash: normalized.publishedHash || null
  };
};

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

  const hash = createHash("sha256").update(JSON.stringify(manifest), "utf8").digest("hex");
  return {
    ...manifest,
    hash: `sha256:${hash}`
  };
};

const requireTrimmedString = (payload, fieldName, maxLength) => {
  if (typeof payload[fieldName] !== "string") {
    throw new Error(`Field \"${fieldName}\" must be a string.`);
  }

  const value = payload[fieldName].trim();
  if (!value) {
    throw new Error(`Field \"${fieldName}\" is required.`);
  }

  if (value.length > maxLength) {
    throw new Error(`Field \"${fieldName}\" exceeds the maximum allowed length.`);
  }

  return value;
};

const getOptionalTrimmedString = (payload, fieldName, maxLength) => {
  if (payload[fieldName] == null) {
    return "";
  }

  if (typeof payload[fieldName] !== "string") {
    throw new Error(`Field \"${fieldName}\" must be a string.`);
  }

  const value = payload[fieldName].trim();
  if (value.length > maxLength) {
    throw new Error(`Field \"${fieldName}\" exceeds the maximum allowed length.`);
  }

  return value;
};

const requireScriptField = (payload, fieldName, maxLength) => {
  if (typeof payload[fieldName] !== "string") {
    throw new Error(`Field \"${fieldName}\" must be a string.`);
  }

  const value = normalizeMultilineText(payload[fieldName]);
  if (value.length > maxLength) {
    throw new Error(`Field \"${fieldName}\" exceeds the maximum allowed length.`);
  }

  return value;
};

const validateInstallSuccessEvent = (payload) => {
  const keys = Object.keys(payload).sort();
  const expectedKeys = [...allowedEventKeys].sort();

  if (keys.length !== expectedKeys.length) {
    throw new Error("Telemetry payload contains unexpected fields.");
  }

  for (let index = 0; index < keys.length; index += 1) {
    if (keys[index] !== expectedKeys[index]) {
      throw new Error("Telemetry payload contains unexpected fields.");
    }
  }

  if (payload.event !== "script_install_succeeded") {
    throw new Error("Unsupported telemetry event.");
  }

  for (const field of ["installId", "packageId", "packageVersion", "timestamp"]) {
    if (typeof payload[field] !== "string" || payload[field].trim().length === 0) {
      throw new Error(`Telemetry field \"${field}\" must be a non-empty string.`);
    }
  }

  if (!Number.isInteger(payload.leafCount) || payload.leafCount <= 0) {
    throw new Error('Telemetry field "leafCount" must be a positive integer.');
  }

  if (Number.isNaN(Date.parse(payload.timestamp))) {
    throw new Error('Telemetry field "timestamp" must be a valid ISO-8601 string.');
  }

  return {
    event: payload.event,
    installId: payload.installId,
    packageId: payload.packageId,
    packageVersion: payload.packageVersion,
    leafCount: payload.leafCount,
    timestamp: payload.timestamp
  };
};

const validateAidProfileUrl = (value) => {
  let url;

  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Author profile URL must be a valid URL.");
  }

  if (url.protocol !== "https:" || url.hostname !== "play.aidungeon.com") {
    throw new Error("Author profile URL must use https://play.aidungeon.com/profile/<handle>.");
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2 || segments[0] !== "profile" || !segments[1]) {
    throw new Error("Author profile URL must use https://play.aidungeon.com/profile/<handle>.");
  }

  url.search = "";
  url.hash = "";
  return url.toString();
};

const deriveAuthorFromProfileUrl = (value) => {
  const url = new URL(value);
  const segments = url.pathname.split("/").filter(Boolean);
  return decodeURIComponent(segments[segments.length - 1]);
};

const validateThumbnailUrl = (value) => {
  if (!isNonEmptyString(value)) {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  const url = getSafeUrl(trimmed);
  if (!url) {
    throw new Error("Thumbnail URL must be empty, root-relative, or a valid http/https URL.");
  }

  return url;
};
const validateSubmissionPayload = (payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Submission payload must be an object.");
  }

  const packageId = requireTrimmedString(payload, "packageId", 80);
  if (!PACKAGE_ID_PATTERN.test(packageId)) {
    throw new Error("Package ID must be a lowercase slug using letters, numbers, and hyphens only.");
  }

  const version = requireTrimmedString(payload, "version", 40);
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error("Version must look like semantic versioning, for example 1.2.3.");
  }

  const authorProfileUrl = validateAidProfileUrl(
    requireTrimmedString(payload, "authorProfileUrl", 200)
  );
  const author = deriveAuthorFromProfileUrl(authorProfileUrl);
  const description = requireTrimmedString(payload, "description", 24000);
  const discordUsername = requireTrimmedString(payload, "discordUsername", 80);
  const thumbnailUrl = validateThumbnailUrl(payload.thumbnailUrl);

  return {
    package: {
      id: packageId,
      name: requireTrimmedString(payload, "name", 120),
      version,
      description,
      author,
      authorProfileUrl,
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      sharedLibrary: requireScriptField(payload, "sharedLibrary", 200000),
      onInput: requireScriptField(payload, "onInput", 200000),
      onModelContext: requireScriptField(payload, "onModelContext", 200000),
      onOutput: requireScriptField(payload, "onOutput", 200000),
      minInstallerVersion: defaultMinInstallerVersion
    },
    contact: {
      discordUsername
    }
  };
};

const validateAdminReviewPayload = (payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Review payload must be an object.");
  }

  const action = requireTrimmedString(payload, "action", 40);
  if (!["approve", "reject", "needs_changes"].includes(action)) {
    throw new Error("Review action must be approve, reject, or needs_changes.");
  }

  const reviewer = getOptionalTrimmedString(payload, "reviewer", 120) || adminUsername;
  const notes = getOptionalTrimmedString(payload, "notes", 16000);

  if ((action === "reject" || action === "needs_changes") && !notes) {
    throw new Error("Review notes are required when rejecting a submission or requesting changes.");
  }

  return {
    action,
    reviewer,
    notes
  };
};

const createSubmissionRecord = (payload) => {
  const timestamp = new Date().toISOString();

  return {
    submissionId: `sub_${randomUUID()}`,
    status: "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
    package: payload.package,
    contact: payload.contact,
    review: {
      reviewer: null,
      reviewedAt: null,
      notes: ""
    }
  };
};

const persistSubmissionRecord = async (record) => {
  await ensureSubmissionDirs();
  const filePath = path.join(submissionStateDirs.pending, `${record.submissionId}.json`);
  await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
};

const persistSubmissionRecordInState = async (current, nextStatus, options = {}) => {
  const reviewedAt = new Date().toISOString();
  const updated = {
    ...current.submission,
    status: nextStatus,
    updatedAt: reviewedAt,
    review: {
      reviewer: options.reviewer || adminUsername,
      reviewedAt,
      notes: options.notes || ""
    },
    ...(options.publishedManifestFile ? { publishedManifestFile: options.publishedManifestFile } : {}),
    ...(options.publishedHash ? { publishedHash: options.publishedHash } : {})
  };

  const nextFilePath = path.join(submissionStateDirs[nextStatus], `${updated.submissionId}.json`);
  await writeFile(nextFilePath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");

  if (current.filePath !== nextFilePath) {
    await unlink(current.filePath);
  }

  return updated;
};

const persistInstallSuccessEvent = async (event) => {
  await ensureRuntimeDir();

  const installIds = await loadDedupeIds();
  if (installIds.includes(event.installId)) {
    return { deduped: true };
  }

  installIds.push(event.installId);
  await storeDedupeIds(installIds);
  await appendFile(telemetryLogFile, `${JSON.stringify(event)}\n`, "utf8");
  return { deduped: false };
};

const applySubmissionReview = async (submissionId, review) => {
  const current = await findSubmissionRecord(submissionId);
  if (!current) {
    throw new Error(`Submission not found: ${submissionId}`);
  }

  if (current.state !== "pending") {
    throw new Error(`Only pending submissions can be reviewed. Current state: ${current.state}`);
  }

  if (review.action === "approve") {
    const manifest = buildManifestFromSubmission(current.submission);
    const manifestPath = path.join(packagesDir, `${manifest.id}.json`);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const updated = await persistSubmissionRecordInState(current, "approved", {
      reviewer: review.reviewer,
      notes: review.notes,
      publishedManifestFile: path.relative(appRoot, manifestPath).replace(/\\/g, "/"),
      publishedHash: manifest.hash
    });

    return normalizeSubmissionForAdmin(updated, "approved");
  }

  const nextStatus = review.action === "needs_changes" ? "needs_changes" : "rejected";
  const updated = await persistSubmissionRecordInState(current, nextStatus, {
    reviewer: review.reviewer,
    notes: review.notes
  });

  return normalizeSubmissionForAdmin(updated, nextStatus);
};

const servePublicAsset = async (res, pathname) => {
  const trimmed = pathname.replace(/^\/+/, "");
  const resolved = path.resolve(publicDir, trimmed);

  if (!resolved.startsWith(publicDir)) {
    notFound(res);
    return;
  }

  try {
    const body = await readFile(resolved);
    const extname = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extname] || "application/octet-stream",
      "Content-Length": body.byteLength
    });
    res.end(body);
  } catch {
    notFound(res);
  }
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", publicBaseUrl);

    if (req.method === "GET" && url.pathname === "/health") {
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === `${API_BASE_PATH}/admin/status`) {
      const state = getAdminAuthState(req);
      json(res, 200, {
        ok: true,
        configured: state.configured,
        authenticated: state.authenticated,
        username: state.username
      });
      return;
    }

    if (req.method === "GET" && url.pathname === `${API_BASE_PATH}/admin/submissions`) {
      if (!requireAdminAuth(req, res)) {
        return;
      }

      const statusFilter = url.searchParams.get("status") || "pending";
      const counts = await loadSubmissionCounts();
      const submissions = [];

      for (const state of resolveSubmissionStates(statusFilter)) {
        const records = await loadSubmissionsInState(state);
        submissions.push(...records.map((record) => buildSubmissionSummary(record, state)));
      }

      submissions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      json(res, 200, {
        ok: true,
        counts,
        statusFilter,
        submissions
      });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith(`${API_BASE_PATH}/admin/submissions/`)) {
      if (!requireAdminAuth(req, res)) {
        return;
      }

      const segments = url.pathname
        .replace(`${API_BASE_PATH}/admin/submissions/`, "")
        .split("/")
        .filter(Boolean);

      if (segments.length === 1) {
        const submissionId = decodeURIComponent(segments[0]);
        const current = await findSubmissionRecord(submissionId);
        if (!current) {
          notFound(res);
          return;
        }

        json(res, 200, {
          ok: true,
          submission: normalizeSubmissionForAdmin(current.submission, current.state)
        });
        return;
      }
    }

    if (req.method === "POST" && url.pathname.startsWith(`${API_BASE_PATH}/admin/submissions/`)) {
      if (!requireAdminAuth(req, res)) {
        return;
      }

      const segments = url.pathname
        .replace(`${API_BASE_PATH}/admin/submissions/`, "")
        .split("/")
        .filter(Boolean);

      if (segments.length === 2 && segments[1] === "review") {
        const submissionId = decodeURIComponent(segments[0]);
        const review = validateAdminReviewPayload(await parseJsonBody(req, 100_000));
        const updated = await applySubmissionReview(submissionId, review);

        json(res, 200, {
          ok: true,
          submission: updated
        });
        return;
      }
    }

    if (
      req.method === "GET" &&
      (url.pathname === `${API_BASE_PATH}/packages` || url.pathname === "/api/packages")
    ) {
      const [manifests, installCounts] = await Promise.all([loadPackages(), loadInstallCounts()]);
      json(res, 200, {
        ok: true,
        packages: manifests.map((entry) => buildPackageSummary(entry, installCounts))
      });
      return;
    }

    if (
      req.method === "GET" &&
      (url.pathname.startsWith(`${API_BASE_PATH}/packages/`) ||
        url.pathname.startsWith("/api/packages/"))
    ) {
      const prefix = url.pathname.startsWith(`${API_BASE_PATH}/packages/`)
        ? `${API_BASE_PATH}/packages/`
        : "/api/packages/";
      const packageId = decodeURIComponent(url.pathname.replace(prefix, ""));
      const [manifest, installCounts] = await Promise.all([
        loadPackageById(packageId),
        loadInstallCounts()
      ]);

      if (!manifest) {
        notFound(res);
        return;
      }

      json(res, 200, {
        ok: true,
        package: {
          ...manifest,
          thumbnailUrl: getPublicAssetUrl(manifest.thumbnailUrl),
          installCount: installCounts.get(packageId) || 0
        }
      });
      return;
    }

    if (
      req.method === "POST" &&
      (url.pathname === `${API_BASE_PATH}/telemetry/install-success` ||
        url.pathname === "/api/telemetry/install-success")
    ) {
      const payload = await parseJsonBody(req);
      const event = validateInstallSuccessEvent(payload);
      const result = await persistInstallSuccessEvent(event);

      json(res, 202, {
        ok: true,
        deduped: result.deduped
      });
      return;
    }

    if (
      req.method === "POST" &&
      (url.pathname === `${API_BASE_PATH}/submissions` || url.pathname === "/api/submissions")
    ) {
      const payload = await parseJsonBody(req, 1_500_000);
      const normalized = validateSubmissionPayload(payload);
      const record = createSubmissionRecord(normalized);
      await persistSubmissionRecord(record);

      json(res, 202, {
        ok: true,
        submissionId: record.submissionId,
        status: record.status
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/") {
      await servePublicAsset(res, "/index.html");
      return;
    }

    if (req.method === "GET" && (url.pathname === "/submit" || url.pathname === "/submit/")) {
      await servePublicAsset(res, "/submit.html");
      return;
    }

    if (req.method === "GET" && (url.pathname === "/admin" || url.pathname === "/admin/")) {
      if (adminConfigured && !requireAdminAuth(req, res)) {
        return;
      }

      await servePublicAsset(res, "/admin-review.html");
      return;
    }

    if (req.method === "GET") {
      await servePublicAsset(res, url.pathname);
      return;
    }

    notFound(res);
  } catch (error) {
    json(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(port, host, () => {
  console.log(`[catalog] listening on ${publicBaseUrl}`);
});
