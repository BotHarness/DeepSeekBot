# T1：AIRI、N.E.K.O. 与 ChatVRM 的表现层研究

调查日期：2026-10-19。范围：为 [T1 #2222](https://github.com/BotHarness/DeepSeekBot/issues/2222) 选择可借鉴的 VRM 加载、身体动作、表情、说话与生命周期设计。本文是源码调查与方案建议，没有运行这些项目，也不构成 BotHarness 的运行验收。

## 结论

**建议直接依赖 Three.js / three-vrm，在独立原生 Panel Plugin 内实现一个小的 VRM 表现层；借鉴 AIRI 的分层控制与加载生命周期、N.E.K.O. 的取消与资源清理经验，不接入完整 AI 伴侣平台。** T1 的 Activity 继续来自 BotHarness 已有事实；说话表现来自已提交、可见的 Bot 文本。它们是可同时存在的两个输入。第一片使用文字播放节奏驱动轻量嘴型与手势，不以 TTS、音素识别或情绪模型为前置条件。这是本研究的建议，源项目的具体实现证据见下文。

## 固定调查版本

| 项目              | 官方仓库与固定提交                                                                                                                                             | 选择理由                                                                                                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project AIRI      | [moeru-ai/airi · 5b0db5bd184c6ef5d476f47a180e46c3a3167a13](https://github.com/moeru-ai/airi/tree/5b0db5bd184c6ef5d476f47a180e46c3a3167a13)                     | 有实际 VRM 与 Live2D 表现层；重点读取 VRM 组件、表情控制和说话播放状态。见 [README](https://github.com/moeru-ai/airi/blob/5b0db5bd184c6ef5d476f47a180e46c3a3167a13/README.md#L258-L270)。                                                     |
| 猫娘计划 N.E.K.O. | [Project-N-E-K-O/N.E.K.O · 61c7766dba74462e0f7726b60e2854d9b7343dcb](https://github.com/Project-N-E-K-O/N.E.K.O/tree/61c7766dba74462e0f7726b60e2854d9b7343dcb) | 官方名为 Project N.E.K.O.；包含 Live2D、VRM 等 Avatar 形态，本次只研究其 VRM 实现。见 [README](https://github.com/Project-N-E-K-O/N.E.K.O/blob/61c7766dba74462e0f7726b60e2854d9b7343dcb/README.MD#L29-L42)。                                  |
| ChatVRM           | [pixiv/ChatVRM · b542aa00e19dccf9fc48ba340cf7eee011d2329a](https://github.com/pixiv/ChatVRM/tree/b542aa00e19dccf9fc48ba340cf7eee011d2329a)                     | 简短的 VRM 会话 demo，可帮助理解最小 Renderer / Model / LipSync 分工；README 明确以技术共享、演示为主，代码于 2024-07-18 归档。见 [README](https://github.com/pixiv/ChatVRM/blob/b542aa00e19dccf9fc48ba340cf7eee011d2329a/README.md#L1-L26)。 |

这里使用固定提交链接，避免后续主分支变化被误读为本次已经验证的行为。没有将第三方博客或搜索摘要作为实现依据。

## AIRI：最值得借鉴的是控制权和生命周期

### 加载、实例与销毁

AIRI 的加载器给 `GLTFLoader` 注册 `VRMLoaderPlugin` 与 `VRMAnimationLoaderPlugin`。`loadVrm` 处理模型、骨架优化、朝向、包围盒和初始镜头；它与 Vue 组件中的生命周期控制分开。证据：[loader.ts](https://github.com/moeru-ai/airi/blob/5b0db5bd184c6ef5d476f47a180e46c3a3167a13/packages/stage-ui-three/src/composables/vrm/loader.ts)、[core.ts](https://github.com/moeru-ai/airi/blob/5b0db5bd184c6ef5d476f47a180e46c3a3167a13/packages/stage-ui-three/src/composables/vrm/core.ts)。

`VRMModel.vue` 使用递增加载序号判定异步结果是否仍有效；模型或动作加载完成后若已经过时，就移除并 `deepDispose` 本次迟到的对象。组件清理还解除帧回调、停止动作、清理表情与交互资源。它区分可缓存实例与应当销毁的实例，并按 `scopeKey` 管理脱离场景的缓存，不能简单把“同一个模型 URL”视为同一个活实例。证据：[加载序号与销毁](https://github.com/moeru-ai/airi/blob/5b0db5bd184c6ef5d476f47a180e46c3a3167a13/packages/stage-ui-three/src/components/Model/VRMModel.vue#L270-L355)、[异步加载守卫](https://github.com/moeru-ai/airi/blob/5b0db5bd184c6ef5d476f47a180e46c3a3167a13/packages/stage-ui-three/src/components/Model/VRMModel.vue#L790-L845)、[实例缓存](https://github.com/moeru-ai/airi/blob/5b0db5bd184c6ef5d476f47a180e46c3a3167a13/packages/stage-ui-three/src/components/Model/vrm-instance-cache.ts)。

**T1 建议：** 每个 Panel 实例拥有自己的 renderer、场景、VRM、mixer、帧循环与销毁器；首次实现不增加 AIRI 的热重载模型缓存。共享静态资源的下载缓存可以后续测量后决定，但不能共享可变骨骼或嘴型状态。切 Bot、换模型、关闭 Panel 都使加载代次失效；迟到模型必须销毁，不能插回旧绑定。

### 嘴、眼睛与表情不能互相覆盖

AIRI 的嘴型模块明确只拥有“音频源到 wLipSync 节点的连接”，AudioContext 和源由调用者拥有；它把五元音映射到 `aa / ee / ih / oh / ou`，并在 watcher 清理时断开连接。表情控制器在嘴型活跃期间跳过这些通道，但继续推进自身的过渡与复位；嘴型释放之后平滑交还表情控制。证据：[lip-sync.ts](https://github.com/moeru-ai/airi/blob/5b0db5bd184c6ef5d476f47a180e46c3a3167a13/packages/stage-ui-three/src/composables/vrm/lip-sync.ts)、[表情通道控制](https://github.com/moeru-ai/airi/blob/5b0db5bd184c6ef5d476f47a180e46c3a3167a13/packages/stage-ui-three/src/composables/vrm/expression.ts#L117-L119)、[释放与过渡](https://github.com/moeru-ai/airi/blob/5b0db5bd184c6ef5d476f47a180e46c3a3167a13/packages/stage-ui-three/src/composables/vrm/expression.ts#L234-L340)。

它的帧循环先推进嘴型，再读取这一帧的嘴型活跃状态交给表情控制；注释明确指出，读取上一帧状态会导致一句话开始时嘴型被表情覆盖。眨眼控制即使被表情抑制也继续推进计时，避免停在半闭眼。证据：[VRMModel 帧更新](https://github.com/moeru-ai/airi/blob/5b0db5bd184c6ef5d476f47a180e46c3a3167a13/packages/stage-ui-three/src/components/Model/VRMModel.vue#L451-L522)。

**T1 建议：** 明确每个通道唯一写入者：身体由 Activity 的基础姿态驱动，眼部由待机眨眼驱动，嘴部由当前文本播放驱动，轻量说话手势只写允许叠加的部位。Activity 为 working 时照常说话，不引入一个把 working 替换掉的 speaking 业务状态。没有对应表情或骨骼时跳过该通道并维持中性表现。

### 说话必须有终态

AIRI 的 `bindSpeakingStateToPlaybackManager` 只在实际播放开始时设置 speaking，并在 end、interrupt、reject 三类终态都清零。控制层按 `sessionId` / `TurnRef` 找到要打断的播放，且把连接和组件生命周期接入 AbortSignal。证据：[播放终态](https://github.com/moeru-ai/airi/blob/5b0db5bd184c6ef5d476f47a180e46c3a3167a13/packages/stage-ui/src/libs/speech/playback-speaking-state.ts)、[speech-output-control.ts](https://github.com/moeru-ai/airi/blob/5b0db5bd184c6ef5d476f47a180e46c3a3167a13/packages/stage-ui/src/stores/speech-output-control.ts)。

**T1 建议：** 把这里的播放生命周期用于文字节奏播放器，不引入它的语音服务。每个展示项有稳定的输出身份、绑定身份和取消代次；正常结束、打断、隐藏、卸载、绑定变化都必须撤销定时器并复位嘴型。去重应使用既有输出 ID，而不是文本字符串；打开面板或重连时仅恢复当前 Activity，不重播历史说话。这些是 BotHarness 需要自行实现和验证的规则，本研究没有声称 AIRI 已提供 BotHarness 所需的跨面板去重。

## N.E.K.O.：学习 VRM 生命周期，避免搬入全局桌宠架构

N.E.K.O. 的官方前端说明和代码一致：VRM 使用 Three.js / three-vrm，VRMA 通过 three-vrm-animation 加载；主要实现放在 `static/vrm/`，主页面创建 `window.vrmManager`。说明还明确独立聊天与字幕页面没有第二份 VRM 场景，而是通过跨窗口桥协调主页面。证据：[VRM 前端文档](https://github.com/Project-N-E-K-O/N.E.K.O/blob/61c7766dba74462e0f7726b60e2854d9b7343dcb/docs/frontend/vrm.md)、[vrm-core.js](https://github.com/Project-N-E-K-O/N.E.K.O/blob/61c7766dba74462e0f7726b60e2854d9b7343dcb/static/vrm/vrm-core.js)。

该设计服务于它自己的桌宠宿主。**T1 不建议直接搬入 `window.vrmManager`、全局动作总线或完整页面初始化**，因为 BotHarness 同页可存在不同绑定的普通 Panel 实例。可以复用其经验，仍由各 Panel 的生命周期负责资源。

### 加载代次、暂停与完整销毁

N.E.K.O. 在开始加载时更新 `_activeLoadToken`；核心加载函数在长异步步骤之后检查该 token，过期则销毁本次结果，避免迟到加载移除新模型或覆盖新镜头。完整 `dispose()` 再次推进 token，并取消帧循环、停止空闲调度、释放动画和模型、renderer、controls，移除记录的窗口事件监听。证据：[loadModel 守卫](https://github.com/Project-N-E-K-O/N.E.K.O/blob/61c7766dba74462e0f7726b60e2854d9b7343dcb/static/vrm/vrm-core.js#L761-L775)、[迟到加载处理](https://github.com/Project-N-E-K-O/N.E.K.O/blob/61c7766dba74462e0f7726b60e2854d9b7343dcb/static/vrm/vrm-core.js#L863-L870)、[销毁入口](https://github.com/Project-N-E-K-O/N.E.K.O/blob/61c7766dba74462e0f7726b60e2854d9b7343dcb/static/vrm/vrm-manager.js#L1869-L2084)。

**T1 建议：** 关闭、隐藏、重开、快速切换 A/B Bot 和正在下载时卸载必须成为第一片的验收路径；使用单一帧循环，隐藏暂停并限制恢复时的 delta。不能只验证模型首次出现。

### 音频嘴型和文本动作是不同系统

N.E.K.O. 的 formant 模块读取 AnalyserNode，估计 F1/F2 后产生五元音权重，并做 attack/release 平滑；该模块只输出分析结果，由动画模块写入表情。因此它是音频分析方案，不是“从文字得到准确音素”的方案。证据：[vrm-lipsync-formant.js](https://github.com/Project-N-E-K-O/N.E.K.O/blob/61c7766dba74462e0f7726b60e2854d9b7343dcb/static/vrm/vrm-lipsync-formant.js#L1-L30)。

动作 runtime 另外维护当前 turn、已处理标记和播放器控制；取消事件带 turnId，非当前 turn 的取消不会直接取消当前动作，切模型模式也取消旧动作。它还根据文本和语义表生成动作计划，这属于该项目更大的表现系统。证据：[runtime 文本处理](https://github.com/Project-N-E-K-O/N.E.K.O/blob/61c7766dba74462e0f7726b60e2854d9b7343dcb/static/vrm/motion/runtime.js#L553-L669)、[取消处理](https://github.com/Project-N-E-K-O/N.E.K.O/blob/61c7766dba74462e0f7726b60e2854d9b7343dcb/static/vrm/motion/runtime.js#L1030-L1092)、[模型切换](https://github.com/Project-N-E-K-O/N.E.K.O/blob/61c7766dba74462e0f7726b60e2854d9b7343dcb/static/vrm/motion/runtime.js#L1170-L1180)。

**T1 建议：** 借鉴“取消必须匹配输出身份”；暂不引入文本情绪推断、舞蹈、动作语义规划和主动陪伴。第一片只用确定性的 Activity 映射、文字节奏和少量已授权动作，不把文本语气变成新的 Bot 心情事实。

## ChatVRM：最小分层参考，不作为生产底座

ChatVRM 的 `Model` 封装 VRM 加载、mixer、表情、嘴型与逐帧更新；`speak` 先播放表情再播放音频；嘴型从音量驱动 `aa`。这提供一个容易理解的表现层例子。证据：[model.ts](https://github.com/pixiv/ChatVRM/blob/b542aa00e19dccf9fc48ba340cf7eee011d2329a/src/features/vrmViewer/model.ts)、[lipSync.ts](https://github.com/pixiv/ChatVRM/blob/b542aa00e19dccf9fc48ba340cf7eee011d2329a/src/features/lipSync/lipSync.ts)。

但检查的 `Viewer.update()` 无条件续订 rAF，resize 使用匿名监听；`speakCharacter` 用串行 Promise 链排队 fetch/播放，并没有在这些函数中提供绑定切换的取消 token 或基于输出 ID 的去重接口。**这是对已读文件的有限观察，不声称整个项目不存在其他控制机制。** 它不足以直接满足 T1 的 Panel 卸载、多实例和重连约束。证据：[viewer.ts](https://github.com/pixiv/ChatVRM/blob/b542aa00e19dccf9fc48ba340cf7eee011d2329a/src/features/vrmViewer/viewer.ts)、[speakCharacter.ts](https://github.com/pixiv/ChatVRM/blob/b542aa00e19dccf9fc48ba340cf7eee011d2329a/src/features/messages/speakCharacter.ts)。

## 代码许可与素材边界

| 对象                                                                 | 本次确认                                                                                                                                                                                                                                                                                                                                         | 对 T1 的处理建议                                                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| AIRI 仓库代码                                                        | 根 LICENSE 为 MIT，署名 Neko Ayaka；要求随副本保留版权及许可文本。[LICENSE](https://github.com/moeru-ai/airi/blob/5b0db5bd184c6ef5d476f47a180e46c3a3167a13/LICENSE)                                                                                                                                                                              | 本次以设计借鉴为主；若复制具体代码，逐文件核对并保留声明。不要由根 MIT 推断展示模型或外链素材自动可分发。                |
| N.E.K.O. 仓库代码                                                    | 根 LICENSE 为 Apache-2.0；NOTICE 明确第三方组件保留各自许可。[LICENSE](https://github.com/Project-N-E-K-O/N.E.K.O/blob/61c7766dba74462e0f7726b60e2854d9b7343dcb/LICENSE)、[NOTICE](https://github.com/Project-N-E-K-O/N.E.K.O/blob/61c7766dba74462e0f7726b60e2854d9b7343dcb/NOTICE)                                                              | 不整体搬运；任何复用都需保留适用的许可、NOTICE 和修改说明。                                                              |
| N.E.K.O. 的 `world-walk.vrma.gz`                                     | 专门的 Hanami notice 说明本次导入只有这一个压缩移动片段；宽泛 notice 提到的 Rocketbox、转换工具等并不属于本次导入。notice 又明确 VRMA 为第三方动画的衍生转换，需随分发保留声明。[HANAMI_VRMA_NOTICE](https://github.com/Project-N-E-K-O/N.E.K.O/blob/61c7766dba74462e0f7726b60e2854d9b7343dcb/static/vrm/animation/HANAMI_VRMA_NOTICE.md#L1-L30) | 不把这一 notice 当作整个 `motion/` 或全部 VRMA 的授权证明；T1 不需要移动世界场景，暂不引入此资源。                       |
| N.E.K.O. 的 `sensei.vrm`、`sister1.0.vrm`，AIRI 的展示角色与默认动作 | 本次没有逐一读取模型内的 VRM meta、原作者分发条件或完成每个动作的来源核对，因而**未确认可随 BotHarness 再分发**；这不是宣称它们禁止使用。                                                                                                                                                                                                        | 不作为默认素材直接复制。最终采用的 VRM 和每个 VRMA 必须各自记录原始来源、版本/哈希、许可及署名；代码许可不替代素材许可。 |
| ChatVRM 代码                                                         | 根 LICENSE 为 MIT，署名 pixiv Inc.。[LICENSE](https://github.com/pixiv/ChatVRM/blob/b542aa00e19dccf9fc48ba340cf7eee011d2329a/LICENSE)                                                                                                                                                                                                            | 可学习其小模块结构；没有因此确认其示例模型的独立再分发权，也不采用其过时依赖组合。                                       |

## 建议敲定的 T1 最小方案

下列为 BotHarness 的拟定方案，不是源项目已有功能清单；需由 T1 实现、自动检查与真实 Host 路径验证。

1. **独立 Plugin 与薄表现层。** 原生 Plugin 安装、注册、实例与销毁保持真实；消费公开 Activity 查询/通知和既有已提交输出，不建立第二个 Activity、会话或记忆 authority。
2. **一份合规默认 VRM。** 初次验收只需一个完整、有明确再分发依据的角色和少量姿态。可先用程序化呼吸、眨眼、头部轻动减少动画素材依赖；缺失通道中性降级。是否支持用户上传、远程 URL、角色市场留在本片之外，避免扩大素材和权限范围。
3. **状态与说话分开。** `idle / thinking / working / waiting / blocked` 决定基础姿态；当前已提交文本的展示进度决定嘴型与有限手势。`active` 是口语描述，不增加枚举。working 与说话同时发生时，两者都保持可见。
4. **文字节奏优先。** 用可取消的文字播放时间线驱动轻量开合嘴和手势，明确这是说话表现，不声称音素级唇音同步。既有 babble 如启用，继续与真实 TTS 区分；本片不接入 AIRI 或 N.E.K.O. 的语音服务。
5. **先保证身份和终态。** 使用既有输出 ID 去重、绑定代次隔离 A/B、明确当前输出结束/取消；挂载或重连不重播历史。同一 Bot 多实例可展示同一输出，但如发声，必须由一个共享播放所有者协调，不能各自发一份声音。
6. **最小但完整的生命周期。** ResizeObserver、可见性暂停、reduced motion、加载失败文字回退、迟到异步销毁、停止 rAF/timer、解除订阅、mixer 与 GPU 释放在首片内完成。
7. **验收顺序。** DM 角色＋真实 Activity＋一条真实 Bot 回复；再检验工作中回复、A/B 快切、双实例隔离、群聊完全不显示、全局固定绑定、隐藏恢复、不重播、卸载重装和损坏模型回退。记录两实例的帧率/资源行为，避免仅凭首次渲染成功判定通过。

不纳入 T1：Live2D/MMD 双栈、摄像头动捕、VMC、TTS/语音识别、情绪推理、房间/岛屿模拟、服装编辑、市场、主动陪伴、来源项目的记忆或代理编排。首片完成后交给 Human 验收，再决定扩展；本研究不扩大 T2–T15。
