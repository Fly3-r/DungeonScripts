export const DEFAULT_CATALOG_ORIGIN = "http://127.0.0.1:3000";

export const MESSAGE_TYPES = {
  EDITOR_CONTEXT: "EDITOR_CONTEXT",
  GET_STATUS: "GET_STATUS",
  OPEN_CATALOG: "OPEN_CATALOG",
  SET_CATALOG_ORIGIN: "SET_CATALOG_ORIGIN"
};

export const AID_EDITOR_RE =
  /^https:\/\/(?<origin>play\.aidungeon\.com|beta\.aidungeon\.com|alpha\.aidungeon\.com)\/scenario\/(?<shortId>[^/]+)\/[^/]+\/edit(?:[/?#]|$)/i;
