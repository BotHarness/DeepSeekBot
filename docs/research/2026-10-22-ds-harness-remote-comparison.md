# ds-harness-remote 对比：安全通道、连接恢复与 Local Computer 视频

日期：2026-10-22。第三方源码固定在 [`28a2da05deeffdf0556f1e7de1f5eaec9fb5a196`](https://github.com/liguobao/ds-harness-remote/tree/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196)。本轮是静态源码及第一方测试审阅，没有运行第三方程序、安装依赖、启动 Host 或验证真机。测试存在、上游报告通过和本轮复现通过是不同证据；本文不声称后者。

BotHarness 的已接受基线是 [ADR-0244](../adr/0244-local-computer-video-separates-media-control-and-pause.md)、[#2555](https://github.com/BotHarness/DeepSeekBot/issues/2555) 及其切片。Connect 加密依赖为 [#2542](https://github.com/BotHarness/DeepSeekBot/issues/2542)。初次审阅仅提供借鉴建议；Human 随后确认的文档与 issue 更新记录在末节“后续采纳”。

## 核心区别

ds-harness-remote 的 WebRTC 是承载 Remote RPC/Event 的 **DataChannel**。当前适配器暴露 `createDataChannel`，业务链路以加密字节消息收发；审阅的 WebRTC/Host helper 接口没有采集桌面或添加视频 track 的路径。它可以远程使用 Harness 会话、工作区等能力，但不是 #2555 的桌面视频实现。[DataChannel 创建](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/packages/webrtc/src/rtc-data-channel.ts#L382)、[RTC 接口](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/packages/webrtc/src/rtc-adapter.ts#L65-L85)。

因此，最直接可学的是 #2542 的安全 carrier、连接资源隔离和恢复测试；它不能替我们解决 Windows 采集/编码、Android 视频呈现、独占接管或持久 Bot 暂停。我们的首片输入仍走认证 Host commands，不需要因为它使用 DataChannel 就改成 DataChannel input。

## 值得学习：加密与身份不依赖网络路径

**源码事实。** 项目用 `@lukeburns/clatterjs` 包装固定 `Noise_IK_25519_ChaChaPoly_SHA256`，验证握手远端静态公钥后才开放 transport。prologue 绑定协议版本、connectionId、Host deviceId 和 Client deviceId。[Noise 包装](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/packages/crypto/src/noise.ts#L1-L147)。Host 建立安全 channel、注册 RPC 接收者之后才发 responder 握手回复，避免 Client 已经发送首个 RPC 而 Host 尚未准备好。[握手完成顺序](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/packages/plugin/src/server-connection.ts#L475-L505)。

**借鉴建议。** 我们可采用同一原则：Connect carrier 加密、授权与底层 HTTPS/WebSocket 的职责分开；每条加密连接绑定明确的双方身份和连接代际。视频信令仍要经过该认证边界，不能把“WebRTC 自带加密”当作已验证对端身份。具体密码库/协议选型须在 #2542 内评估，不由研究直接引入新 trust store。

**信任边界。** Host 会重新向 Server 查询 Client descriptor、验证 role/id/key；本地已有同 deviceId 不同 key 则拒绝，但首次见到的身份会从 Server 授权结果自动写入 trust store。Client 也按 Server descriptor 初次固定 Host key。这是由账号服务引导的首次信任，不能从“后续 key mismatch 拒绝”推出“首次注册也能抵抗被攻陷的身份目录”。[Host admission](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/packages/plugin/src/server-connection.ts#L379-L437)、[Client pinning](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/packages/plugin/src/client-connection.ts#L245-L266)。这是机制推论，不是本轮漏洞复现。BotHarness 应明确自己现有 pairing 到加密 key 的绑定方式及首次信任假设。

**验证边界。** 上游有 tamper、replay、身份错配测试与固定 golden vectors，适合学习其契约测试组织；固定向量并不自动证明已与独立实现互通。上游自己的安全文档仍把长期连接 rekey 与独立密码审查列为后续工作。[Noise 测试](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/packages/crypto/tests/noise.test.ts#L9-L73)、[向量契约](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/fixtures/crypto/v1/README.md#L1-L26)、[安全文档限制](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/docs/end-to-end-encryption.md#L106-L115)。

## 值得学习：每个连接拥有自己的资源

**源码事实。** `ConnectionController` 维护 connectionId → channel/router，序列化 accept；同设备新连接替换旧连接，不断开其他设备；stream 回包闭包绑定原 channel，发送前核对仍为活动实例。每个 Client 可以使用相同 stream id，而不串流。[连接 owner](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/packages/plugin/src/connection-controller.ts#L45-L110)、[活动实例检查](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/packages/plugin/src/connection-controller.ts#L165-L199)、[多端相同 stream id 回归](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/packages/plugin/tests/multi-client-runtime.test.ts#L209-L260)。

**借鉴建议。** #2560 的观看连接、媒体 attempt 和控制 grant 都需要这种具体实例/代际隔离：旧手机重连不能关闭另一观看端，迟到 promise 不能把旧输入/帧交给新连接。但对方多端 RPC 并不实现唯一 Computer controller，我们仍需 Computer owner 在执行输入时检查控制代际，并保留 Bot 操作屏障。

**撤销要分层验证。** 上游 Server connection error 会 `dropTunnel`，其中显式关闭 RTC，再关闭 router/channel；本地 `revokePeer` 则删除 trust 并调用 `connections.revoke`。`ServerNoiseChannel.close` 清理消息处理器、分片与 Noise，并从 tunnel map 移除，但自身没有直接 `rtc.close` 调用。本轮没有实测不同撤销入口的原生 peer 释放，也不能把逻辑 RPC 失效当作所有资源已经物理关闭。[Server 清理路径](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/packages/plugin/src/server-connection.ts#L799-L841)、[本地撤销](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/packages/plugin/src/service.ts#L375-L379)、[channel close](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/packages/plugin/src/server-connection.ts#L934-L943)。对 #2555 尤其重要：已建立的视频必须由 Host 真正停止发送；仅撤销信令或销毁 RPC key 不足以结束独立媒体 track。

## 值得学习：有界恢复与不能重放的操作

Android `ForegroundConnectionRecovery` 只为此前健康连接自动恢复；1/3/8 秒有限重试，单一 in-flight；owner 将其设为 inactive、Host 切换、明确断开、reauth 或非 retryable 错误会取消重试，timer 回调再次检查当前身份与状态。类契约明确恢复连接而不重放 mutation。不能仅凭类名断言 App 后台就停止恢复；当前上游还在推进后台保活。[实现](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/apps/android/src/services/connection-recovery.ts#L1-L102)、[恢复测试](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/apps/android/tests/connection-recovery.test.ts#L34-L104)、[后台工作记录](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/docs/TODO.md#L24-L30)。

其自动策略可转向 Relay；这部分**不适用于我们的无媒体回退决定**。可借鉴的是重试 owner、失效条件和不重复执行 mutation。#2561 恢复观察后仍需遵守明确接管、后台释放控制与暂停持久化；点击或文本发送结果不确定时不能重发。

## 值得学习：不是只测连接成功

- **安全通道负向证据：** Server 测试故意修改密文 tag 或提升外层 counter 后重放，确认密文已被 Server 转发而生产 Client 拒绝；避免把“服务器提前丢包”误当作端点加密防御成功。[测试](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/apps/server/tests/server.test.ts#L227-L266)。
- **多端隔离：** 测试另一端重连时预览 socket 不被关闭，以及 Host shutdown/端口权限更改的清理。[多端资源回归](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/packages/plugin/tests/multi-client-runtime.test.ts#L261-L414)。
- **缓冲边界：** RTC 分块限制总量 4 MiB、最多 8 个在途重组、30 秒过期；Host 串行化加密发送，避免共享 Noise counter 并发；WebSocket 发送检查 bufferedAmount。[RTC 分片](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/packages/webrtc/src/rtc-chunking.ts#L24-L27)、[串行发送](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/packages/plugin/src/server-connection.ts#L870-L910)、[backpressure](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/packages/webrtc/src/websocket-backpressure.ts#L1-L12)。这些是加密消息管道的约束，不是把视频帧塞进 RPC 的理由。

上游 [2026-10-16 验证报告](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/docs/protocol-validation-2026-10-16.md#L1-L103) 固定在较早 `ad48781`，明确只运行本机 HTTP/WebSocket/Noise，报告未完成全仓构建、未测真实 NAT/TURN，且不等于完整 Host membership/trust 验收。当前源码测试可作设计参考，但该报告不能外推为当前 SHA 的公网可靠性、媒体性能或独立安全审计结论。

当前 [TODO 真机记录](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/docs/TODO.md#L278-L289) 则明确勾选了 Android UI、重连后 stream/history 重建，以及 `react-native-webrtc` 与 Host werift 的 P2P/TURN 真机互通；不能用较早报告推断该项目从未做过这些验证。同一记录仍把长期恢复、网络切换及原生 conformance 列为待验。其 [小米实机日志](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/docs/TODO.md#L24-L30) 记录息屏约 5.7 秒后 OEM 冻结并销毁 TCP，即使 foreground service 存在。这支持我们不承诺后台观看、前台恢复只观察的范围选择；它不是所有 Android 设备行为的普遍证明。

## 实际路径诊断，比“已连接 WebRTC”更有用

`inspectSelectedPath` 从 `getStats()` 读取实际选中的 candidate pair，以 candidate 的 `id` 解析双方类型，发现 relay candidate 才显示 TURN；还提取 RTT、可用发送码率和收发字节。它支持 LAN/P2P/TURN 的具体诊断，而非只展示配置偏好。[实现](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/packages/webrtc/src/rtc-data-channel.ts#L658-L715)。

#2562 可借鉴实际路径、阶段、失败来源与有界计数，但日志应脱敏地址及凭据。网络 RTT 不等于 input-to-visible 延迟，DataChannel 字节量也不能证明视频已呈现；我们的验收还要覆盖真实首帧、presented FPS、视频码率和操作反馈延迟。

## 自托管与带宽：公开 Server 是 Relay-only

仓库中的 `apps/server` 是单账号、自托管加密 WebSocket Relay，独立于 Host Plugin 部署。其 `hello.ack` 明确设定 `webrtcEnabled: false`，只接纳 relay capability，并拒绝选择非 relay 路径。因此必须区分 Client/Host 库提供的 LAN/P2P/TURN 能力、作者托管服务与本仓库附带的最小 Server。[部署文档](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/apps/server/README.md)、[Server 协商与转发](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/apps/server/src/gateway.ts#L88-L157)。

自托管 Relay 的业务流量仍由部署者承担；端到端加密不会消除中继带宽。其代码有最大帧、连接数量、慢消费者及发送缓冲限制，这些有助于限制资源失控，并不等于月度账单封顶。公开源码不足以确定作者托管服务的真实账单、补贴和长期免费额度。[资源限制](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/apps/server/src/gateway.ts#L19-L73)。

它传的是业务消息及文件等数据，不是持续桌面视频，不能据其可用服务推断免费视频中继可持续。我们保留直连优先、自配 TURN、Connect 不转发视频的成本边界；不新增公共 Relay 视频回退，也不把 DataChannel 分片当作视频传输方案。

## DSH seam 与原生依赖：学习边界，不整体移植

其 `RemoteTransport` 把字节传输与身份握手信息分离，接口很小；这是 #2542 可以参考的边界。但其 DSH 接入还会替换既有 Typert Gateway 的 `invoke`、`stream`、`dispatchRpc`、`openWireStream` 方法，并适配不同 dispatcher 参数签名。这服务于把完整 Harness Client 切到远端的目标，也带来版本兼容负担。BotHarness 已有认证 Host/Device gateway 与 Computer Provider，不应为增加视频再引入一套 gateway 切换、配对目录或通用代理。[Transport 接口](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/packages/webrtc/src/transport.ts#L1-L15)、[Gateway switch](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/packages/plugin/src/typert-gateway-switch.ts#L110-L143)。

它当前的 `disconnectRemote` 保留已选远端 authority，对远端操作返回 `remote/disconnected`，只有明确退出才回本地。这个行为值得保留：连接故障不能把操作悄悄发给另一台电脑。[断线处理](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/packages/plugin/src/typert-gateway-switch.ts#L168-L183)。

Host RTC 工厂优先加载原生 `@roamhq/wrtc`，不可用时回到 werift；Electron 路径用外部 Node helper，普通 Node 路径则先尝试进程内原生库。它并非所有部署都隔离了原生 RTC。可借鉴延迟加载、helper 运行时探测与 pnpm 包路径处理，但这些不是桌面采集/硬件编码实现，也不证明我们的 Windows/Node 24 组合已兼容。[RTC factory](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/packages/plugin/src/werift-rtc.ts#L136-L179)、[helper](https://github.com/liguobao/ds-harness-remote/blob/28a2da05deeffdf0556f1e7de1f5eaec9fb5a196/packages/plugin/src/native-rtc-helper.ts)。我们仍由 Computer Plugin/Fiber 管理可监督 Subprocess 和媒体资源，具体 DSH API 在实现时验证。本轮不决定媒体库，也不增加多个原生后端。

## 对现有切片的建议映射

| 工作               | 可直接加强的契约                                                           | 保持既定边界                                 |
| ------------------ | -------------------------------------------------------------------------- | -------------------------------------------- |
| #2542 Connect 加密 | 身份首次绑定、连接 transcript/代际、tamper/replay 测试、消息大小与发送顺序 | 使用现有配对 authority，不增加另一套设备身份 |
| #2558 首片         | Host owner 先准备接收再宣告 ready；所有关闭路径覆盖 helper/peer/tracks     | 真 Windows 采集与 Android 呈现，无图片回退   |
| #2560 多端         | 同 id 不串流、重连只替换本人、旧回调不能关闭新资源                         | 排他控制是 Computer 语义，不是多端连接语义   |
| #2561 恢复         | 有界重试、前台/身份条件、单 flight、不重放输入                             | 恢复观察不自动接管或恢复 Bot                 |
| #2562 网络         | 真实 ICE 路径与失败来源可诊断，分别验证直连与自配 TURN                     | 不引入官方 Relay 或无上限项目带宽            |
| #2563 Connect 接入 | 消费 #2542 同一安全通道及撤销事实                                          | 视频走媒体路径；Connect 不转发视频           |

这些是现有切片的实现与验证建议，未发现需要重开产品访谈或改变 6 片依赖的依据。

## 后续采纳

2026-10-22，Human 确认按建议更新。安全通道契约纳入 #2542；连接隔离、实际停流、有界恢复、目标保持及真实 ICE 路径诊断纳入 Spec #2555 与 T1/T3/T4/T5/T6 的验收，并同步 ADR-0244 和 living architecture。T2 的输入 no-replay 验收已覆盖，不重复扩展。保留现有六片及依赖、既有 carrier 协议选择、无图片回退和无项目公共媒体中继的决定。本节记录设计采纳，不表示实现或验收已完成。
