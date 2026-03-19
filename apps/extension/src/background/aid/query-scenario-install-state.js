import { gql } from "./gql.js";

const GET_SCENARIO_INSTALL_STATE = `
  query GetScenarioInstallState($shortId: String!, $viewPublished: Boolean) {
    scenario(shortId: $shortId, viewPublished: $viewPublished) {
      shortId
      title
      scriptsEnabled
      state(viewPublished: $viewPublished) {
        scripts {
          sharedLibrary
          onInput
          onModelContext
          onOutput
          __typename
        }
        __typename
      }
      __typename
    }
  }
`;

export const queryScenarioInstallState = async (url, token, shortId) => {
  const data = await gql(url, token, GET_SCENARIO_INSTALL_STATE, {
    shortId,
    viewPublished: false
  });

  return data.scenario;
};