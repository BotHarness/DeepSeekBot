# Default-open split button — #1461

Captured through the real UI of an isolated Host on DSH **0.2.0-rc.1**, macOS, Chinese locale. Before uses base `67279189`; after uses this branch with the same fresh Profile shape, the default Bot and its `MEMORY.md`. Desktop captures are a 1280 × 800 viewport; the narrow capture is 390 × 844 with a coarse pointer.

## Screens

- [before-reader-dark.jpg](before-reader-dark.jpg) / [after-reader-dark.jpg](after-reader-dark.jpg): the current Memory file reader. The More button becomes the application icon, **打开** and a separate dropdown; the reader still opens from the tree.
- [before-menu-dark.jpg](before-menu-dark.jpg) / [after-menu-dark.jpg](after-menu-dark.jpg): the dropdown adds the current default status, the effective default marker and **设置 .md 文件的默认应用…**.
- [after-set-default-dark.jpg](after-set-default-dark.jpg): the second menu level for choosing a default, reachable by click, touch and keyboard.
- [after-reader-light.jpg](after-reader-light.jpg): light theme.
- [after-menu-390.jpg](after-menu-390.jpg): 390 × 844; the control is 36 px high and the menu stays inside the viewport. It and the folder capture predate the final copy and icons (**设置…的默认应用…** with a gear; icons on reveal, download and copy).
- [after-folder-no-default.jpg](after-folder-no-default.jpg): the Memory Repository folder row before any default exists. The main button explains that no trusted default exists and expands the choice; it is cropped to keep the local Host path out of the image.

## What was exercised on the real Host

- Folder row: with no default, the main button opened the menu and launched nothing. **设置文件夹的默认应用… → Finder** stored the preference; after a full page reload the main button showed the Finder icon and one click reported "打开请求已发送到 Host".
- `MEMORY.md`: the main button showed the Host system default (Xcode). Setting TextEdit as the `.md` default changed the main action and status; **恢复系统默认** returned to Xcode. A one-time **用 文本编辑.app 打开** started TextEdit on the Host (process launch observed with `lsappinfo`) and left the stored default unchanged.
- The stored value is one `localStorage` entry keyed by the Host's Profile identity, holding only the scope and the application identifier the Host reported.

## Not covered here

- Visible native windows were not independently observed: the Finder AppleEvent query timed out, so only the Host's accepted dispatch and the TextEdit process launch are evidence. Saving in an external editor and re-reading the current file was not repeated for this slice.
- The chat file card was not exercised on the real Host, because that needs sending a message with an attachment and no send was authorized for this task. It is covered by focused tests only.
- English copy, a tunnelled remote browser, Windows and Linux were not captured.
