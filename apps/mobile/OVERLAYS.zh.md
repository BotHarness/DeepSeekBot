# 移动端弹层规范

Android Activity 筛选使用标准、非模态 Material 侧边面板（#3146）。标题和关闭按钮固定，选项列表单独滚动，头部与正文使用同一表面色。面板没有遮罩或读屏焦点限制，背景页面和底部导航仍可操作。列表为浮动底栏留足空间，最后一个选项与重置均需可达。内容区左滑打开；仅在 Activity 当前可见时，系统返回在收起键盘后关闭面板。关闭后保留筛选值和滚动位置。

这是与 [英文规范](./OVERLAYS.md) 对应的中文规则摘要。规范覆盖 sheet、全屏 modal、dialog/alert、菜单、popover 和侧边 Host drawer；它是目标契约，不代表现有页面已经全部达标。调研日期：2026-10-18。

## 统一结构

```text
底部 sheet
├─ handle：固定在顶部，真实支持拖动，只出现一次
├─ header：固定标题，按任务放置返回、关闭或保存
├─ body：内容独立滚动，含加载、空态与错误
└─ 可选操作区：确实需要提交时才出现
```

同一个弹层使用连续背景。子页面在同一个导航栈里推进，保留同一个 handle；返回只退一级，关闭才退出整个弹层。不要重复标题、重复安全区，也不要把标题和唯一关闭入口放进长列表里滚走。

## 按用途选择

| 类型                     | 标题与操作                                      | 关闭后的结果                                       |
| ------------------------ | ----------------------------------------------- | -------------------------------------------------- |
| 即时设置、筛选、多选     | handle → 标题 → 选项；没有右上角 Down/Done/Save | 已完成的修改保留，不再等关闭时保存                 |
| 单值选择，如模型选择器   | 当前任务标题；子页有返回                        | 成功提交后可返回；失败留在原处提示                 |
| 编辑预设、例程、外观     | 取消／标题／保存或创建                          | 草稿只有显式提交才保存；所有退出路径保护未保存内容 |
| 放大消息编辑器           | 明确返回草稿与发送的区别                        | 关闭把草稿交回输入框；只有发送才发送               |
| 全屏相机、媒体、远程操作 | 明确关闭或结束操作；没有 sheet handle           | 按任务定义结束行为                                 |
| 确认框、警告框           | 简短明确的问题与动作名，例如取消／解除配对      | 取消、遮罩或 Back 不能执行危险动作                 |
| More/Create 菜单         | 就近展示命令，不套 sheet 标题区或 Done          | 选择执行命令或进入流程；外部点击关闭               |
| 宽屏 popover             | 指向触发控件；窄屏适配 sheet                    | 按选择方式关闭，不静默丢弃编辑                     |
| Computers 侧边抽屉       | 标题 → Host 列表 → 固定底部入口                 | 横向关闭；不加底部 sheet 的 handle                 |

## iOS 与 Android

- **iOS**：优先原生 sheet、导航标题和手势。即时设置根页不放右上角 Down/Done；Settings 以原生 `formSheet` 呈现，系统抓手只负责调整高度，所以根页 `SheetHeader` 左侧放 Close；Android 的固定 handle 本身就是 Close，根页不再重复 X。编辑根页左侧 Cancel、右侧 Save/Create；子页左侧 Back。不要同时堆 Back、Cancel、Done。
- **Android**：保留近期 Material/OCAT 风格、固定可访问 handle、内容优先滚动、键盘避让与系统 Back。Back 依次由键盘、子页面、弹层处理；预测返回动画须单独验证。菜单与确认框沿用统一适配器，#2109 未合并前不能算已落地。
- **两端一致的是语义**：关闭、返回、保存各司其职；外观、标题对齐和系统手势遵循各自平台。iOS 标题优先原生居中，Android 延续左对齐标题。大字时操作仍可达，长标题不能挤掉按钮。
- **handle 不能只是装饰**：有它就应能完成对应拖动行为。原生 handle 已存在时不再画第二个。全屏 modal、alert 和菜单不因“都是弹层”而统一加 handle。
- **下滑关闭不等于取消设置**：即时设置的写入由现有持久化入口负责，失败需可见和可重试；编辑草稿则必须拦截下滑、Back、取消等所有退出路径，提供继续编辑和放弃，必要时提供保存。
- **无障碍不能依赖手势猜测**：长 Settings 页必须有可操作的非拖动关闭：Android 是固定 handle，iOS 是根页左侧 Close，二者都支持无障碍激活／escape；子页 Back 仍只返回上一层。其他弹层省略独立按钮必须验证可访问的非拖动退出方式。检查焦点进入、返回、VoiceOver/TalkBack 和减少动态效果。

## Apple 官方依据与我们的选择

Apple 要求可调整高度的 sheet 使用 grabber，支持竖向关闭，并保护未保存内容。2026 年更新还明确了 Cancel/Close、Done、Back 的位置与含义。这并不表示每一种 modal 都必须有 handle，也不表示可以去掉所有退出入口。[Apple Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets) · [Modality](https://developer.apple.com/design/human-interface-guidelines/modality)

我们进一步规定：可下滑关闭的底部 sheet 使用一致的 handle → header → body；即时设置不使用表示提交的 Done；长 Settings 页把明确的 Close 入口整合到可点击 handle。这是产品规范，而非声称 Apple 强制所有应用使用同一模板。

Android 对照：[Bottom sheets](https://developer.android.com/develop/ui/compose/components/bottom-sheets-partial) · [Dialogs](https://developer.android.com/develop/ui/compose/components/dialog)。其他 Apple 类型的官方来源与完整验收矩阵见英文规范。

## 现状、落地顺序与验收

已筛查最近 70 个 PR，并重点检查 #2025、#2031、#2040、#2073、#2078、#2007、#1966、#2109。前七项已合并，#2109 在本次审计时仍开放。历史 Android 证据不能替代 iOS 回归。

初审发现 Settings 标题和 Done 在滚动内容中，iOS modal 兼容方案也缺少 handle。#2112 已把标题移到固定导航栏。之后 Settings 与配对在 iOS 上改回 `formSheet` 和系统抓手，每页共用 `SheetHeader`（不透明 sheet 底色、单行标题、根页 Close／子页 Back）；嵌套 formSheet 不出现空白仍是原生验收项。子页返回键保持原语义；读屏真实焦点与手势仍需单独验收。通用 Sheet 等其余弹层仍按后续切片迁移。原生结果和未测项见 PR 证据，不把单页通过等同于所有弹层达标。

首个落地切片：Settings → Notifications → 返回 → 关闭/下滑，验证一个 handle、一个标题区、独立滚动、设置保留和无空白。随后选一个即时选择器和一个显式保存编辑器，通过共用组件验证，再迁移其余页面；Android 对话框与 #2109 协调。

每类都检查默认／中间／最大字号、浅深色、中英文、横竖屏、真实键盘、最后一项可达、返回与所有关闭方式、保存失败／重试、重开后状态以及读屏操作。精确记录源码与 native binary；Simulator、实体 iPhone、Android、构建成功与真实运行结果分开记录。当前中文方格字、尚未运行的原生矩阵和 Human QA 均不得标为通过。保持 PR 未合并。
