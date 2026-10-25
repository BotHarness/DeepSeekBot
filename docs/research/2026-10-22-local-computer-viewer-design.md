# Local Computer 视频观看设计访谈

日期：2026-10-22。状态：Q1–Q15 已确认，产品设计访谈已收敛；持久决定见 [ADR-0245](../adr/0245-local-computer-video-separates-media-control-and-pause.md)。本记录保留研究和决策过程，不代表实现完成。

实施规格已按 Human 确认发布为 [#2555](https://github.com/BotHarness/DeepSeekBot/issues/2555)，标记 `ready-for-agent`；具体故事、测试契约和验收以该 issue 为入口。发布前核对发现 Connect 还有 [#2541](https://github.com/BotHarness/DeepSeekBot/issues/2541) 的秘密路由拒绝和 [#2542](https://github.com/BotHarness/DeepSeekBot/issues/2542) 的加密 carrier 工作：本 viewer 消费其合同，不增加明文例外；LAN/tailnet 首片可独立推进，Connect 验收须等待对应能力。

依据：[WebRTC 研究](2026-10-22-remote-viewer-webrtc.md)、[Cindy 研究](2026-10-22-cindy-remote-desktop.md)。静态源码审计基于 `f878c43bb296492d9db9fba72941dc2b73de623c`；尚未启动 Host 或验证手机视频。

## 第一轮：Human 已确认

1. 首个体验目标是手机看清 Bot 的操作，并能间歇接管、点击、滚动、输入；持续完整远程桌面不是本轮交付标准。
2. 首个交付目标是 **Local Computer**。此前研究建议先交付 Container Selkies；该顺序已被本轮选择取代。容器试验不能代替本机采集及真实手机链路的验收。
3. 同一 Computer 支持多端同时观看，同一时间只有一个控制者；观看本身不授予接管权。另一端获取已有控制权必须是明确操作；第二轮已确认允许强制转移。
4. 借鉴 Cindy #4207 的生命周期分离；自动解锁与退出锁屏不在本轮范围。未来凭证事务不应随一次媒体重连被重建。

沿用现有领域语言：Takeover 作用于整台 Computer，暂停所有在其上行动的 PersonaBot 并关闭面向模型的截图；Browser Takeover 只作用于一个 PersonaBot 的浏览器。尚未新增产品术语。

## 实现事实与设计约束

- **单一控制者是新增保证。** [desktop-view.ts](../../packages/computer/src/desktop-view.ts) 目前只有 `pausedUntil`，`next()` 与 `input()` 均续期；[Computer routes](../../packages/computer/src/index.ts) 的 takeover 请求只有 `active`。当前不存在绑定 viewer/device 的排他控制权。不得把“Host 已持有暂停状态”写成“Host 已验证唯一控制者”。
- **媒体不能续期控制权。** 改成视频后图片轮询会消失；其他观看者的取帧也不能替控制者证明存活。控制续期、失联策略和 Bot 恢复时机需要在 Computer owner 内独立定义。
- **保留 Bot 屏障。** 当前先暂停、再等待在途调用结束，且 [tool/provider.ts](../../packages/computer/src/tool/provider.ts) 在 driver call 前后检查暂停。媒体迁移不能移除这些检查。
- **本机采集尚无视频实现。** [target.ts](../../packages/computer/src/target.ts) 仅对 Container 提供 WebRTC；[local Provider](../../packages/computer/src/providers/local.ts) 运行现有 driver。Cindy 的 Electron hidden BrowserWindow 不是 Node DSH Host 可直接使用的能力。
- **并行观看不能靠切断另一端实现。** [ADR-0209](../adr/0209-selkies-webrtc-is-switched-on-per-phone-call-over-the-tailnet.md) 的 Selkies 模式切换明确不保证手机与桌面无扰并行。它不能作为本轮 Local Computer 多端观看已实现的证据。
- **现有网络目标已包含 Connect。** [ADR-0241](../adr/0241-hosted-connect-reaches-the-host-through-a-managed-tunnel.md) 接受了不安装 Tailscale 的 Hosted Connect；其 HTTPS gateway 可承载应用请求，不等于 WebRTC 媒体可经同一路由直接传输。第一片必须明确 tailnet、LAN、Connect 的视频资格与回退规则。
- **客户端复用有既定方向。** [ADR-0242](../adr/0242-a-browser-pairs-other-computers-through-their-device-gateway.md) 与 [ADR-0243](../adr/0243-every-client-reads-every-host-through-one-host-feed.md) 要求 Web Client 与手机复用平台无关 Host client、各自提供适配器。新增 viewer 不应另造一套 Host 身份或设备配对。

## DSH seam：已收敛的职责，具体 API 待实现验证

Computer Plugin 是能力 owner；其 Provider 所持有的运行时负责采集与媒体资源，Fiber 负责资源销毁。观看连接、控制权和媒体尝试是应用定义的状态，不是 DSH Agent Session，也不进入 SessionEvent 或 Memory。Host Feed 可同步观看／接管状态，视频不进入 Feed。

保留现有 Device gateway 的身份与撤销链；新增直连媒体必须能由 Host 在设备撤销、Computer runtime 更换或 Plugin 销毁时主动关闭。DSH `0.2.1-rc.2` 已有 Peer disposal 和 stream abort，不能沿用 ADR-0199 基于旧版本的“缺少可关闭 Peer”判断；但 Peer 能力本身不证明可以直接接收 BotHarness Device 凭证。具体 admission 和传输适配仍需对照 pinned source 与运行 Host 验证，不在本轮默认替换 gateway。

新控制接口同时交付 CLI 路径；现有 WebRTC probe 只能验证状态与信令，不能代替首帧呈现和输入到可见反馈的测量。

## 第二轮：Human 已确认 Q5–Q8

1. **Q5 已确认：Windows Host → Android 真机优先。** 其他平台暂保留图片模式。
2. **Q6 已确认：控制权与 Bot 暂停分开。** 仅视频中断时尝试恢复，不因此交还控制权；最初考虑的图片回退已被 Q14 明确取消。控制连接失联后停止接收该连接的输入，保留最多 30 秒重连窗口；超时释放控制权，但 Bot 继续暂停，等待明确恢复。用户主动选择“结束接管并恢复 Bot”时立即恢复。Host 重启后的暂停保持及手机后台转换已由 Q10–Q11 收敛；旧输入与在途操作的排空仍是实现必须验证的边界。
3. **Q7 已确认：已授权设备可明确确认后强制接过。** Host 先使旧控制权失效，再授予新控制权；旧端退回观看，拒绝旧控制权的迟到输入。交接期间 Bot 保持暂停。
4. **Q8 已确认：支持 TURN，但首版不由项目承担公共 TURN 流量。** 默认尝试 WebRTC 直连，允许用户配置自己的 TURN；不承诺任何网络都可以无配置获得视频。官方中继补贴待实际用量和明确预算后另定。Human 随后提出 VDO.Ninja CLI、MCP 和多语言 SDK，作为实现候选继续研究；提出候选不等于改为依赖其公共中继或已决定引入依赖。

Q8 的[成本研究](2026-10-22-cindy-media-cost.md)确认 Cindy 支持从独立后端获取 TURN 配置，但公开来源不披露生产服务商和账单。曾考虑项目提供受控托管 TURN；Human 对免费开源运营成本提出疑问后，最终选择上述默认直连和自配 TURN 的边界。

软件是否支持 TURN，以及官方是否出资提供公共 TURN，是两个独立决定。受控试点的价格不构成无限免费托管承诺；现阶段无采购或部署公共 TURN 的任务。

## VDO.Ninja 候选研究

[固定版本研究](2026-10-22-vdo-ninja-viewer.md)已完成。CLI 主要为代理数据协作；MCP 的可选 browser worker 有真实 tab 视频，但拥有独立 Chrome。SDK 是可评估的媒体依赖，尚缺本机采集与编码，且需要 VDO 兼容信令；不能直接嵌入现有 Host offer/answer/ICE 传输。本轮不引入 CLI/MCP 工作流，不预先绑定 SDK；Q9 已排除 VDO/OBS 互通目标，媒体依赖按实际集成与测量选择。

## 第三轮：Human 已确认 Q9–Q12

1. **Q9 已确认：首版服务自有 Android/Web viewer。** VDO.Ninja/OBS 互通不是本轮产品目标。SDK 只是候选，按采集、编码、性能、现有信令适配和资源生命周期的实际结果选择；没有预先批准将公共 VDO 服务作为生产依赖。
2. **Q10 已确认：暂停跨 Host 重启保留，旧控制权不恢复。** Host 重启或崩溃恢复后，Bot 仍等待明确恢复；Human 可以重新获取控制权或明确恢复 Bot。持久化暂停和恢复必须由 Computer owner 管理，不能让客户端连接或内存中的媒体状态成为恢复依据。
3. **Q11 已确认：手机切后台／锁屏停止媒体并释放控制权，Bot 保持暂停。** 回到前台恢复观察，接管需要重新获取。后台转换若未能通知 Host，由控制失联的最多 30 秒窗口清理旧控制权；不据此恢复 Bot。PiP 和后台持续观看留待后续独立切片。
4. **Q12 已确认：确认画面停滞后禁止点击、滚动和输入。** 仍可退出、释放控制权或重连；新鲜画面恢复后才允许操作。静态桌面不等于失联，必须结合采集与媒体存活证据判断，不能只因画面内容或序号未变化而禁用输入。最初提及的图片回退及单帧刷新入口由 Q14 取消；视频管线内的刷新／关键帧请求不构成图片传输回退。

Q6 与 Q10 有意改变 [ADR-0210](../adr/0210-the-phone-watches-the-local-computer-through-a-screenshot-stream.md) 的旧选择：原有暂停随 30 秒 lease 过期而自动结束。[ADR-0245](../adr/0245-local-computer-video-separates-media-control-and-pause.md) 明确替代这部分目标语义；当前运行代码尚未迁移，不能声称仅替换视频传输而未改变接管行为。

## 第四轮：Human 已确认 Q13–Q15

Human 确认 Q13、Q15 的推荐，并在 Q14 选择更简单的无图片回退方案：

- **Q13 首片范围：** 单个显示器的桌面视频，复用现有点击／滚动／文本输入能力，交互参考现有 Web viewer 适合移动端的操作方式；音频、剪贴板同步、文件传输、多屏切换和 PiP 不纳入首片。观察与唯一控制者在同一条可运行路径验证，不先交付孤立媒体后端。
- **Q14 无图片回退：** 新视频 viewer 在所有网络下都不提供自动或手动图片回退，也不提供按需单帧替代入口。缺少 helper、连接失败或媒体中断时显示不可用／重连／配置自有 TURN；冻结画面禁止输入。该选择取代 Q6、Q12 和上一轮 Q14 建议中的全部图片回退分支。Q5 留在既有实现的其他平台不因此被改写；模型截图、诊断截图也不是 viewer 回退，不在本轮删除范围。
- **Q15 验收：** Windows Host → Android 真机先通过 LAN 基线，再验证真实跨网络直连和自配 TURN。受控 LAN 连续运动场景以呈现至少 15 fps、输入到可见反馈 p95 不超过 500 ms 为初始通过目标，静态场景验证文字清晰而不要求持续重复帧；跨网络报告实际帧率、码率、首帧时间、输入反馈时延及 ICE 路径，不先承诺任意公网 SLA。并验证双端观察、强制接管、设备撤销、后台、失联、Host 重启和 Bot 暂停／恢复。未达到目标先处理采集／编码瓶颈，不能把仅信令连接成功当作完成。

上述数值是已确认的首片验收门槛，不是当前性能测量或对所有机器的产品承诺。尚无 native 依赖安装、媒体试验或产品代码改动。

产品决策前沿已收敛，剩余是实现与验证工作：Windows 原生采集／编码、helper 封装分发与进程清理、现有授权信令适配、客户端播放、控制状态机与持久暂停、CLI 和真机测量。SDK 选型与 API 拼接由这些事实约束，不再要求 Human 选择底层库。首片交付一个真实可观看并接管的路径，取得 Human 体验反馈后再扩展其他平台与功能。

## Q13 交互参考核对

以下为源码事实，不是真机体验验收：

- Web Computer 的 [Client](../../packages/computer/src/client/index.tsx) 使用共享 [RemoteViewer](../../packages/client/src/client/remote-viewer/index.tsx) 包装 Selkies iframe，提供 fit、全屏和输入 gate；自研触控板、长按、滚动按钮和 IME 提交的更完整参考实际在 [Web Local Browser viewer](../../packages/browser/src/viewer-local.ts)（坐标映射约 339 行，composition 约 636–648 行，pointer 手势约 741–808 行）。不是把 iframe 搬进手机。
- 原生 [Computer screen](../../apps/mobile/app/computer/[slug].tsx) 默认 trackpad，允许切到 direct；共用 [BrowserStage](../../apps/mobile/src/ui/chat/browser-stage.tsx) 的缩放、双指平移、500ms 长按右键和本地光标。其移动语义不等于持续远端 mouse-down/move/up 拖拽，首片不据此承诺拖拽。
- [browser-viewer.ts](../../apps/mobile/src/host/browser-viewer.ts) 的 `fittedFrame`、`pagePoint`、`stagePoint`、`moveCursor` 已有 contain/letterbox 与缩放平移变换。新 video surface 应复用变换语义，以当前视频和采集显示器的尺寸为准。旧 stage 硬编码 Image，不能直接保留帧轮询状态机。
- [computer-viewer.ts](../../apps/mobile/src/host/computer-viewer.ts) 的 `send()` 自动 `takeover(true)`，遇 `not-paused` 重新接管并重试；密码 `hold(true)` 也接管。旧 screen 的 `interactive={live}` 不是排他控制资格判断。这些必须改为显式接管，不能因复用交互而保留。
- 现有原生文本输入用 `addedText(previous,next)` 发送新增后缀，没有明确 composition commit 状态。Web Browser 在 `isComposing` 时不发送、在 `compositionend` 提交的语义值得参考；React Native 必须用 Android 实测确认中文候选替换、提交、删除及密码输入，不能把 DOM 事件实现照搬或宣称现状已正确。

历史 [#1833](https://github.com/BotHarness/DeepSeekBot/issues/1833) 当前为 closed，2026-10-18 的 reconciliation comment 将其与 #1836 一并视为已交付；该状态与原提案的原生视频 helper 要求不能混为一谈。当前代码审计和视频真机证据才决定实现进度。本次没有重开或认领该历史 issue。
