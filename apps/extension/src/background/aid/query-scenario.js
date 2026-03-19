import { gql } from "./gql.js";

const GET_SCENARIO = `
  query GetScenario($shortId: String, $viewPublished: Boolean) {
    scenario(shortId: $shortId, viewPublished: $viewPublished) {
      id
      shortId
      title
      options(viewPublished: $viewPublished) {
        id
        shortId
        title
        parentScenarioId
        deletedAt
        __typename
      }
      __typename
    }
  }
`;

export const queryScenario = async (url, token, shortId) => {
  const data = await gql(url, token, GET_SCENARIO, {
    shortId,
    viewPublished: false
  });

  return data.scenario;
};