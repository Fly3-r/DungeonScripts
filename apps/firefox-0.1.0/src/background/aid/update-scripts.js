import { gql } from "./gql.js";

const MUTATION = `
  mutation UpdateScenarioScripts($shortId: String, $gameCode: JSONObject) {
    updateScenarioScripts(shortId: $shortId, gameCode: $gameCode) {
      success
      message
      scenario {
        id
        state {
          scripts {
            onInput
            onOutput
            onModelContext
            sharedLibrary
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
  }
`;

export const updateScripts = async (url, token, shortId, gameCode) => {
  const data = await gql(url, token, MUTATION, { shortId, gameCode });
  return data.updateScenarioScripts;
};