(() => {
  const extensionApi = globalThis.browser ?? globalThis.chrome;
  const CONTENT_FLAG = "__aidOneClickContentReady";
  if (globalThis[CONTENT_FLAG]) {
    return;
  }

  globalThis[CONTENT_FLAG] = true;

  const MESSAGE_TYPES = {
    EDITOR_CONTEXT: "EDITOR_CONTEXT",
    AUTH_TOKEN_UPDATE: "AUTH_TOKEN_UPDATE",
    AUTH_TOKEN_ERROR: "AUTH_TOKEN_ERROR"
  };

  const AID_EDITOR_RE =
    /^https:\/\/(?<origin>play\.aidungeon\.com|beta\.aidungeon\.com|alpha\.aidungeon\.com)\/scenario\/(?<shortId>[^/]+)\/[^/]+\/edit(?:[/?#]|$)/i;

  const TOKEN_MESSAGE_TYPES = {
    SUCCESS: "AID_ONECLICK_TOKEN",
    ERROR: "AID_ONECLICK_TOKEN_ERROR"
  };

  const TOKEN_REFRESH_MS = 7 * 60 * 1000;
  const TOKEN_RETRY_MS = 15000;
  const URL_POLL_MS = 1000;
  const FIREBASE_INIT_DELAY_MS = 3000;
  const TOKEN_TIMEOUT_MS = 15000;

  let lastUrl = "";
  let isExtractingToken = false;
  let runtimeActive = true;
  let editorIntervalId = null;
  let tokenIntervalId = null;
  let tokenRetryTimeoutId = null;

  const isContextInvalidatedError = (error) =>
    String(error?.message || error || "").includes("Extension context invalidated");

  const buildPayload = () => {
    const match = window.location.href.match(AID_EDITOR_RE);

    if (!match?.groups) {
      return {
        isEditor: false,
        url: window.location.href,
        origin: window.location.hostname,
        rootShortId: null
      };
    }

    return {
      isEditor: true,
      url: window.location.href,
      origin: match.groups.origin,
      rootShortId: match.groups.shortId
    };
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      syncVisibleState();
    }
  };

  const deactivateRuntime = () => {
    if (!runtimeActive) {
      return;
    }

    runtimeActive = false;

    if (editorIntervalId) {
      clearInterval(editorIntervalId);
      editorIntervalId = null;
    }

    if (tokenIntervalId) {
      clearInterval(tokenIntervalId);
      tokenIntervalId = null;
    }

    if (tokenRetryTimeoutId) {
      clearTimeout(tokenRetryTimeoutId);
      tokenRetryTimeoutId = null;
    }

    window.removeEventListener("focus", syncVisibleState);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };

  const callRuntime = async (callback) => {
    if (!runtimeActive) {
      return null;
    }

    try {
      return await callback();
    } catch (error) {
      if (isContextInvalidatedError(error)) {
        deactivateRuntime();
        return null;
      }

      throw error;
    }
  };

  const sendRuntimeMessage = async (message) =>
    callRuntime(() => extensionApi.runtime.sendMessage(message));

  const getInjectScriptUrl = () => {
    if (!runtimeActive) {
      return null;
    }

    try {
      return extensionApi.runtime.getURL("src/content/inject.js");
    } catch (error) {
      if (isContextInvalidatedError(error)) {
        deactivateRuntime();
        return null;
      }

      throw error;
    }
  };

  const extractToken = () =>
    new Promise((resolve, reject) => {
      let settled = false;
      let timer = null;

      const finish = (callback, value) => {
        if (settled) {
          return;
        }

        settled = true;
        if (timer) {
          clearTimeout(timer);
        }
        window.removeEventListener("message", handler);
        callback(value);
      };

      const handler = (event) => {
        if (event.source !== window) {
          return;
        }

        if (event.data?.type === TOKEN_MESSAGE_TYPES.SUCCESS) {
          finish(resolve, event.data.token);
          return;
        }

        if (event.data?.type === TOKEN_MESSAGE_TYPES.ERROR) {
          finish(reject, new Error(event.data.error || "Token extraction failed."));
        }
      };

      const scriptUrl = getInjectScriptUrl();
      if (!scriptUrl) {
        finish(reject, new Error("Extension context invalidated."));
        return;
      }

      if (!document.documentElement) {
        finish(reject, new Error("Document root is unavailable."));
        return;
      }

      window.addEventListener("message", handler);

      const script = document.createElement("script");
      script.src = scriptUrl;
      script.onload = () => script.remove();
      script.onerror = () => {
        finish(reject, new Error("Failed to load inject script."));
      };

      document.documentElement.appendChild(script);

      timer = setTimeout(() => {
        finish(reject, new Error("Token extraction timeout."));
      }, TOKEN_TIMEOUT_MS);
    });

  const clearTokenRetry = () => {
    if (!tokenRetryTimeoutId) {
      return;
    }

    clearTimeout(tokenRetryTimeoutId);
    tokenRetryTimeoutId = null;
  };

  const scheduleTokenRetry = () => {
    if (!runtimeActive || tokenRetryTimeoutId) {
      return;
    }

    tokenRetryTimeoutId = window.setTimeout(() => {
      tokenRetryTimeoutId = null;
      void syncToken();
    }, TOKEN_RETRY_MS);
  };

  const syncToken = async () => {
    if (!runtimeActive || isExtractingToken) {
      return;
    }

    isExtractingToken = true;

    try {
      const token = await extractToken();
      clearTokenRetry();
      await sendRuntimeMessage({
        type: MESSAGE_TYPES.AUTH_TOKEN_UPDATE,
        payload: {
          token,
          origin: window.location.hostname
        }
      });
    } catch (error) {
      if (isContextInvalidatedError(error)) {
        deactivateRuntime();
        return;
      }

      await sendRuntimeMessage({
        type: MESSAGE_TYPES.AUTH_TOKEN_ERROR,
        payload: {
          origin: window.location.hostname,
          error: error.message
        }
      });
      scheduleTokenRetry();
    } finally {
      isExtractingToken = false;
    }
  };

  const syncEditorContext = async () => {
    if (!runtimeActive || window.location.href === lastUrl) {
      return;
    }

    lastUrl = window.location.href;
    await sendRuntimeMessage({
      type: MESSAGE_TYPES.EDITOR_CONTEXT,
      payload: buildPayload()
    });
  };

  const syncVisibleState = () => {
    void syncEditorContext();
    void syncToken();
  };

  const init = async () => {
    await new Promise((resolve) => {
      if (document.readyState === "complete") {
        resolve();
      } else {
        window.addEventListener("load", resolve, { once: true });
      }
    });

    if (!runtimeActive) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, FIREBASE_INIT_DELAY_MS));
    await syncEditorContext();
    await syncToken();
    editorIntervalId = window.setInterval(() => {
      void syncEditorContext();
    }, URL_POLL_MS);
    tokenIntervalId = window.setInterval(() => {
      void syncToken();
    }, TOKEN_REFRESH_MS);
    window.addEventListener("focus", syncVisibleState);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  };

  init().catch((error) => {
    if (isContextInvalidatedError(error)) {
      deactivateRuntime();
      return;
    }

    console.warn("[dungeonscripts-content] init failed", error);
  });
})();


