# HTTP 与 WebSocket 协议

本文描述当前工作树的实现，以 [server/index.js](../server/index.js) 的 HTTP 路由、连接处理与 `routeRoomMessage`，以及 [src/store/socket.js](../src/store/socket.js) 的发送方法、接收分支和 mutation 订阅为依据。参数形状有歧义时补查对应 Vuex mutation；不以旧 README 或官方私有服务推断行为。状态归属见 [架构说明](architecture.md)，测试入口与覆盖见 [测试说明](testing.md)，部署见 [部署说明](../deploy/README.md)，待改进项见 [TODO](../TODO.md)。

## 1. 范围与记法

- `S`：本 Node 后端；`H`：说书人浏览器；`P`：普通玩家或观众浏览器。代码中 `_isSpectator === true` 包括已落座玩家，并不只指旁观者。
- `B`：普通广播，发送给房间内除发送连接外的 host 与 players；`D(id)`：`direct` 定向，`D(host)` 为当前 host 连接；`R`：`request`；`U`：`uploadFile`。
- 下表的“方向”是当前客户端的正常用法。标为 `G` 的校验表示服务端仅走通用转发；**客户端的 H/P、本人座位、投票阶段等检查并不是服务端权限保证**。
- 表中 `—` 表示该通道没有专用服务端缓存、ack 或自动重试；完整公开 `gs` 可能另行携带同一业务的快照，不等于增量消息已被服务端合并。

后端不是完整游戏规则权威，也不是纯无状态中继。它在内存里保存房间、在线连接、身份绑定、大厅元数据、部分公开快照、盲抽/复盘片段、快速唤醒记录与座位 ID 集合；重启丢失这些数据。角色分配、座位确认、投票与群聊编排等主要由 H 的 Vuex 状态和业务逻辑承担。

## 2. HTTP 清单

全局启用 `cors()` 与 `express.json({limit:"6mb"})`。这些端点没有用户登录鉴权；JSON 解析失败、请求体超过 6 MB 等中间件错误使用 Express 默认错误响应，不能统一当作下表的 JSON 错误格式。GET 路由和静态资源还可由 Express 响应 HEAD，CORS 中间件处理预检 OPTIONS。

| 方法与路径 | 请求 | 成功响应 | 实际限制、错误与外部依赖 |
|---|---|---|---|
| GET `/dynamic/init` | 无 | `{status:"success",payload:{version,floatingNotice}}` | `version` 优先读取根 `package.json.version`；只有读取/解析该文件抛错时才采用 `APP_VERSION` 环境变量，未设则 `0.0.0`。文件可读但无 version 时仍为 `0.0.0`。公告取 `FLOATING_NOTICE` 或空串 |
| GET `/api/init` | 无 | 同 `/dynamic/init` | 兼容别名，无独立配置来源 |
| POST `/upload/avatar` | JSON `{playerId,uploadContent}`；后者为 `data:image/<扩展名>;base64,<内容>` | `{status:"success",avatarUrl:"/avatars/<safeId>.<ext>"}` | `playerId` 必须为非空字符串；仅保留字母数字 `_ -`、截前 40 字符，空结果用 `anon`；`jpeg` 改为 `jpg`。解码后最多 2 MiB。400：`missing playerId` / `invalid uploadContent` / `not base64 image`；413：`image too large`；500：`server error`，均为 `{status:"error",message}`。写入 `AVATAR_DIR`，同文件名覆盖；未校验上传者拥有该 ID，也未验证实际图片格式/尺寸 |
| GET `/avatars/<file>` | 静态文件路径 | 文件字节 | `express.static(AVATAR_DIR,{maxAge:"7d"})`；文件存磁盘。缺失文件继续后续路由，有 dist 时可能落入 SPA HTML 兜底，不能保证返回 JSON 或 404 |
| GET `/healthz` | 无 | `{ok:true,rooms:rooms.size,uptime:process.uptime()}` | `rooms` 包含保留中的空房；不检查外部资源可用性，也不表示游戏状态已持久化 |
| GET `/api/fetch-image` | query `url`，必须是单个字符串 | 上游图片字节；保留上游 Content-Type，设置 Content-Length、`Cache-Control: public, max-age=86400` | 初始 URL 仅允许 HTTPS，hostname 为 `7uuu.me` / `www.7uuu.me`；设置 referer 与 user-agent，`fetch` 跟随重定向。400 `invalid url`，403 `host not allowed`，502 `upstream <状态码>`，415 `not an image`，413 `image too large`，500 `server error`。需服务器访问外网；只检查返回 Content-Type 为 image，完整读入内存后才检查 20 MiB；无应用层超时，重定向目标未重新按白名单检查 |
| GET `/api/wiki-icons` | 可选 query `refresh=1` 强制刷新 | `{status:"success",count,map:{文件基名:图片URL}}`；HTTP 缓存 1 小时 | 请求 `https://wiki.biligame.com/jbzlbwgwjcygf/api.php`，带 UA/Referer，按 allimages 每页 500、最多 40 页；识别 png/jpg/jpeg/gif/webp，同基名优先 png。服务端内存缓存 24 小时，失败回 502 `{status:"error",message:"wiki fetch failed"}`；无鉴权刷新、无应用层请求超时，响应中的图片地址仍是外部资源 |
| GET `/` | 无 | 有 dist：`dist/index.html`；无 dist：后端运行文本 | dist 是否存在在启动时决定；HTML 设置 no-cache/no-store/must-revalidate |
| GET `/<dist资源路径>` | 无 | `dist/` 内文件 | 有 dist 才托管；`index.html` 禁缓存；其他文件按 express.static 默认行为，当前未配置统一长期缓存 |
| GET `*`（静态未命中） | 任意剩余路径 | 有 dist 时通常返回 index.html | `/ws*`、`/lobby*`、`/js/`、`/css/` 前缀跳过兜底；无 dist 或被跳过的未命中请求走 Express 默认 404。不是额外业务 API |

HTTP 上传和 WS 上传共用磁盘目录，但请求格式不同。图片代理与 WIKI 索引是当前后端全部显式外部 HTTP 依赖；客户端另行访问的剧本库、图标等不由该后端自动离线提供。

## 3. 连接、身份与生命周期

### 地址和绑定

| 用途 | URL | 身份处理 |
|---|---|---|
| 玩家/观众 | `ws(s)://<host>/ws/<channel>/<playerId>?auth=<browserSecret>` | 房间必须已由 H 创建；首次以该 playerId 加入时绑定非空 auth，后续同 ID 必须匹配 |
| 说书人 | `ws(s)://<host>/ws/<channel>/<playerId>/host?auth=<browserSecret>` | 必须带非空 auth；允许创建房间，已有房间按下述接管条件处理 |
| 大厅 | `ws(s)://<host>/lobby/<playerId>` | 不需 auth、不绑定游戏身份；缺 ID 时服务端随机生成大厅 ID |

页面默认同源选择 ws/wss，游戏与大厅前缀可分别由 `window.__TS_WS__`、`window.__TS_LOBBY__` 覆盖（必须包含相应路径和末尾 `/`，在 socket 插件初始化前注入）。游戏双方都使用 `session.stSecret` 作为 query auth；客户端缺少该值时用 `crypto.getRandomValues` 生成 32 字节 Base64URL secret，playerId 则由 `Math.random` 生成。**playerId、stId、座位表和 presence 中的 ID 都是公开标识，不是凭证**。浏览器存储的恢复和隔离规则见架构说明；服务端不返回 auth 给其他客户端。

Upgrade 只接受 `ws` / `lobby` 命名空间，否则 HTTP 404；游戏房间号通过 `Number()` 检查为 1–10000 整数，否则 HTTP 400。房间 Map 使用原始路径字符串作 key，并没有把 `01` 等表示规范化；路径其余段、playerId 长度/保留字未执行完整服务端 schema 校验。不要依赖前端的保留 ID 生成限制作为协议防线。

### 实际连接条件

1. H 首次连接：非空 auth 后创建房间，保存 `hostIdentity={playerId,auth}`，发送 `allowHost:true`、按当前 senderPlayerId 过滤的 `quickWakeSync` 与 presence，新增/更新大厅。
2. 已有 **在线 H**：auth 不同则拒绝；auth 相同则新连接直接覆盖 `room.host`，**即使 playerId 不同也可接管**，并更新 hostIdentity；当前没有主动关闭旧 host socket。旧连接不再是“当前 host”，但某些普通路由仅检查其连接时的 `meta.isHost`，见第 4 节。
3. H 已离线而房间仍在：若有 hostIdentity，必须同时匹配原 playerId 和 auth 才能恢复；错误连接不能创建新的房间权威。此条件比在线接管严格。
4. P 连接不存在/从未有 host 的房间：`allowJoin:false`，约 100 ms 后关闭，不创建幽灵房。已有房间即使当前 H 离线也可加入；首次非空 auth 绑定后保留到房间回收。错误凭证拒绝；正确凭证的同 ID 新连接关闭旧玩家连接，再替换 players Map 项。旧连接的 close 仅在仍为 Map 当前 socket 时才移除该玩家。
5. P 成功连接：`allowJoin:true`，存在 `lastGs` 就补一份 `gs`，更新大厅；客户端也会向 H 定向请求 `getGamestate` / `getStId`，因此可能收到多份状态。服务端连接时的 allow 与客户端后续 request 的 allow 可重复出现。

`checkAllowHost` 只对 host 路径连接允许，检查当前 host socket 及 hostIdentity；已被覆盖的旧 H 会得 false。`checkAllowJoin` 只回答房间是否曾有/现有 host，不代替初始凭证绑定；其封装中的 playerId 不作凭证使用。普通路由也未统一要求消息发送连接仍为当前已获准成员。

### 房间回收与关闭码

只有 `!room.host && room.players.size === 0` 才在 close 清理中安排 `ROOM_GRACE_MS` 回收（默认 **60000 ms**），定时器到期再次检查该条件。H 离开而还有 P 时，房间继续保留，**不是 H 离开后固定 60 秒删除**；最后一位 P 离开才进入空房宽限期。合法 H/P 连入取消回收。大厅可见条件只是 `everHadHost`，宽限期内空房也仍在快照中。

H 发送 `dissolveRoom` 后立即删除房间、取消回收定时器、广播 `removeRoom`；所有成员正常关闭码 1000，P 带原因“房间已被说书人解散。”。这与被动断线回收不同。

| 服务端关闭码 | 当前用途 |
|---|---|
| 1000 | 主动解散房间；客户端主动 disconnect 也使用 1000 |
| 1001 | SIGINT/SIGTERM 退出时 `server shutdown` |
| 4000 | 正确凭证的重复 playerId，关闭旧 P：`duplicate playerId` |
| 4001 | 同 ID 的 P 被提升为 H：`promoted to host` |
| 4003 | 缺少/不匹配玩家凭证：`invalid player credentials` |
| 4004 | 房间不存在：`room not found` |
| 4009 | 缺 host auth / 在线 host auth 不同 / 离线 hostIdentity 不匹配，另发 `alertPopup` 文本 |

这是应用显式关闭码全集，WS 库/网络还可能产生其他码。游戏客户端对所有非 1000 close 都安排约 3 秒后重连，没有按鉴权错误区分终止重试；1000 走离房、清理会话及显示 reason 分支。初次 allow 等待超时为 15 秒，不能据此推断服务端已回收房间。大厅 close 后先等待约 3 秒，再每 3 秒检查 `lobby.allowReconnect` 后重连。

## 4. 帧、封装与通用行为

应用数据帧为 JSON 数组 `[command, params, feedback?]`。客户端通常显式发送第三项 `false`；`undefined` 参数放入数组序列化后可变成 `null`。服务端非 JSON / 非数组输入静默忽略。每连接按约一秒窗口计数，超过 `RATE_LIMIT`（默认 30 帧/秒）直接丢帧，无错误或 ack；包含大厅数据帧。不应假定存在统一的字段、命令、大小和结构校验：WS 构造未显式配置业务 maxPayload，HTTP 的 6 MB 限制不适用于 WS。

| 封装/分组 | 线上 params | 实际服务端行为 | 缓存、ack 与重试 |
|---|---|---|---|
| `direct` | `{[targetId]:[subCommand,subParams],...}` | 对象且子项为数组才处理。target `host` 找当前 H，其余只找 players Map；不投递给发送 socket。除 `quickWake*` 保留命令外，不验证子命令权限和业务字段；**不再经过顶层子命令专用校验** | 不保存离线消息。第三项不为 undefined/false 时，向发送者发 `feedback`，即使所有目标缺席。投递给目标的子帧保留该第三项 |
| `request` | `{[subCommand]:[playerId,subParams],...}` | 仅处理 `checkAllowHost` / `checkAllowJoin` / `deleteMessage`，未知子命令忽略；不是向任意用户执行 RPC | 各子命令回执不同，见初始化/聊天表；没有统一 request ack |
| `uploadFile` | `{uploadAvatar:[playerId,dataURL]}` | 仅识别 `uploadAvatar`；data URL、后缀转换、safeId、2 MiB 解码上限与 HTTP 上传相同；未绑定传入 ID 与连接身份；无效内容/过大/写盘错误静默不返回成功 | 写磁盘后回 `avatarReceived`，第三项透传；客户端该接收分支不据此删除队列 |
| 普通广播 `G` | 各命令原始 params | 默认分支原样向其他房间连接广播；不转发 feedback。无命令白名单，也无普通业务的 H/P/当前 socket/座位权限校验。唯一默认分支缓存例外是符合条件的 host `gs` | 通常无缓存、ack、重试；任意未知命令也可到达接收端（现客户端无对应 case 则忽略） |
| `quickWake*` 保留名 | 见第 10 节 | 只有顶层专用入站命令可用；所有 direct 子命令中以 `quickWake` 开头的名字、默认广播分支中的此类名字均回 `forbidden`，不能伪造 `quickWakeIncoming` 等服务端事件 | 使用专用 ID、记录和 ack，不使用普通 feedback |

`roomMeta`、`reviewRevealed`、`blindDraw`、`blindDrawTaken`、`dissolveRoom` 的顶层分支只检查连接时的 `meta.isHost`，没有像 quickWake 一样进一步检查 `room.host.ws === ws`。用 direct 包装这些名字会仅向目标投递子帧，不执行服务端顶层状态更新/校验，接收端有相应分支时仍可能应用；权限补强属于 TODO，本文没有把它们描述成统一安全通道。request/uploadFile 也未检查每个子项是否可解构，畸形非 iterable 子项可能在路由内抛异常，外层仅捕获 JSON 解析错误。

### feedback 的含义

`["feedback", id]` 是旧消息队列的关联 ID 确认；第三项本身不是“强制可靠投递”的开关。客户端收到后查找首个相同 ID 队列项、执行本地聊天回显并删除该项。

普通消息队列在新增时立即发送，之后每 **1.5 秒**重发全部未清项，无通用次数上限或服务端幂等记录。聊天/群聊接收方有约 3 分钟的 feedback ID 去重窗口，仍会对重复帧先发 `deleteMessage`。队列 ID 使用毫秒时间戳，同毫秒多条项可能碰撞；不能保证逐条恰好一次。

`direct` 自己就会确认，即使目标离线，因此发送者的“已回显/队列已清”不代表目标收到。`request.deleteMessage` 从 `subParams[1]` 提取原始 ID，向**全房间（包括请求者）**广播 feedback，并可另确认该 request 自身第三项；它没有校验该 ID 属于请求者或只回给原发送者。两种确认可能重复到达；普通广播没有自动 feedback。

## 5. 初始化与房间控制

| command | 实际 params | 方向/target（客户端用法） | 实际 server 校验 | 缓存 / ack / 重试 |
|---|---|---|---|---|
| `checkAllowHost`（R） | `[playerId,null]` | H→S | host 路径、当前 host socket 与 hostIdentity；无 host 时可恢复，封装 ID 未统一绑定 | `allowHost:boolean`；连接时也主动发，无重试队列 |
| `checkAllowJoin`（R） | `[playerId,null]` | P→S | 房间曾有 host 或当前有 host | `allowJoin:boolean`；连接时也主动发 |
| `allowHost` / `allowJoin` | boolean | S→申请连接 | 服务端产生；通用转发未防止普通客户端发送同名帧 | H 获准后发完整 gs；P 获准后向 H 请求状态/ID |
| `alertPopup` | 字符串 | S→拒绝的 H | 服务端连接错误使用 | 无缓存/ack |
| `getGamestate` / `getStId` | 请求者 playerId 字符串 | P→D(host)→H | G/direct，无请求 ID 归属校验 | H 分别 `sendGamestate(id)`、`sendStId(id)`；H 离线则丢失 |
| `stId` | H 的公开 playerId 字符串 | H→B 或 D(P) | G | P 保存说书人 ID；不是 secret |
| `roomMeta` | `{name,stName,edition,editionName,editionLogo,maxPlayers}` | H→S→大厅 `updateRoom` | 顶层 `meta.isHost`，对象；字符串分别截 60/40/32/60/512；logo 仅接受 http(s) 前缀；maxPlayers 必须有限 number，取整并夹到 0–20；只合并白名单 | 内存 room.meta；无 ack；maxPlayers 是展示数据，不限制实际连接数 |
| `dissolveRoom` | `{}` | H→S | 顶层 `meta.isHost` | 立即回收，1000 关闭，`removeRoom`；无专用 ack |

## 6. 状态同步、角色与计时

本节命令除 `gs` 的限定缓存外都是 G/direct；服务端不校验发送者是 H、字段值、私密数据是否合适。客户端多数发送/接收方法各自以 `_isSpectator` 限制角色，不能代替服务端验证。

| command | 实际 params | 方向/target（客户端用法） | 实际 server 校验 | 缓存 / ack / 重试 |
|---|---|---|---|---|
| `gs` | 完整或 lightweight 对象，字段见下文 | H→B 或 D(P)；S→新 P 补缓存 | G；缓存条件额外要求 `meta.isHost`、`Array.isArray(params.gamestate)`、`!params.isLightweight` | **仅完整普通广播更新 lastGs**；无 ack。lightweight、direct 及其他增量均不更新，不保证新鲜 |
| `edition` | `{edition:{id}}`（官方）或 `{edition:<剧本对象>,roles:<customRolesStripped数组>}` | H→B / D(P) | G | —；完整发送 gs 前也发送 edition，但服务端不独立缓存 |
| `states` / `firstNight` / `otherNight` | 对应 Vuex 数组原值 | H→B / D(P) | G | —；完整 gs 也含对应字段 |
| `teamsNames` | `{townsfolk,outsider,minion,demon,...}` 映射原值 | H→B / D(P) | G | —；完整 gs 也含字段 |
| `fabled` | 当前 fabled 数组 | H→B | G | —；完整 gs 也含字段 |
| `player` | `{index,property,value}` | H→B，角色/阵营发牌或秘密失票→D(该 P) | G/direct，不检查属性白名单、索引或 ID | —；客户端通常不发送 reminders；stReminders 仅复盘发送；普通角色只定向，旅行者/复盘可公开，离开旅行者时发送空 role |
| `syncPlayersStatus` | `{isSecretVoteless,groupChatPlayers:[id,...],isWraith,isUsingWraith}` | H→D(落座 P) | G/direct | —；每次 sendGamestate 会为选定落座玩家发送；P 仅已落座时应用 |
| `bluff` | bluffs 角色数组 | H→B（all）或 D(选定 P/角色组) | G/direct；收件人选择在 H | —；由发牌/魔典分发附带发送 |
| `grimoire` | `{roles:[[{index,property:"role",value:roleId}],...],reminders?:[[{index,property:"reminder",value:[reminder,...]}],...],stReminders?:[[{index,property:"stReminder",value:[reminder,...]}],...]}` | H→B（all）或 D(P/选定角色) | G/direct；不保护字段与角色权限 | —；all 发送 roles 与非 custom 的 stReminders；指定 playerId 发 roles；seatNum/role 的完整魔典可带 reminders。客户端收到 reminders 会追加，重复帧不保证幂等 |
| `isRole` | `{role:"wraith",property:"active"或"using",value,st?:true}` | H→D(P) | G/direct | —；客户端 using 状态区分 st 标记 |
| `usingRole` | `{role,value,playerId}` | P→D(host) | G/direct，payload ID 未绑定连接 | —；H 查本地玩家及 wraith 状态后修改 |
| `isNight` | boolean | H→B | G | —；完整 gs 包含 |
| `bootlegger` | content 字符串 | H→B 的发送方法及 P 接收分支存在 | G | —；mutation 的发送订阅当前被注释，不应声称修改本地值一定广播 |
| `useOldOrder` / `useOldRole` | boolean | H→B | G | —；完整 gs 使用字段名 `isUseOldOrder` / `isUseOldRole` |
| `setTimer` | 时间值（socket 方法原样透传） | H→B | G | —；接收提交 `session/setTimer`，当前 session mutation 未定义同名处理，见 TODO |
| `startTimer` | 可选秒数，原样透传 | H→B | G | —；接收后各浏览器按本地时间运行；非服务端统一倒计时 |
| `stopTimer` | 可省略，接收方忽略 params | H→B | G | —；仅清本地计时器 |
| `avatarReceived` | `"/avatars/<safeId>.<ext>"` | S→上传者 | U 成功才产生；可带原 feedback 第三项 | 文件持久化；客户端当前以 `link.split('.')[0]` 和 playerId 比较，与带 `/avatars/` 前缀的返回值不符，不能保证 WS 上传后更新头像 |

`gamestate` 每个座位实际包含 `{name,id,image,stReminders,isDead,isVoteless,votes,pronouns,roleId?}`；`roleId` 仅旅行者，复盘时的其他角色通过额外 `grimoire` 发布；`stReminders` 平时为空、复盘从当前 reminders 过滤 custom 后派生。完整 `gs` 还包含：

```text
isNight, isVoteHistoryAllowed, isSecretVote, isUseOldOrder, isUseOldRole,
isReview, reviewRevealed, blindDrawActive, blindDrawCount, blindDrawTaken,
nomination, votingSpeed, lockedVote, isVoteInProgress, markedPlayer,
fabled, states, teamsNames, firstNight, otherNight, votes?（有 nomination 时）
```

lightweight 为 `{gamestate,isLightweight:true}`。秘密投票时普通完整广播将顶层 votes 清空；定向完整状态只保留目标玩家的 true 投票，其余 true 改为 false。当前发送表达式 `markedPlayer: session.isSecretVote ? session.markedPlayer : -1` 如实沿用，不在此推断设计意图。`lastGs` 是最后一次符合条件的 H **完整普通广播**原值，不是服务端根据 `player`、`vote`、`swap` 等维护的最新状态；H 离线时新玩家看到的可能过时，也不能从该缓存恢复完整私密魔典。

## 7. 座位与投票

| command | 实际 params | 方向/target（客户端用法） | 实际 server 校验 | 缓存 / ack / 重试 |
|---|---|---|---|---|
| `claim` | `[seatIndex或-1,playerId,name,image]` | P→D(host) | G/direct；本人 ID、座位空闲由客户端/H 判断 | —；H 确认后产生 player 增量；无专用 claim ack |
| `leaveSeat` | 无（线上常为 null） | H→D(P) | G/direct | —；P 仅将 claimedSeat 设 -1 |
| `swap` / `move` | `[fromIndex,toIndex]` | H→B | G，无索引/说书人校验 | —；P 交换/移动本地座位 |
| `remove` | seatIndex | H→B | G | — |
| `pronouns` | `[seatIndex,value]` | 本人 P 或 H→B | G；“只能修改本人”的条件仅客户端 | — |
| `setTalking` | `{seatNum,isTalking}` | 本人落座连接→B | G；客户端发送检查座位属于本人，接收只检查范围 | — |
| `nomination` | `[nominatorIndex,nomineeIndex]` 或空值结束 | H→B | G | —；客户端结束时记录本地投票历史；完整 gs 带 nomination |
| `isVoteInProgress` | boolean | H→B | G | —；完整 gs 带状态 |
| `isVoteHistoryAllowed` | boolean | H→B | G | —；P 同时清本地历史 |
| `votingSpeed` | 秒数；发送方法只检查 truthy，并未落实注释中的最小 1 | H→B | G | — |
| `marked` | seatIndex 或 -1 | H→B，客户端秘密投票时不发送 | G | — |
| `clearVoteHistory` | 无 | H→B 方法/P 接收分支存在 | G | —；mutation 对应发送订阅被注释 |
| `vote` | `[seatIndex,voteValue,fromST:boolean]` | 非秘密/旅行者放逐：本人 P 或 H→B；秘密投票：P→D(host)，H→D(该座位 P) | G/direct；**fromST 是未验证的 payload 字段**，不保证真实 H；本人座位与锁票规则主要由浏览器检查 | —；H/非 H 接收时结合本地 nomination、秘密状态、锁票进度处理 |
| `lock` | `[lockedVote,该次对应座位的voteValue]` | H→B | G | —；P 更新锁并在秘密投票下隐藏展示值 |
| `secretVote` | boolean | H→B | G | —；完整 gs 字段名为 isSecretVote |

## 8. 聊天与群聊

| command | 实际 params | 方向/target（客户端用法） | 实际 server 校验 | 缓存 / ack / 重试 |
|---|---|---|---|---|
| `chat` | `{message,sendingPlayerId,receivingPlayerId}` | 经队列 D(接收 ID/host)；正常 P 与 H 通信，由 H 再编排群聊和 wraith 转发 | G/direct；不校验 payload 发送 ID、收件 ID、群成员或正文 | 无服务端历史；第三项为队列毫秒 ID，1.5 秒重发；direct 立即 feedback，接收方另发 deleteMessage；客户端窗口去重 |
| `addGroupChat` | playerId 字符串数组 | H 队列→D(各相关 P) | G/direct；无服务端群成员权威 | 同聊天 ack/重试；发送方给新成员发当前全组 ID，给旧成员发新增成员 ID |
| `removeGroupChat` | 无 | H 队列→D(被移除/解散的 P) | G/direct | 同聊天 ack/重试；客户端各自维护 chatId，不在线上传服务器统一 chatId |
| `removeGroupChatMember` | 被移除 playerId 字符串 | H 队列→D(其余成员) | G/direct | 同聊天 ack/重试 |
| `deleteMessage`（R） | `[playerId,["direct",原feedbackId]]` | 接收方→S | 只提取子参数第 2 项 ID，无归属检查 | 全房间广播 `["feedback",原ID]`，另按需确认 request 第三项；详见第 4 节 |
| `feedback` | 队列 ID | S→发送者或全房间 | direct / deleteMessage 产生；同名普通广播也未被统一保留 | 首个匹配队列项回显/删除；重复确认通常无后续项可删，但 ID 碰撞有风险 |

P 接收 `chat` 时检查 receivingPlayerId 是本人；Vuex 还要求聊天对方是其 stId。H 根据本地群聊成员转发文字，并执行亡魂旁听/暴露逻辑。这些过滤均在浏览器执行，不能写成后端保护普通聊天 sender 身份或群聊权限。服务端只按 direct 目标拆包；选定目标之外不收到该帧正文，并不意味着发送者可信。

## 9. 盲抽与复盘

| command | 实际 params | 方向/target（客户端用法） | 实际 server 校验 | 缓存 / ack / 重试 |
|---|---|---|---|---|
| `blindDraw` | `{active,count,taken?}`；正常订阅发送 active/count | H→B（顶层专用分支） | `meta.isHost`；active 布尔化；开启时 count 转为 Number，falsy 则 0（无整数/非负/上限约束），taken 仅确认数组；关闭时 count=0、taken=[] | 保存 room.blindDraw 并广播；**没有连接时独立回放**，重连主要依赖 H 的 gs 或可能过时的 lastGs；无 ack |
| `blindDrawTaken` | `[{slot,seat,name,playerId},...]` | H→B（顶层专用分支） | `meta.isHost`；只确认最外层数组，不验证元素 | 保存 room.blindDrawTaken，同步 room.blindDraw.taken，广播；没有独立回放；无 ack |
| `blindDrawPick` | `{slot,playerId}` | P→D(host) | G/direct；发送方法只检查 slot 有限数；H 本地检查范围、槽位未抽、payload ID 已落座，未校验连接发送者 | 无服务端缓存/ack/重试；H 登记 taken 后定向 reveal，再由 mutation 广播 taken |
| `blindDrawReveal` | `{slot,role:<角色对象>}` | H→D(抽牌 P) | G/direct；无业务校验 | 无离线缓存/ack/重试，角色保存在目标浏览器 |
| `isReview` | boolean | H→B | G，非专用鉴权路由 | —；开启时客户端另分发公开 grimoire，关闭时各浏览器清 revealed/stReminders |
| `reviewRevealed` | 已揭示 seatIndex 数组 | H→B（顶层专用分支） | `meta.isHost`，数组最多取前 20 项，元素未校验 | 缓存 room.reviewRevealed 并广播；没有独立连接回放，完整 gs 也带该字段；无 ack |

正常盲抽广播不含角色，顶层 `blindDraw` 服务端构造新对象丢弃 roles；角色池在 H，角色只由 H 私发。`direct` 与其他普通广播没有通用敏感字段过滤，不能据此承诺任意客户端输入都不会泄露角色。`blindDrawFinish` 是本地操作方法，不是 WS 命令；它关闭盲抽并通过 newGame/发牌既有通道分配角色。

## 10. 快速唤醒专用协议

### 字段与状态

`quickWakeSend` 接受消息对象，服务端生成的公共记录（Incoming/Status/Sync 中使用）为：

```text
{
  id, roomId, senderPlayerId, senderName,
  targetPlayerId, targetSeat, targetName,
  phase: {kind, night, label}, content, createdAt,
  deliveredAt: null或ISO时间, repliedAt: null或回复createdAt,
  reply: null或Reply, status: "accepted"|"delivered"|"replied"
}
Reply = {
  id, wakeId, roomId, playerId, senderName,
  phase: {kind, night, label}, content, createdAt
}
```

- 字符串清理均为 trim 后 slice，超长会截断；消息/回复 ID、wakeId、targetPlayerId 上限 100，姓名 80，消息正文 4000，回复正文 1000，createdAt 80；时间字符串不检查有效日期。senderPlayerId / reply.playerId 从连接身份生成，忽略客户端冒填值。
- `roomId` 转字符串后必须与路径 channel 相等。`targetSeat` 用 Number 转换，有限时取整且至少 1，否则 0；不验证该 seat 与 targetPlayerId 对应，显示姓名也不是身份凭证。
- phase 缺失/非对象时默认 `{kind:"night",night:1,label:"第1夜"}`；kind 仅 `day` 保留，否则 night；night 转数字后须有限且 >=1，取整，否则 1；label trim 截 40，空则自动生成。phase、createdAt、显示名是展示元数据，不是服务端规则阶段/时钟权威。
- `accepted` 仅代表服务端创建/识别记录，**不等于 delivered**。`quickWakeIncoming` 发给目标后，目标客户端收到并检查房间/目标 ID、存本地，再发 Receipt 才设置 deliveredAt。它不证明玩家已阅读正文。
- 有 reply 时状态优先为 replied，否则有 deliveredAt 为 delivered，否则 accepted；允许先回复而没有 Receipt，此时 replied 记录的 deliveredAt 仍可为 null。客户端另外存在 sending/failed 和 replyStatus，用于本地 outbox，不能当作服务端状态。

### 命令清单

| command | 实际 params | 方向/target | 实际 server 校验与处理 | 缓存 / ack / 重试 |
|---|---|---|---|---|
| `quickWakeSeats` | `[playerId,...]` | H→S | 必须为当前 H socket；数组时保存字符串、非空、非 `host`、非当前 H ID 的 Set | room.quickWakeSeated；无 ack。客户端每次发送消息前重报，**不由 gs/claim 自动维护** |
| `quickWakeSend` | 上述消息输入，至少 `{id,roomId,targetPlayerId,content}` | 当前 H→S→指定在线 P | 当前 H；对象、非空字段、正确房间；首次 ID 要求目标在上报座位 Set 且在线，容量未满。sender 绑定连接 | 存记录；P 收 Incoming，H 收 `quickWakeAccepted:{id}`；H outbox 每 2 秒重发至确认/错误 |
| `quickWakeIncoming` | 公共记录 | S→目标 P | 只能由专用处理投递；客户端再次核对 roomId/targetPlayerId | 客户端本地保存并立即 Receipt；服务端不据 send 成功就标 delivered |
| `quickWakeReceipt` | `{wakeId,roomId}` | 目标 P→S | 必须当前 players Map 对应 socket，非 H；记录属于该 P、房间匹配；空 wakeId 静默忽略 | 首次设服务端 deliveredAt，重复不改时间；向**当前 H**发 Status；无独立 ReceiptAck、无 receipt outbox |
| `quickWakeReply` | Reply 输入，至少 `{id,wakeId,roomId,content}` | 目标 P→S | 当前玩家 socket、非 H；对象、非空字段、房间正确、原消息属于该 P；不要求仍落座或 H 在线 | 保存唯一 reply，P 收 ReplyAck；当前 H 在线则收 Status，离线待同 sender 的历史同步；P outbox 每 2 秒重发 |
| `quickWakeReplyAck` | 服务端 Reply 完整对象 | S→回复 P | 由合法回复或同 reply ID 重试产生 | 客户端清 reply outbox、标 replied；仅表示服务端接受回复，不证明 H 浏览器收到 |
| `quickWakeAccepted` | `{id}` | S→发送 H | 新记录或相同 ID 重试成功 | 客户端清 message outbox；accepted 后不会持续重发等待 delivered |
| `quickWakeStatus` | 公共记录 | S→当前 H | Receipt、Reply 或已有消息重试时触发 | H 合并状态；并非向所有玩家广播 |
| `quickWakeSyncRequest` | 当前服务端不读 params，可省略 | 当前 H→S | 必须当前 H socket | 回 Sync；客户端有接收分支，socket.js 当前没有主动发送该请求的方法/订阅 |
| `quickWakeSync` | 公共记录数组 | S→当前 H | host 连接时或 SyncRequest 时；**只保留 senderPlayerId === 此 H 的连接 playerId**，按 Date.parse(createdAt) 排序 | 不等于房间所有 H 的完整历史；客户端也按自身 sender ID 过滤 |
| `quickWakePresence` | `{hostOnline:boolean,playerIds:[id,...]}` | S→H 与所有 P | 来源为 host/players 内存连接 | H 连接、close、顶层 bye 时通知；P 成功加入分支当前没有主动调用通知，可能暂时过时；不是座位占用证明 |
| `quickWakeError` | `{id:""或关联ID,code,message}` | S→触发请求连接 | 下表列实际全集；id 通常为消息/回复 ID，Receipt 为 wakeId | 客户端 failOutbox 移除匹配项、显示错误；空 ID 仍显示 notice |

### 幂等、容量和恢复的实际边界

同消息 ID 已存在时，仅比较 **senderPlayerId、targetPlayerId、清理后的 content、roomId**；相同则回 Accepted，非 accepted 状态另回 Status，不更新姓名/phase/seat/createdAt。只有目标现为另一 socket、仍在座位 Set、且记录未回复时才再投递 Incoming；同 socket 的重复 Send 不重复投递正文。不同上述字段回 conflict。此检查发生在首次新消息的座位/在线/容量检查之前。

同 wakeId 已回复时：同 reply ID 直接返回**第一次保存的回复**，即使重发正文改变也不覆盖；不同 reply ID 回 alreadyReplied。reply ID 没有跨 wakeId 的全局唯一校验。Receipt 重复可重复向 H 发 Status。不要把这个协议描述成所有消息类型均“恰好一次”。

记录存内存，每次存入后若超过 500 条则优先删除最早的已回复记录；未回复的不淘汰，所以可超过 500。已有记录总数达到 1000 时拒绝新消息（capacity）；回复本身不立即触发清理，清理循环只在新记录存入后执行，因此积满 1000 后即使回复也可能持续拒绝新消息。房间解散/回收或服务重启后，记录与 ID 去重历史全部消失。

客户端建连即启动 2 秒 outbox 周期，发送前核对房间、playerId、H/P 模式与当前 socket context；消息发送另检查目标仍在本地座位，回复另检查本地 playerId。这些是客户端防串会话措施。服务端当前虽然定义了 `sendPendingQuickWakes`，**没有连接路径调用它**：P 重连不会自动拿到所有未回复 Incoming。若 H 已收到 Accepted 而停止重发、P 又丢失本地记录，不能保证仅靠重连恢复。H 重连会拿到同 senderPlayerId 的 Sync，但在线同 auth 换 ID 接管后看不到旧 sender 的历史；旧记录的 Receipt/Reply 状态事件仍发给当前 H，不等于 Sync 全量历史可用。

### quickWakeError.code 实际全集

| code | 当前触发条件 |
|---|---|
| `forbidden` | 非当前 H 发 Send/Seats/SyncRequest；H 或非当前 P socket 发 Reply/Receipt；回复/回执指向不属于自己的或不存在的记录；direct/普通广播注入保留 quickWake 名字 |
| `invalid` | Send/Reply 格式错误、必要字段清理后为空、房间不匹配；Receipt 房间不匹配。Receipt 空 wakeId 静默返回，不生成 invalid |
| `conflict` | 已有消息 ID 对应的 sender、target、content 或 roomId 与重发不符 |
| `unseated` | 新消息目标不在 H 上报的 quickWakeSeated |
| `offline` | 新消息目标没有 OPEN 玩家连接 |
| `capacity` | 新消息到来时记录数量已 >=1000 |
| `alreadyReplied` | 同 wakeId 已有 reply，且新 reply ID 不同 |

## 11. 大厅与心跳

| command / 帧 | 实际 params | 方向/target | 实际 server 校验/来源 | 缓存 / ack / 重试 |
|---|---|---|---|---|
| `setRooms` | 房间描述数组 | S→新大厅连接 | 当前 rooms 中 everHadHost 的房间快照 | 大厅重连重新获取；无 ack |
| `addRoom` / `updateRoom` | `{channel:string,players:number,name,stName,edition,editionName,editionLogo,maxPlayers}` | S→全部大厅连接 | H 创建/连接、P 加入/离开、roomMeta 等事件；players 为在线 players.size + 有 H 时 1，非座位数 | 客户端按 channel 新增/覆盖；H 单独 close 当前未立即 notifyLobbyUpdate，已有列表人数可能暂时旧，重连快照重算 |
| `removeRoom` | channel 字符串 | S→全部大厅连接 | 主动解散或空房宽限期实际回收 | 客户端删除；无 ack |
| 应用 `ping` | H 发 `[本地统计P数,"latency"]`；P 发 `[playerId,"latency"]` | 游戏客户端约每 3 秒→S | who 可找到玩家则更新时间；host 身份用当前 socket 判断；P 的 who 不强制等于连接 ID | S 回 pong；H ping 向每 P 发 `[0,该P连接RTT]`；P ping 向 H 发 `[who,发送连接RTT]`，不是端到端 P↔H RTT |
| 应用 `pong` | 入站 ping 的 latency truthy 值或 0（常为字面量 `"latency"`） | S→发 ping 的连接 | 服务端产生；P/H 只置本地 isAlive | 无缓存；客户端按应用 pong 超时重连的代码当前被注释 |
| `bye` | playerId 字符串 | 客户端离房实际发 D(host)；S 在 P close 时也向 H 发；顶层 bye 路由另可用 | 顶层要求 params===连接 playerId，然后删 players；direct 形式只转发给 H，不经过此校验；close 按当前 socket 判断 | 更新 H 本地人数；顶层另更新 presence/大厅，但不直接安排 empty 回收，通常随后 close 触发 |
| WS 协议控制 ping/pong | 非 JSON 帧 | S 建连立即 ping，之后约每 30 秒 ping；浏览器/库自动 pong | pong 标 isAlive 并记录有效 RTT；巡检发现上周期未 pong 的连接 terminate | 同时用于游戏与大厅；不需要应用发送 pong 命令 |
| 大厅客户端数据帧 | 任意 | 大厅客户端→S | 限流/解析后直接忽略，没有应用 ping/请求处理 | 当前 LiveLobby 正常只收房间事件，不运行应用 ping 循环 |

## 12. 当前边界与后续工作

清单覆盖所有 HTTP 注册端点、静态兜底、游戏/大厅发送和接收 case，以及通用默认分支。由于默认分支允许任意命令，不可能把可接受的 command 限定为本表列出的名字。未实现的增强应在 [TODO](../TODO.md) 跟踪，不能把注释中的“供重连补发”“仅说书人”直接写成已兑现的全部保证。

当前重点是统一命令/结构/当前连接权限校验；修复普通 feedback 过早确认、全房间确认与 ID 碰撞；让 lastGs 与恢复策略明确一致；接通快速唤醒玩家重放与及时 presence；验证盲抽/复盘实际恢复；修正 WS avatarReceived 路径比较和缺失的 setTimer mutation；收紧上传身份绑定及图片代理重定向/超时/读取上限。本文只记录现状，不修改这些行为，也不宣称本轮未实际执行的测试通过。
