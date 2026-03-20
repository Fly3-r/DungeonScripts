(() => {
const MESSAGE_TYPES = {
  GET_STATUS: "GET_STATUS",
  PREVIEW_PACKAGE: "PREVIEW_PACKAGE",
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
  previewButton: "[data-oneclick-preview]",
  installButton: "[data-oneclick-install]",
  rollbackButton: "[data-oneclick-rollback]",
  previewModal: "[data-oneclick-preview-modal]",
  previewModalClose: "[data-oneclick-preview-close]",
  previewTitle: "#preview-modal-title",
  previewSummary: "#preview-modal-summary",
  previewBody: "#preview-modal-body"
};

const SCRIPT_FIELDS = [
  { key: "sharedLibrary", label: "Library.js" },
  { key: "onInput", label: "Input.js" },
  { key: "onModelContext", label: "Context.js" },
  { key: "onOutput", label: "Output.js" }
];

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

  const getPreviewModalElements = () => ({
    modal: document.querySelector(SELECTORS.previewModal),
    title: document.querySelector(SELECTORS.previewTitle),
    summary: document.querySelector(SELECTORS.previewSummary),
    body: document.querySelector(SELECTORS.previewBody)
  });

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

  const normalizeScriptText = (value) => String(value || "").replace(/\r\n/g, "\n");

  const splitScriptLines = (value) => {
    const normalized = normalizeScriptText(value);
    return normalized.length === 0 ? [] : normalized.split("\n");
  };

  const buildLineDiff = (currentText, packageText) => {
    const currentLines = splitScriptLines(currentText);
    const packageLines = splitScriptLines(packageText);
    const currentNormalized = normalizeScriptText(currentText);
    const packageNormalized = normalizeScriptText(packageText);

    if (currentNormalized === packageNormalized) {
      return { changed: false, rows: [] };
    }

    let prefix = 0;
    while (
      prefix < currentLines.length &&
      prefix < packageLines.length &&
      currentLines[prefix] === packageLines[prefix]
    ) {
      prefix += 1;
    }

    let currentEnd = currentLines.length - 1;
    let packageEnd = packageLines.length - 1;
    while (
      currentEnd >= prefix &&
      packageEnd >= prefix &&
      currentLines[currentEnd] === packageLines[packageEnd]
    ) {
      currentEnd -= 1;
      packageEnd -= 1;
    }

    const currentMiddle = currentLines.slice(prefix, currentEnd + 1);
    const packageMiddle = packageLines.slice(prefix, packageEnd + 1);
    const matrix = Array.from({ length: currentMiddle.length + 1 }, () =>
      Array(packageMiddle.length + 1).fill(0)
    );

    for (let currentIndex = currentMiddle.length - 1; currentIndex >= 0; currentIndex -= 1) {
      for (let packageIndex = packageMiddle.length - 1; packageIndex >= 0; packageIndex -= 1) {
        if (currentMiddle[currentIndex] === packageMiddle[packageIndex]) {
          matrix[currentIndex][packageIndex] = matrix[currentIndex + 1][packageIndex + 1] + 1;
        } else {
          matrix[currentIndex][packageIndex] = Math.max(
            matrix[currentIndex + 1][packageIndex],
            matrix[currentIndex][packageIndex + 1]
          );
        }
      }
    }

    const ops = [];

    for (let index = 0; index < prefix; index += 1) {
      ops.push({ type: "equal", text: currentLines[index] });
    }

    let currentIndex = 0;
    let packageIndex = 0;
    while (currentIndex < currentMiddle.length && packageIndex < packageMiddle.length) {
      if (currentMiddle[currentIndex] === packageMiddle[packageIndex]) {
        ops.push({ type: "equal", text: currentMiddle[currentIndex] });
        currentIndex += 1;
        packageIndex += 1;
        continue;
      }

      if (matrix[currentIndex + 1][packageIndex] >= matrix[currentIndex][packageIndex + 1]) {
        ops.push({ type: "remove", text: currentMiddle[currentIndex] });
        currentIndex += 1;
      } else {
        ops.push({ type: "add", text: packageMiddle[packageIndex] });
        packageIndex += 1;
      }
    }

    while (currentIndex < currentMiddle.length) {
      ops.push({ type: "remove", text: currentMiddle[currentIndex] });
      currentIndex += 1;
    }

    while (packageIndex < packageMiddle.length) {
      ops.push({ type: "add", text: packageMiddle[packageIndex] });
      packageIndex += 1;
    }

    for (let index = currentEnd + 1; index < currentLines.length; index += 1) {
      ops.push({ type: "equal", text: currentLines[index] });
    }

    let currentLineNumber = 1;
    let packageLineNumber = 1;
    const rows = ops.map((op) => {
      const row = {
        type: op.type,
        text: op.text,
        currentLineNumber: op.type === "add" ? "" : String(currentLineNumber),
        packageLineNumber: op.type === "remove" ? "" : String(packageLineNumber)
      };

      if (op.type !== "add") {
        currentLineNumber += 1;
      }

      if (op.type !== "remove") {
        packageLineNumber += 1;
      }

      return row;
    });

    return { changed: true, rows };
  };

  const createChip = (label, variant = "") => {
    const chip = document.createElement("span");
    chip.className = variant ? `preview-chip ${variant}` : "preview-chip";
    chip.textContent = label;
    return chip;
  };

  const createEmptyPreviewState = (message) => {
    const wrapper = document.createElement("div");
    wrapper.className = "preview-empty muted";
    wrapper.textContent = message;
    return wrapper;
  };

  const createDiffRow = (row) => {
    const line = document.createElement("div");
    line.className = `preview-diff-row ${row.type}`;

    const currentLineNumber = document.createElement("span");
    currentLineNumber.className = "preview-diff-line-number";
    currentLineNumber.textContent = row.currentLineNumber;

    const packageLineNumber = document.createElement("span");
    packageLineNumber.className = "preview-diff-line-number";
    packageLineNumber.textContent = row.packageLineNumber;

    const code = document.createElement("pre");
    code.className = "preview-diff-code";
    code.textContent = row.text.length > 0 ? row.text : " ";

    line.append(currentLineNumber, packageLineNumber, code);
    return line;
  };

  const renderPreviewModal = (preview) => {
    const { body, summary, title } = getPreviewModalElements();
    if (!body || !summary || !title) {
      return;
    }

    title.textContent = `${preview.package.name} v${preview.package.version}`;

    let changedFileCount = 0;
    let toggleChangeCount = 0;
    const targetComparisons = preview.targets.map((target) => {
      const files = SCRIPT_FIELDS.map((field) => {
        const diff = buildLineDiff(
          target.currentScripts?.[field.key] || "",
          preview.packageScripts?.[field.key] || ""
        );
        if (diff.changed) {
          changedFileCount += 1;
        }

        return {
          field,
          diff,
          currentText: target.currentScripts?.[field.key] || "",
          packageText: preview.packageScripts?.[field.key] || ""
        };
      });

      const hasToggleChange = !target.scriptsEnabled;
      if (hasToggleChange) {
        toggleChangeCount += 1;
      }

      return {
        ...target,
        files,
        changedFileCount: files.filter((file) => file.diff.changed).length,
        hasToggleChange
      };
    });

    const targetSummary = describeTargetCount(preview.targetCount, preview.leafCount);
    if (changedFileCount === 0 && toggleChangeCount === 0) {
      summary.textContent = `${formatPackageLabel({ packageName: preview.package.name, packageVersion: preview.package.version })} already matches the current scripts on ${targetSummary}. Reinstalling would rewrite the same content.`;
    } else {
      const fileLabel = changedFileCount === 1 ? "script file" : "script files";
      const toggleLabel = toggleChangeCount === 1 ? "target" : "targets";
      const toggleText =
        toggleChangeCount > 0
          ? ` Scripts will also be enabled on ${toggleChangeCount} ${toggleLabel}.`
          : "";
      summary.textContent = `${formatPackageLabel({ packageName: preview.package.name, packageVersion: preview.package.version })} would update ${changedFileCount} ${fileLabel} across ${targetSummary}.${toggleText}`;
    }

    body.innerHTML = "";

    if (targetComparisons.length === 0) {
      body.append(createEmptyPreviewState("No install targets are available for this scenario."));
      return;
    }

    const targetList = document.createElement("div");
    targetList.className = "preview-target-list";

    for (const target of targetComparisons) {
      const details = document.createElement("details");
      details.className = "preview-target";
      details.open = target.isRoot;

      const summaryRow = document.createElement("summary");

      const summaryContent = document.createElement("div");
      summaryContent.className = "preview-target-summary";

      const targetTitle = document.createElement("div");
      targetTitle.className = "preview-target-title";
      targetTitle.textContent = `${target.title} (${target.shortId})`;

      const targetMeta = document.createElement("div");
      targetMeta.className = "preview-target-meta";
      targetMeta.append(
        createChip(target.isRoot ? "Root target" : "Playable leaf"),
        createChip(
          target.changedFileCount === 0
            ? "No script content changes"
            : `${target.changedFileCount} script file${target.changedFileCount === 1 ? "" : "s"} changed`,
          target.changedFileCount === 0 ? "success" : "warning"
        ),
        createChip(
          target.scriptsEnabled ? "Scripts already enabled" : "Scripts toggle will turn on",
          target.scriptsEnabled ? "success" : "warning"
        )
      );

      summaryContent.append(targetTitle, targetMeta);
      summaryRow.append(summaryContent);

      const content = document.createElement("div");
      content.className = "preview-target-content";

      for (const file of target.files) {
        const fileCard = document.createElement("section");
        fileCard.className = "preview-file";

        const fileHeader = document.createElement("div");
        fileHeader.className = "preview-file-header";

        const fileTitle = document.createElement("div");
        fileTitle.className = "preview-file-title";
        fileTitle.textContent = file.field.label;

        const fileStatus = document.createElement("div");
        fileStatus.className = `preview-file-status ${file.diff.changed ? "changed" : "unchanged"}`;
        fileStatus.textContent = file.diff.changed ? "Changes detected" : "No changes";

        fileHeader.append(fileTitle, fileStatus);
        fileCard.append(fileHeader);

        if (file.diff.changed) {
          const diff = document.createElement("div");
          diff.className = "preview-diff";
          for (const row of file.diff.rows) {
            diff.append(createDiffRow(row));
          }
          fileCard.append(diff);
        } else {
          fileCard.append(createEmptyPreviewState("Current script content already matches the packaged file."));
        }

        content.append(fileCard);
      }

      details.append(summaryRow, content);
      targetList.append(details);
    }

    body.append(targetList);
  };

  const openPreviewModal = () => {
    const { modal } = getPreviewModalElements();
    if (!modal) {
      return;
    }

    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("preview-modal-open");
  };

  const closePreviewModal = () => {
    const { modal } = getPreviewModalElements();
    if (!modal) {
      return;
    }

    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("preview-modal-open");
  };

  const showPreviewLoading = (packageName) => {
    const { body, summary, title } = getPreviewModalElements();
    if (!body || !summary || !title) {
      return;
    }

    title.textContent = `${packageName} Preview`;
    summary.textContent = `Loading current scripts for ${packageName}...`;
    body.innerHTML = "";
    body.append(createEmptyPreviewState("Comparing the current root and playable leaf scripts against the selected package."));
    openPreviewModal();
  };

  const showPreviewError = (message) => {
    const { body, summary, title } = getPreviewModalElements();
    if (!body || !summary || !title) {
      return;
    }

    title.textContent = "Preview unavailable";
    summary.textContent = message;
    body.innerHTML = "";
    body.append(createEmptyPreviewState(message));
    openPreviewModal();
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
    const previewButtons = Array.from(document.querySelectorAll(SELECTORS.previewButton));
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
    const isPreviewing = currentAction?.type === "preview";
    const shouldDisableActions = isBusy || isPreviewing;

    if (installExtensionButton) {
      installExtensionButton.hidden = Boolean(latestStatus?.ok);
    }

    for (const button of previewButtons) {
      const isCurrentAction =
        currentAction?.type === "preview" && currentAction.packageId === button.dataset.packageId;
      button.disabled = !canInstall || shouldDisableActions;
      button.textContent = isCurrentAction ? "Loading Preview..." : "Preview";
    }

    for (const button of installButtons) {
      const isCurrentAction =
        currentAction?.type === "install" && currentAction.packageId === button.dataset.packageId;
      button.disabled = !canInstall || shouldDisableActions;

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
      button.disabled = !canRollback || !hasMatchingRestorePoint || shouldDisableActions;

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

  const previewPackageFromPage = async (button) => {
    const packageId = button.dataset.packageId;
    const packageName = button.dataset.packageName || packageId;

    currentAction = {
      type: "preview",
      packageId
    };
    transientNotice = `Loading preview for ${packageName}...`;
    updateStatusPanel();
    updateActionButtons();
    showPreviewLoading(packageName);

    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.PREVIEW_PACKAGE,
        packageId
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Preview failed.");
      }

      renderPreviewModal(response.preview);
    } catch (error) {
      showPreviewError(error.message);
      transientNotice = error.message;
    } finally {
      currentAction = null;
      updateActionButtons();
      updateStatusPanel();
    }
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
      `Install "${packageName}" to ${scenarioLabel}? This will update ${targetSummary}.`
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
    const closeTarget = event.target.closest(SELECTORS.previewModalClose);
    if (closeTarget) {
      closePreviewModal();
      return;
    }

    const refreshButton = event.target.closest(SELECTORS.refresh);
    if (refreshButton) {
      transientNotice = "Refreshing extension status...";
      refreshExtensionState();
      return;
    }

    const previewButton = event.target.closest(SELECTORS.previewButton);
    if (previewButton) {
      event.preventDefault();

      if (
        !latestStatus?.ok ||
        !latestStatus?.authState?.hasToken ||
        latestStatus?.scenarioState?.status !== "ready"
      ) {
        transientNotice =
          "Open an AI Dungeon scenario edit page and wait for the extension to finish loading the scenario tree before previewing.";
        updateStatusPanel();
        updateActionButtons();
        return;
      }

      previewPackageFromPage(previewButton);
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

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePreviewModal();
    }
  });
  window.addEventListener("focus", refreshExtensionState);
  window.addEventListener("load", refreshExtensionState, { once: true });

  refreshExtensionState();
  setInterval(refreshExtensionState, POLL_MS);
}
})();