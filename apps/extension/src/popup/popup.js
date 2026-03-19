const MESSAGE_TYPES = {
  GET_STATUS: "GET_STATUS",
  OPEN_CATALOG: "OPEN_CATALOG",
  SET_CATALOG_ORIGIN: "SET_CATALOG_ORIGIN"
};

const elements = {
  authState: document.getElementById("auth-state"),
  authUpdatedAt: document.getElementById("auth-updated-at"),
  editorState: document.getElementById("editor-state"),
  rootShortId: document.getElementById("root-short-id"),
  catalogOriginDisplay: document.getElementById("catalog-origin-display"),
  catalogOriginInput: document.getElementById("catalog-origin"),
  notice: document.getElementById("notice"),
  saveOrigin: document.getElementById("save-origin"),
  openCatalog: document.getElementById("open-catalog")
};

const setNotice = (message) => {
  elements.notice.textContent = message;
};

const loadStatus = async () => {
  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.GET_STATUS
  });

  if (!response?.ok) {
    setNotice(response?.error || "Failed to load status.");
    return;
  }

  const { authState, editorContext, settings } = response;
  elements.catalogOriginDisplay.textContent = settings.catalogOrigin;
  elements.catalogOriginInput.value = settings.catalogOrigin;
  elements.authState.textContent = authState?.hasToken ? "Active" : "Missing";
  elements.authUpdatedAt.textContent = authState?.updatedAt
    ? new Date(authState.updatedAt).toLocaleString()
    : "Never";

  if (editorContext?.isEditor) {
    elements.editorState.textContent = "Connected";
    elements.rootShortId.textContent = editorContext.rootShortId || "Unknown";
  } else {
    elements.editorState.textContent = "No editor tab detected";
    elements.rootShortId.textContent = "None";
  }

  if (!authState?.hasToken && authState?.error) {
    setNotice(`Auth token missing: ${authState.error}`);
    return;
  }

  setNotice("Ready.");
};

elements.saveOrigin.addEventListener("click", async () => {
  const catalogOrigin = elements.catalogOriginInput.value.trim();
  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.SET_CATALOG_ORIGIN,
    catalogOrigin
  });

  if (!response?.ok) {
    setNotice(response?.error || "Failed to save catalog origin.");
    return;
  }

  await loadStatus();
  setNotice("Catalog origin saved.");
});

elements.openCatalog.addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.OPEN_CATALOG
  });

  if (!response?.ok) {
    setNotice(response?.error || "Failed to open catalog.");
    return;
  }

  setNotice("Catalog opened in a new tab.");
});

loadStatus().catch((error) => {
  setNotice(error.message);
});