# 选择私有连接

私有连接让手机通过流量或外部 Wi-Fi 连接这台电脑，不需要官方 Tobs 账号。可以选择内置隧道、自带 HTTPS 入口或自己的 Relay。内置隧道使用 `cloudflared`，其他方式使用所选代理或 Relay，**只公开加密的手机通道**；Host 管理入口留在本机。手机仍然扫码配对、核对电脑指纹，并需要你在电脑上批准这台手机的确切密钥。

## 选择部署方式

| 你已有的条件                | 包含手动步骤和 agent 提示词的教程                                                      |
| --------------------------- | -------------------------------------------------------------------------------------- |
| Cloudflare 账号及其下的域名 | [Cloudflare Named Tunnel](private-named-tunnel.zh.md)：固定地址，Tobs 运行 cloudflared |
| HTTPS 代理、隧道或公司网关  | [自带 HTTPS 入口](private-ingress.zh.md)：nginx/Caddy、frp/ngrok 或内网 HTTPS          |
| 用于自建中继的公网服务器    | [Docker 私有 Relay](private-relay.zh.md)：自己的服务器，最多 16 台电脑                 |
| 暂时没有，只想体验          | 下方 Quick Tunnel：免账号，地址会变化                                                  |

Named/Quick 使用 Cloudflare 网络；自建 Relay 使用自己的服务器；HTTPS 入口取决于所选服务商以及代理到 Host 的可达路径。只有反向代理不能穿透家庭 NAT。以上私有方式都不需要官方 Tobs Connect。

每篇部署教程都提供完整的可复制提示词，复制本身不会执行部署。尚未安装 Tobs 时先看[安装教程](https://tobs.app/docs/installation/)。

私有连接选项已在 1.7.0 提供；下文的统一连接向导及 Quick/custom 独立控制由后续源码增加。配置前核对已安装版本与实际控件，保留当前 Host Profile 和设备授权。

## 连接中的进阶方式

Control Rail、Bot 设置和可跳过的新手手机步骤都打开同一个连接对话框。先确认手机已安装 App，再准备连接。Quick Tunnel 与 Tobs Connect 保留为短流程；展开**进阶方式**后，可直接选择局域网、Tailscale、自己的固定 Cloudflare Tunnel、自有 HTTPS 入口或 Docker 中继。部署指南复用[入口标准](private-ingress.zh.md)和本页 Docker 步骤，[中继标准](private-relay-standard.zh.md)仍是协议依据。

返回上一步不会关闭已经准备好的 Host 连接。Quick Tunnel 可与一个自定义连接共存：自己的 Cloudflare Named Tunnel 或已有 HTTPS 入口。每行分别显示状态，可单独停止或恢复。停止会保留配置，Host 重启只恢复已启用的连接。添加不会覆盖已有配置；替换自定义连接必须明确确认，Quick Tunnel 不受影响。移除连接方式需确认，会忘记该配置，但不撤销手机授权。要同时禁止手机通过所有通道访问，请单独撤销该手机。

新版手机在同一 Host 身份下保存两个明确授权的私有地址，旧版手机使用邀请里的主地址。Quick Tunnel 重启后地址可能变化，重新扫码可替换保存的地址，不会新增一个 Host。某条连接停止或失败时，另一条已验证的连接仍可配对。私有连接不会自动学习官方服务的回退地址。

Docker 中继仍是独立且互斥的私有部署方式，迁移时必须保留所有者凭据和数据卷，不提供通用重置操作。升级已有 Host 前，请备份受保护的完整 Profile 和凭据；旧软件包无法读取双连接凭据格式，降级必须恢复匹配的备份。见[迁移与回滚](https://github.com/BotHarness/DeepSeekBot/blob/main/docs/adr/0333-bounded-private-route-coexistence.md)和 [CLI 连接命令](bot-cli.zh.md#独立管理私有连接)。

Tailscale 要求手机和电脑位于可互访的同一 tailnet。iOS 和 Android 通常只能同时运行一个 VPN，开启 Tailscale 可能中断其他 VPN，详见 [Tailscale 官方说明](https://tailscale.com/docs/reference/faq/other-vpns)。局域网要求网络可达；HTTPS 入口要求 DNS、双方信任的证书、WebSocket 转发及 Host 检查通过后才显示配对码。失败时提供 DNS、证书或转发的下一步操作，不关闭证书验证，也不自动切换官方服务。

## 开启

打开 **手机 App → 开始配对 → Quick Tunnel（免登录）**，阅读临时地址说明，再点击 **创建免费临时地址**。仅打开对话框不会启动隧道；其他部署方式可展开选择。Bot 设置中的「连接」打开同一个对话框。

- **临时地址（Quick Tunnel）**。免费，不需要 Cloudflare 账号。只有通过公网地址确实连到这台电脑后，才会提供配对码。隧道每次重启（电脑重启、断网、关掉再打开）地址都会变。重启后连接会自动恢复，但用旧地址配对的手机需要扫描新的配对码，设置页会提示。重新扫码会更新同一个已认证 Host 的地址，有效的已有设备授权无需重复批准；已撤销的设备仍需重新授权。Cloudflare 说明 Quick Tunnel 仅用于测试，不保证在线。
- **固定地址（自己的 Cloudflare Tunnel）**。在自己的 Cloudflare 账号中创建 Tunnel，复制连接器令牌，并在该账号的域名上添加公共主机名。保存主机名和令牌后，把该主机名的服务指向页面显示的 `http://127.0.0.1:<端口>`。重启后地址不变。2026-11-09 实测：未绑付款方式的免费账号可以创建 Tunnel；固定主机名仍需要该账号下有域名。2026-11-09 用免费套餐的域名端到端实测：配对、收到真实回复；`cloudflared` 重启后地址不变，手机无需新配对码即可继续使用。
- **自己的代理或隧道**。适用于已经提供 HTTPS 的 nginx、Caddy、frp、ngrok 或公司网关。见[使用自己的代理或隧道](private-ingress.zh.md)。

等页面显示 **公网地址已确认可以连到这台电脑**，选择 **显示手机配对码**，在手机上扫码、核对指纹并批准这台手机。**停止**结束这条连接，但保留配置和连接器令牌；**移除**忘记所选连接及其连接器令牌，不会撤销手机。旧版本的关闭操作会移除私有配置，重新启用后需要新的配对码。

Host 不会改用官方中继。公网检查失败时，页面会显示原因代码（例如新 Quick 地址尚未生效时的 `dns`），并自动重试。

CLI：`tobs private-tunnel-enable --quick --confirm`、`tobs private-tunnel-enable --hostname <主机名> --token-stdin --confirm`（通过 stdin 传入令牌）和 `tobs private-tunnel-disable --confirm`。`tobs devices` 会显示 `privateTunnel` 状态。

## 高级：Docker 私有中继

服务器部署、多电脑独立认领、验证、恢复和 agent 提示词见 [Docker 私有 Relay](private-relay.zh.md)。第三方实现见[中继标准](private-relay-standard.zh.md)。

## 验证所选连接

等 Tobs 确认公网可达后，在本机扫码配对、核对 Host 指纹并批准准确手机公钥。公网入口使用手机流量或外部 Wi-Fi；仅内网 HTTPS 入口则让手机留在目标公司网络，验证手机侧内网 DNS、系统信任的 TLS 和所选地址的可达性，不要求公网访问。发送一条容易辨认的 Bot 消息并核对真实回复，再验证重连；经授权后检查撤销。配对码和令牌不发送到 agent 聊天或截图分享。仅有健康检查或进程运行不能证明手机可达。

[PR #3780](https://github.com/BotHarness/DeepSeekBot/pull/3780) 记录了 iOS 模拟器上 Quick/Named、nginx/Caddy 转发、多 Host Relay 的配对、真实回复与撤销。frp/ngrok 仍为参考配置；真机蜂窝网、中国大陆运营商、Android 和媒体功能的验收另行跟踪。
