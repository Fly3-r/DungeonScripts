import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { access, appendFile, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const packageSourcesDir = path.join(appRoot, "data", "scripts");
const packagesDir = path.join(appRoot, "data", "packages");
const publicDir = path.join(appRoot, "public");
const privacyPolicyDocPath = path.resolve(appRoot, "..", "..", "docs", "privacy-policy.md");
const runtimeDir = path.resolve(
  appRoot,
  process.env.TELEMETRY_STORAGE_DIR || "./data/runtime"
);
const telemetryLogFile = path.join(runtimeDir, "install-success.ndjson");
const dedupeFile = path.join(runtimeDir, "install-success.ids.json");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3000);
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://${host}:${port}`;
const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};
const defaultMinInstallerVersion = process.env.DEFAULT_MIN_INSTALLER_VERSION || "0.1.0";
const maxSourceScriptLength = parsePositiveInteger(process.env.MAX_SOURCE_SCRIPT_LENGTH, 5_000_000);
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
const SOURCE_FILE_NAMES = {
  metadata: "metadata.json",
  sharedLibrary: "Library.js",
  onInput: "Input.js",
  onModelContext: "Context.js",
  onOutput: "Output.js",
  thumbnail: "Thumbnail.png"
};
const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
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

const stripUtf8Bom = (value) => value.replace(/^\uFEFF/, "");

const normalizeMultilineText = (value) => stripUtf8Bom(value).replace(/\r\n/g, "\n");

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
    if (candidate.startsWith("/")) {
      return candidate;
    }

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

const requireTrimmedString = (payload, fieldName, maxLength) => {
  if (typeof payload[fieldName] !== "string") {
    throw new Error(`Field "${fieldName}" must be a string.`);
  }

  const value = payload[fieldName].trim();
  if (!value) {
    throw new Error(`Field "${fieldName}" is required.`);
  }

  if (value.length > maxLength) {
    throw new Error(`Field "${fieldName}" exceeds the maximum allowed length of ${maxLength} characters.`);
  }

  return value;
};

const getOptionalTrimmedString = (payload, fieldName, maxLength) => {
  if (payload[fieldName] == null) {
    return "";
  }

  if (typeof payload[fieldName] !== "string") {
    throw new Error(`Field "${fieldName}" must be a string.`);
  }

  const value = payload[fieldName].trim();
  if (value.length > maxLength) {
    throw new Error(`Field "${fieldName}" exceeds the maximum allowed length of ${maxLength} characters.`);
  }

  return value;
};

const requireScriptContent = (value, fieldName, maxLength) => {
  if (typeof value !== "string") {
    throw new Error(`Field "${fieldName}" must be a string.`);
  }

  const normalized = normalizeMultilineText(value);
  if (normalized.length > maxLength) {
    throw new Error(`Field "${fieldName}" exceeds the maximum allowed length of ${maxLength} characters.`);
  }

  return normalized;
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

const ensureRuntimeDir = async () => {
  await mkdir(runtimeDir, { recursive: true });
};

const ensurePackageDirs = async () => {
  await Promise.all([
    mkdir(packageSourcesDir, { recursive: true }),
    mkdir(packagesDir, { recursive: true })
  ]);
};

const fileExists = async (filePath) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const getPackageSourceDir = (packageId) => {
  if (!PACKAGE_ID_PATTERN.test(packageId)) {
    throw new Error(`Invalid package ID: ${packageId}`);
  }

  return path.join(packageSourcesDir, packageId);
};

const getPackageSourceFilePath = (packageId, fileName) =>
  path.join(getPackageSourceDir(packageId), fileName);

const readJsonFile = async (filePath) => JSON.parse(stripUtf8Bom(await readFile(filePath, "utf8")));

const readRequiredSourceText = async (packageId, fileName, maxLength) => {
  const raw = await readFile(getPackageSourceFilePath(packageId, fileName), "utf8");
  return requireScriptContent(raw, fileName, maxLength);
};

const buildPackageThumbnailUrl = (packageId) =>
  `${API_BASE_PATH}/packages/${encodeURIComponent(packageId)}/thumbnail`;

const normalizePackageManifest = (entry) => ({
  ...entry,
  author: isNonEmptyString(entry.author) ? entry.author.trim() : "Unknown",
  authorProfileUrl: getSafeUrl(entry.authorProfileUrl),
  thumbnailUrl: getPublicAssetUrl(entry.thumbnailUrl)
});

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

const validatePackageSourceMetadata = (packageId, payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`metadata.json for ${packageId} must contain an object.`);
  }

  const version = requireTrimmedString(payload, "version", 40);
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`Version for ${packageId} must look like semantic versioning, for example 1.2.3.`);
  }

  const minInstallerVersion =
    getOptionalTrimmedString(payload, "minInstallerVersion", 40) || defaultMinInstallerVersion;
  if (!SEMVER_PATTERN.test(minInstallerVersion)) {
    throw new Error(
      `minInstallerVersion for ${packageId} must look like semantic versioning, for example 0.1.0.`
    );
  }

  return {
    name: requireTrimmedString(payload, "name", 120),
    version,
    author: requireTrimmedString(payload, "author", 120),
    authorProfileUrl: validateAidProfileUrl(requireTrimmedString(payload, "authorProfileUrl", 200)),
    description: requireTrimmedString(payload, "description", 24000),
    minInstallerVersion
  };
};

const buildManifestHash = (manifest) => {
  const hash = createHash("sha256").update(JSON.stringify(manifest), "utf8").digest("hex");
  return `sha256:${hash}`;
};

const buildManifestFromSource = async (packageId) => {
  const metadata = validatePackageSourceMetadata(
    packageId,
    await readJsonFile(getPackageSourceFilePath(packageId, SOURCE_FILE_NAMES.metadata))
  );
  const sharedLibrary = await readRequiredSourceText(
    packageId,
    SOURCE_FILE_NAMES.sharedLibrary,
    maxSourceScriptLength
  );
  const onInput = await readRequiredSourceText(packageId, SOURCE_FILE_NAMES.onInput, maxSourceScriptLength);
  const onModelContext = await readRequiredSourceText(
    packageId,
    SOURCE_FILE_NAMES.onModelContext,
    maxSourceScriptLength
  );
  const onOutput = await readRequiredSourceText(packageId, SOURCE_FILE_NAMES.onOutput, maxSourceScriptLength);
  const hasThumbnail = await fileExists(
    getPackageSourceFilePath(packageId, SOURCE_FILE_NAMES.thumbnail)
  );

  const manifest = {
    id: packageId,
    name: metadata.name,
    version: metadata.version,
    description: metadata.description,
    author: metadata.author,
    authorProfileUrl: metadata.authorProfileUrl,
    ...(hasThumbnail ? { thumbnailUrl: buildPackageThumbnailUrl(packageId) } : {}),
    minInstallerVersion: metadata.minInstallerVersion,
    sharedLibrary,
    onInput,
    onModelContext,
    onOutput
  };

  return {
    ...manifest,
    hash: buildManifestHash(manifest)
  };
};

const buildPackageManifests = async () => {
  await ensurePackageDirs();

  const existingEntries = await readdir(packagesDir, { withFileTypes: true });
  for (const entry of existingEntries) {
    if (entry.isFile() && entry.name.endsWith(".json")) {
      await unlink(path.join(packagesDir, entry.name));
    }
  }

  const sourceEntries = await readdir(packageSourcesDir, { withFileTypes: true });
  const packageIds = sourceEntries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const manifests = [];
  for (const packageId of packageIds) {
    if (!PACKAGE_ID_PATTERN.test(packageId)) {
      throw new Error(
        `Invalid package source directory "${packageId}". Package IDs must use lowercase letters, numbers, and hyphens only.`
      );
    }

    const manifest = await buildManifestFromSource(packageId);
    const manifestPath = path.join(packagesDir, `${manifest.id}.json`);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    manifests.push(manifest);
  }

  return manifests;
};

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

  manifests.sort((left, right) => left.name.localeCompare(right.name));
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
      throw new Error(`Telemetry field "${field}" must be a non-empty string.`);
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

const serveAbsoluteFile = async (res, filePath) => {
  try {
    const body = await readFile(filePath);
    const extname = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extname] || "application/octet-stream",
      "Content-Length": body.byteLength
    });
    res.end(body);
  } catch {
    notFound(res);
  }
};

const servePackageThumbnail = async (res, packageId) => {
  if (!PACKAGE_ID_PATTERN.test(packageId)) {
    notFound(res);
    return;
  }

  try {
    const body = await readFile(getPackageSourceFilePath(packageId, SOURCE_FILE_NAMES.thumbnail));
    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[".png"],
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
      const segments = url.pathname
        .replace(prefix, "")
        .split("/")
        .filter(Boolean)
        .map((segment) => decodeURIComponent(segment));

      if (segments.length === 2 && segments[1] === "thumbnail") {
        await servePackageThumbnail(res, segments[0]);
        return;
      }

      if (segments.length === 1) {
        const packageId = segments[0];
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

    if (req.method === "GET" && url.pathname === "/docs/privacy-policy.md") {
      await serveAbsoluteFile(res, privacyPolicyDocPath);
      return;
    }

    if (req.method === "GET" && url.pathname === "/") {
      await servePublicAsset(res, "/index.html");
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

const start = async () => {
  const manifests = await buildPackageManifests();
  server.listen(port, host, () => {
    console.log(`[catalog] built ${manifests.length} package manifests from ${packageSourcesDir}`);
    console.log(`[catalog] listening on ${publicBaseUrl}`);
  });
};

start().catch((error) => {
  console.error("[catalog] failed to start", error);
  process.exit(1);
});




