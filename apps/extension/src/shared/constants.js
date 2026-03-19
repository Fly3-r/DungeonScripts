export const DEFAULT_CATALOG_ORIGIN = "http://127.0.0.1:3000";

export const MESSAGE_TYPES = {
  EDITOR_CONTEXT: "EDITOR_CONTEXT",
  AUTH_TOKEN_UPDATE: "AUTH_TOKEN_UPDATE",
  AUTH_TOKEN_ERROR: "AUTH_TOKEN_ERROR",
  GET_STATUS: "GET_STATUS",
  GET_PACKAGES: "GET_PACKAGES",
  INSTALL_PACKAGE: "INSTALL_PACKAGE",
  ROLLBACK_LATEST: "ROLLBACK_LATEST",
  OPEN_CATALOG: "OPEN_CATALOG",
  SET_CATALOG_ORIGIN: "SET_CATALOG_ORIGIN"
};

export const AID_EDITOR_RE =
  /^https:\/\/(?<origin>play\.aidungeon\.com|beta\.aidungeon\.com|alpha\.aidungeon\.com)\/scenario\/(?<shortId>[^/]+)\/[^/]+\/edit(?:[/?#]|$)/i;