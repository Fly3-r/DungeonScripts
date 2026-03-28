(() => {
const extensionApi = globalThis.browser ?? globalThis.chrome;
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
  previewBody: "#preview-modal-body",
  installModal: "[data-oneclick-install-modal]",
  installModalClose: "[data-oneclick-install-close]",
  installTitle: "#install-modal-title",
  installSummary: "#install-modal-summary",
  installSelectionSummary: "#install-modal-selection-summary",
  installBody: "#install-modal-body",
  installConfirm: "[data-oneclick-install-confirm]",
  installTargetCheckbox: "[data-oneclick-target-checkbox]"
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
  let currentInstallDraft = null;

  const getPageCatalogOrigin = () => window.location.origin;

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

  const getInstallModalElements = () => ({
    modal: document.querySelector(SELECTORS.installModal),
    title: document.querySelector(SELECTORS.installTitle),
    summary: document.querySelector(SELECTORS.installSummary),
    selectionSummary: document.querySelector(SELECTORS.installSelectionSummary),
    body: document.querySelector(SELECTORS.installBody),
    confirm: document.querySelector(SELECTORS.installConfirm)
  });

  const getScenarioTargets = (scenarioState) => {
    const targets = [];
    const seen = new Set();
    const addTarget = (shortId, title, isRoot) => {
      if (!shortId || seen.has(shortId)) {
        return;
      }

      seen.add(shortId);
      targets.push({
        shortId,
        title: title || "Untitled",
        isRoot
      });
    };

    addTarget(scenarioState?.rootShortId, scenarioState?.rootTitle, true);
    for (const leaf of scenarioState?.leaves || []) {
      addTarget(leaf.shortId, leaf.title, false);
    }

    return targets;
  };

  const countLeafTargets = (targets) => targets.filter((target) => !target.isRoot).length;

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

  const syncModalBodyLock = () => {
    const previewModal = document.querySelector(SELECTORS.previewModal);
    const installModal = document.querySelector(SELECTORS.installModal);
    const hasOpenModal =
      (previewModal && !previewModal.hidden) || (installModal && !installModal.hidden);

    document.body.classList.toggle("preview-modal-open", !!hasOpenModal);
  };

  const setModalVisibility = (modal, isOpen) => {
    if (!modal) {
      return;
    }

    modal.hidden = !isOpen;
    modal.setAttribute("aria-hidden", isOpen ? "false" : "true");
    syncModalBodyLock();
  };

  const openPreviewModal = () => {
    const { modal } = getPreviewModalElements();
    setModalVisibility(modal, true);
  };

  const closePreviewModal = () => {
    const { modal } = getPreviewModalElements();
    setModalVisibility(modal, false);
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

  const getSelectedInstallTargets = () => {
    if (!currentInstallDraft) {
      return [];
    }

    const { body } = getInstallModalElements();
    if (!body) {
      return [];
    }

    const selectedTargetIds = new Set(
      Array.from(body.querySelectorAll(SELECTORS.installTargetCheckbox))
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => checkbox.dataset.targetShortId)
    );

    return currentInstallDraft.targets.filter((target) => selectedTargetIds.has(target.shortId));
  };

  const syncInstallModalSelection = () => {
    const { selectionSummary, confirm } = getInstallModalElements();
    const selectedTargets = getSelectedInstallTargets();
    const selectedLeafCount = countLeafTargets(selectedTargets);
    const isInstalling = currentAction?.type === "install";

    if (selectionSummary) {
      if (selectedTargets.length === 0) {
        selectionSummary.textContent =
          "Select at least one root or playable leaf before installing.";
      } else {
        selectionSummary.textContent =
          `Selected ${describeTargetCount(selectedTargets.length, selectedLeafCount)}. ` +
          "All targets start checked so you can leave branches untouched when you want different scripts on them.";
      }
    }

    if (confirm) {
      confirm.disabled = selectedTargets.length === 0 || isInstalling;
      confirm.textContent = isInstalling
        ? "Installing..."
        : `Install Selected (${selectedTargets.length})`;
    }
  };

  const createInstallTargetRow = (target) => {
    const row = document.createElement("label");
    row.className = "install-target-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "install-target-checkbox";
    checkbox.dataset.oneclickTargetCheckbox = "true";
    checkbox.dataset.targetShortId = target.shortId;
    checkbox.checked = true;

    const copy = document.createElement("div");
    copy.className = "install-target-copy";

    const title = document.createElement("div");
    title.className = "install-target-title";
    title.textContent = `${target.title} (${target.shortId})`;

    const meta = document.createElement("div");
    meta.className = "install-target-meta";
    meta.append(
      createChip(target.isRoot ? "Root target" : "Playable leaf"),
      createChip(target.shortId)
    );

    copy.append(title, meta);
    row.append(checkbox, copy);
    return row;
  };

  const renderInstallModal = (draft) => {
    const { body, summary, title } = getInstallModalElements();
    if (!body || !summary || !title) {
      return;
    }

    title.textContent = `Install ${draft.packageName}`;
    summary.textContent =
      `Choose which scenario targets to update for ${draft.scenarioLabel}. ` +
      "Each target starts checked by default.";

    body.innerHTML = "";

    if (draft.targets.length === 0) {
      body.append(createEmptyPreviewState("No scenario targets are available for this install."));
      syncInstallModalSelection();
      return;
    }

    const list = document.createElement("div");
    list.className = "install-target-list";

    for (const target of draft.targets) {
      list.append(createInstallTargetRow(target));
    }

    body.append(list);
    syncInstallModalSelection();
  };

  const openInstallModal = (draft) => {
    currentInstallDraft = draft;
    renderInstallModal(draft);

    const { modal } = getInstallModalElements();
    setModalVisibility(modal, true);
    updateActionButtons();
  };

  const closeInstallModal = () => {
    currentInstallDraft = null;

    const { modal } = getInstallModalElements();
    setModalVisibility(modal, false);
    updateActionButtons();
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
      getScenarioTargetCount(latestStatus?.scenarioState) > 0;
    const canRollback = latestStatus?.ok && latestStatus?.authState?.hasToken;
    const isBusy =
      latestStatus?.installState?.status === "loading" ||
      latestStatus?.installState?.status === "rolling_back";
    const isPreviewing = currentAction?.type === "preview";
    const isInstallModalOpen = !!currentInstallDraft;
    const shouldDisableActions = isBusy || isPreviewing || isInstallModalOpen;

    if (installExtensionButton) {
      installExtensionButton.hidden = true;
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

      button.textContent = canInstall ? "Install" : "Open AI Dungeon Edit Page";
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

    syncInstallModalSelection();
  };

  const refreshExtensionState = async () => {
    try {
      const response = await extensionApi.runtime.sendMessage({
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
      const response = await extensionApi.runtime.sendMessage({
        type: MESSAGE_TYPES.PREVIEW_PACKAGE,
        packageId,
        catalogOrigin: getPageCatalogOrigin()
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
    const targets = getScenarioTargets(scenarioState);

    if (targets.length === 0) {
      transientNotice = "No scenario targets are currently available for this install.";
      updateStatusPanel();
      updateActionButtons();
      return;
    }

    const scenarioLabel = formatScenarioLabel({
      rootTitle: scenarioState?.rootTitle,
      rootShortId: scenarioState?.rootShortId
    });

    openInstallModal({
      packageId,
      packageName,
      catalogOrigin: getPageCatalogOrigin(),
      scenarioLabel,
      targets
    });

    transientNotice = `Choose where ${packageName} should be installed under ${scenarioLabel}.`;
    updateStatusPanel();
  };

  const confirmInstallFromModal = async () => {
    if (!currentInstallDraft) {
      return;
    }

    const draft = currentInstallDraft;
    const selectedTargets = getSelectedInstallTargets();
    if (selectedTargets.length === 0) {
      syncInstallModalSelection();
      return;
    }

    const selectedTargetIds = selectedTargets.map((target) => target.shortId);
    const targetSummary = describeTargetCount(
      selectedTargets.length,
      countLeafTargets(selectedTargets)
    );

    closeInstallModal();
    currentAction = {
      type: "install",
      packageId: draft.packageId
    };
    transientNotice = `Installing ${draft.packageName} to ${targetSummary} under ${draft.scenarioLabel}...`;
    updateStatusPanel();
    updateActionButtons();

    try {
      const response = await extensionApi.runtime.sendMessage({
        type: MESSAGE_TYPES.INSTALL_PACKAGE,
        packageId: draft.packageId,
        targetShortIds: selectedTargetIds,
        catalogOrigin: draft.catalogOrigin
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Install failed.");
      }

      transientNotice =
        `Install complete. ${draft.packageName} applied to ` +
        `${describeTargetCount(response.installState?.appliedCount || 0)}.`;
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
      const response = await extensionApi.runtime.sendMessage({
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
    const previewCloseTarget = event.target.closest(SELECTORS.previewModalClose);
    if (previewCloseTarget) {
      closePreviewModal();
      return;
    }

    const installCloseTarget = event.target.closest(SELECTORS.installModalClose);
    if (installCloseTarget) {
      closeInstallModal();
      return;
    }

    const installConfirmButton = event.target.closest(SELECTORS.installConfirm);
    if (installConfirmButton) {
      event.preventDefault();
      confirmInstallFromModal();
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


  document.addEventListener("change", (event) => {
    if (event.target.closest(SELECTORS.installTargetCheckbox)) {
      syncInstallModalSelection();
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePreviewModal();
      closeInstallModal();
    }
  });
  window.addEventListener("focus", refreshExtensionState);
  window.addEventListener("load", refreshExtensionState, { once: true });

  refreshExtensionState();
  setInterval(refreshExtensionState, POLL_MS);
}
})();
