const MESSAGE_TYPES = {
  GET_STATUS: "GET_STATUS",
  OPEN_CATALOG: "OPEN_CATALOG",
  SET_CATALOG_ORIGIN: "SET_CATALOG_ORIGIN"
};

const STATUS_REFRESH_MS = 2000;

const elements = {
  authState: document.getElementById("auth-state"),
  authUpdatedAt: document.getElementById("auth-updated-at"),
  editorState: document.getElementById("editor-state"),
  rootShortId: document.getElementById("root-short-id"),
  scenarioAccess: document.getElementById("scenario-access"),
  scenarioTitle: document.getElementById("scenario-title"),
  leafCount: document.getElementById("leaf-count"),
  scenarioUpdatedAt: document.getElementById("scenario-updated-at"),
  catalogOriginDisplay: document.getElementById("catalog-origin-display"),
  catalogOriginInput: document.getElementById("catalog-origin"),
  notice: document.getElementById("notice"),
  saveOrigin: document.getElementById("save-origin"),
  openCatalog: document.getElementById("open-catalog")
};

const setNotice = (message) => {
  elements.notice.textContent = message;
};

const describeScenarioAccess = (scenarioState) => {
  switch (scenarioState?.status) {
    case "ready":
      return "Readable";
    case "loading":
      return "Loading...";
    case "error":
      return "Error";
    default:
      return "Waiting";
  }
};

const loadStatus = async () => {
  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.GET_STATUS
  });

  if (!response?.ok) {
    setNotice(response?.error || "Failed to load status.");
    return;
  }

  const { authState, editorContext, scenarioState, settings } = response;
  elements.catalogOriginDisplay.textContent = settings.catalogOrigin;
  elements.catalogOriginInput.value = settings.catalogOrigin;
  elements.authState.textContent = authState?.hasToken ? "Active" : "Missing";
  elements.authUpdatedAt.textContent = authState?.updatedAt
    ? new Date(authState.updatedAt).toLocaleString()
    : "Never";
  elements.scenarioAccess.textContent = describeScenarioAccess(scenarioState);
  elements.scenarioTitle.textContent = scenarioState?.rootTitle || "Unknown";
  elements.leafCount.textContent = Number.isInteger(scenarioState?.leafCount)
    ? String(scenarioState.leafCount)
    : "Unknown";
  elements.scenarioUpdatedAt.textContent = scenarioState?.updatedAt
    ? new Date(scenarioState.updatedAt).toLocaleString()
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

  if (scenarioState?.status === "error" && scenarioState?.error) {
    setNotice(`Scenario read failed: ${scenarioState.error}`);
    return;
  }

  if (scenarioState?.status === "ready") {
    setNotice(`Scenario tree loaded. Found ${scenarioState.leafCount} playable leaves.`);
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

setInterval(() => {
  loadStatus().catch((error) => {
    setNotice(error.message);
  });
}, STATUS_REFRESH_MS);