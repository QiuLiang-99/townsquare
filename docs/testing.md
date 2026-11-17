# 测试与手工验收

领域和状态边界见 [CONTEXT.md](../CONTEXT.md)、[架构文档](architecture.md)；帧格式与权限见[协议文档](protocol.md)。本页提供验证入口和覆盖边界，不是执行结果记录。是否实际运行、运行环境及失败原因应在本次变更报告中记录，不能根据本文命令列表宣称检查通过。

## 环境与命令

推荐 Node.js 22，与 Docker 和 CI 保持一致；使用仓库锁文件安装，不以升级依赖解决测试问题。其他 Node 版本的本地验证需要单独记录，不能替代推荐环境说明。以下命令在仓库根目录运行；安装与构建命令在 Bash、PowerShell 中相同。

```text
npm ci --no-audit --no-fund
npm run check:server
npm run lint-ci
npm run test:quick-wake
npm run test:room-lifecycle
npm run build
```

基础集成测试还需要先启动一份端口 **3000** 的后端，再在另一个终端运行：

```text
node server/test-ws.js
```

| 入口 | 执行内容 / 前提 | 能说明什么 |
|---|---|---|
| `npm ci --no-audit --no-fund` | 按 package-lock 安装依赖 | 安装能否完成；不是运行测试，不应改写锁文件来绕过失败 |
| `npm run check:server` | 用 `node --check` 检查后端及测试脚本语法，含新增生命周期入口 | 只检查语法，不启动服务、不验证行为 |
| `npm run lint-ci` | ESLint `--no-fix --quiet` 检查指定源码与配置 | CI 风格检查，不自动修复；不要用可能写文件的 `npm run lint` 代替 |
| `npm run test:quick-wake` | 依次执行 unit、state、protocol 三个快速唤醒脚本 | 纯逻辑、Vuex/持久化及真实 WS 专用协议；前两个不需要独立后端，protocol 自建测试后端 |
| `npm run test:room-lifecycle` | 新入口 `node server/test-room-lifecycle.js`，独立后端子进程、动态端口、短回收宽限期、临时头像目录 | 真实 HTTP/WS 的房间存在性、身份重连、回收、主动解散与缓存行为 |
| `npm run build` | Vue CLI 生产构建，自动执行 postbuild 的 sitemap 生成 | 构建链和产物生成；不等于用户界面或线上部署可用 |
| `node server/test-ws.js` | 连接现有 `127.0.0.1:3000` 后端；测试自身不代替启动服务 | WS 基础集成与实际主动解散；不能把它当隔离的短宽限期生命周期测试 |

本轮 CI 在已有检查中接入快速唤醒测试组与房间生命周期测试，保留原构建、基础集成及 Docker 发布/部署流程。脚本命令见 [`package.json`](../package.json)，CI 的实际运行条件和步骤见 [deploy.yml](../.github/workflows/deploy.yml)。远程 CI、Docker 构建及浏览器验收是否执行，须分别报告。

## 基础服务启动

完整页面路径为先 `npm run build`，再由后端同源托管 `dist`。只跑 WS/HTTP 基础测试无需先构建页面，但浏览器验收应使用已构建页面。后端默认端口为 3000，基础测试固定连接此端口；不要停止或复用不明确归属的用户服务。

下面为独立测试服务分配临时头像目录，避免上传检查覆盖日常头像；结束后在服务终端按 Ctrl+C，确认进程退出，再清理该临时目录。若环境中已有 `ROOM_GRACE_MS` 或 `RATE_LIMIT` 覆盖值，先检查是否符合本次测试目的；基础示例不需要设置它们。

Bash（服务终端）：

```bash
avatar_test_dir="$(mktemp -d)"
PORT=3000 AVATAR_DIR="$avatar_test_dir" node server/index.js
# 服务退出后执行：
rm -rf -- "$avatar_test_dir"
```

PowerShell（服务终端）：

```powershell
$avatarTestDir = Join-Path ([System.IO.Path]::GetTempPath()) ("townsquare-test-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $avatarTestDir | Out-Null
$env:PORT = "3000"
$env:AVATAR_DIR = $avatarTestDir
node server/index.js
# 服务退出后执行：
Remove-Item -LiteralPath $avatarTestDir -Recurse -Force
Remove-Item Env:PORT
Remove-Item Env:AVATAR_DIR
```

Bash 的行首 `PORT=... AVATAR_DIR=...` 只给该命令传环境变量；PowerShell 用 `$env:` 设置当前终端环境，退出服务后要清除或恢复之前的值。这里的临时目录只存本次测试头像，不能把日常 `server/avatars` 或部署卷作为清理目标。

测试终端先确认服务是自己启动的实例，再执行：

```text
node server/test-ws.js
```

健康和配置接口可额外检查。Bash 用 `curl`，PowerShell 用 `Invoke-RestMethod`，避免 Windows PowerShell 中 `curl` 别名语义差异：

```bash
curl --fail http://localhost:3000/healthz
curl --fail http://localhost:3000/dynamic/init
```

```powershell
Invoke-RestMethod http://localhost:3000/healthz
Invoke-RestMethod http://localhost:3000/dynamic/init
```

当前服务实际读取 `PORT`、`AVATAR_DIR`、`ROOM_GRACE_MS`、`RATE_LIMIT`、`FLOATING_NOTICE` 等变量；版本优先取 package.json，`APP_VERSION` 仅是读取失败时的后备。没有额外的测试数据库、前端 `.env` 服务器地址注入或通用 API 代理配置要求，详细配置见[后端说明](../server/README.md)。

`npm run serve` 启动的是 HTTPS 开发页面，仓库当前 `vue.config.js` 没有 `devServer.proxy`。游戏 WS 和大厅 WS 默认连接页面来源，不能假定它们自动转到 3000。代码支持 `window.__TS_WS__`、`window.__TS_LOBBY__` 和部分 HTTP 调用的 `window.__TS_API__`；前两者在 Store 插件创建连接对象时读取，需在应用 bundle 执行前设置，事后在控制台赋值不会重建既有实例。`__TS_API__` 只覆盖实际使用它的请求（初始化、wiki 索引、HTTP 头像上传等），`Menu.vue` 的相对路径图片代理等不会随之统一改变，跨来源 HTTPS 页面连接 HTTP 后端还受浏览器策略约束。常规验收使用构建后的同源服务；本文不为热更新额外改造运行配置。

## 自动化行为覆盖

下表按行为和入口列出，不固定断言总数；最终结果与详细数量以实际运行日志为准。新增生命周期和增强协议测试的实现以本轮最终脚本为准，不能把计划覆盖列表当通过证据。

| 行为 | 入口与观测方式 |
|---|---|
| 文本片段按选择顺序组合、0 是有效片段、拒绝空白内容 | `server/test-quick-wake-unit.js` 直接调用真实纯逻辑函数 |
| 消息/回复保留阶段与文本快照、历史键隔离、消息 ID 去重、pending 与预设操作 | 同上，检查实际函数返回值及快照字段 |
| 按房间 + 玩家恢复历史/outbox，预设跨房间复用，首次接收顺序 | `server/test-quick-wake-state.js` 加载真实模块与插件，用 Vuex 和模拟存储验证 |
| 强制回复、失败回复、重复 incoming、已确认回复和状态合并；存储不可用时继续会话 | state 脚本调用实际 mutation/getter/插件及提取的组件逻辑，不依赖真人点击 |
| 定向唤醒、接收回执、回复确认、目标隔离、非授权来源/封装拒绝 | `server/test-quick-wake-protocol.js` 启动真实后端，经 WS 发送帧并观察指定响应及非目标连接 |
| 重复发送/回复幂等、冲突 ID、非法房间/身份/目标约束、断线后协议恢复 | protocol 脚本验证结果、错误响应和相关连接状态；负向检查结合存活证据。未回复消息的自动恢复断言当前失败，见下文 |
| 玩家加入不存在房间不会制造幽灵房间 | `server/test-room-lifecycle.js` 观察拒绝、健康接口房间数和大厅快照 |
| host 建房、大厅新增与新快照、缓存完整公开 gs 给后加入者 | lifecycle 脚本经真实接口验证；完整缓存可补发不证明增量更新后的新鲜度，也不验证所有元数据更新 |
| 同凭证玩家替换连接、旧连接关闭不删新连接；错误凭证被拒而原连接可用 | lifecycle 脚本观察新旧连接、允许/拒绝和后续可用消息 |
| 空房宽限期内保留、期满删除；原 host 及时重连取消回收 | lifecycle 脚本使用独立服务的短 `ROOM_GRACE_MS`，观察大厅事件、快照与时间边界 |
| host 离开但玩家仍在时保留房间，最后玩家离开后才开始空房回收 | lifecycle 脚本结合连接状态和大厅/HTTP 状态观察 |
| 主动解散关闭玩家、从大厅实际移除、无法继续加入 | 基础 `test-ws.js` 和 lifecycle 观察 `dissolveRoom` 后实际事件；基础测试不再用恒真断言代替宽限期行为 |
| 普通广播/定向、大厅、基础鉴权、应用心跳及回执 | `server/test-ws.js` 对已启动 3000 服务执行 WS 集成；不包含 HTTP 初始化/健康、头像上传或所有普通协议权限检查 |

`test-quick-wake-state.js` 为了在 Node 中执行现有前端代码，会读取源码、提取 `.vue` 的 `<script>`、移除 import 并注入所需绑定，也会提取 socket/界面中的相关逻辑，并用模板编译器检查相关 Vue 模板。它验证真实模块和部分方法，但不是经完整 Vue CLI 编译后的浏览器运行；源码提取还受文件结构变化影响。unit 测试也不验证渲染或网络。protocol、lifecycle 和基础 WS 测试使用真实服务，却不挂载 Vue 页面。几类测试应互补解释。

## 隔离、失败与资源清理

生命周期测试必须拥有独立后端子进程，用动态端口、临时头像目录和短宽限期；快速唤醒协议测试也自行管理后端和临时资源。它们不应要求开发者预先占用 3000 服务，也不应改写真实头像目录。正常结束、断言失败和启动失败都要关闭测试连接、结束自建子进程并移除临时目录；对这些清理是否成功，应根据实际日志和进程状态核对。

等待消息或状态必须有超时。计时用例应以实际大厅事件、快照或 HTTP 状态为判断依据，给定时器合理余量；只有等待然后断言 `true` 不能证明回收。负向隔离检查应同时有可观察的正向结果/连接存活等依据，避免服务没启动或所有消息都丢失时误判通过。重复消息检查应比较唯一结果和 ID，不能只验证收到了任意响应。

断言失败、服务启动失败或无法及时等到条件，应返回非零退出码；CI 才能阻止后续成功标记。定位时保存首个失败、相关命令/Node 版本和后端日志，避免无限加大超时掩盖问题。`test-ws.js` 使用外部服务，测试关闭自己的连接后，该服务进程仍由启动者负责停止。

## 当前已知失败

`npm run test:quick-wake` 的纯逻辑和状态/组件检查通过，协议脚本在前 21 项检查之后，最后的 `pending-reconnect` 用例等待 `quickWakeIncoming` 超时并返回非零。场景为目标收到消息并回执 delivered，断开后以相同凭证重连；应恢复的未回复消息未自动补发。

`server/index.js` 的 `sendPendingQuickWakes` 只有定义，玩家加入路径未调用。测试保留该失败，不以本地存储恢复或 host 重新发送替代服务端重连补发。该失败会阻止 CI 检查任务及其后续镜像任务成功；最小修复和验收条件见 [TODO.md](../TODO.md)。这是已有实现缺陷，本轮没有修改游戏运行逻辑。

## 尚未覆盖与手工验收

自动化通过也不能证明以下项目已完成：普通广播/direct 所有命令的权限与参数边界、增量后的 `lastGs` 始终最新、真实浏览器响应式/模态框渲染、触屏和软键盘体验、后台标签节流、跨标签存储竞争、跨设备身份恢复、服务器重启后的可靠消息投递、全游戏规则正确性、外部图片/剧本来源长期可用。上传和代理的所有安全边界也不能由基础成功路径代替。相关后续工作见 [TODO.md](../TODO.md)。

建议手工使用独立浏览器配置文件：一个说书人、两个普通玩家（其中一个为目标）、一个未落座观众。同源普通标签共享身份与存储，不能直接当作四名独立参与者；无痕或独立 profile 也应检查实际存储隔离情况。`isSpectator=true` 同时包含普通玩家与观众，记录结果时写清是否落座。

1. 在构建后的同源页面建房，检查大厅名称、人数、剧本、座位和头像；玩家加入、落座、离座、交换/移动后显示号与身份一致。
2. host 分配角色、提醒和伪装，确认常规玩家看不到其他人的未授权内容；分别检查单人发角色/伪装/魔典、指定角色展示及复盘公开，检查非目标端网络帧和界面。
3. 发起提名和普通/闭眼投票，推进锁票、结束投票，检查各视角、历史与新开局复位。不要把此步骤解释为后端已具备全部规则权限校验。
4. 给指定玩家连续发送快速唤醒，检查其他玩家与观众不收正文；目标按首次接收顺序回复，在确认前不能通过关闭按钮、ESC 或其他全局交互跳过。断线/重连、刷新、失败后重试时检查正文、阶段和目标身份保持一致。
5. 快速唤醒切换房间/身份后，确认历史与 outbox 不串用，预设仍可跨房间复用；测试禁用/填满本地存储时提示和当前会话可用性，记录刷新后不能恢复的边界。
6. 检查普通私聊和群聊：发送方回显、接收者、重复消息、未读计数、host 离线情况。将“收到 feedback”“客户端收到”“真人阅读”分别记录。
7. 盲抽时确认玩家只看到槽位与已抽取者，自己的角色经定向发放；复盘结束后检查显示和提醒残留；新开局检查票型、计时、夜次和夜间完成标记。
8. 分别关闭玩家/host、恢复网络、主动解散，观察自动重连与正常离开差别。最后再重启自己拥有的后端，记录房间消失、host 本地恢复重建和 quickWake 内存丢失，不把预期丢失当作持久化成功。
9. 在实际桌面浏览器及移动设备检查长文本、滚动、软键盘、触屏、弹窗尺寸与遮罩、声音/焦点行为；检查 wiki 图标、剧本库、外部图下载和头像缓存更新。

变更报告应列出实际运行的命令和环境，区分通过、失败、未运行及清理结果。未执行的浏览器/mobile 验收、Docker 构建或远程 CI 保持“未运行”，发现的缺陷保留复现和后续事项。
