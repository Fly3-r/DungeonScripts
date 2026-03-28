import {
  DEFAULT_CATALOG_ORIGIN,
  MESSAGE_TYPES,
  SUPPORTED_CATALOG_ORIGINS
} from "../shared/constants.js";
import { extensionApi } from "../shared/webextension-api.js";
import {
  addRestorePoint,
  getLatestRestorePoint,
  loadAuthState,
  loadEditorContext,
  loadInstallState,
  loadScenarioState,
  loadSettings,
  saveAuthError,
  saveAuthToken,
  saveEditorContext,
  saveInstallState,
  saveScenarioState,
  saveSettings,
  saveTelemetryTestMode
} from "../shared/storage.js";
import { discoverScenarioLeaves } from "./aid/discover-leaves.js";
import { fetchCatalogPackage, fetchCatalogPackages } from "./catalog.js";
import {
  createInstallPreview,
  createRestorePoint,
  installPackageToTargets,
  resolveInstallTargets,
  restoreFromPoint
} from "./install.js";
import { flushTelemetryQueue, getTelemetryStatus, recordInstallSuccess } from "./telemetry.js";

const BUSY_INSTALL_STATES = new Set(["loading", "rolling_back"]);
const CATALOG_SITE_BRIDGE_ID = "catalog-site-bridge";
const BUILTIN_CATALOG_ORIGINS = new Set(SUPPORTED_CATALOG_ORIGINS);

const parseCatalogOrigin = (value) => {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Catalog origin must use http or https.");
  }

  const origin = parsed.origin;
  if (!BUILTIN_CATALOG_ORIGINS.has(origin)) {
    throw new Error(
      `Only these catalog origins are supported: ${SUPPORTED_CATALOG_ORIGINS.join(", ")}.`
    );
  }

  return origin;
};

const compareVersions = (left, right) => {
  const leftParts = String(left)
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = String(right)
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const size = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < size; index += 1) {
    const leftPart = leftParts[index] || 0;
    const rightPart = rightParts[index] || 0;

    if (leftPart > rightPart) {
      return 1;
    }

    if (leftPart < rightPart) {
      return -1;
    }
  }

  return 0;
};

const assertInstallerVersion = (pkg) => {
  const currentVersion = extensionApi.runtime.getManifest().version;
  if (compareVersions(currentVersion, pkg.minInstallerVersion) < 0) {
    throw new Error(
      `Package requires installer version ${pkg.minInstallerVersion} or newer.`
    );
  }
};

const buildInstallState = (overrides = {}) => ({
  status: "idle",
  packageId: null,
  packageName: null,
  packageVersion: null,
  restorePointId: null,
  appliedCount: 0,
  updatedAt: new Date().toISOString(),
  error: null,
  ...overrides,
  updatedAt: overrides.updatedAt || new Date().toISOString()
});

const toPublicRestorePoint = (restorePoint) => {
  if (!restorePoint) {
    return null;
  }

  return {
    id: restorePoint.id,
    createdAt: restorePoint.createdAt,
    origin: restorePoint.origin,
    rootShortId: restorePoint.rootShortId,
    rootTitle: restorePoint.rootTitle,
    packageId: restorePoint.packageId,
    packageName: restorePoint.packageName,
    packageVersion: restorePoint.packageVersion,
    leafCount: restorePoint.leafCount,
    targetCount: restorePoint.targetCount ?? restorePoint.leafCount
  };
};

const requireInstallContext = ({ authState, scenarioState, targetShortIds = null }) => {
  if (!authState?.hasToken || !authState?.token) {
    throw new Error("AI Dungeon auth token is not available. Re-open the edit page first.");
  }

  if (scenarioState?.status !== "ready") {
    throw new Error("Scenario targets are not ready yet. Wait for the tree to finish loading.");
  }

  if (Array.isArray(targetShortIds) && targetShortIds.length === 0) {
    throw new Error("Select at least one scenario target before installing.");
  }

  const installTargets = resolveInstallTargets(scenarioState, targetShortIds);
  if (installTargets.length === 0) {
    throw new Error("No scenario targets were found for this scenario.");
  }

  if (!scenarioState?.origin) {
    throw new Error("AI Dungeon origin is unavailable for this scenario.");
  }

  return installTargets;
};

const buildOriginPattern = (catalogOrigin) => `${catalogOrigin}/*`;

const ensureCatalogOriginPermission = async (catalogOrigin) =>
  BUILTIN_CATALOG_ORIGINS.has(catalogOrigin);

const injectBridgeIntoOpenTabs = async (catalogOrigin) => {
  const tabs = await extensionApi.tabs.query({ url: [buildOriginPattern(catalogOrigin)] });

  for (const tab of tabs) {
    if (!tab.id) {
      continue;
    }

    try {
      await extensionApi.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/catalog/index.js"]
      });
    } catch (error) {
      console.warn("[catalog-bridge] failed to inject into open tab", error);
    }
  }
};

const syncCatalogSiteBridge = async (catalogOrigin) => {
  const hasPermission = await ensureCatalogOriginPermission(catalogOrigin);
  if (!hasPermission) {
    return false;
  }

  try {
    await extensionApi.scripting.unregisterContentScripts({ ids: [CATALOG_SITE_BRIDGE_ID] });
  } catch {
    // Ignore missing registrations.
  }

  await extensionApi.scripting.registerContentScripts([
    {
      id: CATALOG_SITE_BRIDGE_ID,
      matches: [buildOriginPattern(catalogOrigin)],
      js: ["src/catalog/index.js"],
      persistAcrossSessions: true,
      runAt: "document_idle"
    }
  ]);

  await injectBridgeIntoOpenTabs(catalogOrigin);
  return true;
};

const refreshScenarioState = async () => {
  const [editorContext, authState, previousScenarioState] = await Promise.all([
    loadEditorContext(),
    loadAuthState(),
    loadScenarioState()
  ]);

  if (!editorContext?.isEditor || !editorContext?.rootShortId) {
    await saveScenarioState({
      rootShortId: null,
      rootTitle: null,
      origin: editorContext?.origin || null,
      branchCount: 0,
      leafCount: 0,
      targetCount: 0,
      leaves: [],
      updatedAt: new Date().toISOString(),
      status: "idle",
      error: "Open an AI Dungeon scenario edit page."
    });
    return;
  }

  if (!authState?.hasToken || !authState?.token) {
    await saveScenarioState({
      rootShortId: editorContext.rootShortId,
      rootTitle: null,
      origin: editorContext.origin,
      branchCount: 0,
      leafCount: 0,
      targetCount: 0,
      leaves: [],
      updatedAt: new Date().toISOString(),
      status: "idle",
      error: authState?.error || "AI Dungeon auth token is not available."
    });
    return;
  }

  await saveScenarioState({
    ...previousScenarioState,
    rootShortId: editorContext.rootShortId,
    origin: editorContext.origin,
    status: "loading",
    error: null,
    updatedAt: new Date().toISOString()
  });

  try {
    const result = await discoverScenarioLeaves({
      token: authState.token,
      origin: editorContext.origin,
      rootShortId: editorContext.rootShortId
    });

    await saveScenarioState({
      ...result,
      origin: editorContext.origin,
      updatedAt: new Date().toISOString(),
      status: "ready",
      error: null
    });
  } catch (error) {
    await saveScenarioState({
      rootShortId: editorContext.rootShortId,
      rootTitle: null,
      origin: editorContext.origin,
      branchCount: 0,
      leafCount: 0,
      targetCount: 0,
      leaves: [],
      updatedAt: new Date().toISOString(),
      status: "error",
      error: error.message
    });
  }
};

const getStatusPayload = async () => {
  const [editorContext, settings, authState, scenarioState, installState, latestRestorePoint] =
    await Promise.all([
      loadEditorContext(),
      loadSettings(),
      loadAuthState(),
      loadScenarioState(),
      loadInstallState(),
      getLatestRestorePoint()
    ]);

  const { token: _token, ...publicAuthState } = authState;

  return {
    editorContext,
    settings,
    authState: publicAuthState,
    scenarioState,
    installState,
    latestRestorePoint: toPublicRestorePoint(latestRestorePoint)
  };
};

const getCatalogPackagesPayload = async () => {
  const settings = await loadSettings();
  const packages = await fetchCatalogPackages(settings.catalogOrigin);
  return { packages };
};

const getTelemetryStatusPayload = async () => {
  const telemetry = await getTelemetryStatus();
  return { telemetry };
};

const setTelemetryTestMode = async (mode) => {
  await saveTelemetryTestMode(mode);
  return getTelemetryStatusPayload();
};

const flushTelemetryForCatalogOrigin = async (catalogOrigin, options = {}) => {
  try {
    return await flushTelemetryQueue(catalogOrigin, options);
  } catch (error) {
    console.warn("[telemetry] queue flush failed", error);
    return {
      sentCount: 0,
      pendingCount: 0,
      deliveryFailed: true
    };
  }
};

const flushTelemetryForCurrentSettings = async (options = {}) => {
  const settings = await loadSettings();
  return flushTelemetryForCatalogOrigin(settings.catalogOrigin || DEFAULT_CATALOG_ORIGIN, options);
};


const previewSelectedPackage = async (packageId, targetShortIds = null) => {
  if (typeof packageId !== "string" || packageId.trim().length === 0) {
    throw new Error("Select a package before previewing.");
  }

  const [settings, authState, scenarioState, installState] = await Promise.all([
    loadSettings(),
    loadAuthState(),
    loadScenarioState(),
    loadInstallState()
  ]);

  if (BUSY_INSTALL_STATES.has(installState?.status)) {
    throw new Error("Another install action is already running.");
  }

  const installTargets = requireInstallContext({ authState, scenarioState, targetShortIds });
  const pkg = await fetchCatalogPackage(settings.catalogOrigin, packageId.trim());
  const preview = await createInstallPreview({
    token: authState.token,
    origin: scenarioState.origin,
    scenarioState,
    pkg,
    targets: installTargets
  });

  return { preview };
};

const installSelectedPackage = async (packageId, targetShortIds = null) => {
  if (typeof packageId !== "string" || packageId.trim().length === 0) {
    throw new Error("Select a package before installing.");
  }

  const [settings, authState, scenarioState, installState] = await Promise.all([
    loadSettings(),
    loadAuthState(),
    loadScenarioState(),
    loadInstallState()
  ]);

  if (BUSY_INSTALL_STATES.has(installState?.status)) {
    throw new Error("Another install action is already running.");
  }

  const installTargets = requireInstallContext({ authState, scenarioState, targetShortIds });

  let pkg = null;
  let restorePoint = null;

  try {
    pkg = await fetchCatalogPackage(settings.catalogOrigin, packageId.trim());
    assertInstallerVersion(pkg);

    await saveInstallState(
      buildInstallState({
        status: "loading",
        packageId: pkg.id,
        packageName: pkg.name,
        packageVersion: pkg.version,
        appliedCount: 0,
        restorePointId: null,
        error: null
      })
    );

    restorePoint = await createRestorePoint({
      token: authState.token,
      origin: scenarioState.origin,
      scenarioState,
      pkg,
      targets: installTargets
    });
    await addRestorePoint(restorePoint);

    const result = await installPackageToTargets({
      token: authState.token,
      origin: scenarioState.origin,
      targets: installTargets,
      pkg
    });

    const nextInstallState = buildInstallState({
      status: "ready",
      packageId: pkg.id,
      packageName: pkg.name,
      packageVersion: pkg.version,
      restorePointId: restorePoint.id,
      appliedCount: result.appliedCount,
      error: null
    });

    await saveInstallState(nextInstallState);

    try {
      const telemetryResult = await recordInstallSuccess(settings.catalogOrigin, {
        event: "script_install_succeeded",
        installId: restorePoint.id,
        packageId: pkg.id,
        packageVersion: pkg.version,
        leafCount: restorePoint.leafCount,
        timestamp: new Date().toISOString()
      });

      if (telemetryResult.deliveryFailed) {
        console.warn(
          `[telemetry] install-success queued for retry (${telemetryResult.pendingCount} pending).`
        );
      }
    } catch (error) {
      console.warn("[telemetry] install-success queueing failed", error);
    }

    return {
      installState: nextInstallState,
      latestRestorePoint: toPublicRestorePoint(restorePoint)
    };
  } catch (error) {
    let message = error instanceof Error ? error.message : String(error);

    if (restorePoint) {
      try {
        const rollbackResult = await restoreFromPoint({
          token: authState.token,
          restorePoint
        });
        message = `${message} Previous state restored on ${rollbackResult.restoredCount} scenario targets.`;
      } catch (rollbackError) {
        const rollbackMessage =
          rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        message = `${message} Automatic rollback failed: ${rollbackMessage}`;
      }
    }

    const failedInstallState = buildInstallState({
      status: "error",
      packageId: pkg?.id || packageId.trim(),
      packageName: pkg?.name || null,
      packageVersion: pkg?.version || null,
      restorePointId: restorePoint?.id || null,
      appliedCount: 0,
      error: message
    });

    await saveInstallState(failedInstallState);
    throw new Error(message);
  }
};

const rollbackLatestInstall = async () => {
  const [authState, installState, latestRestorePoint] = await Promise.all([
    loadAuthState(),
    loadInstallState(),
    getLatestRestorePoint()
  ]);

  if (BUSY_INSTALL_STATES.has(installState?.status)) {
    throw new Error("Another install action is already running.");
  }

  if (!authState?.hasToken || !authState?.token) {
    throw new Error("AI Dungeon auth token is not available. Re-open the edit page first.");
  }

  if (!latestRestorePoint) {
    throw new Error("No restore point is available yet.");
  }

  await saveInstallState(
    buildInstallState({
      status: "rolling_back",
      packageId: latestRestorePoint.packageId,
      packageName: latestRestorePoint.packageName,
      packageVersion: latestRestorePoint.packageVersion,
      restorePointId: latestRestorePoint.id,
      appliedCount: 0,
      error: null
    })
  );

  try {
    const result = await restoreFromPoint({
      token: authState.token,
      restorePoint: latestRestorePoint
    });

    const nextInstallState = buildInstallState({
      status: "rolled_back",
      packageId: latestRestorePoint.packageId,
      packageName: latestRestorePoint.packageName,
      packageVersion: latestRestorePoint.packageVersion,
      restorePointId: latestRestorePoint.id,
      appliedCount: result.restoredCount,
      error: null
    });

    await saveInstallState(nextInstallState);

    return {
      installState: nextInstallState,
      latestRestorePoint: toPublicRestorePoint(latestRestorePoint)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedInstallState = buildInstallState({
      status: "error",
      packageId: latestRestorePoint.packageId,
      packageName: latestRestorePoint.packageName,
      packageVersion: latestRestorePoint.packageVersion,
      restorePointId: latestRestorePoint.id,
      appliedCount: 0,
      error: `Rollback failed: ${message}`
    });

    await saveInstallState(failedInstallState);
    throw new Error(failedInstallState.error);
  }
};

const initCatalogBridge = async (catalogOrigin) => {
  try {
    return await syncCatalogSiteBridge(catalogOrigin);
  } catch (error) {
    console.warn("[catalog-bridge] failed to sync content script", error);
    return false;
  }
};

const bootstrapCatalogBridge = async () => {
  const settings = await loadSettings();
  const catalogOrigin = settings.catalogOrigin || DEFAULT_CATALOG_ORIGIN;
  await initCatalogBridge(catalogOrigin);
  await flushTelemetryForCatalogOrigin(catalogOrigin);
};

extensionApi.runtime.onInstalled.addListener(async () => {
  const settings = await loadSettings();
  const catalogOrigin = settings.catalogOrigin || DEFAULT_CATALOG_ORIGIN;
  await saveSettings({ catalogOrigin });
  await initCatalogBridge(catalogOrigin);
  await flushTelemetryForCatalogOrigin(catalogOrigin);
});

extensionApi.runtime.onStartup.addListener(async () => {
  const settings = await loadSettings();
  const catalogOrigin = settings.catalogOrigin || DEFAULT_CATALOG_ORIGIN;
  await initCatalogBridge(catalogOrigin);
  await flushTelemetryForCatalogOrigin(catalogOrigin);
});

bootstrapCatalogBridge().catch((error) => {
  console.warn("[catalog-bridge] bootstrap failed", error);
});

extensionApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.EDITOR_CONTEXT) {
    saveEditorContext(message.payload)
      .then(() => refreshScenarioState())
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.AUTH_TOKEN_UPDATE) {
    saveAuthToken(message.payload)
      .then(() => refreshScenarioState())
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.AUTH_TOKEN_ERROR) {
    saveAuthError(message.payload)
      .then(() => refreshScenarioState())
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.GET_STATUS) {
    getStatusPayload()
      .then((payload) => sendResponse({ ok: true, ...payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.GET_PACKAGES) {
    getCatalogPackagesPayload()
      .then((payload) => sendResponse({ ok: true, ...payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.GET_TELEMETRY_STATUS) {
    getTelemetryStatusPayload()
      .then((payload) => sendResponse({ ok: true, ...payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.SET_TELEMETRY_TEST_MODE) {
    setTelemetryTestMode(message.mode)
      .then((payload) => sendResponse({ ok: true, ...payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.FLUSH_TELEMETRY_QUEUE) {
    flushTelemetryForCurrentSettings({ force: true })
      .then(async (flushResult) => {
        const payload = await getTelemetryStatusPayload();
        sendResponse({ ok: true, flushResult, ...payload });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.PREVIEW_PACKAGE) {
    previewSelectedPackage(message.packageId, message.targetShortIds)
      .then((payload) => sendResponse({ ok: true, ...payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === MESSAGE_TYPES.INSTALL_PACKAGE) {
    installSelectedPackage(message.packageId, message.targetShortIds)
      .then((payload) => sendResponse({ ok: true, ...payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.ROLLBACK_LATEST) {
    rollbackLatestInstall()
      .then((payload) => sendResponse({ ok: true, ...payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.SET_CATALOG_ORIGIN) {
    Promise.resolve()
      .then(() => parseCatalogOrigin(message.catalogOrigin))
      .then(async (catalogOrigin) => {
        const bridgeReady = await initCatalogBridge(catalogOrigin);
        if (!bridgeReady) {
          throw new Error(`Catalog origin ${catalogOrigin} is not supported.`);
        }

        await saveSettings({ catalogOrigin });
        await flushTelemetryForCurrentSettings();
      })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.OPEN_CATALOG) {
    loadSettings()
      .then((settings) => extensionApi.tabs.create({ url: settings.catalogOrigin }))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  sendResponse({ ok: false, error: "Unknown message type." });
  return false;
});







