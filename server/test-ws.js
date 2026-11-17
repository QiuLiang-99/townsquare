// WS 协议集成测试：模拟说书人(host) + 2名玩家 + 1个大厅客户端
"use strict";
const { createClients, frame, closed } = require("./test-helpers");
const clients = createClients();
const BASE = "ws://127.0.0.1:3000";
const results = [];
const ok = (name, cond, extra = "") => { results.push([name, !!cond, extra]); console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`); };

const conn = clients.connect;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const send = (ws, arr) => ws.send(JSON.stringify(arr));
const lastOf = (ws, cmd) => [...ws.msgs].reverse().find((m) => m[0] === cmd);

(async () => {
  const CH = String(1000 + Math.floor(Math.random() * 8000));
  const auth = "secret_abc";

  // 1) lobby 先连，应立刻收到 setRooms
  const lobby = await conn(`${BASE}/lobby/lobbyclient1`);
  await wait(150);
  ok("lobby 收到 setRooms", Array.isArray(lastOf(lobby, "setRooms")));

  // 2) host 连接
  const host = await conn(`${BASE}/ws/${CH}/hostpid/host?auth=${auth}`);
  await wait(150);
  ok("host 收到 allowHost=true", (lastOf(host, "allowHost") || [])[1] === true);

  // 3) lobby 收到 addRoom（在 host 建房后）——载荷为房间对象，比对 channel
  await wait(100);
  ok("lobby 收到 addRoom", ((lobby.msgs.find((m) => m[0] === "addRoom") || [])[1] || {}).channel === CH);

  // 4) 第二个 host 用不同 auth 连接 -> 应被拒(alertPopup+close 4009)
  const host2 = await conn(`${BASE}/ws/${CH}/hostpid2/host?auth=other`).catch(() => null);
  if (host2) {
    const alert = await frame(host2, "alertPopup");
    ok("重复host被拒(alertPopup)", typeof alert === "string" && alert.length > 0);
    const host2Close = await closed(host2);
    ok("重复host连接被关闭(4009)", host2Close.code === 4009);
  } else {
    ok("重复host被拒(alertPopup)", false);
    ok("重复host连接被关闭(4009)", false);
  }

  // 5) 玩家1、玩家2 连接
  const p1 = await conn(`${BASE}/ws/${CH}/pid1`);
  const p2 = await conn(`${BASE}/ws/${CH}/pid2`);
  await wait(150);
  ok("玩家1收到 allowJoin=true", (lastOf(p1, "allowJoin") || [])[1] === true);
  ok("玩家2收到 allowJoin=true", (lastOf(p2, "allowJoin") || [])[1] === true);

  // 6) host 广播 gs（普通广播命令）-> 两个玩家都收到
  send(host, ["gs", { gamestate: [{ name: "A", id: "pid1" }, { name: "B", id: "pid2" }], isNight: false }]);
  await wait(150);
  ok("玩家1收到 gs 广播", !!lastOf(p1, "gs"));
  ok("玩家2收到 gs 广播", !!lastOf(p2, "gs"));
  ok("host 不回显自己的 gs", !lastOf(host, "gs"));

  // 7) direct 拆包：玩家1 向 host 发 getGamestate
  send(p1, ["direct", { host: ["getGamestate", "pid1"] }]);
  await wait(150);
  ok("host 收到 direct(getGamestate)", !!lastOf(host, "getGamestate"));

  // 8) direct 拆包到指定玩家：host 给 pid1 单独发 player
  send(host, ["direct", { pid1: ["player", { index: 0, property: "role", value: "imp" }] }]);
  await wait(150);
  ok("pid1 收到定向 player", !!lastOf(p1, "player"));
  ok("pid2 未收到定向 player", !lastOf(p2, "player"));

  // 9) 快捷唤醒只投递给目标玩家，第三名玩家不可旁听
  send(host, ["quickWakeSeats", ["pid1", "pid2"]]);
  const wakeId = "wake_test_1";
  send(host, ["quickWakeSend", {
    id: wakeId,
    roomId: CH,
    senderPlayerId: "hostpid",
    senderName: "ST",
    targetPlayerId: "pid1",
    targetSeat: 1,
    targetName: "A",
    phase: { kind: "night", night: 2, label: "第2夜" },
    content: "选择 0 名玩家",
    createdAt: new Date().toISOString(),
  }]);
  await wait(150);
  ok("目标玩家收到快捷唤醒", !!lastOf(p1, "quickWakeIncoming"));
  ok("旁观玩家未收到快捷唤醒", !lastOf(p2, "quickWakeIncoming"));
  ok("说书人收到服务端接收确认", !!(lastOf(host, "quickWakeAccepted")));

  // 10) 送达回执由目标玩家发出，服务端不能把转发确认当成已送达
  send(p1, ["quickWakeReceipt", { wakeId, roomId: CH }]);
  await wait(120);
  const delivered = lastOf(host, "quickWakeStatus");
  ok("玩家回执后说书人收到 delivered", delivered && delivered[1].status === "delivered");

  // 11) 第三方伪造回复被拒绝
  send(p2, ["quickWakeReply", {
    id: "reply_bad",
    wakeId,
    roomId: CH,
    playerId: "pid2",
    content: "否",
    createdAt: new Date().toISOString(),
  }]);
  await wait(120);
  ok("第三方回复被拒绝", !!(lastOf(p2, "quickWakeError")));

  // 12) 目标玩家回复与唤醒 ID 正确关联
  send(p1, ["quickWakeReply", {
    id: "reply_test_1",
    wakeId,
    roomId: CH,
    playerId: "pid1",
    content: "了解",
    createdAt: new Date().toISOString(),
  }]);
  await wait(150);
  const replied = lastOf(host, "quickWakeStatus");
  ok("说书人收到回复并关联原消息", replied && replied[1].status === "replied" && replied[1].reply.wakeId === wakeId);
  const replyAck = lastOf(p1, "quickWakeReplyAck");
  ok("玩家收到回复确认", replyAck && replyAck[1].id === "reply_test_1");

  // 13) 同一消息 ID 重试不重复投递
  const beforeDuplicate = p1.msgs.filter((m) => m[0] === "quickWakeIncoming").length;
  send(host, ["quickWakeSend", {
    id: wakeId,
    roomId: CH,
    senderPlayerId: "hostpid",
    senderName: "ST",
    targetPlayerId: "pid1",
    targetSeat: 1,
    targetName: "A",
    phase: { kind: "night", night: 2, label: "第2夜" },
    content: "选择 0 名玩家",
    createdAt: new Date().toISOString(),
  }]);
  await wait(120);
  const afterDuplicate = p1.msgs.filter((m) => m[0] === "quickWakeIncoming").length;
  ok("重复消息 ID 不重复投递", afterDuplicate === beforeDuplicate);

  // 14) 离线目标和普通广播绕过都会被拒绝
  send(host, ["quickWakeSend", {
    id: "wake_offline",
    roomId: CH,
    targetPlayerId: "missing",
    content: "不应发送",
    phase: { kind: "day", night: 1, label: "第1个白天" },
    createdAt: new Date().toISOString(),
  }]);
  await wait(100);
  ok("离线目标明确报错", !!(lastOf(host, "quickWakeError")));
  send(p2, ["direct", { pid1: ["quickWakeIncoming", { id: "forged", content: "伪造" }] }]);
  await wait(100);
  const forgedError = [...p2.msgs].reverse().find(([cmd, payload]) =>
    cmd === "quickWakeError" && payload && payload.id === "forged"
  );
  ok("普通 direct 不能绕过快捷唤醒校验", forgedError && forgedError[1].code === "forbidden");
  ok("伪造消息未到达目标玩家", !p1.msgs.some((m) => m[0] === "quickWakeIncoming" && m[1] && m[1].id === "forged"));

  // 15) 玩家发的广播（vote）应转发给 host 和其它玩家
  send(p1, ["vote", [1, true, false]]);
  await wait(150);
  ok("host 收到玩家 vote", !!lastOf(host, "vote"));
  ok("pid2 收到玩家 vote", !!lastOf(p2, "vote"));

  // 16) ping -> pong
  send(p1, ["ping", ["pid1", "latency"]]);
  await wait(150);
  ok("ping 收到 pong", !!lastOf(p1, "pong"));

  // 17) 不存在的房间应拒绝加入，并正常完成拒绝后的关闭
  const p3 = await conn(`${BASE}/ws/888/pid9`);
  ok("不存在的房间 allowJoin=false", await frame(p3, "allowJoin") === false);
  ok("不存在的房间连接被关闭", (await closed(p3)).code === 4004);

  // 18) bye 通知 host
  send(p2, ["bye", "pid2"]);
  await wait(100);
  ok("host 收到 bye", (lastOf(host, "bye") || [])[1] === "pid2");

  // 19) bye 后重新加入，确保主动解散检查覆盖仍登记在房间内的两名玩家
  p2.close();
  await closed(p2);
  const p2Again = await conn(`${BASE}/ws/${CH}/pid2`);
  ok("主动离开后玩家可再次加入", await frame(p2Again, "allowJoin") === true);

  // 20) 主动解散不依赖服务端的 ROOM_GRACE_MS，必须真实关闭玩家并移除大厅房间
  send(host, ["dissolveRoom", null]);
  const [p1Close, p2Close, hostClose] = await Promise.all([closed(p1), closed(p2Again), closed(host)]);
  ok("主动解散玩家均以1000正常关闭", p1Close.code === 1000 && p2Close.code === 1000);
  ok("主动解散玩家收到解散原因", p1Close.reason.includes("解散") && p2Close.reason.includes("解散"));
  ok("主动解散host以1000正常关闭", hostClose.code === 1000);
  const removed = await frame(lobby, "removeRoom", (channel) => channel === CH);
  ok("主动解散大厅收到removeRoom", removed === CH);

  const failed = results.filter((r) => !r[1]);
  console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
  process.exitCode = failed.length ? 1 : 0;
})().finally(() => clients.cleanup()).catch((e) => {
  console.error("TEST CRASH", e);
  process.exitCode = 1;
});
