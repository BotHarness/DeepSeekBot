# 远程 Host 凭据由本机 Host 保管

Issue [#4201](https://github.com/BotHarness/DeepSeekBot/issues/4201)（H3）。决定：本客户端用于已配对远程 Host 的凭据由本机 Host 保管，浏览器只持有不透明句柄。

## 迁移的内容

一个已保存的远程 Host 带有三项秘密：

- 以 `Device …` 发送的设备或成员凭据；
- Noise XK 静态私钥（`encryption.deviceKey`）；
- 私有中继准入 token（`encryption.privateRelay.token`）。

Host 把它们存进 DSH 凭据服务的 `botharness-private/remote-host-…`。`remote_host_custody` 表只记句柄、Owner Human id、远程 Host id、是否成员身份和路由。浏览器存储仍是原来的已保存 Host 结构，只做以下替换：

- `credential` 换成 `custody.<43 个 base64url 字符>`；
- `encryption.deviceKey` 换成对应公钥；
- `encryption.privateRelay.token` 换成它的 SHA-256 摘要。

## 请求路径

只要 carrier 提供 `HostCarrier.custody()`，`encryptedCarrier()` 就把句柄交给它。浏览器里这个 carrier 把每个请求发到仅 Owner 可用的 `POST /api/botharness/remote-custody`。Host 用真实秘密建立加密会话，并且只在 Host 内把 `Device <句柄>` 换成 `Device <凭据>`。长连接先用同一路由准备 socket，再通过 `GET /api/botharness/remote-custody/stream` 接收 `open`、`message` 和 `closed` 事件。发送在 `open` 之后开始，并按顺序发出。带句柄的头像也走同一请求路径。

只有 Noise 加密路由，或 Host 为该句柄记录过的普通路由，才会收到凭据。其他来源一律以 `custody-route-unknown` 拒绝。远程 Host 的连接拒绝会以原错误码还原为 `ConnectRefused`，所以现有的吊销处理照常工作。

## 权限

两条路由都经 DSH 共享 fetch 闸门注册，Member 和 Admin 的 peer 在到达处理函数前就被拒绝。Host 还会拒绝记录的 Owner 与当前 Owner 不同的句柄（`custody-owner-changed`）。因此同源的成员页面既读不到秘密，也用不了句柄。

## 生命周期与迁移

- 每次写入已保存 Host 都会经过 `seal`。新凭据会得到一个句柄。已有句柄则由 Host 刷新路由和轮换后的中继 token。密钥不匹配时拒绝。
- 启动时，客户端把仍含原始凭据的已保存 Host 逐个封存，并在同一次存储写入里换成句柄，旧值随之删除。Host 暂时接不了时保留旧条目，下次启动再试。
- 吊销配对之后会遗忘对应句柄。只在本客户端移除 Host 时也会遗忘句柄。

## 本切片的限制

- 配对、团队登录和关系注册拿到新凭据后，在封存之前的那一刻凭据还在浏览器内存里，但不会写入浏览器存储。
- 普通路由的固定依据是 Owner 客户端最后保存的路由。它防的是误发，防不住已经以 Owner 权限运行的脚本。
- 移动端继续用原有的 SecureStore。本变更只作用于本机 Host 提供的浏览器客户端。
