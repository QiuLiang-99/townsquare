# 部署指南

本页描述仓库已有配置的使用方式。后端配置见 [server/README.md](../server/README.md)，数据保存边界见[架构文档](../docs/architecture.md)。以下操作会更新运行服务，应由部署者在实际环境执行；本页不表示已执行部署。

## Docker Compose 运行

需要 Docker 及 Compose。在仓库根目录复制配置并按实际环境编辑：

```sh
cp deploy/server.env.example .env
```

PowerShell 的复制命令为 `Copy-Item deploy/server.env.example .env`。随后：

```sh
docker compose config
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 townsquare
```

Compose 的 `image` 默认是 `ghcr.io/blood-on-the-computer/townsquare:main`。当前 Compose 没有 `build` 项，`up` 使用镜像，不会自动构建当前源码。如果维护自己的 fork，选择可访问的正确镜像；私有镜像需要先登录对应 registry。

### 配置含义

| 配置 | 默认值 | 作用 |
|---|---|---|
| `IMAGE_REF` | 上述 GHCR 镜像 | Compose 拉取的镜像引用 |
| `BIND_ADDRESS` | `127.0.0.1` | 宿主机端口绑定地址 |
| `APP_PORT` | `3000` | 宿主机端口；容器内固定使用 3000 |
| `RATE_LIMIT` | `30` | 每 WS 连接每秒消息限额，超出帧丢弃 |
| `ROOM_GRACE_MS` | `60000` | 无 host 且无玩家后的回收宽限期，单位毫秒 |
| `FLOATING_NOTICE` | 空 | 首页动态公告 |
| `AVATAR_VOLUME` | `townsquare_avatars` | 头像命名卷名称 |

`.env` 是 Compose 插值来源，不是本应用自动加载的配置文件；直接运行 `node server/index.js` 要自行设置进程环境变量。`SITE_URL` 是构建 sitemap 时的配置，不能在容器运行后修改已有构建产物。

容器以 `node` 用户运行，根文件系统只读；头像目录 `/data/avatars` 是单独的可写卷，`/tmp` 是临时内存挂载。默认只发布本机端口，公网入口应配置反向代理。

## 构建当前源码

[Dockerfile](../Dockerfile) 使用 Node 22 的多阶段构建，安装锁定依赖、构建前端，再移除开发依赖。镜像同时含前端产物与后端。

```sh
docker build --build-arg SITE_URL=https://game.example.com -t townsquare:local .
```

构建后启动时需让 Compose 使用 `townsquare:local`。Unix shell：

```sh
IMAGE_REF=townsquare:local docker compose up -d
```

PowerShell：

```powershell
$env:IMAGE_REF = "townsquare:local"
docker compose up -d
Remove-Item Env:IMAGE_REF
```

也可以在 `.env` 中设置 `IMAGE_REF=townsquare:local` 后启动；不要对纯本地镜像执行 `compose pull`。

## HTTP、TLS 与 WebSocket 代理

应用内部提供 HTTP/WS；HTTPS 域名通常在 Nginx 等入口终止 TLS。游戏 `/ws/` 和大厅 `/lobby/` 都必须支持 Upgrade。下列 location 可合并到已有的、正确配置域名和 TLS 的 server 块；不是完整 Nginx 配置：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 120s;
    client_max_body_size 6m;
}
```

如果调整 `APP_PORT`，同步修改上游端口。保留 `/ws/`、`/lobby/`、API、`/avatars/` 和静态资源的路径。页面默认根据来源选择 `ws` 或 `wss`；不要在 HTTPS 页面配置不兼容的明文 WS 地址。

HTML 由后端设置不缓存，避免旧入口引用旧 bundle。不要在代理层覆盖为长时间强制缓存 HTML。WS 请求 URL 中有浏览器凭证；访问日志和故障排查信息应避免公开这些 query 参数。

推荐同源部署。确需分域时，`window.__TS_API__`、`__TS_WS__`、`__TS_LOBBY__`、`__TS_AVATARS__` 必须在应用初始化前配置。部分图片下载等代码仍使用页面同源相对路径，配置变量没有覆盖所有请求，见[协议文档](../docs/protocol.md)。

## 健康、更新与回滚

镜像 HEALTHCHECK 请求容器内 `http://127.0.0.1:3000/healthz`，默认 10 秒间隔；它证明 HTTP 端点可访问，不证明多玩家游戏、权限或外部图源正常。可在宿主机检查：

```sh
curl --fail http://127.0.0.1:3000/healthz
```

[update-image.sh](update-image.sh) 需要 POSIX shell 和 Docker 权限，会：

1. 将当前容器使用的镜像 ID 标记为 `townsquare:previous`。
2. 拉取目标镜像；ID 未变时退出，变更后重建服务。
3. 最多轮询 30 次健康状态，每次间隔 2 秒。
4. 新服务未健康时尝试以 `townsquare:previous` 启动，并返回非零。它没有再次验证回滚后的健康；首次部署也可能没有可回滚镜像。

执行示例：

```sh
IMAGE_REF=ghcr.io/blood-on-the-computer/townsquare:main sh deploy/update-image.sh
```

**更新脚本先为 `IMAGE_REF` 赋默认值并导出，不会主动 source `.env`。** 因此，单独在 `.env` 改镜像然后直接运行脚本，不能保证采用该值；请明确传入进程环境。其余 Compose 插值仍依 Compose 的环境和 `.env` 规则处理。

仓库的 systemd [service](townsquare-update.service) 和 [timer](townsquare-update.timer) 是示例，写死了用户/组 `deployer`、HOME `/home/deployer`、路径 `/opt/townsquare`，timer 每分钟检查。使用前核对这些值、Docker 权限、脚本可执行位及文件安装位置。若希望读取 `.env` 的镜像设置，可为 service 配置实际存在的 `EnvironmentFile=/opt/townsquare/.env`，或显式 `Environment=IMAGE_REF=...`；维护者须自行安装和启用 unit，不要直接照搬路径。

CI 会检查、构建和冒烟测试镜像。推送 GHCR 还受固定仓库条件 `blood-on-the-computer/townsquare`、`main` 分支及非 PR 事件限制；fork 的 CI 成功不代表它已发布新镜像。本轮仅接入测试，不修改这些发布条件。

## 状态与备份

房间、身份绑定、缓存公开 `gs` 和快速唤醒记录都在 Node 进程内存，更新、回滚或重启会丢失。浏览器可保留部分本地数据，但不能恢复服务器全部状态或保证未完成消息可靠投递。安排更新时应考虑正在进行的对局。

头像命名卷独立于镜像生命周期，需单独备份；`docker compose down -v` 会删除该卷，不能当作常规更新步骤。容器回滚仅回滚镜像，不等于回滚数据，也没有房间数据库备份。多副本共享房间、服务端持久化等尚未实现，后续事项见 [TODO.md](../TODO.md)。
