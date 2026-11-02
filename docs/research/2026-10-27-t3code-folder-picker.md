# t3code 文件夹选择器调研：怎么浏览目录、怎么处理 Windows 盘符和慢文件系统

## 0. 元信息

| 项     | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 问题   | t3code 添加项目时怎么选文件夹：服务端怎么列目录（同步还是异步、有没有超时和取消），Windows 盘符（A:–Z:、网络盘、WSL）怎么枚举，客户端是输入路径还是树形浏览，什么时候用 Electron 原生对话框，远程和网页客户端怎么办；有没有防止断开的网络盘、慢挂载卡死进程的措施。                                                                                                                                                                                                                                                                                                                                  |
| 日期   | 2026-10-27                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 一手源 | [pingdotgg/t3code](https://github.com/pingdotgg/t3code) 浅克隆 `e689dad4`（`reference/t3code`）：`apps/server/src/workspace/WorkspaceEntries.ts`、`apps/server/src/ws.ts`、`packages/contracts/src/filesystem.ts`、`packages/contracts/src/rpc.ts`、`packages/client-runtime/src/state/filesystem.ts`、`packages/client-runtime/src/state/projects.ts`、`apps/web/src/components/CommandPalette.tsx`、`apps/web/src/localApi.ts`、`apps/desktop/src/electron/ElectronDialog.ts`、`apps/desktop/src/ipc/methods/window.ts`、`apps/desktop/src/wsl/wslPathParsing.ts`。下文 `path:line` 都指这个提交。 |
| 对照   | 本仓库 `packages/core/src/workspaces/folder-browse.ts`：每次 `list()` 都用同步 `existsSync` 探测 A:–Z:，并在主线程上 `readdirSync`/`statSync`，网络盘断开时整个 Host 卡住。                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 结论   | **t3code 没有“盘符列表”和目录树。** 用户在命令面板里输入路径，服务端只对“路径里的父目录”调用一次异步 `fs/promises.readdir`，并按目录名前缀在客户端过滤。桌面端另有一个按钮，调用 Electron 原生 `showOpenDialog`，盘符、网络位置、WSL 都交给操作系统对话框。服务端没有为浏览设置超时，也没有 AbortSignal；它不会卡死，只因为 readdir 是异步的。                                                                                                                                                                                                                                                       |

## 1. 服务端：一个 RPC，一次异步 readdir

- **协议**：WebSocket RPC `filesystem.browse`（`packages/contracts/src/rpc.ts:400`、`:1282-1286`）。输入只有 `partialPath` 和可选的 `cwd`，两者都限制在 512 字符以内（`packages/contracts/src/filesystem.ts:4`、`:29-33`）。返回 `{ parentPath, entries: [{ name, fullPath }] }`（`filesystem.ts:35-45`）。失败只有三类：`windows_path_unsupported`、`current_project_required`、`read_directory_failed`（`filesystem.ts:47-51`；映射见 `apps/server/src/ws.ts:500-514`）。
- **权限**：要求会话带 `filesystem:read` 权限范围（`apps/server/src/auth/RpcAuthorization.ts:156`，`packages/contracts/src/auth.ts:40`）。
- **解析路径**（`apps/server/src/workspace/WorkspaceEntries.ts:120-146`）：服务端不是 Windows 时直接拒绝 `C:\…` 或 UNC 路径（`:125-131`）。绝对路径和 `~` 先展开家目录再 `path.resolve`（`:133-134`）。`./`、`../` 必须带当前项目的 `cwd`，否则报错（`:137-145`）。
- **列目录**（`WorkspaceEntries.ts:201-247`）：
  - 输入以分隔符结尾（或就是 `~`）时，列这个目录本身；否则列它的 `dirname`，最后一段作为前缀（`:204-206`）。
  - **异步**：`Effect.tryPromise(() => NodeFSP.readdir(parentPath, { withFileTypes: true }))`（`:2`、`:208-209`）。没有给 readdir 传 `signal`，也没有 `Effect.timeout`。
  - `EACCES`/`EPERM` 当作空目录返回，不报错（`:218-224`）；其他错误（`ENOENT`、`ENOTDIR`、网络错误）变成 `read_directory_failed`。
  - **只靠 dirent，不再 stat**：用 `dirent.isDirectory()` 过滤（`:232`），每个条目不额外 `stat`。所以一次浏览只有一次系统调用；副作用是指向目录的符号链接（以及 Windows 上可能的 junction）不会出现在列表里。
  - 隐藏目录默认不显示，前缀以 `.` 开头时才显示（`:227`、`:234`）。按名称排序后返回（`:245`）。
- **没有任何盘符枚举代码**：在 `apps/server`、`apps/web`、`apps/desktop`、`packages/*` 中搜不到 A:–Z: 循环、`wmic`、`Get-PSDrive`、`GetLogicalDrives` 一类代码。服务端从来不会主动去摸 `D:\`、`Z:\`，只有用户输入了这个路径，服务端才会去读它。
- **对比**：同目录下项目文件索引扫描有 15 秒超时（`apps/server/src/workspace/WorkspaceSearchIndex.ts:36-37`、`:319-340`），说明作者知道扫描会慢；但 `browse` 没有用同样的保护。
- **添加项目时的校验**：`WorkspacePaths.normalizeWorkspaceRoot` 用 Effect 的异步 `fileSystem.stat`，路径不存在时用 `makeDirectory` 创建（`apps/server/src/workspace/WorkspacePaths.ts:114-160`），同样没有超时。

## 2. 客户端：在命令面板里输入路径，不是目录树

- **入口**：命令面板的“Add project”（`apps/web/src/components/CommandPalette.tsx:1424`）。初始输入框内容是 `~/`，或者服务器设置里的 `addProjectBaseDirectory`（`CommandPalette.tsx:611-619`）。
- **什么输入算浏览**：以 `/`、`~/`、`./`、`../` 开头；目标环境是 Windows 时，盘符路径和 UNC 路径也算（`packages/client-runtime/src/state/projects.ts:80-91`）。平台取自**目标环境**的 `serverConfig.environment.platform.os`，不是浏览器所在的系统（`CommandPalette.tsx:592-594`）。
- **请求只以目录为键**：`getFilesystemBrowsePath` 把输入拆成 `directoryPath`（到最后一个分隔符为止）和 `filterQuery`（最后一段）（`packages/client-runtime/src/state/filesystem.ts:55-69`）。RPC 只发 `directoryPath`（`CommandPalette.tsx:652-662`），最后一段在客户端按前缀过滤（`filesystem.ts:71-86`、`CommandPalette.tsx:670-678`）。所以在同一目录里继续打字不会触发新请求；只有跨过分隔符才会请求一次。
- **查询做成响应式 atom**：`createEnvironmentRpcQueryAtomFamily`（`filesystem.ts:121-124`，实现见 `packages/client-runtime/src/state/runtime.ts:854-898`）。结果按（环境，输入）缓存；没有为这个查询配置超时。
- **防竞态**：`createBrowseNavigationCoordinator` 给每次导航编号，先预取目标目录，预取完成且没有更新的导航时才提交新输入（`filesystem.ts:88-105`；用法见 `CommandPalette.tsx:857-867`、`:2008-2032`）。面板关闭时作废全部编号（`CommandPalette.tsx:705-712`）。这只防止旧结果覆盖新状态，不会取消服务端的 readdir。
- **只在已连接时预取**：`canPreloadBrowsePath` 要求连接状态为 `connected`（`filesystem.ts:107-111`；`CommandPalette.tsx:680-703`）。
- **往上一级**：`getBrowseParentPath` 能识别 `C:\` 和 `\\server\share\` 作为根（`projects.ts:50-78`、`:183-200`）。到盘符根或共享根之后就**不能再往上**（`:187`、`:202-204`），没有“此电脑/所有盘”这一层；要换盘只能自己输入 `D:\`。
- **远程和网页客户端**：浏览走同一个 RPC，对哪个环境都一样（本机、SSH、T3 Connect）。没有 `filesystem:read` 权限或环境离线时显示提示（`filesystem.ts:25-53`、`CommandPalette.tsx:664-668`）。

## 3. 原生对话框：只在桌面端、只对本机环境

- **何时出现**：只有在浏览中、目标是主环境或桌面本机环境，并且存在 `window.desktopBridge`（即运行在 Electron 中）时，面板底部才显示“用文件管理器打开”按钮（`CommandPalette.tsx:2255-2262`、`:2597`）。网页里 `pickFolder` 直接返回 `null`（`apps/web/src/localApi.ts:12-15`）。
- **初始目录**：取当前输入里的目录（`CommandPalette.tsx:2263-2279`），传给 IPC `pickFolder`（`:2462-2468`；preload 见 `apps/desktop/src/preload.ts:189`）。
- **主进程**：设置里关掉本机环境时返回 `null`，因为“选出来的路径只对这台机器上的后端有意义”（`apps/desktop/src/ipc/methods/window.ts:181-185`）。然后调用 `Electron.dialog.showOpenDialog`，参数是 `properties: ["openDirectory", "createDirectory"]`（`apps/desktop/src/electron/ElectronDialog.ts:109-142`）。盘符、网络位置、慢挂载都由操作系统对话框处理，不在 t3code 进程里。
- **WSL**：目标是 `wsl:` 后端时，默认路径换成 `\\wsl.localhost\<distro>\…` 形式的 UNC 路径（`apps/desktop/src/wsl/wslPathParsing.ts:61-100`；`window.ts:186-206`）。选回的 UNC 路径先尝试直接解析，失败再调用 `wslpath` 一类的转换得到 Linux 路径（`window.ts:218-227`）。渲染进程检测到选回的是 WSL UNC 路径时，会把项目路由到对应的 WSL 环境（`CommandPalette.tsx:2477-2508`）。

## 4. 慢文件系统 / 挂起文件系统

| 风险                            | t3code 的做法                                                                                  | 出处                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 进入面板就探测所有盘符          | 不探测，没有盘符列表                                                                           | 第 1 节，全仓搜索无结果                                 |
| readdir 卡住阻塞事件循环        | 用 `fs/promises.readdir`，阻塞的是 libuv 线程池里的一个线程，事件循环不受影响                  | `WorkspaceEntries.ts:2`、`:208-209`                     |
| 每个条目 stat 放大延迟          | 只用 `withFileTypes` 的 dirent，不 stat                                                        | `WorkspaceEntries.ts:209`、`:232`                       |
| 打字时请求过多                  | 以目录为键，同一目录内在客户端过滤                                                             | `filesystem.ts:55-86`                                   |
| 旧结果覆盖新导航                | 导航编号                                                                                       | `filesystem.ts:88-105`                                  |
| 请求永远不返回                  | **没处理**：没有超时，没有 AbortSignal；界面会一直显示加载中                                   | `WorkspaceEntries.ts:208-225`；`CommandPalette.tsx:664` |
| 线程池被多个挂起的 readdir 占满 | **没处理**（推断：Node 默认线程池 4 个线程，连续浏览几个断开的网络盘可能拖慢所有异步 fs 操作） | 源码中未见限流                                          |
| 浏览本机磁盘                    | 桌面端可交给原生对话框                                                                         | `ElectronDialog.ts:109-142`                             |

## 5. 对我们的启示

1. **别在 `list()` 里探测 A:–Z:。** t3code 根本不列盘符。要保留“此电脑”视图，就只在用户打开这一层时探测；探测要异步、并行，每个盘符设短超时（例如 1–2 秒），并把结果缓存几十秒。超时的盘显示为“不可用”，不要让它拖住整页。
2. **换成 `fs.promises.readdir(dir, { withFileTypes: true })`，去掉逐项 `statSync`。** 这是 t3code 不卡死的主要原因（`WorkspaceEntries.ts:208-232`）。
3. **我们要比 t3code 多做一步：给 browse 加超时。** 用 `Promise.race` 加约 5 秒的计时器，超时后返回明确错误，例如 `folder_unreachable`。底层 readdir 取消不了，但请求能先结束。再限制同时进行的 readdir 数量（例如 2 个），避免把 libuv 线程池占满。
4. **把 `EACCES`/`EPERM` 当作空目录**，不当作错误（`WorkspaceEntries.ts:218-224`）。
5. **请求只以父目录为键，最后一段在客户端过滤**；再加导航编号防止旧结果覆盖（`filesystem.ts:55-105`）。这样打字不会每个字符都访问一次文件系统。
6. **路径语义跟目标 Host 走**：用 Host 上报的平台判断是否接受 `C:\` 和 UNC 路径，服务端也再拒绝一次（`projects.ts:80-91`、`WorkspaceEntries.ts:125-131`）。
7. **桌面端本机 Host 提供原生对话框作为另一条路**（`showOpenDialog` + `openDirectory`），盘符和网络盘由操作系统处理；远程/手机端继续用服务端浏览。按 CLAUDE.md 的 CLI 对齐要求，`deepseekbot` CLI 也要有对应的浏览命令。
