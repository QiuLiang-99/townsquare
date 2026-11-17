# 钟楼谜团魔典

这是一个非官方的线上工具，用来辅助在语音软件中体验染·钟楼谜团。
这个工具可以帮助说书人和玩家有创建房间、记录进程、投票等，有更好的游戏体验。
这个项目取自开源项目[bra1n/townsquare](https://github.com/bra1n/townsquare)，由[limpy01](https://github.com/limpy01)全程汉化和优化，官方发布地址为：https://botcgrimoire.top/

[点击链接进入！](https://botcgrimoire.top/)

## 开发与自建运行

本仓库同时包含 Vue 2 / Vuex 3 前端和 Express / ws 后端，共用根目录依赖。推荐 **Node.js 22**，与 Docker、CI 使用的版本一致；依赖版本以 `package-lock.json` 为准。

在仓库根目录执行（PowerShell 和常见 Unix shell 均可）：

```sh
npm ci --no-audit --no-fund
npm run build
node server/index.js
```

启动后访问 `http://localhost:3000/`。同一端口提供页面、HTTP 接口、游戏 WS 和大厅 WS。服务启动时若没有 `dist/`，只提供后端；首次构建后再启动服务。`npm run build` 会自动执行 `postbuild`，生成 sitemap；站点地址可通过构建环境变量 `SITE_URL` 设置。

后端默认 `PORT=3000`、`RATE_LIMIT=30`、`ROOM_GRACE_MS=60000`，头像默认写入 `server/avatars/`。详细配置见[后端说明](server/README.md)，Docker 和反向代理见[部署指南](deploy/README.md)。

`npm run serve` 只启动 HTTPS 前端开发服务器。当前没有开发代理，不能仅运行此命令就连接到另一个端口上的后端；热更新联调的同源代理及运行时配置限制见[贡献指南](CONTRIBUTING.md)。

### 维护文档

| 文档 | 内容 |
|---|---|
| [CONTEXT.md](CONTEXT.md) | 领域术语：说书人、玩家、座位、凭证、快速唤醒等 |
| [架构与状态归属](docs/architecture.md) | 模块、状态权威、存储位置、初始化和恢复时序 |
| [协议清单](docs/protocol.md) | HTTP/WS 命令、字段、方向、实际校验、回执与错误 |
| [测试指南](docs/testing.md) | 检查命令、服务启动、端口、覆盖范围和手工验收 |
| [贡献指南](CONTRIBUTING.md) | 修改约定、验证和文档同步要求 |
| [AGENTS.md](AGENTS.md) | 编码代理工作约定及前后端目录规则入口 |
| [TODO.md](TODO.md) | 有代码依据的待办与分阶段重构建议 |

### 常用检查

```sh
npm run check:server
npm run lint-ci
npm run test:quick-wake
npm run test:room-lifecycle
npm run build
```

基础集成测试 `node server/test-ws.js` 需要另行启动独立的 3000 端口服务；两个协议测试入口自行启动隔离服务。前提和清理方式见[测试指南](docs/testing.md)。`npm run lint` 可能自动修改代码，核对时优先使用 `lint-ci`。

主要游戏状态由说书人前端维护；后端还保存房间、身份绑定、公开快照和快速唤醒记录，均为进程内存状态。服务重启会清空这些状态；浏览器本地恢复和头像磁盘存储各有独立作用，不能当作服务端游戏存档。普通协议转发仍有权限与校验缺口，见协议清单及 TODO。

### 目录导航

- `src/components/`：广场、玩家、投票、菜单与各类弹窗。
- `src/store/`：Vuex、WS 同步与本地持久化；`src/logic/`：规则和文本等逻辑。
- `src/*.json`、`src/scripts/`、`src/assets/`：角色、剧本和图像等资源。
- `server/`：HTTP/WS 服务与行为测试；`scripts/`：构建辅助脚本。
- `deploy/`、`Dockerfile`、`docker-compose.yml`：部署配置；`.github/workflows/`：CI。

## 特点

- 免费的城镇广场/魔典！
- 支持自定义JSON！可以从[英文剧本工具](https://bloodontheclocktower.com/script)或[中文剧本工具](https://clocktower.gstonegames.com/script_tool/)创建JSON文件！
- 实时共享的魔典，可供玩家投票使用！
- 持续更新所有官方角色，不定时加入原创角色和剧本！
- 夜间行动顺序和提醒可以帮助说书人和玩家。
- 支持所有自定义原创角色和剧本。

### 自定义剧本支持

任何从[英文剧本工具](https://bloodontheclocktower.com/script)或[中文剧本工具](https://clocktower.gstonegames.com/script_tool/)生成的JSON剧本文件都被支持，可以上传完整JSON文件或从剪切板粘贴。如果你想继续自定义剧本，可以加入以下`"_meta"`对象对剧本整体做出调整。


```json
[
  {
    "id": "_meta",
    "name": "无上愉悦",
    "author": "作者",
    "logo": "https://url.to/your/logo.png",
    "firstNight": ["dusk","minioninfo","demoninfo","marionette","poisoner","amnesiac","dawn"],
    "otherNight": ["dusk","dawn"],
    "bootlegger": ["私货商人1", "私货商人2"]
  }
]
```

这些设置可以让剧本的主题更加明确，使用更方便。
- `"firstNight"`、`"otherNight`和`"bootlegger"`是[英文剧本工具](https://bloodontheclocktower.com/script)支持的关键词，可以直接从中导出无需修改。
- 包含`"firstNight"`会改写魔典内置角色的首夜行动顺序。
- 包含`"otherNight`会改写魔典内置角色的除首夜外其他夜的行动顺序。
- 其中`"dusk"`、`"dawn"`、`"minioninfo"`和`"demoninfo"`为魔典内置的关键词，请避免和角色`"id"`重复。
- `"firstNight"`和`"otherNight`必须正确包括所有当晚行动的角色才能正常生效，请尽量使用[英文剧本工具](https://bloodontheclocktower.com/script)直接导出的结果，如需修改请在使用前核对夜间顺序表。

### 原创角色支持

自制的原创角色也可以被导入魔典，以下是一个完整的例子。

```json
[
  {
    "id": "balloonist",
    "firstNightReminder": "每个夜晚，唤醒气球驾驶员，并指向一名玩家（存活或死亡皆可），并将“得知”提示标记放置在对应的那名玩家的角色标记旁，以确保不会让气球驾驶员得知与上一晚同一角色类型的玩家。",
    "otherNightReminder": "每个夜晚，唤醒气球驾驶员，并指向一名玩家（存活或死亡皆可），并将“得知”提示标记放置在对应的那名玩家的角色标记旁，以确保不会让气球驾驶员得知与上一晚同一角色类型的玩家。",
    "reminders": ["得知"],
    "remindersGlobal": [],
    "setup": true,
    "name": "气球驾驶员",
    "team": "townsfolk",
    "ability": "每个夜晚，你会得知一名与上个夜晚得知的玩家角色类型不同的玩家。[+0~1外来者]",
    "firstNight": 72,
    "otherNight": 111
  },
  { 
    "id": "investigator" 
  },
  { 
    "id": "imp" 
  }
]
```

这段 JSON 定义包含了一个自定义角色“气球驾驶员”（Acrobat），以及两个基础游戏角色“调查员”（Investigator）和“小恶魔”（Imp）。
对于基础游戏角色，只需提供 ID 即可，这与你在剧本工具中获得的内容类似。

**必要属性：** `id`, `name`, `team`, `ability`

- **id**: 该角色的内部 ID，不含空格或特殊字符（仅英文和数字）。<br>
  _注意_：该 ID 必须是唯一的，不能与现有角色的 ID 重复，否则自定义角色将被现有角色覆盖！
- **image**: 角色标记图标的 PNG 链接（应具有透明背景！）。<br>
  _注意_：只有在“魔典”菜单中开启自定义图像后，这些图像才会显示！
- **edition**: 该角色的版本 ID。可以留空或填写 "custom"。
- **firstNight** / **otherNight**: 该角色在首夜 / 其他夜晚与其他角色相比的行动顺序。<br>
  _注意_：必须为正数或零，零表示“不在夜晚行动”。
- **firstNightReminder** / **otherNightReminder**: 首夜 / 其他夜晚的提示文本。
- **reminders**: 提示标记，如果没有，应为空数组 `[]`。
- **remindersGlobal**: 全局提示标记，无论该角色是否分配给玩家，这些标记始终可用。
- **setup**: 该标记是否影响设置（橙色叶子图标），例如“酒鬼”或“男爵”。
- **name**: 该角色的显示名称。
- **team**: 角色所属阵营，必须是以下之一：`townsfolk`（村民）、`outsider`（外来者）、`minion`（爪牙）、`demon`（恶魔）、`traveler`或`traveller`（旅行者）、 `fabled`（传奇角色）、`loric`（奇遇角色）。<br>
  _注意_：如果你创建了一个自定义的“传奇角色”（Fabled）或“奇遇角色”(Loric)，它将在加载自定义剧本时自动添加到游戏中。
- **ability**: 该角色的显示能力文本。
- **jinxes**: 自定义角色与其他角色的相克，会在角色技能表中出现，每个id代表跟一个角色的相克。具体如下：
```json
"jinxes":[{"id":"example1_id","reason":"相克1。", "id":"example2_id", "reason":"相克2。"}]
```

## 法律声明与下游告示要求
本项目采用带有 GPLv3 第 7 条附加条款的开源协议。如果您分发或分叉（Fork）本项目：
* 您**必须**完整保留终端启动时的版权横幅（Banner）。
* 您**必须**保留用于打印许可证详细信息的交互式命令或参数（如 --version）。
* 您**不得**移除用户界面（UI）中的任何作者署名信息。

## 全局版权声明
除非另有明确说明，本仓库内的所有源代码文件、配置文件、组件文件（.vue）、脚本文件（.js）以及数据集定义文件（.json）均包含由 [@limpy01](https://github.com/limpy01)（2026年）独立创作的重大修改与原创功能增强。上述所有内容均受到版权法保护，并严格受本仓库附带的 GPLv3 第 7 条附加条款之约束。任何未经授权移除署名或违反本协议的分发行为，均将导致许可授权的即时终止。

本项目及其网站免费提供，不以任何方式隶属于 The Pandemonium Institute。