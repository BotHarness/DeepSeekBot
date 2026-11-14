# Docker 私有 Relay

在自己管理的服务器上运行 Tobs 中继。一个部署支持最多 16 台电脑，各自独立认领和准入，不需要官方 Tobs 账号或 Cloudflare 账号。其他方式见[选择私有连接](private-connect.zh.md)。

**需要手机和电脑都能访问的公网 HTTPS 入口。** 可以使用已有公网服务器，或已正确配置公网访问的家用服务器/NAS。仅有域名、仅在家中 NAT 内运行 Docker，都不等于可以远程连接。部署不会自动购买服务器、修改 DNS 或路由器端口，也不保证所有运营商都可达。

## 部署

中继部署文件与多 Host 配置要求 **Tobs 1.7.0 或更新版本**；Host 更旧时先按[安装/升级教程](https://tobs.app/docs/installation/)升级。打开与已安装 Host 匹配的 [Tobs Release](https://github.com/BotHarness/DeepSeekBot/releases)，下载源码归档，将完整 `deploy/private-relay` 目录复制到服务器并记录标签/提交。不要从任意移动分支部署或对现有部署重复初始化。该目录运行中继，不是将 Bot Host 装进 Docker 的镜像。

服务器需安装 Docker Compose 和 Node 24。将发布版本的 `deploy/private-relay` 目录复制到你管理的绝对路径，配置已有域名指向服务器，确保公网 TCP 80/443 可达且未被其他服务占用。Caddy 自动申请和续期证书；证书签发与运营商连通性仍需检查。

例如文件放在 `/opt/botharness-private`，在**该服务器的 Bash** 中执行；请替换为实际完整目录和域名：

```bash
node /opt/botharness-private/setup.mjs relay.example.com
docker compose --project-name botharness-private --project-directory /opt/botharness-private --file /opt/botharness-private/compose.yaml up --build --detach
```

设置程序生成私有 `.env` 和 `bootstrap.secret`，不会打印密钥。不要提交、截图或分享这些文件。Compose 将密钥传入容器环境，服务器管理员仍可查看；这不能防范服务器管理员。中继以非特权用户运行，持久化准入凭据的哈希，转发加密数据，不保存聊天历史。

## 认领与手机配对

先检查公网 DNS/TLS，再从服务器之外请求 `https://relay.example.com/health`，应显示支持 `botharness-private-v1` 和 `botharness-private-v2`。健康检查只证明中继可达，不证明手机可用。如果其他服务占用 80/443，保留它并明确适配已有 HTTPS 代理，不原样启动 Compose 示例。

1. 在可信电脑打开**Bot 设置 → 连接 → 添加连接 → 用手机连接这台电脑 → 已安装 App，开始连接 → 进阶方式 → Docker 中继**。
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

从单台电脑的部署升级：拉取新的 `deploy/private-relay` 文件，在同一个项目目录运行 `docker compose --project-name botharness-private --project-directory /opt/botharness-private --file /opt/botharness-private/compose.yaml up --build --detach`。原有认领、手机和数据卷都照常工作，之后再用 `add-host` 添加电脑。线上协议见[中继标准](private-relay-standard.zh.md)，附第三方中继可用的一致性测试脚本。

## 失败恢复

- **无法连接：**检查公网 DNS、端口、HTTPS 证书和容器状态。不要关闭证书校验；私有连接失败不会偷偷使用官方中继。
- **已被认领：**回到原电脑和原 Profile，不要为了消除错误删除中继数据卷。
- **认领时断网：**电脑会在请求前保存私有凭据。只有中继已接受认领时，重启才可重连；认领从未到达中继时，Host 会持续重试控制连接并显示 `private-relay-unreachable`，使用该所有者凭据认证的 `GET /status` 返回 `404`，再次从界面认领可能返回 `private-relay-already-configured`。保留 Profile 和中继状态排查，不重复认领、删除凭据或重置卷来强行恢复。目前没有已定义的重复认领恢复流程。
- **服务器重启：**保留 `relay-data`、Caddy 数据卷和电脑凭据。删除卷是破坏性重建，不是升级步骤。
- **手机丢失：**在可信电脑撤销旧设备。若所有可信密钥均丢失，需要重建并重新配对；服务器账号无法恢复旧 Host 身份。

停止部署时使用相同的绝对 Compose 路径和项目名执行 `down`，**不要加 `--volumes`**，不要改动其他服务。当前不含离线云队列、远程唤醒、新媒体能力或免费托管保证。中国大陆普通网络仍需单独通过发布验收。

CLI 见[私有连接命令](bot-cli.zh.md#docker-私有连接)。真机验收记录在 [#3746](https://github.com/BotHarness/DeepSeekBot/issues/3746)；本文不代表已验收通过。

## 复制给你的 agent

复制完整代码块，另外提供公开部署信息和已授权服务器访问方式；认领密钥不进入聊天。

```text
帮我在自己的服务器上部署 Tobs Docker 私有 Relay，再连接现有 Host。先读 https://tobs.app/docs/private-relay/ 和 https://tobs.app/docs/private-relay-standard/；不可访问时读 https://github.com/BotHarness/DeepSeekBot/blob/main/docs/private-relay.zh.md 和 https://github.com/BotHarness/DeepSeekBot/blob/main/docs/private-relay-standard.zh.md。缺少时询问公开主机名、已授权服务器访问方式、部署目录和目标 Host。

1. 检查 Host 版本/Profile/私有模式，以及服务器 DNS/入站连通性、Docker Compose、Node 24、已有项目和端口归属。家庭内网容器/域名本身不提供公网访问。保留其他服务栈和 Host 数据/配对。Docker Relay 是互斥模式，改变已有私有模式前先询问。
2. 约定具体资源，不购买基础设施、开启付费服务、替换无关 DNS 或停止占用 80/443 的服务。选择与已安装受支持 Host 匹配的源码发布/标签，记录固定提交，复制完整 deploy/private-relay 目录。需要服务商登录/管理员确认时由我完成。
3. 仅新部署运行 setup.mjs 配置约定主机名，再以明确项目名和目录启动 Compose。.env、bootstrap.secret、新 Host 密钥和所有者令牌留在本机私有位置；秘密只通过受保护输入/文件/stdin 传递，不进聊天、进程参数或日志。保留已有初始化文件/卷，不为强行认领重置或重复初始化。
4. 验证公网可信 HTTPS 和 /health，再从实际本机 Host 用界面或 private-connect --hostname <https-origin> --token-stdin --confirm 认领，密钥从私有文件传入。结果未知时不自动重放，检查同一 Profile/状态，不暗中使用官方 Connect。
5. 让我在本机扫码、核对 Host 指纹并批准准确手机公钥，二维码不进聊天。手机使用流量/外部 Wi-Fi 验证真实 Bot 回复，再经授权保留持久化卷重启并验证手机重连。新增电脑分别使用 add-host 密钥独立批准，不重复使用 bootstrap.secret。
6. 分别报告服务健康、Host 连接、真实手机回复和待测试项目。提供不泄密的诊断和保留 relay-data/Caddy 卷及 Host Profile 的升级/回退方法。停止用同一项目的 down，不加 --volumes。仅经授权撤销测试手机；退役中继不等于撤销手机。
```
