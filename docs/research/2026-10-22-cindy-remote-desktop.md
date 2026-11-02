# Cindy 远程桌面：实现、演进与 BotHarness 可以借鉴的边界

日期：2026-10-22。状态：外部实现研究，不是 ADR、迁移承诺或运行验证。

代码基线：[`makecindy/cindy@b60f6fadeb89d7a93df9aa1bcb6212f56568ca58`](https://github.com/makecindy/cindy/tree/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58)。下文区分当前实现、历史 PR 的作者自述实测，以及应用到 BotHarness 的建议。本次只读源码、文档和 GitHub PR，没有安装运行 Cindy，没有连接手机或远程电脑，也没有测量网络。

## 研究结论

**Cindy 已经采用 WebRTC 视频轨作为远程桌面的主要画面路径，同时保留截图中转；它值得借鉴的部分是媒体、控制权、后台观看与失败恢复的边界，而不仅是把传输换成 WebRTC。** 它使用现有已认证设备链路交换信令与业务请求，另建视频 track 和有序 DataChannel；兼容模式仍传 JPEG/Base64。平台采集也并非一律原始视频直送编码器，原生路径存在 JPEG 中间帧再编码为 WebRTC 视频。配置中的 30/60 FPS 是采集或编码上限，官方文档明确不代表实际交付帧率。[当前远程桌面文档](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/docs/remote-desktop.md)

用户提到的三档画质、画中画、媒体直连都有一手实现和 PR 支持，但并非都在 10 月 1—11 日首次实现：iOS 原生 WebRTC + AVKit 画中画在 9 月 18 日已经合并。10 月的工作包含画质策略、通道请求提速、后台编码降档和多项兼容、退出修复。本次未复核“152 个 PR / 24 个远程桌面 PR”的完整统计；PR 数量不能替代功能或性能验证。[原生接收与 PiP #4630](https://github.com/makecindy/cindy/pull/4630)、[三档画质 #5384](https://github.com/makecindy/cindy/pull/5384)、[通道请求 #5394](https://github.com/makecindy/cindy/pull/5394)

## 三项体验背后的实现与证据

### 三档画质是发送端策略，不能简化成三个码率值

10 月 2 日的 #5384 把原先四档码率改为 `auto | saver | hd`，由被控端集中解释设置。原来的问题是：仅降低码率上限会触发 WebRTC 降分辨率，静态文本仍然模糊；静态画面数据量很小，带宽估算还可能被网络波动压低，长期恢复不了。

修复包含：64×36 缩略图检测大面积运动；自动/省流在运动时优先帧率，约一秒静止后优先分辨率；SDP 设置起始与最低码率提示；macOS 按物理像素采集，自动最长边 2560、高清 3840，并相应提高单帧 JPEG 预算。高清优先保持分辨率，网络不足时容许降低帧率。参数和平台适配属于被控端，客户端发送用户意图。[#5384](https://github.com/makecindy/cindy/pull/5384)、[当前画质策略源码](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/desktop/src/shared/remoteDesktopQuality.ts)

需要校正历史值：#5384 初版省流封顶 2 Mbps / 30 FPS；10 月 6 日 #5526 将普通省流改为只限 2 Mbps，FPS 由独立设置决定。**后台 PiP 仍单独限制 30 FPS**。不能把早期 PR 的省流说明当作当前行为。[#5526](https://github.com/makecindy/cindy/pull/5526)

作者在 Mac Studio + iPhone 真机/模拟器上记录过静止画面 2560×1440、约 250 kbps、QP=12，并在 0.5 Mbps 限制下保持分辨率；这是特定设备与场景的作者报告。该 PR 同时写明没有模拟 Wi-Fi 抖动/丢包，Windows/Linux 没有实机验证，完整 viewer smoke 也未跑完。上述数字不能外推为跨运营商或 BotHarness 的性能承诺。[#5384 验证与限制](https://github.com/makecindy/cindy/pull/5384)

### “媒体直连”既包括视频，也可承载少量控制请求

视频连接已经存在时，#5394 把操作权、后台展示、静音、防窥、分辨率列表等白名单请求放到已有 `input-v1` DataChannel；Host 主进程复用原请求处理和同一套 sender、lease、撤权检查。连接建立、offer/ICE、部分心跳及切换显示模式等仍走既有信令/业务链路。传输优化没有另建权限系统。[#5394](https://github.com/makecindy/cindy/pull/5394)

这条路径通过可选 `channelRequests` 能力协商，限定并发与回复大小；未发送成功、不支持或明确拒绝时才允许转回 relay。**已经发出但结果未知的请求不会自动换通道重放**，以免重复执行操作。一次通道请求失败也不会重置共享 device-link 或整段媒体。[#5394](https://github.com/makecindy/cindy/pull/5394)

作者在同一 Mac Studio 上的开发版 + iOS 模拟器记录：部分通道请求 3 ms，切换控制权 38–59 ms，读取分辨率列表 112 ms；同期 relay 心跳/ICE/断开为 610–930 ms。这证明该次测试存在明显 relay 往返成本，**不证明真实跨机器、跨 NAT、蜂窝网络具有相同延迟**；PR 明确未测真机 iPhone、Android 和 Windows/Linux 被控端。[#5394 验证](https://github.com/makecindy/cindy/pull/5394)

### 画中画需要独立于页面和信令的媒体生命周期

#4630 在 iOS 把 WebRTC 接收、解码与 AVKit 渲染移到原生层，把媒体宿主保留在根视图。动机是 WebView JavaScript 在后台暂停，单靠网页播放器无法持续更新 PiP。用户的后台偏好、实际 PiP 状态与只读选择分别保存；只有 AVKit 确认实际进入 PiP 后，原生接收器才完成后台观看授权挑战。Host 只保留同一租约下已授权的非控制态观看，仍有撤权和租约期限。[#4630](https://github.com/makecindy/cindy/pull/4630)

10 月 5 日 #5482 在同一个视频发送器上动态调整 `setParameters`，PiP 时使用 2 Mbps / 30 FPS 上限，回全屏恢复用户原画质；不重建采集或 PeerConnection，不改用户存储的设置。该改动只有自动化验证，没有真机测量省下的流量。[#5482](https://github.com/makecindy/cindy/pull/5482)

PiP 的基础 PR 报告过 iPhone Air / iOS 27 真机八轮退后台和连续 120 秒更新；但该验收在同步主干前完成，之后未重新安装验证。Android 仍保留 WebView 路径，Android 原生 PiP、完整断网恢复、后台 SDP 重新协商和录音/PiP 并行均不能据此宣称完成。加入 iOS 原生模块也改变了 mobile runtime fingerprint，需要新安装包。[#4630 验证、限制及发布说明](https://github.com/makecindy/cindy/pull/4630)

## 从历史故障看真正需要深化的 seam

| 问题与一手证据                                                                                                                                                                                            | 对 BotHarness 的启发（建议）                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [#5435，10 月 3 日](https://github.com/makecindy/cindy/pull/5435)：新三档协议为旧端保留的 `bitrate` 被中间主进程解析后丢弃；旧端四次拒绝 offer，最后固定在截图中转。                                      | 业务对象、wire 兼容编码和转发职责需要明确。显式记录媒体降级原因，不能把任何协商失败都显示成“网络不好”。            |
| [#5393，10 月 4 日](https://github.com/makecindy/cindy/pull/5393)：增加 `liveDisplaySwitch / keepVideo / videoKept`，切分辨率可以保留视频；失败或回执缺失时仍按明确边界恢复。                             | 几何变化、采集源替换、媒体协商和观看许可不是同一生命周期。尺寸改变不应必然重建授权和所有资源。                     |
| [#5548，10 月 9 日](https://github.com/makecindy/cindy/pull/5548)：断网退出不再等待远端；锁屏策略提前随 start/heartbeat 交给 Host，Host 自行在断线或过期时执行。                                          | 本地页面关闭必须及时；远端资源和安全策略由 Host 负责。不能依赖最后一个 stop 请求必达；迟到响应不能复活已关闭页面。 |
| [#5740，10 月 10 日](https://github.com/makecindy/cindy/pull/5740)：会话结束后的直连空闲回调同步抛错，绕过 Promise catch，导致整个应用退出且跳过资源清理。                                                | 清理是独立承诺，通知失败不能打断资源回收；单 viewer 失败不应扩大到进程或其他 peer。                                |
| [#6498，10 月 20 日](https://github.com/makecindy/cindy/pull/6498)：PiP 撤销输入权误触发通用 `clearSafety()`，防窥和静音随之消失。                                                                        | 观看许可、输入权、后台展示与安全效果必须能分别转换；简单的 `controlling` 布尔值不足以表达这些状态。                |
| [#6690，10 月 21 日](https://github.com/makecindy/cindy/pull/6690)：滚轮事件 164 ms 内出现 19 批，IPC 积压超过八批被当成致命错误，终止视频和租约；修复为 33 ms 批处理、释放按键和丢弃拥堵输入，保留视频。 | 输入拥堵与媒体失效分开处理。界限与背压必需，但正常过载不能无条件撤销观看会话；不得回放已经过时的操作。             |

这些 PR 提供的是实际故障模式与代码修复线索，并不全部含修复后的双机实测：#5435、#5548、#5740、#6498、#6690 均明确列出了相应人工验证缺口。不能因它们已合并就认为所有平台和网络边界都已验收。

## 当前源码中的完整画面与控制链路

### 发送端：复用 Chromium WebRTC，原生采集可以保留 JPEG 中间态

```text
已认证 Device Link：观看 lease / offer / ICE / 回退 frame
                            ↓
Electron Main：目标、权限、lease、capture generation
                            ↓
独立的 sandboxed capture renderer
    ├─ getDisplayMedia / portal → MediaStream
    └─ native helper → JPEG/Base64 → ImageBitmap → canvas.captureStream
                            ↓
Chromium RTCPeerConnection → 视频 track + input-v1 DataChannel
                            ↓
iOS 原生 WebRTC + AVKit / Android WebView / Desktop browser runtime
```

Main 为采集创建独立隐藏 BrowserWindow，`sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`，专用 preload 和内存 session；退出销毁采集 owner。正常业务 renderer 不接收采集 IPC。发送端 `captureHost.ts` 按平台和能力选择 getDisplayMedia、portal 或 native stream；cursorOverlay 场景使用 native 无光标画面，再独立传光标。视频通过 addTrack/RTCPeerConnection 发送，原生替换可以用 replaceTrack 保留连接。不能由“用了 WebRTC”推导它固定使用 H.264 或始终硬件编码；协商 codec 和硬件路径要从实际运行 stats 验证。[采集窗口](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/desktop/src/main/remote-desktop/captureWindow.ts)、[captureHost](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/desktop/src/renderer/features/remote-desktop/captureHost.ts)

`nativeCaptureStream.ts` 明确进行 Base64 解码、JPEG 解码、canvas 绘制，再用 `captureStream(fps)` 形成视频源；串行 pull/decode，消费完 ImageBitmap 就 close，过期 generation 不写入新画面。Main 的 `NativeDesktopCapture` 为当前 lease 保留子进程/连接，single-flight 请求帧并设上限，结束时关闭子进程。macOS helper 有 CGDisplayStream 和 ScreenCaptureKit 路径；Windows native capture 可见 StretchBlt/GDI 与 JPEG 编码。它不是整个跨平台栈都已改成零拷贝原始帧＋硬件视频编码。[native stream](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/desktop/src/renderer/features/remote-desktop/nativeCaptureStream.ts)、[Main native owner](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/desktop/src/main/remote-desktop/nativeCapture.ts)、[macOS helper](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/desktop/native/remote-desktop/macos-capture.m)、[Windows capture](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/desktop/native/remote-desktop/windows-host/src/capture.rs)

**对上一轮建议的细化：** 原生硬件视频 helper 是可探索的性能方向，不是所有 WebRTC 试点的先决条件。Cindy 证明“有界图片源 → canvas 视频源”是实际工程路线；但仍不能假定 BotHarness 的慢 PNG screenshot 源经同样转换就会变快。是否可用取决于该采集源的持续吞吐、CPU 和转码成本。

### 三档当前精确含义

| 档位  | 视频发送上限 | 动态画面退化策略 | 静止文字             | macOS native 采集起始设置   |
| ----- | ------------ | ---------------- | -------------------- | --------------------------- |
| auto  | 20 Mbps      | 优先保持帧率     | 静止后优先保持分辨率 | JPEG 0.8，物理长边最多 2560 |
| saver | 2 Mbps       | 优先保持帧率     | 静止后优先保持分辨率 | JPEG 0.65，沿用逻辑尺寸路径 |
| hd    | 20 Mbps      | 优先保持分辨率   | contentHint=text     | JPEG 0.9，物理长边最多 3840 |

当前 `desktopVideoFramerate` 独立返回用户所选 30/60，默认 30；后台 PiP 的 live encoder 限制为 saver + 30，而用户偏好不变。运动检测使用 64×36 thumbnail、像素差阈值和超过 2% 区域变化，1 秒安静后判断静止。上述都是发送端配置，不是码率恒定、稳定 FPS 或无损画质保证；macOS 帧预算和尺寸也不能外推为 Windows/Linux 同实现。[策略唯一来源](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/desktop/src/shared/remoteDesktopQuality.ts)

### 直连、TURN 和兼容帧的实际关系

- 信令沿既有 `device-link:remote-desktop:v1`；视频不通过这些业务请求逐帧传送。普通 PeerConnection 可选择直连或 TURN，不能保证所有网络都 P2P。
- 每个 attempt 可获取短期 TURN 配置；配置失败/超时退回 Cloudflare 与 Google STUN。客户端支持配置不等于仓库包含已部署的 TURN 基础设施；公开 README 明确后端另仓。
- Trickle ICE 限制每批 16、总数 128；媒体断连有 5 秒宽限，后续重试间隔 1/3/8 秒，稳定 30 秒后恢复预算。恢复不重置共享 Device Link。
- 手机兼容图片轮询每 350 ms 唤醒；streaming 时或已有一帧请求在途则跳过。图片经认证 relay，保持 JPEG/Base64。视频恢复后要等实际首帧才覆盖图片。
- 文档的兼容限制是每边最多 1280 像素、Base64 前最多 180 KB、单帧在途、每秒最多四个 capture 请求。它与视频 native JPEG 中间帧的较大预算是不同路径，不能混用。

来源：[ICE policy](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/packages/device-link/src/remoteDesktopIce.ts)、[ICE config](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/packages/device-link/src/remoteDesktopIceConfig.ts)、[mobile polling](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/mobile/src/remote-desktop/RemoteDesktopScreen.tsx#L1557-L1607)、[首帧展示](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/packages/maker-shared/src/remote-desktop/viewerRuntime.js#L1672-L1705)、[compatibility 文档](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/docs/remote-desktop.md)。

### 可直接借鉴的生命周期拆分

| 标识 / module                        | 负责                                                             | 不应由它决定                    |
| ------------------------------------ | ---------------------------------------------------------------- | ------------------------------- |
| RemoteDesktopViewerSession / lease   | 观看连接、控制请求、start/stop 串行化；回收迟到 start 返回的租约 | 具体 codec、ICE 重试细节        |
| RemoteDesktopViewerMedia / attemptId | 一个 SDP/ICE 尝试，拒绝前一 generation 的回包                    | 重新获得控制权、抢占其他 viewer |
| exchangeId / candidate cursor        | 一批 candidate 请求与响应，允许安全重试丢失的回复                | 延长观看授权                    |
| native presentation owner            | 解码、显示、PiP、真实后台呈现与挑战响应                          | 获得输入权                      |
| credential session                   | 原生身份绑定、认证尝试、加密消息与过期回调                       | 跟随每次 media attempt 重新认证 |

Session 的 interface 收纳迟到回包、取消后的 lease 回收和控制请求竞态，是真正增加 depth 的 module：删除它，这些知识会散回 mobile 与 desktop 调用方。Media adapter 与 Session owner 的分离带来 locality，使换播放器和重试不必改授权路径。对应的测试面应保留可观察行为——旧回包不复活观看、媒体重试不抢新 lease、单 viewer 失败不重置其他 peer。

来源：[ViewerSession](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/packages/device-link/src/remoteDesktopViewerSession.ts)、[ViewerMedia](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/packages/device-link/src/remoteDesktopViewerMedia.ts)。

当前 iOS `NativeRemoteDesktopView` 只在原生模块宣告 `nativeVideo` 时启用，旧二进制继续 WebView。Swift receiver 持有 WebRTC/解码，JS 处理信令；AVSampleBufferDisplayLayer 与 AVPictureInPictureController 持有呈现。单槽最新帧邮箱避免解码线程不断向主线程积压；HTML 仍负责输入/缩放等交互。Android 当前保留 WebView 路径。因此不能把“原生控件”或“原生 remote presentation 模块”一概等同于全平台原生视频接收。[native gate](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/mobile/src/remote-desktop/NativeRemoteDesktopView.tsx)、[Swift receiver](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/mobile/modules/cindy-remote-presentation/ios/RemoteDesktopReceiver.swift)、[Swift presentation](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/mobile/modules/cindy-remote-presentation/ios/RemoteDesktopVideoView.swift)

### 不能照抄成统一保证的地方

`input-v1` 默认可靠有序。共享 browser runtime 每 33 ms 批处理、合并相邻移动/滚轮事件、队列最多 64、过期 2 秒则放弃并释放按键；buffer ≥16 KB 时等待，不绕 relay 让后续事件超车。但当前 native iOS 的 sendInput 在 buffer 满时返回 false，mobile 页面随后可能走 relay。**这两条实现并不完全一致**，本研究没有证明所有平台的跨通道输入顺序都满足同一个不变式；这里是继续审查的候选，不能凭静态差异就声称已复现用户故障。[browser queue](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/packages/maker-shared/src/remote-desktop/viewerRuntime.js#L839-L920)、[native send](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/mobile/modules/cindy-remote-presentation/ios/RemoteDesktopReceiver.swift#L262-L269)、[relay fallback](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/mobile/src/remote-desktop/RemoteDesktopScreen.tsx#L2240-L2258)

Cindy 是 Electron 本机应用，已有 Chromium 承担采集窗口、编码和 RTC。BotHarness Host 是 DSH Plugin，常见 Node/headless 部署不能直接实例化 Electron BrowserWindow；复用设计时需要选择实际 sender adapter，而非复制这个进程结构。BotHarness 的 Browser Takeover 与 Computer Takeover 仍由既有领域 owner 决定；Cindy 单 viewer lease、连接时可自动控制的产品行为不应覆盖本项目 watch-by-default 的语义。

## 对 BotHarness 的下一步建议

建议把正在讨论的 seam 定义为“一个受 Host 授权的远端观看会话”，由其内部协调采集源、媒体尝试、播放器能力、几何版本、降级原因和清理；控制请求继续经过现有 Browser/Computer 所有者。观看 lease、媒体 attempt 和输入控制权分别建模，业务客户端不直接处理 ICE/SDP 或决定是否可以输入。这是研究建议，具体名称和接口仍应结合 BotHarness 现有 owner 深化，不直接照搬 Cindy 的 Electron 主进程/renderer 结构。

首个可验证切片应限定一个采集后端、一种客户端和真实跨机器连接：同条件比较当前图片路径与 WebRTC 视频路径，记录首帧时间、采集/编码/解码 FPS、静态文本清晰度、流量、Host CPU、输入到画面反馈延迟以及降级原因。先证明持续观看和间歇接管；PiP、媒体 DataChannel 控制请求、跨平台采集和多档策略各自有独立成本，可在边界稳定后追加。Cindy 的经验支持增加视频媒体路径，同时保留明确的截图兼容路径；它不能代替本项目的跨设备实测。[前序 BotHarness WebRTC 研究](2026-10-22-remote-viewer-webrtc.md)

## 补充：用户指定的 #4207 与原生凭证边界

[#4207](https://github.com/makecindy/cindy/pull/4207) 于 2026 年 9 月 10 日合并，新增可选自动解锁、退出锁屏和手机原生控制。**普通观看沿用同账号授权，已经解锁的电脑不因这项功能增加密码/Face ID 门槛**；自动解锁与退出锁屏分别默认关闭。初次显式设置在原生密码表单完成，验证成功后保存密码，再按偏好启用生物认证保护。密码与私钥不进入 JavaScript，JS/relay 传递密文。

它对 seam 最直接的启发是：**凭证事务不能依附某一次媒体连接。** 原生 `NativeChannel` 明确独立于 media lease 和 relay retry；手机 `RemoteDesktopCredentialSession` 以 account owner generation、target、epoch 隔离过期回调，原生 `ControllerCredentialSession` 的传输重试查询同一认证尝试的状态，不再次发送密码。一次观看/重连周期只尝试一次自动解锁，媒体重试或 iOS 生物认证造成的短暂 inactive 不重新触发 Face ID；主动重连或后台释放后的重新观看才重置自动尝试。这不能简化为“每建一个 PeerConnection 都认证”，也不宜机械理解成“每换一个 lease 都要弹 Face ID”。[手机凭证会话](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/apps/mobile/src/remote-desktop/credentialSession.ts)、[原生凭证事务](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/packages/remote-credentials-native/Sources/CindyRemoteCredentials/ControllerCredentialSession.swift)、[当前凭证行为文档](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/docs/remote-desktop-credentials.md)

签名握手绑定 realm、account membership、两端 device ID、随机值和临时密钥，消息有 session、sequence、重放/有效期检查；已存密码还绑定目标公钥和 OS 用户记录。观看/输入及锁屏请求则继续受具体 peer/lease 约束。这些绑定对应不同身份与生命周期，不能用一个“连接已加密”的状态代替。[NativeChannel](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/packages/remote-credentials-native/Sources/CindyRemoteCredentials/NativeChannel.swift)、[凭证文档](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/docs/remote-desktop-credentials.md)

首次登记的信任边界也写得明确：**首次主机公钥来自已有账号服务与 relay，未做带外比对，因此不能抵抗首次登记时的恶意中继换钥。** 之后持久 pin 精确公钥，换钥拒绝；关闭自动解锁删除密码但保留 pin，重新开关不能绕过主机身份变化。原生加密通道解决密文搬运与后续身份连续性，不自动解决首次信任。[#4207 风险说明](https://github.com/makecindy/cindy/pull/4207)

需要区分版本：#4207 原始能力明确**不保证杀 App/断网后的退出锁屏请求送达**。10 月 9 日的 [#5548](https://github.com/makecindy/cindy/pull/5548) 才把 `lockOnExit` 提前随 start/heartbeat 交给 Host，新增信令断开或租约过期时的本地执行；当前文档描述 12 秒租约、每秒检查，已获授权且仍有心跳的后台观看不因此锁屏。旧 Host 仍依赖显式 stop。此演进支持把远端退出策略放在资源 owner，不能把页面关闭当成“远端已经锁定”的证明。[当前退出策略](https://github.com/makecindy/cindy/blob/b60f6fadeb89d7a93df9aa1bcb6212f56568ca58/docs/remote-desktop-credentials.md)

#4207 报告开发测试包曾获得用户成功反馈，但正式签名包、Android 实机、最终原生控件双主题和多项异常路径未完成验收。本次同样没有验证真实密码、生物认证或锁屏行为。借鉴的是事务与身份边界，不把可选自动解锁加入 BotHarness 当前视频迁移的必需范围。
