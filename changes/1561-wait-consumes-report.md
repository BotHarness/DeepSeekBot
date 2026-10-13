---
section: Fixed
---

## en

- When the Orchestrator gets an Assignment report through `wait_for_assignment`, that report and its lifecycle notices now belong to the current turn. The Orchestrator can accept and resolve them there, and no separate report turn follows ([#1561](https://github.com/BotHarness/DeepSeekBot/issues/1561)).

## zh

- Orchestrator 通过 `wait_for_assignment` 拿到 Assignment 报告后，这份报告和它的生命周期通知现在归入当前回合。Orchestrator 可以在这一轮里验收并 resolve，之后不会再多跑一轮报告回合（[#1561](https://github.com/BotHarness/DeepSeekBot/issues/1561)）。
