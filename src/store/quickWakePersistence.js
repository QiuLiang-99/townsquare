import {
  PRESETS_STORAGE_KEY,
  historyStorageKey,
  normalizeText,
} from "../logic/quickWake";

function safeGet(storage, key, fallback, onError = () => {}) {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null ? fallback : parsed;
  } catch (error) {
    onError();
    return fallback;
  }
}

function safeSet(storage, key, value) {
  if (!storage) return "";
  try {
    storage.setItem(key, JSON.stringify(value));
    return "";
  } catch (error) {
    return "浏览器存储不可用，本次会话仍可继续使用快捷唤醒。";
  }
}

function safeRemove(storage, key) {
  if (!storage) return "";
  try {
    storage.removeItem(key);
    return "";
  } catch (error) {
    return "浏览器存储不可用，本次会话仍可继续使用快捷唤醒。";
  }
}

export default (store) => {
  let storage;
  try {
    storage = window.localStorage;
    // Safari 私密模式等场景可能在访问时才抛错。
    const probe = "__quickWakeProbe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
  } catch (error) {
    storage = null;
  }

  const reportReadError = () =>
    store.commit(
      "quickWake/setStorageError",
      "浏览器存储读取失败，本次会话仍可继续使用快捷唤醒。",
    );
  if (!storage) {
    store.commit(
      "quickWake/setStorageError",
      "浏览器存储不可用，本次会话仍可继续使用快捷唤醒。",
    );
  } else {
    const presets = safeGet(storage, PRESETS_STORAGE_KEY, [], reportReadError);
    if (Array.isArray(presets)) {
      store.commit(
        "quickWake/setPresets",
        presets.map((item) => normalizeText(item, 500)).filter(Boolean),
      );
    }
  }

  let lastContextKey = "";
  const loadContext = () => {
    const { sessionId, playerId } = store.state.session;
    if (!sessionId || !playerId) {
      store.commit("quickWake/resetSession");
      if (store.state.modals.directedWake)
        store.commit("toggleModal", "directedWake");
      if (store.state.modals.playerWake)
        store.commit("toggleModal", "playerWake");
      lastContextKey = "";
      return;
    }
    store.commit("quickWake/setContext", { roomId: sessionId, playerId });
    const key = `${sessionId}:${playerId}`;
    if (key === lastContextKey) return;
    if (lastContextKey) {
      if (store.state.modals.directedWake)
        store.commit("toggleModal", "directedWake");
      if (store.state.modals.playerWake)
        store.commit("toggleModal", "playerWake");
    }
    lastContextKey = key;
    const memory = {
      messages: store.state.quickWake.messagesByKey[key] || [],
      outbox: [],
    };
    const saved = safeGet(
      storage,
      historyStorageKey(sessionId, playerId),
      memory,
      reportReadError,
    );
    store.commit("quickWake/hydrateContext", {
      messages: Array.isArray(saved.messages) ? saved.messages : [],
      outbox: Array.isArray(saved.outbox) ? saved.outbox : [],
    });
  };

  loadContext();

  store.subscribe(({ type }, state) => {
    if (type === "quickWake/setStorageError") return;
    if (type === "session/setSessionId" || type === "session/setPlayerId") {
      loadContext();
      return;
    }
    if (
      type !== "quickWake/setContext" &&
      type !== "quickWake/hydrateContext" &&
      !type.startsWith("quickWake/")
    ) {
      return;
    }
    // setContext 只是切换内存键；此时尚未读取该键的历史，不能先用空数组覆盖存储。
    if (type === "quickWake/setContext") return;
    if (
      type === "quickWake/setPresets" ||
      type === "quickWake/addPreset" ||
      type === "quickWake/removePreset"
    ) {
      const error = safeSet(
        storage,
        PRESETS_STORAGE_KEY,
        state.quickWake.presets,
      );
      if (error) store.commit("quickWake/setStorageError", error);
      return;
    }
    const roomId = state.quickWake.context.roomId;
    const playerId = state.quickWake.context.playerId;
    if (!roomId || !playerId) {
      return;
    }
    if (!storage) return;
    const key = `${roomId}:${playerId}`;
    const messages = state.quickWake.messagesByKey[key] || [];
    const error =
      messages.length || state.quickWake.outbox.length
        ? safeSet(storage, historyStorageKey(roomId, playerId), {
            messages,
            outbox: state.quickWake.outbox,
          })
        : safeRemove(storage, historyStorageKey(roomId, playerId));
    if (error) store.commit("quickWake/setStorageError", error);
  });
};
