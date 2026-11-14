# Team mode：Bot 执行与数据隔离（VPS 与 macOS）

日期：2026-11-14 · 读者：Vain、架构师 · 状态：调研建议，不是已接受的决定
关联：spec #4137、hub #4138、[ADR-0336](../adr/0336-hosts-have-members.md)、[ADR-0205](../adr/0205-bot-sessions-follow-dsh-permission-mode-for-shell-and-plugin-tools.md)、[ADR-0067](../adr/0067-workspace-grants-bound-personabot-file-access.md)、M5 #4144、M6 #4145、M7 #4150

## 已敲定的范围（2026-11-14，Vain 确认）

下文是调研过程和备选方案；最终交付范围以本节为准，已写入 spec #4137、hub #4138、M5 #4144、M6 #4145、M7 #4150 和 [team-mode.md](../architecture/team-mode.md#execution-isolation-amended-2026-11-14)。

1. **新增切片 M12（#4183）**：Linux Host 上的 Bot 执行隔离。在 DSH 的 bwrap 外包一层 `runnerCommand` 脚本，隐藏 `DSH_HOME`、各空间目录和 `/home`，只挂回这个 Session 有权访问的目录；用网络命名空间拒绝本机和私有网段。机密放在 Host 上，所以结束试用前必须完成 M12。
2. **M12 之前以轻量试用形态开放**：只显示一句告知，不对 Shell 做逐次审批；成员 Bot 不能升级。
3. **M5**：显示试用告知；M12 达到完整隔离后，自动换成"成员之间互相隔离"。
4. **M6/M7**：账号空间和按受众划分的共享空间。共享 Bot 的 Memory 放在它所属的共享空间里，和可以授权的 `files/` 目录分开。
5. **不做**：账号的 CPU、内存、磁盘配额。
6. **macOS 上的 Team Host**：可以开放，只显示同样的试用告知；M12 只做 Linux。
7. **单独的 bug（#4184）**：Bot Browser 的 Chrome 调试端口没有认证，与是否开启 Team mode 无关。
8. **暂不做**：systemd、Cloudflare Access 的部署文档和检查脚本。
9. **高敏感数据放在单独的 Host 上**：只作为文档建议。

下文中与以上范围不一致的建议（逐次审批过渡门槛、配额 slice、第一阶段部署清单等），以本节为准。

## 结论（先看这里）

1. **隐私的隔离单位应该是"每次 Bot 执行"；账号只作为配额和归属的单位。** 我们推荐：Host 仍是一个进程、一个 OS 服务账号；DeepSeekBot 用自己的实现替换 DSH 的 `ctx.sandbox` 提供者。每次执行 Shell、终端或 PTC 时，按 Session 找到对应的 Bot 和受众，生成一份**读写都受限**的白名单：这个 Bot 自己的 Memory、它的有效 Workspace Grant，加上系统只读目录。其余部分，包括 Host 数据目录、其他 Bot 的 Memory 和其他成员的根目录，在沙箱里看不见。Linux 用 bubblewrap（无法使用时退到 Landlock），macOS 用 Seatbelt。
2. **不推荐用"Docker 加 mount、每个成员一个容器"做主方案**，也不推荐"每个成员一个 Linux 用户"。两者的隔离单位都是"人"，而 Team mode 的数据归属单位是"Bot 的受众"：共享 Bot、按角色可见的 Bot、共享根目录都不属于某一个人。另外，两者都要求 Host 拥有 root 或 Docker socket 级别的权限，在 macOS 桌面上也做不到同等效果。
3. **Docker 在 VPS 上可以用，但只当外层封装**：一个 Host 一个容器（或一个 systemd 服务账号），作用是保护 VPS 不受整个 Host 影响，而不是让成员之间互相隔离。成员之间的隔离靠第 1 条。
4. **私有 Bot 的 Memory 放在"账号空间"里，由 Host 管理**（例如 `/srv/deepseekbot/spaces/<humanId>/bots/<slug>/memory`，归服务账号所有、权限 0700，计入该账号的存储配额），只通过沙箱的 bind 暴露给这个 Bot 自己的执行。它不放进共享空间，也不放进成员能直接通过文件系统访问的目录。
5. **Vain 提出的产品模型（Owner 开一个账号就分配一块空间，带 CPU/内存/磁盘配额，例如 2C2G、20GB；IM Channel 和共享空间是团队共用的）可以在单个 Host 上实现，不需要每个账号一个容器**：账号 = 一个 cgroup slice（CPU/内存配额）+ 一个带磁盘配额的目录，再加上方案 A 的逐次执行沙箱。同一个模型以后可以换成 k8s 后端（账号 = 带 limits 的执行 Pod），Host 和 Channel 不用改。详见"账号空间与配额"。
6. **在沙箱落地之前，Team mode 现在有一个比"Shell 审批"更大的缺口**：按 ADR-0205，`workspace-write` 下的 Shell **不弹审批**，而 DSH 沙箱**只限制写、不限制读**。所以成员 Bot 现在不经任何审批，就能读到别人的 Memory、整个 SQLite 数据库、凭据文件，以及 Owner 的家目录（macOS 上包括 `~/.ssh`）。M5 目前的写法挡不住这些。建议 M5 加一个过渡性的硬门槛（见"对 M5/M6/M7 的影响"）。
7. **关于"k8s 给每个账号起一个 Pod、Channel 服务独立出去"**：这是另一种产品形态（多租户 SaaS），不适合作为 Team mode 的隔离手段。如果以后要弹性伸缩，伸缩单位应该是**每个团队一个 Host**，或者**把执行（沙箱）卸载到可伸缩的执行 Pod**；Host 本身（身份、Channel、Memory、审批）保持为一个整体。详见"方案 F"。

8. **分两阶段落地。** 第一阶段（最简，只要一台 VPS）：用专用系统用户运行 Host，再给 DSH 自带的 bwrap 包一个 `runnerCommand` 脚本，隐藏数据目录和其他空间。第二阶段：自研 `ctx.sandbox`（方案 A），覆盖 macOS。DSH 自带的沙箱**已经在用**，但它只限制写，也只提供本机执行，所以要在它之上补"读限制"。
9. **共享 Bot 放在按受众划分的共享空间里**（Vain 已决定）：例如 `shared/team` 给全员，`shared/finance` 只给财务角色。财务这类机密只有受众内的人和受众内的 Bot 能看到。在读限制落地之前，机密数据不应放上 Host。

10. **节奏：试用阶段不必做得很严肃。** 小公司试用时，只需要用单独的机器、专用用户、禁止成员 Bot 升级，并且如实告知"Bot 之间看得到彼此"。读限制和网络隔离留到开始放真实机密之前再做。见"试用阶段"。**但如果机密一开始就要放在机器上（Vain 的最新前提），读限制和网络限制就是第一天必须做的**，见"Keep it simple"一节。

## 现状（读代码和 DSH 类型得出的事实）

### Bot 在哪里执行、以谁的身份执行

- 所有 Bot 的 Orchestrator、Assignment 和 Subagent Session 都在**同一个 DSH Host 进程**里运行，以启动 Host 的那个 OS 用户的身份运行。BotHarness 本身是这个进程里的一个 Cordis 插件（`packages/deepseekbot/cordis.patch.yml` 插入 `@botharness/core`）。
- Shell 这一类工具由 DSH 的组合负责（`dsh-base` 的 `cordis.patch.yml`）：
  - `subprocess` → `dsh-subprocess-local`
  - `sandbox` → `dsh-sandbox-local`（Linux：bwrap，退到 Landlock；macOS：Seatbelt；Windows：ACL restricted token）
  - `sandbox-policy` → `dsh-sandbox-policy`（默认 `workspace-write`，根目录是 Session 的 cwd）
  - `bash-sandbox` / `pwsh-sandbox` 作为 `ctx.shell`；`terminal-bash`、`ptc-runtime-node`（workflow/PTC）也走同一个 sandbox policy
  - `fs-sandbox` 作为 `ctx.fs`：**只限制写**，"reads stay unconfined"
- Orchestrator 的 cwd 就是 Bot 的 Memory 目录（`plugin.ts` 里的 `orchestratorCwd: core.registry.memoryDirFor(slug)`），所以在 `workspace-write` 下，可写范围是"自己的 Memory 加 /tmp"。Assignment 的 cwd 是 Grant 的路径。
- BotHarness 的模式对齐在 `packages/core/src/workspaces/grant-execution.ts`：Orchestrator 默认是 `workspace-write + ask`；危险预设对应 `danger-full-access`。
- BotHarness 自己的路径检查在 `packages/core/src/workspaces/grant-native-tools.ts`：`read`/`write`/`edit`/`glob`/`grep`/`str_replace_editor` 会用 realpath 检查读和写的目标是否落在"Memory 加有效 Grant"之内（这是 ADR-0067 的防线，可以防符号链接）。对 Shell，**只检查 `workdir`**，不检查命令本身。

### Memory 目录

- 默认路径是 `$DSH_HOME/botharness/bots/<slug>/memory`（`bots/registry.ts`）；也可以用 `setMemoryDir` 指到别处。
- 新加的 Memory 所有权记录（`bots/deletion.ts` 的 `recordMemoryOwnership`/`transferMemoryOwnership`）记录的是 `(path, device, inode)` 证明，用来防止删除或迁移时误删别的目录。**它是数据完整性检查，不是访问控制。**
- Host 会在每个 Turn 对 Memory 运行 git。`memory/recovery.ts` 和 `memory/accepted.ts` 的命令带了 `core.hooksPath=/dev/null`、`core.fsmonitor=false`、`GIT_CONFIG_NOSYSTEM`；`memory/git.ts` 读活动的命令只关了 fsmonitor。仓库本地的 `.git/config` 仍然会被读取。

### DSH 沙箱到底限制了什么（引自 0.2.2-rc.1 的类型和 README）

| 能力                 | DSH 现状                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 写限制               | 有：`read-only` / `workspace-write` / `danger-full-access`，按调用传入                                                                                                    |
| 读限制               | **没有**。bwrap 的 profile 是"宿主根目录只读挂载"；Seatbelt 是 allow-default 加 `deny file-write*`；`fs-sandbox` 不限制读                                                 |
| 网络                 | **没有**。README 原文写明 "network stays unrestricted"                                                                                                                    |
| `danger-full-access` | **完全绕过** `ctx.sandbox`，不会调用 provider                                                                                                                             |
| 凭据                 | `dsh-credentials-local` 的 README 写明：凭据文件只有本 OS 用户可读，"but agent tool processes run as that same user, so this store cannot isolate secrets from the agent" |
| 策略里有什么         | `SandboxPolicy = { mode, workspaceRoot, additionalWritableRoots?, sessionId? }`，没有读白名单，没有网络字段                                                               |
| Provider 数量        | 每个 context 只有一个 provider（"One provider per context"）                                                                                                              |

### 应用层授权能挡住什么、挡不住什么

| 攻击路径（成员 Bot）                                                                 | 现在能挡住吗                                                                                                                                                 |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 通过 Client 或 Gateway 读别人的私有 Bot、Channel、DM                                 | 能（M1–M4、Gateway 默认拒绝）                                                                                                                                |
| 用 `read`/`grep` 读别人的 Memory 或根目录                                            | 能（`grant-native-tools.ts` 做 realpath 检查）                                                                                                               |
| Grant 指向 `/`、别人的根目录或 Memory                                                | M6 计划拒绝                                                                                                                                                  |
| `bash: cat $DSH_HOME/botharness/bots/<别人>/memory/*`                                | **挡不住**：只读挂载允许读，而 `workspace-write` 下 Shell 不弹审批                                                                                           |
| `bash: sqlite3 $DSH_HOME/.../*.db`、读凭据文件、读 Owner 的 token                    | **挡不住**；拿到数据目录基本就等于 Owner（本地 `deepseekbot` CLI 按 `DSH_HOME` 以 Owner 身份运行；ADR-0336 也写了 "OS access already reaches the database"） |
| macOS 上读 `~/.ssh`、浏览器 Profile、钥匙串以外的家目录文件                          | **挡不住**                                                                                                                                                   |
| `curl 127.0.0.1:<Host 端口>`                                                         | 网络不受限，可以连到；配合偷到的 token 就是 Owner                                                                                                            |
| 写别人的 Memory 或 Host 数据目录                                                     | 写被沙箱挡住（`workspace-write`）；但 `danger-full-access` 下挡不住，所以危险预设必须只给 Owner（M5 已经这样计划）                                           |
| 在自己 Memory 的 `.git/config` 埋 filter/hook，等 Host 以服务账号身份运行 git 时执行 | 部分挡住（hooksPath、fsmonitor 已关）；仓库本地的 filter 驱动等还需要审计（**待验证**）                                                                      |

结论：现在的 Team mode 是"同事之间的权限隔离"，ADR-0336 也是这样声明的；但"Shell 由 Owner/Admin 审批"并不覆盖普通 Shell 调用，所以实际边界比 ADR 的措辞更弱。

## DSH 接缝：哪些能用，哪些不能用

**可用（已在类型里确认）：**

1. **`ctx.sandbox`（`SandboxProvider.confine(argv, policy, signal) → { argv, enforcement, denialSignatures, runnerFailureRules }`）是可替换的抽象 Service。** `policy.sessionId` 在类型里是**可选的**（`sessionId?: SessionId`，agentless 调用不带）。有 sessionId 时，我们自己的 provider 能通过 BotHarness 的 `ownership.resolve(sessionId)` 找到 Bot、owner 和受众，自己算出读写白名单，再返回 bwrap 或 sandbox-exec 的 argv。所有经过沙箱的消费者（bash、pwsh、terminal、PTC）都会自动走这条路。**没有 sessionId，或者解析不到所属 Bot 的调用，provider 必须直接拒绝（fail closed），不能退回到更宽的策略。** 各消费者是否总是传入 sessionId，要在 spike 里对照固定版本的 DSH 源码核实。
2. **Cordis patch 可以停用 DSH 的行。** `cordis-plugin-include` 的 `PatchOptions` 支持 `{ id, disabled }`，所以 `packages/deepseekbot/cordis.patch.yml` 可以写 `- id: sandbox` + `disabled: true`，再 insert `@botharness/sandbox` 提供 `ctx.sandbox`。（需要用 spike 实测：停用后服务依赖能正确重新绑定，HMR 重组也正常。）
3. **后备方案：`dsh-sandbox-local` 的 `runnerCommand` 配置**。可以指定一个自定义 runner；DSH 会把 bwrap 兼容的参数追加给它，并跳过探测。runner 只能从这些参数里的 bind 路径反推是哪个 Bot，比较脆弱，只在第 2 条走不通时使用。
4. `dsh-sandbox-policy` 提供 `resolve({ session })` 和 `setSandboxMode`（BotHarness 已经在用），用来强制成员 Bot 不能进入 `danger-full-access`。
5. 执行世界可以整体替换：DSH 文档说"remote compositions replace all three providers"（`ctx.fs`、`ctx.subprocess`、`ctx.sandbox`，加上 `ctx.shell`）。这是将来"把执行卸载到容器或远端"的路线。注意：DSH 里**没有**一个叫 "Execution World Provider" 的单一 Service，ADR-0336 的这个说法应该改成"fs/subprocess/sandbox/shell 这一组 provider"。

**不可用或缺失（只能在我们这侧绕开，或者记为对 DSH 的诉求）：**

- `SandboxPolicy` 没有读白名单，也没有网络字段。我们自己的 provider 可以不依赖这些字段自己做到，但 DSH 自带的 `fs-sandbox` 仍然不限制读。好在 BotHarness 的原生文件工具已经有自己的检查；第三方插件里在进程内运行的工具，读是不受限的。
- `danger-full-access` 不经过 provider，没法给它加一个最低限度的约束。
- 在进程内运行的工具（MCP stdio 服务器启动、Browser、Computer use 等）不经过 `ctx.sandbox`。
- 拒绝信号只能从 stderr 识别，没有带类型的拒绝通道。

## DSH 自带的沙箱能不能直接用？

能用一部分，而且我们**已经在用**：DSH 的 `dsh-base` 组合默认就挂了 `dsh-sandbox-local` + `dsh-sandbox-policy` + `dsh-bash-sandbox`。每个 Session 的 bash、终端、PTC 都在沙箱里跑，模式是 `read-only` / `workspace-write` / `danger-full-access`。BotHarness 把 Orchestrator 设成 `workspace-write`，可写范围是这个 Bot 的 Memory（它的 cwd），Assignment 的可写范围是 Grant 的目录。

它做不到我们要的三件事：

1. **不限制读。** bwrap 把整个宿主根目录以只读方式挂进去，Seatbelt 是默认允许、只拒绝写。所以 Bot 能读到别的 Memory、数据库、凭据和财务文件夹。这正是 Team mode 最需要挡住的部分。
2. **不限制网络。**
3. **不能指定"在另一个环境里执行"。** DSH 的设计允许把 `ctx.shell`、`ctx.fs`、`ctx.subprocess`、`ctx.sandbox` 整体换成远端或容器的实现（文档里叫 "remote compositions"），但 0.2.2-rc.1 **只提供本机实现**（`*-local`、`fs-sandbox`），没有现成的容器或远端执行包。要"让 Session 在指定环境里跑"，需要我们自己写这一组 provider。

所以思路不是另起炉灶，而是**在 DSH 沙箱的基础上补上"读限制"**。下面两种做法都复用 DSH 的 bwrap/Seatbelt 和它的模式、审批、升级流程。

## 最简部署方案（第一阶段推荐）

目标：一台 VPS，不用 Docker、不用 k8s，其他人能用 Bot，Bot 读不到机密。

1. **专用用户。** 用 systemd 以系统用户 `deepseekbot` 运行 Host。`DSH_HOME=/var/lib/deepseekbot`，空间放在 `/srv/deepseekbot/{spaces,shared}`，权限都是 0700。VPS 上的其他机密（`/root`、管理员的 `~/.ssh`、其他服务的 `.env`）归别的用户，Bot 读不到。
2. **给 DSH 的 bwrap 包一层。** 配置 `dsh-sandbox-local` 的 `runnerCommand`，指向一个约 30 行的脚本。DSH 会把原本给 bwrap 的参数传给它；脚本在后面追加 `--tmpfs /var/lib/deepseekbot`、`--tmpfs /srv/deepseekbot`、`--tmpfs /home`，再把这次执行**有权访问**的目录 bind 回来：可写目录（DSH 参数里已有），加上 BotHarness 为这个 Bot 计算出的可读 Grant。bwrap 后面的挂载覆盖前面的，所以 Bot 只看得到自己那一份。这只是一行 patch 配置加一个脚本，不用写新插件。
3. **成员 Bot 禁止 `danger-full-access`**（它会完全绕过沙箱；M5 已计划只给 Owner）。
4. **本机访问也要登录**（ADR-0336 提供的选项），这样 Bot 连到 `127.0.0.1` 也拿不到 Owner 身份。
5. **回归用例**：Alice 的 Bot 用 bash 读不到 Bob 的 Memory、数据库、API key 和 `shared/finance`；每次升级 DSH 后重跑一遍。

限制：

- 可读 Grant 的列表要从 BotHarness 传给脚本。最简单的办法是 BotHarness 在每次执行前，把这个 Session 的白名单写到一个按 cwd 命名的文件里，由脚本读取。具体做法要 spike 确认。
- 脚本依赖 DSH 当前版本的 bwrap 参数格式。
- 它防的是同事之间越权查看，防不了存心攻击的人（共用内核）。
- macOS 上 `runnerCommand` 收到的也是 bwrap 风格的参数，需要脚本转写成 Seatbelt profile。所以 macOS 直接走第二阶段。

**第二阶段**是前面的推荐方案 A：DeepSeekBot 自己实现 `ctx.sandbox` provider，按 `sessionId` 在进程内计算白名单，不依赖参数格式，同时覆盖 macOS。之后再考虑网络策略和配额 slice。

## Keep it simple：公司几个人共用一台 VPS，机密也在机器上

前提（Vain 的意见）：

- 一台 VPS，公司里不同的人在上面跑各自的 Bot。
- 访问方式除了局域网和 Tailscale，还有 Cloudflare Tunnel：Quick Tunnel 用于试用，自己的 Named Tunnel 用于固定地址。
- 机密暂时还是要放在这台机器上。
- 不引入 Docker 或 k8s。

在这个前提下，**读限制不能再推迟**：只要机密在机器上，DSH 自带沙箱"不限制读"这一点，就意味着任何成员的 Bot 都能读到机密。好在第一阶段的包装脚本本身就很轻。完整清单如下，整体只有一台机器、一个服务、一个脚本：

| #   | 做什么                                                                                                                                                                             | 为什么                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | Host 以系统用户 `deepseekbot` 通过 systemd 运行；`DSH_HOME=/var/lib/deepseekbot`；空间放在 `/srv/deepseekbot/{spaces,shared}`；权限都是 0700                                       | Bot 的命令以这个用户运行，读不到机器上其他用户的文件                                                   |
| 2   | **机密按受众放进对应空间**：财务资料放在 `shared/finance`（受众是财务角色），个人机密放在 `spaces/<本人>`；API key 放在 DSH 的凭据存储里（位于 `DSH_HOME`）                        | 第 3 条的脚本只会把有权限的目录挂进去                                                                  |
| 3   | **`runnerCommand` 包装脚本**：隐藏 `DSH_HOME`、`/srv/deepseekbot` 和 `/home`，只 bind 回这次执行有权访问的目录；加上 `--unshare-net` 之外的网络限制（见下）                        | 成员 Bot 读不到别人的 Memory、财务资料、API key 和 token                                               |
| 4   | 沙箱网络：禁止访问回环、`169.254.0.0/16`、私有网段和 `100.64.0.0/10`，只放行公网                                                                                                   | 防止接管 Bot Browser 调试端口、访问 Host API、访问 tailnet                                             |
| 5   | 成员 Bot 不能升级，`danger-full-access` 只给 Owner                                                                                                                                 | 否则会绕过第 3、4 条                                                                                   |
| 6   | **入口**：Named Tunnel 前面加 **Cloudflare Access**（只允许公司邮箱通过邮件验证码登录，免费额度足够小团队），然后才是 Tobs 自己的账号密码；Quick Tunnel 只用于短时间演示，用完即关 | Tunnel 让 Host 暴露在公网上，登录页任何人都能访问；Access 先挡掉陌生人，Tailscale ACL 不再是唯一的边界 |
| 7   | cgroup：每个账号限制 CPU、内存、进程数                                                                                                                                             | 防止一个人的 Bot 拖垮所有人                                                                            |

已查证：经过 tunnel 进来的请求，虽然在 Host 看来来自 `127.0.0.1`，但 `passwordTransportAllowed`（`packages/core/src/team/http.ts`）在看到 `X-Forwarded-For` 等代理头时，就不再给它本机豁免。所以 tunnel 不会被当成本机访问。（未验证：Quick Tunnel 和 Named Tunnel 下成员密码登录走的是哪条允许路径，是 TLS 判断还是 `isConnectRequest`。需要实测一次成员通过 tunnel 登录。）

这样做到的程度：同事之间互相看不到对方的 Bot 记忆和受众外的机密，陌生人进不了登录页。做不到的：防不了存心攻击的内部人员（共用内核、Host 进程自己的漏洞）。真正高价值的数据，以后还是放到单独的 Host 上。

工作量：一个 systemd unit、一个包装脚本（包括网络限制）、Cloudflare Access 配置文档，加上两条回归用例（"Alice 的 Bot 读不到 Bob 的 Memory 和 `shared/finance`"、"成员 Bot 连不上本机端口"）。预计三到五天。

## 试用阶段：先别做得太严肃（Vain 的意见）

小公司先来试用时，权限问题并不严肃，同事之间默认互相信任。这个阶段**只做几件几乎零成本、又能保护 Owner 真正机密的事**，沙箱工作推迟到"开始放真实机密数据"之前：

1. **不要在 Owner 自己的 Mac 上开放给别人**，用一台单独的 VPS 或闲置电脑。否则成员 Bot 读得到 Owner 的 `~/.ssh`、浏览器登录状态和其他私人文件。
2. VPS 上用专用系统用户运行 Host，机器上不放其他机密。
3. 成员 Bot 不能用 `danger-full-access`，也不能申请升级（M5 已计划）。
4. Tailscale ACL：成员只能访问 Host 的端口。
5. **如实告知**：在 Team mode 设置页和邀请说明里写清楚——"试用阶段，成员的 Bot 在技术上可以读到这台 Host 上其他 Bot 的记忆和文件，请不要放入机密数据"。ADR-0336 本来就把第一阶段定义为同事之间的权限隔离，这条声明让它名副其实。

完成"最简部署方案"（读限制）和第 0、1 层之后，再把这句告知改成"成员之间互相不可见"，并开始允许放敏感数据。财务这类高敏感数据，任何阶段都建议放在单独的 Host 上。

## 威胁模型：有账号、能控制自己 Bot 的攻击者

前提：攻击者没有 root 和 Owner 身份，只能通过 Tailscale 或局域网访问 Host（Web 端，或者桌面端 Tobs 以 remote Host 方式连接），有一个成员账号，可以让自己的 Bot 执行任意命令。

### 人怎么连进来，和 Bot 能连到哪里，是两回事

成员只走 Web 或 remote Host，这限制的是**人**的入口。Bot 的命令是**在 VPS 本机上**执行的，所以在 Bot 看来，Host 就在 `127.0.0.1` 上，同时也在这台 VPS 的 Tailscale 地址上。已查证的事实：

- DSH 的 Web API **没有"本机免登录"这一档**（`dsh-client-connection` README："there is no method-specific loopback tier"）。每个进程启动时生成一个随机 launch token，必须先用它换到 Cookie。所以光能连到 `127.0.0.1` 并不等于 Owner。
- 真正的风险是**拿到 token，或者连到不需要认证的本机服务**：
  - `DSH_HOME` 里、或者 CLI 和桌面端用的 token 文件；第一阶段隐藏这些目录后，Bot 读不到。
  - 同一 UID 下其他进程的 `/proc`；bwrap 有私有 PID 命名空间，可以挡住，但 Landlock 后备和 macOS Seatbelt 下要额外确认。
  - **Bot Browser 的 Chrome 调试端口**：`packages/browser/src/runtime/browser.ts` 用 `--remote-debugging-port=0` 在本机监听，CDP 协议本身没有认证。成员 Bot 扫描本机端口，就可能接管别的 Bot 的浏览器和其中已登录的账号。
  - 其他本机服务，例如远程桌面、viewer proxy。
- 沙箱的网络和 VPS 共用，所以 Bot 还能访问整个 tailnet（以 VPS 节点的身份）、局域网，以及云服务器的元数据地址 `169.254.169.254`。

结论：不管人怎么连进来，**沙箱都需要独立的网络命名空间**（第 1 层）。

### 攻击路径（按现实程度排序）

1. **走网络**：连本机的无认证服务（Bot Browser 调试端口等）、tailnet 里的其他机器、云元数据地址。
2. **借刀杀人**：往自己可写的共享空间里放 `package.json` 安装脚本、`Makefile`、`.git/config` 里的 filter，或者提示注入文本。等权限更高的 Bot（例如财务 Bot）在那里执行或读取，代码就在财务 Bot 的沙箱里运行，它能读到的数据就可能被发出去。
3. **让 Host 进程处理恶意文件**：附件转换、解压导入、git、预览都在 Host 进程里，不在沙箱里。解析器有漏洞就等于拿到全部数据。
4. **攻击 Owner 的界面**：通过消息、GenUI、附件渲染做 XSS，在 Owner 的客户端里以 Owner 身份调用 API。
5. **权限检查的漏洞**：拿别人的 slug、Channel id、附件 id 调用 API。
6. **骗审批**：申请升级，配上一段看似无害的理由，等 Owner 或 Admin 手滑同意。
7. **拖垮服务**：fork 炸弹、写满磁盘、占满内存。
8. **内核漏洞逃逸**：用户命名空间会暴露更多内核攻击面。

### 分层防御（Vain 已同意第 0、1 层；高敏感数据单独放一台 Host）

| 层                    | 措施                                                                                                                                                                                                                        | 挡住                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 0（必须，几乎零成本） | 本机访问也要登录；成员 Bot 不能升级，`danger-full-access` 只给 Owner；内核自动打补丁；Tailscale ACL 只允许成员访问 Host 端口，VPS 节点不能主动访问 tailnet；每个账号一个 cgroup 限额加磁盘配额；读限制上线前不放机密        | 1 的一部分、6、7        |
| 1（随第一阶段沙箱）   | 读限制（bwrap 包装脚本）；**独立网络命名空间**：只允许访问公网，拒绝回环、`169.254.0.0/16`、私有网段和 `100.64.0.0/10`；bwrap 加 seccomp；共享空间按受众分开写，高受众 Bot 对低受众空间只读，并且不执行来自低受众空间的代码 | 1、2（部分）、8（部分） |
| 2（加固 Host）        | Bot 的执行换成另一个无权限 UID（需要一个 root helper）；附件转换、解压、git 放进沙箱；GenUI 用严格隔离的 iframe 并配 CSP；权限检查做回归和模糊测试；审批卡只允许 Owner 处理，并显示实际要执行的命令                         | 3、4、5、6、8（部分）   |
| 3（真正的敌对环境）   | gVisor 或 microVM；或者**高敏感数据（如财务）放在单独的 Host 上**，只有相关的人有账号                                                                                                                                       | 8，以及兜底             |

决定：第 0、1 层和第一阶段一起做；财务这类高敏感数据使用单独的 Host，至少在第 2 层完成之前都这样；第 3 层的 microVM 留给以后的托管版本。

## 候选方案对比

| 方案                                                                                                 | 隔离强度                         | 是否适合受众模型                                                                        | macOS                                             | 需要 root                                                                     | 本地能力（浏览器、Computer、GPU）        | 成本                                                                               |
| ---------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| **A. 每次执行的沙箱（推荐）**：自研 `ctx.sandbox`，bwrap/Landlock/Seatbelt，读写白名单加隐藏数据目录 | 中高：同一个内核，文件读写都受限 | ✅ 白名单直接等于"Memory + Grant"，共享 Bot 自然成立                                    | ✅ Seatbelt                                       | 否（Ubuntu 23.10+ 要确认 AppArmor 允许 bwrap 使用 userns，否则退到 Landlock） | 保留                                     | 中：两个平台的 profile 加回归测试                                                  |
| B. 每个成员一个 Linux 用户/用户组，Host 以 setuid helper 或 sudo 切换用户执行                        | 中高                             | ❌ 共享 Bot 和按角色的 Bot 要映射到"虚拟用户"，用户组要跟随角色变化而重算，ACL 容易漂移 | ❌ 需要管理员创建用户                             | **是**                                                                        | 基本保留                                 | 高；ADR-0336 已经否决                                                              |
| C. 每个成员（或每个 Bot）一个 Docker 容器，用 mount 区分 Memory 和共享空间                           | 中高（容器逃逸另说）             | ❌ 单位是人；共享 Bot 和共享根目录需要第三类容器                                        | ❌                                                | Host 需要 Docker socket（等于 root）                                          | 失去本机浏览器、Computer，GPU 要额外配置 | 高：要自己写容器版的 shell/fs/subprocess/terminal/PTC provider；冷启动和内存开销大 |
| D. nsjail                                                                                            | 和 A 同级                        | 同 A                                                                                    | ❌                                                | 否                                                                            | 保留                                     | 不在 DSH 的 runner 链里，参数也不兼容 bwrap，只能完全自研，没有理由优先于 bwrap    |
| E. 每个成员一个 Host，Host 之间互连                                                                  | 高（进程隔离）                   | ❌ 共享 Bot 只有一个 Memory，不能分属多个 Host；共享 Channel 需要跨 Host 联邦，现在没有 | 部分                                              | 视部署而定                                                                    | 保留                                     | 很高：身份、Channel、审批、用量全部要分布式化                                      |
| F. k8s：每个账号一个 Pod，Channel 服务独立（用户在本轮提出）                                         | 高                               | ❌ 同 C、E                                                                              | ❌ 两套产品                                       | 集群                                                                          | 失去本机能力                             | 很高，见下文                                                                       |
| G. gVisor / Firecracker microVM                                                                      | 很高                             | 作为 A 的"远端执行世界"变体可以兼容                                                     | ❌                                                | 是                                                                            | 失去                                     | 很高；只适合以后的托管多租户                                                       |
| H. macOS App Sandbox / 每个 Bot 一个 macOS 用户                                                      | —                                | —                                                                                       | App Sandbox 是给整个 App 用的，不是给每次执行用的 | —                                                                             | —                                        | 不适用；macOS 上就用 A 的 Seatbelt                                                 |

### 方案 F：k8s 每账号一个 Pod，Channel 服务独立

这个想法的优点：真正的进程和 OS 隔离、每个账号可以单独限额、可以横向扩容。但在 Team mode 里有四个硬伤：

1. **数据不按账号划分。** 共享 Bot（一个 Memory 记住所有成员）、按角色可见的 Bot、授权给角色的共享根目录，都不属于某个账号的 Pod。最后会冒出"团队共享 Pod"，还要在多个 Pod 之间共享卷（RWX 卷），隔离又回到了文件权限层面。
2. **Channel 拆出去等于重写 Host。** 现在 Channel、Inbox、Source Event、审批卡、Activity、Tob、角色权限，都在 DSH Host 里的 BotHarness 插件中，和 DSH Session 紧密耦合。把 Channel 独立成服务，需要新建一个带身份认证的服务端，每个账号的 Host 再作为它的客户端，审批和受众检查都要跨服务做。这实际上就是方案 E 再加一个中心服务。
3. **macOS 桌面跑不了。** 会变成两套部署形态和两套代码路径，违背 ADR-0336 的"single-Human Host is the one-member case"。
4. **伸缩瓶颈不在这里。** 小团队场景下，压力主要在 LLM API 和 Bot 执行的 CPU/内存上，不在 Channel 消息上。

所以建议：**如果将来要做托管、可伸缩的版本，k8s 的单位应该是"每个团队（租户）一个 Host"**，团队之间天然隔离；团队内部仍然用方案 A。要伸缩执行能力，就**把执行卸载到按需创建的沙箱 Pod**（利用上面第 5 条"整体替换执行世界"的接缝，自研一组远端 shell/fs/subprocess provider），Host 作为控制面保持为一个整体。这条路和方案 A 的白名单模型一脉相承：白名单从"bind 进 bwrap"变成"挂进执行 Pod"。

## 账号空间与配额（Vain 的产品模型）

Vain 描述的目标形态：

- Owner 创建一个账号，这个账号就得到一块"空间"，带计算和存储配额（例如 2C2G、20GB）。
- 账号在自己的空间里私下迭代自己的 Bot，每个 Bot 保留各自的私密内容（Memory）。
- 团队在 **group Channel** 里和 Bot 一起协作。
- 产出交付到 **共享空间**（共享工作区、共享文件夹或网盘），可以分享给其他人。

这套模型和推荐方案是对得上的。关键是把三件事分开：**谁在思考**（Agent loop，在 Host 里）、**在哪里执行**（账号空间里的沙箱）、**在哪里协作**（Host 的 Channel 加共享空间）。

| 产品概念      | 单个 VPS 上的实现（第一阶段）                                                                                                                                                   | 将来 k8s 托管上的实现                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 账号空间      | `/srv/deepseekbot/spaces/<humanId>/`：里面有 `bots/<slug>/memory` 和个人工作区（= M6 的个人根目录）                                                                             | 账号的 PVC                                              |
| 计算配额 2C2G | 每个账号一个 systemd/cgroup v2 slice（`deepseekbot-member-<id>.slice`，`CPUQuota=200%`、`MemoryMax=2G`、`TasksMax`）；这个账号所有 Bot 的每次执行（bwrap 进程）都放进这个 slice | 账号执行 Pod 的 `resources.limits`                      |
| 存储配额 20GB | 每个账号目录一个 XFS project quota 或 btrfs subvolume qgroup；macOS 上只做软配额（定期统计用量，超出就拒绝新的写入型执行）                                                      | PVC 容量                                                |
| Bot 私密内容  | Memory 在账号空间里，**只 bind 给这个 Bot 自己的执行**；同一账号的其他 Bot 默认也看不到                                                                                         | 同上，在 Pod 内按每次执行做 bind，或者每个 Bot 一个子卷 |
| group Channel | 继续由 Host 里的 BotHarness 负责（现有的 Channel、审批、Activity），不拆出去                                                                                                    | 仍然在团队的 Host（控制面）里                           |
| 共享空间      | `/srv/deepseekbot/shared/<rootId>/`，有自己的配额；按 M6/M7 授权给角色或成员，再作为 Grant bind 进对应 Bot 的执行（可读或可写）                                                 | RWX 卷，挂进被授权的执行 Pod                            |

### 共享 Bot 与机密空间（Vain 已决定：提供共享 Bot）

Vain 的决定：**共享 Bot 要提供，放在共享空间里**。重点是：公司财务这类机密，要放在私密、不能被随意越权访问的地方，只有有权限的人才能访问。

落地方式：共享空间不是只有"全员共享"一种，而是**按受众划分的多个空间**。每个空间都有自己的受众（ADR-0336 的 `roles:[…]` 或指定成员），共享 Bot 和共享文件夹都挂在某个空间下：

| 空间               | 受众                                 | 里面放什么                                                  |
| ------------------ | ------------------------------------ | ----------------------------------------------------------- |
| `shared/team`      | 全员                                 | 全员可用的共享 Bot 及其 Memory、全员共享文件夹              |
| `shared/finance`   | 角色 `finance`（加上被单独授权的人） | 财务 Bot（可见性 `roles:[finance]`）及其 Memory、财务文件夹 |
| `spaces/<humanId>` | 本人                                 | 私有 Bot 及其 Memory、个人工作区                            |

要守住三条线，缺一不可：

1. **人的访问**：只有受众内的人能在 Client 里看到这个空间的 Bot、Channel 和文件（M4/M7 的受众检查）；Owner 查看私有内容要走 M11 审计。
2. **Bot 的访问**：一个 Bot 执行时，只能看到"它自己的 Memory + 授权给它、并且受众覆盖它的空间"。非财务成员的私有 Bot 即使跑 `grep -r` 也看不到 `shared/finance`。**这一条必须靠读限制**：DSH 自带沙箱只限制写，不限制读，所以在推荐方案（或下面的最简部署方案）落地前，财务数据**不能**放到这台 Host 上。
3. **内容流向**：财务 Bot 只能进入受众是财务子集的 Channel（ADR-0336 的 audience containment，M7 的验收用例"非财务成员看不到、DM 不了、也不能和财务 Bot 同处一个 Channel"）。它的回答不会出现在全员 Channel 里。

存储配额：每个共享空间单独计配额，由创建它的 Admin 设定；不计入任何个人账号的配额。

注意边界：配额 slice 解决的是"谁占用了多少资源"，**隐私靠的是每次执行的白名单**（方案 A），不是 slice。同一账号的两个 Bot 共用配额，但仍然看不到对方的 Memory。

## 推荐方案（A）细节

### 白名单（每次执行计算）

- 白名单按 Session 类型和访问类型计算，与 `grant-native-tools.ts` 的 `currentRoots(session, kind)` 保持一致：
  - Orchestrator：可读写自己的 Memory；可读这个 Bot 的有效 Grant；其中 `orchestratorWrite` 为 true 的 Grant 才可写。
  - Assignment：只包含这次 Assignment 的 primary Grant（`permission.grantId`，并要求 cwd 匹配）。只有在 `orchestratorWrite` 为 true 时可写，否则只读；不包含这个 Bot 的其他 Grant。
  - 两种 Session 都有一个私有 tmp。
- 只读（所有 Session）：系统运行时目录（`/usr`、`/bin`、`/lib*`、`/etc` 中除敏感项以外的部分；macOS 上是 `/System`、`/usr`、`/Library` 的只读部分，以及 Homebrew 前缀）；托管 git（`$DSH_HOME/botharness/git`，只读）。
- 隐藏：`$DSH_HOME` 的其余部分、所有其他 Memory、其他成员的根目录、服务账号的 `$HOME`（Linux 用 tmpfs 覆盖；Seatbelt 用 `deny file-read*` subpath）。
- 网络：第一步至少挡住 Host 自己的回环端口（Linux 可以用独立的 netns 加 pasta/slirp4netns 只放行出站，；Landlock ABI≥4 的 TCP 规则只按端口区分、不区分目标地址，所以**不能用来实现"只拒绝回环"**——Landlock 后备方案不满足这条网络策略，此时应报告 `partial`，成员 Bot 按"不可用"处理；macOS Seatbelt 用 `deny network-outbound` 加 localhost 端口过滤，**都要用 spike 验证**）。外部出站先保持开放，以后再做按 Bot 的出站策略。
- 返回 `enforcement: 'full'`；做不到时（Windows ACL 只能部分生效、Landlock ABI 太旧）返回 `partial`，Team mode 对成员 Bot 视为"不可用"，回到过渡门槛。

### 平台

- **Linux VPS**：Host 作为 systemd 服务，以独立用户 `deepseekbot` 运行（不是 root，也不是登录用户），`DSH_HOME=/var/lib/deepseekbot` 权限 0700，Workspace 根目录放在 `/srv/deepseekbot/workspaces/{members/<humanId>,shared/<rootId>}`；用 `ProtectSystem=strict`、`ProtectHome=yes`、`ReadWritePaths=` 限定这两处，不设置会禁止 user namespace 的 `RestrictNamespaces`。安装 bubblewrap；在 Ubuntu 23.10+ 上要确认 AppArmor 允许 bwrap 使用 userns，否则退到 Landlock。注意：内核 5.13 的 Landlock ABI 1 **不能限制文件截断**（截断要 ABI≥3，内核 6.2+），所以只有 5.13 不足以提供完整的写保护。provider 要在运行时检测 ABI 版本和所需的访问权限；达不到要求时报告 `partial`，成员 Bot 视为不可用。
- **Docker 封装（可选）**：一个 Host 一个容器，卷挂 `DSH_HOME` 和 workspaces。容器内的 bwrap 需要允许 userns 的 seccomp/AppArmor 配置，否则只能用 Landlock。不要把 Docker socket 交给 Host。
- **macOS 桌面**：用 Seatbelt profile 做同样的白名单。`sandbox-exec` 已被标记为 deprecated，但 DSH 自己也在用；这个风险我们和 DSH 共同承担。Owner 的家目录必须在隐藏列表里。
- **Windows**：DSH 的 ACL runner 只能部分生效（读不受限），Team mode 的成员 Bot 在 Windows 上一直使用过渡门槛。

### Memory 放哪里（问题 3）

- Team mode 下，新建的成员 Bot 的 Memory 放在账号空间 `spaces/<humanId>/bots/<slug>/memory`（计入配额）；单人 Host 继续使用现有的 `$DSH_HOME/botharness/bots/<slug>/memory`。迁移复用现有的 `setMemoryDir` 和所有权证明。两种位置都归服务账号所有，权限 0700。成员不直接在文件系统里接触它，而是通过 Host 的 UI/API 查看（Owner 查看私有内容时按 M11 留审计）。
- 只有这个 Bot 自己的执行会把它 bind 进来；共享 Bot 也一样（一个 Memory，只有它自己的执行能看到）。
- Team mode 下，非 Owner 的 Bot 不允许使用自定义 `memoryDir`（`setMemoryDir` 只给 Owner），避免 Memory 落进某个 Grant 或个人根目录。M6 的"拒绝包含 Memory 的 Grant"继续生效。
- Host 自己对 Memory 运行的 git，改为在**同一个 Bot 的沙箱 profile 里**运行，或者至少统一使用最严格的参数（hooksPath、fsmonitor、忽略仓库本地的 filter/diff 驱动等）。这样 Bot 埋进 `.git/config` 的东西，最多也只能在它自己的沙箱里执行。

### Linux 用户和用户组什么时候有用

只在"成员也想通过 SSH/SFTP 直接访问自己的个人根目录"时才需要：给成员建 Linux 账号，个人根目录归该成员所有，再用 ACL 给服务账号 rwx。这是**人访问文件**的问题，不是 Bot 执行隔离的问题，第一阶段不需要做。

## 需要 DSH 提供、但目前没有的东西

1. `SandboxPolicy` 增加读白名单或隐藏列表（`readableRoots` / `hiddenRoots`），让 `fs-sandbox` 和自带的 runner 也能限制读，第三方的进程内工具也能对齐。
2. `SandboxPolicy` 增加网络策略字段（至少能拒绝回环和指定端口）。
3. `danger-full-access` 允许由部署方设置一个下限（例如"始终隐藏这些路径"），而不是完全绕过。
4. 带类型的拒绝和 runner 状态通道（目前只能从 stderr 推断）。
5. 支持按 Session 或主体选择 provider，或者在 provider 之间组合（现在一个 context 只能有一个）。
6. 一个具名的"执行世界"组合单位，让 shell、fs、subprocess、sandbox 能作为一组整体替换为远端或容器实现。

按照"DSH 上游是固定的"这一约束，1–6 只作为反馈提给上游；方案 A 不依赖其中任何一项。

## 对 M5 / M6 / M7 的影响

- **M5 #4144**：现在的写法只管"DSH 发起的 ask"（例如 `sandbox_permissions` 升级）。建议加一条**过渡门槛**：Team mode 下，当 `ctx.sandbox` 无法对成员 Bot 返回 `full` 时，成员 Bot 的每一次 Shell、终端或 PTC 调用都由 BotHarness 先发一张审批卡，只有持有 opaque-tool 权限的人能批准，卡上带"可读取整个 Host"的提示。这在 Team mode 下覆盖了 ADR-0205 的"Shell 不弹 BotHarness 审批"。方案 A 落地并返回 `full` 后，自动退回 ADR-0205 的行为。另外保留"成员 Bot 永远不进入 `danger-full-access`"。
- **M6 #4145**：路径工具和符号链接的回归测试保留，因为在进程内运行的文件工具不经过 bwrap。再加一条验收：Alice 的 Bot 通过 **Shell** 也读不到 Bob 的根目录。这条在方案 A 之前只能用"过渡门槛拒绝"来证明。M6 计算出的"根目录 → 受众"关系，正好是方案 A 白名单的输入，建议 M6 把它做成一个可复用的函数（`executionRootsFor(sessionId)`）。
- **M7 #4150**：共享 Bot 和角色 Bot 的白名单 = 它的 Memory 加上覆盖其受众的 Grant。改了受众或撤销 Grant，下一次执行立即生效（白名单每次调用都重新计算，不缓存）。
- **ADR-0336 文字修正**：把 "Execution World Provider seam" 改成真实的接缝（`ctx.sandbox` 可替换，以及 fs/subprocess/shell 可整体替换）。安全边界一节应补充：`workspace-write` 下的 Shell 可以读整个 Host。

## 建议开的 issue

1. **M5 补充：沙箱缺失时，Team mode 成员 Bot 的 Shell 类调用改为逐次审批**（阻塞 Team mode 对外宣称"成员互不可见"）。
2. **Spike：DeepSeekBot 自有 `ctx.sandbox` provider**：用 patch 停用 `sandbox` 行，换上 `@botharness/sandbox`；Linux bwrap 加 macOS Seatbelt，读写白名单加隐藏 `DSH_HOME`；回归用例为"Alice 的 Bot 通过 bash 读不到 Bob 的 Memory、DB 和凭据"。同时验证 HMR 重组以及 `runnerCommand` 后备方案。
3. **Spike：执行沙箱的网络策略**：挡住 Host 回环端口（netns 加 pasta / Landlock ABI4 / Seatbelt）。
4. **审计：Host 对 Bot 可写的 git 仓库运行 git 时的安全性**（仓库本地 config 里的 filter、diff 等驱动；统一使用加固参数，或放进 Bot 沙箱执行）。
5. **账号空间与配额**：每个账号的 cgroup slice（CPU/内存）、目录磁盘配额（XFS project quota 或 btrfs）、共享空间配额；Bot 执行进入所属账号的 slice；macOS 上只做软配额。共享 Bot 放在按受众划分的共享空间（`shared/team`、`shared/finance` 等）下，Memory 与空间同受众；回归用例为"非 finance 成员的 Bot 用 bash 读不到 `shared/finance`"。
6. **最简部署方案（第一阶段）**：`deepseekbot` 系统用户加 systemd unit，`runnerCommand` 包装脚本隐藏 `DSH_HOME`、空间目录和 `/home`，只 bind 回授权目录；包含上面的回归用例。VPS 部署文档也放在这一项里，包括目录布局、bwrap/AppArmor 检查和可选的单 Host Docker 镜像（服务账号、目录布局、bwrap/AppArmor 检查、可选的单 Host Docker 镜像）。
7. **ADR-0336 文字修正**（接缝名称、安全边界补充）。
8. **第 0 层加固清单**：本机访问也要登录、成员 Bot 不能升级、Tailscale ACL（VPS 节点不能主动访问 tailnet）、内核自动更新、cgroup 和磁盘配额；写进 VPS 部署文档并提供检查脚本。
9. **沙箱网络命名空间**（第 1 层）：拒绝回环、元数据地址、私有网段和 tailnet 网段，只放行公网；回归用例为"成员 Bot 连不上 Bot Browser 的调试端口和 Host API"。
10. **Bot Browser 调试端口的暴露**：改用 `--remote-debugging-pipe`，或者给调试端口加访问控制，不依赖网络命名空间单独兜底。
11. **Host 侧解析器放进沙箱**（第 2 层）：附件转换、Bot 压缩包导入、git。
12. **高敏感数据单独 Host 的部署指南**：财务 Host 的账号、Relationship、数据边界说明。
13. （以后）托管多租户：每个团队一个 Host 的 k8s 形态，以及远端执行 Pod 的 provider，单独写 spec。

## 未验证项

- patch `disabled: true` 替换 `sandbox` 行后，依赖它的插件能否正确重新绑定（类型层面已确认可以停用；运行时未测）。
- 已查证：DSH Web API 没有本机免登录这一档，需要 launch token。仍需确认的是：桌面端和 CLI 的 token 文件放在哪里；BotHarness 设备网关等其他本机端口是否都需要认证。
- Ubuntu 24.04 默认的 AppArmor userns 限制下 bwrap 是否可用；Docker 默认 seccomp 下 bwrap 是否可用。
- git 仓库本地 filter 驱动在 Host 现有 git 调用里能否被触发。
