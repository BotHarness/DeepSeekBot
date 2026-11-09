# 私有连接

私有连接让手机在使用流量或外部 Wi-Fi 时也能连到这台电脑，不需要官方账号、Docker 或 VPN 应用。电脑上的 Host 运行内置的 `cloudflared`，**只公开加密的手机通道**；设置、文件和接口都不会公开。手机仍然扫码配对、核对电脑指纹，并需要你在电脑上批准这台手机的确切密钥。

## 开启

打开 **设置 → 连接 → 添加连接 → 让设备连接本机 → 私有连接（推荐）**，选择一种：

- **临时地址（Quick Tunnel）**。免费，不需要 Cloudflare 账号。只有通过公网地址确实连到这台电脑后，才会提供配对码。隧道每次重启（电脑重启、断网、关掉再打开）地址都会变。重启后连接会自动恢复，但用旧地址配对的手机需要扫描新的配对码，设置页会提示。Cloudflare 说明 Quick Tunnel 仅用于测试，不保证在线。
- **固定地址（自己的 Cloudflare Tunnel）**。在自己的 Cloudflare 账号中创建 Tunnel，复制连接器令牌，并在该账号的域名上添加公共主机名。保存主机名和令牌后，把该主机名的服务指向页面显示的 `http://127.0.0.1:<端口>`。重启后地址不变。2026-11-09 实测：未绑付款方式的免费账号可以创建 Tunnel；固定主机名仍需要该账号下有域名。

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

## 失败恢复

- **无法连接：**检查公网 DNS、端口、HTTPS 证书和容器状态。不要关闭证书校验；私有连接失败不会偷偷使用官方中继。
- **已被认领：**回到原电脑和原 Profile，不要为了消除错误删除中继数据卷。
- **认领时断网：**电脑会在请求前保存私有凭据。保留 Profile，重启同一 Host 后恢复连接，不自动重放认领。未知结果不会显示为成功。
- **服务器重启：**保留 `relay-data`、Caddy 数据卷和电脑凭据。删除卷是破坏性重建，不是升级步骤。
- **手机丢失：**在可信电脑撤销旧设备。若所有可信密钥均丢失，需要重建并重新配对；服务器账号无法恢复旧 Host 身份。

停止部署时使用相同的绝对 Compose 路径和项目名执行 `down`，**不要加 `--volumes`**，不要改动其他服务。当前不含离线云队列、远程唤醒、新媒体能力或免费托管保证。中国大陆普通网络仍需单独通过发布验收。

CLI 见[私有连接命令](bot-cli.zh.md#docker-私有连接)。真机验收记录在 [#3746](https://github.com/BotHarness/DeepSeekBot/issues/3746)；本文不代表已验收通过。
