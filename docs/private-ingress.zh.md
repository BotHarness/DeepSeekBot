# 使用自己的代理或隧道

如果你已经有反向代理或隧道，Tobs 可以直接使用它，不必用内置的 Cloudflare 选项。只要满足下面的**入站标准**就能接入，就像任何 S3 兼容服务都能用 S3 客户端一样。

其他选择：[私有连接总览](private-connect.zh.md)、[Named Tunnel](private-named-tunnel.zh.md)、[Docker Relay](private-relay.zh.md)。

## 准备网络路径

准备已运行的 Tobs Host 与手机 App、未占用的 HTTPS 主机名、可信证书和代理配置权限。尚未安装时先看[安装教程](https://tobs.app/docs/installation/)。公网代理需要 DNS 与入站连通性，同时必须能访问 Host 的专用设备网关。VPS 上的 nginx 不能直接转发到家中电脑的 `127.0.0.1`；需要代理就在该电脑上、已有授权的局域网/私网路径，或 frp 等出站隧道。保留现有服务、证书与 Host 配置。

## 入站标准

你的代理需要：

1. 提供一个手机能访问的 HTTPS 地址，例如 `https://bot.example.com`，或手机已信任证书的内网地址 `https://bot.corp.internal`。手机不信任的自签名证书会被拒绝，Tobs 不会跳过证书校验。
2. 把 `GET /botharness-device/channel` 原样转发到 Tobs 显示的端口，**包括 WebSocket 升级**（`Upgrade` 和 `Connection` 头）以及 `X-BotHarness-Admission` 头。
3. 同样转发 `GET /.well-known/botharness-tunnel/<nonce>`。Tobs 用它确认地址可达后才给配对码。
4. 空闲 WebSocket 连接至少保持 60 秒（Tobs 会发心跳）。

其他路径都可以拦掉，这个端口对其他路径一律返回 404。代理前面可以加公司登录层（Cloudflare Access、OAuth2 Proxy），只要让手机的 WebSocket 升级请求通过即可。手机能否控制电脑，仍取决于在电脑上核对指纹并批准这台手机。

## 开启

Bot 设置 → 连接 → 添加连接 → 用手机连接这台电脑 → 已安装 App，开始连接 → 进阶方式 → **自己的代理或隧道**。填写 HTTPS 地址，选择 **保存并检查**，页面会显示要转发到的本机端口。这个端口默认只监听 `127.0.0.1`，所以代理要装在同一台电脑上；代理在局域网另一台机器上时，打开 **允许局域网内其他机器转发**。

CLI：`tobs private-ingress-enable --origin https://bot.example.com --confirm`（代理在其他机器上时加 `--lan`），用 `tobs devices` 查看状态（`privateTunnel.originPort` 就是要转发到的端口），关闭用 `tobs private-ingress-disable --confirm`。

端口在重启后保持不变。换成新地址时，先开启新地址，再让每台手机扫描新的配对码；只有经过这台电脑的固定密钥校验后，手机才会迁移到新地址。

## 参考配置

把 `PORT` 换成 Tobs 显示的端口，把 `bot.example.com` 换成你的地址。示例默认代理就在 Host 上；代理位于其他局域网机器时，启用已授权的 LAN 监听，并将通道和探测两条规则里的所有 `127.0.0.1:PORT` 替换为 Host 可达的局域网地址与端口（例如 `192.168.1.20:PORT`）。代理机器的 loopback 不是 Host。配置内容见[英文版](private-ingress.md#reference-configs)：nginx 和 Caddy 已于 2026-11-09 实测（配对、真实回复、撤销均通过；测试时由 Cloudflare Quick Tunnel 终止 HTTPS，证书需你自己配置）；frp、ngrok 为参考配置，尚未实测；自己的 Cloudflare Named Tunnel 建议直接用内置的 **固定地址** 选项。

frp 的常规代理由 Host 旁的 `frpc` 主动连接公网服务器的 `frps`，再转发到本机网关端口。在服务器上用 HTTPS 反向代理承接其 HTTP 代理时，必须透传上面的两条路径、WebSocket 升级和准入头，同时保留公开 `Host` 头，frps 才能匹配 `customDomains`（nginx 使用 `proxy_set_header Host $host;`，Caddy 默认保留 Host）。仅设置 `vhostHTTPSPort` 不会自动为 HTTP 代理终止证书；HTTPS/https2http 是另一种配置，参见 [frp 官方示例](https://gofrp.org/en/docs/examples/https2http/)。frp 是通用隧道，不是 Tobs [私有 Relay 协议](private-relay-standard.zh.md)的实现。Named 的完整步骤见 [Named Tunnel 教程](private-named-tunnel.zh.md)。

## 复制给你的 agent

复制完整代码块，仅提供公开部署信息；代理在其他机器上时，明确它是哪台机器、承担什么角色。

```text
帮我通过自己的 HTTPS 代理/隧道连接现有 Tobs Host。先读 https://tobs.app/docs/private-ingress/；不可访问时读 https://github.com/BotHarness/DeepSeekBot/blob/main/docs/private-ingress.zh.md。缺少时询问我的公网/内网 HTTPS 地址、代理类型和位置，以及已授权的访问方式。

1. 检查实际运行的 Host/Profile/版本、CLI 帮助、已有连接、DNS/证书、代理和端口归属。确认代理如何到达这台 Host。反向代理本身不能穿透家庭 NAT，远程服务器的 loopback 也不是家中电脑。路径不存在时，先说明需要的隧道/网络选项。
2. 约定具体改动，保留现有服务、DNS、TLS、连接和配对。不擅自购买基础设施、覆盖 custom 连接、启用局域网监听或修改共享防火墙。服务商登录由我完成；凭据只用本地受保护输入/文件，不进入聊天、命令参数或日志。
3. 在 Tobs 自带代理流程登记 HTTPS 地址，取得稳定的专用设备网关端口并配置转发。原样保留 GET /botharness-device/channel 的 WebSocket Upgrade/Connection 和 X-BotHarness-Admission，以及 GET /.well-known/botharness-tunnel/<nonce>。空闲 WebSocket 至少保持 60 秒，拦住无关路径，不发布 Host 网页/管理端口。只有代理位于其他局域网机器且已获授权时才开启 LAN 监听。
4. 重载前验证代理配置，再检查 DNS、系统信任的 TLS 和所选地址上的 Tobs 可达性探测。网页登录挑战不能拦住手机通道。不跳过证书检查、不暗中使用官方 Connect，不把尚未实测的 frp/ngrok 参考配置当成已验收部署。
5. 让我在本机扫码、核对 Host 指纹并批准准确手机公钥，配对材料不进入聊天。在目标外网或约定内网验证真实 Bot 回复、重连及经授权的测试手机撤销。无法执行的手机/模型检查明确标为待完成。
6. 报告修改资源、真实检查和剩余步骤，给出只针对本次配置的重启与回退方法；保留 Host Profile、其他代理规则、证书和设备授权。
```

## 验证与维护

通过所选 HTTPS 地址完成[连接验证](private-connect.zh.md#验证所选连接)，不能用 localhost 捷径代替。仅内网入口应从手机所在的目标内网验证内网 DNS、可信证书与连接，不要求外部 Wi-Fi/蜂窝网；Bot 模型连通性另算。记下上游端口，确保代理重载/重启后仍使用它，并保留旧代理配置用于回退。支持单条连接控制的版本中，停止保留配置，移除入口不等于撤销手机。清理前核对归属，只移除本条代理规则/DNS，不为退役一条连接而停止共享 nginx/Caddy。

## 没有外网的公司内网

使用自己的代理，配一个内网地址，例如 `https://bot.corp.internal`。这种模式下连接不依赖外网或官方服务：手机、代理和这台电脑只在你的网络里通信（Bot 的模型服务另算）。

- **内网 DNS**：手机和这台电脑都要能把这个名称解析到代理，例如通过公司 DNS 或 mDNS（`电脑名.local`）。
- **证书信任**：用公司 CA 为代理签发证书，并通过设备管理（MDM）把这个 CA 安装为手机和这台电脑都信任的证书。Tobs 只接受系统已经信任的证书，不会自己导入 CA，也不会跳过证书校验。
- **信任缺失时的表现**：这台电脑不信任证书时，检查结果显示 `tls`；手机会拒绝配对，提示"这台手机不信任电脑地址的证书……"，错误代码 `socket-tls`。
- **何时改用同一 Wi-Fi**：如果手机能连到和电脑相同的 Wi-Fi，加密的局域网模式（设置 → 连接 → 管理 → 局域网访问）不需要证书、DNS 或代理，最简单。

2026-11-09 在 iOS 27 模拟器上用测试公司 CA 实测：未装 CA 时拒绝配对；装上 CA 后通过 mDNS `.local` 地址完成配对、收到真实回复并成功撤销。Android 尚未实测。

## 出错时

设置页和 `tobs devices` 会显示原因代码：`dns`（域名解析不到）、`tls`（证书不受信任）、`http-404` 或 `http-502`（代理没有转发检查路径）、`timeout`。Tobs 会持续重试，不会改用官方中继。
