# #1845 后续 handoff

每段可以直接粘贴给新 session。前四项互相独立，可以并行。第 5 项依赖 #2463 的分块方式；第 6 项是原生改动，建议放在 1、5 做完并复测之后。

**共同背景（每段都已经包含，不用另外贴）**

- **代码起点：** 仓库是 BotHarness/DeepSeekBot。
  - 如果 #2463 已经合并，从最新 main 开始。
  - 如果还没合并，从 #2463 的分支 `claude/project-thread-0gk1bi` 开始，在 PR 里写明依赖 #2463。
- **调研文档：** `/mnt/project-files/1845/ios-streaming-best-practices.md`，在项目共享文件夹里。
- **基线数据：** `/mnt/project-files/1845/xs-max-baseline-2026-10-21.md`。
- **构建规则：** iOS 原生构建和真机/模拟器测试一律走「模拟器测试排队」线程统一排队，不要自己构建。
- **测量脚本：** 在 Vain 的 Mac 上，`/Users/doodlebear/Documents/code/DeepSeekBot-1845/.humanlayer/tasks/1845/xs/`（rec.sh、run1-3.sh、analyze.sh 等）。场景 S1 是流式，S2 是滑 300 条历史，S3 是边流式边滑，各跑 3 次。

---

## 1. #2476 iOS 流式：原生尾部淡入 + 降低提交频率

```
处理 https://github.com/BotHarness/DeepSeekBot/issues/2476（属于 #1845）。

起点：#2463 合并了就从最新 main 开始；没合并就从分支 claude/project-thread-0gk1bi 开始，PR 写明依赖 #2463。#2463 已经让 iOS 流式回复按 Markdown 块渲染，只有末尾块会更新，见 apps/mobile/src/ui/markdown-view.tsx。

要做的事：
1. 只给 iOS 流式的末尾块传 react-native-enriched-markdown 的 streamingAnimation。有表格时再考虑加 streamingConfig={{ tableMode: 'progressive' }}。已经冻结的块不要开，不然测量缓存会失效。
2. 在 iOS 上把回放推文本的频率降到约 12–15 Hz（每 66–80 ms 一次），并对齐 requestAnimationFrame，替换 apps/mobile/src/host/conversation-playback.ts 里的 setTimeout(tick, playbackTiming.frame)（现在是 32 ms）。帧之间的平滑交给原生淡入。Android 不动，除非一起测过。
3. 用户拖动或惯性滚动时再降到约 5–10 Hz（或者末尾块不在屏幕上时暂停）。滚动停下、流式结束时立即补齐，不丢字，最后一次提交不能延迟。为这两种补齐写单元测试。默认频率用真机 A/B 数据定：现在的频率对比 2–3 个候选值。

要注意的风险：库文档建议 streamingAnimation 配 flavor="commonmark"，而我们用的是 github。要确认三点：
- 块切换时淡入不会重复播放；
- 回复结束切回单个文档时不会闪；
- 表格和代码块正常。

背景资料：/mnt/project-files/1845/ios-streaming-best-practices.md 的 ⑤①、2.1、2.2 节，以及对照表第 4 行。

验证：
- 补单元测试：只有末尾块带 streamingAnimation；提交频率受控。
- 跑 apps/mobile 的 vitest、tsc 和 pnpm lint。
- 真机复测：通过「模拟器测试排队」线程申请一个该分支的 Release 包，装到 XS Max 上，用 Mac 上 .humanlayer/tasks/1845/xs/ 里的脚本跑 S1 和 S3 各 3 次，和 28d81b5ea 的基线以及 #2463 的结果对比，结果贴到 #2476。
- 不要自己构建 iOS。
```

## 2. #2477 在 UI 线程贴住底部

```
处理 https://github.com/BotHarness/DeepSeekBot/issues/2477（属于 #1845）。

起点：#2463 合并了就从最新 main 开始；没合并就从分支 claude/project-thread-0gk1bi 开始。

现状：apps/mobile/src/ui/chat/follow-latest.ts 靠一条 JS 链路把列表贴在底部：onContentSizeChange → requestAnimationFrame → scrollToOffset。所以每次流式增长都会晚一帧。

要做的事：
1. 跟随状态下改在 UI 线程贴底：用 Reanimated 的 scrollTo(listRef, 0, bottom, false)，配合 useFrameCallback 或 useAnimatedReaction，内容高度用 measure 拿。
   - conversation-screen.tsx 里的列表已经是 useAnimatedRef<FlatList>。
   - markdown-viewport.ts 已经有在 UI 线程 measure 的先例。
2. 参考 t3code：跟随期间关掉 maintainVisibleContentPosition，用户开始滑动后再打开，保证加载更早的历史时位置不跳。

必须保留 #1873 的行为：
- 流式时往上拖，列表不动；
- 出现带数字的 ↓ 按钮；
- 点按钮回到最新消息；
- LATEST_SLOP 规则不变；
- follow-latest*.test.tsx 全部通过。

背景资料：/mnt/project-files/1845/ios-streaming-best-practices.md 的 2.3、2.4、⑤② 节。

验证：
- 跑单元测试、tsc 和 lint。
- 真机测试通过「模拟器测试排队」线程申请 Release 包：
  - 确认流式时底部不再有晚一帧的跳动；
  - #1873 的三项检查都通过；
  - S1、S3 各跑 3 次，和基线对比。
- 不要自己构建 iOS。
```

## 3. #2478 正在写的末尾块太长时拆小

```
处理 https://github.com/BotHarness/DeepSeekBot/issues/2478（属于 #1845）。

起点：#2463 合并了就从最新 main 开始；没合并就从分支 claude/project-thread-0gk1bi 开始。

现状：#2463 之后 iOS 流式只更新末尾块，但 enriched-markdown 每次更新都会把整个末尾块重新排版。所以长代码块、长列表、长段落越写越慢。

要做的事：
1. 在 apps/mobile/src/ui/markdown-blocks.ts 的 createMarkdownBlocks 里，流式状态下末尾块超过约 1–2k 字符时，在安全的边界切开：
   - 段落按行切；
   - 列表按条目切；
   - 围栏代码块按行切成连续的几段代码，看起来要连在一起。
2. 回复结束后照旧渲染。
3. Android 的 markdown-view.android.tsx 也用这个切分器，不能退化。

背景资料：/mnt/project-files/1845/ios-streaming-best-practices.md 的 ⑤③ 节。

验证：
- 单元测试：
  - 长的流式代码块或列表会被切成稳定的冻结块加一个短的末尾块；
  - 拼回去的文本完全不变。
- 在浅色和深色下截图，确认代码块和列表没有接缝。
- 真机上用一条带长代码块的回复跑 S1：通过「模拟器测试排队」线程申请 Release 包，确认每次更新的主线程成本不再随长度增长。
```

## 4. #2479 解锁 ProMotion，并在 120Hz 设备上测

```
处理 https://github.com/BotHarness/DeepSeekBot/issues/2479（属于 #1845，目标是正式包在用户手机上流式和滑动都达到 120 FPS）。

要做的事：
1. 通过 Expo 配置（apps/mobile 的 app.json 或 app.config.js）在 iOS Info.plist 里加上 CADisableMinimumFrameDurationOnPhone = true。
   - 没有这个键，iPhone 上的 CADisplayLink 和 Core Animation 动画最高只有 60Hz，ProMotion 机型也一样。
   - 这是原生改动，要重新构建，必须通过「模拟器测试排队」线程排队。
2. 在 ProMotion 真机上跑 #1845 的三个场景，S1、S2、S3 各 3 次，用 xctrace 的 Hitches 和 Core Animation FPS。真机可以是 iPhone 13 Pro 及以后的 Pro 机型，或者 iPhone 17 / Air。
   - 我们现在的 XS Max 是 60Hz，不能用来验证 120 FPS。
   - 如果没有这样的设备，在 #2479 上写明这个阻碍，并问 Vain 能不能借到一台。

背景资料：
- /mnt/project-files/1845/ios-streaming-best-practices.md 的摘要和对照表第 15 行；
- Apple 文档「Optimizing ProMotion refresh rates for iPhone 13 Pro and iPad Pro」。

验证：
- 构建出来的 Info.plist 里有这个键；
- 滑动时 FPS 接近 120；
- 按 8.3 ms 预算出结果表，贴到 #1845。
```

## 5. #2480 iOS 共用安卓的纯段落快速路径和屏幕外块窗口化

```
处理 https://github.com/BotHarness/DeepSeekBot/issues/2480（属于 #1845）。

起点：#2463 合并了就从最新 main 开始；没合并就从分支 claude/project-thread-0gk1bi 开始，PR 写明依赖 #2463。#2463 已经让 iOS 每个块用一个 memo 的 EnrichedMarkdownText 渲染，流式时只更新末尾块。

要做的事：把安卓已有的两项优化共享到 iOS。
- 纯段落快速路径：textMarkdownSupported 判断为简单的块，用 markdown-text.tsx 的 MarkdownText（RN 原生 Text）渲染，只有表格、代码块这类才交给 EnrichedMarkdownText。
- 屏幕外完成块的窗口化：markdown-window.ts 加 markdown-viewport.ts。

安卓参考实现：apps/mobile/src/ui/markdown-view.android.tsx，对应 PR #2133、#2191、#2278。

要求：
- 共用这些模块，不要复制一份。
- 确认 iOS 也复用块的解析结果，和 #2191 一样。
- 遵守 apps/mobile/AGENTS.md 和 DESIGN.md：不写字面量样式值，要加 changes 片段。
- 按 docs/agents/agent-work-trace.md 先在 issue 上认领。

验证：
- 跑单元测试、tsc 和 pnpm lint。
- 这是纯 JS 改动。真机验证通过「模拟器测试排队」线程申请 XS Max Release 包，不要自己构建 iOS。
- 用 #1845 的脚本跑 S1 和 S3 各 3 次，和 #2463 的包对比。报告：hitch ratio、超过 8.3 ms 和 16.7 ms 的 hitch 数、FPS、JS 线程和主线程 ≤8.3 ms 的帧占比。
- 附流式结束前后的截图，确认没有可见的间距跳动。
- 开 draft PR，引用 #1845 和 #2463。
```

## 6. #2482 enriched-markdown iOS 改为末尾追加，不再整段替换（原生改动）

```
处理 https://github.com/BotHarness/DeepSeekBot/issues/2482（属于 #1845）。

现状：react-native-enriched-markdown 1.1.1 的 iOS 代码在每次更新时都做同样的事：
- EnrichedMarkdownText.mm 的 renderMarkdownContent 把整段 markdown 重新解析、渲染；
- 在主线程整段赋值 _textView.attributedText；
- 同步调用 measureSize。

所以每次更新的成本随末尾块长度线性增长。flavor="github" 走的 EnrichedMarkdown.mm segments 路径也要一起检查。

要做的事：
1. 用 pnpm patchedDependencies 在本地打 patch。当新 markdown 只是在旧内容末尾追加、已渲染的前缀没变时：
   - 把新增部分追加到 text storage，不再替换整个 attributedText；
   - 这条路径上把同步测量推迟到下一次布局。
2. 参考 Apple Tech Talk 10856（commit 阶段的 hitch），以及 /mnt/project-files/1845/ios-streaming-best-practices.md 的 1.2 节和 2.1 节。

注意：
- 这是原生改动，dev client 必须重新构建，在 PR 里写明。
- 真机 Release 包只能通过「模拟器测试排队」线程合批，不要自己构建。

验证：
- XS Max Release，S1 和 S3 各 3 次，和没有 patch 的包对比。
- 流式结束时截图对比，渲染结果一致。
- 文本选择、链接和无障碍标签不受影响。
- 如果收益明显，准备向上游 software-mansion-labs/react-native-enriched-markdown 提 PR。
- 按 docs/agents/agent-work-trace.md 认领；开 draft PR，引用 #1845 和 #2463。
```
