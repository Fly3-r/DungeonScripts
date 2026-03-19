import { DEFAULT_CATALOG_ORIGIN } from "./constants.js";

const STORAGE_KEYS = {
  editorContext: "editorContext",
  settings: "settings"
};

const SESSION_KEYS = {
  authState: "authState"
};

export const loadEditorContext = async () => {
  const result = await chrome.storage.local.get(STORAGE_KEYS.editorContext);
  return result[STORAGE_KEYS.editorContext] || null;
};

export const saveEditorContext = async (editorContext) => {
  await chrome.storage.local.set({
    [STORAGE_KEYS.editorContext]: editorContext
  });
};

export const loadSettings = async () => {
  const result = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return {
    catalogOrigin: DEFAULT_CATALOG_ORIGIN,
    ...(result[STORAGE_KEYS.settings] || {})
  };
};

export const saveSettings = async (settings) => {
  const current = await loadSettings();
  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: {
      ...current,
      ...settings
    }
  });
};

export const loadAuthState = async () => {
  if (!chrome.storage.session) {
    throw new Error("chrome.storage.session is not available.");
  }

  const result = await chrome.storage.session.get(SESSION_KEYS.authState);
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
  if (!chrome.storage.session) {
    throw new Error("chrome.storage.session is not available.");
  }

  await chrome.storage.session.set({
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
  if (!chrome.storage.session) {
    throw new Error("chrome.storage.session is not available.");
  }

  await chrome.storage.session.set({
    [SESSION_KEYS.authState]: {
      token: null,
      hasToken: false,
      origin,
      updatedAt: new Date().toISOString(),
      error
    }
  });
};