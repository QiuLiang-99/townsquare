import {
  addPresetToList,
  addUniqueMessage,
  isPendingForPlayer,
  normalizeText,
  copyPhase,
  pendingMessagesForPlayer,
  removePresetAt,
} from "../../logic/quickWake";

const STATUS_RANK = {
  sending: 0,
  accepted: 1,
  delivered: 2,
  replied: 3,
  failed: -1,
};

function currentKey(state) {
  const roomId = state.context && state.context.roomId;
  const playerId = state.context && state.context.playerId;
  return roomId && playerId ? `${roomId}:${playerId}` : "";
}

function currentMessages(state) {
  const key = currentKey(state);
  return key ? state.messagesByKey[key] || [] : [];
}

function setCurrentMessages(state, messages) {
  const key = currentKey(state);
  if (!key) return;
  state.messagesByKey = {
    ...state.messagesByKey,
    [key]: messages,
  };
}

function findMessage(state, wakeId) {
  return currentMessages(state).find((message) => message.id === wakeId);
}

function updateMessage(state, wakeId, updater) {
  setCurrentMessages(
    state,
    currentMessages(state).map((message) => {
      if (!message || message.id !== wakeId) return message;
      return updater(message);
    }),
  );
}

function mergeStatus(message, status) {
  if (!status) return message.status;
  const currentRank = STATUS_RANK[message.status] || 0;
  const nextRank = STATUS_RANK[status] || 0;
  if (nextRank >= currentRank) return status;
  return message.status;
}

function removeOutboxItem(state, id, kind) {
  state.outbox = state.outbox.filter((item) => {
    if (!item) return false;
    if (item.id !== id) return true;
    return kind ? item.kind !== kind : false;
  });
}

export default {
  namespaced: true,
  state: () => ({
    context: {
      roomId: "",
      playerId: "",
    },
    presets: [],
    messagesByKey: {},
    outbox: [],
    activeTarget: null,
    forceReply: false,
    storageError: "",
    notice: "",
    incomingSignal: 0,
    connected: false,
    hostOnline: false,
    onlinePlayerIds: [],
    incomingSequence: 1,
  }),
  getters: {
    currentMessages(state) {
      return currentMessages(state);
    },
    pendingForMe(state) {
      const playerId = state.context.playerId;
      return pendingMessagesForPlayer(currentMessages(state), playerId);
    },
    sentForTarget: (state) => (targetPlayerId) =>
      currentMessages(state)
        .filter(
          (message) =>
            message.direction === "outgoing" &&
            message.targetPlayerId === targetPlayerId,
        )
        .sort((a, b) => {
          const at = Date.parse(a.createdAt) || 0;
          const bt = Date.parse(b.createdAt) || 0;
          return at - bt || String(a.id).localeCompare(String(b.id));
        }),
    pendingCount(state) {
      const playerId = state.context.playerId;
      return currentMessages(state).filter((message) =>
        isPendingForPlayer(message, playerId),
      ).length;
    },
  },
  mutations: {
    setConnected(state, connected) {
      state.connected = !!connected;
      if (!connected) {
        state.hostOnline = false;
        state.onlinePlayerIds = [];
      }
    },
    setPresence(state, presence) {
      state.hostOnline = !!(presence && presence.hostOnline);
      state.onlinePlayerIds =
        presence && Array.isArray(presence.playerIds) ? presence.playerIds : [];
    },
    setContext(state, { roomId, playerId }) {
      const next = {
        roomId: String(roomId || ""),
        playerId: String(playerId || ""),
      };
      if (
        state.context.roomId === next.roomId &&
        state.context.playerId === next.playerId
      )
        return;
      state.context = next;
      state.outbox = [];
      state.activeTarget = null;
      state.forceReply = false;
      state.notice = "";
      state.incomingSequence = 1;
    },
    hydrateContext(state, { messages, outbox }) {
      const key = currentKey(state);
      if (!key) return;
      state.messagesByKey = {
        ...state.messagesByKey,
        [key]: (Array.isArray(messages) ? messages : [])
          .filter(
            (message) =>
              message &&
              message.id &&
              message.roomId === state.context.roomId &&
              (message.targetPlayerId === state.context.playerId ||
                message.senderPlayerId === state.context.playerId),
          )
          .map((message) => ({
            ...message,
            phase: copyPhase(message.phase),
            content: normalizeText(message.content),
          }))
          .filter((message) => !!message.content),
      };
      state.outbox = (Array.isArray(outbox) ? outbox : []).filter(
        (item) =>
          item &&
          item.payload &&
          item.payload.roomId === state.context.roomId &&
          ((item.kind === "message" &&
            item.payload.senderPlayerId === state.context.playerId) ||
            (item.kind === "reply" &&
              item.payload.playerId === state.context.playerId)),
      );
      const maxReceivedOrder = state.messagesByKey[key].reduce(
        (max, message) =>
          Number.isFinite(message && message.receivedOrder)
            ? Math.max(max, message.receivedOrder)
            : max,
        0,
      );
      state.incomingSequence = maxReceivedOrder + 1;
    },
    setPresets(state, presets) {
      state.presets = Array.isArray(presets)
        ? presets.map((item) => normalizeText(item, 500)).filter(Boolean)
        : [];
    },
    addPreset(state, text) {
      state.presets = addPresetToList(state.presets, text);
    },
    removePreset(state, index) {
      state.presets = removePresetAt(state.presets, index);
    },
    setStorageError(state, message) {
      state.storageError = message || "";
    },
    setNotice(state, message) {
      state.notice = message || "";
    },
    openTarget(state, target) {
      state.activeTarget = target ? { ...target } : null;
      state.notice = "";
    },
    closeTarget(state) {
      state.activeTarget = null;
    },
    enqueueMessage(state, message) {
      if (!message || !message.id) return;
      setCurrentMessages(
        state,
        addUniqueMessage(currentMessages(state), {
          ...message,
          direction: "outgoing",
        }),
      );
      if (
        !state.outbox.some(
          (item) => item.kind === "message" && item.id === message.id,
        )
      ) {
        state.outbox.push({
          kind: "message",
          id: message.id,
          payload: { ...message },
        });
      }
    },
    receiveIncoming(state, message) {
      if (
        !message ||
        !message.id ||
        message.roomId !== state.context.roomId ||
        message.targetPlayerId !== state.context.playerId
      )
        return;
      const existing = findMessage(state, message.id);
      const existingReply = existing && existing.reply;
      const next = {
        ...(existing || {}),
        ...message,
        reply: existingReply || message.reply,
        replyStatus: existingReply ? existing.replyStatus : message.replyStatus,
        receivedOrder:
          (existing && existing.receivedOrder) || state.incomingSequence++,
        direction: "incoming",
        status: message.reply
          ? "replied"
          : mergeStatus(existing || { status: "accepted" }, "delivered"),
      };
      const wasPending =
        existing && isPendingForPlayer(existing, state.context.playerId);
      setCurrentMessages(state, addUniqueMessage(currentMessages(state), next));
      if (!existing || !wasPending) state.incomingSignal += 1;
    },
    applyAccepted(state, { id }) {
      updateMessage(state, id, (message) => ({
        ...message,
        status: mergeStatus(message, "accepted"),
        error: "",
      }));
      removeOutboxItem(state, id, "message");
    },
    applyStatus(state, status) {
      if (!status || !status.id) return;
      updateMessage(state, status.id, (message) => ({
        ...message,
        status: mergeStatus(message, status.status),
        deliveredAt: status.deliveredAt || message.deliveredAt,
        repliedAt: status.repliedAt || message.repliedAt,
        reply: status.reply || message.reply,
        replyStatus: status.reply ? "replied" : message.replyStatus,
      }));
      removeOutboxItem(state, status.id, "message");
    },
    syncMessages(state, messages) {
      if (!Array.isArray(messages)) return;
      const playerId = state.context.playerId;
      let next = currentMessages(state);
      messages.forEach((remote) => {
        if (
          !remote ||
          !remote.id ||
          remote.roomId !== state.context.roomId ||
          remote.senderPlayerId !== playerId
        )
          return;
        const existing = next.find((message) => message.id === remote.id);
        const isTarget = remote.targetPlayerId === playerId;
        next = addUniqueMessage(next, {
          ...(existing || {}),
          ...remote,
          direction: existing
            ? existing.direction
            : isTarget
            ? "incoming"
            : "outgoing",
          status: mergeStatus(existing || { status: "sending" }, remote.status),
        });
      });
      setCurrentMessages(state, next);
    },
    enqueueReply(state, reply) {
      if (!reply || !reply.wakeId || !reply.id) return;
      updateMessage(state, reply.wakeId, (message) => ({
        ...message,
        reply,
        replyStatus: "sending",
        error: "",
      }));
      if (
        !state.outbox.some(
          (item) => item.kind === "reply" && item.id === reply.id,
        )
      ) {
        state.outbox.push({
          kind: "reply",
          id: reply.id,
          payload: { ...reply },
        });
      }
    },
    applyReplyAck(state, reply) {
      if (!reply || !reply.wakeId) return;
      updateMessage(state, reply.wakeId, (message) => ({
        ...message,
        status: "replied",
        repliedAt: reply.createdAt || message.repliedAt,
        reply,
        replyStatus: "replied",
        error: "",
      }));
      removeOutboxItem(state, reply.id, "reply");
      removeOutboxItem(state, reply.wakeId, "message");
    },
    failOutbox(state, { id, message }) {
      let failedWakeId = id;
      const item = state.outbox.find((entry) => entry.id === id);
      if (item && item.kind === "reply" && item.payload) {
        failedWakeId = item.payload.wakeId;
      }
      if (failedWakeId) {
        updateMessage(state, failedWakeId, (wake) => ({
          ...wake,
          status: item && item.kind === "reply" ? wake.status : "failed",
          replyStatus:
            item && item.kind === "reply" ? "failed" : wake.replyStatus,
          error: message || "发送失败",
        }));
      }
      removeOutboxItem(state, id);
      state.notice = message || "发送失败";
    },
    removeOutbox(state, id) {
      removeOutboxItem(state, id);
    },
    setForceReply(state, value) {
      state.forceReply = !!value;
    },
    resetSession(state) {
      state.context = { roomId: "", playerId: "" };
      state.outbox = [];
      state.activeTarget = null;
      state.forceReply = false;
      state.notice = "";
      state.incomingSequence = 1;
    },
  },
};
