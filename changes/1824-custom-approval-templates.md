---
section: Added
---

## en

- You can now write your own Approval Templates. Settings → Auto approval lists every template with the Bots that use it, and lets you create, view, edit and delete them, or copy a built-in one to change it; `deepseekbot approval-template list|show|create|edit|delete` does the same. Each template is a Markdown file, `approval-templates/<name>.md`, in the Profile. A Bot can draft a new template for you without a card, but editing or deleting a template some Bot uses always asks you first ([#1824](https://github.com/BotHarness/DeepSeekBot/issues/1824)).

## zh

- 现在可以自己写审批模板了。设置 → 自动审批会列出所有模板及正在使用它们的 Bot，可以新建、查看、编辑和删除，也可以复制内置模板后再改；`deepseekbot approval-template list|show|create|edit|delete` 能做同样的事。每个模板是 Profile 里的一个 Markdown 文件 `approval-templates/<name>.md`。Bot 可以不经卡片替你起草新模板，但编辑或删除某个 Bot 正在使用的模板，一定会先问你（[#1824](https://github.com/BotHarness/DeepSeekBot/issues/1824)）。
