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
const URL_POLL_MS = 1000;
const FIREBASE_INIT_DELAY_MS = 3000;
const TOKEN_TIMEOUT_MS = 10000;

let lastUrl = "";
let isExtractingToken = false;

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

    window.addEventListener("message", handler);

    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("src/content/inject.js");
    script.onload = () => script.remove();
    script.onerror = () => {
      finish(reject, new Error("Failed to load inject script."));
    };

    document.documentElement.appendChild(script);

    timer = setTimeout(() => {
      finish(reject, new Error("Token extraction timeout."));
    }, TOKEN_TIMEOUT_MS);
  });

const syncToken = async () => {
  if (isExtractingToken) {
    return;
  }

  isExtractingToken = true;

  try {
    const token = await extractToken();
    await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.AUTH_TOKEN_UPDATE,
      payload: {
        token,
        origin: window.location.hostname
      }
    });
  } catch (error) {
    await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.AUTH_TOKEN_ERROR,
      payload: {
        origin: window.location.hostname,
        error: error.message
      }
    });
  } finally {
    isExtractingToken = false;
  }
};

const syncEditorContext = async () => {
  if (window.location.href === lastUrl) {
    return;
  }

  lastUrl = window.location.href;
  await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.EDITOR_CONTEXT,
    payload: buildPayload()
  });
};

const syncVisibleState = () => {
  syncEditorContext();
  syncToken();
};

const init = async () => {
  await new Promise((resolve) => {
    if (document.readyState === "complete") {
      resolve();
    } else {
      window.addEventListener("load", resolve, { once: true });
    }
  });

  await new Promise((resolve) => setTimeout(resolve, FIREBASE_INIT_DELAY_MS));
  await syncEditorContext();
  await syncToken();
  setInterval(syncEditorContext, URL_POLL_MS);
  setInterval(syncToken, TOKEN_REFRESH_MS);
  window.addEventListener("focus", syncVisibleState);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      syncVisibleState();
    }
  });
};

init();