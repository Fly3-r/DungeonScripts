import {
  DEFAULT_CATALOG_ORIGIN,
  MESSAGE_TYPES
} from "../shared/constants.js";
import {
  loadAuthState,
  loadEditorContext,
  loadScenarioState,
  loadSettings,
  saveAuthError,
  saveAuthToken,
  saveEditorContext,
  saveScenarioState,
  saveSettings
} from "../shared/storage.js";
import { discoverScenarioLeaves } from "./aid/discover-leaves.js";

const parseCatalogOrigin = (value) => {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Catalog origin must use http or https.");
  }
  return parsed.origin;
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

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await loadSettings();
  await saveSettings({
    catalogOrigin: settings.catalogOrigin || DEFAULT_CATALOG_ORIGIN
  });
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
    Promise.all([
      loadEditorContext(),
      loadSettings(),
      loadAuthState(),
      loadScenarioState()
    ])
      .then(([editorContext, settings, authState, scenarioState]) => {
        const { token: _token, ...publicAuthState } = authState;
        sendResponse({
          ok: true,
          editorContext,
          settings,
          authState: publicAuthState,
          scenarioState
        });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.SET_CATALOG_ORIGIN) {
    Promise.resolve()
      .then(() => parseCatalogOrigin(message.catalogOrigin))
      .then((catalogOrigin) => saveSettings({ catalogOrigin }))
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