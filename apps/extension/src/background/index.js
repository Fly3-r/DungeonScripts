import {
  DEFAULT_CATALOG_ORIGIN,
  MESSAGE_TYPES
} from "../shared/constants.js";
import {
  loadAuthState,
  loadEditorContext,
  loadSettings,
  saveAuthError,
  saveAuthToken,
  saveEditorContext,
  saveSettings
} from "../shared/storage.js";

const parseCatalogOrigin = (value) => {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Catalog origin must use http or https.");
  }
  return parsed.origin;
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
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.AUTH_TOKEN_UPDATE) {
    saveAuthToken(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.AUTH_TOKEN_ERROR) {
    saveAuthError(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.GET_STATUS) {
    Promise.all([loadEditorContext(), loadSettings(), loadAuthState()])
      .then(([editorContext, settings, authState]) => {
        const { token: _token, ...publicAuthState } = authState;
        sendResponse({
          ok: true,
          editorContext,
          settings,
          authState: publicAuthState
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