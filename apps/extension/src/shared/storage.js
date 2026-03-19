import { DEFAULT_CATALOG_ORIGIN } from "./constants.js";

const STORAGE_KEYS = {
  editorContext: "editorContext",
  settings: "settings"
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
