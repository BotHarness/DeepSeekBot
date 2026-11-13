# 私有连接

私有连接让手机在使用流量或外部 Wi-Fi 时也能连到这台电脑，不需要官方账号、Docker 或 VPN 应用。电脑上的 Host 运行内置的 `cloudflared`，**只公开加密的手机通道**；设置、文件和接口都不会公开。手机仍然扫码配对、核对电脑指纹，并需要你在电脑上批准这台手机的确切密钥。

## 连接中的进阶方式

Control Rail、Bot 设置和可跳过的新手手机步骤都打开同一个连接对话框。先确认手机已安装 App，再准备连接。Quick Tunnel 与 Tobs Connect 保留为短流程；展开**进阶方式**后，可直接选择局域网、Tailscale、自己的固定 Cloudflare Tunnel、自有 HTTPS 入口或 Docker 中继。部署指南复用[入口标准](private-ingress.zh.md)和本页 Docker 步骤，[中继标准](private-relay-standard.zh.md)仍是协议依据。

返回上一步不会关闭已经准备好的 Host 连接。Quick Tunnel 可与一个自定义连接共存：自己的 Cloudflare Named Tunnel 或已有 HTTPS 入口。每行分别显示状态，可单独停止或恢复。停止会保留配置，Host 重启只恢复已启用的连接。添加不会覆盖已有配置；替换自定义连接必须明确确认，Quick Tunnel 不受影响。移除连接方式需确认，会忘记该配置，但不撤销手机授权。要同时禁止手机通过所有通道访问，请单独撤销该手机。

新版手机在同一 Host 身份下保存两个明确授权的私有地址，旧版手机使用邀请里的主地址。Quick Tunnel 重启后地址可能变化，重新扫码可替换保存的地址，不会新增一个 Host。某条连接停止或失败时，另一条已验证的连接仍可配对。私有连接不会自动学习官方服务的回退地址。

Docker 中继仍是独立且互斥的私有部署方式，迁移时必须保留所有者凭据和数据卷，不提供通用重置操作。升级已有 Host 前，请备份受保护的完整 Profile 和凭据；旧软件包无法读取双连接凭据格式，降级必须恢复匹配的备份。见[迁移与回滚](adr/0333-bounded-private-route-coexistence.md)和 [CLI 连接命令](bot-cli.zh.md#独立管理私有连接)。

Tailscale 要求手机和电脑位于可互访的同一 tailnet。iOS 和 Android 通常只能同时运行一个 VPN，开启 Tailscale 可能中断其他 VPN，详见 [Tailscale 官方说明](https://tailscale.com/docs/reference/faq/other-vpns)。局域网要求网络可达；HTTPS 入口要求 DNS、双方信任的证书、WebSocket 转发及 Host 检查通过后才显示配对码。失败时提供 DNS、证书或转发的下一步操作，不关闭证书验证，也不自动切换官方服务。

## 开启

打开 **手机 App → 开始配对 → Quick Tunnel（免登录）**，阅读临时地址说明，再点击 **创建免费临时地址**。仅打开对话框不会启动隧道；其他部署方式可展开选择。Bot 设置中的「连接」打开同一个对话框。

- **临时地址（Quick Tunnel）**。免费，不需要 Cloudflare 账号。只有通过公网地址确实连到这台电脑后，才会提供配对码。隧道每次重启（电脑重启、断网、关掉再打开）地址都会变。重启后连接会自动恢复，但用旧地址配对的手机需要扫描新的配对码，设置页会提示。重新扫码会更新同一个已认证 Host 的地址，有效的已有设备授权无需重复批准；已撤销的设备仍需重新授权。Cloudflare 说明 Quick Tunnel 仅用于测试，不保证在线。
- **固定地址（自己的 Cloudflare Tunnel）**。在自己的 Cloudflare 账号中创建 Tunnel，复制连接器令牌，并在该账号的域名上添加公共主机名。保存主机名和令牌后，把该主机名的服务指向页面显示的 `http://127.0.0.1:<端口>`。重启后地址不变。2026-11-09 实测：未绑付款方式的免费账号可以创建 Tunnel；固定主机名仍需要该账号下有域名。2026-11-09 用免费套餐的域名端到端实测：配对、收到真实回复；`cloudflared` 重启后地址不变，手机无需新配对码即可继续使用。
- **自己的代理或隧道**。适用于已经提供 HTTPS 的 nginx、Caddy、frp、ngrok 或公司网关。见[使用自己的代理或隧道](private-ingress.zh.md)。

等页面显示 **公网地址已确认可以连到这台电脑**，选择 **显示手机配对码**，在手机上扫码、核对指纹并批准这台手机。关闭私有连接会停止 `cloudflared`，并删除连接器令牌和手机准入令牌；已配对的手机需要新的配对码。

Host 不会改用官方中继。公网检查失败时，页面会显示原因代码（例如新 Quick 地址尚未生效时的 `dns`），并自动重试。

CLI：`deepseekbot private-tunnel-enable --quick --confirm`、`deepseekbot private-tunnel-enable --hostname <主机名> --token-stdin --confirm`（通过 stdin 传入令牌）和 `deepseekbot private-tunnel-disable --confirm`。`deepseekbot devices` 会显示 `privateTunnel` 状态。

# 高级：Docker 私有中继

本候选推荐使用 Docker 私有部署，不需要官方账号或 Cloudflare 账号。第一条路径支持一台桌面 Host 和它配对的手机；多电脑及升级另有 v2.0 验收项。

**需要手机和电脑都能访问的公网 HTTPS 入口。** 可以使用已有公网服务器，或已正确配置公网访问的家用服务器/NAS。仅有域名、仅在家中 NAT 内运行 Docker，都不等于可以远程连接。部署不会自动购买服务器、修改 DNS 或路由器端口，也不保证所有运营商都可达。

## 部署

服务器需安装 Docker Compose 和 Node 24。将候选的 `deploy/private-relay` 目录复制到你管理的绝对路径，配置已有域名指向服务器，确保公网 TCP 80/443 可达且未被其他服务占用。Caddy 自动申请和续期证书；证书签发与运营商连通性仍需检查。

例如文件放在 `/opt/botharness-private`，在**该服务器的 Bash** 中执行；请替换为实际完整目录和域名：

```bash
node /opt/botharness-private/setup.mjs relay.example.com
docker compose --project-name botharness-private --project-directory /opt/botharness-private --file /opt/botharness-private/compose.yaml up --build --detach
```

设置程序生成私有 `.env` 和 `bootstrap.secret`，不会打印密钥。不要提交、截图或分享这些文件。Compose 将密钥传入容器环境，服务器管理员仍可查看；这不能防范服务器管理员。中继以非特权用户运行，持久化准入凭据的哈希，转发加密数据，不保存聊天历史。

## 认领与手机配对

1. 在可信电脑打开**设置 → 连接 → 添加连接 → 将设备连接到这台电脑 → Docker 私有连接（推荐）**。
2. 填写 HTTPS 地址，并私下从服务器的 `bootstrap.secret` 复制首次设置密钥。不要发送到聊天或写入命令参数。
3. 点击**认领并连接**，等待已连接。本机设置成功、容器运行或健康检查成功，均不能证明手机外网可达。
4. 显示配对码，用手机扫描，核对完整 Host 指纹；再在电脑端核对并批准准确手机公钥。
5. 从手机向 Bot 发消息，检查真实回复。外网验收使用手机流量，不只是在家中 Wi-Fi 测试。

首次成功认领者取得中继管理权；并发和重复认领会被拒绝。中继管理权不等于 Host 控制权，Host 身份和设备批准仍需独立核验。二维码含敏感中继准入信息，不要公开。撤销手机会拒绝 Host 访问并关闭已有加密连接；本切片不会因此替所有其他手机轮换共享中继准入密钥。

## 一个中继服务多台电脑

一个部署最多服务 16 台电脑。每台电脑有自己的一次性认领密钥、自己的所有者凭据和自己的手机准入，所以和一台电脑配对的手机无法经中继访问另一台，释放或撤销一台电脑也不会影响其他电脑。

在服务器上为每台新增电脑生成密钥：

```bash
node /opt/botharness-private/setup.mjs add-host office-mac
```

它会写入 `host-office-mac.secret`（密钥，只留在服务器上），并只把它的哈希追加到 `hosts/keys`。中继每次认领时都会读取这个文件，不需要重启。在那台电脑上按上面的步骤认领，只是粘贴 `host-office-mac.secret` 的内容，而不是 `bootstrap.secret`。第一台电脑继续使用 `bootstrap.secret`。

从单台电脑的部署升级：拉取新的 `deploy/private-relay` 文件，在同一个项目目录运行 `docker compose up -d --build`。原有认领、手机和数据卷都照常工作，之后再用 `add-host` 添加电脑。线上协议见[中继标准](private-relay-standard.zh.md)，附第三方中继可用的一致性测试脚本。

## 失败恢复

- **无法连接：**检查公网 DNS、端口、HTTPS 证书和容器状态。不要关闭证书校验；私有连接失败不会偷偷使用官方中继。
- **已被认领：**回到原电脑和原 Profile，不要为了消除错误删除中继数据卷。
- **认领时断网：**电脑会在请求前保存私有凭据。保留 Profile，重启同一 Host 后恢复连接，不自动重放认领。未知结果不会显示为成功。
- **服务器重启：**保留 `relay-data`、Caddy 数据卷和电脑凭据。删除卷是破坏性重建，不是升级步骤。
- **手机丢失：**在可信电脑撤销旧设备。若所有可信密钥均丢失，需要重建并重新配对；服务器账号无法恢复旧 Host 身份。

停止部署时使用相同的绝对 Compose 路径和项目名执行 `down`，**不要加 `--volumes`**，不要改动其他服务。当前不含离线云队列、远程唤醒、新媒体能力或免费托管保证。中国大陆普通网络仍需单独通过发布验收。

CLI 见[私有连接命令](bot-cli.zh.md#docker-私有连接)。真机验收记录在 [#3746](https://github.com/BotHarness/DeepSeekBot/issues/3746)；本文不代表已验收通过。
