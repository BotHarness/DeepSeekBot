# 可编辑 SVG Avatar：本地 /to-spec handoff

日期：2026-10-03。Human 已在 Q20 确认完整设计；本交接用于本地 `/to-spec`，不是已发布的 spec，不授权功能实现或合并。

## 本地入口与权威

先读取仓库 `AGENTS.md`、`.agents/skills/to-spec/SKILL.md`（缺失时查可用个人 skills）、[CONTEXT](../../GLOSSARY.md)／[中文 CONTEXT](../../GLOSSARY.zh.md)、[living architecture](../architecture/botharness-architecture.md) §5.2；DSH 计划进入 `dsh-plugin-dev` Context → Decision Tree。

规范结果是 [Accepted ADR-0118](../adr/0118-editable-avatar-appearance-is-independent-of-activity.md)，选择与事实依据见 [完整访谈](2026-10-03-svg-avatar-design-exploration.md)。ADR 原草稿用 0101，随后改为 0116；与已合入的 Daily Browser ADR 编号冲突，集成时重新编号为 0118。继续前检查新的编号竞争。

[issue #743](https://github.com/BotHarness/BotHarness/issues/743) 只追踪设计文档，不是完整功能 spec。#120、#58 是已完成的活动／图片头像基础，不重开它们。继续时查 feature:avatar 的现存 spec/hub，避免重复发布。

## 已确认的首版范围

- 两个原创家族：Notion Faces 启发的人物插画，Grokbot／ChatGPT Dots 启发的抽象小角色；简洁插画／轻体积即可，无绒毛要求。参考不等于图稿复用许可或技术协议。
- 受控 SVG 预设组合、自由配色、细分前／后／侧发和五官几何；位置、大小、间距、倾斜、发长、弯曲等丰富但有界的参数。最终希望上传 SVG 部件，首版不开放；没有自由绘制／path 控制点编辑。
- 家族内组合；少量配件明确适配后共享。抽象家族暴露适合自身的形体参数。部件数量、原画与参数范围由验证决定。
- 脸部、视线和整体姿态，首版不要求手势／全身；共用真实工作语义与过渡规则，各家族适配自己的几何动作。
- 抽象角色可短暂大幅变成点阵／符号；配件可暂隐藏，保存外形不变，稳定姿态恢复完整造型。点阵主要是短过渡，不持续替代工作阶段的角色本体。
- 侧栏辨认与放大表现同等重要，分别验收；小头像动作更短、更克制，大图更丰富。
- 真实工作动作与独立“需要你”提示并存；首切片先执行与 attention，完成／错误动作随后另定结果作用域和事实来源。
- 保存有版本配方＋派生静态快照；缺兼容部件／rig 版本保留配方、展示同外形快照，说明暂不可编辑／播放角色动画，外层真实活动提示仍可用。

## spec 必须保留的边界

**外形权威**：PersonaBot owning module／Registry，经现有 Host→Typert/API Gateway→Client seam 读写；编辑 local draft 即时预览，Save/Cancel 明确，Host 验证后原子保存。当前 Registry 为 `bot.json`，ADR-0041 是数据库目标。快照绑定 recipe revision，复用现有有界 raster 预算和轻量读取/缓存；精确 schema 和迁移尚待设计。

**瞬时呈现**：Client renderer 管姿态、过渡时间和有界粒子，不逐帧 RPC／SessionEvent／React 整树更新。优先验证现有 React Client 的受控 inline SVG、稳定节点、普通 transform/opacity 和必要的姿态采样；没有选新动画库。不强求万能 rig，不承诺任意路径 morph。快速切换从当前显示姿态续接，粒子固定容量／稳定身份。

**安全与退化**：输入为稳定部件 ID、有界数字和合法颜色，SVG defs 按实例隔离；未来上传另定格式子集、兼容与资源预算，现有图片 validator 拒绝 SVG。复用统一 motion policy，reduce／hidden／不可见／卸载正确停动和释放；断连表达 freshness，不伪造 idle／成功／失败。

**分享**：本地 Save 不自动 Git commit 或发布。#17 显式准备 sharing 时将选定 presentation／配方／资产或快照提交到 Memory Git；新 identity import 保持已分享外形，git pull 不自动覆盖本地偏好。#76 是保持身份的 Profile Backup/Restore/Transfer。新 recipe round trip 仍需验证。

## 依赖刷新与 test seam

本轮 baseline：`main@c3349cdcb82f9f57ae29fcbd72e3e7e88247ab11`，2026-10-03 07:04:25Z。继续时刷新最新代码、issues、PR 和 claims：

- [#737](https://github.com/BotHarness/BotHarness/pull/737) 已合并，Overview execution 与 Human action 分开。
- [#740](https://github.com/BotHarness/BotHarness/pull/740) 本轮仍 OPEN，由 [#123 owner](https://github.com/BotHarness/BotHarness/issues/123#issuecomment-5966444126) 推进 native tool approval attention；`approvalCount` 是进行中提案，不是全部 attention 已交付。
- questions、其余 attention axes、explicit waiting-on-Assignment 仍属 #123 后续。等待 Assignment 暂无 declared Host 来源，不从模型文字／approval／后台活动推断，不接管其他 owner 的共享合同。
- 对照 [#124](https://github.com/BotHarness/BotHarness/issues/124) Group activity、[#130](https://github.com/BotHarness/BotHarness/issues/130) Live2D hub、#17/#76，避免重复承接它们的范围。

建议采用一个现有高层行为 seam：Profile 编辑／保存 → Registry → bridge 重读 → Roster／大图同一外形 → 实际 Tool activity 经共享 Projection 驱动动作 → 重连／重启恢复；首切片的独立 attention 只接 #123 owner 已交付的 owning contract，尚不可用时保留明确依赖。先一个家族验证执行与 attention 并存、完成生产纵向切片并获 Human 验收，再复用到第二家族；**两个家族、细分编辑、短点阵过渡、版本回退都在首版**，顺序不能缩减总目标。

测试关注外部行为：Save/Cancel 与恢复、非法/冲突参数拒绝、极值组合可动、两家族 small/large、多实例 ID、快速切换连续性与粒子容量、reduce/hidden/断连/释放、缺版本保外形、recipe round trip 和导入安全；读取现有 Registry/bridge/activity/Avatar tests 作为 prior art。在真实浏览器量帧时间、内存、资产及 bundle 增量；1／8／32 个可见活动头像只是初始测量梯度，没有已验证性能预算。

`/to-spec` 要求先向 Human 核对 test seams；只核对上述 seam 与验收方式，不重复 Q1–Q20 产品访谈。再按模板合成并发布 GitHub spec；Implementation Decisions 不写具体路径／实现片段，按 repo 流程先查重。开放上传、自由绘制、全身、绒毛、Live2D、完整分享／备份管线不在首切片，本 handoff 不提前发布 spec 或开实现 tickets。

## 可粘贴到本地 Session

```text
/to-spec
请基于本分支 docs/research/2026-10-03-svg-avatar-to-spec-handoff.md、Accepted ADR-0118 与完整访谈，合成 PersonaBot 可编辑 SVG Avatar spec。
Q1–Q20 已由我确认，不重复产品采访；按 to-spec 先核对高层 test seam。
读取 AGENTS.md、CONTEXT、dsh-plugin-dev Context/Decision Tree，刷新 main 与 #123/#740 owner 进展，不接管共享 attention，不推断 waiting-on-Assignment。
保留两个首版家族、细分发件/五官参数编辑、短点阵/符号变形、版本配方与静态回退；查重后按技能模板发布 spec，暂不实现或合并。
```
