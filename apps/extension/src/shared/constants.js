export const DEFAULT_CATALOG_ORIGIN = "https://dungeonscripts.com";

export const SUPPORTED_CATALOG_ORIGINS = [
  DEFAULT_CATALOG_ORIGIN,
  "http://127.0.0.1:3000",
  "http://localhost:3000"
];

export const SUPPORTED_AID_PAGE_ORIGINS = [
  "https://play.aidungeon.com",
  "https://beta.aidungeon.com",
  "https://alpha.aidungeon.com"
];

export const SUPPORTED_AID_API_ORIGINS = [
  "https://api.aidungeon.com",
  "https://api-beta.aidungeon.com",
  "https://api-alpha.aidungeon.com"
];

export const toOriginMatchPattern = (origin) => `${origin}/*`;

export const REQUIRED_HOST_PATTERNS = [
  ...SUPPORTED_AID_PAGE_ORIGINS.map(toOriginMatchPattern),
  ...SUPPORTED_AID_API_ORIGINS.map(toOriginMatchPattern),
  ...SUPPORTED_CATALOG_ORIGINS.map(toOriginMatchPattern)
];

export const MESSAGE_TYPES = {
  EDITOR_CONTEXT: "EDITOR_CONTEXT",
  AUTH_TOKEN_UPDATE: "AUTH_TOKEN_UPDATE",
  AUTH_TOKEN_ERROR: "AUTH_TOKEN_ERROR",
  GET_STATUS: "GET_STATUS",
  GET_PACKAGES: "GET_PACKAGES",
  PREVIEW_PACKAGE: "PREVIEW_PACKAGE",
  INSTALL_PACKAGE: "INSTALL_PACKAGE",
  ROLLBACK_LATEST: "ROLLBACK_LATEST",
  OPEN_CATALOG: "OPEN_CATALOG",
  SET_CATALOG_ORIGIN: "SET_CATALOG_ORIGIN",
  GET_TELEMETRY_STATUS: "GET_TELEMETRY_STATUS",
  SET_TELEMETRY_TEST_MODE: "SET_TELEMETRY_TEST_MODE",
  FLUSH_TELEMETRY_QUEUE: "FLUSH_TELEMETRY_QUEUE"
};

export const AID_EDITOR_RE =
  /^https:\/\/(?<origin>play\.aidungeon\.com|beta\.aidungeon\.com|alpha\.aidungeon\.com)\/scenario\/(?<shortId>[^/]+)\/[^/]+\/edit(?:[/?#]|$)/i;
