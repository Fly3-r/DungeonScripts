import { MESSAGE_TYPES } from "../shared/constants.js";

const SELECTORS = {
  summary: "#extension-bridge-summary",
  scenarioRoot: "#extension-scenario-root",
  scenarioTitle: "#extension-scenario-title",
  leafCount: "#extension-leaf-count",
  installState: "#extension-install-state",
  refresh: "[data-oneclick-refresh]",
  installButton: "[data-oneclick-install]"
};

const POLL_MS = 5000;

let latestStatus = null;
let transientNotice = "Checking extension status...";
let currentActionPackageId = null;

const formatInstallState = (installState) => {
  switch (installState?.status) {
    case "loading":
      return "Installing...";
    case "ready":
      return `Installed to ${installState.appliedCount || 0} leaves`;
    case "rolling_back":
      return "Rolling back...";
    case "rolled_back":
      return `Rolled back ${installState.appliedCount || 0} leaves`;
    case "error":
      return installState.error || "Install error";
    default:
      return "Idle";
  }
};

const describeSummary = (status) => {
  if (!status?.ok) {
    return transientNotice;
  }

  const { authState, editorContext, scenarioState, installState } = status;

  if (installState?.status === "loading") {
    return transientNotice;
  }

  if (installState?.status === "rolling_back") {
    return transientNotice;
  }

  if (!editorContext?.isEditor) {
    return "Extension detected. Open an AI Dungeon scenario edit page to enable one-click install.";
  }

  if (!authState?.hasToken) {
    return "Extension detected, but the AI Dungeon auth token is not available yet.";
  }

  if (scenarioState?.status !== "ready") {
    return scenarioState?.error || "Extension detected. Waiting for the scenario tree to finish loading.";
  }

  return `Extension ready. Installs will target ${scenarioState.leafCount} playable leaves under the current scenario.`;
};

const updateStatusPanel = () => {
  const summary = document.querySelector(SELECTORS.summary);
  const scenarioRoot = document.querySelector(SELECTORS.scenarioRoot);
  const scenarioTitle = document.querySelector(SELECTORS.scenarioTitle);
  const leafCount = document.querySelector(SELECTORS.leafCount);
  const installState = document.querySelector(SELECTORS.installState);

  if (!summary || !scenarioRoot || !scenarioTitle || !leafCount || !installState) {
    return;
  }

  summary.textContent = describeSummary(latestStatus);
  scenarioRoot.textContent = latestStatus?.scenarioState?.rootShortId || "Unavailable";
  scenarioTitle.textContent = latestStatus?.scenarioState?.rootTitle || "Unavailable";
  leafCount.textContent = Number.isInteger(latestStatus?.scenarioState?.leafCount)
    ? String(latestStatus.scenarioState.leafCount)
    : "Unavailable";
  installState.textContent = formatInstallState(latestStatus?.installState);
};

const updateInstallButtons = () => {
  const buttons = Array.from(document.querySelectorAll(SELECTORS.installButton));
  const canInstall =
    latestStatus?.ok &&
    latestStatus?.authState?.hasToken &&
    latestStatus?.scenarioState?.status === "ready" &&
    Number.isInteger(latestStatus?.scenarioState?.leafCount) &&
    latestStatus.scenarioState.leafCount > 0 &&
    latestStatus?.settings?.catalogOrigin === window.location.origin;
  const isBusy =
    latestStatus?.installState?.status === "loading" ||
    latestStatus?.installState?.status === "rolling_back";

  for (const button of buttons) {
    const isCurrentAction = currentActionPackageId === button.dataset.packageId;
    button.disabled = !canInstall || isBusy;

    if (isBusy && isCurrentAction) {
      button.textContent = "Installing...";
      continue;
    }

    button.textContent = canInstall ? "One-Click Install" : "Open AI Dungeon Edit Page";
  }
};

const refreshExtensionState = async () => {
  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.GET_STATUS
    });

    latestStatus = response?.ok ? response : { ok: false, error: response?.error || "Unknown error." };
    if (!response?.ok) {
      transientNotice = `Extension check failed: ${latestStatus.error}`;
    }
  } catch (error) {
    latestStatus = { ok: false, error: error.message };
    transientNotice = `Extension check failed: ${error.message}`;
  }

  updateStatusPanel();
  updateInstallButtons();
};

const installPackageFromPage = async (button) => {
  const packageId = button.dataset.packageId;
  const packageName = button.dataset.packageName || packageId;
  const scenarioState = latestStatus?.scenarioState;
  const scenarioLabel = scenarioState?.rootTitle
    ? `${scenarioState.rootTitle} (${scenarioState.rootShortId})`
    : scenarioState?.rootShortId || "current scenario";

  const confirmed = window.confirm(
    `Install \"${packageName}\" to ${scenarioLabel}? This will update ${scenarioState.leafCount} playable leaves.`
  );

  if (!confirmed) {
    return;
  }

  currentActionPackageId = packageId;
  transientNotice = `Installing ${packageName} to ${scenarioLabel}...`;
  updateStatusPanel();
  updateInstallButtons();

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.INSTALL_PACKAGE,
      packageId
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Install failed.");
    }

    transientNotice = `Install complete. ${packageName} applied to ${response.installState?.appliedCount || 0} playable leaves.`;
  } catch (error) {
    transientNotice = error.message;
  } finally {
    currentActionPackageId = null;
    await refreshExtensionState();
  }
};

document.addEventListener("click", (event) => {
  const refreshButton = event.target.closest(SELECTORS.refresh);
  if (refreshButton) {
    transientNotice = "Refreshing extension status...";
    refreshExtensionState();
    return;
  }

  const installButton = event.target.closest(SELECTORS.installButton);
  if (!installButton) {
    return;
  }

  event.preventDefault();

  if (
    !latestStatus?.ok ||
    !latestStatus?.authState?.hasToken ||
    latestStatus?.scenarioState?.status !== "ready"
  ) {
    transientNotice =
      "Open an AI Dungeon scenario edit page and wait for the extension to finish loading the scenario tree.";
    updateStatusPanel();
    updateInstallButtons();
    return;
  }

  installPackageFromPage(installButton);
});

const observer = new MutationObserver(() => {
  updateStatusPanel();
  updateInstallButtons();
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

window.addEventListener("focus", refreshExtensionState);

refreshExtensionState();
setInterval(refreshExtensionState, POLL_MS);
