---
section: Changed
---

## en

- Bot mode now uses a smaller, stricter visual scale. Text comes in three sizes (12, 13 and 14px) at two weights, so headings that were 15–24px or bold become 14px medium; corners follow the DSH radius scale, so most controls and cards round a little more; and cards, chips and code blocks that already have their own fill lose their outline, while separators inside a surface use the lighter divider colour. Elsewhere the change is mostly internal: every plugin stylesheet, including the Computer and Browser settings, reads its spacing, type, radius, edges and colour from the shared design tokens, a few gaps and paddings move by up to 2px, and unused legacy styles and per-feature token tables are gone ([#1603](https://github.com/BotHarness/DeepSeekBot/issues/1603)).

## zh

- Bot 模式改用更小、更统一的视觉刻度。文字只保留三种字号（12、13、14px）和两种字重，原本 15–24px 或粗体的标题改为 14px 中等字重；圆角改按 DSH 的圆角刻度，多数控件和卡片会更圆一些；自带底色的卡片、标签和代码块去掉描边，界面内部的分隔线改用更浅的分隔色。其余改动以内部整理为主：所有插件样式表（包括 Computer 和 Browser 设置）都从共享设计令牌取间距、字号、圆角、描边和颜色，少量间距和内边距调整至多 2px，不再使用的旧样式和各功能自带的令牌表已移除（[#1603](https://github.com/BotHarness/DeepSeekBot/issues/1603)）。
