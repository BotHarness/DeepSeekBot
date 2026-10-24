# VRM 面板：公开接口与真实实例教程

本文是[英文实现指南](panel-plugin.md)中公开 Client 接口与 S2 教程的中文说明。已有房间渲染的验证记录不代表这次教程已经完成运行时验证。

## 公开 Client 接口

独立 Plugin 只从 `@botharness/ui/panels` 导入类型，注入应用定义的 `dockPanels`、`botPresentation`，可选注入 `clientHelp`。这些是 BotHarness 的应用契约，不是 DSH 原生 Panel 或 Activity API；Plugin/Fiber 生命周期及 Service 注入仍由 DSH/Cordis 管理。

通过 `dockPanels.register` 注册面板，返回的注销函数交给 `ctx.effect`。`component` 和 `headerAction` 接收相同的 `DockPanelProps`；固定实例额外携带自己的 `botId` 和 `instanceId`。上下文角色只绑定 Bot 私聊，固定角色独立绑定指定 Bot。控件应放在面板原生标题栏，而不是覆盖内容。

在视图挂载时调用 `botPresentation.acquire(botId)`，通过 `getSnapshot` 和 `subscribe` 读取已有展示投影，并在卸载时调用幂等的 `dispose`。不要在 React 渲染期间获取资源，也不要另建 Activity 或设置存储。完整实现见 `packages/vrm-companion/src/client/index.tsx`。

## Help contribution（S1 契约）

从公开入口导入 `ClientHelpService`、`HelpContribution` 和 `HelpGuide`。使用命名空间内唯一的 contribution、topic 和 question ID；英文是回退文案，中文作为对应翻译。通过 `ctx.inject(['clientHelp'], child => …)` 可保持与尚未提供该 Service 的 UI 版本兼容。注册及注销由 Fiber 的 `ctx.effect` 持有。

文字问答独立于面板挂载存在。没有 guide 的问答不展示教程按钮。`clientHelp.show(questionId)` 只打开用户指南并选中答案，不会直接启动教程。

Guide 的 `availability()` 返回 `ready`、需要明确选择的 `select`，或带可读原因的 `unavailable`。`prepare(targetId, signal)` 必须重新校验目标，处理取消，并返回步骤和幂等 `dispose()`。步骤到达时解析功能自己拥有的真实元素；操作步骤用语义状态判断完成，不能把点击本身当作设置成功。

可选的 `HelpGuide.subscribe?(listener): () => void` 用于通知 Help 索引可用性变化。`clientHelp` 按 contribution 持有订阅，并在 contribution 注销时释放。通知只刷新可用性，不注销重注册 contribution，也不替换正在运行的教程；应发布可用性变化，而不是每帧动画更新。

公开 `DockPanelRegistry` **没有 `beginGuide`**。独立 Plugin 不能导入 UI 的私有布局实现来补足它，也不能为了教程擅自打开或最大化面板。需要目标已经可见的教程，应明确要求用户先打开目标。

## 独立真实实例教程（S2）

VRM Plugin 的 **如何切换相机？**（`vrm:change-camera`）是双语实现示例。教程逻辑在 `packages/vrm-companion/src/client/help.ts`，`index.tsx` 负责公开 Service 接入和真实挂载元素注册；原有的“在哪里打开虚拟角色？”仍是文字问答。

1. 在 Bot 私聊中手动打开 VRM 陪伴，或打开一个固定的 VRM 实例，等待场景就绪。教程不会自动打开、调整大小、最大化或固定面板。
2. 打开用户指南 → VRM 陪伴 → **如何切换相机？**。没有符合条件的挂载目标时显示不可用原因；只有一个时就绪；有多个时必须明确选择。同一个 Bot 的多个固定实例也分别列出，标签使用面板标题加从 1 开始的序号，不展示原始实例 ID。序号对应当前符合条件的候选枚举顺序，不是稳定身份，也不保证对应屏幕上的位置；同名标题本身不能证明某个选项对应哪个实际面板。
3. 打开所选角色的**场景**菜单。下一步检查这个角色自有控件的真实 `aria-expanded` 状态，不接受其他角色菜单的点击。
4. 选择**房间视角**；如果该实例起初已经是房间视角，就选择**桌边视角**。教程读取并订阅这个实例原有的 `PanelControls`，只有相机到达要求值且漫游关闭后才可完成。操作其他角色、只打开菜单或点击重置视角，不会完成这一步。退出或完成教程都保留相机修改。

### 实例身份与清理

示例维护的是挂载元素目录，而不是扫描缓存中的 controls。面板内容和标题栏使用 callback ref 登记自有元素，并关联上下文 Channel/Bot 或固定 instance/Bot 身份。每次内容挂载生成新目标 ID，因此同一实例重新挂载也不能复用旧选择。

可用性和 prepare 都校验精确挂载身份、公开 registry 的打开状态、固定实例元数据、内容和 Scene 控件的连接及可见状态，以及场景是否就绪。缓存里残留的 `controls.stage` 不能证明面板仍然挂载。步骤解析并高亮功能自有的标题栏包装元素；其中的场景触发控件通过 `aria-controls` 关联自己的菜单 portal。完成判定读取该控件的 `aria-expanded` 和所选实例的 controls，不借用 shell 私有选择器，也不猜测全局 portal 菜单。

教程订阅公开 registry，每个挂载目标只持有一个 controls 监听器，供可用性通知和当前教程检查共用。可用性通知按序列化结果去重，避免每帧刷新 Help 目录。实例删除、关闭、内容或标题栏卸载、上下文 Channel/Bot 重绑定都会通过公开 `clientHelp.cancel` 结束当前教程。取消与教程 `dispose` 幂等释放运行检查，卸载释放 controls 监听器，不回滚设置。Contribution 注销和晚返回的 prepare 结果仍由现有 `clientHelp` 生命周期处理。挂载目录属于 VRM Plugin 自身的 Fiber，即使可选 Help Service 晚到，也能登记已挂载的目标。

### 验证边界

S1（#2717）已获 Human 验收，PR #2732 尚未合并。2026 年 10 月 24 日的真实 Web 浅色／深色路径已通过：消息内会话面板的发现和布局练习、保存布局相等、输入框与草稿保留、独立 VRM 相机修改、明确实例选择与删除，以及群聊专属成员面板发现。已复现并修复旧目标选择残留问题。跨页面 Plugin 重新启用仍不稳定：一次运行恢复了唯一教程条目且未复活旧教程，但后续运行仅在插件页恢复，原 Bot 模式页未恢复；失败仍未关闭。原生 Desktop、原生缩放与明确 Human 验收分别保留 gate，不代表 S3/S4 已验收。

针对本任务已启动的隔离 Host，运行：

```sh
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json BH_GUIDE_THEME=light node scripts/e2e-panel-guide.mjs
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json BH_GUIDE_THEME=dark node scripts/e2e-panel-guide.mjs
```

`BH_GUIDE_THEME` 默认是 `light`。可选的 `BH_GUIDE_VRM=1` 启用相机路径，需先独立安装 VRM 并准备可见、就绪的目标。`BH_GUIDE_VRM_INSTANCES=1` 增加明确目标选择和删除当前实例。`BH_GUIDE_PLUGIN=1` 从独立的原生插件页停用、重新启用 Plugin，并检查新教程发现；该分支仍有上述恢复失败。`BH_GUIDE_GROUP=1` 需要本任务名为 `S2 guide group` 的合成群组，检查成员面板前置条件。保留每次尝试的证据；脚本存在不代表运行通过。详见[用户指南验证路径](../.agents/skills/verify-deepseekbot/features/user-guide.md)。`pnpm exec vitest run packages/vrm-companion/test/help.test.ts` 和 `pnpm exec tsc --noEmit` 等聚焦源码检查**不是运行时或 Human 验收证据**。
