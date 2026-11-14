/**
 * TownSquare 自建后端
 * ---------------------------------------------------------------
 * 为 limpy01/townsquare 前端实现官方私有后端 (api.botcgrimoire.top + ws.botcgrimoire.top) 的等价服务。
 *
 * 组成：
 *   1) HTTP API
 *        - GET  /dynamic/init       动态配置 (version / floatingNotice)
 *        - POST /upload/avatar      头像上传 (base64 -> 存盘 -> 返回 url)
 *        - GET  /avatars/<file>     头像静态资源
 *        - GET  /healthz            健康检查
 *   2) WebSocket 两个命名空间 (同端口，按路径前缀区分)
 *        - /ws/<channel>/<playerId>[/host?auth=<stSecret>]   游戏房间中转
 *        - /lobby/<playerId>                                 大厅房间列表
 *   3) 静态托管：构建后的前端 dist/ (可选，存在才托管)
 *
 * 协议要点（与前端 src/store/socket.js 对齐）：
 *   - 所有帧是 JSON 数组 [command, params, feedback?]
 *   - 房间内两种角色：host=说书人（权威，带 ?auth=stSecret 鉴权）、其余为玩家/观众
 *   - "direct" 帧： { <targetPlayerId|"host">: [command, params] } —— 服务端按 key 拆包投递
 *   - "request" 帧： { <command>: [playerId, params] } —— 目前用于 checkAllowHost / checkAllowJoin / deleteMessage
 *   - "uploadFile" 帧： { <command>: [playerId, params] } —— 头像走这里时把图片存盘并回 "avatarReceived"
 *   - ping / pong / bye 玩家计数与延迟
 *
 * 设计原则：本服务是**无状态中继 + 轻量状态协调**，不做游戏逻辑（游戏状态全部在前端 host）。
 */
"use strict";

const path = require("path");
const fs = require("fs");
const http = require("http");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const WebSocket = require("ws");
const WebSocketServer = WebSocket.Server || WebSocket.WebSocketServer;

// ------------------------------------------------------------------ 配置
const PORT = parseInt(process.env.PORT || "3000", 10);
const WS_HEARTBEAT_MS = 30 * 1000; // 30s 心跳
const RATE_LIMIT_PER_SEC = parseInt(process.env.RATE_LIMIT || "30", 10);
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // base64 解码后上限 2MB
const CHANNEL_MIN = 1;
const CHANNEL_MAX = 10000;

const ROOT = path.resolve(__dirname, "..");
const AVATAR_DIR = process.env.AVATAR_DIR || path.join(ROOT, "server", "avatars");
const DIST_DIR = path.join(ROOT, "dist");

if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });

// ------------------------------------------------------------------ 内存状态
/**
 * rooms[channel] = {
 *   host: { ws, playerId, connectedAt } | null,
 *   players: Map<playerId, { ws, ping, connectedAt, playerCount }>,
 *   createdAt,
 * }
 * 重启即失——与前端"本地 + 说书人为权威"的模型一致；如需持久化可外挂 SQLite。
 */
const rooms = new Map();
/** lobbyClients: Set<{ ws, playerId, roomsSnapshot }> */
const lobbyClients = new Set();

// 房间宽限期（毫秒）：说书人断开后，房间保留这么久等待重连，避免瞬间消失。
const ROOM_GRACE_MS = parseInt(process.env.ROOM_GRACE_MS || "60000", 10);
/** roomCleanupTimers: Map<channel, timeoutId> */
const roomCleanupTimers = new Map();

function scheduleRoomCleanup(channel) {
  const existing = roomCleanupTimers.get(channel);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    roomCleanupTimers.delete(channel);
    const room = rooms.get(channel);
    if (room && !room.host && room.players.size === 0) {
      rooms.delete(channel);
      notifyLobbyRemove(channel);
      log("room closed", channel);
    }
  }, ROOM_GRACE_MS);
  if (t.unref) t.unref();
  roomCleanupTimers.set(channel, t);
}

function cancelRoomCleanup(channel) {
  const existing = roomCleanupTimers.get(channel);
  if (existing) {
    clearTimeout(existing);
    roomCleanupTimers.delete(channel);
  }
}

// ------------------------------------------------------------------ 工具
const log = (...a) => console.log("[ts]", new Date().toISOString(), ...a);

/** 把 [command, params, feedback] 序列化成帧 */
function frame(command, params, feedback) {
  return JSON.stringify(feedback === undefined ? [command, params] : [command, params, feedback]);
}

/** 安全发送 */
function send(ws, command, params, feedback) {
  if (ws && ws.readyState === 1 /* OPEN */) {
    try {
      ws.send(frame(command, params, feedback));
    } catch (e) {
      log("send error", e.message);
    }
  }
}

/** 给房间内所有人（除 except 外）广播 */
function broadcastRoom(room, command, params, except = null) {
  const data = frame(command, params);
  if (room.host && room.host.ws !== except) trySafeSend(room.host.ws, data);
  room.players.forEach((p) => {
    if (p.ws !== except) trySafeSend(p.ws, data);
  });
}

function trySafeSend(ws, data) {
  if (ws && ws.readyState === 1) {
    try {
      ws.send(data);
    } catch (e) {
      log("broadcast error", e.message);
    }
  }
}

function parseChannel(pathname) {
  // pathname 形如 /ws/3/abc.html 或 /ws/3/abc/host
  const parts = pathname.split("/").filter(Boolean); // ["ws","3","abc","host"]
  return { ns: parts[0], channel: parts[1], playerId: parts[2], isHost: parts[3] === "host" };
}

function validChannel(ch) {
  const n = Number(ch);
  return Number.isInteger(n) && n >= CHANNEL_MIN && n <= CHANNEL_MAX;
}

/** 房间人数（玩家 + 说书人，用于 lobby 展示） */
function roomPlayerCount(room) {
  let n = room.players.size;
  if (room.host) n += 1;
  return n;
}

// ------------------------------------------------------------------ 大厅广播
function lobbySnapshot() {
  const list = [];
  rooms.forEach((room, channel) => {
    list.push({ channel: String(channel), players: roomPlayerCount(room) });
  });
  return list;
}

function notifyLobbyAdd(channel) {
  const data = frame("addRoom", String(channel));
  lobbyClients.forEach((c) => trySafeSend(c.ws, data));
}
function notifyLobbyRemove(channel) {
  const data = frame("removeRoom", String(channel));
  lobbyClients.forEach((c) => trySafeSend(c.ws, data));
}

// ------------------------------------------------------------------ HTTP 服务
const app = express();
app.use(cors());
app.use(express.json({ limit: "6mb" })); // 头像 base64 可能较大

// 动态配置
app.get("/dynamic/init", (req, res) => {
  res.json({
    status: "success",
    payload: {
      version: "3.3.1",
      floatingNotice: process.env.FLOATING_NOTICE || "",
    },
  });
});

// 旧注释里曾用 /api/init，一并兼容
app.get("/api/init", (req, res) => {
  res.json({
    status: "success",
    payload: { version: "3.3.1", floatingNotice: process.env.FLOATING_NOTICE || "" },
  });
});

// 头像上传
app.post("/upload/avatar", (req, res) => {
  try {
    const { playerId, uploadContent } = req.body || {};
    if (!playerId || typeof playerId !== "string") {
      return res.status(400).json({ status: "error", message: "missing playerId" });
    }
    if (!uploadContent || typeof uploadContent !== "string" || !uploadContent.startsWith("data:image/")) {
      return res.status(400).json({ status: "error", message: "invalid uploadContent" });
    }
    const m = /^data:image\/(\w+);base64,(.+)$/s.exec(uploadContent);
    if (!m) return res.status(400).json({ status: "error", message: "not base64 image" });
    const ext = m[1] === "jpeg" ? "jpg" : m[1];
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > MAX_AVATAR_BYTES) {
      return res.status(413).json({ status: "error", message: "image too large" });
    }
    // 文件名使用 playerId（前端 _avatarReceived 会以 link.split('.')[0] 与 playerId 比对）
    const safeId = playerId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "anon";
    const fileName = `${safeId}.${ext}`;
    fs.writeFileSync(path.join(AVATAR_DIR, fileName), buf);
    const avatarUrl = `/avatars/${fileName}`;
    log("avatar saved", fileName, buf.length, "bytes");
    return res.json({ status: "success", avatarUrl });
  } catch (e) {
    log("upload/avatar error", e.stack || e.message);
    return res.status(500).json({ status: "error", message: "server error" });
  }
});

// 头像静态资源
app.use("/avatars", express.static(AVATAR_DIR, { maxAge: "7d" }));

// 健康检查
app.get("/healthz", (req, res) => {
  res.json({ ok: true, rooms: rooms.size, uptime: process.uptime() });
});

// 托管前端构建产物（若存在 dist/）
if (fs.existsSync(DIST_DIR)) {
  // index.html 绝不缓存：它总是要指向最新的带 hash 的 JS/CSS 包。
  // 否则用户浏览器可能一直用旧的 index.html → 加载旧 bundle（例如早期 1 秒超时的版本
  // 会导致"加入房间显示房间不存在"）。带 hash 的静态资源可以长缓存，但 HTML 必须每次校验。
  app.get("/", (req, res, next) => {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.sendFile(path.join(DIST_DIR, "index.html"), (err) => err && next(err));
  });
  // 其余静态资源：带 hash 的 js/css 长缓存；index.html 由上面的路由处理
  app.use(
    express.static(DIST_DIR, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("index.html")) {
          res.set("Cache-Control", "no-cache, no-store, must-revalidate");
        }
      },
    })
  );
  // SPA 兜底（本项目无路由，但保留以免刷新 404）
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/ws") || req.path.startsWith("/lobby")) return next();
    if (req.path.startsWith("/js/") || req.path.startsWith("/css/")) return next();
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
  log("serving static dist from", DIST_DIR);
} else {
  app.get("/", (req, res) => {
    res.type("text/plain").send(
      "TownSquare backend running.\n" +
        "HTTP: /dynamic/init, /upload/avatar, /avatars/*, /healthz\n" +
        "WS:   /ws/<channel>/<playerId>[/host?auth=...]  and  /lobby/<playerId>\n" +
        "（未发现 dist/，仅提供后端 API）"
    );
  });
}

const server = http.createServer(app);

// ------------------------------------------------------------------ WebSocket
// 单个 WebSocketServer(noServer) 处理全部路径，按 pathname 分派。
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  let pathname;
  try {
    pathname = new URL(req.url, "http://local").pathname;
  } catch {
    socket.destroy();
    return;
  }
  const parts = pathname.split("/").filter(Boolean);
  const ns = parts[0];

  if (ns !== "ws" && ns !== "lobby") {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }

  // 房间号合法性（仅 /ws）
  if (ns === "ws" && !validChannel(parts[1])) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    ws._ts = { ns, req, pathname };
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws, req) => {
  const { ns, pathname } = ws._ts;
  ws.isAlive = true;
  ws.rateBucket = { count: 0, resetAt: Date.now() + 1000 };

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  if (ns === "lobby") {
    handleLobbyConnection(ws, pathname);
  } else {
    handleRoomConnection(ws, pathname, req);
  }

  ws.on("message", (raw) => {
    // 限流
    const now = Date.now();
    if (now > ws.rateBucket.resetAt) ws.rateBucket = { count: 0, resetAt: now + 1000 };
    ws.rateBucket.count += 1;
    if (ws.rateBucket.count > RATE_LIMIT_PER_SEC) return; // 丢弃超限帧

    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!Array.isArray(msg)) return;
    const [command, params, feedback] = msg;

    if (ns === "lobby") {
      // 大厅目前不需要处理客户端帧（前端只收）
      return;
    }
    routeRoomMessage(ws, command, params, feedback);
  });

  ws.on("close", () => onWsClose(ws));
  ws.on("error", (e) => log("ws error", e.message));
});

// 心跳巡检
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      try {
        ws.terminate();
      } catch {}
      return;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {}
  });
}, WS_HEARTBEAT_MS);

// ------------------------------------------------------------------ 大厅连接
function handleLobbyConnection(ws, pathname) {
  const parts = pathname.split("/").filter(Boolean); // ["lobby", playerId]
  const playerId = parts[1] || crypto.randomBytes(6).toString("hex");
  const client = { ws, playerId };
  lobbyClients.add(client);
  ws._lobbyClient = client;
  // 连上即下发当前房间列表
  send(ws, "setRooms", lobbySnapshot());
  log("lobby connect", playerId, "clients:", lobbyClients.size);
}

// ------------------------------------------------------------------ 房间连接
function handleRoomConnection(ws, pathname, req) {
  const { channel, playerId, isHost } = parseChannel(pathname);
  const url = new URL(req.url, "http://local");
  const auth = url.searchParams.get("auth") || "";

  let room = rooms.get(channel);
  const isNewRoom = !room;

  ws._room = { channel, playerId, isHost, auth };

  if (isHost) {
    // 说书人建房：只有 host 才真正创建房间对象（玩家连入不存在的房不会建幽灵房）
    if (!room) {
      room = { host: null, players: new Map(), createdAt: Date.now(), everHadHost: false };
      rooms.set(channel, room);
    }
    cancelRoomCleanup(channel);
    // 说书人接管：若已有 host 且 auth 不同则拒绝（防重复 host）
    if (room.host && room.host.auth !== auth) {
      send(ws, "alertPopup", "该房间已有说书人，无法接管。");
      try {
        ws.close(4009, "host already exists");
      } catch {}
      return;
    }
    room.host = { ws, playerId, auth, connectedAt: Date.now() };
    room.everHadHost = true;
    log("host connect channel", channel, "playerId", playerId);
    // 客户端会主动 _request checkAllowHost；此处直接回允许（重复 host 已在上面拦截）
    send(ws, "allowHost", true);
    // host 不会重复加入 players；若此 playerId 之前以玩家身份在房间，移除
    if (room.players.has(playerId)) {
      const old = room.players.get(playerId);
      room.players.delete(playerId);
      if (old.ws !== ws) {
        try {
          old.ws.close(4001, "promoted to host");
        } catch {}
      }
    }
    if (isNewRoom) notifyLobbyAdd(channel);
  } else {
    // 玩家/观众：房间必须已存在（有说书人建过）。不存在则直接拒绝，不建幽灵房。
    if (!room || !room.everHadHost) {
      log("player join nonexistent channel", channel, "playerId", playerId);
      send(ws, "allowJoin", false);
      // 稍后关闭，避免悬挂连接（先让它收到 allowJoin=false）
      setTimeout(() => {
        try {
          ws.close(4004, "room not found");
        } catch {}
      }, 100);
      return;
    }
    cancelRoomCleanup(channel);
    // 同 playerId 重复连接则踢掉旧连接
    if (room.players.has(playerId)) {
      const old = room.players.get(playerId);
      if (old.ws !== ws) {
        try {
          old.ws.close(4000, "duplicate playerId");
        } catch {}
      }
    }
    room.players.set(playerId, { ws, ping: 0, connectedAt: Date.now() });
    log("player connect channel", channel, "playerId", playerId, "players:", room.players.size);
    // 客户端会 _request checkAllowJoin；此处按房间是否存在(曾有过host)回答
    send(ws, "allowJoin", true);
  }
}

/**
 * 处理房间内客户端消息。核心：转发、direct 拆包、request 处理、ping/bye 计数。
 */
function routeRoomMessage(ws, command, params, feedback) {
  const meta = ws._room;
  if (!meta) return;
  const room = rooms.get(meta.channel);
  if (!room) return;

  switch (command) {
    // ---- 中转：原样广播给房间其他人（含 host）----
    case "direct": {
      // params: { <targetId|"host">: [command, params] }
      if (!params || typeof params !== "object") return;
      Object.keys(params).forEach((targetId) => {
        const sub = params[targetId];
        if (!Array.isArray(sub)) return;
        const [subCmd, subParams] = sub;
        if (targetId === "host") {
          if (room.host && room.host.ws !== ws) {
            send(room.host.ws, subCmd, subParams, feedback);
          }
        } else {
          const target = room.players.get(targetId);
          if (target && target.ws !== ws) {
            send(target.ws, subCmd, subParams, feedback);
          }
        }
      });
      return;
    }

    case "request": {
      // params: { <subCommand>: [playerId, subParams] }
      if (!params || typeof params !== "object") return;
      Object.keys(params).forEach((subCommand) => {
        const [playerId, subParams] = params[subCommand] || [];
        handleRequest(ws, room, meta, subCommand, playerId, subParams, feedback);
      });
      return;
    }

    case "uploadFile": {
      // params: { <command>: [playerId, base64] } —— 头像走 socket 上传
      if (!params || typeof params !== "object") return;
      Object.keys(params).forEach((subCommand) => {
        const [playerId, dataUrl] = params[subCommand] || [];
        handleSocketUpload(ws, playerId, subCommand, dataUrl, feedback);
      });
      return;
    }

    case "ping": {
      // params: [playerIdOrCount, "latency"]
      // 服务端把玩家 ping 记录下来，并回 pong 让前端算延迟
      const [who, latency] = Array.isArray(params) ? params : [];
      const p = room.players.get(who);
      if (p) p.ping = Date.now();
      // 回 pong（前端 _handlePong 只置 _isAlive=true）
      send(ws, "pong", latency || 0);
      // 如果是 host，顺便把玩家数分别回给 host/玩家由前端自行计数；这里不额外广播
      return;
    }

    case "bye": {
      // 玩家主动离开
      const playerId = params;
      room.players.delete(playerId);
      // 通知 host 更新人数
      if (room.host) send(room.host.ws, "bye", playerId);
      return;
    }

    default: {
      // 其余所有游戏广播命令（gs/player/nomination/vote/lock/swap/move/remove/
      // chat/addGroupChat/fabled/isNight/votingSpeed/... ）一律原样转发给房间内
      // 除发送者外的所有连接（host 发出的给所有玩家，玩家发出的给 host 及其他玩家）。
      broadcastRoom(room, command, params, ws);
      return;
    }
  }
}

// request 子命令处理
function handleRequest(ws, room, meta, subCommand, playerId, subParams, feedback) {
  switch (subCommand) {
    case "checkAllowHost":
      // 说书人请求开房：若已有其它 host 则拒绝
      if (room.host && room.host.ws !== ws) {
        send(ws, "allowHost", false);
      } else {
        if (!room.host) {
          room.host = { ws, playerId, auth: meta.auth, connectedAt: Date.now() };
          room.everHadHost = true;
          cancelRoomCleanup(meta.channel);
        }
        send(ws, "allowHost", true);
      }
      break;
    case "checkAllowJoin":
      // 只要该房间曾经/现在有说书人（含说书人重连宽限期）就允许加入。
      // 单纯由玩家自己刚连上而新建的空房间不算，避免误判为存在。
      send(ws, "allowJoin", !!(room.everHadHost || room.host));
      break;
    case "deleteMessage":
      // 消息已投递确认，无需服务端额外动作（前端据此删除本地队列）
      // 回一个 feedback 帧确认
      if (feedback !== undefined && feedback !== false) {
        send(ws, "feedback", feedback);
      }
      break;
    default:
      // 未知 request：忽略
      break;
  }
}

// socket 上传头像
function handleSocketUpload(ws, playerId, subCommand, dataUrl, feedback) {
  if (subCommand !== "uploadAvatar") return;
  try {
    const m = /^data:image\/(\w+);base64,(.+)$/s.exec(dataUrl || "");
    if (!m) return;
    const ext = m[1] === "jpeg" ? "jpg" : m[1];
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > MAX_AVATAR_BYTES) return;
    const safeId = String(playerId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "anon";
    const fileName = `${safeId}.${ext}`;
    fs.writeFileSync(path.join(AVATAR_DIR, fileName), buf);
    // 回 avatarReceived，link 需以 playerId 开头（前端 link.split('.')[0] === playerId）
    send(ws, "avatarReceived", `/avatars/${fileName}`, feedback);
  } catch (e) {
    log("socket upload error", e.message);
  }
}

// 连接关闭清理
function onWsClose(ws) {
  const meta = ws._room;
  if (meta) {
    const room = rooms.get(meta.channel);
    if (room) {
      if (meta.isHost && room.host && room.host.ws === ws) {
        room.host = null;
        room.hostLeftAt = Date.now();
        log("host leave channel", meta.channel);
        // 说书人暂时离开（可能是网络抖动/隧道断连重连）：保留房间一段宽限期，
        // 避免瞬间删除房间导致其它玩家加入时报"房间不存在"。
      } else if (!meta.isHost) {
        const p = room.players.get(meta.playerId);
        if (p && p.ws === ws) {
          room.players.delete(meta.playerId);
          if (room.host) send(room.host.ws, "bye", meta.playerId);
          log("player leave channel", meta.channel, meta.playerId, "players:", room.players.size);
        }
      }
      // 空房间回收：说书人离开时给一个宽限期（等待其重连），宽限期内保留房间，
      // 避免玩家加入时误报"房间不存在"。玩家全走且host也走时同样走宽限。
      if (!room.host && room.players.size === 0) {
        scheduleRoomCleanup(meta.channel);
      }
    }
  }
  const lc = ws._lobbyClient;
  if (lc) {
    lobbyClients.delete(lc);
    log("lobby disconnect", lc.playerId, "clients:", lobbyClients.size);
  }
}

// ------------------------------------------------------------------ 启动
server.listen(PORT, () => {
  log(`HTTP + WS listening on http://0.0.0.0:${PORT}`);
  log(`  game ws : ws://<host>:${PORT}/ws/<channel>/<playerId>[/host?auth=...]`);
  log(`  lobby ws: ws://<host>:${PORT}/lobby/<playerId>`);
  log(`  avatars : ${AVATAR_DIR}`);
});

// 优雅退出
function shutdown(signal) {
  log(`${signal} received, shutting down`);
  clearInterval(heartbeat);
  wss.clients.forEach((c) => {
    try {
      c.close(1001, "server shutdown");
    } catch {}
  });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
