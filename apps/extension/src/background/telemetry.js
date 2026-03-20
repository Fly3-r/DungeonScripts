import {
  enqueueTelemetryQueueEntry,
  loadTelemetryQueue,
  saveTelemetryQueue
} from "../shared/storage.js";

const INSTALL_SUCCESS_PATH = "/api/v1/telemetry/install-success";
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];
const MAX_LAST_ERROR_LENGTH = 240;

const postInstallSuccessNow = async (catalogOrigin, event) => {
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

export const flushTelemetryQueue = async (catalogOrigin) => {
  const queue = await loadTelemetryQueue();
  if (queue.length === 0) {
    return {
      sentCount: 0,
      pendingCount: 0,
      deliveryFailed: false
    };
  }

  const nextQueue = [...queue];
  let sentCount = 0;
  let changed = false;
  let deliveryFailed = false;
  const nowMs = Date.now();

  for (let index = 0; index < nextQueue.length; ) {
    const entry = nextQueue[index];
    if (!shouldAttemptEntry(entry, nowMs)) {
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
        lastError: String(error?.message || error).slice(0, MAX_LAST_ERROR_LENGTH)
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
    deliveryFailed
  };
};

export const recordInstallSuccess = async (catalogOrigin, event) => {
  await enqueueTelemetryQueueEntry(buildQueueEntry(event));
  return flushTelemetryQueue(catalogOrigin);
};