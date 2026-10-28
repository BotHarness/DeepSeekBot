---
section: Changed
---

## en

- Anonymous usage statistics now follow one tracking plan: every event is named `category:object_action`, listed in [the tracking plan](docs/telemetry-events.md), and refused by the Host if it is not registered. A new once-a-day `app:active_day_start` counts days a Human actually used DeepSeekBot. The first-entry intro and Marketplace events, which were lost whenever they carried details, now arrive with them.

## zh

- 匿名使用统计改为遵循同一份 tracking plan：所有事件统一命名为 `category:object_action`，列在 [tracking plan](docs/telemetry-events.md) 中，未登记的事件会被 Host 拒绝。新增每天最多一次的 `app:active_day_start`，只统计 Human 真正使用 DeepSeekBot 的日子。首次进入引导和市场事件此前只要带了详情就会丢失，现在会连同详情一起送达。
