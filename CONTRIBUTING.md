# 贡献与维护指南

本指南约束后续修改。历史代码中仍有混合风格和职责耦合，整改项见 [TODO.md](TODO.md)，不要求每次提交顺带清理全部问题。

## 环境与阅读

推荐 Node 22，与 [Dockerfile](Dockerfile) 和 [CI](.github/workflows/deploy.yml) 一致。前后端共用根目录依赖和锁文件，使用 `npm ci --no-audit --no-fund`。锁定的 glob、sitemap 等依赖已不能用旧 README 中的 Node 18 作为统一安装基线。

先读 [CONTEXT.md](CONTEXT.md)、[架构与状态归属](docs/architecture.md)，修改网络功能时读[协议清单](docs/protocol.md)。开发代理还需遵守 [AGENTS.md](AGENTS.md) 及目录内约定。

完整应用启动：

```sh
npm ci --no-audit --no-fund
npm run build
node server/index.js
```

访问 `http://localhost:3000/`。服务端只在启动时决定是否托管 `dist/`，首次构建后再启动服务。配置与部署见 [server/README.md](server/README.md)、[deploy/README.md](deploy/README.md)。

`npm run serve` 只启动 HTTPS 前端开发服务器，不启动后端，当前 `vue.config.js` 未配置开发代理。默认同源请求会发到开发服务器；API/WS 覆盖值需在应用初始化之前注入，HTTPS 页面需要兼容的安全连接。部分 `/api/fetch-image` 等路径仍相对页面来源请求，不能只设置覆盖变量就保证全部功能可用。优先用同源反向代理联调；本轮没有新增代理配置。

## 修改习惯

- 跟随被修改文件附近的风格，使用有领域含义的名字，不批量格式化或重排无关代码。现有前端多用 ES modules，后端和部分纯逻辑使用 CommonJS。
- 新的共享状态通过 Vuex mutation/action 修改。说明创建者、权威修改方、公开范围、存储位置和恢复语义，不以 UI 控件可见性替代权限校验。
- 复用现有 `src/logic/` 规则；DOM 与局部显示状态留在界面模块，共享业务规则避免复制到多个组件。
- 注释解释协议约束、初始化顺序或隐藏条件，不逐行解释显而易见的实现。保留署名、来源和许可证声明。
- 异步边界校验输入，错误应有可诊断结果。重连、超时、房间切换和组件销毁都应考虑定时器、订阅、事件及媒体资源的清理。
- 安装或检查提示不构成升级依赖的授权；不使用清空浏览器存储、放宽断言等方式掩盖兼容问题。

## 协议和状态变更

现有 WS 以数组为帧，服务器大部分普通命令仍可通用转发。给功能增加新的客户端 guard，不代表服务器已经验证此命令。新增敏感操作需验证当前连接身份、目标和参数，并用接口测试覆盖拒绝与成功两条路径。

公开 `gs` 必须是过滤后的数据投影，私密角色/魔典按当前授权路径定向提供。快速唤醒走独立协议，保持消息 ID 幂等、房间和玩家隔离及接收/送达/回复的状态差别。

协议字段、投递方向、错误码或回执改动同步 `docs/protocol.md`；权威、存储键或恢复流程改动同步 `CONTEXT.md`、`docs/architecture.md`。更换持久化形状须考虑旧键、非法 JSON 和存储不可用，不只验证全新浏览器。

## 检查与提交说明

| 改动 | 检查 |
|---|---|
| 文档 | 核对链接、路径、命令和代码事实 |
| 前端 | `npm run lint-ci`、`npm run build`；状态/快速唤醒改动加 `npm run test:quick-wake` |
| 后端或 WS | `npm run check:server`、`npm run test:quick-wake`、`npm run test:room-lifecycle`，以及独立服务上的 `node server/test-ws.js` |
| 跨端协议 | 前后端相关检查一起执行，补成功、拒绝、重试及恢复行为 |
| 部署 | 核对配置；有 Docker 环境时构建并冒烟验证，不将未执行项宣称通过 |

`npm run lint-ci` 不自动修改代码；`npm run lint` 可能自动修复。语法检查不等于 lint，现有 lint-ci 也没有覆盖 `server/`。测试前提、固定/动态端口和清理细节见[测试指南](docs/testing.md)。

测试应验证真实使用者能观察到的行为；重构内部函数时不应需要重写协议测试。避免固定长等待，使用有上限的消息/条件等待；不存在某条消息的检查要结合响应或存活证据。失败返回非零并保留诊断，不能将条件变成无条件 true。服务器端到端测试与 Vuex/脚本提取测试不替代真实浏览器验收。

提交说明写清触发场景、行为变化、验证结果及剩余限制。CI 现有 changelog 检查要求修改 `CHANGELOG.md` 或由维护者使用 `no changelog` 标签；不要为纯维护工作编造产品版本，也不要自动设置远程标签。测试、文档与 CI 的变更可以在一次有明确范围的提交中完成。
