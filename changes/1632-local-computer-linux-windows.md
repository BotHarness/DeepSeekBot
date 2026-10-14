---
section: Added
---

## en

- Local Computer now works on Windows and Linux as well as macOS: the first check installs the matching pinned driver, and a Linux server without a display gets a private virtual desktop, and one that already runs Xvfb (for example for the Bot Browser) shares that display and gets a window manager so clicks and typing work. The Computer card shows a download progress bar, and installs missing desktop packages with one click (with progress) when DSH has administrator rights, or shows a copyable command and checks again on its own once you run it. The Bot Browser offers the same one-click install for missing Linux system libraries ([#1632](https://github.com/BotHarness/DeepSeekBot/issues/1632)).

## zh

- 本机 Computer 现在除 macOS 外也支持 Windows 和 Linux：首次检查会安装对应平台的固定版本驱动，没有显示器的 Linux 服务器会自动启动一个私有虚拟桌面；已经运行 Xvfb 的服务器（例如给 Bot Browser 用的）会共用该显示，并补上窗口管理器，保证可以点击和输入。Computer 卡片会显示下载进度；缺少桌面组件时，DSH 有管理员权限就一键安装并显示进度，否则给出可复制的命令，装好后自动重新检查。Bot Browser 缺少 Linux 系统库时也提供同样的一键安装（[#1632](https://github.com/BotHarness/DeepSeekBot/issues/1632)）。
