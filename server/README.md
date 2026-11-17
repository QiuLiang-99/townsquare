# TownSquare 自建后端

为 [limpy01/townsquare](https://github.com/limpy01/townsquare) 前端提供自建 HTTP 与 WebSocket 服务。前端原先使用 `ws.botcgrimoire.top` / `api.botcgrimoire.top`；这里描述的是当前工作树的实现与使用前提，不承诺复刻官方私有服务的全部行为。上游署名与许可证仍见根 [package.json](../package.json) 和 [LICENSE](../LICENSE)。

完整接口、字段和当前权限边界见 [协议清单](../docs/protocol.md)，状态归属见 [架构说明](../docs/architecture.md)，验证方式见 [测试说明](../docs/testing.md)，容器、持久化卷与反向代理见 [部署说明](../deploy/README.md)。未实现的改进在 [TODO](../TODO.md) 跟踪。

## 从构建到启动

推荐 **Node.js 22**。后端使用 CommonJS、Express、`ws` 及 Node 内置 `fetch`；前后端共用根目录的 package.json 和锁文件。请在仓库根目录执行：

```sh
npm ci --no-audit --no-fund
npm run build
node server/index.js
```

默认打开 `http://localhost:3000/`。一个 HTTP 服务同源提供构建后的页面、游戏/大厅 WS、配置与资源接口。启动时没有 `dist/` 则只提供后端 API 和根路径运行提示；构建后需重启后端才能启用静态托管。根页面、index.html 和 SPA HTML 兜底禁缓存；其余文件沿用静态中间件行为。

`npm run serve` 只启动 Vue 开发服务，当前没有开发代理，不能把它当作完整同源启动路径。游戏与大厅可通过页面初始化前注入 `window.__TS_WS__` / `window.__TS_LOBBY__` 覆盖（值包含 `/ws/` / `/lobby/` 及末尾斜杠）；`window.__TS_API__` 供部分配置请求使用，`window.__TS_AVATARS__` 供头像地址使用。这些覆盖不自动重写所有相对 HTTP 请求；头像上传、图片代理等仍需考虑页面来源和路由。完整配置前提见部署说明。

## 环境变量

| 变量 | 默认值 | 实际用途 |
|---|---|---|
| `PORT` | `3000` | HTTP 与 WS 共用监听端口，按十进制 parseInt |
| `RATE_LIMIT` | `30` | 每连接约一秒窗口内最多处理的数据帧数；超限静默丢弃，没有限流错误响应 |
| `AVATAR_DIR` | 根目录下 `server/avatars` 的绝对路径 | 头像磁盘目录，启动时递归创建；自定义相对路径相对于启动进程的工作目录，部署建议用绝对路径并挂持久化卷 |
| `ROOM_GRACE_MS` | `60000` | **无 host 且 players.size 为 0** 时才安排的空房回收宽限期，毫秒；并不是所有 host 断开后的固定房间寿命 |
| `FLOATING_NOTICE` | 空字符串 | `/dynamic/init` 与 `/api/init` 返回的浮动公告 |
| `APP_VERSION` | 读取失败时为 `0.0.0` | **仅 fallback**：只有读取/解析根 package.json 抛错时才使用此环境变量；正常版本始终取 package.json.version，不能用它覆盖正常版本 |
| `SITE_URL` | `https://example.com` | **构建变量**，由 postbuild 的 `scripts/generate-sitemap.js` 写入 sitemap；不是服务端运行时站点地址或 WS 配置 |

数字配置没有统一的有效范围检查，部署时请使用有效数字。PowerShell 示例：

```powershell
$env:PORT = "3000"
$env:ROOM_GRACE_MS = "60000"
$env:AVATAR_DIR = "E:\townsquare-data\avatars"
node server/index.js
```

对外 HTTPS/WSS 通常由反向代理终止 TLS；代理需支持 WebSocket Upgrade。后端本身用 `http.createServer`，不会因为页面使用 HTTPS 自动加载证书。

## HTTP 与外部资源

| 接口 | 用途与主要响应 |
|---|---|
| GET `/dynamic/init`、GET `/api/init` | `{status:"success",payload:{version,floatingNotice}}` |
| POST `/upload/avatar` | JSON `{playerId,uploadContent:dataURL}`，成功 `{status:"success",avatarUrl}` |
| GET `/avatars/<file>` | 头像字节，静态缓存 7 天 |
| GET `/healthz` | `{ok:true,rooms,uptime}`；rooms 包含保留中的空房 |
| GET `/api/fetch-image?url=...` | HTTPS 剧本图代理，初始域名仅 `7uuu.me` / `www.7uuu.me`，需服务器访问外网 |
| GET `/api/wiki-icons`（可选 `?refresh=1`） | BWIKI 角色图片索引 `{status,count,map}`，依赖 `wiki.biligame.com`，索引内存缓存 24 小时 |
| GET `/`、dist 静态路径与剩余 GET 兜底 | 有 dist 时托管应用；无 dist 时根路径返回后端提示 |

全局 CORS 已启用，HTTP JSON body 上限 6 MB，头像解码后上限 2 MiB。头像上传没有身份归属验证，仅清理文件名并写盘，不验证真实图片内容；同文件名会覆盖。图代理先完整读入内存再检查 20 MiB 上限，当前跟随重定向但未再次检查目标域名，也没有应用层超时；不要把初始白名单理解成完整的外部请求隔离保证。完整请求/响应、错误状态与静态未命中行为见协议清单。

## WS 身份与消息

```text
玩家/观众：ws(s)://<host>/ws/<channel>/<playerId>?auth=<browserSecret>
说书人：  ws(s)://<host>/ws/<channel>/<playerId>/host?auth=<browserSecret>
大厅：    ws(s)://<host>/lobby/<playerId>
```

游戏房间号需转成 1–10000 的整数；两种游戏连接**都必须携带 auth**。浏览器使用 session.stSecret 保存随机 secret。`playerId` 和 `stId` 是公开标识，不能用作凭证；大厅连接没有游戏 auth。玩家不能创建不存在的房间；首次加入时绑定 playerId 与 auth，后续同 ID 要匹配凭证，正确凭证重连会替换旧玩家连接。

说书人在线时，同 auth 的新连接会接管当前 host，**可使用不同 playerId，且目前不主动关闭旧 host socket**。说书人已离线而房间仍保留时，则必须同时匹配保存的 playerId 和 auth。两种场景条件不同。普通路由尚未统一验证发送连接仍为当前成员/host；quickWake 专用通道执行了更严格的当前 socket 检查。

应用帧为 `[command,params,feedback?]`，三种封装是：

- `direct`：`{[targetId或"host"]:[command,params]}`，拆包后只投递目标在线连接，不保存离线消息；存在 feedback 时，即使目标缺席也立即确认发送者。
- `request`：`{[subCommand]:[playerId,params]}`，子命令为 checkAllowHost、checkAllowJoin、deleteMessage；后者会向全房间广播原始消息 ID 的 feedback。
- `uploadFile`：`{uploadAvatar:[playerId,dataURL]}`，写盘后返回 avatarReceived；独立于 HTTP 上传格式。

除专用路由外，普通命令走向其他成员的通用广播，没有统一命令白名单、角色/座位权限或字段校验。客户端的“仅说书人”“仅本人投票”等限制不能视为后端保证。普通反馈只代表队列确认，不能证明接收方已收到/读到；旧聊天队列每 1.5 秒重发，非全协议恰好一次交付。

快速唤醒使用独立 `quickWakeSend/Reply/Receipt/SyncRequest/Seats` 路由，所有 `quickWake*` 名字禁止经 direct 或普通广播注入。Accepted 只表示服务端接受，Delivered 来自目标玩家的 Receipt，回复有 ReplyAck；状态和记录保存在房间内存中。具体字段、ID 冲突、错误码、2 秒 outbox 重试与尚未接通的玩家重连重放见协议清单。

## 状态与回收

房间在服务端内存中包含在线连接、身份绑定、大厅元数据、lastGs、盲抽/复盘片段、快速唤醒记录与座位 ID 集合。服务重启会丢失；头像是磁盘文件，浏览器的游戏/偏好恢复又属于各自本地存储，三者不能混为服务端存档。说书人仍承担大部分游戏状态和规则编排，后端不提供完整规则裁决。

`lastGs` 只缓存说书人的**完整普通广播**（有 gamestate 数组且非 lightweight）；定向 gs、lightweight、player/vote/swap 等增量不会更新它。新玩家可能先收到过时公开快照，再请求在线 host 的状态；不能保证 host 离线时拿到最新状态或完整私密魔典。盲抽/复盘的独立缓存当前没有连接时自动回放路径。

房间只有在**无 host 且无玩家**时才 schedule cleanup，默认再等 60000 ms，并于到期检查是否仍空。host 离开但仍有玩家时继续保留；合法重连会取消待回收。说书人主动 dissolveRoom 则立即删除房间、向大厅 removeRoom，以正常关闭码 1000 关闭所有成员；玩家收到解散原因。宽限期内空房仍可能显示在大厅，人数是连接数（含 host），不是座位数。

游戏客户端对非 1000 关闭通常每 3 秒重连，初次 allow 等待 15 秒；鉴权错误当前也没有统一的停止重试策略。应用 ping 每 3 秒用于延迟展示，后端协议层 ping/pong 每 30 秒巡检连接；这两种心跳含义不同。SIGINT/SIGTERM 会先用 1001 关闭连接，再退出进程。

## 验证入口

从根目录使用以下入口；实际执行结果与覆盖盲点由 [测试说明](../docs/testing.md) 维护，本文不声明未执行的检查已经通过。

```sh
npm run check:server
npm run test:quick-wake
npm run test:room-lifecycle
```

`test:quick-wake` 保持现有单元、状态和协议测试组；`test:room-lifecycle` 的入口为 `node server/test-room-lifecycle.js`，测试自行启动隔离服务。它们不要求使用你日常的房间服务。

基础 WS 集成测试需要另外启动一个 **3000 端口真实服务**，再在另一终端运行：

```sh
node server/test-ws.js
```

基础测试以主动 dissolveRoom 验证解散与大厅移除，不依赖把日常服务的 ROOM_GRACE_MS 调短。完整安装、语法检查、lint、构建与多浏览器手工验收流程见测试说明；不要把语法检查当成协议行为测试。
