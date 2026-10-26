---
section: Added
---

## en

- Prompt Presets: you can rewrite the behavior text of a Bot's system prompt and per-turn templates, such as how it reports progress or answers a Group mention, as named presets. Choose one preset for every Bot, and let a Bot use another preset or its own edits on top. Tool and delivery rules stay fixed. A Bot picks up a change at its next Session or compaction. Available as `deepseekbot prompt-presets`, `prompt-preset-create`, `bot-prompt` and related commands.
- Settings → Models & execution can change when every Bot's context is compacted automatically: the share of the context window and the tokens kept free. Also available as `deepseekbot compaction-threshold-set`.

## zh

- Prompt Preset：可以把 Bot 的 System Prompt 和每轮模板里的行为文字（比如怎样汇报进度、怎样回应 Group 里的 @）改写成具名预设。可以给所有 Bot 选一个全局预设，再让某个 Bot 叠加另一个预设或自己的改动。工具和投递规则保持不变。改动在 Bot 的下一个会话或下一次压缩时生效。也可通过 `deepseekbot prompt-presets`、`prompt-preset-create`、`bot-prompt` 等命令使用。
- “设置 → 模型与运行”可以调整所有 Bot 自动压缩上下文的时机：占上下文窗口的比例，以及预留的 token 余量。也可通过 `deepseekbot compaction-threshold-set` 设置。
