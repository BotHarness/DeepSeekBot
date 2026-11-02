# NinjaSDK 用于 DeepSeekBot Local Computer viewer 的适配研究

日期：2026-10-22。状态：源码研究；未安装依赖、运行上游程序、启动采集或进行性能／安全验证。

固定研究版本：[steveseguin/ninjasdk `328965a06fa19cf47c3f01182e9cb1d91f39214e`](https://github.com/steveseguin/ninjasdk/tree/328965a06fa19cf47c3f01182e9cb1d91f39214e)，提交时间为 2026-10-22。以下源码链接均固定到该版本。`package.json` 标记 `1.6.2`，但已发布 `v1.6.2` 标签指向另一提交 `2a846f37512e711ca3ab9be8fb391a867d0614e9`；不能假设 npm `1.6.2` 已包含本文所见主分支行为。[包声明][package]、[发布页](https://github.com/steveseguin/ninjasdk/releases/tag/v1.6.2)

## 结论

**可列为候选媒体 adapter，但暂不足以选为 Local Computer 默认实现。** 它已有音视频传输、连接恢复、质量统计和跨语言实现，且可以关闭公共 TURN 或指定自有 TURN。真正未解决的是 Windows 屏幕采集／编码、与 DSH 身份及撤销机制的整合，以及 Expo 接收端。

另一个重要成本是信令耦合：NinjaSDK 是 VDO.Ninja 协议实现，公开 API 没有提供可注入任意 Host offer／answer／ICE transport 的通用接口。已有 Host 信令与权限体系时，采用它意味着维护 VDO 兼容信令 adapter，或向上游增加稳定扩展点，而不是换一个发送库即可。

用户已接受的约束为：优先直连；需要中继时由用户自配 TURN；项目不承担公共 TURN 服务。下文据此评估，不把第三方当前免费服务当成产品依赖。DSH Computer 继续拥有资源、观看授权、接管授权与输入执行权。

## 源码事实：它提供什么，尚缺什么

### 用户提出的三个入口分别解决什么

| 项目          | 核查版本与实际用途                                                                   | 对本轮 Local Computer 的判断                                                    |
| ------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| ninja-p2p CLI | `ae7d95608d9c192074ade70294416c917451c9da`；代理消息、文件、持久 inbox/outbox        | 不作为屏幕视频发送器；其 wrapper 默认 data-only                                 |
| NinjaMCP      | `10e8642a1d32440e6f01ca9e62b7c8c896324a64`；代理通信工具，可选 Chrome browser worker | 有真实标签页视频，但拥有自己的浏览器与控制 lease，不是 Windows Computer adapter |
| NinjaSDK      | 本文固定版本；媒体轨道、VDO 协议、恢复与统计                                         | 候选媒体依赖，仍需采集、编码、Host 身份与信令适配                               |

CLI 的 publisher 明确 data-only，viewer 使用 `audio:false, video:false`；library 文档要求媒体需求下沉 SDK。另一个 call 示例的屏幕能力是每三秒给 OpenAI 一张截图，与 VDO 房间独立，不能当成手机远控桌面。CLI 的 detached sidecar、持久收件箱和多行输出也不是本项目 Host 持有媒体进程及 CLI 单 JSON 结果的现成实现。[CLI publisher](https://github.com/steveseguin/ninja-p2p/blob/ae7d95608d9c192074ade70294416c917451c9da/src/vdo-bridge.ts#L214-L228)、[viewer](https://github.com/steveseguin/ninja-p2p/blob/ae7d95608d9c192074ade70294416c917451c9da/src/vdo-bridge.ts#L932-L946)、[能力边界](https://github.com/steveseguin/ninja-p2p/blob/ae7d95608d9c192074ade70294416c917451c9da/docs/library.md#L157-L202)、[模型截图](https://github.com/steveseguin/ninja-p2p/blob/ae7d95608d9c192074ade70294416c917451c9da/docs/voice-and-vision.md#L24-L79)。

NinjaMCP 的可选 browser worker 用 Puppeteer 启动隔离 Chrome；媒体 context 用 `getDisplayMedia` 取得真实 tab MediaStream，检查 `displaySurface === 'browser'` 后交给 SDK publish。配置为 15 FPS、1280×720、视频上限 1.5 Mbps；这是配置而非实测。CDP JPEG 截图是另一条路径。这个模式可供未来 Local Browser 研究，但直接安装会形成第二浏览器 owner，不能代表当前 Computer 的真实桌面。[媒体实现](https://github.com/steveseguin/ninjamcp/blob/10e8642a1d32440e6f01ca9e62b7c8c896324a64/scripts/lib/browser-media.js)、[worker](https://github.com/steveseguin/ninjamcp/blob/10e8642a1d32440e6f01ca9e62b7c8c896324a64/scripts/lib/browser-worker.js)。

MCP companion 将 Human live viewing 与显式分享给模型的定时截图分开；但注册 browser MCP 时，observe 可以向模型返回截图，media 可以返回私密观看链接。因此不能把 Human viewer 简化为挂一个 MCP tool；仍需保留 Takeover 期间禁止模型截图的 Host 屏障。[companion](https://github.com/steveseguin/ninjamcp/blob/10e8642a1d32440e6f01ca9e62b7c8c896324a64/references/browser-agent.md)、[browser 契约](https://github.com/steveseguin/ninjamcp/blob/10e8642a1d32440e6f01ca9e62b7c8c896324a64/references/browser-worker.md)。

两个 wrapper 都不能仅凭 `forceTURN:false` 满足默认不使用公共 TURN；必须检查是否向底层传递 `turnServers:false` 或用户配置。当前 SDK 可表达该策略，不等于上层工具已暴露相应配置。

### 免费社区服务与软件复用

VDO 官方确实提供当前免费的信令和 TURN；不是只有库免费。但其 TURN 文档用语是“for free, for now”，许可文件明确托管服务可限制、暂停或撤销；高连接量上线应按官方规则先沟通。公开软件许可不构成无限公共中继承诺。对本项目而言，把成本转到社区运营者不能替代已确定的默认直连／用户自配 TURN 设计。[官方 TURN 说明](https://docs.vdo.ninja/advanced-settings/turn-and-stun-parameters/turn)、[服务规则](https://sdk.vdo.ninja/#guidelines)、[许可与服务边界][license]。

| 路径           | 固定版本中能确认的内容                                                                                     | 不能由此推出的结论                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Node.js        | wrapper 接收 `MediaStream`；媒体运行时依赖 `@roamhq/wrtc`；本 SDK 的 `node-datachannel` adapter 为数据路径 | 安装 SDK 就能采集 Windows 桌面、能硬件编码、适配仓库 Node 24    |
| Go             | Pion track 输入为已编码 sample 或 RTP；提供文件发布示例                                                    | Go 单二进制跨平台意味着已经包含各系统桌面采集／编码             |
| Rust           | sample/RTP track；A/V 示例用 FFmpeg 生成测试图和音频                                                       | 测试图能播放意味着 Windows 桌面发送器已交付                     |
| Kotlin Android | 原生 libwebrtc track、`SurfaceViewRenderer` 接收；协议核心独立 JVM 模块                                    | 可直接导入 Expo／React Native，无需 bridge、原生构建或 iOS 实现 |

来源：[Node wrapper][node]、[runtime adapter][adapter]、[Go 媒体接口][go-readme]、[Rust 媒体接口][rust-readme]、[Rust A/V 示例][rust-av]、[Kotlin README][kotlin]。

Node 的 media shim 只是调用底层 `getUserMedia` 或报不支持；没有 Windows Desktop Duplication／Windows Graphics Capture 的实现。`publish()` 检查传入 stream 与运行时能力，不负责生成桌面帧。Go/Rust 接入现有编码器仍需决定关键帧请求、码率反馈、尺寸变化和背压怎么进入编码链路。这里的“缺口”指所审查入口与示例未提供完整桌面发送实现，不是断言这些语言不能实现它。[adapter][adapter]、[Node publish][node]、[Go][go-readme]、[Rust][rust-readme]

### Node Windows 的证据边界

NinjaSDK 的 Node 文档报告了部分 Windows `@roamhq/wrtc` 构建的 `bufferedAmount` 恒为零，以及底层 native teardown 在正常退出时可能崩溃；文档建议先完成 `disconnect()` 再显式退出。这是供应方记录，本文未复现，也不能外推到所有版本。[Node 文档][node-readme]

运行时自己的当前 README 给出 Windows x64、Node 20/22 的预编译支持，说明基于 WebRTC M106；NinjaSDK README 仍写 M98，资料存在版本差异。仓库使用 Node 24，不能拿 20/22 的表格当作验证结果。[node-webrtc 官方 README](https://github.com/WonderInventions/node-webrtc#supported-platforms)

**架构判断**：若试 Node runtime，应放在 Computer owner 管理的隔离 helper，而非把 native 崩溃风险带进 DSH Host。`process.exit()` 只能是 helper 的退出实现选择，不能按示例用于 Host。仍需验证所选包版本、Windows 安装产物、启动／退出和真实桌面帧。

## 信令：自托管已经存在，但并非通用插槽

首页 SDK 列表说原生实现带 signaling server，FAQ 却说 self-hosting 仍在计划中；源码解决了这个矛盾：Go 有 `signalserver.Server` 与命令行程序，Rust 有 `SignalServer` 与 binary。故“尚无自托管代码”不成立，FAQ 已落后于源码。[首页](https://sdk.vdo.ninja/)、[Go server][go-signal]、[Rust server][rust-signal]

但是，Go server 的文件头明确把它定位为离线测试／LAN 服务器，不实现 rate limit 或 TURN，并指向其他部署项目；其 WebSocket upgrader 接受全部 Origin，`ServeHTTP` 没有 DSH 身份校验。不能把该示例直接当成生产权限边界。[Go server][go-signal]

JS `connect()` 直接 `new WebSocket(this.host)`；公开 options 支持替换 `host` URL，公开类型没有 `sendSignal`／`handleOffer` 一类通用 transport 注入接口。SDP／ICE 的处理方法以 `_` 开头，类型声明明确将私有成员排除在兼容性承诺之外。协议还包含 room、stream、publisher/viewer direction、`sendChannel`、发布者持有 offer 等约定。[SDK 源码][sdk]、[公开类型][types]、[兼容性契约][compat]

**架构判断**：如果 BotHarness 需要与 VDO.Ninja／OBS 互通，上述协议与 SDK 的恢复机制有明确价值；如果只需 DSH Host 到自有 viewer，直接采用底层 WebRTC engine 或 GStreamer 的增量成本应与 NinjaSDK 方案比较。后者需要一个经 Host 授权、限制 peer/stream 路由的 VDO 兼容端点；仅替换 WebSocket 地址不能自动复用现有 Host Feed 格式。不要 monkey-patch 私有协商方法后把它称为稳定 seam。

## 网络政策：默认配置不符合“无公共 TURN 依赖”

固定版本 JS 默认值为公共 `wss://wss.vdo.ninja` 信令、Google／Cloudflare STUN、自动获取公共 TURN 列表；获取失败还有内置公共 TURN fallback。`forceTURN: false` 只是“不强制中继”，并不是关闭 TURN。Go options 也明确区分 Auto、Disabled 和 Custom。[SDK constructor／TURN 分支][sdk]、[Go options][go-options]、[Go TURN fallback][go-turn]

JS `_setupTURNServers()` 在 `turnServers === false` 时返回空列表；数组配置直接使用该数组，两者均在公共获取逻辑之前返回。恢复阶段 `_escalateConnectionToRelay()` 只在当前配置已有 TURN 时切换 relay。因此在该实现中，自有数组或明确 `false` 可以避开自动公共 TURN 分支；这属于静态源码结论，尚未用网络观测验证。[SDK TURN 与 recovery][sdk]

建议明确两种产品策略，并在发布端和观看端同时应用：

| 策略              | JS 配置意图                                                  | 验收要求                                                         |
| ----------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| 默认直连，无 TURN | `turnServers: false`、`forceTURN: false`、`autoRelay: false` | 直连不通时返回可理解的失败／图片回退；不得偷偷启用公共 relay     |
| 用户配置 TURN     | `turnServers: userConfiguredServers`、`forceTURN: false`     | 只使用批准的自有中继；配置失败不得回落到公共 TURN API 或内置列表 |

STUN 与信令另行决策；关闭 TURN 不会关闭公共 STUN/WSS。若需要完全私有部署，还须明确 `host`，并传入明确 STUN 列表；JS 禁用 STUN 应用 `[]`，不能用 `false`，因为实现用 `options.stunServers || defaults`。不要仅设 `configuration.iceServers`：实际创建 peer 的 `_getICEConfiguration()` 根据 `stunServers`／`turnServers` 重建配置。[SDK 配置与创建 peer][sdk]

双方都必须受控：发布端不配置 TURN，并不能阻止远端 viewer 使用它自己的 relay candidate。严格政策的验收应检查双方完整 ICE 配置、选中 candidate pair 和网络出站请求；如果允许任意第三方 viewer，还需对可接受的 candidate/peer 策略另作设计。不要把“自己的 TURN 关闭”报告成“整个会话绝无中继”。

上游许可文件明确区分软件许可与托管信令／STUN/TURN 服务，服务可被限制、暂停或撤销。当前免费服务不构成可持续产品承诺。[LICENSING.md][license]

## 授权、allowlist、撤销与旧会话

默认 password 是公开的共享默认值，不能当作私有身份凭据。房间／stream ID 及其 password 能限制发现／协商，但没有直接表达 DSH 的用户、Computer resource、观看许可或接管权限。[SDK 默认配置][sdk]、[native guide][native]

公开 `autoConnect` 的 filter 用于选择自动连接对象，不能当成发布者接受 viewer 的安全 allowlist。所审查的 `_handlePlayRequest`／`_handleJoinRoom` 在发布状态与 stream 匹配后创建 publisher peer，未调用应用提供的 DSH 授权回调；公开类型中也没有 viewer admission hook。应在可信信令 adapter／媒体会话入口完成准入，而非等 `track` 或 data channel 已打开后再拒绝。[SDK 请求处理][sdk]、[公开 API][types]

SDK 已有有价值的生命周期机制：显式停止清除相应 reconnect intent；`disconnect()` 返回清理完成的 promise；连接 generation 检查防止旧异步工作恢复已停止的 intent；候选队列有时间和大小限制。它们是 SDK 内部连接安全性，不等于 Computer 授权 generation。[recovery guide][recovery]

**建议保留的 Host 约束**：

1. Host 为每次媒体会话绑定用户、Computer resource、观看范围、过期时间和 generation；接管仍是独立授权。不要把 room membership 当成控制权。
2. 撤销时先使 Host 授权失效，再停止相应媒体 peer／采集，等待 helper 清理。仅关闭信令 socket 不足以撤销已建立的 P2P 媒体。
3. 旧 offer／ICE／重连回调必须同时通过 SDK 连接 generation 与 Host 授权 generation；重新协商不能复活过期会话。
4. 初版保持输入走已有 Computer owner；不把 SDK RPC／任意 DataChannel 消息直接接到桌面输入函数。关闭无需的文件／资源能力。
5. 多 viewer 的单独撤销需要验证稳定 API 和可观测的结束行为；不能仅调用 viewer 自己的 `stopViewing()` 来代表服务器强制撤销。

## Android 与 Expo 的实际接入成本

Kotlin SDK 是 `vdoninja-core` 加 `vdoninja-android`：Android 部分依赖 Stream 打包的 Google libwebrtc，使用原生 `org.webrtc.VideoTrack` 与 renderer。README 要求 minSdk 24、Java 17、AGP 8.9+，且当时要求 composite build／源码集成，尚不能假定已有发布 artifact。README 也明确不内建 screen capture。[Kotlin SDK][kotlin]

对我们的 Android viewer，原生 Kotlin 是可选实现材料，不能当作 React Native 组件。需要 Expo native module/view 或另一条已验证的 React Native WebRTC 集成；还需处理 renderer lifecycle、前后台、旋转、坐标映射和断线恢复，iOS 则有独立实现成本。此次没有做 native build 或设备验证。

## 成熟度与最低验证范围

仓库有 deterministic reliability／cancellation 测试、跨语言向量和互操作测试，不能简单视作只有 demo。固定 CI 配置中，Node matrix 在 Ubuntu 上跑 Node 18/20；Rust matrix 包含 Windows/macOS/Linux；Kotlin job 做 core test 与 Android assemble；单独 live-web workflow 为手动触发。**配置存在不代表本文验证过它们已通过，更不代表 Windows 桌面采集 → Android viewer 已覆盖。** [Node CI][ci-node]、[native CI][ci-native]、[live-web CI][ci-live]

SDK core 为 MPL-2.0；Node wrapper／部分 companion client 为 MIT，wrapper 不会把 core 重新许可为 MIT。发行需按各组件许可处理 notices 与源码提供；这里仅记录上游许可声明。[许可映射][license]

建议先用一个可替换 helper 完成如下窄验证，再决定是否采用：

- Windows 实际桌面源 → 编码 → SDK media track → 一个受控 viewer，保留原 Computer 资源身份，比较采集/编码/发送/显示延迟与资源消耗。
- 固定依赖版本与原生二进制，验证本项目 Node 24；如果选 Go/Rust，则验证独立采集／编码器及关键帧、拥塞反馈路径。
- 直连、用户 TURN、TURN 不可达、双方 TURN 关闭四种路径；记录公共 endpoint 出站情况和最终 ICE pair，证明不会隐式回退公共 relay。
- 非授权 viewer、单 viewer 撤销、旧 generation、helper 崩溃、Host 退出／重启与网络切换；验证不会恢复已撤销媒体。
- 最后才进入真实 Android/Expo 构建与接收端；只显示测试图或完成 data channel 握手不算完成这条链路。

目前没有证据支持“采用 NinjaSDK 即可直接上线 Windows 远程桌面”。它值得比较的部分是现成协议互通和恢复能力；最关键的选择仍是要不要为这些能力引入 VDO 信令协议，还是让现有 DSH owner 直接管理较小的媒体 engine。

[package]: https://github.com/steveseguin/ninjasdk/blob/328965a06fa19cf47c3f01182e9cb1d91f39214e/package.json
[sdk]: https://github.com/steveseguin/ninjasdk/blob/328965a06fa19cf47c3f01182e9cb1d91f39214e/vdoninja-sdk.js
[types]: https://github.com/steveseguin/ninjasdk/blob/328965a06fa19cf47c3f01182e9cb1d91f39214e/vdoninja-sdk.d.ts
[node]: https://github.com/steveseguin/ninjasdk/blob/328965a06fa19cf47c3f01182e9cb1d91f39214e/vdoninja-sdk-node.js
[adapter]: https://github.com/steveseguin/ninjasdk/blob/328965a06fa19cf47c3f01182e9cb1d91f39214e/webrtc-adapter.js
[node-readme]: https://github.com/steveseguin/ninjasdk/blob/328965a06fa19cf47c3f01182e9cb1d91f39214e/README-NODE.md
[go-readme]: https://github.com/steveseguin/ninjasdk/blob/328965a06fa19cf47c3f01182e9cb1d91f39214e/go/README.md
[go-options]: https://github.com/steveseguin/ninjasdk/blob/328965a06fa19cf47c3f01182e9cb1d91f39214e/go/options.go
[go-turn]: https://github.com/steveseguin/ninjasdk/blob/328965a06fa19cf47c3f01182e9cb1d91f39214e/go/turn.go
[go-signal]: https://github.com/steveseguin/ninjasdk/blob/328965a06fa19cf47c3f01182e9cb1d91f39214e/go/signalserver/server.go
[rust-readme]: https://github.com/steveseguin/ninjasdk/blob/328965a06fa19cf47c3f01182e9cb1d91f39214e/rust/README.md
[rust-av]: https://github.com/steveseguin/ninjasdk/blob/328965a06fa19cf47c3f01182e9cb1d91f39214e/rust/vdoninja/examples/av.rs
[rust-signal]: https://github.com/steveseguin/ninjasdk/blob/328965a06fa19cf47c3f01182e9cb1d91f39214e/rust/vdoninja/src/signalserver.rs
[kotlin]: https://github.com/steveseguin/ninjasdk/blob/328965a06fa19cf47c3f01182e9cb1d91f39214e/kotlin/README.md
[native]: https://github.com/steveseguin/ninjasdk/blob/328965a06fa19cf47c3f01182e9cb1d91f39214e/docs/native-sdks.md
[compat]: https://github.com/steveseguin/ninjasdk/blob/328965a06fa19cf47c3f01182e9cb1d91f39214e/docs/compatibility.md
[recovery]: https://github.com/steveseguin/ninjasdk/blob/328965a06fa19cf47c3f01182e9cb1d91f39214e/docs/reliability-and-recovery.md
[license]: https://github.com/steveseguin/ninjasdk/blob/328965a06fa19cf47c3f01182e9cb1d91f39214e/LICENSING.md
[ci-node]: https://github.com/steveseguin/ninjasdk/blob/328965a06fa19cf47c3f01182e9cb1d91f39214e/.github/workflows/test.yml
[ci-native]: https://github.com/steveseguin/ninjasdk/blob/328965a06fa19cf47c3f01182e9cb1d91f39214e/.github/workflows/native-sdks.yml
[ci-live]: https://github.com/steveseguin/ninjasdk/blob/328965a06fa19cf47c3f01182e9cb1d91f39214e/.github/workflows/native-web-interop.yml
