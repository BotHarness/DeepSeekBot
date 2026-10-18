# Contributing to DeepSeekBot

English | [中文](CONTRIBUTING.zh.md)

Thanks for helping! Documentation, translations, answers, reproducible reports, testing, examples and code all count. You do not need to understand the whole architecture to start.

## Choose an entry point

| Your goal                                        | Where to start                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Installation, configuration or usage help        | [Q&A](https://github.com/BotHarness/DeepSeekBot/discussions/categories/q-a)                                   |
| Explore a feature or workflow pain point         | [Ideas](https://github.com/BotHarness/DeepSeekBot/discussions/categories/ideas)                               |
| Share a Bot, integration, tutorial or experiment | [Show and tell](https://github.com/BotHarness/DeepSeekBot/discussions/categories/show-and-tell)               |
| Report a reproducible bug                        | [Open an issue](https://github.com/BotHarness/DeepSeekBot/issues/new/choose); no discussion is required first |
| Find a first contribution                        | [Contribution discussion](https://github.com/BotHarness/DeepSeekBot/discussions/1398)                         |

Chinese and English are welcome. Support and review are asynchronous and best-effort, with no guaranteed response time. Follow the [community conduct policy](CODE_OF_CONDUCT.md).

## Start small

1. Browse [good first issue](https://github.com/BotHarness/DeepSeekBot/labels/good%20first%20issue) and [help wanted](https://github.com/BotHarness/DeepSeekBot/labels/help%20wanted), or tell us your interests in the contribution discussion.
2. Read recent comments, work claims and linked PRs. Labels do not mean a task is unclaimed; coordinate before duplicating work.
3. Comment with the small scope you want to take on. Discuss large features first; tiny documentation corrections can go directly to a PR.
4. Submit one focused change with a practical verification path. Maintainers can help refine scope during review.

`good first issue` describes newcomer suitability; `help wanted` invites help. `ready-for-agent` and `ready-for-human` describe execution readiness, not difficulty or ownership.

## Useful issues

Search existing issues and discussions. For bugs, include versions, environment, reproduction steps, expected and actual behavior, and sanitized evidence. You need not diagnose source code first; explain any reproduction blocker. For ideas, describe the user problem and current workaround. Once work is scoped, link its discussion, issue and PR rather than keeping duplicate task state.

### A sanitized example

The following is illustrative only; it is not an observed DeepSeekBot bug:

```text
Environment: [OS / application version / relevant configuration]
Steps to reproduce:
1. [Action 1]
2. [Action 2]
Expected: [Expected result]
Actual: [Observed result]
Sanitized evidence: [Redacted screenshot or log excerpt, if available]
```

Replace the placeholders with details you can safely share. Remove API keys, tokens, login URLs, personal information and private conversation content from screenshots or logs. You do not need to diagnose the source code before reporting a reproducible bug.

## Local development

Use the current toolchain and commands in [AGENTS.md](AGENTS.md#commands), the [README development entry](README.en.md#docs) and the [isolated local instance guide](docs/client-bridge.md#7-本地开发环路dsh-020-rc1), currently in Chinese. Use an isolated Profile, keep credentials machine-local, and leave other contributors' running instances alone.

Start with relevant checks, then broaden as appropriate. Record exact commands and results, including blocked or unrun checks. Avoid unrelated refactors and generated-file edits. Consult [product vocabulary](CONTEXT.md) and [architecture](docs/architecture/botharness-architecture.md) when your change needs those boundaries.

### Expo / React Native app contributions

Read the [mobile agent guide](apps/mobile/AGENTS.md) and the [system text and large-text contract](apps/mobile/DESIGN.md#system-text-and-large-text-acceptance) before changing mobile UI.

- Follow iOS semantic Dynamic Type and Android native font scaling through the shared primitives. Adapt wrapping, row height, metadata, sheets and editing space; do not hide layout defects by disabling scaling, shrinking text or imposing a global cap. Essential content and actions must remain usable with the keyboard open.
- Check the affected flow at default, intermediate enlarged and maximum system font sizes, in light and dark appearance, on each platform. Use actual system settings and exercise the controls, live draft/query retention and real outcomes. Record exact categories/percentages and any blocked/unrun cases; one platform's results do not qualify the other.
- Submit native QA through the [shared device queue](docs/agents/device-qa.md). Add matched, sanitized native before/after images to the PR and verify they load. Source tests, web previews, native interactions and Human acceptance are separate evidence. See the contract for the per-surface matrix and screenshot requirements.

## PRs and review

- Keep one coherent scope. Link the issue and discussion when applicable; use `Closes #...` only for complete work and `Refs #...` for partial work.
- Explain why and how to verify the change. List actual checks and remaining gaps in the PR template.
- For visible UI or interaction changes, provide sanitized, GitHub-rendered before/after screenshots, or a concrete capture blocker and runnable review path. Follow [visual evidence guidance](docs/agents/pr-ui-visual-evidence.md).
- Follow the [Release Ledger guide](docs/agents/changelog.md) for user-visible or independently valuable public documentation changes; keep required bilingual parity.
- AI assistance is welcome, but the submitter remains responsible for understanding and validating the change. Coding agents follow the existing [issue work trace](docs/agents/agent-work-trace.md).
- Automated checks, runtime verification, visual evidence and Human QA are separate. Maintainers own review and merge; submitting a PR does not authorize merging or deployment.

## Ongoing participation and privacy

Answering questions, confirming bugs, testing fixes and reviewing documentation are useful next steps. Tell maintainers which area you would like to help with. Scoped maintenance roles require agreement; participation does not automatically grant merge, release or production access.

Do not post keys, login URLs, private chats, unredacted logs or sensitive vulnerability details publicly. No private reporting channel is currently published. Request a private contact route without sensitive details and wait for confirmation. This guide does not enable private vulnerability reporting or make a public thread confidential.
