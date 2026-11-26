---
section: Added
---

## en

- Session rows now carry one shared status, `running`, `needs-you` or `idle`, for Bot and native Sessions. A Session needs you when it waits for an approval or an answer, or its last turn failed. The Host Owner's native Session requests can join Activity and push with `deepseekbot activity --source all`. The `nativeSessionAttention` setting (on by default) turns them off ([#4937](https://github.com/BotHarness/DeepSeekBot/issues/4937)).

## zh

- 会话列表的每一行现在都有统一的状态：`running`、`needs-you` 或 `idle`，Bot 会话和原生会话都适用。会话在等待审批或回答，或上一轮失败时，状态为「需要你」。Host Owner 的原生会话请求可以通过 `deepseekbot activity --source all` 进入「活动」和推送；设置项 `nativeSessionAttention`（默认开启）可以关闭它们（[#4937](https://github.com/BotHarness/DeepSeekBot/issues/4937)）。
