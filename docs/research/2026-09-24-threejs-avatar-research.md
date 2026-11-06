# 基于 three.js 的立体头像原型调研 — would a three.js rebuild be 更方便和自由？

## 0. 元信息

| 项       | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 问题     | 把 `prototype/avatar-hair` 这个 2D SVG 头像原型用 three.js 重做一版，是否更方便、更自由？（逐项对照：真遮挡/光照/旋转、头发技术栈、现成头像管线与许可、本仓库落地成本、自由度得失、工作量与路线 → 结论 + 首个 tracer bullet）                                                                                                                                                                                                                                                                                                               |
| 日期     | 文件名沿用 2026-09-24 序列；所有 URL 实际访问日期 **2026-09-29**                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 调研方法 | 一手来源优先：three.js 官方文档（threejs.org/docs）与 GitHub 源码（mrdoob/three.js，raw 抓取 + GitHub code search 带对照组）、@pixiv/three-vrm 官方 README/typedoc API 参考、vrm-c VRM 1.0 规范原文（raw 抓取）、Ready Player Me 官方 Docs、MDN。仓库内事实（依赖、工具链、原型代码结构）用 `grep`/读源码核对。**直接抓取被拒、经检索工具快照获得**的页面标「快照」（docs.readyplayer.me、vroid.pixiv.help）；由本轮分析得出而非文档陈述的标「分析」；无法确认的标「**未验证**」。CDN 文件体积为本机 `curl` 实测（2026-09-29，未测 gzip）。 |

**一句话结论**：分维度回答——**「立体的自由」更方便也更自由**：我们手写的球面投影、背面剔除、terminator 淡出、painter 分层（`app.js:295–1106`）在 three.js 里全部变成默认行为（depth buffer + 灯光 + 物体旋转），头发物理（spring bone）、描边（OutlineEffect/OutlinePass）、现成头像管线（VRoid→VRM→three-vrm、RPM）都有一手维护的 API；**「平面的自由」反而变少**：像素级参数剪影 `r(θ)`、crisp 矢量输出、DOM 可检视、零依赖零构建、与 BotHarness 现有 UI/diff 流程的贴合都要付代价（three.js CDN 裸模块实测 ≈720KB，blobatar 是 ~4.4KB gz——ADR-0032 基线）。**结论 = hybrid，不是替换**：2D/blobatar 仍是产品默认；three.js 不做「移植」，做**并列 spike**（`prototype/avatar-three/`，import map + CDN，仍无构建），用一个 tracer bullet 实测观感与 4-up 性能后再决定 3D 是否升级为正式渲染层。**不建议**直接上 VRoid/VRM 成品管线（风格与 BotHarness 观感不匹配，见 §3、§6）。

---

## 1. 现状基线：2D 原型在手写什么（对照锚点）

- **眼睛/头发共用一条「球面→正交投影」管线**：`rotEye`（yaw/pitch/roll 三轴旋转）→ `sphereFrame`（切平面基、depth、保留 foreshortening）→ `eyePoses`（瞳距 16°，depth≤0.03 剔除）—— `prototype/avatar-hair/app.js:295-372`；头发锚点走**完全相同**的 `hairProject`（`app.js:380-386`）。
- **头发 = 球面经线条带的手工投影**：`patchStrands` 在轮廓↔tip 间采样 slerp 点再逐点投影，深度淡出 `fade = clamp(均值 depth / 0.16)`、terminator 处渐隐避免「平线」—— `app.js:796-854`；另有 scalp 底座 `baseCapPath`（862）、ahoge `accentPath`（879）、后脑马尾 `ponytailPath`（917）、发际阴影条 `hairlineShadowPath`（952）、r(θ) 折叠式发型 `hairifyRadii`（984）、鬃毛/发束（1027/1050）。
- **分件词表与参数**：4 片（bangs/sides/back/accent）× 每片 type 预设 `HAIR_TYPES`（1367-1406），`variantCfg.A` 暴露 len/sweep/strands/parting/wave/texture/shadow/sides(both|left|right|off)（1122-1145），rail 控件 builder `range()/stateButtons()/commonControls()`（1255-1356）。
- **绘制 = SVG 字符串重绘 + 手工分层**：`paintAvatar` 直接写 `innerHTML`（1195-1209），back/body(with eye-hole mask)/front 三段层序（1158-1168）就是我们的 painter-order；variant A 是 **4 头像 × 单 rAF tick**（1652-1665），零依赖、双击 `index.html` 即跑（index.html 头注释：`No build, no deps`）。
- **痛点（与任务描述一致，代码可证）**：投影/剔除数学全手写、patch 根部接缝靠 `rootPad`/底座硬凑、terminator 淡出是逐 patch 调出来的公式、没有真遮挡（眼睛是 mask 洞而不是几何）、没有光照、层序靠纪律。

## 2. three.js 对照：哪些「变简单」、哪些「仍然难」

### 2.1 真深度/遮挡 → 变简单（这是 3D 的第一笔红利）

- three.js 的 [`WebGLRenderer`](https://threejs.org/docs/#api/en/renderers/WebGLRenderer) 默认带深度缓冲：前后遮挡、头发盖脸、后发被头挡住，全部自动正确——我们用「back 层 + mask 洞 + front 层」三段结构（`app.js:1158-1168`）模拟的东西变成默认行为。**分析**：唯一要接手的新纪律是**半透明排序**（transparent hair card 需要 depthWrite/renderOrder 控制），即 2D 的 painter-order 问题换了个位置仍在——同类硬约束在 Unity HDRP 官方文档里写死为「每个视角都要背→前排序」（本仓库头发分件调研引：[Unity HDRP hair and fur](https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.4/manual/understand-hair-and-fur.html)）。

### 2.2 头部旋转（转物体而不是重投影每个元素）→ 变简单

- 2D 版每帧把每个点经 `rotEye` 重算一遍；3D 版转一个 head `Group` 的 `rotation`（[`Object3D.rotation`](https://threejs.org/docs/#api/en/core/Object3D)）即可，相机用 [`Camera`](https://threejs.org/docs/#api/en/cameras/Camera)。VRM 管线里视线是**标准化组件**：spec 定义 `lookAt` 为 bone（左右眼骨骼局部旋转）或 expression（MorphTarget/贴图偏移）两型 + rangeMap 输入输出映射（[VRMC_vrm-1.0/lookAt.md](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/lookAt.md)），three-vrm 对应类 [`VRMLookAt`](https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMLookAt) 自带 `target`/`autoUpdate`/`yaw`/`pitch`/`update()`。

### 2.3 光照与 terminator → 变简单，但要主动选择风格

- 官方灯光一整套（[`DirectionalLight`](https://threejs.org/docs/#api/en/lights/DirectionalLight) / [`AmbientLight`](https://threejs.org/docs/#api/en/lights/AmbientLight) / [`HemisphereLight`](https://threejs.org/docs/#api/en/lights/HemisphereLight)，见 [three.js docs 索引 Lights](https://threejs.org/docs/)）；toon 明暗有**官方材质** [`MeshToonMaterial`](https://threejs.org/docs/#api/en/materials/MeshToonMaterial)，其 `gradientMap` 官方注释明确「toon shading 的 gradient map，需 NearestFilter、NoColorSpace」（源码 [src/materials/MeshToonMaterial.js](https://github.com/mrdoob/three.js/blob/dev/src/materials/MeshToonMaterial.js)）。
- **分析**：我们抱怨的「terminator 平线」在 3D 里是**法线×光向的连续函数**——想要柔和过渡就给多档 gradientMap 或用 Lambert，想要硬切线是 1 档 gradientMap。痛点从「手调投影公式」变成「选一档美术风格」，但**默认输出不再是可控的平面色块**（见 §2.7、§5）。

### 2.4 描边/NPR 轮廓 → 官方两条路 + 一套节点材质

- **反向 hull（Unity/二次元常见黑描边）**：官方 [`OutlineEffect`](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/effects/OutlineEffect.js)——源码可见其原理即「BackSide + 沿法线外扩的 ShaderMaterial」（`side: BackSide`、`outlineThickness/outlineColor/outlineAlpha` uniform，可经 `material.userData.outlineParameters` 逐材质覆盖），且文件头注明**仅限 WebGLRenderer，WebGPU 用 `ToonOutlinePassNode`**。
- **后处理边缘检测**：官方 [`OutlinePass`](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/postprocessing/OutlinePass.js)——「A pass for rendering outlines around selected objects」，`visibleEdgeColor`/`hiddenEdgeColor` 双色（选中/被遮挡边）。
- **节点材质（若把「three-nodes」理解为官方 Node/TSL 系统）**：three.js 文档索引含 [`NodeMaterial`](https://threejs.org/docs/)、`MeshToonNodeMaterial`、`ToonOutlinePassNode`、TSL `toonOutlinePass()` 等官方条目（[three.js docs](https://threejs.org/docs/) 索引页直接列出）。**未验证**：若问题指的是第三方 npm 包「three-nodes」，本轮未调研。

### 2.5 Gaze（视线跟随指针）→ 变简单

- 2D 版要维护 `sphereFrame` 基向量来摆胶囊瞳孔（`app.js:317-372`）；3D 版=眼球物体/眼骨旋转，或在 VRM 上设 `lookAt.target`（见 §2.2）。我们的 `followPointer` 目标→yaw/pitch clamp 逻辑（`app.js:1221-1245`）**可 1:1 迁移为「喂给 head/eye 旋转的角度」**。

### 2.6 接缝 → 大体变简单，但不是消失

- 真几何 + depth buffer 后，「根部悬空/穿插」大多不再可见；但**半透明发片之间的排序、发片与头皮交界的 alpha 过渡**仍是三.js里要处理的同类问题（§2.1 的排序引用同样适用）。**分析**：2D 里靠 `rootPad`（`app.js:800`）+ 底座层（862）解决的视觉问题，3D 里对应「几何插进头皮 + AO/shadow」，实现更自然但**没有免费到零工作**。

### 2.7 剪影保真（能否保留我们精确的参数 blob 轮廓）→ **最大的「变难」点**

- 我们的头形是 `r(θ)` 参数曲线（`SHAPES`/`normalizeProfile`，`app.js:46-192`），剪影是**被精确拥有的产物**。3D 中剪影 = 网格与相机投影的交集，只在**正交正视**这个特定机位下可用 [`LatheGeometry`](https://threejs.org/docs/#api/en/geometries/LatheGeometry)/[`ExtrudeGeometry`](https://threejs.org/docs/#api/en/geometries/ExtrudeGeometry) 或自建 BufferGeometry 从同一 `r(θ)` 挤出，从而复刻轮廓；**一旦旋转，剪影完全由网格体块决定，无法再按视图编辑 r(θ)**。**分析**：这是「立体自由」的另一面——我们失去的正是 bloub 系方法（shape morph 随意改）的根。像素级 crisp 矢量边也会变成光栅抗锯齿 + 描边效果（§2.4），不等于 SVG path。

### 2.8 头发技术栈逐项

| 路线                   | three.js 现状（一手）                                                                                                                                                                                                                                                                         | 对我们意味着什么                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Hair cards（发片）     | 无官方生成器，但就是普通 mesh + 贴图；业界口径（本仓库头发调研）：cards/shells 是游戏主流——[Frostbite SIGGRAPH 2019](https://advances.realtimerendering.com/s2019/hair_presentation_final.pdf)                                                                                                | 我们 4 个 patch 的**直接 3D 化**：patchStrands 的经线条带 → 卡片网格，心智模型不变                                |
| 曲线发丝               | 官方 [`TubeGeometry`](https://threejs.org/docs/#api/en/geometries/TubeGeometry) + [`CatmullRomCurve3`](https://threejs.org/docs/#api/en/extras/curves/CatmullRomCurve3)（docs 索引 Extras/Geometries 均在列）                                                                                 | 单根发丝可做，曲线参数化与我们 accent/lock 的二次贝塞尔采样（`app.js:879-945`）同构；**量大时成本未验证**         |
| Shell/fur 层           | 三.js core/examples **无**：`gh search code "fur repo:mrdoob/three.js path:examples/jsm"` 零命中（对照组 `MeshToonMaterial` 查询有命中，方法自证有效）                                                                                                                                        | 要自写（`onBeforeCompile` 或 TSL）——不是免费能力                                                                  |
| Kajiya-Kay / Marschner | 三.js 仓库 **零命中**：`gh search code "Marschner repo:mrdoob/three.js"`、`"Kajiya-Kay repo:mrdoob/three.js"` 均空（同一对照组有效；检索入口 [GitHub code search](https://github.com/search?q=repo%3Amrdoob%2Fthree.js+Marschner&type=code)，需登录）                                         | **没有「维护中的 three.js 官方头发个各向异性模型」**；要光泽发就得自己写 shader 或用第三方（第三方未调研=未验证） |
| 各向异性（PBR）        | [`MeshPhysicalMaterial`](https://threejs.org/docs/#api/en/materials/MeshPhysicalMaterial) 有 `anisotropy`/`anisotropyMap`/`anisotropyRotation`（源码 [src/materials/MeshPhysicalMaterial.js](https://github.com/mrdoob/three.js/blob/dev/src/materials/MeshPhysicalMaterial.js) 约 70-90 行） | 这是**微表面 PBR 各向异性高光，不等于 Kajiya-Kay 头发模型**（分析）——别指望开一个开关就有二次元发丝               |
| 二次元整体渲染         | three-vrm 的 **MToon** 材质（`@pixiv/three-vrm-materials-mtoon`，官方 README 明示含 outline 宽度模式 `MToonMaterialOutlineWidthMode`，并给 WebGPU 用 `MToonNodeMaterial`，需 three r167+）——[README](https://github.com/pixiv/three-vrm/tree/dev/packages/three-vrm-materials-mtoon)          | 「动漫头像」这一档有**可直接用的官方维护实现**，比自己调 MeshToonMaterial 更接近成品                              |

## 3. 现成头像管线与许可（requirement b）

### 3.1 VRoid Studio → VRM → @pixiv/three-vrm

- **VRoid → VRM**：VRoid Help 官方「VRM export feature」页——在 VRoid Studio 做的角色可导出 VRM 文件，格式可选 **VRM0.0 / VRM1.0**，标题与作者必填（快照：[I want to learn more about the VRM export feature](https://vroid.pixiv.help/hc/en-us/articles/15760756822297-I-want-to-learn-more-about-the-VRM-export-feature)；同页日文版见 [VRMエクスポート機能について知りたい](https://vroid.pixiv.help/hc/ja/articles/15760756822297)）。
- **VRM 规范给出什么**（全部 raw 抓取自 [vrm-c/vrm-specification](https://github.com/vrm-c/vrm-specification)）：
  - `lookAt`：bone/expression 两型 + rangeMap（[VRMC_vrm-1.0/lookAt.md](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/lookAt.md)）；
  - `VRMC_springBone`：**头发物理的规范答案**——「procedural animation … intended for use with the appearance of **shaking hair and costumes**」，verlet 积分 + stiffness/dragForce/gravity + sphere/capsule collider（[VRMC_springBone-1.0/README.md](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_springBone-1.0/README.md)）；
  - `meta` 许可内嵌：每个模型带 `licenseUrl`（VRM1.0 固定指向 `https://vrm.dev/licenses/1.0/`）与 `allowExcessivelyViolentUsage` 等许可开关（[VRMC_vrm-1.0/meta.md](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/meta.md)）——**许可是「按模型」的，不是一揽子授权**（分析：拿来即用前要读每只模型的 meta）。
- **three-vrm 组件**（typedoc 模块页直接列出，[API Reference](https://pixiv.github.io/three-vrm/docs/modules/three-vrm)）：`VRM`、`VRMHumanoid`、[`VRMExpressionManager`](https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMExpressionManager)（preset 表含 `blink/blinkLeft/blinkRight/happy/surprised/lookUp/lookDown/lookLeft/lookRight` 等——我们的 4 个 anim state 可映射到 preset 权重）、[`VRMLookAt`](https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMLookAt)、`VRMSpringBoneManager`/`VRMSpringBoneJoint`/`VRMSpringBoneCollider`、`VRMFirstPerson`、`MToonMaterial`。
- **接入方式**：官方 README 给出**import map + jsDelivr CDN** 的免构建用法（`three@0.180.0` + `@pixiv/three-vrm@3`，`GLTFLoader` 注册 `VRMLoaderPlugin`）——[three-vrm README](https://github.com/pixiv/three-vrm/blob/dev/README.md)。许可证 **MIT**（同页 LICENSE 节）。
- **代价（分析）**：VRoid/VRM 给的是**别人做好的发型与角色**，风格是 VRoid 通用二次元人设，不是我们的参数化 blob 头；「每片发型暴露滑杆」这个产品问题在成品管线里不成立（发型=整件资产——本仓库头发分件调研的两档结论，见相邻文档）。体积/加载 **未验证**（未实测 .vrm 样例大小）。

### 3.2 Ready Player Me

- **资产形态**：每只 avatar 是**公开 URL 的 GLB**（`https://models.readyplayer.me/[id].glb`，可加 `?pose=T` 等参数；快照：[How Ready Player Me works](https://docs.readyplayer.me/ready-player-me/what-is-ready-player-me)）。
- **许可**：官方 Docs Licensing & Privacy——**非商用在 CC 4.0 下可用；商用需注册 developer/partner**（快照：[Terms of use](https://docs.readyplayer.me/ready-player-me/support/terms-of-use)）；其 [terms](https://readyplayer.me/terms) 第 14.2/14.3 条亦写明 personal, non-commercial use 授权（经检索快照）。**直接抓取 docs.readyplayer.me 被拒（Transport error），上述条文以检索快照为据。**
- **渲染侧**：RPM 官方 **Visage**（MIT，README 自述「Built with three.js, react-three-fiber, drei, three-stdlib and react」）——[readyplayerme/visage](https://github.com/readyplayerme/visage)。即 RPM 也押在 three.js 生态上（visage 本身是 r3f 组件，**不是**裸 three.js，也没有我们这种参数化头）。
- **风格匹配**：RPM 是写实/卡通混合的「人类 avatar」体系（GLB + 骨架 + 服装），与 BotHarness 的 blob 机器人语言差异大——**分析**：适合「真人感用户头像」，不适合继承本原型的观感问题（LOOK FOR 那些条目）。

### 3.3 许可与维护性小结

| 资产               | 许可（一手）                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| three.js           | MIT，`Copyright © 2010-2026 three.js authors`（[LICENSE](https://github.com/mrdoob/three.js/blob/dev/LICENSE)）                     |
| @pixiv/three-vrm   | MIT（[README](https://github.com/pixiv/three-vrm/blob/dev/README.md) LICENSE 节）                                                   |
| Visage             | MIT（[README](https://github.com/readyplayerme/visage) 徽章+LICENSE 链接）                                                          |
| RPM avatar         | CC 4.0 非商用；商用需注册（[docs](https://docs.readyplayer.me/ready-player-me/support/terms-of-use)，快照）                         |
| VRM 模型           | **按模型内嵌** `licenseUrl`（[meta.md](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/meta.md)） |
| 本仓库现有 2D 头像 | blobatar MIT（ADR-0032；见 `docs/research/2026-09-19-avatar-and-icon-references.md`）                                               |

## 4. 本仓库/原型的落地契合（requirement c）

- **依赖现状：three 不在仓库里**。`grep '"three"|"@react-three|@readyplayerme'` 于全部 `package.json`（root、`apps/*`、`packages/*`，2026-09-29）**零命中**。生产头像栈是 **blobatar + @blobatar/react ^2.7.0**（`packages/client/package.json` dependencies）——即 ADR-0032 的「SVG 字符串生成器、确定性、无网络、~4.4KB gz」路线（`docs/research/2026-09-19-avatar-and-icon-references.md`）。
- **无构建原型怎么吃 three.js：import map + CDN 可行**。`<script type="importmap">` 在 MDN 标注 **Baseline：2023 年 3 月起跨浏览器广泛可用**（[MDN importmap](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap)）；three-vrm 官方 README 就是这个用法（§3.1）——`index.html` 加一段 importmap 即可，**保持 no-build**。**未验证**：现在「双击打开 `index.html`」的 `file://` 场景下，CDN 模块跨源加载是否被浏览器放行——**建议实测；不行就用本地静态服务**（`pnpm dev`/`astro dev` 一类已有链路，或 `python -m http.server`）。
- **体积（本机实测 2026-09-29，未测 gzip）**：`three@0.180.0` `three.module.min.js` **338,908 B** + `three.core.min.js` **381,124 B** ≈ **720KB**（r167+ 拆 core，两文件都会拉）；`@pixiv/three-vrm@3` `three-vrm.module.min.js` **154,699 B**。对照：blobatar 字符串生成器 ~4.4KB gz（2026-09-19 调研）。`three` 的 `exports` 含 `./examples/jsm/*`（addons）与 `./webgpu`、`./tsl`（[cdn.jsdelivr package.json](https://cdn.jsdelivr.net/npm/three@0.180.0/package.json)）。
- **工具链不冲突**：root `package.json` = pnpm 12.4.2 / TS 7 / oxlint / oxfmt / vitest / tsdown（AGENTS.md 与 root package.json 一致）。原型目录本身游离在构建外，加 CDN import map 不触碰任何脚本；若将来**进 `packages/client`**，则要走 tsdown 打包 + `THIRD_PARTY_NOTICES.md` 登记（`packages/client/package.json` `files` 字段）——**分析**：那一步的依赖审查成本远大于原型阶段。
- **WebGL 在 DSH web client 内 = 开放问题**：`grep -ri 'webgl|three'` 于 `docs/`、`GLOSSARY.md`、`CLAUDE.md`、`.agents/skills/`、`.claude/skills/`（2026-09-29）**零命中**——仓库文档没有记录 DSH Web 客户端对 WebGL 的支持/限制，**无法从仓库一手判定，标开放问题**。旁证（非证明）：`packages/client` 已在用 canvas **2D**（`personabot-avatar-crop.tsx` 的 `getContext('2d')` → webp data URL），2D context 可用不等于 WebGL 可用（分析）；CDN（jsdelivr）在 harness 运行环境的可达性同样**未验证**。
- **性能/GPU 成本**：现状是零 GPU context、纯 CPU + SVG 重绘（4 头像 × rAF × `innerHTML`，`app.js:1652-1665`；「4-avatar grid 60fps」为任务给定前提，本轮未复测）。3D 侧的正确姿势是**单 renderer + `setViewport/setScissor` 分格**——官方示例 [webgl_multiple_elements.html](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_multiple_elements.html)（源码 218-219 行 `setViewport`/`setScissor`）；**不要**每格一个 canvas：多 WebGL context 有被浏览器逐个丢弃的风险（MDN：GPU 需求过高时浏览器会丢 context——[isContextLost](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/isContextLost)）。**未验证**：4-up 60fps 在目标机器上的实际帧率/GPU 占用——这正是 spike 要测的第一件事。

## 5. 自由度对照（requirement d）

**变得更自由的**（2D 里做不到或很贵）：

1. **真旋转与背面**：转头看后脑是免费的；后发、马尾、鬃毛有真实体量（我们靠 hemi=-1 半球剔除 + 淡出模拟的「转头才出现」——`app.js:394-408/917-945`——变成真几何行为）。
2. **真光照与遮挡**：terminator 是光与法线的产物；发片互相遮挡、头发遮脸、脸遮后发全部自动。
3. **物理头发**：spring bone 有**规范 + 实现**双重一手（§3.1），我们现在的 sway 是 `sin(t)` 采样近似（`app.js:1082/926`）。
4. **真 3D 发型/建模**：可接外部建模产物（VRoid 导出、GLB），发型复杂度不再受「SVG path 手写」上限约束。
5. **成体系的 NPR 工具**：hull 描边 / 后处理描边 / toon 材质 / 节点材质（§2.4），以及 MToon 成品（§2.8）。
6. **标准表情/视线语义**：VRM preset expression 表 + lookAt 规范，anim state（idle/wink/thinking/burst）有现成词汇可借（§3.1）。

**变得更不自由/更难的**：

1. **像素级平面剪影与 morph**：`r(θ)` 剪影即产品本身（variant B 把发型折进 `hairifyRadii`，`app.js:984-1019`）——3D 里这条路只剩「正视机位近似」（§2.7，分析）。
2. **crisp 矢量观感**：SVG path 边 = 无级清晰；WebGL = 光栅 + AA + 描边近似。
3. **DOM 可检视/可断言**：SVG 层与 `<pre class="state">` 面板可被 DevTools/测试直接读；canvas 内容不可检视，调试句柄 `globalThis.__protoAvatar`（`app.js:2142-2155`）要换成「导出参数/截图」型证据。
4. **零依赖零构建 & 离线**：import map 免构建但仍**引入 CDN 网络依赖与 ~720KB 传输**；离线双击打开的行为改变（§4，含未验证项）。
5. **风格对齐 BotHarness UI 与截图型 PR 证据**：PR 证据流程本身仍可用（`docs/agents/pr-ui-visual-evidence.md` 要求真 UI 截图，canvas 截图同样可截），但**「改一个 path 就能 diff」的文本资产优势消失**（分析）。
6. **可测试性**：`packages/client` devDeps 含 `jsdom`，DOM/SVG 逻辑可在 vitest 里跑；**jsdom 没有 WebGL context**，渲染层必须与参数/几何生成解耦才可单测（分析 + 依赖事实）。
7. **体积/树摇**：CDN 裸用是整包 720KB（§4 实测）；有 bundler 时 tree-shaking 可缓解，但那等于放弃 no-build（分析）。

## 6. 工作量与路线（requirement e）

**可 1:1 或近似迁移的**：

- 参数与预设：`variantCfg.A`（1122-1145）、`HAIR_TYPES`（1367-1400）、`STATES` 的时长/眨眼/构图意图（467-534）、`SHAPES` 的 `r(θ)` 数据（172-192）。
- 控制层 UI：`range()/stateButtons()/commonControls()` 这些**纯 DOM builder**（1255-1356）可原样搬到 rail，绑定目标从「改 cfg → 重绘 SVG」变成「改 cfg → 重建/更新 mesh」。
- gaze 目标数学：`followPointer` 的 yaw/pitch 映射（1221-1245）直接改喂 head rotation。
- 状态切换/blend 的时间轴思想（`blendPose`、entrance morph，538-564/655-662）：作为**参数层**保留，驱动对象换成 mesh 变换/形变。

**必须重建的**：

- 渲染循环与场景：`ProtoEngine.sample → frame → innerHTML`（647-747/1195-1209）→ renderer/scene/camera + 逐帧只改 uniform/geometry。
- 几何生成：`patchStrands/baseCapPath/accentPath/ponytailPath/lockStrokes`（796-1106）从「path 字符串」重写为 BufferGeometry（卡片/管条）。
- 材质系统：SVG fill + `hashNoise` 纹理 + `mixHex` 深度淡出 → `MeshToonMaterial`（+gradientMap）或 MToon；眼睛从 mask 洞变成眼球几何。
- 剪影 morph：radii 插值（`shapeAtTime`，621-628）在 3D 里要么 CPU 重建顶点，要么 morph target——**这是最可能低估的一块**（分析）。

**量级估计（分析，非实测）**：第一片 tracer（单头形、单灯、gaze、一片刘海、单 canvas）≈ **300–600 行新 JS**；追平 2D 原型全部 4 state × 4 片 × rail ≈ 再翻一倍；VRoid/VRM 路线省掉「发型生成」但引入资产风格与许可阅读（§3.1）。

**路线判断**：

- **(i) 直接移植 → 不建议**：投影/剔除/淡出数学整体作废（§2），移植等于用 3D API 重写一遍 2D 心智，两头不讨好。
- **(ii) 并列 spike → 推荐**：与 2D 原型并排、同一 `?variant=` 切换思维（`.agents/skills/prototype/UI.md` 的 switcher 惯例）、import map 免安装，符合仓库 tracer-bullet 实践（AGENTS.md：最小端到端竖切、可运行、拿反馈）。
- **(iii) VRoid/RPM 成品管线 → 暂不推荐**：最快拿到「立体 + 物理 + 表情」，但观感离开 BotHarness blob 语言，且许可按模型/按商用状态（§3），与「用户可定制的参数发型」产品问题错位；可作为 spike 之后的对照组。

**建议的首个 tracer bullet（hybrid 路线的第一片）**：

> 新建 `prototype/avatar-three/`（与 `avatar-hair` 并列，不改 2D 版）：`index.html` + import map（jsdelivr `three@0.180.0`，**零安装、零构建**）；**复用** `avatar-hair/app.js` 的 `SHAPES/normalizeProfile` 数据与 `variantCfg/HAIR_TYPES` 参数层；单 canvas + 单 renderer + `setScissor` 2×2（官方 `webgl_multiple_elements.html` 模式）；一个 `MeshToonMaterial` 头（从 `r(θ)` 挤出的 blob）+ 一盏 `DirectionalLight` + 一片 bangs 发卡；`followPointer` 喂 head rotation；成功判据：① 正视剪影与 2D 版四种头形肉眼一致；② 转头后背发/后脑成立且无穿帮；③ 4-up 60fps（实测记录帧率与 GPU 占用）；④ 人眼评审「观感是否值得继续」。**先证伪/证实风格与性能，再谈建**（如果 file:// 或 harness 内 CDN/WebGL 不通，此片同时解决 §4 的两个开放问题）。

---

## Implications for BotHarness（≤10）

1. **直接回答「更方便和自由吗」**：**对立体维度，是**（遮挡/光照/旋转/物理/现成管线全部从苦力变默认，一手证据见 §2）；**对平面维度，否**（剪影保真、矢量清晰度、DOM 可检视、零依赖、体积都变差，§5）。所以答案不是 yes/no，而是**换了一组自由**。
2. **决策：hybrid，不替换**——blobatar/2D 仍是产品默认头像（ADR-0032 既有结论不动）；three.js 作为**候选 3D 渲染层**走 spike。
3. **不做「移植」**（§6(i)）：2D 的投影数学不搬，搬的只是参数层、gaze 映射与 rail 控件。
4. **第一片按 §6 tracer bullet**：`prototype/avatar-three/`，import map + CDN、单 renderer + scissor 2×2，四个成功判据可人工验收。
5. **spike 必须顺带测掉两个开放问题**：`file://`/CDN 模块加载、DSH web client 内 WebGL 可用性（§4）——这是「能不能进产品」的前置，不是技术爱好。
6. **风格保真用「正视剪影一致」做硬判据**（§2.7）：如果 3D 正视都对不上 2D 的 blob 感，直接判负，不进入功能补齐阶段。
7. **头发第一片只做 hair card**（发卡网格），不上 shell/fur（无官方实现）、不写 Kajiya-Kay（三.js 无维护实现，§2.8）；需要发丝光泽时再评估 TSL 自写或引入 MToon（three-vrm，MIT）。
8. **不引入 VRoid/RPM 资产到主路径**（许可按模型/商用状态、风格错位，§3）；仅当 spike 显示「自建发卡不达标」时，把它作为对照实验。
9. **若 spike 通过再谈进 `packages/client`**：那一步要过 tsdown 打包、THIRD_PARTY_NOTICES、体积评审（720KB vs 4.4KB，§4）与 vitest/jsdom 可测性拆层（§5.6）。
10. **产物留痕**：spike 的 before/after 走 `docs/agents/pr-ui-visual-evidence.md` 的截图证据；结论若推翻或确认本节判断，按仓库惯例补 ADR。

---

### 相邻文档

- `docs/research/2026-09-24-rpg-hair-parts.md`（头发分件/拼接/参数）——本文 §2.8/§3.1 复用其 VRoid 分件词表与「整发预设 vs 分件组装」结论，问题域不同（渲染技术选型 vs 发型结构）。
- `docs/research/2026-09-19-avatar-and-icon-references.md` + **ADR-0032**（blobatar 默认头像、许可与体积基线）——本文 §4/§5 的体积与依赖对照以其为准。
- `docs/research/2026-09-21-anysoul-live2d-runtime.md`、`docs/research/2026-09-21-desktop-pet-and-live2d.md`（Live2D/桌面宠物路线）——若 3D spike 判负，2D/伪 3D 的下一站参照。
