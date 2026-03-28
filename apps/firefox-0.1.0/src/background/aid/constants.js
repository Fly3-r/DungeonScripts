const AID_API_MAP = {
  "play.aidungeon.com": "api.aidungeon.com",
  "beta.aidungeon.com": "api-beta.aidungeon.com",
  "alpha.aidungeon.com": "api-alpha.aidungeon.com"
};

export const getAidGraphqlUrl = (origin) => {
  const apiHost = AID_API_MAP[origin] || "api.aidungeon.com";
  return `https://${apiHost}/graphql`;
};