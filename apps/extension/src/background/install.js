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

export const createRestorePoint = async ({ token, origin, scenarioState, pkg }) => {
  const url = getAidGraphqlUrl(origin);
  const leaves = [];

  for (const leaf of scenarioState.leaves || []) {
    const scenario = await queryScenarioInstallState(url, token, leaf.shortId);
    leaves.push({
      shortId: scenario.shortId,
      title: scenario.title || leaf.title || "Untitled",
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
    leafCount: leaves.length,
    leaves
  };
};

export const installPackageToLeaves = async ({ token, origin, leaves, pkg }) => {
  const url = getAidGraphqlUrl(origin);
  const gameCode = {
    sharedLibrary: pkg.sharedLibrary,
    onInput: pkg.onInput,
    onModelContext: pkg.onModelContext,
    onOutput: pkg.onOutput
  };

  let appliedCount = 0;

  for (const leaf of leaves) {
    const updateScenarioResult = await updateScenario(url, token, {
      shortId: leaf.shortId,
      scriptsEnabled: true
    });

    if (!updateScenarioResult.success) {
      throw new Error(updateScenarioResult.message || `Failed to enable scripts on ${leaf.shortId}.`);
    }

    const updateScriptsResult = await updateScripts(url, token, leaf.shortId, gameCode);
    if (!updateScriptsResult.success) {
      throw new Error(updateScriptsResult.message || `Failed to update scripts on ${leaf.shortId}.`);
    }

    appliedCount += 1;
  }

  return { appliedCount };
};

export const restoreFromPoint = async ({ token, restorePoint }) => {
  const url = getAidGraphqlUrl(restorePoint.origin);
  let restoredCount = 0;

  for (const leaf of restorePoint.leaves || []) {
    const enableResult = await updateScenario(url, token, {
      shortId: leaf.shortId,
      scriptsEnabled: true
    });

    if (!enableResult.success) {
      throw new Error(enableResult.message || `Failed to prepare restore for ${leaf.shortId}.`);
    }

    const scriptsResult = await updateScripts(url, token, leaf.shortId, leaf.gameCode);
    if (!scriptsResult.success) {
      throw new Error(scriptsResult.message || `Failed to restore scripts for ${leaf.shortId}.`);
    }

    const finalToggleResult = await updateScenario(url, token, {
      shortId: leaf.shortId,
      scriptsEnabled: !!leaf.scriptsEnabled
    });

    if (!finalToggleResult.success) {
      throw new Error(finalToggleResult.message || `Failed to restore toggle for ${leaf.shortId}.`);
    }

    restoredCount += 1;
  }

  return { restoredCount };
};