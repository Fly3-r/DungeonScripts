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

const serveStatic = async (res, filePath, contentType) => {
  try {
    const body = await readFile(filePath, "utf8");
    text(res, 200, body, contentType);
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

    if (req.method === "GET" && url.pathname === "/api/packages") {
      const manifests = await loadPackages();
      json(res, 200, {
        ok: true,
        packages: manifests.map((entry) => ({
          id: entry.id,
          name: entry.name,
          version: entry.version,
          description: entry.description,
          author: entry.author
        }))
      });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/packages/")) {
      const packageId = decodeURIComponent(url.pathname.replace("/api/packages/", ""));
      const manifest = await loadPackageById(packageId);

      if (!manifest) {
        notFound(res);
        return;
      }

      json(res, 200, { ok: true, package: manifest });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/telemetry/install-success") {
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
      await serveStatic(res, path.join(publicDir, "index.html"), "text/html; charset=utf-8");
      return;
    }

    if (req.method === "GET" && url.pathname === "/styles.css") {
      await serveStatic(res, path.join(publicDir, "styles.css"), "text/css; charset=utf-8");
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
