"use strict";

const MAX_MESSAGE_LENGTH = 4000;
const MAX_REPLY_LENGTH = 1000;

function normalizeText(value, maxLength = MAX_MESSAGE_LENGTH) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function fragmentText(fragment) {
  if (typeof fragment === "string") return fragment;
  if (fragment && typeof fragment.text === "string") return fragment.text;
  if (typeof fragment === "number") return String(fragment);
  return "";
}

function composeText(fragments) {
  if (!Array.isArray(fragments)) return "";
  return fragments
    .map(fragmentText)
    .map((text) => text.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function phaseSnapshot(isNight, night) {
  const n =
    Number.isFinite(Number(night)) && Number(night) >= 1
      ? Math.floor(Number(night))
      : 1;
  return isNight
    ? { kind: "night", night: n, label: `第${n}夜` }
    : { kind: "day", night: n, label: `第${n}个白天` };
}

function copyPhase(phase) {
  const fallback = phaseSnapshot(true, 1);
  if (!phase || typeof phase !== "object") return fallback;
  return {
    kind: phase.kind === "day" ? "day" : "night",
    night: Number.isFinite(Number(phase.night))
      ? Math.floor(Number(phase.night))
      : 1,
    label: normalizeText(phase.label, 40) || fallback.label,
  };
}

function makeId(prefix, now = Date.now, random = Math.random) {
  const randomPart = Array.from({ length: 4 }, () =>
    Math.floor(random() * 0x100000000).toString(36),
  ).join("_");
  return `${prefix || "qw"}_${now().toString(36)}_${randomPart}`;
}

function createWakeMessage({
  id,
  roomId,
  senderPlayerId,
  senderName,
  targetPlayerId,
  targetSeat,
  targetName,
  phase,
  content,
  createdAt,
}) {
  const text = normalizeText(content);
  if (!text) throw new Error("消息不能为空");
  if (!roomId || !targetPlayerId) throw new Error("缺少房间或收件人");

  return {
    id: normalizeText(id, 100) || makeId("wake"),
    roomId: String(roomId),
    senderPlayerId: normalizeText(senderPlayerId, 100),
    senderName: normalizeText(senderName, 80) || "说书人",
    targetPlayerId: normalizeText(targetPlayerId, 100),
    targetSeat: Number.isFinite(Number(targetSeat))
      ? Math.max(1, Math.floor(Number(targetSeat)))
      : 0,
    targetName: normalizeText(targetName, 80),
    phase: copyPhase(phase),
    content: text,
    createdAt: createdAt || new Date().toISOString(),
    status: "sending",
    reply: null,
  };
}

function createWakeReply({
  id,
  wakeId,
  roomId,
  playerId,
  senderName,
  phase,
  content,
  createdAt,
}) {
  const text = normalizeText(content, MAX_REPLY_LENGTH);
  if (!text) throw new Error("回复不能为空");
  if (!wakeId) throw new Error("缺少关联消息");
  return {
    id: normalizeText(id, 100) || makeId("reply"),
    wakeId: String(wakeId),
    roomId: String(roomId || ""),
    playerId: normalizeText(playerId, 100),
    senderName: normalizeText(senderName, 80),
    phase: copyPhase(phase),
    content: text,
    createdAt: createdAt || new Date().toISOString(),
  };
}

function historyStorageKey(roomId, playerId) {
  return `quickWakeHistory:v1:${String(roomId || "")}:${String(
    playerId || "",
  )}`;
}

const PRESETS_STORAGE_KEY = "quickWakePresets:v1";

function addUniqueMessage(messages, message) {
  if (!message || !message.id) return messages || [];
  const list = Array.isArray(messages) ? messages.slice() : [];
  const index = list.findIndex((item) => item && item.id === message.id);
  if (index === -1) {
    list.push(message);
  } else {
    list[index] = Object.assign({}, list[index], message);
  }
  return list.sort((a, b) => {
    const at = Date.parse(a.createdAt) || 0;
    const bt = Date.parse(b.createdAt) || 0;
    return at - bt || String(a.id).localeCompare(String(b.id));
  });
}

function isPendingForPlayer(message, playerId) {
  return !!(
    message &&
    message.targetPlayerId === playerId &&
    (!message.reply || message.replyStatus !== "replied")
  );
}

function pendingMessagesForPlayer(messages, playerId) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => isPendingForPlayer(message, playerId))
    .sort((a, b) => {
      const ao = Number.isFinite(a.message.receivedOrder)
        ? a.message.receivedOrder
        : a.index;
      const bo = Number.isFinite(b.message.receivedOrder)
        ? b.message.receivedOrder
        : b.index;
      return ao - bo;
    })
    .map(({ message }) => message);
}

function addPresetToList(presets, text) {
  const value = normalizeText(text, 500);
  const list = Array.isArray(presets) ? presets.slice() : [];
  if (!value || list.includes(value)) return list;
  return [...list, value];
}

function removePresetAt(presets, index) {
  const list = Array.isArray(presets) ? presets.slice() : [];
  if (index < 0 || index >= list.length) return list;
  list.splice(index, 1);
  return list;
}

module.exports = {
  MAX_MESSAGE_LENGTH,
  MAX_REPLY_LENGTH,
  PRESETS_STORAGE_KEY,
  normalizeText,
  composeText,
  phaseSnapshot,
  copyPhase,
  makeId,
  createWakeMessage,
  createWakeReply,
  historyStorageKey,
  addUniqueMessage,
  isPendingForPlayer,
  pendingMessagesForPlayer,
  addPresetToList,
  removePresetAt,
};
