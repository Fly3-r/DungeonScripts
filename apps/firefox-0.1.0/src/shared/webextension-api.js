const extensionApi = globalThis.browser ?? globalThis.chrome;

if (!extensionApi) {
  throw new Error("WebExtension APIs are not available in this context.");
}

export { extensionApi };
