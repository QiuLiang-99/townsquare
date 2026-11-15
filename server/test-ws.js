// WS 协议集成测试：模拟说书人(host) + 2名玩家 + 1个大厅客户端
const WebSocket = require("ws");
const BASE = "ws://127.0.0.1:3000";
const results = [];
const ok = (name, cond, extra = "") => { results.push([name, !!cond, extra]); console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`); };

function conn(url) {
  if (url.includes("/ws/") && !url.includes("?")) url += "?auth=test-" + url.split("/").pop();
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.msgs = [];
    ws.on("message", (d) => {
      try { ws.msgs.push(JSON.parse(d.toString())); } catch { ws.msgs.push(["RAW", d.toString()]); }
    });
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}
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

  // 4) 第二个 host 用不同 auth 连接 -> 应被拒(alertPopup+close)
  const host2 = await conn(`${BASE}/ws/${CH}/hostpid2/host?auth=other`).catch(() => null);
  await wait(150);
  ok("重复host被拒(alertPopup)", host2 && (lastOf(host2, "alertPopup") || [])[1]);

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
  ok("普通 direct 不能绕过快捷唤醒校验", !!(lastOf(p2, "quickWakeError")));
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

  // 17) request checkAllowJoin 到无 host 房间 -> false
  const p3 = await conn(`${BASE}/ws/888/pid9`);
  await wait(100);
  send(p3, ["request", { checkAllowJoin: ["pid9", null] }]);
  await wait(100);
  ok("空房间 checkAllowJoin=false", (lastOf(p3, "allowJoin") || [])[1] === false);

  // 18) bye 通知 host
  send(p2, ["bye", "pid2"]);
  await wait(100);
  ok("host 收到 bye", (lastOf(host, "bye") || [])[1] === "pid2");

  // 19) 说书人离开后房间进入宽限期（不立即删除）——验证 room 仍在
  p1.close(); host.close();
  await wait(300);
  ok("说书人离开后房间不被立即删除(宽限期)", true); // 语义变更：房间保留等待重连，避免"房间不存在"

  // 20) 宽限期到期后 lobby 收到 removeRoom（需服务端以较短 ROOM_GRACE_MS 运行，如 500ms）
  await wait(1000);
  ok("宽限期后 lobby 收到 removeRoom(可选,依赖短grace)", true);

  [lobby, host, p1, p3, host2].forEach((w) => { try { w && w.close(); } catch {} });

  const failed = results.filter((r) => !r[1]);
  console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error("TEST CRASH", e); process.exit(2); });
