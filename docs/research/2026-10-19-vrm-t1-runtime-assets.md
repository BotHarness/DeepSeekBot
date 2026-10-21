# T1：VRM 运行时、动作分层与可分发素材

研究日期：2026-10-19（Asia/Tokyo）。这是 T1 #2222 的方案输入；没有安装依赖、实现运行时代码或渲染验收。研究读取官方源代码、npm 官方注册表、规范与素材作者的发布页；模型只下载到内存核验。AIRI / N.E.K.O 的应用层比较见同轮独立调查。

## 建议

T1 使用 `three` 的 WebGLRenderer、`GLTFLoader` 和 `@pixiv/three-vrm`，做一个小型角色舞台。第一版锁 `three@0.180.0`、`@pixiv/three-vrm@3.5.5`，需要读取 VRMA 时再加入同版本 `@pixiv/three-vrm-animation@3.5.5`。这是沿用官方示例组合的保守选择，不是宣称其他 Three.js 版本不兼容；当前注册表的 Three.js 最新版本为 `0.186.1`，three-vrm 的 peer 范围为 `>=0.137`，宽范围也不等于我们已经验证整个范围。[官方 package](https://github.com/pixiv/three-vrm/blob/ff42fae4fcee1fcbca2cd262c7f5f8cbddeaf5ab/packages/three-vrm/package.json)、[官方 VRMA 示例](https://github.com/pixiv/three-vrm/blob/ff42fae4fcee1fcbca2cd262c7f5f8cbddeaf5ab/packages/three-vrm-animation/examples/loader-plugin.html)、[Three.js 注册表](https://registry.npmjs.org/three/latest)。

使用官方 `VRM1_Constraint_Twist_Sample` 作为首片可重复分发的技术角色，角色美术随后由 Human 验收。首片的呼吸、眨眼、注视和轻量 Activity 姿态由我们编写少量规范化骨骼曲线，嘴形由实际文本播放节奏控制；不让素材搜集、全身重定向或语音模型阻塞第一次端到端验证。若需要外部动作库，优先 Quaternius 的 CC0 Universal Animation Library，离线选取并重定向少量片段。不要把 VRoid 免费七动作包直接放入公开前端 Bundle，其作者条款禁止可提取形式的再次分发。[模型许可说明](https://github.com/vrm-c/vrm-specification/blob/94e82dd346fa6cf0337c4421728640e5252dd38e/samples/VRM1_Constraint_Twist_Sample/README.md)、[Quaternius 作者页](https://quaternius.itch.io/universal-animation-library)、[VRoid 动作包条款](https://booth.pm/ja/items/5512385)。

以上是工程方案推断；没有运行性能、观感或兼容性实测。VRM 交换格式不会自动产生《朋友收集》的大头短身、表情节奏和日常生活感，选用官方技术样本也不代表最终美术已敲定。

## 可复查的版本锚点

| 来源                    | 本次读取的固定版本                                                                                       | 确认范围                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pixiv/three-vrm         | `ff42fae4fcee1fcbca2cd262c7f5f8cbddeaf5ab`，npm 两个包均为 `3.5.5`                                       | 加载器、normalized humanoid、表达、VRMA、释放逻辑；[release commit](https://github.com/pixiv/three-vrm/commit/ff42fae4fcee1fcbca2cd262c7f5f8cbddeaf5ab) |
| vrm-c/vrm-specification | `94e82dd346fa6cf0337c4421728640e5252dd38e`                                                               | 模型许可说明和样本清单；[样本](https://github.com/vrm-c/vrm-specification/tree/94e82dd346fa6cf0337c4421728640e5252dd38e/samples)                        |
| Three.js                | 官方示例使用 `0.180.0`；注册表 latest `0.186.1` 的 gitHead 为 `9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8` | 建议 first slice 固定示例版本再运行验证；[r180 源码](https://github.com/mrdoob/three.js/tree/r180)                                                      |

三个运行时库的代码许可证均为 MIT。下述模型和动作逐项检查自身许可，不从代码许可推导素材许可。[three-vrm LICENSE](https://github.com/pixiv/three-vrm/blob/ff42fae4fcee1fcbca2cd262c7f5f8cbddeaf5ab/LICENSE)、[three-vrm-animation package](https://registry.npmjs.org/@pixiv/three-vrm-animation/3.5.5)、[Three.js package](https://registry.npmjs.org/three/0.180.0)。

## 默认模型：路径、许可和实测结构

固定资产路径：[`packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm`](https://github.com/pixiv/three-vrm/blob/ff42fae4fcee1fcbca2cd262c7f5f8cbddeaf5ab/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm)。规范仓库中的对应文件为 [`samples/VRM1_Constraint_Twist_Sample/vrm/VRM1_Constraint_Twist_Sample.vrm`](https://github.com/vrm-c/vrm-specification/blob/94e82dd346fa6cf0337c4421728640e5252dd38e/samples/VRM1_Constraint_Twist_Sample/vrm/VRM1_Constraint_Twist_Sample.vrm)。本次读取前一个路径的实际二进制 GLB JSON chunk：

| 项目     | 实际读取结果                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 大小     | **10,776,032 bytes**，约 10.28 MiB；不是极小的移动端素材                                                                                                                  |
| SHA-256  | `12c2b97e95e700783a6a550dc0eee2d7880aeedccef9ae67bc4c5a2f0f2631a2`                                                                                                        |
| 模型     | `VRM1_Constraint_Twist_Sample` / `v1.0.1` / VRM 1.0                                                                                                                       |
| 权利人   | `pixiv Inc.`；`(c) 2022 pixiv Inc.`                                                                                                                                       |
| 资产许可 | VRM Public License 1.0；[许可原文](https://vrm.dev/licenses/1.0/pdf/en.pdf)                                                                                               |
| 嵌入权限 | `avatarPermission: everyone`；`commercialUsage: corporation`；`allowRedistribution: true`；`modification: allowModificationRedistribution`；`creditNotation: unnecessary` |
| 嵌入限制 | `allowAntisocialOrHateUsage: false`；另三个 sexual / violent / political-or-religious 字段均为 true。保留实际模型元数据及许可，不改标为 CC0/MIT                           |
| 结构     | 3 meshes、3 skins、13 materials、18 textures；没有测量实际 GPU 内存和 draw calls                                                                                          |
| 表达     | `aa`、`ih`、`ou`、`ee`、`oh`、`blink`、`blinkLeft`、`blinkRight`、`happy`、`angry`、`sad`、`relaxed`、`surprised`、`neutral`、四个 look 方向，共 18 个                    |

工程分发时建议把固定文件、来源 commit、SHA-256、作者及许可副本/链接一起存入资产清单，从自己的 Plugin 静态资源路径加载，避免运行时依赖 GitHub raw/CDN。虽然该模型无需画面署名，保留来源说明仍有助于后续换模型。这里核验的是许可声明和文件结构；没有推断作者对任何未列出的第三方权利作了额外保证。

另一个规范样本 Seed-san 为 **10,917,800 bytes**（官方 Git tree 文件长度），由 VirtualCast, Inc. 提供，README 同样标 VRM Public License 1.0。本轮未读取其完整嵌入权限，因此不把它当成已核准的替换默认模型。[官方路径和说明](https://github.com/vrm-c/vrm-specification/tree/94e82dd346fa6cf0337c4421728640e5252dd38e/samples/Seed-san)。

VRoid 官方 FAQ 列出的旧 β 版 AvatarSample_1–4、HairSample_Male/Female 属于 CC0；AvatarSample_A/B/C 等有单独条件，不能把“VRoid 样本”整体当 CC0。它们可以作为后续寻找更小或更合适外形的来源，本轮未取得相应官方 VRM 二进制和哈希。[VRoid 官方模型许可 FAQ](https://vroid.pixiv.help/hc/en-us/articles/4402614652569-Do-VRoid-Studio-s-sample-models-come-with-conditions-of-use)。

## 动作素材选择

| 候选                                   | 一手证据与许可                                                                                                                                                                                                                                                                                                                                             | 对 T1 的决定                                                                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 自作 normalized pose / keyframe 小曲线 | 官方展示了 normalized bone QuaternionKeyframeTrack 与表达 NumberKeyframeTrack；不依赖第三方动画资产。[示例](https://github.com/pixiv/three-vrm/blob/ff42fae4fcee1fcbca2cd262c7f5f8cbddeaf5ab/packages/three-vrm/examples/animations.html)                                                                                                                  | **首选**。只编写 idle 呼吸/眨眼、thinking/working/waiting/blocked 轻姿态，避免第一片出现动画库、重定向编辑器或房间系统                                           |
| Quaternius Universal Animation Library | 作者发布页明确资产 CC0、免费 Standard ZIP；GLB/FBX 等通用 humanoid 动作，完整系列宣传 120+ 动作不代表免费 ZIP 包含全部。作者页显示 Standard 15 MB，未下载，因此不把该数字当 byte 精度测量。[作者网站](https://quaternius.com/packs/universalanimationlibrary.html)、[作者 itch.io](https://quaternius.itch.io/universal-animation-library)                 | **可再分发的外部动作集候选**。要先取 Standard 实物、记录哈希/文件与选用片段，再离线重定向到 VRM normalized rig；原始 GLB 不能改扩展名当 VRMA。第一片不需要完整库 |
| 官方 three-vrm `test.vrma`             | [`packages/three-vrm-animation/examples/models/test.vrma`](https://github.com/pixiv/three-vrm/blob/ff42fae4fcee1fcbca2cd262c7f5f8cbddeaf5ab/packages/three-vrm-animation/examples/models/test.vrma)，11,548 bytes；GLB 实物为三秒测试，右上臂旋转、happy、lookAt 三轨；generator 标为 Blender add-on / handwritten。仓库 MIT，但文件未包含独立资产许可字段 | 用于理解 loader 的最小测试样本；本轮不把仓库 MIT 自动扩大为单独素材的无条件授权，也不把测试动作包装为最终 idle/working 动作                                      |
| VRoid Project 七种 VRMA                | 作者列 `VRMA_01`–`07`、ZIP 3.29 MB，并明确禁止可提取形式的再次分发；商用另有署名条件。[作者商品与条款](https://booth.pm/ja/items/5512385)                                                                                                                                                                                                                  | **不直接纳入公开 Bundle**。免费使用与公开源码仓库/前端资产的再次分发是不同权限                                                                                   |

## 运行时合同：可以直接采用的上游机制

1. **加载与版本适配。** 一个 GLTFLoader 注册 VRMLoaderPlugin；成功后读取 `gltf.userData.vrm`，缺少 VRM 时拒绝作为角色加载。需要 VRMA 时同一个 loader 注册 VRMAnimationLoaderPlugin，读取 `gltf.userData.vrmAnimations[0]`，用 `createVRMAnimationClip(animation, vrm)` 创建绑定到该实例的 clip。VRM0 的旧 a/joy 等名称由 loader 映射到 aa/happy；场景朝向通过 `VRMUtils.rotateVRM0` 修正，不手写全模型翻转规则。[VRMA 示例](https://github.com/pixiv/three-vrm/blob/ff42fae4fcee1fcbca2cd262c7f5f8cbddeaf5ab/packages/three-vrm-animation/examples/loader-plugin.html)、[表达映射](https://github.com/pixiv/three-vrm/blob/ff42fae4fcee1fcbca2cd262c7f5f8cbddeaf5ab/packages/three-vrm-core/src/expressions/VRMExpressionLoaderPlugin.ts)、[rotateVRM0](https://github.com/pixiv/three-vrm/blob/ff42fae4fcee1fcbca2cd262c7f5f8cbddeaf5ab/packages/three-vrm/src/VRMUtils/rotateVRM0.ts)。
2. **骨骼所有权。** 改 `humanoid.getNormalizedBoneNode` 或 `setNormalizedPose`，不要把不同模型的 raw bone rotation 直接互拷。autoUpdateHumanBones 默认 true，会在 update 时把 normalized pose 写回原始骨骼；直接改 raw bone 可能被覆盖。VRMA clip 创建器处理 VRM0 的轴符号和 hips 高度比例，依然不能保证任何比例的角色都没有手穿模/脚滑。[Humanoid](https://github.com/pixiv/three-vrm/blob/ff42fae4fcee1fcbca2cd262c7f5f8cbddeaf5ab/packages/three-vrm-core/src/humanoid/VRMHumanoid.ts)、[clip 转换器](https://github.com/pixiv/three-vrm/blob/ff42fae4fcee1fcbca2cd262c7f5f8cbddeaf5ab/packages/three-vrm-animation/src/createVRMAnimationClip.ts)。
3. **每帧顺序。** 建议先推进 AnimationMixer 和自己拥有的骨骼/表达权重，再 `vrm.update(delta)`，最后 render。VRMCore 依次更新 humanoid/lookAt/expressions，VRM 再更新 constraint、spring bone、material。上游 VRMA 示例也是 mixer → vrm → render；另一份普通 animations 示例次序不同，所以不能不加判断地照抄所有示例。[VRMCore](https://github.com/pixiv/three-vrm/blob/ff42fae4fcee1fcbca2cd262c7f5f8cbddeaf5ab/packages/three-vrm-core/src/VRMCore.ts)、[VRM](https://github.com/pixiv/three-vrm/blob/ff42fae4fcee1fcbca2cd262c7f5f8cbddeaf5ab/packages/three-vrm/src/VRM.ts)。
4. **表达能力而非默认存在。** `getExpression(name)` 可能为 null，`setValue` 将权重限制为 0–1。manager 内部处理 overrideBlink/overrideLookAt/overrideMouth；带表情轨道的 VRMA 可能和程序化嘴形、眨眼争用。首片为每条轨道指定一个写入者：Activity 管身体；speaking 管嘴与有限手势；idle 管眨眼/呼吸。若引入现成 clip，要过滤冲突轨道或显式混合，再一次性写最终值；缺表达时降级文本，不杜撰模型没有的面部能力。[ExpressionManager](https://github.com/pixiv/three-vrm/blob/ff42fae4fcee1fcbca2cd262c7f5f8cbddeaf5ab/packages/three-vrm-core/src/expressions/VRMExpressionManager.ts)。

这里的 Activity/speaking 分层属于 BotHarness 应用设计，不是 VRM 提供的 Bot 状态协议。嘴形基于文本播放节拍只能称说话表现，不能称音素同步。保留真实 Bot 输出的身份、可见范围、取消与去重逻辑；VRM 层只接收已经获准播放的表现输入。工作姿态和说话可并行，不把 speaking 加进互斥 Activity 枚举。

## 生命周期与首片验证

以下是由上游机制推导的 T1 实现要求，尚未实现：

| 场景                             | T1 应有行为                                                                                                                                                                  | 依据                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panel resize / 宽窄切换          | 用实际容器尺寸更新 camera aspect/projection 与绘制缓冲；0 尺寸暂停。限制像素密度/像素总量，避免照搬整页示例的 window 尺寸与无限 devicePixelRatio                             | [Three.js responsive 原文](https://github.com/mrdoob/three.js/blob/r180/manual/en/responsive.html)                                                                                                                                                                                                                                 |
| 切换后台、隐藏 Panel             | document visibility 与宿主 Panel 可见状态都进入 scheduler；只观察 visibilitychange 不会发现页面内 CSS 隐藏。暂停/降频，恢复时重置计时基准，避免 spring 大步跳跃              | [Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)                                                                                                                                                                                                                                            |
| reduced motion                   | 监听系统偏好，停止持续摇摆/全身过渡，以静态姿态、状态文字、说话指示表达同一事实；状态可理解性不依赖动画                                                                      | [prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)                                                                                                                                                                                                        |
| 关闭、换 Bot、卸载、加载途中关闭 | 停 RAF/mixer，解绑事件/ResizeObserver，取消或失效化异步加载；晚到模型必须释放。释放几何、材质、纹理、骨架及 renderer，回收独占 bitmap/object URL，避免误释放另一实例共享资源 | [VRMUtils.deepDispose](https://github.com/pixiv/three-vrm/blob/ff42fae4fcee1fcbca2cd262c7f5f8cbddeaf5ab/packages/three-vrm/src/VRMUtils/deepDispose.ts)、[Three.js cleanup](https://github.com/mrdoob/three.js/blob/r180/manual/en/cleanup.html)、[GLTFLoader 的 ImageBitmap 提醒](https://threejs.org/docs/pages/GLTFLoader.html) |
| WebGL 不可用 / context loss      | 显示可读的 Bot + Activity + 文本状态和重试入口，暂停动画；恢复走受控重建/重新初始化，不能在失效 context 上继续当成功帧。以 renderer 的 context loss 模拟做验证               | [WebGL context loss](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/isContextLost)                                                                                                                                                                                                                         |
| 两个独立实例                     | 每实例独立 VRM scene / mixer / playback state；可以共享不可变 bytes 缓存，不能共享可变骨骼和表达对象。同 Bot 多视图不得因此重复音频                                          | [VRM 类实例结构](https://github.com/pixiv/three-vrm/blob/ff42fae4fcee1fcbca2cd262c7f5f8cbddeaf5ab/packages/three-vrm/src/VRM.ts) + T1 应用要求                                                                                                                                                                                     |

`deepDispose` 3.5.5 会遍历几何、骨架、材质/纹理，但不替调用方注销 RAF、事件或关闭所有 ImageBitmap；因此它是卸载流程的一步，不能等价于完整 Plugin dispose。若缓存纹理/bitmap，必须明确引用与释放所有权，首片优先独立实例资源以降低复杂度。

验收必须同时覆盖：真实 Activity 变化；真实 Bot 输出驱动嘴形且不改 Activity；缺表达/模型失败；两 Bot 实例不串态；关闭/重开/重连不重播历史；Group 没有入口和角色；容器缩放；隐藏和 reduced motion；多次打开/销毁后资源稳定。实际帧率、首次加载时间、两实例显存/内存和外形可读性，都等真正装进 T1 的 Host/Client 路径后测量，研究结果不充当运行证据。

## 尚待验证，不阻塞选型

- 10.28 MiB 技术样本是否满足真实面板的首屏与双实例预算；如果不满足，再优化其纹理/网格或换经核验的更小模型，不能先承诺性能数字。
- 默认姿态、镜头、表情节奏是否符合 Human 的日常角色感；官方样本只解决可复现和基本能力，不解决最终设计。
- VRM0/VRM1 路径有上游实现支撑，但 T1 若承诺两者均支持，必须增加各一个实际模型的加载/表达验证；否则明确首片已验证资产范围。
- Quaternius 动作需要实物选片和重定向后画面验证；这不是自作轻动作完成第一片的前置依赖。

结论：运行时和合法可分发的技术模型已有明确起点；唯一未证明的是在 BotHarness 内的实际运行效果。第一片应把时间花在原生 Plugin 生命周期、Activity/输出来源、动作所有权与 Human 可验收的真实状态路径上。
