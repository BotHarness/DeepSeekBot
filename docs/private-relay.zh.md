# Docker 私有 Relay

在自己管理的服务器上运行 Tobs 中继。一个部署支持最多 16 台电脑，各自独立认领和准入，不需要官方 Tobs 账号或 Cloudflare 账号。其他方式见[选择私有连接](private-connect.zh.md)。

**需要手机和电脑都能访问的公网 HTTPS 入口。** 可以使用已有公网服务器，或已正确配置公网访问的家用服务器/NAS。仅有域名、仅在家中 NAT 内运行 Docker，都不等于可以远程连接。部署不会自动购买服务器、修改 DNS 或路由器端口，也不保证所有运营商都可达。

## 部署

在服务器上安装 Docker 和 Compose 插件。从包含 `tobs-relay` 的 [Tobs Release](https://github.com/BotHarness/DeepSeekBot/releases) 中复制完整的 `deploy/private-relay` 目录到你管理的路径，记录发布标签。多 Host 认领要求电脑运行 Tobs 1.7.0 或更新版本。

使用指向 VPS 的公网域名，或服务器的公网 IPv4、IPv6 地址。在**云控制台的防火墙或安全组**和服务器防火墙中开放入站 **TCP 80 和 443**。中继默认在 80 端口处理 Let's Encrypt HTTP-01 校验，将其他请求重定向到 443 端口的 HTTPS，并自动续期域名证书和短期 IP 证书。中继注册 ACME 账户时会接受证书授权机构的条款。启动前请阅读 [Let's Encrypt 订户协议](https://letsencrypt.org/repository/)。初始化时使用不带方括号的 IP 地址，在 HTTPS URL 中给 IPv6 地址加方括号。

### Docker Compose

在 VPS 的 Bash 中执行，将目录和域名替换为实际值。只对新部署执行一次初始化。

```bash
cd /opt/botharness-private
docker build -t tobs-relay:local .
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/config" \
  tobs-relay:local setup --config-dir /config relay.example.com
docker compose --project-name botharness-private --project-directory /opt/botharness-private \
  --file /opt/botharness-private/compose.yaml up --build --detach --remove-orphans
```

初始化以 0600 权限写入 `.env` 和 `bootstrap.secret`，只输出密钥文件位置和 HTTPS 地址。请妥善保管这些文件。Compose 从 `.env` 将认领密钥传入容器环境，服务器管理员仍可查看。中继以非特权用户运行，认领记录只保存哈希。

请将初始化文件和中继数据存放在支持硬链接的文件系统上。中继用硬链接保证每把认领密钥只能使用一次。

在 Linux 上，`tailscale serve` 可能已在 `100.x.x.x` 或 `fd7a:…` 等 Tailscale 地址上占用 443 端口，导致通配地址绑定失败。此时请在 `.env` 中将 `RELAY_BIND_ADDRESS` 设为接收公网流量的网卡的本地地址。例如，云服务商通过 NAT 将公网 IP 转发到 `eth0` 上的 `10.0.0.4` 时，使用 `RELAY_BIND_ADDRESS=10.0.0.4`。IPv6 绑定地址需加方括号。

`RELAY_BIND_ADDRESS` 只绑定一个地址。如果域名有 AAAA 记录，Let's Encrypt 可能通过 IPv6 验证。仅绑定 IPv4 时，请删除 AAAA 记录，或为同一中继增加独立的 IPv6 端口映射并确保公网可达。

### 直接用 Docker

构建同一个镜像，初始化命名卷，再启动一个中继容器。认领时私下从容器的 `/data/bootstrap.secret` 读取密钥。

```bash
docker build -t tobs-relay:local .
docker run --rm -v botharness-private-data:/data tobs-relay:local setup relay.example.com
docker run -d --name botharness-private --restart unless-stopped --read-only --cap-drop ALL --security-opt no-new-privileges:true -p 80:8080 -p 443:8443 -v botharness-private-data:/data tobs-relay:local
```

### 静态二进制文件

VPS 没有 Docker 和 Node 时，可以从与 VPS 架构匹配的镜像中提取 `/tobs-relay`。在构建机器上依次运行 `container=$(docker create tobs-relay:local)`、`docker cp "$container:/tobs-relay" ./tobs-relay` 和 `docker rm -v "$container"`。将二进制文件复制到 VPS，并保护其工作目录。在 Linux 上，可先执行 `sudo setcap cap_net_bind_service=+ep ./tobs-relay` 授予绑定低端口的权限，再用普通用户运行。

```bash
./tobs-relay setup relay.example.com
./tobs-relay serve
```

认领记录和 ACME 状态保存在 `./relay-data`。如果 `tailscale serve` 已在自己的接口占用 443，可使用 VPS 入站接口地址运行 `./tobs-relay serve --http-listen 10.0.0.4:80 --https-listen 10.0.0.4:443`。若只需通过 443 完成证书校验，可加 `--acme-challenge tls-alpn-01`。如果已有 HTTPS 代理占用两个端口，运行 `./tobs-relay serve --tls=off --listen 127.0.0.1:8080`，让代理把 HTTP 请求和 WebSocket 升级都转发到该回环地址。配对时填写代理的公网 HTTPS 地址。

## 认领与手机配对

从服务器之外访问公网 HTTPS 地址的 `/health`，确认返回 `botharness-private-v1` 和 `botharness-private-v2`。手机能否连接，请按配对步骤验证。

1. 在可信电脑打开**Bot 设置 → 连接 → 添加连接 → 用手机连接这台电脑 → 已安装 App，开始连接 → 进阶方式 → Docker 中继**。
2. 填写 HTTPS 地址，并私下从服务器的 `bootstrap.secret` 复制首次设置密钥。不要发送到聊天或写入命令参数。
3. 点击**认领并连接**，等待已连接。本机设置成功、容器运行或健康检查成功，均不能证明手机外网可达。
4. 显示配对码，用手机扫描，核对完整 Host 指纹；再在电脑端核对并批准准确手机公钥。
5. 从手机向 Bot 发消息，检查真实回复。外网验收使用手机流量，不只是在家中 Wi-Fi 测试。

首次成功认领者取得中继管理权；并发和重复认领会被拒绝。中继管理权不等于 Host 控制权，Host 身份和设备批准仍需独立核验。二维码含敏感中继准入信息，不要公开。撤销手机会拒绝 Host 访问并关闭已有加密连接；本切片不会因此替所有其他手机轮换共享中继准入密钥。

## 一个中继服务多台电脑

一个部署最多服务 16 台电脑，每台可建立一个控制连接和 32 个手机通道，总计最多 528 个已升级的 WebSocket 连接。每个监听端口另有 128 个待处理的 TCP 和 HTTP 连接名额，每个对端 IP 最多占用 32 个。WebSocket 升级成功即释放待处理名额。使用反向代理时，待处理连接计入代理的 IP。

每台电脑有独立的一次性认领密钥、所有者凭据和手机准入。手机只能通过中继访问与它配对的电脑，释放认领只影响该电脑。

在服务器上为每台新增电脑生成密钥：

```bash
cd /opt/botharness-private
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/config" \
  tobs-relay:local add-host --config-dir /config office-mac
```

它会写入 `host-office-mac.secret`（密钥，只留在服务器上），并只把它的哈希追加到 `hosts/keys`。中继每次认领时都会读取这个文件，不需要重启。在那台电脑上按上面的步骤认领，只是粘贴 `host-office-mac.secret` 的内容，而不是 `bootstrap.secret`。第一台电脑继续使用 `bootstrap.secret`。

直接用 Docker 时，运行 `docker run --rm -v botharness-private-data:/data tobs-relay:local add-host office-mac`。使用二进制文件时，在初始化目录运行 `./tobs-relay add-host office-mac`。

从 Node 和 Caddy 升级时，保留 `.env`、`hosts/keys`、设置密钥文件和 `relay-data` 卷。在原目录替换部署文件，沿用原项目名，只执行上面的 Compose `up --build --detach --remove-orphans` 命令。该命令释放 Caddy 占用的端口，让 Go 中继读取原有认领记录并延续手机配对。需要回退时保留旧 Caddy 数据卷。旧部署如果没有 `hosts` 目录，启动前执行 `mkdir -p hosts`。线上协议见[中继标准](private-relay-standard.zh.md)，附第三方中继可用的一致性测试脚本。

在[真机验收 #3746](https://github.com/BotHarness/DeepSeekBot/issues/3746) 通过前，`server.mjs`、`setup.mjs`、`Caddyfile`、`package.json` 中的 Node 部署入口和 `scripts/test/private-relay.test.mjs` 仅为回退而保留。回退时请使用上一版本的部署文件。一致性测试客户端使用 Node 依赖，按同一协议验证 Go 中继。

## 失败恢复

- **无法连接：**检查公网 DNS、端口、HTTPS 证书和容器状态。不要关闭证书校验；私有连接失败不会偷偷使用官方中继。
- **已被认领：**回到原电脑和原 Profile，不要为了消除错误删除中继数据卷。
- **认领时断网：**电脑会在请求前保存私有凭据。只有中继已接受认领时，重启才可重连；认领从未到达中继时，Host 会持续重试控制连接并显示 `private-relay-unreachable`，使用该所有者凭据认证的 `GET /status` 返回 `404`，再次从界面认领可能返回 `private-relay-already-configured`。保留 Profile 和中继状态排查，不重复认领、删除凭据或重置卷来强行恢复。目前没有已定义的重复认领恢复流程。
- **服务器重启：**保留中继数据目录或数据卷及电脑凭据。删除卷是破坏性重建，不是升级步骤。
- **手机丢失：**在可信电脑撤销旧设备。若所有可信密钥均丢失，需要重建并重新配对；服务器账号无法恢复旧 Host 身份。

停止部署时使用相同的绝对 Compose 路径和项目名执行 `down`，**不要加 `--volumes`**，不要改动其他服务。当前不含离线云队列、远程唤醒、新媒体能力或免费托管保证。中国大陆普通网络仍需单独通过发布验收。

CLI 见[私有连接命令](bot-cli.zh.md#docker-私有连接)。真机验收记录在 [#3746](https://github.com/BotHarness/DeepSeekBot/issues/3746)；本文不代表已验收通过。

## 复制给你的 agent

复制完整代码块，另外提供公开部署信息和已授权服务器访问方式；认领密钥不进入聊天。

```text
帮我在自己的服务器上部署 Tobs Docker 私有 Relay，再连接现有 Host。先读 https://tobs.app/docs/private-relay/ 和 https://tobs.app/docs/private-relay-standard/；不可访问时读 https://github.com/BotHarness/DeepSeekBot/blob/main/docs/private-relay.zh.md 和 https://github.com/BotHarness/DeepSeekBot/blob/main/docs/private-relay-standard.zh.md。缺少时询问公网域名或 IP 地址、已授权服务器访问方式、部署目录和目标 Host。

1. 检查 Host 版本/Profile/私有模式，以及服务器 DNS/入站连通性、Docker Compose、已有项目和端口归属。家庭内网容器/域名本身不提供公网访问。保留其他服务栈和 Host 数据/配对。Docker Relay 是互斥模式，改变已有私有模式前先询问。
2. 约定具体资源，不购买基础设施、开启付费服务、替换无关 DNS 或停止占用 80/443 的服务。选择与已安装受支持 Host 匹配的源码发布/标签，记录固定提交，复制完整 deploy/private-relay 目录。需要服务商登录/管理员确认时由我完成。
3. 仅新部署运行 tobs-relay setup 配置约定的公网域名或 IP 地址，再以明确项目名和目录启动 Compose。.env、bootstrap.secret、新 Host 密钥和所有者令牌留在本机私有位置；秘密只通过受保护输入/文件/stdin 传递，不进聊天、进程参数或日志。保留已有初始化文件/卷，不为强行认领重置或重复初始化。
4. 验证公网可信 HTTPS 和 /health，再从实际本机 Host 用界面或 private-connect --hostname <https-origin> --token-stdin --confirm 认领，密钥从私有文件传入。结果未知时不自动重放，检查同一 Profile/状态，不暗中使用官方 Connect。
5. 让我在本机扫码、核对 Host 指纹并批准准确手机公钥，二维码不进聊天。手机使用流量/外部 Wi-Fi 验证真实 Bot 回复，再经授权保留持久化卷重启并验证手机重连。新增电脑分别使用 add-host 密钥独立批准，不重复使用 bootstrap.secret。
6. 分别报告服务健康、Host 连接、真实手机回复和待测试项目。提供不泄密的诊断和保留中继数据、旧 Caddy 卷及 Host Profile 的升级/回退方法。停止用同一项目的 down，不加 --volumes。仅经授权撤销测试手机；退役中继不等于撤销手机。
```
