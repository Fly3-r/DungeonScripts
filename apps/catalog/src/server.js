import { createServer } from "node:http";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const packagesDir = path.join(appRoot, "data", "packages");
const publicDir = path.join(appRoot, "public");
const runtimeDir = path.resolve(
  appRoot,
  process.env.TELEMETRY_STORAGE_DIR || "./data/runtime"
);
const telemetryLogFile = path.join(runtimeDir, "install-success.ndjson");
const dedupeFile = path.join(runtimeDir, "install-success.ids.json");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3000);
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://${host}:${port}`;
const allowedEventKeys = [
  "event",
  "installId",
  "packageId",
  "packageVersion",
  "leafCount",
  "timestamp"
];
const API_BASE_PATH = "/api/v1";
const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

const json = (res, statusCode, payload) => {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body, "utf8")
  });
  res.end(body);
};

const text = (res, statusCode, payload, contentType = "text/plain; charset=utf-8") => {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(payload, "utf8")
  });
  res.end(payload);
};

const notFound = (res) => {
  json(res, 404, { ok: false, error: "Not found" });
};

const parseJsonBody = async (req) => {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > 10_000) {
      throw new Error("Payload too large.");
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
};

const ensureRuntimeDir = async () => {
  await mkdir(runtimeDir, { recursive: true });
};

const loadPackages = async () => {
  const entries = await readdir(packagesDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(packagesDir, entry.name));

  const manifests = [];
  for (const file of files) {
    const raw = await readFile(file, "utf8");
    manifests.push(JSON.parse(raw));
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

const getPublicAssetUrl = (value) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "";
  }

  try {
    return new URL(value).toString();
  } catch {
    return new URL(value, publicBaseUrl).toString();
  }
};

const buildPackageSummary = (entry, installCounts) => ({
  id: entry.id,
  name: entry.name,
  version: entry.version,
  description: entry.description,
  author: entry.author,
  thumbnailUrl: getPublicAssetUrl(entry.thumbnailUrl),
  installCount: installCounts.get(entry.id) || 0
});

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
    const body = await readFile(resolved, "utf8");
    const extname = path.extname(resolved).toLowerCase();
    text(res, 200, body, CONTENT_TYPES[extname] || "application/octet-stream");
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

    if (req.method === "GET" && (url.pathname === `${API_BASE_PATH}/packages` || url.pathname === "/api/packages")) {
      const [manifests, installCounts] = await Promise.all([loadPackages(), loadInstallCounts()]);
      json(res, 200, {
        ok: true,
        packages: manifests.map((entry) => buildPackageSummary(entry, installCounts))
      });
      return;
    }

    if (
      req.method === "GET" &&
      (url.pathname.startsWith(`${API_BASE_PATH}/packages/`) || url.pathname.startsWith("/api/packages/"))
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

server.listen(port, host, () => {
  console.log(`[catalog] listening on ${publicBaseUrl}`);
});
