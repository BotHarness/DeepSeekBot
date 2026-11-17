---
section: Added
---

## en

- On Linux Hosts, Team mode now confines member Bots' commands. A member Bot's Shell sees only its own Memory and the folders its Session may use, cannot reach the Host's local services or private network addresses, and runs without secret environment variables. When bubblewrap, slirp4netns and nftables all work, the trial notice changes to "members are isolated"; otherwise the trial notice stays and `deepseekbot team-mode status` lists what is missing ([#4183](https://github.com/BotHarness/DeepSeekBot/issues/4183)).

## zh

- 在 Linux Host 上，团队模式现在会隔离成员 Bot 的命令：成员 Bot 的 Shell 只能看到自己的 Memory 和当前 Session 有权使用的文件夹，无法访问 Host 本机服务和私有网络地址，运行时也不带密钥类环境变量。bubblewrap、slirp4netns 和 nftables 都可用时，试用告知会变成“成员之间已隔离”；否则继续显示试用告知，`deepseekbot team-mode status` 会列出缺少的组件（[#4183](https://github.com/BotHarness/DeepSeekBot/issues/4183)）。
