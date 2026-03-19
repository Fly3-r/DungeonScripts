const MESSAGE_TYPES = {
  EDITOR_CONTEXT: "EDITOR_CONTEXT"
};

const AID_EDITOR_RE =
  /^https:\/\/(?<origin>play\.aidungeon\.com|beta\.aidungeon\.com|alpha\.aidungeon\.com)\/scenario\/(?<shortId>[^/]+)\/[^/]+\/edit(?:[/?#]|$)/i;

let lastUrl = "";

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

const init = async () => {
  await syncEditorContext();
  setInterval(syncEditorContext, 1000);
  window.addEventListener("focus", syncEditorContext);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      syncEditorContext();
    }
  });
};

init();
