# 项目上下文

本项目是《血染钟楼》的线上说书人辅助工具。前端使用 Vue 2、Vuex 3 和 Vue CLI；Node.js 后端用 Express 托管构建产物、HTTP 接口和 `ws` 连接。推荐 Node.js 22，与 Docker 和 CI 环境保持一致。

说书人浏览器负责角色、魔典、座位编排、投票流程和多数游戏决策；后端负责房间存在性、连接身份、消息路由、部分缓存与快速唤醒的投递状态。后端保存运行状态，但没有实现完整游戏规则裁判。浏览器本地恢复、后端内存缓存和头像文件是三个不同的保存层。

## 领域术语

| 术语 / 字段 | 在本项目中的含义 |
|---|---|
| 说书人 / host | 以 `/host` 路径连接的客户端；正常界面中 `session.isSpectator === false`。其浏览器编排游戏状态。离线本地魔典也使用这个前端模式，并不意味着已有在线 host 连接。 |
| 玩家 / 观众 | 共用非 host 连接，`session.isSpectator === true` **包括落座的普通玩家和未落座观众**。不能把该布尔值翻译成“只能旁观、不能投票”。是否落座须另看座位与玩家 ID。 |
| 房间号 / channel / roomId | WebSocket 路径和后端房间键；现有客户端及后端接受 1–10000 范围内的房间。前端状态名为 `sessionId`，快速唤醒消息名为 `roomId`，均不是登录会话令牌。 |
| `playerId` | 浏览器生成并保存的公开稳定 ID，用于公开座位表、定向路由及重连匹配；稳定是指保留浏览器存储时复用。它不是凭证，也不是全局账号。 |
| `stSecret` / `auth` | 浏览器用 `crypto.getRandomValues` 生成的随机秘密，保存在本地，作为 WS 查询参数 `auth` 发送。虽然名称含 `st`，玩家和说书人连接都使用它。不能放进公开快照、聊天正文或示例日志。 |
| `stId` | 说书人的公开 `playerId`，用于聊天等路由；不是 `stSecret`。代码中初始字段另有历史大小写 `StId`，不要据此混淆两种数据。 |
| seat index / `claimedSeat` | `players.players` 数组的 **0 起始下标**，`-1` 表示离座；`claim`、交换、移动和提名索引等路径使用它。交换/移动会改变下标，不能当身份主键。 |
| 显示座位号 | 界面展示 `index + 1`，例如第 1 号位对应 index 0。`distributeBluffs` / `distributeGrimoire` 的 `seatNum` 输入和快速唤醒 `targetSeat` 快照使用显示号；各接口须逐项确认，不能因字段叫 seat 就假定同一基数。 |
| 剧本 / edition / roles | `edition` 是所选剧本；根状态 `roles` 是可用角色定义 Map。每座位的 `player.role` 才是本局分配角色，两者公开范围不同。 |
| 魔典 / grimoire | 领域上包含角色分配、提醒、伪装等私密信息；代码根对象 `grimoire` 主要存显示开关、日夜、夜次和偏好，并不容纳全部魔典数据。 |
| `gs` / `gamestate` | 说书人派生的共享快照，常规载荷含公开座位信息和投票/日夜等状态；不是私密 Vuex 状态的整体序列化。复盘与定向授权可额外公开角色或提醒。 |
| `lastGs` | 后端缓存的最近一次**非 lightweight、非 direct 的 host `gs` 广播**。后续 `player`、`swap`、`move`、投票或轻量快照不会合并进它；“最近一次缓存”不保证等于当前游戏状态。 |
| nomination / vote / lock | 提名、各座位投票和锁票进度，由说书人客户端组织。前端处理与后端转发不是完整的服务端规则/权限验证。 |
| `feedback` | 旧消息队列的移除信号；普通 direct 路由可立即回执，接收端还会通过 `deleteMessage` 请求触发回执。不能证明用户已阅读，甚至不能单独证明目标连接存在。 |
| 快速唤醒 / quickWake | 独立定向消息流程，使用 `quickWake*` 专用命令、房间身份校验、消息 ID、接收回执和回复确认；与普通聊天队列分开。 |
| pending / outbox / presets | pending 是本地历史中尚未完成确认回复的派生集合；outbox 保存待确认的发送或回复任务；presets 是该浏览器跨房间复用的文字预设。历史和 outbox 按 roomId + playerId 隔离。 |

## 状态与隐私边界

说书人本地魔典包含普通角色分配、提醒、伪装、说书人标记和盲抽牌堆。常规共享快照有意筛选字段，但授权发角色、发伪装、给指定座位/角色展示魔典、盲抽发牌和复盘都会把相应私密内容经后端发送给接收端。`direct` 是服务器按目标拆包路由，不是端到端加密。“默认不广播完整私密魔典”不能写成“私密数据从不离开浏览器”。具体授权载荷见[协议文档](docs/protocol.md)。

后端房间、`hostIdentity`、`playerIdentities`、`lastGs`、快速唤醒记录和大厅信息保存在进程内存。服务重启会丢失这些数据；原说书人重连可重新建房并发布本地恢复的游戏状态，这不等于服务端持久化恢复。头像写入 `AVATAR_DIR`，只有保留该目录或部署卷才会在服务重启/容器替换后继续存在。

浏览器 `localStorage` 保存魔典、部分会话/历史和偏好；快速唤醒另用 `quickWakeHistory:v1:<roomId>:<playerId>` 与 `quickWakePresets:v1`。旧存储键多数是浏览器同源全局键，并非逐房间归档。换浏览器、清除站点数据、存储不可用或换来源都可能失去恢复能力；同源不同标签页通常共享存储。完整的创建者、修改方、接收者、保存层、恢复方式和期限见[状态归属矩阵](docs/architecture.md#状态归属矩阵)。

## 代码入口

| 要理解或修改的行为 | 先读 |
|---|---|
| Store 组成、角色目录、日夜/显示、新开局复位 | [`src/store/index.js`](src/store/index.js)，再读 [`src/store/modules/players.js`](src/store/modules/players.js) |
| 座位对象、提醒、伪装、说书人标记 | [`src/store/modules/players.js`](src/store/modules/players.js)；联网筛选在 `socket.js` 的 `sendGamestate` / `sendPlayer` / `distributeGrimoire` |
| 身份、投票、聊天、盲抽和临时交互 | [`src/store/modules/session.js`](src/store/modules/session.js)；该模块保存状态及 mutation，网络编排还在 `socket.js` 和组件中 |
| 启动恢复与持久化 | [`persistence.js`](src/store/persistence.js)、[`safeStorage.js`](src/store/safeStorage.js)、[`quickWakePersistence.js`](src/store/quickWakePersistence.js) |
| 游戏连接、大厅连接、收发与 mutation 订阅 | [`src/store/socket.js`](src/store/socket.js)；`LiveSession` 与 `LiveLobby` 仍在同一文件 |
| 快速唤醒状态/纯逻辑 | [`quickWake.js` 模块](src/store/modules/quickWake.js)、[`src/logic/quickWake.js`](src/logic/quickWake.js) |
| 界面中的业务入口 | [`TownSquare.vue`](src/components/TownSquare.vue)、[`Menu.vue`](src/components/Menu.vue)、[`Player.vue`](src/components/Player.vue)、[`Vote.vue`](src/components/Vote.vue) 与 `src/components/modals/` |
| 房间和身份、HTTP/WS 路由、回收及资源缓存 | [`server/index.js`](server/index.js) |

## 阅读与维护

继续阅读[架构、状态和恢复](docs/architecture.md)、[完整协议](docs/protocol.md)、[测试说明](docs/testing.md)及[后端说明](server/README.md)。开发约定见 [CONTRIBUTING.md](CONTRIBUTING.md)，后续改进见 [TODO.md](TODO.md)。

Store 插件顺序必须按现状理解为 `persistence → quickWakePersistence → socket`：先恢复基础身份和状态，再恢复快速唤醒上下文，最后建立网络连接并订阅 mutation。网络接收中的 `commit` 同样会触发订阅；修改字段前必须检查角色 guard、`isFromSockets` 或单独的接收 mutation，及存储加载防回写逻辑。当前代码还存在直接赋值状态的初始化与接收路径；新代码使用 mutation 和 Vue 2 响应式更新的建议，不代表历史路径已经完成迁移。
