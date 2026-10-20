# 用 Tailscale 配对手机

DeepSeekBot 手机 App 连接的是你自己电脑上的 DeepSeek Harness（DSH）。Bot、聊天记录和审批都留在电脑上，手机只是远程客户端。

测试版（TestFlight 与 Google Play 内部测试）**只能通过 Tailscale 连接电脑**：手机和电脑登录同一个 Tailscale 网络（tailnet），电脑用 `tailscale serve` 把 DSH 发布成 `https://<电脑名>.<tailnet>.ts.net`，手机扫码后就通过这个地址连回电脑。不需要公网 IP，不用改路由器，在外面用蜂窝数据也能连。测试版没有云端账号和云服务入口。

整个流程大约 10 分钟：

1. 手机和电脑都安装 Tailscale，并登录同一个账号。
2. 电脑启动装有 DeepSeekBot 插件的 DSH。
3. 在电脑上运行设置里显示的 `tailscale serve` 命令。
4. 在电脑上生成配对二维码，用手机 App 扫码。

## 1. 安装并登录 Tailscale

Tailscale 个人版免费。在**手机和电脑**上都安装：

| 设备    | 下载                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| iPhone  | [App Store：Tailscale](https://apps.apple.com/app/tailscale/id1470499037)                                                                  |
| Android | [Google Play：Tailscale](https://play.google.com/store/apps/details?id=com.tailscale.ipn)                                                  |
| 电脑    | [tailscale.com/download](https://tailscale.com/download)（macOS、Windows、Linux）。macOS 推荐官网的独立版，它自带 `tailscale` 命令行工具。 |

安装后在两台设备上用**同一个账号**登录（Google、Microsoft、GitHub、Apple 等都可以），并保持开关为已连接。手机上第一次打开时，系统会请求添加 VPN 配置，选择允许。

登录后，在电脑上打开 [Tailscale 管理后台的 DNS 页](https://login.tailscale.com/admin/dns)，确认 **MagicDNS** 和 **HTTPS Certificates** 都已开启。手机只接受 `*.ts.net` 的 HTTPS 地址，没有 HTTPS 证书就连不上。

## 2. 在电脑上启动 DSH 和 DeepSeekBot

启动 DeepSeek Harness 桌面端（或 `dsh web`），确认已经安装并启用 DeepSeekBot 插件，左侧能看到 **Bot 模式**。还没安装的话，先按 [安装 DeepSeekBot](/zh/docs/installation) 操作。

进入 **Bot 模式**，点击左下角的齿轮打开 **Bot 设置**，选择 **设备**。

![Bot 设置中的设备页，Tailscale 已就绪](/guides/mobile-pairing/01-devices-zh.webp)

如果像上图一样只显示 **配对手机** 按钮，说明 Tailscale 已经就绪，直接跳到第 4 步。

## 3. 把 DSH 发布到 tailnet

Tailscale 没装好或还没发布时，**设备** 页会显示黄色提示和一条命令，例如：

![没有找到 Tailscale 时的提示和 tailscale serve 命令](/guides/mobile-pairing/03-tailscale-missing-zh.webp)

在电脑上打开终端，**原样运行提示里的命令**（端口号以你的提示为准）：

```bash
tailscale serve --bg 3080
```

- `--bg` 表示在后台持续运行，关掉终端或重启电脑后仍然有效。
- macOS 上提示找不到 `tailscale` 命令时，可以用完整路径：`/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg 3080`。
- 第一次运行时如果命令输出一个链接，说 tailnet 还没开启 HTTPS，打开链接开启后再运行一次。

这条命令只把 DSH 发布给你自己 tailnet 里的设备，公网访问不到。运行后关掉设置窗口再打开 **设备** 页，黄色提示消失就可以继续。

## 4. 生成配对二维码并在手机上配对

在电脑的 **设备** 页点击 **配对手机**，会弹出二维码：

![扫码配对窗口，显示二维码和复制配对链接](/guides/mobile-pairing/02-pair-qr-zh.webp)

二维码**只能用一次，10 分钟后失效**。过期了点 **换一个二维码** 即可。

在手机上：

1. 确认 Tailscale App 处于已连接状态。
2. 打开 DeepSeekBot App。第一次打开会直接进入 **与电脑配对** 页面；已经配对过其他电脑的，打开 **工作区** → **电脑** → **配对新电脑**。
3. 允许使用相机，对准电脑上的二维码。扫不到时，在电脑上点 **复制配对链接**，把链接发到手机（例如用自己的备忘录或聊天工具），粘贴到 **或粘贴配对链接** 输入框。
4. 可以在 **在这台手机上的名称** 里给手机起个名字，然后点 **配对**。

配对成功后，手机会显示电脑上的 Bot 和群聊，电脑的 **设备** 页也会在 **已配对设备** 中列出这台手机和最近使用时间。之后电脑重启、DSH 重启都不需要重新配对。

## 常见问题

**电脑设置里说「这个二维码只有本机地址」**
Tailscale 还没把 DSH 发布出去。回到第 3 步运行 `tailscale serve` 命令，然后点 **换一个二维码**。

**手机显示连不上电脑**
依次检查：手机上的 Tailscale 是否已连接；两台设备是否登录同一个账号；电脑是否开机且没有睡眠；电脑上的 DSH 是否在运行。在手机浏览器里打开 `https://<电脑名>.<tailnet>.ts.net`，只要显示出电脑返回的页面（哪怕是 DSH 的报错页），就说明手机能连到电脑；如果浏览器提示找不到网站、无法连接或证书错误，说明还连不上。

**重启 DSH 后设置又出现黄色提示**
提示里的端口和之前不同时，按新提示再运行一次 `tailscale serve` 命令。

**手机丢了或不想再用这台手机**
在电脑 **设备** 页的 **已配对设备** 里点 **撤销**，手机会立刻断开。手机上的 **取消配对** 只会删除手机自己保存的凭据。

**公司或学校网络能用吗**
Tailscale 在大多数网络下都能直连或通过它自己的中继连通。如果所在网络屏蔽了 Tailscale，暂时无法使用；之后可能会提供不需要 Tailscale 的连接方式。

## 安全说明

- 配对后的手机拥有和你在电脑上一样的权限，请只配对自己的设备。
- 手机上的凭据只保存在系统钥匙串（iOS Keychain／Android Keystore）里，电脑只保存它的哈希值。
- DSH 本身仍只监听本机地址，手机的请求经过 DeepSeekBot 的设备网关转发，并且随时可以撤销。技术细节见 [ADR-0199](adr/0199-paired-devices-reach-the-host-through-a-same-listener-device-gateway.md)。
