"use strict";
// Real HTTP/WS behavior checks; owns its backend and never uses the port-3000 service.
const assert = require("assert");
const { wait, send, frame, closed, alive, createClients, getJson, startServer } = require("./test-helpers");
const clients = createClients();
let server;
let passed = 0;
let lobbyId = 0;
const ok = (name) => { passed++; console.log("PASS", name); };

(async () => {
  try {
    server = await startServer({ grace: 1200 });
    const lobby = await clients.connect(`${server.ws}/lobby/lifecycle-main`);
    assert.deepStrictEqual(await frame(lobby, "setRooms"), []);
    const health = () => getJson(`${server.http}/healthz`);
    async function snapshot() {
      const socket = await clients.connect(`${server.ws}/lobby/snapshot-${++lobbyId}`);
      const rooms = await frame(socket, "setRooms");
      socket.close();
      await closed(socket);
      return rooms;
    }
    async function roomExists(channel, expected) {
      const rooms = await snapshot();
      assert.strictEqual(rooms.some((room) => room.channel === channel), expected, `Lobby presence of ${channel}`);
      const status = await health();
      assert.strictEqual(status.ok, true);
      assert.strictEqual(status.rooms, expected ? 1 : 0, `Health room count for ${channel}`);
    }
    async function host(channel) {
      const socket = await clients.connect(`${server.ws}/ws/${channel}/st/host?auth=lifecycle-host-secret`);
      assert.strictEqual(await frame(socket, "allowHost"), true);
      return socket;
    }
    async function player(channel, id, auth = `secret-${id}`) {
      const socket = await clients.connect(`${server.ws}/ws/${channel}/${id}?auth=${auth}`);
      assert.strictEqual(await frame(socket, "allowJoin"), true);
      return socket;
    }
    async function beforeExpiry(channel) {
      await wait(200);
      await roomExists(channel, true);
      assert.ok(!lobby.history.some(([cmd, payload]) => cmd === "removeRoom" && payload === channel), "No early removeRoom");
    }
    async function expired(channel, disconnectedAt) {
      await frame(lobby, "removeRoom", (payload) => payload === channel, server.grace + 3000);
      assert.ok(Date.now() - disconnectedAt >= server.grace - 100, "Room was not reclaimed before grace elapsed");
      await roomExists(channel, false);
    }

    const missing = await clients.connect(`${server.ws}/ws/7300/ghost?auth=ghost-secret`);
    assert.strictEqual(await frame(missing, "allowJoin"), false);
    assert.strictEqual((await closed(missing)).code, 4004);
    await roomExists("7300", false);
    await wait(120);
    await roomExists("7300", false);
    assert.ok(!lobby.history.some(([cmd, payload]) => cmd === "addRoom" && payload.channel === "7300"));
    ok("不存在的房间拒绝玩家，health及大厅无幽灵房间");

    const channel = "7301";
    const st = await host(channel);
    const added = await frame(lobby, "addRoom", (room) => room.channel === channel);
    assert.strictEqual(added.players, 1);
    await roomExists(channel, true);
    ok("说书人建房获准，大厅新增及新快照可见");

    const original = await player(channel, "p1");
    const impostor = await clients.connect(`${server.ws}/ws/${channel}/p1?auth=wrong-secret`);
    assert.strictEqual(await frame(impostor, "allowJoin"), false);
    assert.strictEqual((await closed(impostor)).code, 4003);
    await alive(original);
    send(st, "direct", { p1: ["chat", { text: "original-still-active" }] });
    assert.deepStrictEqual(await frame(original, "chat"), { text: "original-still-active" });
    ok("错误玩家凭证被拒，原合法连接仍可收发");

    const rejoined = await player(channel, "p1");
    assert.strictEqual((await closed(original)).code, 4000);
    await alive(rejoined);
    send(st, "direct", { p1: ["chat", { text: "replacement-after-old-close" }] });
    assert.deepStrictEqual(await frame(rejoined, "chat"), { text: "replacement-after-old-close" });
    // A fresh lobby snapshot also proves the old close did not delete the new player entry.
    assert.strictEqual((await snapshot()).find((room) => room.channel === channel).players, 2);
    ok("同凭证重连关闭旧连接，旧close不移除新玩家连接");

    const publicGs = {
      gamestate: [{ id: "p1", name: "A", isDead: false }, { id: "late", name: "B", isDead: true }],
      isNight: true,
      edition: "tb",
      playerCount: 2,
    };
    send(st, "gs", publicGs);
    assert.deepStrictEqual(await frame(rejoined, "gs"), publicGs);
    const late = await player(channel, "late");
    assert.deepStrictEqual(await frame(late, "gs"), publicGs);
    // This covers a cached full public snapshot, not freshness after incremental updates.
    ok("晚加入玩家收到lastGs完整公开快照（不承诺增量缓存一致性）");

    rejoined.close();
    late.close();
    await Promise.all([closed(rejoined), closed(late)]);
    await alive(st);
    const emptyAt = Date.now();
    st.close();
    await closed(st);
    await beforeExpiry(channel);
    ok("真正空房在宽限期内仍保留");
    await expired(channel, emptyAt);
    ok("空房宽限期满发出removeRoom，health和新快照均移除");

    const reconnectRoom = "7302";
    const reconnectHost = await host(reconnectRoom);
    await frame(lobby, "addRoom", (room) => room.channel === reconnectRoom);
    reconnectHost.close();
    await closed(reconnectHost);
    await beforeExpiry(reconnectRoom);
    const restoredHost = await host(reconnectRoom);
    await wait(server.grace + 250);
    await alive(restoredHost);
    await roomExists(reconnectRoom, true);
    assert.ok(!lobby.history.some(([cmd, payload]) => cmd === "removeRoom" && payload === reconnectRoom));
    const restoredPlayer = await player(reconnectRoom, "restored-player");
    ok("原说书人宽限期内重连取消回收，超过原截止时间仍可加入");

    send(restoredHost, "dissolveRoom", null);
    const [playerClose, hostClose] = await Promise.all([closed(restoredPlayer), closed(restoredHost)]);
    assert.strictEqual(playerClose.code, 1000);
    assert.ok(playerClose.reason.includes("解散"));
    assert.strictEqual(hostClose.code, 1000);
    await frame(lobby, "removeRoom", (payload) => payload === reconnectRoom);
    await roomExists(reconnectRoom, false);
    const afterDissolve = await clients.connect(`${server.ws}/ws/${reconnectRoom}/newcomer?auth=newcomer-secret`);
    assert.strictEqual(await frame(afterDissolve, "allowJoin"), false);
    assert.strictEqual((await closed(afterDissolve)).code, 4004);
    await roomExists(reconnectRoom, false);
    ok("主动解散正常关闭玩家和host，大厅移除且不能继续加入");

    const occupiedRoom = "7303";
    const leavingHost = await host(occupiedRoom);
    await frame(lobby, "addRoom", (room) => room.channel === occupiedRoom);
    const remainingPlayer = await player(occupiedRoom, "remaining");
    leavingHost.close();
    await closed(leavingHost);
    await wait(server.grace + 250);
    await alive(remainingPlayer);
    await roomExists(occupiedRoom, true);
    assert.ok(!lobby.history.some(([cmd, payload]) => cmd === "removeRoom" && payload === occupiedRoom));
    ok("说书人离开但仍有玩家，超过宽限期不回收");
    const lastPlayerAt = Date.now();
    remainingPlayer.close();
    await closed(remainingPlayer);
    await beforeExpiry(occupiedRoom);
    await expired(occupiedRoom, lastPlayerAt);
    ok("最后玩家离开后才开始空房宽限并最终回收");
    console.log(`\n${passed} isolated room lifecycle checks passed`);
  } catch (error) {
    if (server) console.error(server.diagnostics());
    throw error;
  } finally {
    try { await clients.cleanup(); }
    finally { if (server) await server.cleanup(); }
  }
})().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
