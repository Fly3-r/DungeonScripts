(() => {
const MESSAGE_TYPES = {
  GET_STATUS: "GET_STATUS",
  INSTALL_PACKAGE: "INSTALL_PACKAGE",
  ROLLBACK_LATEST: "ROLLBACK_LATEST"
};

const SELECTORS = {
  summary: "#extension-bridge-summary",
  scenarioRoot: "#extension-scenario-root",
  scenarioTitle: "#extension-scenario-title",
  leafCount: "#extension-leaf-count",
  installState: "#extension-install-state",
  refresh: "[data-oneclick-refresh]",
  installExtension: "[data-oneclick-install-extension]",
  installButton: "[data-oneclick-install]",
  rollbackButton: "[data-oneclick-rollback]"
};

const POLL_MS = 5000;
const BRIDGE_FLAG = "__aidOneClickCatalogBridgeReady";

if (!globalThis[BRIDGE_FLAG]) {
  globalThis[BRIDGE_FLAG] = true;

  let latestStatus = null;
  let transientNotice = "Checking extension status...";
  let currentAction = null;

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

  const formatInstallState = (installState) => {
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
        return installState.error || "Install error";
      default:
        return "Idle";
    }
  };

  const formatScenarioLabel = ({ rootTitle, rootShortId } = {}) => {
    if (rootTitle && rootShortId) {
      return `${rootTitle} (${rootShortId})`;
    }

    return rootShortId || rootTitle || "current scenario";
  };

  const formatPackageLabel = ({ packageName, packageId, packageVersion } = {}) => {
    const baseName = packageName || packageId || "selected package";
    return packageVersion ? `${baseName} v${packageVersion}` : baseName;
  };

  const getMatchingRestorePoint = (packageId) => {
    const restorePoint = latestStatus?.latestRestorePoint;
    if (!restorePoint || restorePoint.packageId !== packageId) {
      return null;
    }

    return restorePoint;
  };

  const describeSummary = (status) => {
    if (!status?.ok) {
      return transientNotice;
    }

    const { authState, editorContext, scenarioState, installState } = status;

    if (installState?.status === "loading" || installState?.status === "rolling_back") {
      return transientNotice;
    }

    if (!editorContext?.isEditor) {
      return "Extension detected. Open an AI Dungeon scenario edit page to enable one-click install.";
    }

    if (!authState?.hasToken) {
      return "Extension Detected, Please open your scenario edit page";
    }

    if (scenarioState?.status !== "ready") {
      return scenarioState?.error || "Extension detected. Waiting for the scenario tree to finish loading.";
    }

    return `Extension ready. Installs will target ${describeTargetCount(getScenarioTargetCount(scenarioState), scenarioState.leafCount)} under the current scenario.`;
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

  const updateActionButtons = () => {
    const installExtensionButton = document.querySelector(SELECTORS.installExtension);
    const installButtons = Array.from(document.querySelectorAll(SELECTORS.installButton));
    const rollbackButtons = Array.from(document.querySelectorAll(SELECTORS.rollbackButton));
    const canInstall =
      latestStatus?.ok &&
      latestStatus?.authState?.hasToken &&
      latestStatus?.scenarioState?.status === "ready" &&
      getScenarioTargetCount(latestStatus?.scenarioState) > 0 &&
      latestStatus?.settings?.catalogOrigin === window.location.origin;
    const canRollback =
      latestStatus?.ok &&
      latestStatus?.authState?.hasToken &&
      latestStatus?.settings?.catalogOrigin === window.location.origin;
    const isBusy =
      latestStatus?.installState?.status === "loading" ||
      latestStatus?.installState?.status === "rolling_back";

    if (installExtensionButton) {
      installExtensionButton.hidden = Boolean(latestStatus?.ok);
    }

    for (const button of installButtons) {
      const isCurrentAction =
        currentAction?.type === "install" && currentAction.packageId === button.dataset.packageId;
      button.disabled = !canInstall || isBusy;

      if (isBusy && isCurrentAction) {
        button.textContent = "Installing...";
        continue;
      }

      button.textContent = canInstall ? "One-Click Install" : "Open AI Dungeon Edit Page";
    }

    for (const button of rollbackButtons) {
      const hasMatchingRestorePoint = Boolean(getMatchingRestorePoint(button.dataset.packageId));
      const isCurrentAction =
        currentAction?.type === "rollback" && currentAction.packageId === button.dataset.packageId;
      button.hidden = !hasMatchingRestorePoint;
      button.disabled = !canRollback || !hasMatchingRestorePoint || isBusy;

      if (isBusy && isCurrentAction) {
        button.textContent = "Rolling Back...";
        continue;
      }

      button.textContent = "Rollback Latest";
    }
  };

  const refreshExtensionState = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_STATUS
      });

      latestStatus = response?.ok
        ? response
        : { ok: false, error: response?.error || "Unknown error." };
      if (!response?.ok) {
        transientNotice = `Extension check failed: ${latestStatus.error}`;
      }
    } catch (error) {
      latestStatus = { ok: false, error: error.message };
      transientNotice = `Extension check failed: ${error.message}`;
    }

    updateStatusPanel();
    updateActionButtons();
  };

  const installPackageFromPage = async (button) => {
    const packageId = button.dataset.packageId;
    const packageName = button.dataset.packageName || packageId;
    const scenarioState = latestStatus?.scenarioState;
    const scenarioLabel = formatScenarioLabel({
      rootTitle: scenarioState?.rootTitle,
      rootShortId: scenarioState?.rootShortId
    });
    const targetSummary = describeTargetCount(
      getScenarioTargetCount(scenarioState),
      scenarioState?.leafCount
    );

    const confirmed = window.confirm(
      `Install \"${packageName}\" to ${scenarioLabel}? This will update ${targetSummary}.`
    );

    if (!confirmed) {
      return;
    }

    currentAction = {
      type: "install",
      packageId
    };
    transientNotice = `Installing ${packageName} to ${scenarioLabel}...`;
    updateStatusPanel();
    updateActionButtons();

    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.INSTALL_PACKAGE,
        packageId
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Install failed.");
      }

      transientNotice = `Install complete. ${packageName} applied to ${describeTargetCount(response.installState?.appliedCount || 0)}.`;
    } catch (error) {
      transientNotice = error.message;
    } finally {
      currentAction = null;
      await refreshExtensionState();
    }
  };

  const rollbackPackageFromPage = async (button) => {
    const restorePoint = getMatchingRestorePoint(button.dataset.packageId);
    if (!restorePoint) {
      transientNotice = "No matching restore point is available for this package yet.";
      updateStatusPanel();
      updateActionButtons();
      return;
    }

    const packageLabel = formatPackageLabel({
      packageName: restorePoint.packageName || button.dataset.packageName,
      packageId: restorePoint.packageId,
      packageVersion: restorePoint.packageVersion
    });
    const scenarioLabel = formatScenarioLabel({
      rootTitle: restorePoint.rootTitle,
      rootShortId: restorePoint.rootShortId
    });
    const targetSummary = describeTargetCount(
      getRestoreTargetCount(restorePoint),
      restorePoint.leafCount
    );

    const confirmed = window.confirm(
      `Rollback ${packageLabel} on ${scenarioLabel}? This will restore ${targetSummary} to their saved pre-install state.`
    );

    if (!confirmed) {
      return;
    }

    currentAction = {
      type: "rollback",
      packageId: restorePoint.packageId
    };
    transientNotice = `Rolling back ${packageLabel} on ${scenarioLabel}...`;
    updateStatusPanel();
    updateActionButtons();

    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.ROLLBACK_LATEST
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Rollback failed.");
      }

      transientNotice = `Rollback complete. Restored ${describeTargetCount(response.installState?.appliedCount || 0)} for ${packageLabel}.`;
    } catch (error) {
      transientNotice = error.message;
    } finally {
      currentAction = null;
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
    if (installButton) {
      event.preventDefault();

      if (
        !latestStatus?.ok ||
        !latestStatus?.authState?.hasToken ||
        latestStatus?.scenarioState?.status !== "ready"
      ) {
        transientNotice =
          "Open an AI Dungeon scenario edit page and wait for the extension to finish loading the scenario tree.";
        updateStatusPanel();
        updateActionButtons();
        return;
      }

      installPackageFromPage(installButton);
      return;
    }

    const rollbackButton = event.target.closest(SELECTORS.rollbackButton);
    if (!rollbackButton) {
      return;
    }

    event.preventDefault();

    if (!latestStatus?.ok || !latestStatus?.authState?.hasToken) {
      transientNotice =
        "Open an AI Dungeon scenario edit page and wait for the extension to finish loading before rolling back.";
      updateStatusPanel();
      updateActionButtons();
      return;
    }

    rollbackPackageFromPage(rollbackButton);
  });

  window.addEventListener("focus", refreshExtensionState);
  window.addEventListener("load", refreshExtensionState, { once: true });

  refreshExtensionState();
  setInterval(refreshExtensionState, POLL_MS);
}
})();
