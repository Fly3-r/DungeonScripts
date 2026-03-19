import { MESSAGE_TYPES } from "../shared/constants.js";

const STATUS_REFRESH_MS = 2000;

const state = {
  packages: [],
  selectedPackageId: ""
};

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
  packageSelect: document.getElementById("package-select"),
  packageMeta: document.getElementById("package-meta"),
  installState: document.getElementById("install-state"),
  latestRestorePoint: document.getElementById("latest-restore-point"),
  notice: document.getElementById("notice"),
  saveOrigin: document.getElementById("save-origin"),
  openCatalog: document.getElementById("open-catalog"),
  refreshPackages: document.getElementById("refresh-packages"),
  installSelected: document.getElementById("install-selected"),
  rollbackLatest: document.getElementById("rollback-latest")
};

const setNotice = (message) => {
  elements.notice.textContent = message;
};

const formatTimestamp = (value) => {
  if (!value) {
    return "Never";
  }

  return new Date(value).toLocaleString();
};

const getScenarioTargetCount = (scenarioState) => {
  if (Number.isInteger(scenarioState?.targetCount) && scenarioState.targetCount > 0) {
    return scenarioState.targetCount;
  }

  if (Number.isInteger(scenarioState?.leafCount) && scenarioState.leafCount > 0) {
    return scenarioState.leafCount;
  }

  return 0;
};

const getRestoreTargetCount = (restorePoint) => {
  if (Number.isInteger(restorePoint?.targetCount) && restorePoint.targetCount > 0) {
    return restorePoint.targetCount;
  }

  if (Number.isInteger(restorePoint?.leafCount) && restorePoint.leafCount > 0) {
    return restorePoint.leafCount;
  }

  return 0;
};

const describeTargetCount = (targetCount, leafCount = null) => {
  if (!Number.isInteger(targetCount) || targetCount <= 0) {
    return "0 scenario targets";
  }

  const targetLabel = targetCount === 1 ? "target" : "targets";
  if (Number.isInteger(leafCount) && targetCount > leafCount) {
    const leafLabel = leafCount === 1 ? "leaf" : "leaves";
    return `${targetCount} scenario ${targetLabel} (root + ${leafCount} playable ${leafLabel})`;
  }

  return `${targetCount} scenario ${targetLabel}`;
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

const describeInstallState = (installState) => {
  switch (installState?.status) {
    case "loading":
      return "Installing...";
    case "ready":
      return `Installed to ${describeTargetCount(installState.appliedCount)}`;
    case "rolling_back":
      return "Rolling back...";
    case "rolled_back":
      return `Rolled back ${describeTargetCount(installState.appliedCount)}`;
    case "error":
      return "Error";
    default:
      return "Idle";
  }
};

const describeRestorePoint = (restorePoint) => {
  if (!restorePoint) {
    return "None";
  }

  const packageLabel = restorePoint.packageName || restorePoint.packageId;
  return `${packageLabel} ${restorePoint.packageVersion} on ${describeTargetCount(getRestoreTargetCount(restorePoint), restorePoint.leafCount)} at ${formatTimestamp(restorePoint.createdAt)}`;
};

const describeNotice = ({ authState, scenarioState, installState }) => {
  switch (installState?.status) {
    case "loading":
      return `Installing ${installState.packageName || installState.packageId || "package"} to scenario targets...`;
    case "ready":
      return `Install complete. Applied to ${describeTargetCount(installState.appliedCount)}.`;
    case "rolling_back":
      return "Rolling back the latest restore point...";
    case "rolled_back":
      return `Rollback complete. Restored ${describeTargetCount(installState.appliedCount)}.`;
    case "error":
      return installState.error || "Install failed.";
    default:
      break;
  }

  if (!authState?.hasToken && authState?.error) {
    return `Auth token missing: ${authState.error}`;
  }

  if (scenarioState?.status === "error" && scenarioState?.error) {
    return `Scenario read failed: ${scenarioState.error}`;
  }

  if (scenarioState?.status === "ready") {
    const leafLabel = scenarioState.leafCount === 1 ? "leaf" : "leaves";
    return `Scenario tree loaded. Found ${scenarioState.leafCount} playable ${leafLabel} and ${describeTargetCount(getScenarioTargetCount(scenarioState), scenarioState.leafCount)}.`;
  }

  return "Ready.";
};

const renderPackageOptions = () => {
  const previousSelection = elements.packageSelect.value || state.selectedPackageId;
  elements.packageSelect.innerHTML = "";

  if (state.packages.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No packages available";
    elements.packageSelect.append(option);
    state.selectedPackageId = "";
    renderPackageMeta();
    return;
  }

  for (const pkg of state.packages) {
    const option = document.createElement("option");
    option.value = pkg.id;
    option.textContent = `${pkg.name} (${pkg.version})`;
    elements.packageSelect.append(option);
  }

  const matchingPackage = state.packages.find((pkg) => pkg.id === previousSelection);
  state.selectedPackageId = matchingPackage ? matchingPackage.id : state.packages[0].id;
  elements.packageSelect.value = state.selectedPackageId;
  renderPackageMeta();
};

const renderPackageMeta = () => {
  const selectedPackage = state.packages.find((pkg) => pkg.id === elements.packageSelect.value);

  if (!selectedPackage) {
    elements.packageMeta.textContent = "No package selected.";
    return;
  }

  const description = selectedPackage.description || "No package description available.";
  elements.packageMeta.textContent = `${selectedPackage.author} · ${selectedPackage.version} · ${description}`;
};

const updateActionAvailability = (response) => {
  const installState = response?.installState || { status: "idle" };
  const authState = response?.authState || { hasToken: false };
  const scenarioState = response?.scenarioState || { status: "idle", targetCount: 0, leafCount: 0 };
  const busy = installState.status === "loading" || installState.status === "rolling_back";
  const canInstall =
    !busy &&
    authState.hasToken &&
    scenarioState.status === "ready" &&
    getScenarioTargetCount(scenarioState) > 0 &&
    !!elements.packageSelect.value;

  elements.refreshPackages.disabled = busy;
  elements.installSelected.disabled = !canInstall;
  elements.rollbackLatest.disabled = busy || !authState.hasToken || !response?.latestRestorePoint;
};

const loadStatus = async () => {
  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.GET_STATUS
  });

  if (!response?.ok) {
    setNotice(response?.error || "Failed to load status.");
    return null;
  }

  const {
    authState,
    editorContext,
    installState,
    latestRestorePoint,
    scenarioState,
    settings
  } = response;

  elements.catalogOriginDisplay.textContent = settings.catalogOrigin;
  elements.catalogOriginInput.value = settings.catalogOrigin;
  elements.authState.textContent = authState?.hasToken ? "Active" : "Missing";
  elements.authUpdatedAt.textContent = formatTimestamp(authState?.updatedAt);
  elements.scenarioAccess.textContent = describeScenarioAccess(scenarioState);
  elements.scenarioTitle.textContent = scenarioState?.rootTitle || "Unknown";
  elements.leafCount.textContent = Number.isInteger(scenarioState?.leafCount)
    ? String(scenarioState.leafCount)
    : "Unknown";
  elements.scenarioUpdatedAt.textContent = formatTimestamp(scenarioState?.updatedAt);
  elements.installState.textContent = describeInstallState(installState);
  elements.latestRestorePoint.textContent = describeRestorePoint(latestRestorePoint);

  if (editorContext?.isEditor) {
    elements.editorState.textContent = "Connected";
    elements.rootShortId.textContent = editorContext.rootShortId || "Unknown";
  } else {
    elements.editorState.textContent = "No editor tab detected";
    elements.rootShortId.textContent = "None";
  }

  updateActionAvailability(response);
  setNotice(describeNotice({ authState, scenarioState, installState }));
  return response;
};

const loadPackages = async () => {
  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.GET_PACKAGES
  });

  if (!response?.ok) {
    state.packages = [];
    renderPackageOptions();
    setNotice(response?.error || "Failed to load packages.");
    return null;
  }

  state.packages = Array.isArray(response.packages) ? response.packages : [];
  renderPackageOptions();

  if (state.packages.length === 0) {
    setNotice("No packages found at the current catalog origin.");
  }

  return response;
};

elements.packageSelect.addEventListener("change", () => {
  state.selectedPackageId = elements.packageSelect.value;
  renderPackageMeta();
});

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
  await loadPackages();
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

elements.refreshPackages.addEventListener("click", async () => {
  await loadPackages();
  const status = await loadStatus();
  if (status) {
    setNotice(`Catalog refreshed. ${state.packages.length} package(s) available.`);
  }
});

elements.installSelected.addEventListener("click", async () => {
  const packageId = elements.packageSelect.value;
  if (!packageId) {
    setNotice("Select a package before installing.");
    return;
  }

  setNotice("Starting install...");
  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.INSTALL_PACKAGE,
    packageId
  });

  await loadStatus();

  if (!response?.ok) {
    setNotice(response?.error || "Install failed.");
    return;
  }

  const installedTargets = response.installState?.appliedCount || 0;
  setNotice(`Install complete. Applied to ${describeTargetCount(installedTargets)}.`);
});

elements.rollbackLatest.addEventListener("click", async () => {
  setNotice("Starting rollback...");
  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.ROLLBACK_LATEST
  });

  await loadStatus();

  if (!response?.ok) {
    setNotice(response?.error || "Rollback failed.");
    return;
  }

  const restoredTargets = response.installState?.appliedCount || 0;
  setNotice(`Rollback complete. Restored ${describeTargetCount(restoredTargets)}.`);
});

const init = async () => {
  await Promise.all([loadStatus(), loadPackages()]);
  await loadStatus();
};

init().catch((error) => {
  setNotice(error.message);
});

setInterval(() => {
  loadStatus().catch((error) => {
    setNotice(error.message);
  });
}, STATUS_REFRESH_MS);


