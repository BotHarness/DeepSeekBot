---
section: Changed
---

## en

- `profile-backup-preview` no longer prints its export confirmation. Pass `--out <new file>` to save the reviewed preview privately, then export with `profile-backup-export --confirmation-file <that file> --out <backup>`; piping the saved file with `--confirmation-stdin` still works. When Tob backs up the environment for you, the confirmation stays out of its replies, approval cards and Session log ([#4835](https://github.com/BotHarness/DeepSeekBot/issues/4835)).

## zh

- `profile-backup-preview` 不再输出导出确认凭据。用 `--out <新文件>` 私密保存审阅过的预览，再用 `profile-backup-export --confirmation-file <该文件> --out <备份>` 导出；用 `--confirmation-stdin` 传入该文件仍然可用。让 Tob 帮你备份环境时，确认凭据不会出现在它的回复、审批卡片和 Session 日志中（[#4835](https://github.com/BotHarness/DeepSeekBot/issues/4835)）。
