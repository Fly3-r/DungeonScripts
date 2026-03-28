import {
  extensionApi
} from "../shared/webextension-api.js";
import {
  enqueueTelemetryQueueEntry,
  loadTelemetryQueue,
  loadTelemetryTestMode,
  saveTelemetryQueue,
  saveTelemetryTestMode
} from "../shared/storage.js";

const INSTALL_SUCCESS_PATH = "/api/v1/telemetry/install-success";
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];
const MAX_LAST_ERROR_LENGTH = 240;
const TELEMETRY_TEST_MODE = {
  normal: "normal",
  failNext: "fail_next",
  failAlways: "fail_always"
};

const isFirefoxBuild = () =>
  !!extensionApi.runtime.getManifest()?.browser_specific_settings?.gecko;

const isTelemetryEnabled = () => !isFirefoxBuild();

const normalizeErrorMessage = (error) =>
  String(error?.message || error || "Unknown telemetry delivery error.").slice(0, MAX_LAST_ERROR_LENGTH);

const maybeInjectTelemetryFailure = async () => {
  const testMode = await loadTelemetryTestMode();

  if (testMode === TELEMETRY_TEST_MODE.failNext) {
    await saveTelemetryTestMode(TELEMETRY_TEST_MODE.normal);
    throw new Error("Telemetry test mode forced the next delivery attempt to fail.");
  }

  if (testMode === TELEMETRY_TEST_MODE.failAlways) {
    throw new Error("Telemetry test mode forced telemetry delivery to fail.");
  }
};

const postInstallSuccessNow = async (catalogOrigin, event) => {
  if (!catalogOrigin) {
    throw new Error("Catalog origin is not configured.");
  }

  await maybeInjectTelemetryFailure();

  const response = await fetch(new URL(INSTALL_SUCCESS_PATH, catalogOrigin), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(event)
  });

  if (!response.ok) {
    throw new Error(`Telemetry HTTP ${response.status}: ${response.statusText}`);
  }

  const payload = await response.json();
  if (!payload?.ok) {
    throw new Error(payload?.error || "Telemetry response was invalid.");
  }

  return payload;
};

const buildQueueEntry = (event) => {
  const queuedAt = new Date().toISOString();
  return {
    id: event?.installId || crypto.randomUUID(),
    event,
    queuedAt,
    attemptCount: 0,
    lastAttemptAt: null,
    nextAttemptAt: queuedAt,
    lastError: null
  };
};

const buildPublicQueueEntry = (entry) => ({
  id: entry?.id || null,
  packageId: entry?.event?.packageId || null,
  packageVersion: entry?.event?.packageVersion || null,
  queuedAt: entry?.queuedAt || null,
  attemptCount: Number.isInteger(entry?.attemptCount) ? entry.attemptCount : 0,
  lastAttemptAt: entry?.lastAttemptAt || null,
  nextAttemptAt: entry?.nextAttemptAt || null,
  lastError: entry?.lastError || null
});

const getRetryDelayMs = (attemptCount) => {
  const safeAttemptCount = Number.isInteger(attemptCount) && attemptCount > 0 ? attemptCount : 1;
  return RETRY_DELAYS_MS[Math.min(safeAttemptCount - 1, RETRY_DELAYS_MS.length - 1)];
};

const shouldAttemptEntry = (entry, nowMs) => {
  const nextAttemptAtMs = Date.parse(entry?.nextAttemptAt || entry?.queuedAt || "");
  if (!Number.isFinite(nextAttemptAtMs)) {
    return true;
  }

  return nextAttemptAtMs <= nowMs;
};

export const getTelemetryStatus = async () => {
  const [queue, testMode] = await Promise.all([loadTelemetryQueue(), loadTelemetryTestMode()]);

  return {
    enabled: isTelemetryEnabled(),
    testMode,
    pendingCount: queue.length,
    entries: queue.map(buildPublicQueueEntry)
  };
};

export const flushTelemetryQueue = async (catalogOrigin, { force = false } = {}) => {
  if (!isTelemetryEnabled()) {
    return {
      sentCount: 0,
      pendingCount: 0,
      deliveryFailed: false,
      testMode: await loadTelemetryTestMode()
    };
  }

  const queue = await loadTelemetryQueue();
  if (queue.length === 0) {
    return {
      sentCount: 0,
      pendingCount: 0,
      deliveryFailed: false,
      testMode: await loadTelemetryTestMode()
    };
  }

  const nextQueue = [...queue];
  let sentCount = 0;
  let changed = false;
  let deliveryFailed = false;
  const nowMs = Date.now();

  for (let index = 0; index < nextQueue.length; ) {
    const entry = nextQueue[index];
    if (!force && !shouldAttemptEntry(entry, nowMs)) {
      index += 1;
      continue;
    }

    try {
      await postInstallSuccessNow(catalogOrigin, entry.event);
      nextQueue.splice(index, 1);
      sentCount += 1;
      changed = true;
      continue;
    } catch (error) {
      const attemptCount = (Number.isInteger(entry?.attemptCount) ? entry.attemptCount : 0) + 1;
      const attemptedAt = new Date().toISOString();
      nextQueue[index] = {
        ...entry,
        attemptCount,
        lastAttemptAt: attemptedAt,
        nextAttemptAt: new Date(Date.now() + getRetryDelayMs(attemptCount)).toISOString(),
        lastError: normalizeErrorMessage(error)
      };
      changed = true;
      deliveryFailed = true;
      break;
    }
  }

  if (changed) {
    await saveTelemetryQueue(nextQueue);
  }

  return {
    sentCount,
    pendingCount: nextQueue.length,
    deliveryFailed,
    testMode: await loadTelemetryTestMode()
  };
};

export const recordInstallSuccess = async (catalogOrigin, event) => {
  if (!isTelemetryEnabled()) {
    return {
      sentCount: 0,
      pendingCount: 0,
      deliveryFailed: false,
      testMode: await loadTelemetryTestMode()
    };
  }

  await enqueueTelemetryQueueEntry(buildQueueEntry(event));
  return flushTelemetryQueue(catalogOrigin);
};
