## Why the change

Explain the user problem in one sentence / 用一句话说明要解决的问题。

Issue / Discussion: write `Closes #N` as plain text when this PR delivers the feature or fixes the bug, even if release or device QA is still pending (open a separate issue for the remaining QA); use `Refs #N` only when part of the issue is still unbuilt. GitHub only closes the issue when the PR merges into `main`: once a stacked PR's parent is in `main`, retarget it to `main` before merging, or close the issue by hand after the work reaches `main` / 做完功能或修好 bug 就写 `Closes #N`（纯文本，不要写在链接里），不必等发版或真机验收，剩余验收另开 issue；只有 issue 还有未实现的部分才用 `Refs #N`。GitHub 只在合进 `main` 时关闭 issue：叠放 PR 等父 PR 进 `main` 后改回 `main` 再合，否则等工作进入 `main` 后手动关。

## Special things to note

- Merge risk: reversibility, blast radius and review focus / 回退方式、影响范围与评审重点。
- Verification: list exact checks and results; distinguish automated tests, runtime, visual evidence and Human QA. State what was not run / 列真实验证及缺口。
- CI test plan: the mode the `plan tests` job chose (affected / full / none). If this PR adds a config file, a test directory or a test that reads repo files, name the `scripts/ci-plan.mjs` rule it updated / 写明 CI 选测模式；新增配置、测试目录或读仓库文件的测试时，写明改了哪条规则。

## Change outline

Show the smallest useful before/after or structural outline / 简明展示变更形状。

For UI or interaction changes, embed sanitized before/after screenshots, or explain the concrete capture blocker and runnable review path / UI 或交互变化附脱敏前后截图，无法捕获时说明阻塞与验收路径。 Publish reviewed images/recordings to Cloudflare R2 with `pnpm evidence:publish`, never Git, LFS or an evidence branch. Use `<img src="https://media.botharness.ai/pr/<source-sha12>/<content-sha256>.png">` with each URL at most 150 characters, then check that the images render ([guide](https://github.com/BotHarness/DeepSeekBot/blob/main/docs/agents/pr-ui-visual-evidence.md#image-reference-format)) / 图片、录屏等评审材料统一上传 R2，不提交 Git；图片 URL 不超过 150 字符，发布后确认图片能显示，校验成功后清理本地临时副本。

For Expo / React Native UI, follow the [system text acceptance matrix](https://github.com/BotHarness/DeepSeekBot/blob/main/apps/mobile/DESIGN.md#system-text-and-large-text-acceptance): record iOS and Android default/intermediate/maximum system font sizes × light/dark, native interactions and matched screenshots; name blocked/unrun cases separately / 手机端 UI 须记录两个平台三档系统字号与浅深色的原生交互及同条件截图，分别说明阻塞与未测项。Source tests and web previews do not qualify native usability / 源码测试与 Web 预览不代表原生可用性通过。

AI assistance is welcome; the submitter must understand and validate the change. Do not include secrets or private data / 欢迎 AI 辅助，提交者负责理解与验证；不附敏感信息。
