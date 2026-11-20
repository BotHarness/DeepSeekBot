# Option C 多屏幕成本压缩 playbook：每个 PersonaBot 独立虚拟显示器

日期：2026-09-28
状态：纯调研，不产生决议（research only）

## 问题

Option C 是让每个 PersonaBot 在共享 Computer 容器内拥有自己的虚拟显示器（Xvfb :N + 独立 cua-driver），使 Bot 可以像 Grok Bot「每个 Bot 一块屏」那样并行工作。目标形态是 **Bot 设置里的实验性开关**，因此先要回答：把它的资源成本压到最低有哪些可行手段、各能省多少、代价是什么，以及哪些约束无法绕过。

## 证据等级（全文标注）

- **MEASURED**：本调研于 2026-09-28 在运行中的容器 `botharness-computer` 内实测（`docker exec`）；所有实验只用 scratch 显示器 `:20–:25`，未触碰 `:1`；方法见附录 A。
- **ESTIMATED**：由官方文档/其他项目数字推导或按实测值算术外推，未在本容器复现。
- **UNVERIFIED**：看起来可行但未验证的项，集中在文末清单。

### 来源基线（MEASURED，除注明外）

| 项                                                                                                                         | 值                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 容器                                                                                                                       | `botharness-computer`，`lscr.io/linuxserver/webtop:ubuntu-xfce`，aarch64 (Docker Desktop LinuxKit 6.12.54)                               |
| 资源上限                                                                                                                   | `--cpus 2`、`--memory 2g --memory-swap 2g`（无 swap）、`--shm-size 512m`、`--pids-limit 4096`（`docker inspect`；ADR-0055 的默认值）     |
| cgroup                                                                                                                     | v2；`memory.max=2147483648`、`memory.high=max`；`/sys/fs/cgroup` 对容器内**只读**                                                        |
| 显示器 :1                                                                                                                  | `Xvfb :1 -screen 0 15360x8640x24 … -shmem`（进程实际 2560x1600，XRandR 最大值 15360x8640）                                               |
| Xvfb 21.1.21 / Chromium 152.0.7977.82 / cua-driver 0.28.0（二进制 47,112,408 B）/ Selkies `0.0.0`（linuxserver baseimage） |                                                                                                                                          |
| 基线占用                                                                                                                   | 容器内 abc 进程 PSS 合计 **1,118 MB**；`memory.current` 1.6–2.0 GB（含可回收 page cache）；`anon ≈ 0.56–0.59 GB`、`shmem ≈ 0.60–0.63 GB` |

## 结论摘要（按「省得多 / 干得快」排序）

| #   | 手段                                                                 | 实测/估算节省                                          | 代价与风险                                                                 | 工作量               |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------- | -------------------- |
| 1   | **收紧主显示器 Xvfb 最大几何**：`MAX_RES`（可配 `SELKIES_MANUAL_*`） | **≈ −490 MB**（一次）                                  | Selkies 动态分辨率上限变小；需重建容器                                     | S                    |
| 2   | **每个 Bot 屏不跑 XFCE，只跑最小 EWMH WM**                           | 每 Bot **≈ −280 MB**（避免复制 XFCE 壳）               | 每屏无面板/文件管理器；窗口装饰由 WM 决定                                  | S/M                  |
| 3   | **懒创建 + 空闲回收**（Xvfb+WM+driver 按需起、闲置杀）               | 每闲置 Bot **≈ −50 MB**（激活时 0）                    | 冷启动 ~0.1–2 s；需清理 `.XN-lock` 与 SingletonLock                        | M                    |
| 4   | **每个 Bot 独立 Chromium（独享 `--user-data-dir`）按需起、闲置杀**   | 每回收一个 Bot **≈ −200–230 MB**                       | 冷启动 ~0.3–2 s；登录态不共享（见 §3）                                     | S(flags)/M(生命周期) |
| 5   | **Xvfb 去掉 GLX**（`-extension GLX`，不加 `+iglx`）                  | 每屏 **≈ −16 MB**                                      | WebGL 走 SwiftShader/软件路径；实测 Chromium 正常出窗                      | S                    |
| 6   | **只为「正在被看的」那块屏起 Selkies**（或看谁起谁）                 | 每块没人看的 Bot 屏 **≈ −70–140 MB**                   | 切换显示需重启 streamer（实测 214 ms），viewer 需重连                      | M                    |
| 7   | 统一用 1280x800/1024x768 级别几何（framebuffer 4 MB 以下）           | 每屏 ~1–5 MB                                           | 屏幕小；对总预算意义有限                                                   | S                    |
| 8   | 非视觉任务走 headless Chromium，不占可见屏                           | 每任务 **≈ −350 MB**（headless PSS 183 vs headed 531） | 无法给人看画面；工具路径不同                                               | M                    |
| 9   | 登录态跨 Bot 同步（CDP cookie 复制 / keeper 模式）                   | 非省内存，是**语义必需项**                             | Chrome ≥136 要求自定义 `--user-data-dir` 才能开 CDP；localStorage 等不覆盖 | M/L                  |
| 10  | 容器内存升到 3–4 GB 再放大并发                                       | 约 2→4 个有 Chrome 的 Bot                              | 与 ADR-0055 的 2C2G 默认相悖，是 Host 配置项 `memory`                      | S                    |
| —   | 容器内 per-bot `memory.high` / KSM / zram / swap                     | **不可用**（实测）                                     | cgroup 只读、KSM=0、无 zram、swap 被 `--memory-swap` 禁                    | —                    |

---

## 1. 每块 Bot 屏用什么显示服务器

| 方案                                              | 空闲 PSS/实测                        | 输入注入                                         | 截图 / AT-SPI                             | 备注                                                                                  |
| ------------------------------------------------- | ------------------------------------ | ------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------- |
| **Xvfb 1280x800x24（无 GLX）**                    | **10.4 MB**（RSS 15.8）              | XTest（driver Linux/X11 lane 即建在 XTest 上）   | XGetImage / 共享 session bus 的 AT-SPI    | 启动 60–104 ms；**推荐**                                                              |
| Xvfb 1280x800x24（当前 :1 同款全扩展 + GLX）      | 26.2 MB（RSS 64.9），Δcurrent +17 MB | 同上                                             | 同上                                      | GLX 的 llvmpipe/GLX 数据结构多占 ~16 MB                                               |
| Xvfb 低分辨率/16 位                               | 1280x800x16 为 23 MB（GLX）          | 同上                                             | 深度 16 可能触发应用兼容问题              | 省不了多少（PSS 大头是 server 代码+GLX）                                              |
| Xorg + dummy 驱动                                 | 44.2 MB（RSS 68.4）                  | XTest（核心 Xorg）                               | 同上                                      | 更重、要 root config，无收益                                                          |
| Weston headless                                   | 10.2 MB                              | 无输入设备；需 compositor 协议                   | `grim` 失败（Weston 无 `wlr-screencopy`） | **cua-driver 不支持 Weston**，不可行                                                  |
| wlroots 系（sway/labwc，`WLR_BACKENDS=headless`） | ESTIMATED（未装/未测）               | 需 `wlr-virtual-pointer/keyboard`（wayvnc 模式） | grim 可用                                 | 驱动支持矩阵只把 **Sway** 列为「supported with limits」，labwc「预期但未证明」；见 §4 |
| Xpra shadow                                       | ESTIMATED（本镜像无 xpra；未测）     | 支持                                             | HTML5 客户端                              | 一 display 一 shadow server；proxy 可多路复用；GPLv2+；引入新依赖                     |

- **结论**：Xvfb 本来就是最便宜的 X server，且是 cua-driver 的验证 lane；每 Bot 屏一个 Xvfb，**不要开 GLX**，不要用 Xorg dummy。Weston 最便宜但在 driver 支持范围外。
- 几何与 framebuffer 严格线性：15360x8640x24 = **506.2 MiB**（`ipcs` 里 shmid 0 = 530,844,832 B，MEASURED）；2560x1600 = 15.6 MiB；3840x2160 = 31.6 MiB。
- **多 screen 单 Xvfb（`:N.0`/`:N.1`）不可行（MEASURED）**：两个 screen 共享一个进程时，往 `:24.1` 注入 XTest 点击，`xev` 收不到（0 次 ButtonPress）。一屏一 Xvfb。
- Wayland 是 driver 的「opt-in、按 compositor 分级」路径（`CUA_DRIVER_RS_ENABLE_WAYLAND=1`，仅 wlroots/GNOME/Hyprland 系），常规仍走 X11/XWayland。见 cua 平台支持页与 driver 二进制内文案。

## 2. 每块 Bot 屏需要窗口管理器吗？

- **不需要**（对 EWMH 之外的场景）：Chromium 在无 WM 的 Xvfb 上仍会映射窗口（GET 实测：一开始 0 窗口是我的脚本漏传 `DISPLAY`，修正后正常出窗）。
- 但 cua-driver 的窗口发现/激活/置顶依赖 EWMH/`_NET_WM_*`（platform-support 写明 Linux X11 路线是 “X11/EWMH, XTest, AT-SPI, …”），且人类通过 VNC 看到的最小桌面也更需要 WM 的标题栏/焦点语义。**结论：保留一个最小 EWMH WM。**
- MEASURED（同一 :20 上逐个运行，PSS/RSS）：

| WM                                                                           | PSS          | RSS     | EWMH（`wmctrl -m`） |
| ---------------------------------------------------------------------------- | ------------ | ------- | ------------------- |
| **icewm 4.0.0**                                                              | **7.7 MB**   | 16.4 MB | ✅                  |
| fluxbox 1.3.7                                                                | 7.2 MB       | 16.3 MB | ✅                  |
| openbox 3.6.1                                                                | 11.3 MB      | 23.6 MB | ✅                  |
| jwm                                                                          | 11.7 MB      | 24.7 MB | ✅                  |
| twm                                                                          | 1.9 MB       | 5.2 MB  | ❌（非 EWMH）       |
| XFCE 壳（session+xfwm4+panel+xfdesktop+settings+thunar+2 wrappers，:1 现状） | **≈ 293 MB** | —       | ✅                  |

- 因此「每 Bot 复用 XFCE」要比「每 Bot icewm/openbox」多花 **~280 MB/屏**；XFCE 只应保留在人类主屏 :1。

## 3. 浏览器策略（最大单项成本）

### 3.1 硬事实（MEASURED，除注明外）

- Chromium 152，real page（example.com）：**新增 anon +218–222 MB**；第二个并发实例再 **+183–225 MB**；空白页同量级。杀掉后 anon 约 3 秒内全部归还。
- 单实例 PSS 达 531 MB（单独运行时共享库全记在它头上）；PSS 不是边际成本，**anon 增量才是**。
- 参数微调（同一 real page，逐个 A/B）：
  - 默认：anon +222 MB，PSS 531
  - `--disable-gpu --disable-software-rasterizer`：anon **+199 MB**（−23）
  - `--in-process-gpu`：anon +216 MB（少一个进程）
  - 叠加 `--renderer-process-limit=1 --process-per-site --enable-low-end-device-mode --js-flags=--max-old-space-size=128`：anon **+191 MB**（合计 −31）
  - `--headless=new` 同页：PSS 183 MB（只适合非视觉任务）
- **同 profile 不能再起第二个进程**：第二次调用 212 ms 内以 rc=0 退出并打印 `Opening in existing browser session.`，不新增进程/内存。**换到另一块显示器（:21）也一样**：handoff 回 :20 的既有实例，:21 上不出现任何窗口。Chromium 官方文档原文：_“A single Chrome instance cannot show windows on multiple X displays, and two running Chrome instances cannot share the same user data directory.”_（`docs/user_data_dir.md`）
- 也就是说：**每个 Bot 屏必须有自己 `--user-data-dir` 的 Chromium**，Windows 无法跨 X display；这是一条不可绕过的产品级约束。
- Chrome ≥136 起 `--remote-debugging-port`/`--remote-debugging-pipe` 只在**非默认** `--user-data-dir` 下生效（developer.chrome.com 官方公告）——per-Bot 独立 profile 恰好满足，CDP 可用。
- profile 目录 = 登录态（Cookies/Login Data/Local Storage/IndexedDB；见 repo 旧调研 `2026-09-21-computer-use-vnc-persistent-login.md`）。Chrome 的 SingletonLock 还会在容器重建后残留（本容器启动时就有 `profile appears to be in use … on another computer` 的 xmessage，MEASURED）。

### 3.2 共享登录的三种做法

| 做法                              | 机制                                                                                                        | 代价                                                                                                                        | 评价                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| A. 复制 profile（离开 Chrome 时） | 拷贝整个 user-data-dir                                                                                      | 之后即发散；必须停在 Chrome 才能拷；跨版本兼容无承诺                                                                        | 适合「初始化一次」                                |
| B. CDP cookie 同步（推荐候选）    | keeper 实例（人登录一次）→ `Network.getAllCookies` → 各 Bot 实例各自的 CDP → `Network.setCookie/setCookies` | 覆盖不到 localStorage/IndexedDB/密码；需要每实例一个 loopback CDP 端口（driver 具备 "driver-owned DevTools endpoint" 语义） | 可保持「共享登录」语义，且各 Bot 进程仍在各自屏幕 |
| C. 接受实验模式下发散             | 每个 Bot 自己登录                                                                                           | 最省事，违背 Grok-Bot 语义                                                                                                  | 仅作为 opt-in 实验的降级说明                      |

### 3.3 参数护栏（可作为 per-Bot 默认）

`--disable-gpu --disable-software-rasterizer --process-per-site --renderer-process-limit=N --enable-low-end-device-mode`（低端模式强制更激进的内存策略/标签丢弃；peter.sh + Chromium `chrome_features.cc` 的 AutomaticTabDiscarding、Memory Saver 博客）。MEASURED：单页场景护栏合计只省 ~30 MB，其主要价值是**多标签不再线性膨胀**（本次未测 >1 标签，UNVERIFIED）。

### 3.4 Firefox 作为替代？

- Firefox 官方支持多实例/多 profile：`--profile <path>` 指定 profile，`--no-remote`（隐含 `--new-instance`）允许多个实例并存（Firefox Source Docs, CommandLineParameters）。理论上没有 Chrome 的 SingletonLock「一 profile 一进程」限制那么硬。
- 但本镜像未安装 Firefox（MEASURED：PATH 中无 firefox），无法测量；按惯例其进程模型同样多进程、内存同量级或更高（ESTIMATED）。切换浏览器会改变 driver 的浏览器路由（cua 官方对 Firefox 只声明「原生发现 + AX/PX 回退，无 typed browser mutation」，即背景式语义点击/输入不可用），因此**不作为 Option C 的推荐路线**。

## 4. Driver 侧（cua-driver 0.28.0）

- **一个进程只能驱动一个 display**：二进制内文案 _“this release supports only display_id='primary'”_、_“desktop target requires display_id”_；`DISPLAY` 在进程启动时固定。因此 Option C 下 **每块 Bot 屏一个 driver 进程**，没有「一个 driver 服务多个屏」的进程内方案。
- 进程成本（MEASURED）：`cua-driver mcp`（stdio 子进程）空闲 PSS **30.1 MB**/RSS 31.5 MB；`cua-driver serve`（daemon，`--socket` 可指定）PSS **39.2 MB**；MCP `initialize` 冷启动握手 **~1.9 s**。二进制 47 MB。
- 对 scratch display 跑 `cua-driver doctor`：`display server: X11 (DISPLAY=:20)` ok，空 display 报 “no top-level windows”（warn，预期）；`:1` 上 AT-SPI bus 可达、4 个顶层窗口。**每屏 driver 可复用同一 session bus 的 AT-SPI**。
- 平台支持（官方文档）：Linux X11 = Supported；桌面动作只针对 “captured primary display”；Chrome existing-profile attachment 在 Linux X11 已验证；Wayland 按 compositor 分级，**Weston 不在列表**。
- 省内存手段：把 telemetry/update check 关掉（env，官方 README/二进制文案 `CUA_DRIVER_RS_TELEMETRY_ENABLED=false` 等，旧调研已记录）；空闲即杀（30–40 MB/屏）；不要为每屏多开一个 `serve` daemon 再加 `mcp` 子进程。

## 5. 懒创建与回收（实测时延与回收行为）

| 动作                         | 实测                                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Xvfb 就绪（`xdpyinfo` 可连） | 59–104 ms                                                                                                      |
| chromium 出首窗（页缓存热）  | 117–623 ms（A/B 四组）；冷启动 ESTIMATED 1–2 s                                                                 |
| cua-driver MCP initialize    | ~1.93 s（首次；含启动与更新检查提示）                                                                          |
| 新 Selkies 到监听端口        | 375 ms；换 display 重启 214 ms                                                                                 |
| kill Xvfb 后内存归还         | <1 s                                                                                                           |
| kill Chromium 后 anon 归还   | ~3 s（`memory.current` 2047→1575 MB 一例）；**page cache（file）不会立即掉**，留作可回收缓存，压力下由内核收回 |

- 结论：**懒创建可行且便宜**。每 Bot 的常驻最小集合（Xvfb 10 + icewm 8 + driver 30）≈ **50 MB/屏**；把显示器+WM+driver+Chrome 全杀掉只留持久化 profile 磁盘，几乎零内存。
- 运维坑（MEASURED）：Xvfb 被 `kill -9` 会留下 `/tmp/.XN-lock` 与 socket；若上次以 root 启过，abc 用户再次起同号 Xvfb 会直接失败（“Server is already active”）。**每屏管理器必须以与桌面相同的 uid（abc）运行，并在启动前清理自己编号的 lock**；Chrome 的 `SingletonLock` 同理需要在确认无存活进程后清理。

## 6. 容器级预算杠杆

- **`MAX_RES`（真正的大头）**：镜像的 `svc-xorg/run` 里 `DEFAULT_RES="15360x8640"`，`MAX_RES` 可覆盖；设 `SELKIES_MANUAL_WIDTH/HEIGHT` 则直接把虚拟屏锁为该尺寸。当前 :1 的 framebuffer 是 **506.2 MiB 的 SysV shm**（`ipcs` shmid 0），因为无 swap 而**不可回收**；Xvfb 进程 PSS 601 MB/RSS 713 MB 几乎全来自它。把 `MAX_RES` 收到 1920x1200x24（8.8 MiB）可一次省 **≈ 497 MB**；收到 1280x800 省 ≈ 502 MB。代价：Selkies 侧动态分辨率上限（人类主屏可选的 presets）变小；需要重建容器（provider 会比对 `Config.Env` 并在镜像/env 变化时重建，ADR-0055）。
- **cgroup v2 per-bot `memory.high`：容器内不可用（MEASURED）**：`/sys/fs/cgroup` 只读，`mkdir` 失败。要做 per-bot 限流只能由 Host 在容器外设置（或干脆每 Bot 一个容器/VM——那就不是 Option C 的共享容器了）。内核语义见 cgroup-v2 文档。
- **KSM：不可用/无效（MEASURED）**：`/sys/kernel/mm/ksm/run=0`（LinuxKit 宿主；容器内改不了）。即便宿主开启，Chrome 私有堆页差异大，收益存疑（kernel KSM 文档）。
- **zram/zswap/swap：不可用**：无 zram 设备、zswap 关闭；`--memory-swap 2g` = 无 swap（ADR-0055 有意为之）。
- **THP=`always`**（宿主级）：Chrome 大堆可能被顶到 2 MB 页，RSS 更「毛」；容器内不可调。
- 分辨率/色深：framebuffer 之外开销极小；色深 16 在 Chrome/Firefox 上有兼容性风险，不划算。
- `/dev/shm` 512 MB：本镜像的 Chromium 包装脚本传 `--disable-dev-shm-usage`，所以 Chrome 共享内存不压在 cgroup shmem 上（容器内实测有若干 SysV 段被 Chrome 占用，总量 ~200 MB 级）；多实例时留意 `/tmp`/磁盘而不是 shm。

## 7. 流式观看（Selkies vs 其他）

- 现状：nginx（3000/3001）→ 单 Selkies → 单 X display（`:1`）。**一个 Selkies 进程只绑一个 display**（capture 用启动时的 `DISPLAY`）；协议里的 `display2` 是同一 display 的「第二显示器」布局（`input_handler.py` 的 `display_layouts`），不是第二块屏。`--second-screen` 默认开启与此相关。
- MEASURED 成本：:1 实例 PSS 138 MB/RSS 189 MB（桌面 + 可能有人看）；**没人看的 scratch 实例 PSS 69 MB、anon +49 MB、CPU ≈ 0.9%**；启动到监听 375 ms；换 display 重启 214 ms。
- 方案对比：
  - **每屏一个常驻 Selkies**：多 Bot 时 70–190 MB/屏，代价高。
  - **单 streamer 切 display（推荐候选）**：人看哪块就把 Selkies 重启到哪块（214 ms + viewer 重连）；对「人一次只看一块屏」的 BotHarness viewer 语义吻合。需处理前端重连/短暂黑屏。
  - **每屏 x11vnc 惰性起**：空闲 PSS 13.6 MB、~0.1% CPU（MEASURED），但引入第二套协议栈（noVNC/websockify），丢掉 Selkies 的 WebCodecs 低延迟优势。
  - **Xpra shadow/proxy**：一个 HTML5 端可多路复用多个 display（proxy 的 `display` 连接参数），但引入新依赖与许可/维护面（GPLv2+），本镜像无 xpra（未测）。
- 结论：**保留 Selkies，但同一时刻只为「被观看」的那块屏运行一个实例**；或退一步——每块已 provision 的屏常驻一个 Selkies，仅当并发 Bot 数很少时接受其成本。

## 8. 前作与参照数字（ESTIMATED，来自官方文档）

| 来源                                     | 数字                                                                         | 用途                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Kasm Workspaces 官方 system requirements | 默认每个用户 workspace **2768 MB + 2 cores**（每用户一容器）                 | 「一人一屏」行业默认比我们 2 GB 总预算还大，说明 Option C 必须共享容器 |
| Neko（m1k1o）官方示例                    | 每会话 `shm_size: 2gb`；一容器一会话                                         | 同上；且 shm 对浏览器渲染是硬需求                                      |
| Cua `libs/xfce-cua` 镜像                 | XFCE + TigerVNC(:1) + noVNC + Firefox ESR + driver，driver 生命周期归 client | 上游「容器桌面」参考，但没有多屏/多 Bot，也没公布内存数字              |
| Xpra shadow 文档                         | 支持 shadow 已有 display；capture CPU 高于普通会话                           | 多屏 multiplex 的备选                                                  |
| Modal `computer_use_vnc`（repo 旧调研）  | Xvfb :99 + x11vnc + noVNC，单屏单任务、零持久化                              | 最小可行链路，不是产品                                                 |
| 本容器 ADR-0055 记录                     | 静止桌面 ~1.15 GiB/2 GiB（历史值）                                           | 与本次实测 1.1 GB PSS 一致                                             |

## 9. 推荐的实验性 C 形态（建议）

> 形状：**主屏瘦身 + 每 Bot 惰性最小屏 + 每 Bot 独立 Chromium + 单 streamer 随人切换 + 空闲全回收**。

1. **主屏**：给容器加 `MAX_RES=1920x1200x24`（或 2560x1600 以完全保留现状），一次回收 ~490–497 MB。
2. **每 Bot 屏（首次使用时创建）**：`Xvfb :N 1280x800x24`（**不加 GLX**，`-nolisten tcp -noreset`，以 abc 运行并清 `.XN-lock`）→ icewm 或 openbox → `cua-driver mcp`（每屏一个进程，独立 `CUA_DRIVER_RS_HOME`/socket，关 telemetry/update）。≈ **50 MB/屏**。
3. **浏览器**：每个 Bot 一个 Chromium，独享 `--user-data-dir=/config/botharness/bots/<botId>/chromium`（约束见 §3.1），带 §3.3 护栏参数；跨任务保活，闲置跟随屏幕回收；profile 落持久卷（注意 ADR-0006：**当 secret 看待**）。
4. **登录共享**：keeper profile 登录一次 → CDP cookie 同步到各 Bot profile（方案 B），或实验模式先声明「不共享登录」。
5. **观看**：沿用现有 Selkies + nginx；人点开哪个 Bot，就把单个 Selkies 重启到那块 `:N`（~0.4 s），离开即停。或短期接受每屏一个 Selkies。
6. **回收**：屏幕无 driver 会话且无 viewer 达 N 分钟 → 杀 Chromium → 杀 driver → 杀 WM/Xvfb；profile 与文件留在共享卷。
7. **预算**：主屏 ~0.62 GB PSS（MAX_RES 修复后）＋ 每激活 Bot ≈ 250 MB（50 屏 + 200 Chrome）⇒ 2 GB 容器舒服容纳 **2 个**同时活跃 Bot、**3 个**偏紧；要 ≥4 个请把 provider `memory` 提到 3–4 GB（`cpus/memory/shmSize` 已是配置项）。
8. **实验开关语义**：默认关闭；开启后每个 Bot 获得自己的屏；关闭即回收所有 `:N`，回到单共享屏 `:1`。

## 10. 已确认的硬约束

1. **一个 Chromium 进程 = 一个 `--user-data-dir` = 一个 X display**；同 profile 二次调用只会 handoff，换 display 也不会在新屏出窗（MEASURED + Chromium 官方文档原文）。
2. **cua-driver 0.28 一个进程只驱动 primary display**；多屏 = 多进程（MEASURED：二进制文案；官方平台页）。
3. **每屏要独立 Xvfb**：单 Xvfb 多 screen 的 XTest 注入实测无效（MEASURED）。
4. **容器内无法建 per-bot cgroup 限额**；KSM/zram/swap 都不可用（MEASURED）。
5. **无 swap**：`shmem`（即大 framebuffer、Chrome 共享内存）不可回收 → framebuffer 必须显式变小（ADR-0055 + MEASURED `ipcs`）。
6. **Selkies 一个进程只服务一个 X display**；换屏只能重启（214 ms）（MEASURED）。
7. **显示/浏览器锁文件会残留**：Xvfb lock、Chrome SingletonLock 必须在管理器中显式清理（MEASURED）。
8. **登录共享与「每 Bot 一块屏」天然冲突**（每屏独立 profile）→ 必须显式做同步机制，否则违背 Grok-Bot「共享登录」语义（ESTIMATED/产品判断）。

## 未验证 / 待实测（UNVERIFIED）

1. `MAX_RES` 缩小后 Selkies 动态分辨率/UI presets 的实际行为（未重建容器验证；仅脚本与文档依据）。
2. 每个 Bot 屏的 **AT-SPI 树质量**：无 XFCE 面板/桌面、只有 bare WM 时 GTK/Chrome 的 a11y 质量（只在 :1 上验过 doctor）。
3. sway/labwc headless + `wlr-virtual-pointer/keyboard` 与 cua-driver 的配合（未安装/未测；labwc 官方也未证明）。
4. Xpra shadow/proxy 的实际内存与在 arm64 容器内的可用性（未装未测）。
5. CDP cookie 同步（keeper → per-bot）的可行细节：cookie 加密 key、`Network.setCookies` 覆盖范围、localStorage/IndexedDB 缺口、Chrome ≥136 行为边界。
6. Chrome `--renderer-process-limit`/`--enable-low-end-device-mode` 在多标签/重页面下的真实收益（单页 A/B 只差 ~30 MB）。
7. Chromium 冷启动（页缓存全冷）时延；本次全部是温热缓存。
8. 长时间运行下 page cache 的回收/refault 行为对延迟的影响（只观察到 kill 后未回收）。
9. 每屏 driver 在真实动作（`get_window_state` 截图、AT-SPI 遍历）时的峰值内存（只测了 idle 30–40 MB）。
10. Selkies 前端在「重启换屏」时的重连体验与多客户端/token 细节。
11. cua-driver 0.30.x 是否增加多 display 支持（容器内提示有 0.30.2 可用；本次只验证 0.28.0）。
12. `--single-process` 等更激进的 Chrome 模式（未测，按 Chromium 文档属不安全/不支持）。
13. 主屏 `MAX_RES` 改小后，现有 2560x1600 用户配置/截图尺寸契约是否要迁移。

## 参考来源（URL）

- ADR-0055（2C2G/shm/空闲停机默认）`docs/decisions/computer.md`；ADR-0006（secret 边界）；ADR-0062（卷/静默）；`packages/computer/src/providers/docker.ts`（配置项与 env 漂移检测）。
- LinuxServer Selkies 配置（`MAX_RES` 默认 16K、`SELKIES_MANUAL_WIDTH/HEIGHT`、编码器）：<https://docs.linuxserver.io/selkies/user-guide/configuration>；`svc-xorg/run` 源：<https://github.com/linuxserver/docker-baseimage-selkies>（`root/etc/s6-overlay/s6-rc.d/svc-xorg/run`）；webtop 镜像页：<https://docs.linuxserver.io/images/docker-webtop>。
- Chromium「一实例一 X display、一 profile 一实例」原文：<https://chromium.googlesource.com/chromium/src/+/main/docs/user_data_dir.md>；进程模型与 `--process-per-site` / `--renderer-process-limit` 注释：<https://chromium.googlesource.com/chromium/src/+/main/content/public/common/content_switches.cc>；`--enable-low-end-device-mode` 开关列表：<https://peter.sh/experiments/chromium-command-line-switches>；标签丢弃/Memory Saver：<https://developer.chrome.com/blog/memory-and-energy-saver-mode>、<https://www.chromium.org/chromium-os/chromiumos-design-docs/tab-discarding-and-reloading>；Chrome ≥136 远程调试限制：<https://developer.chrome.com/blog/remote-debugging-port>。
- cua-driver 平台矩阵与桌面 scope：<https://cua.ai/docs/reference/cua-driver/platform-support>、<https://cua.ai/docs/reference/cua-driver/limits>、Linux X11 行为矩阵：<https://github.com/trycua/cua/blob/main/libs/cua-driver/docs/action-support.md>；`xfce-cua` 镜像：<https://github.com/trycua/cua/tree/main/libs/xfce-cua>。
- Firefox 多 profile/多实例：<https://firefox-source-docs.mozilla.org/browser/CommandLineParameters.html>。
- wlroots headless 后端：<https://github.com/swaywm/wlroots/blob/master/docs/env_vars.md>、<https://github.com/swaywm/wlroots/blob/master/include/wlr/backend/headless.h>（默认无输入设备）。
- Xpra shadow / HTML5 proxy：<https://xpra-org.github.io/xpra/Usage/Shadow.html>、<https://github.com/Xpra-org/xpra-html5/blob/master/docs/Configuration.md>、<https://xpra.org/>（GPLv2+）。
- Kasm 每会话默认 2768 MB/2 cores：<https://docs.kasm.com/docs/explanations/system-requirements>；Neko 每会话 `shm_size: 2gb`：<https://neko.m1k1o.net/docs/v3/installation/examples>。
- 内核/容器语义：cgroup v2 `memory.high`：<https://docs.kernel.org/admin-guide/cgroup-v2.html>；KSM：<https://docs.kernel.org/admin-guide/mm/ksm.html>；Docker 资源约束：<https://docs.docker.com/engine/containers/resource_constraints/>。
- 本 repo 旧调研：`docs/research/2026-09-21-computer-use-vnc-persistent-login.md`（profile 锁、持久化、鉴权）、`docs/research/2026-09-21-dsh-official-computer-use-and-cua-driver.md`（driver 工具面、容器路线）、`docs/research/2026-09-21-personabot-computer-and-live-view.md`。

## 附录 A：测量方法

- 内存：`/sys/fs/cgroup/memory.current`、`memory.stat`（`anon`/`shmem`/`file`）；进程级用 `/proc/<pid>/smaps_rollup` 的 `Pss`/`Rss`（PSS 用于跨共享库归因；注意**必须以进程属主 uid 运行**才能读 smaps_rollup，root 读 abc 进程会 EACCES）。
- CPU：`/proc/<pid>/stat` 的 utime+stime 两点采样（USER_HZ=100）。
- 显示：`Xvfb :20-:25`（scratch，事后全部清理；`:1` 未动）；WM 逐个在 :20 上跑，`wmctrl -m` 验 EWMH。
- 浏览器：`/usr/lib/chromium/chromium` + `--user-data-dir=/tmp/cr-*`，进程组 PSS 求和，anon 前后对比。
- Driver：容器内 `/config/.botharness/cua-driver/0.28.0/cua-driver`（`doctor`、`mcp`、`serve`、`strings`）。
- 流式：`selkies --addr=localhost --port=8084 ...` scratch 实例；`ss -tln` 计时。
- 容器：`ipcs -m`、`/sys/fs/cgroup` 可写性、`/sys/kernel/mm/ksm`、`/proc/swaps`、`docker inspect`。

## 附录 B：原始数字表（全部 MEASURED，2026-09-28）

| 对象                                                     | PSS                              | RSS            | 备注                                  |
| -------------------------------------------------------- | -------------------------------- | -------------- | ------------------------------------- |
| Xvfb :1（15360x8640 max，2560x1600 active）              | 601 MB                           | 713 MB         | shmid 0 = 530,844,832 B               |
| Xvfb 1280x800x24 + GLX                                   | 26.2 MB                          | 64.9 MB        | ready 104 ms；Δcurrent +17 MB         |
| Xvfb 1280x800x24 − GLX                                   | 10.4 MB                          | 15.8 MB        | ready 60 ms                           |
| Xvfb 1920x1080x24 + GLX                                  | 30.6 MB                          | 69.3 MB        |                                       |
| Xvfb 2560x1600x24 + GLX                                  | 37.6 MB                          | 76.2 MB        |                                       |
| Xvfb 3840x2160x24 + GLX                                  | 54.0 MB                          | 92.6 MB        | framebuffer 33.2 MB                   |
| Xvfb 双 screen（1280x800x2）                             | 65.1 MB                          | —              | XTest 到 screen1 失败                 |
| Xorg dummy 1280x800x24                                   | 44.2 MB                          | 68.4 MB        | VideoRam 8 MB                         |
| Weston headless 1280x800                                 | 10.2 MB                          | 16.9 MB        | grim 不支持                           |
| openbox / jwm / icewm / fluxbox / twm                    | 11.3 / 11.7 / 7.7 / 7.2 / 1.9 MB |                | twm 非 EWMH                           |
| Chromium real page 默认                                  | anon +222 MB                     | PSS 531 MB     | 9 procs；首窗 284 ms                  |
| Chromium + `--disable-gpu --disable-software-rasterizer` | anon +199 MB                     | PSS 463 MB     |                                       |
| Chromium + `--in-process-gpu`                            | anon +216 MB                     | PSS 519 MB     | 8 procs                               |
| Chromium 护栏组合                                        | anon +191 MB                     | PSS 455 MB     |                                       |
| Chromium headless=new                                    | —                                | PSS 183 MB     |                                       |
| 第二实例（空白页，另一 profile）                         | anon +183 MB                     |                | 同屏并发                              |
| cua-driver `mcp` idle / `serve` idle                     | 30.1 / 39.2 MB                   | 31.5 / 41.4 MB | initialize 1.93 s                     |
| Selkies :1 / scratch 无人观看                            | 138 / 69 MB                      | 189 / 74 MB    | 后者 anon +49 MB、0.9% CPU            |
| x11vnc idle（无客户端）                                  | 13.6 MB                          | 15.9 MB        | ~0.1% CPU                             |
| 全容器 abc 进程 PSS 合计                                 | 1,118 MB                         |                | 含 Xvfb 601 + Selkies 138 + XFCE ≈293 |
