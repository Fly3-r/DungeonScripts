import { gql } from "./gql.js";

const MUTATION = `
  mutation UpdateOption($input: ScenarioInput) {
    updateScenario(input: $input) {
      scenario {
        id
        shortId
      }
      message
      success
      __typename
    }
  }
`;

export const updateScenario = async (url, token, input) => {
  const data = await gql(url, token, MUTATION, { input });
  return data.updateScenario;
};