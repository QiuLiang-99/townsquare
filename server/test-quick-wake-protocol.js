"use strict";
const assert = require("assert");
const { send, frame, closed, alive, absent, createClients, startServer } = require("./test-helpers");
const clients = createClients();
const connect = clients.connect;
let server;
let passed = 0;
function ok(name, condition) {
  assert.ok(condition, name);
  passed++;
  console.log("PASS", name);
}

(async () => {
  try {
    server = await startServer({ grace: 1500 });
    const base = `${server.ws}/ws/1234`;
    const host = await connect(`${base}/st/host?auth=test-secret`);
    assert.strictEqual(await frame(host, "allowHost"), true);
    await frame(host, "quickWakeSync");
    const p1 = await connect(`${base}/p1`);
    const other = await connect(`${base}/other`);
    assert.strictEqual(await frame(p1, "allowJoin"), true);
    assert.strictEqual(await frame(other, "allowJoin"), true);
    const separateHost = await connect(`${server.ws}/ws/1235/separate-st/host?auth=separate-secret`);
    assert.strictEqual(await frame(separateHost, "allowHost"), true);
    const separatePlayer = await connect(`${server.ws}/ws/1235/separate-player`);
    assert.strictEqual(await frame(separatePlayer, "allowJoin"), true);

    async function rejected(socket, command, payload, code, id = payload.id || payload.wakeId || "") {
      send(socket, command, payload);
      const error = await frame(socket, "quickWakeError", (p) => p.id === id);
      assert.strictEqual(error.code, code, `${command} error for ${id}`);
      await alive(socket);
      return error;
    }
    await rejected(other, "quickWakeSeats", ["other"], "forbidden");
    send(host, "quickWakeSeats", []);
    await rejected(host, "quickWakeSend", {
      id: "unseated", roomId: "1234", targetPlayerId: "p1", content: "不应发送",
    }, "unseated");
    ok("空座及离座目标不可发送，玩家不能伪造座位名单", true);

    const impersonator = await connect(`${base}/p1?auth=not-the-player-secret`);
    assert.strictEqual(await frame(impersonator, "allowJoin"), false);
    assert.strictEqual((await closed(impersonator)).code, 4003);
    await alive(p1);
    ok("已公开稳定ID不能被其他浏览器冒用，原玩家仍在线", true);

    const payload = {
      id: "test-one",
      roomId: "1234",
      targetPlayerId: "p1",
      senderPlayerId: "forged-st",
      targetName: "A",
      content: "0 是有效消息，私密正文",
      phase: { kind: "night", night: 3, label: "第3夜" },
    };
    send(host, "quickWakeSeats", ["p1", "other", "offline"]);
    await rejected(host, "quickWakeSend", { ...payload, id: "wrong-room", roomId: "1235" }, "invalid");
    await rejected(other, "quickWakeSend", { ...payload, id: "player-send" }, "forbidden");
    await rejected(host, "quickWakeSend", { ...payload, id: "blank", content: " " }, "invalid");
    await rejected(host, "quickWakeSend", { ...payload, id: "offline", targetPlayerId: "offline" }, "offline");
    ok("错误房间、玩家伪造发送、空正文及离线目标有明确错误响应", true);

    send(host, "quickWakeSend", payload);
    const incoming = await frame(p1, "quickWakeIncoming", (p) => p.id === payload.id);
    ok("定向接收及内容快照", incoming.content === payload.content && incoming.targetPlayerId === "p1");
    ok("发送者稳定ID来自已认证连接", incoming.senderPlayerId === "st");
    assert.deepStrictEqual(await frame(host, "quickWakeAccepted", (p) => p.id === payload.id), { id: payload.id });
    await absent(host, ([cmd, p]) => cmd === "quickWakeStatus" && p.id === payload.id && p.status === "delivered", "No delivered status before receipt");
    ok("中继接受不等同玩家已送达", true);

    const privateCommands = new Set(["quickWakeIncoming", "quickWakeStatus", "quickWakeReplyAck", "quickWakeSync"]);
    async function privateIsolation() {
      for (const socket of [other, separateHost, separatePlayer]) {
        await absent(socket, ([cmd, p]) => privateCommands.has(cmd) &&
          (JSON.stringify(p).includes(payload.id) || JSON.stringify(p).includes(payload.content)), "Non-target must not receive private wake/reply history");
      }
    }
    await privateIsolation();
    ok("同房非目标玩家及其他房间无法接收私密正文", true);

    await rejected(host, "quickWakeSend", { ...payload, content: "篡改正文" }, "conflict");
    await rejected(host, "quickWakeSend", { ...payload, targetPlayerId: "other" }, "conflict");
    await rejected(p1, "quickWakeReceipt", { wakeId: payload.id, roomId: "1235" }, "invalid");
    await rejected(host, "quickWakeReceipt", { wakeId: payload.id, roomId: "1234" }, "forbidden");
    await rejected(host, "quickWakeReply", { id: "host-reply", wakeId: payload.id, roomId: "1234", content: "代答" }, "forbidden");
    await rejected(p1, "quickWakeReply", { id: "wrong-reply-room", wakeId: payload.id, roomId: "1235", content: "错房间" }, "invalid");
    await rejected(p1, "quickWakeReply", { id: "unknown-wake", wakeId: "missing", roomId: "1234", content: "未知消息" }, "forbidden");
    ok("消息ID冲突、回执及回复房间错误、host代答和未知消息被拒", true);

    await rejected(other, "quickWakeReceipt", { wakeId: payload.id, roomId: "1234" }, "forbidden");
    await rejected(other, "quickWakeReply", {
      id: "forged-reply", wakeId: payload.id, roomId: "1234", playerId: "p1", content: "是",
    }, "forbidden");
    await rejected(other, "quickWakeSyncRequest", {}, "forbidden");
    await absent(host, ([cmd, p]) => cmd === "quickWakeStatus" && p.id === payload.id, "Rejected attempts must not change message status");
    ok("第三方不能伪造送达、回复或读取历史，失败不改变原消息", true);

    for (const command of privateCommands) {
      await rejected(other, "direct", { p1: [command, { id: "forged" }] }, "forbidden", "forged");
      await rejected(other, command, { id: "forged" }, "forbidden");
    }
    await absent(p1, ([, p]) => p && p.id === "forged", "Reserved commands must not reach target");
    ok("所有保留命令禁止direct及广播注入", true);

    send(p1, "quickWakeReceipt", { wakeId: payload.id, roomId: "1234" });
    const delivered = await frame(host, "quickWakeStatus", (p) => p.id === payload.id && p.status === "delivered");
    ok("实际玩家回执才变为已送达", !!delivered.deliveredAt && delivered.reply === null);
    const p1Again = p1;
    const retryStart = p1Again.history.length;
    send(host, "quickWakeSend", payload);
    await frame(host, "quickWakeAccepted", (p) => p.id === payload.id);
    assert.deepStrictEqual(await frame(host, "quickWakeStatus", (p) => p.id === payload.id), delivered);
    await absent(p1Again, ([cmd]) => cmd === "quickWakeIncoming", "Retry must not deliver twice", retryStart);
    ok("沿用原消息ID重试不二次投递且结果不变", true);

    const reply = {
      id: "reply-one", wakeId: payload.id, roomId: "1234", playerId: "forged-player",
      content: "了解，私密回复", phase: { kind: "day", night: 3, label: "第3个白天" },
    };
    send(p1Again, "quickWakeReply", reply);
    const ack = await frame(p1Again, "quickWakeReplyAck", (p) => p.id === reply.id);
    const status = await frame(host, "quickWakeStatus", (p) => p.id === payload.id && p.status === "replied");
    ok("回复正确关联消息和认证目标身份", ack.wakeId === payload.id && ack.playerId === "p1" && status.reply.playerId === "p1");
    assert.deepStrictEqual(status.reply, ack);
    ok("回复保留独立发送阶段快照", status.reply.phase.label === "第3个白天");
    for (const retriedReply of [reply, { ...reply, content: "重复ID不应覆盖首次正文" }]) {
      send(p1Again, "quickWakeReply", retriedReply);
      assert.deepStrictEqual(await frame(p1Again, "quickWakeReplyAck", (p) => p.id === reply.id), ack);
      assert.deepStrictEqual(await frame(host, "quickWakeStatus", (p) => p.id === payload.id && p.status === "replied"), status);
    }
    await rejected(p1Again, "quickWakeReply", { ...reply, id: "second-reply" }, "alreadyReplied");
    send(host, "quickWakeSyncRequest", {});
    const snapshot = await frame(host, "quickWakeSync");
    assert.deepStrictEqual(snapshot, [status]);
    ok("重复回复返回相同完整结果，首条内容及时间不变，历史仅一条", true);
    const postReplyStart = p1Again.history.length;
    send(host, "quickWakeSend", payload);
    await frame(host, "quickWakeAccepted", (p) => p.id === payload.id);
    assert.deepStrictEqual(await frame(host, "quickWakeStatus", (p) => p.id === payload.id), status);
    await absent(p1Again, ([cmd]) => cmd === "quickWakeIncoming", "Replied wake retry must not redeliver", postReplyStart);
    const refreshedPlayer = await connect(`${base}/p1`);
    assert.strictEqual(await frame(refreshedPlayer, "allowJoin"), true);
    assert.strictEqual((await closed(p1Again)).code, 4000);
    await absent(refreshedPlayer, ([cmd]) => cmd === "quickWakeIncoming", "Replied wake must not restore as pending");
    ok("已回复消息重发及目标重连均不会再次投递待回复消息", true);
    await privateIsolation();
    for (const socket of [other, separateHost, separatePlayer]) {
      await absent(socket, ([, p]) => JSON.stringify(p).includes(reply.content), "Private reply body must stay isolated");
    }
    ok("回复、重试及历史同步全过程保持非目标私密隔离", true);

    const newHost = await connect(`${base}/st/host?auth=test-secret`);
    assert.strictEqual(await frame(newHost, "allowHost"), true);
    assert.deepStrictEqual(await frame(newHost, "quickWakeSync"), [status]);
    await rejected(host, "quickWakeSend", { ...payload, id: "old-host-send" }, "forbidden");
    ok("同身份说书人恢复相同历史，已替换旧连接不能发消息", true);
    const replacement = await connect(`${base}/different-st/host?auth=test-secret`);
    assert.strictEqual(await frame(replacement, "allowHost"), true);
    const isolated = await frame(replacement, "quickWakeSync");
    ok("新说书人身份不会自动取得旧身份历史", isolated.length === 0);
    host.close();
    newHost.close();
    replacement.close();
    await Promise.all([closed(host), closed(newHost), closed(replacement)]);
    const intruder = await connect(`${base}/intruder/host?auth=wrong-secret`);
    await frame(intruder, "alertPopup");
    assert.strictEqual((await closed(intruder)).code, 4009);
    ok("说书人断线后仍需原凭证才能接管", !intruder.history.some(([cmd, p]) => cmd === "allowHost" && p === true));
    send(other, "request", { checkAllowHost: ["other", null] });
    ok("普通玩家不能经checkAllowHost劫持断线说书人", await frame(other, "allowHost") === false);
    // Keep this independent recovery assertion last: a backend regression here must
    // fail the suite without preventing the other protocol checks from running.
    send(separateHost, "quickWakeSeats", ["separate-player"]);
    const pending = { ...payload, id: "pending-reconnect", roomId: "1235", targetPlayerId: "separate-player" };
    send(separateHost, "quickWakeSend", pending);
    await frame(separatePlayer, "quickWakeIncoming", (p) => p.id === pending.id);
    await frame(separateHost, "quickWakeAccepted", (p) => p.id === pending.id);
    send(separatePlayer, "quickWakeReceipt", { wakeId: pending.id, roomId: "1235" });
    const pendingStatus = await frame(separateHost, "quickWakeStatus", (p) => p.id === pending.id && p.status === "delivered");
    separatePlayer.close();
    await closed(separatePlayer);
    const recoveredPlayer = await connect(`${server.ws}/ws/1235/separate-player`);
    assert.strictEqual(await frame(recoveredPlayer, "allowJoin"), true);
    assert.deepStrictEqual(await frame(recoveredPlayer, "quickWakeIncoming", (p) => p.id === pending.id), pendingStatus);
    ok("目标玩家重连自动恢复未回复消息及原送达状态", true);
    console.log(`\n${passed} isolated WebSocket protocol checks passed`);
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
