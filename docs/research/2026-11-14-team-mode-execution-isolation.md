# Team mode：Bot 执行与数据隔离（VPS 与 macOS）

日期：2026-11-14 · 读者：Vain、架构师 · 状态：调研建议，不是已接受的决定
关联：spec #4137、hub #4138、[ADR-0336](../adr/0336-hosts-have-members.md)、[ADR-0205](../adr/0205-bot-sessions-follow-dsh-permission-mode-for-shell-and-plugin-tools.md)、[ADR-0067](../adr/0067-workspace-grants-bound-personabot-file-access.md)、M5 #4144、M6 #4145、M7 #4150

## 结论（先看这里）

1. **隐私的隔离单位应该是"每次 Bot 执行"；账号只作为配额和归属的单位。** 我们推荐：Host 仍是一个进程、一个 OS 服务账号；DeepSeekBot 用自己的实现替换 DSH 的 `ctx.sandbox` 提供者。每次执行 Shell、终端或 PTC 时，按 Session 找到对应的 Bot 和受众，生成一份**读写都受限**的白名单：这个 Bot 自己的 Memory、它的有效 Workspace Grant，加上系统只读目录。其余部分，包括 Host 数据目录、其他 Bot 的 Memory 和其他成员的根目录，在沙箱里看不见。Linux 用 bubblewrap（无法使用时退到 Landlock），macOS 用 Seatbelt。
2. **不推荐用"Docker 加 mount、每个成员一个容器"做主方案**，也不推荐"每个成员一个 Linux 用户"。两者的隔离单位都是"人"，而 Team mode 的数据归属单位是"Bot 的受众"：共享 Bot、按角色可见的 Bot、共享根目录都不属于某一个人。另外，两者都要求 Host 拥有 root 或 Docker socket 级别的权限，在 macOS 桌面上也做不到同等效果。
3. **Docker 在 VPS 上可以用，但只当外层封装**：一个 Host 一个容器（或一个 systemd 服务账号），作用是保护 VPS 不受整个 Host 影响，而不是让成员之间互相隔离。成员之间的隔离靠第 1 条。
4. **私有 Bot 的 Memory 放在"账号空间"里，由 Host 管理**（例如 `/srv/deepseekbot/spaces/<humanId>/bots/<slug>/memory`，归服务账号所有、权限 0700，计入该账号的存储配额），只通过沙箱的 bind 暴露给这个 Bot 自己的执行。它不放进共享空间，也不放进成员能直接通过文件系统访问的目录。
5. **Vain 提出的产品模型（Owner 开一个账号就分配一块空间，带 CPU/内存/磁盘配额，例如 2C2G、20GB；IM Channel 和共享空间是团队共用的）可以在单个 Host 上实现，不需要每个账号一个容器**：账号 = 一个 cgroup slice（CPU/内存配额）+ 一个带磁盘配额的目录，再加上方案 A 的逐次执行沙箱。同一个模型以后可以换成 k8s 后端（账号 = 带 limits 的执行 Pod），Host 和 Channel 不用改。详见"账号空间与配额"。
6. **在沙箱落地之前，Team mode 现在有一个比"Shell 审批"更大的缺口**：按 ADR-0205，`workspace-write` 下的 Shell **不弹审批**，而 DSH 沙箱**只限制写、不限制读**。所以成员 Bot 现在不经任何审批，就能读到别人的 Memory、整个 SQLite 数据库、凭据文件，以及 Owner 的家目录（macOS 上包括 `~/.ssh`）。M5 目前的写法挡不住这些。建议 M5 加一个过渡性的硬门槛（见"对 M5/M6/M7 的影响"）。
7. **关于"k8s 给每个账号起一个 Pod、Channel 服务独立出去"**：这是另一种产品形态（多租户 SaaS），不适合作为 Team mode 的隔离手段。如果以后要弹性伸缩，伸缩单位应该是**每个团队一个 Host**，或者**把执行（沙箱）卸载到可伸缩的执行 Pod**；Host 本身（身份、Channel、Memory、审批）保持为一个整体。详见"方案 F"。

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

1. **`ctx.sandbox`（`SandboxProvider.confine(argv, policy, signal) → { argv, enforcement, denialSignatures, runnerFailureRules }`）是可替换的抽象 Service。** 每次调用都会带上 `policy.sessionId`，所以我们自己的 provider 能通过 BotHarness 的 `ownership.resolve(sessionId)` 找到 Bot、owner 和受众，自己算出读写白名单，再返回 bwrap 或 sandbox-exec 的 argv。所有经过沙箱的消费者（bash、pwsh、terminal、PTC）都会自动走这条路。
2. **Cordis patch 可以停用 DSH 的行。** `cordis-plugin-include` 的 `PatchOptions` 支持 `{ id, disabled }`，所以 `packages/deepseekbot/cordis.patch.yml` 可以写 `- id: sandbox` + `disabled: true`，再 insert `@botharness/sandbox` 提供 `ctx.sandbox`。（需要用 spike 实测：停用后服务依赖能正确重新绑定，HMR 重组也正常。）
3. **后备方案：`dsh-sandbox-local` 的 `runnerCommand` 配置**。可以指定一个自定义 runner；DSH 会把 bwrap 兼容的参数追加给它，并跳过探测。runner 只能从这些参数里的 bind 路径反推是哪个 Bot，比较脆弱，只在第 2 条走不通时使用。
4. `dsh-sandbox-policy` 提供 `resolve({ session })` 和 `setSandboxMode`（BotHarness 已经在用），用来强制成员 Bot 不能进入 `danger-full-access`。
5. 执行世界可以整体替换：DSH 文档说"remote compositions replace all three providers"（`ctx.fs`、`ctx.subprocess`、`ctx.sandbox`，加上 `ctx.shell`）。这是将来"把执行卸载到容器或远端"的路线。注意：DSH 里**没有**一个叫 "Execution World Provider" 的单一 Service，ADR-0336 的这个说法应该改成"fs/subprocess/sandbox/shell 这一组 provider"。

**不可用或缺失（只能在我们这侧绕开，或者记为对 DSH 的诉求）：**

- `SandboxPolicy` 没有读白名单，也没有网络字段。我们自己的 provider 可以不依赖这些字段自己做到，但 DSH 自带的 `fs-sandbox` 仍然不限制读。好在 BotHarness 的原生文件工具已经有自己的检查；第三方插件里在进程内运行的工具，读是不受限的。
- `danger-full-access` 不经过 provider，没法给它加一个最低限度的约束。
- 在进程内运行的工具（MCP stdio 服务器启动、Browser、Computer use 等）不经过 `ctx.sandbox`。
- 拒绝信号只能从 stderr 识别，没有带类型的拒绝通道。

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

需要和产品模型对齐的一个问题：**ADR-0336 里的"共享 Bot"**（一个 Memory 记住所有成员的对话）在这个模型里放在哪？建议：共享 Bot 归属"团队空间"（Owner 或创建它的人管理，配额记在团队空间上），Memory 放在 `/srv/deepseekbot/spaces/team/bots/<slug>/memory`，执行规则不变。如果产品上决定不要共享 Bot（每个 Bot 都只属于一个账号，团队协作只通过 group Channel 和共享空间完成），那么模型会更简单：一个账号就是一个完整的隔离单位，换成 k8s 的"每账号一个执行 Pod"也更顺。**这个问题需要 Vain 决定。**

注意边界：配额 slice 解决的是"谁占用了多少资源"，**隐私靠的是每次执行的白名单**（方案 A），不是 slice。同一账号的两个 Bot 共用配额，但仍然看不到对方的 Memory。

## 推荐方案（A）细节

### 白名单（每次执行计算）

- 可读写：这个 Bot 自己的 Memory（Orchestrator），或者当前 Assignment 的 Grant；`orchestratorWrite` 打开时加上可写的 Grant；一个私有 tmp。
- 只读：其他有效 Grant；系统运行时目录（`/usr`、`/bin`、`/lib*`、`/etc` 中除敏感项以外的部分；macOS 上是 `/System`、`/usr`、`/Library` 的只读部分，以及 Homebrew 前缀）；托管 git（`$DSH_HOME/botharness/git`，只读）。
- 隐藏：`$DSH_HOME` 的其余部分、所有其他 Memory、其他成员的根目录、服务账号的 `$HOME`（Linux 用 tmpfs 覆盖；Seatbelt 用 `deny file-read*` subpath）。
- 网络：第一步至少挡住 Host 自己的回环端口（Linux 可以用独立的 netns 加 pasta/slirp4netns 只放行出站，或者用 Landlock ABI≥4 按端口拒绝 connect；macOS Seatbelt 用 `deny network-outbound` 加 localhost 端口过滤，**都要用 spike 验证**）。外部出站先保持开放，以后再做按 Bot 的出站策略。
- 返回 `enforcement: 'full'`；做不到时（Windows ACL 只能部分生效、Landlock ABI 太旧）返回 `partial`，Team mode 对成员 Bot 视为"不可用"，回到过渡门槛。

### 平台

- **Linux VPS**：Host 作为 systemd 服务，以独立用户 `deepseekbot` 运行（不是 root，也不是登录用户），`DSH_HOME=/var/lib/deepseekbot` 权限 0700，Workspace 根目录放在 `/srv/deepseekbot/workspaces/{members/<humanId>,shared/<rootId>}`；用 `ProtectSystem=strict`、`ProtectHome=yes`、`ReadWritePaths=` 限定这两处，不设置会禁止 user namespace 的 `RestrictNamespaces`。安装 bubblewrap；在 Ubuntu 23.10+ 上要确认 AppArmor 允许 bwrap 使用 userns，否则退到 Landlock（内核 ≥5.13，读写都能限制）。
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
5. **账号空间与配额**：每个账号的 cgroup slice（CPU/内存）、目录磁盘配额（XFS project quota 或 btrfs）、共享空间配额；Bot 执行进入所属账号的 slice；macOS 上只做软配额。需要先由 Vain 决定共享 Bot 的归属（团队空间，还是不再提供共享 Bot）。
6. **VPS 部署文档和 systemd unit**（服务账号、目录布局、bwrap/AppArmor 检查、可选的单 Host Docker 镜像）。
7. **ADR-0336 文字修正**（接缝名称、安全边界补充）。
8. （以后）托管多租户：每个团队一个 Host 的 k8s 形态，以及远端执行 Pod 的 provider，单独写 spec。

## 未验证项

- patch `disabled: true` 替换 `sandbox` 行后，依赖它的插件能否正确重新绑定（类型层面已确认可以停用；运行时未测）。
- 回环地址不带 token 时是否被当作 Owner（ADR 写的是 Desktop/loopback 默认就是 Owner；即使不是，Bot 也能从数据目录读到 token）。
- Ubuntu 24.04 默认的 AppArmor userns 限制下 bwrap 是否可用；Docker 默认 seccomp 下 bwrap 是否可用。
- git 仓库本地 filter 驱动在 Host 现有 git 调用里能否被触发。
