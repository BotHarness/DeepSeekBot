---
section: Added
---

## en

- Report a problem from the diagnostic log window: describe it, paste, drop or pick screenshots and files (up to 25 MB), and Tobs packs them with the redacted diagnostic log and versions into one ZIP. "Report on GitHub" downloads the ZIP and opens a prefilled issue to drag it into; no GitHub token is stored. `deepseekbot bug-report --out report.zip` builds the same ZIP from the CLI, even when the Host is down (PR_LINK).

## zh

- 在诊断日志窗口中可以直接报告问题：写下描述，粘贴、拖入或选择截图和文件（总计 25 MB 以内），Tobs 会把它们和已脱敏的诊断日志、版本信息打包成一个 ZIP。点“在 GitHub 报告”会下载 ZIP 并打开预填好的 Issue，把 ZIP 拖进去即可，不保存任何 GitHub token。`deepseekbot bug-report --out report.zip` 在 CLI 中生成同样的 ZIP，Host 未运行时也可用（PR_LINK）。
