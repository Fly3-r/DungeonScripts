import { getAidGraphqlUrl } from "./constants.js";
import { queryScenario } from "./query-scenario.js";

export const discoverScenarioLeaves = async ({ token, origin, rootShortId }) => {
  const url = getAidGraphqlUrl(origin);
  const visited = new Set();
  const leaves = [];
  let branchCount = 0;
  let rootTitle = null;

  const walk = async (shortId) => {
    if (visited.has(shortId)) {
      return;
    }

    visited.add(shortId);
    const scenario = await queryScenario(url, token, shortId);
    branchCount += 1;

    if (shortId === rootShortId) {
      rootTitle = scenario.title || "Untitled";
    }

    const children = (scenario.options || []).filter(
      (option) =>
        option.shortId !== shortId &&
        !option.deletedAt &&
        option.parentScenarioId === scenario.id
    );

    if (children.length === 0) {
      leaves.push({
        shortId,
        title: scenario.title || "Untitled"
      });
      return;
    }

    for (const child of children) {
      await walk(child.shortId);
    }
  };

  await walk(rootShortId);

  return {
    rootShortId,
    rootTitle: rootTitle || "Untitled",
    branchCount,
    leafCount: leaves.length,
    leaves
  };
};