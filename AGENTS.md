# 编码代理工作约定

适用于整个仓库；进入 `src/` 或 `server/` 后，还须遵守对应目录的 `AGENTS.md`。现有代码不完全满足下述新代码约定，不要因此批量重写历史文件。

## 阅读顺序

1. [README.md](README.md)：安装、运行、目录和文档入口。
2. [CONTEXT.md](CONTEXT.md)：领域术语，特别是玩家身份、座位和 `isSpectator`。
3. [架构与状态归属](docs/architecture.md)：修改方、存储位置、恢复时序。
4. [协议清单](docs/protocol.md)：涉及 HTTP、WS 或共享状态时必读。
5. [测试指南](docs/testing.md)、[贡献指南](CONTRIBUTING.md)及改动目录的约定。

## 项目地图与事实

- 前端：Vue 2、Vuex 3，入口 `src/main.js`、`src/App.vue`。
- 共享状态：`src/store/modules/`；网络与持久化副作用位于 store 插件中。
- 后端：`server/index.js`，CommonJS，Express 与 ws 共用端口。
- 前后端共用根目录的 `package.json`、`package-lock.json`；没有独立后端安装步骤。
- 推荐 Node 22，与 Docker 和 CI 对齐。依赖的实际解析版本以锁文件为准。
- 说书人前端维护主要游戏状态；后端还保存身份、房间、公开快照和快速唤醒记录等内存状态。不要将其描述为纯无状态中继或完整规则引擎。

## 实施边界

- 只完成当前任务；保留用户已有修改、署名、许可证和来源声明。
- 不顺带升级依赖、更换框架、批量格式化或改写角色/剧本资源。
- 安装使用 `npm ci --no-audit --no-fund`，不要为消除提示修改锁文件。
- 检查使用 `npm run lint-ci`；`npm run lint` 可能自动修改代码，不能当成只读检查。
- 业务逻辑优先沿用已有模块。只有当前任务需要时才引入抽象，不按文件行数机械拆分。
- 文档使用中文；解释约束、时序和原因，避免逐行复述代码。
- 不把前端按钮隐藏、客户端身份判断或通用中继描述成服务端已实施的授权。
- 新建服务进程应使用独立端口和临时头像目录，结束后清理；不要停止已有服务，不上传真实凭证到日志或文档。

## 验证矩阵

所有命令从仓库根目录执行。详细启动和清理见[测试指南](docs/testing.md)。

| 改动 | 应执行的检查 |
|---|---|
| 仅 Markdown | 核对相对链接、文件、命令、配置和代码事实；不为排版改动重跑全部业务测试 |
| 前端 JS/Vue | `npm run lint-ci`、`npm run build`；涉及快速唤醒、状态或持久化时运行 `npm run test:quick-wake` |
| 后端、WS、房间或测试基础设施 | `npm run check:server`、`npm run test:quick-wake`、`npm run test:room-lifecycle`；独立启动 3000 端口服务后运行 `node server/test-ws.js` |
| 跨端状态/协议或生产源码注释 | 对应前后端检查；注释也可能影响现有通过源码提取运行的测试 |
| Docker/部署 | 核对配置和脚本；具备环境时执行镜像构建和冒烟测试，未执行时明确说明 |

测试以实际接口行为为断言对象。不得降低断言、吞掉失败或用无条件成功替代检查。说明实际执行结果、未执行项和阻碍；测试通过不等于浏览器、多实例或重启恢复已经验收。

## 文档同步

- 新增/修改命令、字段、投递方向、权限、错误码或回执：同步 `docs/protocol.md` 及对应行为测试。
- 修改状态权威、保存位置、初始化顺序或恢复语义：同步 `CONTEXT.md`、`docs/architecture.md`。
- 修改脚本、测试入口或 CI：同步 `docs/testing.md`；修改运行配置：同步 `server/README.md` 或 `deploy/README.md`。
- 当前缺陷、后续重构和验证盲点写入 [TODO.md](TODO.md)，附证据与验收标准，不写成现有能力。
- 遵守现有 changelog CI：需要时更新 `CHANGELOG.md`；纯维护改动可由维护者按既有 `no changelog` 标签规则处理，不自动修改远程标签。

## Agent skills

### Domain docs

采用单一项目上下文：根目录 `CONTEXT.md`；实现事实见 `docs/architecture.md`、`docs/protocol.md`。目前没有已记录的 ADR，不虚构历史决策。

### Issue tracker 与 triage

本仓库尚未建立技能专用工单或标签映射。后续事项先记录到 `TODO.md`；本文件不授权创建远程工单、标签、评论或执行部署。用户明确要求相关工作时再确认实际跟踪方式。
