# 远端 Browser / Computer viewer 是否迁移 WebRTC

日期：2026-10-22。状态：研究建议，不是 ADR、交付承诺或运行验证。

后续设计访谈：Human 已选择 **Local Computer 优先、多端观看且单一控制者**，取代下文原先的 Container 首片建议；范围和待决问题见 [Local Computer 设计草案](2026-10-22-local-computer-viewer-design.md)。源码核查同时确认当前 Computer 只有全局暂停计时器，尚无排他控制者所有权；下文关于保留授权边界的建议不表示该保证已经实现。

## 结论

**值得为持续观察和交互接管增加 WebRTC 视频路径，但不宜立即替换全部图片接口。** 应评估的是“采集 → 视频编码 → WebRTC media track → 视频显示”完整链路。只把 JSON/Base64 JPEG 搬进 DataChannel，能够改变传输和排队方式，却不会自动获得视频编码、提高采集频率或消除截图耗时。

建议以一个采集后端、一个客户端和一条真实跨机器路径做生产边界内的 tracer bullet；图片路径继续支持模型截图、诊断和连接失败后的观察。是否成为默认 viewer，要由同条件测量决定。现有操作授权、接管所有权和状态 Feed 不需要随视频一起迁移。

下文“事实”由一手来源支持；“推断／建议”是应用到 BotHarness 的判断。本文没有启动 Host、连接设备或测量任何 FPS、带宽、时延。

## 已核实的技术事实

### 1. WebRTC 视频与 DataChannel 是不同路径

- **事实**：WebRTC 媒体使用 SRTP，DataChannel 使用 SCTP over DTLS；DataChannel 支持可靠或部分可靠的消息传输。媒体传输要求拥塞控制，不能只依靠极端拥塞时的断路保护。[RFC 8831 §1、§6](https://www.rfc-editor.org/rfc/rfc8831.html)，[RFC 8834 §7](https://www.rfc-editor.org/rfc/rfc8834.html)
- **事实**：WebRTC 标准的视频互操作基线包括 VP8 与 H.264 Constrained Baseline；这不等于每台设备在任意分辨率下都能硬件编解码，也不是画质或 FPS 保证。[RFC 7742 §5–6](https://www.rfc-editor.org/rfc/rfc7742.html)
- **推断**：发送独立 JPEG 的 DataChannel 仍然传输独立图片。要获得视频帧间压缩、成熟播放管线和编码码率自适应，应发送视频 track，并选用具备编码反馈闭环的发送端。二进制 HTTP 或 WebSocket 同样可以去掉应用层 Base64；因此“省掉 Base64”不足以单独证明需要 WebRTC。
- **推断**：降低网络等待只能改善链路中的相应部分。若采集每 150 ms 才产出一张新的图，单换传输不能产生更密集的真实画面；重复编码旧图不能算采集 FPS 提升。静态页面主动不产帧也不能直接记为卡顿。

### 2. Chromium screencast 不是现成的视频 track

**事实**：CDP 的 `Page.startScreencast` 提供 JPEG/PNG、质量、尺寸和抽帧参数；`Page.screencastFrame` 返回 Base64 压缩图片及元数据，客户端通过 `Page.screencastFrameAck` 确认接收。它不是直接交付 H.264/VP8 的媒体轨。引用的是当前上游协议，不代表本仓库 Chromium 已支持其所有新参数。[Chromium Page 协议源文件](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Page.pdl)

**推断／建议**：Browser 有两种不同成本的路径：

1. 保留 CDP：JPEG 解码 → 像素格式转换 → 视频编码 → WebRTC。接入可能较窄，但保留了 JPEG 编码并新增解码／再编码，必须计入 CPU、延迟和画质损失。
2. 改采集源：取得同一 Browser 实例的原始帧或可信显示面，再交给视频发送端。更有机会减少重复编码，但要验证 headless/容器显示、目标 tab 选择、尺寸、鼠标坐标和资源生命周期。

不能把在另一浏览器中重新打开 URL 当作同一 Browser 的画面：登录态、页面状态与操作对象必须保持一致。也不应把媒体／信令密钥注入 Bot 正在浏览的不可信页面。

**事实**：Web `getDisplayMedia()` 的标准流程要求用户激活，并由用户选择共享面；不应把它假设为无人值守 Host 随时可调用的透明替代品。[W3C Screen Capture，`getDisplayMedia()`](https://www.w3.org/TR/screen-capture/#dom-mediadevices-getdisplaymedia)

### 3. Host 需要真正的媒体发送端

| 候选                   | 已证实的能力                                                       | BotHarness 仍需验证的成本                                                                       |
| ---------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| GStreamer `webrtcsink` | 接收媒体；提供编码、按接收端拥塞反馈调整码率；允许自定义 signaller | 平台安装包、采集插件、编码器可用性、进程 supervision、Host 授权适配                             |
| GStreamer `webrtcbin`  | 提供 SDP、ICE、track/transceiver 等底层控制，输入 pad 为 RTP       | 由调用方组合编码／payloader 并确保拥塞反馈实际控制编码器，不能把固定码率 RTP 当作完整自适应方案 |
| 原生 libwebrtc helper  | 上游有 `DesktopCapturer`，支持屏幕／窗口采集抽象                   | 构建分发、系统权限、像素转换、视频源适配、平台维护与版本升级                                    |

来源：[GStreamer rswebrtc](https://gstreamer.freedesktop.org/documentation/rswebrtc/index.html)，[`webrtcsink`](https://gstreamer.freedesktop.org/documentation/rswebrtc/webrtcsink.html)，[`webrtcbin`](https://gstreamer.freedesktop.org/documentation/webrtc/index.html)，[libwebrtc DesktopCapturer](https://webrtc.googlesource.com/src/+/refs/heads/main/modules/desktop_capture/desktop_capturer.h)。能力列是来源事实；成本列是研究判断，不是选型结论。

**建议**：由拥有屏幕／Browser 资源的模块管理采集与编码；媒体 adapter 封装平台实现和传输细节。Host 保持观看许可、接管许可、超时／撤销和生命周期的权威。不要让独立媒体服务器形成另一个可直接操作桌面的权限体系。

### 4. Mobile 不是只改一个 URL

**事实**：`react-native-webrtc` 包含原生代码，不能直接依赖 Expo Go 内置支持；项目维护者推荐 development client 与外部 config plugin。Expo 同样明确，加入原生库后需要构建包含它的客户端。[react-native-webrtc README](https://github.com/react-native-webrtc/react-native-webrtc/blob/master/README.md)，[Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/)

**建议**：首个 mobile 验证应覆盖真实原生构建、接收端渲染、前后台切换、旋转／缩放后的输入映射与断线恢复。只接收远端视频的 viewer 不应因示例代码顺手申请本机摄像头、麦克风或屏幕采集权限。浏览器端能播放不能替代 iOS/Android 验证。

### 5. HTTP 可达不代表 WebRTC 媒体可达

**事实**：WebRTC 不规定应用信令协议；SDP、ICE candidate 可通过已有 HTTP/RPC 交换。媒体另行建立 ICE 路径。UDP 被阻断时，标准要求支持经 TCP/TLS 连接 TURN 的模式；TURN 仍是额外中继服务，不等同于现有 WebSocket。[WebRTC peer connections](https://webrtc.org/getting-started/peer-connections)，[RFC 8835 §3.4–3.5](https://www.rfc-editor.org/rfc/rfc8835.html)

**事实**：Tailscale 当前区分 direct、Peer Relay 与 DERP。Direct 通常延迟更低、吞吐更高；DERP 中继会增加延迟，并有公平性吞吐限制。[Tailscale connection types](https://tailscale.com/docs/reference/connection-types)，[性能排查](https://tailscale.com/docs/reference/troubleshooting/poor-performance-tailnet)

**推断／建议**：

- 两端有 tailnet 路由、ACL 允许且 ICE 选择可达地址时，可以在 tailnet 上建立媒体路径；仍须实际验证接口枚举、candidate 选择、容器端口与防火墙。不要仅凭“双方登录了 Tailscale”认为配置完成。
- ICE 显示 host candidate 并不意味着 Tailscale 的底层连接是 direct；它也可能承载在 DERP/Peer Relay 上。应同时记录 ICE candidate pair 和 Tailscale 路径。
- 不在 tailnet 的手机经 HTTPS 域名访问 Host 时，信令可成功而媒体不可达。需部署可达 TURN／另一条媒体路径，或保留图片回退。
- Cloudflare 的普通 published HTTP 服务代理 HTTP；其任意 TCP 服务也不是自动暴露 UDP 媒体端口。因此现有 HTTP quick tunnel 不能被当成现成 WebRTC relay。Cloudflare 的其他产品或私网路由能力是另一个设计问题。[Cloudflare published application protocols](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/protocols/)

### 6. 传输加密不替代应用授权

**事实**：WebRTC 定义媒体、数据通道及其连接 API；应用信令和 BotHarness 的观看／接管规则不属于协议本身。[W3C WebRTC](https://www.w3.org/TR/webrtc/)，[WebRTC signaling](https://webrtc.org/getting-started/peer-connections)

**建议**：首片保留现有 HTTP 操作路径，先证明视频的收益。观看与控制分别授权；会话必须绑定 Host 认可的用户、资源和有效期。撤销观看要停止媒体，撤销接管要拒绝后续输入；媒体断开不应自动把 Bot 接管权交给另一个观察者。后续若输入改用 DataChannel，其接收器也必须调用同一控制权检查和输入执行入口，不能因为 DTLS 已连接就获得操作权。指针移动可考虑丢弃旧事件，键盘按下／抬起与接管命令则不能套用同一种随意丢包语义。

## 决策实验：先量链路，再决定默认值

以下是建议的验证计划，没有现成结果。

### 同条件基线

固定同一机器、同一采集对象、分辨率、画质可读性和网络路径；分别运行静态文本、连续滚动、拖动／点击三类场景。记录原始采集、编码完成、发送、接收、显示的阶段计数与延迟，同时计入 Host CPU/GPU、客户端 CPU／发热和网络字节。需要区别“无画面变化”“采集失败”“丢帧”“重复播放旧画面”。

本地编码实验能回答 CPU 或采集问题，不能推导真实跨机器时延；不同分辨率、不同图像格式／编码器的实验也不能称为匹配条件的 transport A/B。尾网实验应分别标记 direct、Peer Relay、DERP；公网 TURN 另测。

### WebRTC 可观测指标

**事实**：W3C Stats 定义了 `framesEncoded` / `framesDecoded`、字节、丢包、编码／解码耗时、`qualityLimitationReason`、candidate pair RTT、抖动缓冲和冻结相关统计。字段可用性须在所选实现上检查。`currentRoundTripTime` 是 STUN 往返时间；`jitterBufferDelay` 是累计缓冲时间，并非端到端显示延迟。[W3C WebRTC Stats](https://www.w3.org/TR/webrtc-stats/)

**建议**：用区间计数差求 FPS 与码率；用 `ΔjitterBufferDelay / ΔjitterBufferEmittedCount` 求该区间平均缓冲时长。总带宽另算协议、中继和隧道开销。点击到画面反馈应由客户端发出操作并观察可识别的可见变化，在同一个计时域测量；跨机绝对时间戳需要同步或误差说明。不能用网络 RTT 冒充操作延迟。

### 首片与推广门槛

1. 选择一个真实采集后端与一个接收端，接通观看授权 → 采集／编码 → 信令 → 播放 → 关闭清理；同一资源仍可通过现有路径操作。
2. 同条件对比图片路径；预先选定可读性、动态场景呈现、p95 操作反馈、CPU 和连接成功率目标。目标数值是产品约束，不能直接从协议资料推导。
3. 验证观看撤销、接管撤销、Host／helper 退出、网络切换、重连与明确可见的图片回退。依项目规则同步提供 CLI 操作／诊断入口与真实运行证据。
4. 第一片获得实际收益和 Human 反馈后，再扩展第二种采集后端、mobile 平台、TURN 部署或 DataChannel 输入；不要一次把 Browser、Computer、控制协议与全部客户端一起改完。

未知项包括：每个平台可部署的采集／编码实现、目标 Chromium 的机制、mobile 原生兼容矩阵、tailnet/公网实际媒体路径、同条件性能，以及可接受的 TURN 运维成本。这些未知项决定实现顺序，尚不足以支持“全面迁移后必然流畅”的结论。

## 仓库核对与架构候选

审查基线：`f878c43bb296492d9db9fba72941dc2b73de623c`。对照用户引用的 `8f4e650db551ae8458211634872ed291ff4e5a4f`，所查 Desktop capture、Browser frame feed 与 Selkies 文件未变；手机两个 controller 有序号恢复逻辑变化，但未改为视频传输。本节来自源码和 GitHub 交付记录的静态审查，不是运行结论。

### 当前实现与交付记录不能混为一谈

| 对象                         | 源码事实                                                                                                                                                   | 推进方向                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 手机 Browser / Computer      | 两个 controller 都长轮询 JSON 图片并构造 data URI；共享 stage 仍渲染 Image；mobile 依赖中无 react-native-webrtc，源码中未发现 RTCView 或 RTCPeerConnection | 补实际视频接收与播放生命周期           |
| Container Computer / Browser | Host 已复用 createSelkiesWebRtc，包含状态、信令代理、tailnet UDP relay、模式切换与关闭                                                                     | 复用现成 module 做第一条端到端视频切片 |
| Local Computer               | get_desktop_state → PNG → JPEG/Base64；target 明确将 WebRTC 支持限于 Container                                                                             | 一个 OS 的原生视频采集作为后续候选     |
| Local Browser                | CDP Page.startScreencast 以 quality 60 的 JPEG 推帧；frame feed 失败可回退截图，mobile snapshot 模式每次成功请求后等 1 秒                                  | 独立验证 tab 范围的采集及视频编码      |

代码证据：[Browser controller](../../apps/mobile/src/host/browser-viewer.ts)、[Computer controller](../../apps/mobile/src/host/computer-viewer.ts)、[stage](../../apps/mobile/src/ui/chat/browser-stage.tsx)、[mobile dependencies](../../apps/mobile/package.json)、[DesktopView](../../packages/computer/src/desktop-view.ts)、[target](../../packages/computer/src/target.ts)、[Browser runtime](../../packages/browser/src/runtime/browser.ts)、[frame feed](../../packages/browser/src/frame-feed.ts)、[Selkies module](../../packages/core/src/http/selkies-webrtc.ts)。

2026-10-22 查询时 [#1799](https://github.com/BotHarness/DeepSeekBot/issues/1799) 与 [#1833](https://github.com/BotHarness/DeepSeekBot/issues/1833) 均已关闭，关闭评论引用交付核对。但 [PR #1817](https://github.com/BotHarness/DeepSeekBot/pull/1817) 明确限定 Host 侧、native client 后续；[PR #1836](https://github.com/BotHarness/DeepSeekBot/pull/1836) 明确是 JS-only 截图路径、将 #1833 helper 列为后续。不能把 issue 关闭推导为手机视频和原生 helper 均已完成。本次没有改动 tracker。

[ADR-0210](../adr/0210-the-phone-watches-the-local-computer-through-a-screenshot-stream.md) 为 Accepted，预留未来 WebRTC helper；[ADR-0209](../adr/0209-selkies-webrtc-is-switched-on-per-phone-call-over-the-tailnet.md) 文件仍标 Proposed，虽然有对应 Host 实现。[ADR-0163](../adr/0163-local-browser-takeover-reuses-computer-viewer-family.md) 原文拒绝将 CDP screencast 用于 Human viewer，但当前 viewer-local → frame-feed → runtime 已实际使用它，存在文档／代码漂移。后续应明确修订，而非重复假定其实现仍遵循旧表述。画面采集与 committed-text IME 输入应分别判断。

### 已有性能证据的适用范围

[2026-10-14 研究](2026-10-14-local-computer-frame-stream-ab.md) 已测过截图与 Selkies，但两组使用不同采集对象、分辨率和编码链路，且同机接收、不包含手机网络。初始 PNG 结果不能冒充当前 JPEG 基线。

同笔记后续 JPEG 测量在 2940×1912 Linux Xvfb 上仍约 1 fps，driver 单次 get_desktop_state 为 850–920 ms。这支持“采集路径值得改善”，不支持“单换协议即可达到 30 fps”。原比较中 WebRTC busy 约 14.6 Mbps，亦不能宣称 WebRTC 在所有配置下必然省带宽。

150 ms pacing 对普通持续采集对应约 6.7 次／秒的上限量级，实际会被 capture、encode、网络和客户端处理限制；输入会重置 lastStarted，故不应称为每种情况下的硬 FPS 上限。Base64 的未压缩表示通常约为二进制的 4/3，但不能据此直接断言实际线上流量恰好增加 33%：HTTP 压缩和其他协议开销也需实测。

### 候选 1：深化手机 Viewer 播放 module — Strong，首选

**文件：** mobile 的 browser-viewer.ts、computer-viewer.ts、browser-stage.tsx，以及 core 的 selkies-webrtc.ts。

**问题：** Browser 与 Computer 两个实际 adapter 重复处理 poll/retry/seq/stop。图片 URI 已渗入展示 interface；新增 RTC 将增加信令、回退、旧连接清理等调用方知识。

**候选变化：** 让一个播放 module 收纳观看开始、媒体就绪、恢复、停止和回退。保留两个图片 adapter 的不同节奏；在容器首片中加入真实 Selkies 接收 adapter。Browser Takeover 与 Computer Takeover 保留各自 owner，不能为去重合并其授权语义。不预先设计函数 interface 或通用协议目录。

```text
前：Browser 页面 → Browser poll/retry/seq → 图片
    Computer 页面 → Computer poll/retry/seq → 图片
    Selkies Host …… 没有 native 接收者
后：两种页面 → 播放 module → 图片 adapters / 实际 Selkies adapter
                          → 图片或视频展示
```

**Deletion test：** 删除该 module 会把连接、停止与回退复杂性重新散到多个调用方；仅提取 record/errorOf/pause helper 不增加这种 depth。**Locality** 集中连接故障；**leverage** 让不同画面共用观看 interface 测试，覆盖首帧、失败回退、关闭后不再更新、撤销后停止。未来 RTC adapter 尚未存在，不能先声称有两种媒体 transport 的可替换实现。

### 候选 2：Computer Takeover 生命周期脱离帧轮询 — Strong

**文件：** desktop-view.ts:260、:326、:341；computer/index.ts:798；computer/tool/provider.ts:147；mobile/computer-viewer.ts。

**问题：** 当前 30 秒暂停 lease 在 next() 帧轮询和 input() 中续租。仅换成 RTC 后，连接还在播放、Human 暂未输入时，帧轮询消失会使暂停到期，影响 Bot 恢复操作／截图的时机。

**候选变化：** 由现有 Computer owner 收纳暂停、经认证的存活证明、在途 Bot calls 排空、续租、失效和释放；两种媒体路径协作同一 authority。观看存在本身不授予接管，其他观察者也不能无条件替控制者续租。不要在 RTC 中另存一套 pause 布尔值。

```text
前：frame poll / input → 隐含续租 → DesktopView pause
后：经认证的控制存活 / Human 操作 → Computer Takeover module
                                 → Bot 屏障、失效与释放
    图片 / 视频不再决定授权期限
```

**Deletion test：** 删除统一 owner 后，lease／断连／target 切换规则会回流到两条 transport。**Locality** 集中控制规则；**leverage** 让图片与视频共用“不接管不输入、接管中不向模型返回截图、关闭后释放”的 interface 回归。必须新增“有视频、无输入”与 transport 切换场景；Browser 只暂停一个 Bot viewport，Computer 暂停整个共享 Computer，这一区别保持不变。

### 候选 3：深化 Local Computer 采集与编码 module — Worth exploring

**文件：** desktop-view.ts:283–311、computer/src/providers/local.ts、computer/src/tool/local-driver.ts、target.ts、历史 frame benchmark。

**问题：** driver 已编码完整 PNG；后面再变 JPEG 或二进制无法收回前面的耗时。

**候选变化：** 先验证一个 OS 的原生 capture → 视频编码 → media track，保留图片兼容路径。由拥有捕获的 module 管理进程、编码资源、尺寸／坐标关系、诊断和关闭。先有真实第二个 adapter，再确定共享 seam，不提前把 Browser CDP 和三种 OS 塞进万能 interface。

```text
前：屏幕 → driver PNG → Base64 → Host JPEG → Base64 JSON → 手机图片
后：屏幕 → 原生采集／编码 module → 视频 track → 手机视频
                                 失败 → 原图片路径
```

**Deletion test：** 若仅增加转发 driver.call 的薄 module，复杂性没有减少；只有收纳原生进程、编码反馈、资源清理和坐标映射才增加 depth。**Locality** 集中采集瓶颈；**leverage** 让调用方不必知道平台编码机制。真实 native adapter 与跨机性能仍待验证。

### 建议实施顺序与明确约束

1. **第一个 tracer bullet：Container Computer → 一台已配对手机。** 复用现成 Selkies Host，完成观看授权、原生播放器、失败回退、输入、撤销与关闭。接入哪一个 native 平台由可用 QA 条件决定；SDK 58 / RN 0.88 的具体兼容性不能由 upstream README 代证。需要新的 native build。
2. 同时确认既有 Selkies 模式切换会中断桌面 WebSocket viewer；不能承诺手机／桌面无扰并行。其回退是既有 Selkies WebSocket viewer，并非把 Local Computer 的 frame 端点当成所有 target 的等价回退。
3. 做同条件真实跨机测量并拿 Human 反馈；建议讨论动态场景 ≥20 呈现 fps、direct 路径操作到可见反馈 p95 ≤200 ms，同时限定文字可读性、Host CPU／手机功耗与码率。数字是待确认验收目标，不是协议能力保证；静态画面不要求持续产帧。
4. 再做 Local Computer 的单 OS 视频捕获切片，先处理上述 Takeover 续租依赖；随后才扩展 Local Browser。Browser 的长寿命媒体必须维持当前 Bot／tab／target 归属检查，不能以整个共享桌面替代单 Bot viewport。
5. 首片保持控制请求现有通道，Host Feed 继续同步状态；新视频不进入 SessionEvent、Memory 或 Host Feed。候选播放／接管 module 都是 application-defined。Host Plugin/Fiber 持有相关进程与连接并负责 disposal；不新增第二个 /api interceptor。具体 DSH 机制在实现时按 pinned 版本再验证。[DSH 官方 Plugin 生命周期](https://deepseek-harness.github.io/deepseek-harness/develop/basic/)
6. 修改 Host routes／bridge／Bot tool 时同步 CLI parity、coded refusal、诊断和真实 Host 运行证据。第一片成功后才扩展第二平台、TURN、公网路由或 DataChannel 输入。

**不建议的捷径：** JPEG-over-DataChannel 作为视频迁移完成；仅去掉 Base64 就承诺流畅；复用模型 screenshot 调用驱动高帧率人类视频；用 ICE 成功代替呈现延迟验证；把 issue 已关闭等同于 feature 已交付；先造统一媒体平台再寻找第二种真实实现。

本轮只完成研究与候选评审，未修改产品术语、ADR、运行时代码或 issue 状态。下一步由 Human 选择候选，再细化 interface 与 durable decision。
