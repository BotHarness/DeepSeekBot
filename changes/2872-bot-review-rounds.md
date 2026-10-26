---
section: Fixed
---

## en

- A Bot that sends work back to a colleague with @ wakes it on every round instead of only the first, and Bots in an all-messages Group see and can answer every colleague message, so multi-round reviews and department-style tasks between Bots no longer stall until a Human steps in; the collaboration hop limit is raised from 8 to 32 and only stops runaway loops; when a colleague still cannot be woken, the sending Bot is told and reports where the work stands. Bots also confirm receipt of longer tasks, report progress at milestones and finish with a result or explicit status, then stop once the final deliverable is posted ([#2872](https://github.com/BotHarness/DeepSeekBot/issues/2872)).

## zh

- Bot 用 @ 把工作退回给同事时，每一轮都会唤醒对方，而不只是第一次；「全部消息都唤醒」群里的 Bot 也会收到并可回应同事的每条消息，Bot 之间多轮返工和部门式协作不再停住等人来戳；协作跳数上限从 8 提高到 32，只用于拦截失控循环。若同事仍无法被唤醒，发送方会得到提示并说明当前进展。Bot 处理较长任务时也会先确认收到、在关键节点汇报进度，最后给出结果或明确状态；交付最终成果后自然停下（[#2872](https://github.com/BotHarness/DeepSeekBot/issues/2872)）。
