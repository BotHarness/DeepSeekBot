# Cloudflare Named Tunnel

使用自己 Cloudflare 账号下的固定主机名。Tobs 在电脑上运行内置 cloudflared，主动向 Cloudflare 建立出站隧道。手机访问该 HTTPS 主机名，再经隧道连接 Host 的加密设备通道，家中电脑不需要公网入站端口。这种方式使用 Cloudflare 基础设施，不依赖官方 Tobs Connect。

其他选择：[私有连接总览](private-connect.zh.md)、[HTTPS 入口](private-ingress.zh.md)、[Docker Relay](private-relay.zh.md)。

## 准备

- 按[安装教程](https://tobs.app/docs/installation/)准备 Tobs 与手机 App，保留现有 Host Profile。
- Cloudflare 账号、该账号下的域名、未使用的主机名（例如 `bot.example.com`），以及创建 Tunnel/DNS 路由的权限。
- 电脑到 Cloudflare 的出站连通性。域名注册和服务商费用另算，不保证所有账号或网络都免费可用。

控制台操作以当前 [Cloudflare 官方教程](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/)为准。不要执行其中的连接器安装命令，Tobs 会运行自己的连接器。

## 配置固定地址

1. 在 Cloudflare One 打开 **Networks → Connectors → Cloudflare Tunnels**（控制台名称可能变化），创建 Cloudflared Tunnel，私下保管连接器令牌。
2. 打开 **Bot 设置 → 连接 → 添加连接 → 用手机连接这台电脑 → 已安装 App，开始连接 → 进阶方式 → 固定 Cloudflare Tunnel**。旧版本入口为**私有连接 → 固定地址**。
3. 填写纯主机名，例如 `bot.example.com`，在受保护字段填写连接器令牌并保存，记下 Tobs 的专用设备网关端口。完成下一步前，公网检查可能失败。
4. 在该 Tunnel 的 **Published application routes**（旧称 Public Hostname）中，将主机名指向 HTTP 服务 `http://127.0.0.1:PORT`，把 `PORT` 换成 Tobs 实际显示的端口。连接器在 Host 上运行，loopback 指的就是 Host。不要转发 DSH 网页/管理端口。
5. 等 Tobs 公网检查通过后显示手机配对码，完成[所选连接验证](private-connect.zh.md#验证所选连接)。

交互式 Cloudflare Access 登录页可能拦住手机 WebSocket，只使用已明确兼容手机的路径。拥有主机名或服务商账号不等于获得 Host 控制权。

## CLI 方式

使用现有本机 Host 及平常的连接参数和私有令牌文件。连接器令牌从仅本人可读的私有文件传入：

```bash
deepseekbot private-tunnel-enable --hostname bot.example.com --token-stdin --confirm < /absolute/private/connector-token.txt
deepseekbot devices
```

先检查已有连接，不覆盖已占用的 custom 位置。较新 Host 还提供[独立连接命令](bot-cli.zh.md)。

## 复制给你的 agent

复制完整代码块，替换公开主机名，也可以让 agent 再询问。

```text
帮我为现有 Tobs Host 配置自己的 Cloudflare Named Tunnel。先读 https://tobs.app/docs/private-named-tunnel/；不可访问时读 https://github.com/BotHarness/DeepSeekBot/blob/main/docs/private-named-tunnel.zh.md。目标主机名：bot.example.com（替换成我的）。

1. 检查已安装 Tobs 版本、实际运行的 Host/Profile、CLI 帮助、已有私有连接，以及我的 Cloudflare 账号和域名权限。保留数据、配对、DNS 和其他隧道。不能操作电脑/账号时，提供准确手动步骤并标为待完成。
2. 约定空闲主机名、具体资源及网络发布范围，不购买域名或开启付费服务，服务商登录由我完成。连接器令牌只通过本地受保护输入或私有文件/stdin 传入，不进入聊天、命令参数或日志。
3. 创建约定的 Tunnel，配置 Tobs 固定地址，只将主机名转发到 Tobs 显示的专用设备网关 loopback 端口。使用内置 cloudflared，不额外启动连接器，不发布 Host 管理入口。custom 位置已被占用时，询问保留哪条，不自动覆盖。
4. 检查 DNS、可信 HTTPS、WebSocket 转发和 Tobs 公网可达性，按错误原因修复，不跳过证书验证或切换官方 Connect。检查通过前不提供配对码。
5. 让我在本机扫码、核对 Host 指纹并批准准确手机公钥，配对材料不进入聊天。用手机流量或外部 Wi-Fi 验证真实 Bot 回复，经授权再验证连接器重启后固定地址可用。不能仅凭健康检查或进程运行宣布完成。
6. 报告修改资源、真实结果和待完成的手机/网络步骤，给出仅针对这条 Tunnel/DNS 的恢复与移除方法。保留 Profile 和其他资源；撤销手机与移除隧道分别处理。
```

## 恢复与移除

已启用的 Named Tunnel 随 Host 重启恢复，主机名不变。电脑休眠或停止时无法访问。`dns` 错误检查主机名/DNS 路由；源站失败检查准确的 HTTP loopback 端口；连接器拒绝检查私有令牌/账号。保持 TLS 验证开启。

带停止/恢复控件的版本中，停止保留配置；移除忘记该连接，丢失的手机需单独撤销。退役时确认没有其他服务依赖，再只删除这条 Tunnel 和对应 DNS 路由，保留其他连接器与 DNS。

## 验证范围

[PR #3780](https://github.com/BotHarness/DeepSeekBot/pull/3780) 记录了免费套餐域名上 Named Tunnel 的 iOS 模拟器配对、真实回复、同地址连接器恢复及撤销验证。真机、中国大陆运营商与媒体功能仍需单独验收。
