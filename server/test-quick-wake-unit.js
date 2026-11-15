"use strict";

const assert = require("assert");
const {
  composeText,
  createWakeMessage,
  createWakeReply,
  phaseSnapshot,
  historyStorageKey,
  addUniqueMessage,
  isPendingForPlayer,
  pendingMessagesForPlayer,
  addPresetToList,
  removePresetAt,
} = require("../src/logic/quickWake");

const tests = [];
function test(name, fn) {
  try {
    fn();
    tests.push([name, true]);
    console.log("PASS", name);
  } catch (error) {
    tests.push([name, false]);
    console.error("FAIL", name, error.message);
  }
}

test("0 是有效消息片段，空片段会被拒绝", () => {
  assert.strictEqual(composeText(["了解", 0, "名玩家"]), "了解 0 名玩家");
  assert.throws(
    () =>
      createWakeMessage({
        id: "empty",
        roomId: "123",
        targetPlayerId: "p1",
        content: "   ",
      }),
    /不能为空/,
  );
});

test("组合消息保留选择顺序", () => {
  assert.strictEqual(
    composeText([{ text: "你是" }, { text: "善良" }, { text: "占卜师" }]),
    "你是 善良 占卜师",
  );
});

test("发送消息保存阶段和文本快照", () => {
  const sourcePhase = phaseSnapshot(true, 3);
  const message = createWakeMessage({
    id: "wake-1",
    roomId: "123",
    targetPlayerId: "p1",
    targetSeat: 4,
    phase: sourcePhase,
    content: "  选择 2 名玩家  ",
  });
  sourcePhase.label = "被篡改";
  assert.strictEqual(message.content, "选择 2 名玩家");
  assert.strictEqual(message.phase.label, "第3夜");
  assert.strictEqual(message.targetSeat, 4);
});

test("历史键按房间和本地玩家身份隔离", () => {
  assert.notStrictEqual(
    historyStorageKey("100", "p1"),
    historyStorageKey("101", "p1"),
  );
  assert.notStrictEqual(
    historyStorageKey("100", "p1"),
    historyStorageKey("100", "p2"),
  );
});

test("重复消息按 ID 去重", () => {
  const base = {
    id: "same",
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "sending",
  };
  const once = addUniqueMessage([], base);
  const twice = addUniqueMessage(once, { ...base, status: "delivered" });
  assert.strictEqual(twice.length, 1);
  assert.strictEqual(twice[0].status, "delivered");
});

test("回复关联唤醒 ID，并在回复后不再进入待回复队列", () => {
  const reply = createWakeReply({
    id: "reply-1",
    wakeId: "wake-1",
    roomId: "123",
    playerId: "p1",
    content: "了解",
  });
  assert.strictEqual(reply.wakeId, "wake-1");
  assert.strictEqual(
    isPendingForPlayer(
      {
        targetPlayerId: "p1",
        reply,
        replyStatus: "replied",
      },
      "p1",
    ),
    false,
  );
});

test("预设只新增非空且不重复的文本", () => {
  assert.deepStrictEqual(addPresetToList([], "  你好  "), ["你好"]);
  assert.deepStrictEqual(addPresetToList(["你好"], "你好"), ["你好"]);
  assert.deepStrictEqual(addPresetToList(["你好"], "  "), ["你好"]);
  assert.deepStrictEqual(removePresetAt(["你好", "再见"], 0), ["再见"]);
});

test("刷新恢复后多条待回复消息按接收顺序排队", () => {
  const restored = JSON.parse(
    JSON.stringify([
      {
        id: "late",
        targetPlayerId: "p1",
        createdAt: "2026-01-01T00:00:00.000Z",
        receivedOrder: 2,
      },
      {
        id: "replied",
        targetPlayerId: "p1",
        createdAt: "2026-01-01T00:00:00.000Z",
        reply: { id: "r" },
        replyStatus: "replied",
      },
      {
        id: "early",
        targetPlayerId: "p1",
        createdAt: "2026-01-01T00:00:02.000Z",
        receivedOrder: 1,
      },
      {
        id: "other",
        targetPlayerId: "p2",
        createdAt: "2026-01-01T00:00:00.500Z",
      },
    ]),
  );
  assert.deepStrictEqual(
    pendingMessagesForPlayer(restored, "p1").map((message) => message.id),
    ["early", "late"],
  );
});

const failed = tests.filter(([, passed]) => !passed);
console.log(`\n=== ${tests.length - failed.length}/${tests.length} passed ===`);
process.exit(failed.length ? 1 : 0);
