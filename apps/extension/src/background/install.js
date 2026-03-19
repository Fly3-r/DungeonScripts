import { getAidGraphqlUrl } from "./aid/constants.js";
import { queryScenarioInstallState } from "./aid/query-scenario-install-state.js";
import { updateScenario } from "./aid/update-scenario.js";
import { updateScripts } from "./aid/update-scripts.js";

const toGameCode = (scripts) => ({
  sharedLibrary: scripts?.sharedLibrary || "",
  onInput: scripts?.onInput || "",
  onModelContext: scripts?.onModelContext || "",
  onOutput: scripts?.onOutput || ""
});

const toScenarioTarget = ({ shortId, title }) => ({
  shortId,
  title: title || "Untitled"
});

const addUniqueTarget = (targets, seen, scenario) => {
  if (!scenario?.shortId || seen.has(scenario.shortId)) {
    return;
  }

  seen.add(scenario.shortId);
  targets.push(toScenarioTarget(scenario));
};

const getRestoreTargets = (restorePoint) => {
  if (Array.isArray(restorePoint?.targets) && restorePoint.targets.length > 0) {
    return restorePoint.targets;
  }

  if (Array.isArray(restorePoint?.leaves) && restorePoint.leaves.length > 0) {
    return restorePoint.leaves;
  }

  return [];
};

export const buildInstallTargets = (scenarioState) => {
  const targets = [];
  const seen = new Set();

  addUniqueTarget(targets, seen, {
    shortId: scenarioState?.rootShortId,
    title: scenarioState?.rootTitle
  });

  for (const leaf of scenarioState?.leaves || []) {
    addUniqueTarget(targets, seen, leaf);
  }

  return targets;
};

export const createRestorePoint = async ({ token, origin, scenarioState, pkg, targets }) => {
  const url = getAidGraphqlUrl(origin);
  const installTargets = Array.isArray(targets) ? targets : buildInstallTargets(scenarioState);
  const snapshots = [];

  for (const target of installTargets) {
    const scenario = await queryScenarioInstallState(url, token, target.shortId);
    snapshots.push({
      shortId: scenario.shortId,
      title: scenario.title || target.title || "Untitled",
      scriptsEnabled: !!scenario.scriptsEnabled,
      gameCode: toGameCode(scenario.state?.scripts)
    });
  }

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    origin,
    rootShortId: scenarioState.rootShortId,
    rootTitle: scenarioState.rootTitle,
    packageId: pkg.id,
    packageName: pkg.name,
    packageVersion: pkg.version,
    leafCount: Number.isInteger(scenarioState?.leafCount)
      ? scenarioState.leafCount
      : installTargets.length,
    targetCount: snapshots.length,
    targets: snapshots
  };
};

export const installPackageToTargets = async ({ token, origin, targets, pkg }) => {
  const url = getAidGraphqlUrl(origin);
  const gameCode = {
    sharedLibrary: pkg.sharedLibrary,
    onInput: pkg.onInput,
    onModelContext: pkg.onModelContext,
    onOutput: pkg.onOutput
  };

  let appliedCount = 0;

  for (const target of targets) {
    const updateScenarioResult = await updateScenario(url, token, {
      shortId: target.shortId,
      scriptsEnabled: true
    });

    if (!updateScenarioResult.success) {
      throw new Error(
        updateScenarioResult.message || `Failed to enable scripts on ${target.shortId}.`
      );
    }

    const updateScriptsResult = await updateScripts(url, token, target.shortId, gameCode);
    if (!updateScriptsResult.success) {
      throw new Error(
        updateScriptsResult.message || `Failed to update scripts on ${target.shortId}.`
      );
    }

    appliedCount += 1;
  }

  return { appliedCount };
};

export const restoreFromPoint = async ({ token, restorePoint }) => {
  const url = getAidGraphqlUrl(restorePoint.origin);
  const targets = getRestoreTargets(restorePoint);
  let restoredCount = 0;

  for (const target of targets) {
    const enableResult = await updateScenario(url, token, {
      shortId: target.shortId,
      scriptsEnabled: true
    });

    if (!enableResult.success) {
      throw new Error(enableResult.message || `Failed to prepare restore for ${target.shortId}.`);
    }

    const scriptsResult = await updateScripts(url, token, target.shortId, target.gameCode);
    if (!scriptsResult.success) {
      throw new Error(scriptsResult.message || `Failed to restore scripts for ${target.shortId}.`);
    }

    const finalToggleResult = await updateScenario(url, token, {
      shortId: target.shortId,
      scriptsEnabled: !!target.scriptsEnabled
    });

    if (!finalToggleResult.success) {
      throw new Error(finalToggleResult.message || `Failed to restore toggle for ${target.shortId}.`);
    }

    restoredCount += 1;
  }

  return { restoredCount };
};
