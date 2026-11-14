# TownSquare 自建后端

为 [limpy01/townsquare](https://github.com/limpy01/townsquare) 前端实现的官方私有后端等价服务。
前端原本依赖官方服务器（`ws.botcgrimoire.top` / `api.botcgrimoire.top`），本目录用 Node.js 把它
完整地在本机/自有服务器上复刻出来，从而可以独立部署、自己开服。

## 技术栈

- Node.js 18+（已在 v22.15.0 测试）
- `express`（HTTP API + 静态托管）
- `ws`（WebSocket 中转）
- 无需数据库：房间状态在内存中（重启即清空），与"说书人为权威、状态都在前端"的模型一致

## 启动

```bash
# 1. 安装依赖（前端与后端共用 package.json）
npm install

# 2. 构建前端到 dist/（后端会顺带托管它）
npm run build

# 3. 启动服务器（默认端口 3000，可用环境变量 PORT 覆盖）
node server/index.js
```

启动后打开 `http://<服务器IP>:3000/` 即可使用完整应用。同一台服务器同时提供：
前端页面 + 游戏房间 WebSocket + 大厅 + 头像上传/访问 + 动态配置。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `3000` | 监听端口 |
| `RATE_LIMIT` | `30` | 每连接每秒最多消息帧数（防刷） |
| `AVATAR_DIR` | `server/avatars` | 头像存储目录 |
| `FLOATING_NOTICE` | 空 | 首页浮动公告文本 |
| `SITE_URL` | `https://example.com` | 构建 sitemap 用的站点地址 |

## HTTP API（前端会调用）

| 方法 | 路径 | 说明 | 返回 |
|---|---|---|---|
| GET | `/dynamic/init` | 动态配置 | `{status, payload:{version, floatingNotice}}` |
| POST | `/upload/avatar` | 头像上传 `{playerId, uploadContent:dataURL}` | `{status:"success", avatarUrl}` |
| GET | `/avatars/<file>` | 头像静态资源 | 图片字节 |
| GET | `/healthz` | 健康检查 | `{ok, rooms, uptime}` |

## WebSocket 协议

前端 `src/store/socket.js` 的所有帧都是 JSON 数组 `[command, params, feedback?]`。

### 连接地址

- 游戏房间：`ws://<host>:<port>/ws/<channel>/<playerId>`
- 说书人（host）：`ws://<host>:<port>/ws/<channel>/<playerId>/host?auth=<stSecret>`
- 大厅：`ws://<host>:<port>/lobby/<playerId>`

`channel` 是 1–10000 的数字房间号。host 用 `stSecret` 鉴权，防止他人顶替说书人。

### 三类特殊帧

1. **`direct` 定向投递**：`["direct", { "<目标id或host>": ["命令", 参数] }]`
   服务端按 key 拆包，仅投递给目标连接（用于私聊、发牌、私密信息）。
2. **`request` 请求**：`["request", { "<子命令>": [playerId, 参数] }]`
   子命令：`checkAllowHost`（开房是否允许）、`checkAllowJoin`（加入是否允许）、`deleteMessage`（消息确认）。
3. **`uploadFile` 经 socket 上传头像**：`["uploadFile", { "uploadAvatar": [playerId, dataURL] }]`
   服务端存盘后回 `["avatarReceived", "/avatars/<playerId>.<ext>"]`。

### 广播命令

除上述三类外，所有命令（`gs` 全量状态 / `player` / `nomination` / `vote` / `lock` / `swap` /
`move` / `remove` / `chat` / `addGroupChat` / `fabled` / `isNight` / `votingSpeed` / `secretVote` /
`setTimer` / `isReview` …）都是**原样广播给房间内除发送者外的所有连接**。游戏逻辑不在后端，
前端说书人（host）是唯一权威状态源，玩家只接收。

### 房间生命周期

- host 连入 → 校验 auth → 回 `allowHost:true`；房间进入大厅（`addRoom` 广播给所有 lobby 客户端）
- 玩家连入 → 依据是否有 host 回 `allowJoin`
- 玩家离开 / `bye` → 通知 host 减人；host 离开 → 清空 host
- 房间空 → 回收，`removeRoom` 广播

## 集成测试

```bash
node server/test-ws.js     # 需先启动 node server/index.js
```

覆盖：大厅房间列表、host 鉴权、重复 host 拒绝、玩家加入、状态广播、direct 定向、vote 转发、
ping/pong、空房 checkAllowJoin、bye、房间关闭 removeRoom —— 共 18 项断言。

## 前端改动点（已改）

| 文件 | 改动 |
|---|---|
| `src/store/socket.js` | 游戏 WS / 大厅 WS 默认改为同源 `location.host`，可用 `window.__TS_WS__` / `window.__TS_LOBBY__` 覆盖 |
| `src/store/index.js` | `/dynamic/init` 改为同源，可用 `window.__TS_API__` 覆盖 |
| `src/components/ImageCropper.vue` | `/upload/avatar` 改为同源 |
| `src/components/Player.vue`、`src/store/modules/players.js` | 头像 URL 改为相对 `/avatars/`，可用 `window.__TS_AVATARS__` 覆盖主机 |

默认全部同源：一个服务器、一个端口即可跑起整套应用。若要前后端分域部署，在页面加载前
注入 `window.__TS_API__` / `window.__TS_WS__` / `window.__TS_AVATARS__` 指向后端地址即可。
