import {
  DEFAULT_CATALOG_ORIGIN,
  MESSAGE_TYPES
} from "../shared/constants.js";
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
  saveSettings
} from "../shared/storage.js";
import { discoverScenarioLeaves } from "./aid/discover-leaves.js";
import { fetchCatalogPackage, fetchCatalogPackages } from "./catalog.js";
import {
  createRestorePoint,
  installPackageToLeaves,
  restoreFromPoint
} from "./install.js";
import { postInstallSuccess } from "./telemetry.js";

const BUSY_INSTALL_STATES = new Set(["loading", "rolling_back"]);
const CATALOG_SITE_BRIDGE_ID = "catalog-site-bridge";
const BUILTIN_CATALOG_ORIGINS = new Set([
  DEFAULT_CATALOG_ORIGIN,
  "http://localhost:3000"
]);

const parseCatalogOrigin = (value) => {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Catalog origin must use http or https.");
  }
  return parsed.origin;
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
  const currentVersion = chrome.runtime.getManifest().version;
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
    leafCount: restorePoint.leafCount
  };
};

const requireInstallContext = ({ authState, scenarioState }) => {
  if (!authState?.hasToken || !authState?.token) {
    throw new Error("AI Dungeon auth token is not available. Re-open the edit page first.");
  }

  if (scenarioState?.status !== "ready") {
    throw new Error("Scenario leaves are not ready yet. Wait for the tree to finish loading.");
  }

  if (!Array.isArray(scenarioState?.leaves) || scenarioState.leaves.length === 0) {
    throw new Error("No playable leaves were found for this scenario.");
  }

  if (!scenarioState?.origin) {
    throw new Error("AI Dungeon origin is unavailable for this scenario.");
  }
};

const buildOriginPattern = (catalogOrigin) => `${catalogOrigin}/*`;

const ensureCatalogOriginPermission = async (catalogOrigin, allowPrompt = false) => {
  if (BUILTIN_CATALOG_ORIGINS.has(catalogOrigin)) {
    return true;
  }

  const origins = [buildOriginPattern(catalogOrigin)];
  const hasAccess = await chrome.permissions.contains({ origins });

  if (hasAccess) {
    return true;
  }

  if (!allowPrompt) {
    return false;
  }

  try {
    return await chrome.permissions.request({ origins });
  } catch {
    return false;
  }
};

const injectBridgeIntoOpenTabs = async (catalogOrigin) => {
  const tabs = await chrome.tabs.query({ url: [buildOriginPattern(catalogOrigin)] });

  for (const tab of tabs) {
    if (!tab.id) {
      continue;
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/catalog/index.js"]
      });
    } catch (error) {
      console.warn("[catalog-bridge] failed to inject into open tab", error);
    }
  }
};

const syncCatalogSiteBridge = async (catalogOrigin, { allowPrompt = false } = {}) => {
  const hasPermission = await ensureCatalogOriginPermission(catalogOrigin, allowPrompt);
  if (!hasPermission) {
    return false;
  }

  try {
    await chrome.scripting.unregisterContentScripts({ ids: [CATALOG_SITE_BRIDGE_ID] });
  } catch {
    // Ignore missing registrations.
  }

  await chrome.scripting.registerContentScripts([
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

const installSelectedPackage = async (packageId) => {
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

  requireInstallContext({ authState, scenarioState });

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
      pkg
    });
    await addRestorePoint(restorePoint);

    const result = await installPackageToLeaves({
      token: authState.token,
      origin: scenarioState.origin,
      leaves: scenarioState.leaves,
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
      await postInstallSuccess(settings.catalogOrigin, {
        event: "script_install_succeeded",
        installId: restorePoint.id,
        packageId: pkg.id,
        packageVersion: pkg.version,
        leafCount: restorePoint.leafCount,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.warn("[telemetry] install-success post failed", error);
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
        message = `${message} Previous state restored on ${rollbackResult.restoredCount} leaves.`;
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

const initCatalogBridge = async (catalogOrigin, { allowPrompt = false } = {}) => {
  try {
    return await syncCatalogSiteBridge(catalogOrigin, { allowPrompt });
  } catch (error) {
    console.warn("[catalog-bridge] failed to sync content script", error);
    return false;
  }
};

const bootstrapCatalogBridge = async () => {
  const settings = await loadSettings();
  await initCatalogBridge(settings.catalogOrigin || DEFAULT_CATALOG_ORIGIN);
};

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await loadSettings();
  const catalogOrigin = settings.catalogOrigin || DEFAULT_CATALOG_ORIGIN;
  await saveSettings({ catalogOrigin });
  await initCatalogBridge(catalogOrigin);
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await loadSettings();
  await initCatalogBridge(settings.catalogOrigin || DEFAULT_CATALOG_ORIGIN);
});

bootstrapCatalogBridge().catch((error) => {
  console.warn("[catalog-bridge] bootstrap failed", error);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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

  if (message?.type === MESSAGE_TYPES.INSTALL_PACKAGE) {
    installSelectedPackage(message.packageId)
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
        const bridgeReady = await initCatalogBridge(catalogOrigin, { allowPrompt: true });
        if (!bridgeReady) {
          throw new Error(`Permission to access ${catalogOrigin} was not granted.`);
        }

        await saveSettings({ catalogOrigin });
      })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.OPEN_CATALOG) {
    loadSettings()
      .then((settings) => chrome.tabs.create({ url: settings.catalogOrigin }))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  sendResponse({ ok: false, error: "Unknown message type." });
  return false;
});
