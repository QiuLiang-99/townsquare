"use strict";
// Exercises the real Vuex module/persistence and component logic without a browser.
// This deliberately does not replace the manual browser/layout acceptance pass.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Vue = require("vue");
const Vuex = require("vuex");
const logic = require("../src/logic/quickWake");
Vue.use(Vuex);
function load(relative, bindings = {}) {
  let source = fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
  if (relative.endsWith(".vue"))
    source = source.split("<script>")[1].split("</script>")[0];
  source = source.replace(/import\s+[\s\S]*?\s+from\s+["'][^"']+["'];?/g, "");
  source = source.replace("export default", "return");
  const values = { ...logic, ...bindings };
  return Function(...Object.keys(values), source)(...Object.values(values));
}
const wakeModule = load("src/store/modules/quickWake.js");
function storeFor(storage) {
  const plugin = load("src/store/quickWakePersistence.js", {
    window: { localStorage: storage },
  });
  return new Vuex.Store({
    state: { modals: { directedWake: false, playerWake: false } },
    mutations: {
      toggleModal(state, name) {
        state.modals[name] = !state.modals[name];
      },
    },
    modules: {
      quickWake: wakeModule,
      session: {
        namespaced: true,
        state: () => ({ sessionId: "", playerId: "" }),
        mutations: {
          setSessionId(state, value) {
            state.sessionId = value;
          },
          setPlayerId(state, value) {
            state.playerId = value;
          },
        },
      },
    },
    plugins: [plugin],
  });
}
function storageFor() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}
function enter(store, room = "123", player = "p1") {
  store.commit("session/setPlayerId", player);
  store.commit("session/setSessionId", room);
}
function message(id, createdAt = "2026-01-01T00:00:00Z") {
  return logic.createWakeMessage({
    id,
    roomId: "123",
    targetPlayerId: "p1",
    content: id,
    createdAt,
  });
}
let count = 0;
function test(name, run) {
  try {
    run();
    count++;
    console.log("PASS", name);
  } catch (error) {
    console.error("FAIL", name, error.stack);
    process.exitCode = 1;
  }
}
test("实际持久化插件恢复未回复队列，房间和身份隔离", () => {
  const storage = storageFor();
  const a = storeFor(storage);
  enter(a);
  a.commit("quickWake/receiveIncoming", message("first"));
  a.commit("quickWake/receiveIncoming", message("second"));
  a.commit("quickWake/addPreset", "跨房间预设");
  const b = storeFor(storage);
  enter(b);
  assert.deepStrictEqual(
    b.getters["quickWake/pendingForMe"].map((m) => m.id),
    ["first", "second"],
  );
  b.commit("session/setSessionId", "456");
  assert.strictEqual(b.getters["quickWake/pendingCount"], 0);
  assert.deepStrictEqual(Array.from(b.state.quickWake.presets), ["跨房间预设"]);
  b.commit("session/setSessionId", "123");
  b.commit("session/setPlayerId", "p2");
  assert.strictEqual(b.getters["quickWake/pendingCount"], 0);
});
test("待回复队列使用首次接收顺序而非发送时间", () => {
  const store = storeFor(storageFor());
  enter(store);
  store.commit(
    "quickWake/receiveIncoming",
    message("z-first", "2026-01-02T00:00:00Z"),
  );
  store.commit(
    "quickWake/receiveIncoming",
    message("a-second", "2026-01-01T00:00:00Z"),
  );
  store.commit(
    "quickWake/receiveIncoming",
    message("z-first", "2026-01-02T00:00:00Z"),
  );
  assert.deepStrictEqual(
    store.getters["quickWake/pendingForMe"].map((m) => m.id),
    ["z-first", "a-second"],
  );
});
test("被拒回复不能绕过强制回复，重复接收不能清掉已确认回复", () => {
  const store = storeFor(storageFor());
  enter(store);
  const incoming = message("reply-test");
  store.commit("quickWake/receiveIncoming", incoming);
  const reply = logic.createWakeReply({
    id: "reply-id",
    wakeId: incoming.id,
    roomId: "123",
    playerId: "p1",
    content: "了解",
  });
  store.commit("quickWake/enqueueReply", reply);
  store.commit("quickWake/failOutbox", { id: reply.id, message: "暂时失败" });
  assert.strictEqual(store.getters["quickWake/pendingCount"], 1);
  store.commit("quickWake/applyReplyAck", reply);
  store.commit("quickWake/receiveIncoming", incoming);
  assert.strictEqual(store.getters["quickWake/pendingCount"], 0);
  assert.strictEqual(
    store.getters["quickWake/currentMessages"][0].reply.id,
    reply.id,
  );
});
test("存储不可用仍能切换上下文和收发本次会话消息", () => {
  const broken = {
    getItem() {
      throw Error("disabled");
    },
    setItem() {
      throw Error("disabled");
    },
    removeItem() {
      throw Error("disabled");
    },
  };
  const store = storeFor(broken);
  enter(store);
  assert.strictEqual(store.state.quickWake.context.roomId, "123");
  assert.ok(store.state.quickWake.storageError);
  store.commit("quickWake/receiveIncoming", message("memory-only"));
  assert.strictEqual(store.getters["quickWake/pendingCount"], 1);
  store.commit("session/setSessionId", "456");
  assert.strictEqual(store.getters["quickWake/pendingCount"], 0);
});
test("预设删除不影响消息快照，切换房间清空发送任务和目标", () => {
  const store = storeFor(storageFor());
  enter(store);
  store.commit("quickWake/addPreset", "预设内容");
  store.commit("quickWake/enqueueMessage", message("预设内容"));
  store.commit("quickWake/removePreset", 0);
  assert.strictEqual(
    store.getters["quickWake/currentMessages"][0].content,
    "预设内容",
  );
  store.commit("quickWake/openTarget", { playerId: "p1" });
  store.commit("session/setSessionId", "456");
  assert.strictEqual(store.state.quickWake.outbox.length, 0);
  assert.strictEqual(store.state.quickWake.activeTarget, null);
});
test("填空短语的数字零满足必填条件", () => {
  const component = load("src/components/modals/DirectedWakeModal.vue", {
    mapState: () => ({}),
    Modal: {},
    WakeHistory: {},
    QUICK_PHRASES: [],
    ALIGN_LABEL: {},
    isSlot: () => false,
    slotDef: () => ({}),
    slotKey: () => "",
    slotLabel: () => "",
    slotType: () => "",
  });
  const ctx = {
    phrase: { slots: [{ key: "n", type: "num" }] },
    phraseText: "数字是0",
    picked: { n: 0 },
  };
  assert.strictEqual(component.computed.phraseReady.call(ctx), true);
});
test("既有持久化适配器写满或被禁用时回退内存", () => {
  const { createSessionStorage } = require("../src/store/safeStorage");
  let errors = 0;
  const storage = createSessionStorage(
    () => ({
      getItem: () => "已保存",
      setItem() {
        throw Error("quota");
      },
    }),
    () => errors++,
  );
  assert.strictEqual(storage.getItem("old"), "已保存");
  storage.setItem("new", 0);
  assert.strictEqual(storage.getItem("new"), "0");
  assert.strictEqual(storage.old, "已保存");
  storage.removeItem("old");
  assert.strictEqual(storage.old, undefined);
  assert.strictEqual(errors, 1);
  const unavailable = createSessionStorage(() => {
    throw Error("disabled");
  });
  unavailable.name = "本次会话";
  assert.strictEqual(unavailable.name, "本次会话");
});
test("存储禁用时跨房间往返仍保留本会话历史", () => {
  const broken = {
    getItem() {
      throw Error("disabled");
    },
    setItem() {
      throw Error("disabled");
    },
    removeItem() {
      throw Error("disabled");
    },
  };
  const store = storeFor(broken);
  enter(store);
  store.commit("quickWake/receiveIncoming", message("kept-in-memory"));
  store.commit("session/setSessionId", "456");
  store.commit("session/setSessionId", "123");
  assert.strictEqual(store.getters["quickWake/pendingCount"], 1);
});
test("强制回复的全局同名关闭、背景关闭、其他弹窗均被阻止", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/store/index.js"),
    "utf8",
  );
  const body = source.match(
    /toggleModal\(\{ modals \}, name\) \{([\s\S]*?)\n    \},/,
  )[1];
  const toggle = Function("modals", "name", body);
  const context = {
    getters: { "quickWake/pendingCount": 1 },
    state: { session: {} },
  };
  const modals = { playerWake: true, input: false };
  toggle.call(context, modals, "playerWake");
  toggle.call(context, modals, undefined);
  toggle.call(context, modals, "input");
  assert.strictEqual(modals.playerWake, true);
  assert.strictEqual(modals.input, false);
  context.getters["quickWake/pendingCount"] = 0;
  toggle.call(context, modals, "playerWake");
  assert.strictEqual(modals.playerWake, false);
  const component = load("src/components/modals/Modal.vue");
  let emits = 0;
  const modal = {
    dismissible: false,
    $emit() {
      emits++;
    },
  };
  modal.close = () => component.methods.close.call(modal);
  component.methods.closeCheck.call(modal);
  modal.close();
  assert.strictEqual(emits, 0);
});
test("双方历史将消息和回复按各自发送时间/阶段排序", () => {
  const component = load("src/components/modals/WakeHistory.vue");
  const entries = component.computed.entries.call({
    messages: [
      {
        id: "first",
        content: "第一条",
        createdAt: "2026-01-01T01:00:00Z",
        phase: { label: "第1夜" },
        reply: {
          id: "r",
          content: "回复",
          createdAt: "2026-01-01T03:00:00Z",
          phase: { label: "第1个白天" },
        },
      },
      { id: "second", content: "第二条", createdAt: "2026-01-01T02:00:00Z" },
    ],
  });
  assert.deepStrictEqual(
    entries.map((e) => e.content),
    ["第一条", "第二条", "回复"],
  );
  assert.strictEqual(entries[2].phase.label, "第1个白天");
});
test("新增Vue模板可编译（不替代浏览器视觉验收）", () => {
  const compiler = require("vue-template-compiler");
  for (const name of [
    "PlayerWakeModal",
    "DirectedWakeModal",
    "WakeHistory",
    "Modal",
  ]) {
    const source = fs.readFileSync(
      path.join(__dirname, `../src/components/modals/${name}.vue`),
      "utf8",
    );
    const parsed = compiler.parseComponent(source);
    assert.deepStrictEqual(
      compiler.compile(parsed.template.content).errors,
      [],
      name,
    );
  }
});
test("实际socket发送任务不能跨房间/身份或改投后来入座者", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/store/socket.js"),
    "utf8",
  );
  const LiveSession = Function(
    source.split("export default")[0] + "; return LiveSession;",
  )();
  const live = Object.create(LiveSession.prototype);
  const sent = [],
    commits = [];
  live._socket = { readyState: 1 };
  live._socketContext = { roomId: "123", playerId: "st", isSpectator: false };
  live._isSpectator = false;
  const payload = {
    ...message("queued"),
    senderPlayerId: "st",
    targetPlayerId: "original",
  };
  live._store = {
    state: {
      session: { sessionId: "123", playerId: "st", isSpectator: false },
      players: { players: [{ id: "original" }] },
      quickWake: { outbox: [{ kind: "message", id: payload.id, payload }] },
    },
    commit(type, value) {
      commits.push([type, value]);
    },
  };
  live._send = (cmd, value) => sent.push([cmd, value]);
  live._sendQuickWakeOutbox();
  assert.strictEqual(sent[1][1].id, "queued");
  sent.length = 0;
  live._store.state.session.sessionId = "456";
  live._sendQuickWakeOutbox();
  assert.strictEqual(sent.length, 0);
  live._store.state.session.sessionId = "123";
  live._store.state.players.players = [{ id: "replacement" }];
  live._sendQuickWakeOutbox();
  assert.strictEqual(sent.length, 0);
  assert.strictEqual(commits[0][0], "quickWake/failOutbox");
});
test("玩家角色选择器只读取剧本，Esc只返回子选择器", () => {
  const component = load("src/components/modals/PlayerWakeModal.vue", {
    mapState: () => ({}),
    Modal: {},
    WakeHistory: {},
  });
  const roles = component.computed.selectableRoles.call({
    roles: new Map([
      [
        "script-role",
        { id: "script-role", name: "剧本角色", team: "townsfolk" },
      ],
    ]),
    players: [
      { role: { id: "secret", name: "隐秘角色" }, stReminders: ["秘密备注"] },
    ],
  });
  assert.deepStrictEqual(
    roles.map((role) => role.id),
    ["script-role"],
  );
  let prevented = false;
  const ctx = {
    modals: { playerWake: true },
    pending: [message("required")],
    stage: "roles",
    isSending: false,
  };
  component.methods.handleKeydown.call(ctx, {
    key: "Escape",
    preventDefault() {
      prevented = true;
    },
    stopPropagation() {},
  });
  assert.strictEqual(ctx.stage, "main");
  assert.strictEqual(ctx.modals.playerWake, true);
  assert.strictEqual(prevented, true);
});
console.log(`\n${count} state/component checks passed`);
