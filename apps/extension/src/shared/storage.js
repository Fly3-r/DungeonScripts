import { DEFAULT_CATALOG_ORIGIN, SUPPORTED_CATALOG_ORIGINS } from "./constants.js";
import { extensionApi } from "./webextension-api.js";

const STORAGE_KEYS = {
  editorContext: "editorContext",
  settings: "settings",
  restorePoints: "restorePoints",
  telemetryQueue: "telemetryQueue",
  telemetryTestMode: "telemetryTestMode"
};

const SESSION_KEYS = {
  authState: "authState",
  scenarioState: "scenarioState",
  installState: "installState",
  scenarioTargetSnapshots: "scenarioTargetSnapshots"
};

const MAX_RESTORE_POINTS = 10;
const MAX_TELEMETRY_QUEUE = 100;
const DEFAULT_TELEMETRY_TEST_MODE = "normal";
const VALID_TELEMETRY_TEST_MODES = new Set(["normal", "fail_next", "fail_always"]);

const trimTelemetryQueue = (queue) => {
  if (!Array.isArray(queue)) {
    return [];
  }

  return queue.slice(-MAX_TELEMETRY_QUEUE);
};

const normalizeTelemetryTestMode = (value) =>
  VALID_TELEMETRY_TEST_MODES.has(value) ? value : DEFAULT_TELEMETRY_TEST_MODE;

const normalizeCatalogOrigin = (value) =>
  SUPPORTED_CATALOG_ORIGINS.includes(value) ? value : DEFAULT_CATALOG_ORIGIN;

export const loadEditorContext = async () => {
  const result = await extensionApi.storage.local.get(STORAGE_KEYS.editorContext);
  return result[STORAGE_KEYS.editorContext] || null;
};

export const saveEditorContext = async (editorContext) => {
  await extensionApi.storage.local.set({
    [STORAGE_KEYS.editorContext]: editorContext
  });
};

export const loadSettings = async () => {
  const result = await extensionApi.storage.local.get(STORAGE_KEYS.settings);
  const stored = result[STORAGE_KEYS.settings] || {};
  return {
    ...stored,
    catalogOrigin: normalizeCatalogOrigin(stored.catalogOrigin)
  };
};

export const saveSettings = async (settings) => {
  const current = await loadSettings();
  const next = {
    ...current,
    ...settings
  };

  await extensionApi.storage.local.set({
    [STORAGE_KEYS.settings]: {
      ...next,
      catalogOrigin: normalizeCatalogOrigin(next.catalogOrigin)
    }
  });
};

export const loadAuthState = async () => {
  if (!extensionApi.storage.session) {
    throw new Error("Extension session storage is not available.");
  }

  const result = await extensionApi.storage.session.get(SESSION_KEYS.authState);
  return (
    result[SESSION_KEYS.authState] || {
      token: null,
      hasToken: false,
      origin: null,
      updatedAt: null,
      error: null
    }
  );
};

export const saveAuthToken = async ({ token, origin }) => {
  if (!extensionApi.storage.session) {
    throw new Error("Extension session storage is not available.");
  }

  await extensionApi.storage.session.set({
    [SESSION_KEYS.authState]: {
      token,
      hasToken: true,
      origin,
      updatedAt: new Date().toISOString(),
      error: null
    }
  });
};

export const saveAuthError = async ({ origin, error }) => {
  if (!extensionApi.storage.session) {
    throw new Error("Extension session storage is not available.");
  }

  await extensionApi.storage.session.set({
    [SESSION_KEYS.authState]: {
      token: null,
      hasToken: false,
      origin,
      updatedAt: new Date().toISOString(),
      error
    }
  });
};

export const loadScenarioState = async () => {
  if (!extensionApi.storage.session) {
    throw new Error("Extension session storage is not available.");
  }

  const result = await extensionApi.storage.session.get(SESSION_KEYS.scenarioState);
  return (
    result[SESSION_KEYS.scenarioState] || {
      rootShortId: null,
      rootTitle: null,
      origin: null,
      branchCount: 0,
      leafCount: 0,
      leaves: [],
      updatedAt: null,
      status: "idle",
      error: null
    }
  );
};

export const saveScenarioState = async (scenarioState) => {
  if (!extensionApi.storage.session) {
    throw new Error("Extension session storage is not available.");
  }

  await extensionApi.storage.session.set({
    [SESSION_KEYS.scenarioState]: scenarioState
  });
};

export const loadInstallState = async () => {
  if (!extensionApi.storage.session) {
    throw new Error("Extension session storage is not available.");
  }

  const result = await extensionApi.storage.session.get(SESSION_KEYS.installState);
  return (
    result[SESSION_KEYS.installState] || {
      status: "idle",
      packageId: null,
      packageName: null,
      packageVersion: null,
      restorePointId: null,
      appliedCount: 0,
      updatedAt: null,
      error: null
    }
  );
};

export const saveInstallState = async (installState) => {
  if (!extensionApi.storage.session) {
    throw new Error("Extension session storage is not available.");
  }

  await extensionApi.storage.session.set({
    [SESSION_KEYS.installState]: installState
  });
};

export const loadScenarioTargetSnapshots = async () => {
  if (!extensionApi.storage.session) {
    throw new Error("Extension session storage is not available.");
  }

  const result = await extensionApi.storage.session.get(SESSION_KEYS.scenarioTargetSnapshots);
  return result[SESSION_KEYS.scenarioTargetSnapshots] || {};
};

export const saveScenarioTargetSnapshots = async (scenarioTargetSnapshots) => {
  if (!extensionApi.storage.session) {
    throw new Error("Extension session storage is not available.");
  }

  await extensionApi.storage.session.set({
    [SESSION_KEYS.scenarioTargetSnapshots]: scenarioTargetSnapshots || {}
  });
};

export const upsertScenarioTargetSnapshots = async (snapshots) => {
  const currentSnapshots = await loadScenarioTargetSnapshots();
  const nextSnapshots = { ...currentSnapshots };

  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    if (!snapshot?.shortId) {
      continue;
    }

    nextSnapshots[snapshot.shortId] = {
      ...nextSnapshots[snapshot.shortId],
      ...snapshot
    };
  }

  await saveScenarioTargetSnapshots(nextSnapshots);
  return nextSnapshots;
};

export const loadRestorePoints = async () => {
  const result = await extensionApi.storage.local.get(STORAGE_KEYS.restorePoints);
  return result[STORAGE_KEYS.restorePoints] || [];
};

export const saveRestorePoints = async (restorePoints) => {
  await extensionApi.storage.local.set({
    [STORAGE_KEYS.restorePoints]: restorePoints
  });
};

export const addRestorePoint = async (restorePoint) => {
  const existing = await loadRestorePoints();
  const next = [restorePoint, ...existing.filter((entry) => entry.id !== restorePoint.id)].slice(
    0,
    MAX_RESTORE_POINTS
  );
  await saveRestorePoints(next);
  return next;
};

export const getLatestRestorePoint = async () => {
  const restorePoints = await loadRestorePoints();
  return restorePoints[0] || null;
};

export const removeRestorePoint = async (restorePointId) => {
  if (!restorePointId) {
    return loadRestorePoints();
  }

  const existing = await loadRestorePoints();
  const next = existing.filter((entry) => entry?.id !== restorePointId);
  await saveRestorePoints(next);
  return next;
};

export const loadTelemetryQueue = async () => {
  const result = await extensionApi.storage.local.get(STORAGE_KEYS.telemetryQueue);
  return trimTelemetryQueue(result[STORAGE_KEYS.telemetryQueue] || []);
};

export const saveTelemetryQueue = async (queue) => {
  await extensionApi.storage.local.set({
    [STORAGE_KEYS.telemetryQueue]: trimTelemetryQueue(queue)
  });
};

export const enqueueTelemetryQueueEntry = async (entry) => {
  const existing = await loadTelemetryQueue();
  const next = trimTelemetryQueue([
    ...existing.filter((candidate) => candidate?.id !== entry?.id),
    entry
  ]);
  await saveTelemetryQueue(next);
  return next;
};

export const loadTelemetryTestMode = async () => {
  const result = await extensionApi.storage.local.get(STORAGE_KEYS.telemetryTestMode);
  return normalizeTelemetryTestMode(result[STORAGE_KEYS.telemetryTestMode]);
};

export const saveTelemetryTestMode = async (mode) => {
  const normalizedMode = normalizeTelemetryTestMode(mode);
  await extensionApi.storage.local.set({
    [STORAGE_KEYS.telemetryTestMode]: normalizedMode
  });
  return normalizedMode;
};
