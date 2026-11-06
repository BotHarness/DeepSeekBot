# DSH_CONTEXT — DeepSeek Harness / Cordis 主要术语

> **状态**：架构调研输入。通用 DSH/Cordis 结论已整理进 `.agents/skills/dsh-plugin-dev/references/context.md`；BotHarness 产品术语以根目录 `GLOSSARY.md` 与已接受 ADR 为准。
>
> 用途：统一术语表。回答「这个词是什么、不是什么」。
> 配套：`DSH_DECISION_TREE.md`（快速决策树）、`GROKBOT_ON_DSH_ARCHITECTURE.md`（产品场景输入）。
> 官方入口：[Quickstart](https://deepseek-harness.github.io/deepseek-harness/en/guide/quickstart) · [Basic Development](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/) · [Reference](https://deepseek-harness.github.io/deepseek-harness/en/reference/)

## 阅读约定

| 说法                     | 含义                                        |
| ------------------------ | ------------------------------------------- |
| **DSH**                  | DeepSeek Harness                            |
| **Cordis**               | DSH 使用的插件 / 依赖 / 事件 / 生命周期框架 |
| **durable**              | 进程结束后仍可由持久化记录恢复              |
| **live / process-local** | 只存在于当前运行时，不代表 durable truth    |
| 「推荐」                 | 架构默认选择，不代表唯一实现                |

---

## 1. 运行时容器

### Plugin（插件）

**运行时功能模块 / lifecycle container。**

一个 Plugin 可以：提供 Service、注册 Event listener、向各类 Registry 添加 Registration、注册 Tool / UI contribution、创建 child Plugin。也可以完全不提供 Service。

```text
Plugin ≠ ctx.xxx
Plugin = lifecycle + services + listeners + registrations + effects + children
```

Plugin 的生命周期由 Fiber 管理；注册项应随 Fiber dispose 自动撤销。

参考：[Basic Development](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/) · [Fiber](https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/fiber)

### Fiber

Plugin 的运行时实例与生命周期单元。拥有、撤销 effects / registrations。

### Bundle / Profile / Patch

| 术语        | 回答的问题                                                  |
| ----------- | ----------------------------------------------------------- |
| **Bundle**  | 这个 npm 包贡献什么？（`dsh.bundle` manifest + 配置 layer） |
| **Profile** | 这套运行环境由哪些 Bundle、按什么顺序组成？                 |
| **Patch**   | 后续配置 overlay（插入 / override rows）                    |

```text
Bundle = 作者发布的东西
Profile = 用户启动的 composition
「Nothing is both.」
```

**Profile 是 runtime composition，不是浏览器 Profile，也不天然等于用户身份 / cookie / Session 隔离边界。**

参考：[Package and install a plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish)

---

## 2. Capability 协作：Service / Provider / Consumer

### Service

**稳定的 capability API（command / query）。**

自然语言：「请帮我做一件明确的事，并给我结果。」

```ts
await ctx.fs.read(path);
await ctx.shell.execute(spec);
await ctx.avatar.playAnimation('wave');
```

通常有：明确 method、参数、返回值、Promise / error / cancellation、可替换实现边界；可用 `inject` 把 availability 变成插件依赖。

参考：[Services and dependencies](https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/service)

### Service Definition

**稳定 contract**（方法、参数、错误语义），不等于真正执行逻辑。

### Provider

**Service Definition 的具体实现**（Local / Remote / Container / Live2D / VRM …）。

### Consumer

**任何调用 Service 的代码**——是角色，不是固定组件类型。

常见 Consumer adapter：

| Adapter                   | 面向               |
| ------------------------- | ------------------ |
| Tool                      | 模型               |
| Event listener            | Cordis Event       |
| Web route / UI            | HTTP / 界面        |
| Scheduler / Job           | 时间 / 后台        |
| 另一个 Service / Provider | Service-to-Service |

```text
Tool ≠ Service
Tool = model-facing Consumer（把 Host capability 暴露给模型）
```

### Capability seam

```text
Consumer → Service Definition → Provider
```

Consumer 与 Definition 可保持不变，只替换 Provider（例如 `ctx.shell` 的 local / remote / container）。

---

## 3. Registry / Registration / Scope

### Registry（泛称）

**一组可动态贡献的 runtime entries + lookup + precedence / ownership / lifecycle。**

这是通用 **pattern**，常见于：

- Tool Registry
- Subagent / LSP / Skill Provider Registry
- System Prompt Section Registry
- UI Slot Registry
- Workspace Registry

**不等于** Cordis 的 `ctx.registry`。`ctx.registry` **特指 Plugin Registry**（plugin loading / Fiber lifecycle）。见 [Cordis Registry](https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/registry)。

```text
Registry = 当前有哪些 definition / provider / contribution？
Service  = 怎么使用这个能力？
```

Registry 与 Service **没有固定上下级**：Service 内部可管 Provider/Definition Registry；某条 Registration（如 bash Tool）又可成为另一个 Service（`ctx.shell`）的 Consumer。

### Registration

**某个 Plugin 向某个 Registry 登记的一条运行时 contribution。**

```text
Registry     ≈ 运行时表
Registration ≈ 表里的一行
Scope        ≈ 这行的 visibility 条件
```

可能是 Tool、Provider、Prompt section、Skill、UI Slot cell 等。

### Agent Scope

**决定 scope-aware Registry 里，某个 Agent 看得到哪些 registrations。**

```text
可见集 = global registrations ∪ 该 Agent 的 scoped registrations
```

`ScopeKey` 是 opaque object identity；默认 live Agent object 可作为 key。
**并非** Cordis 一切对象都自动受 Agent Scope 约束——只有实现了 scope-aware registry 的 subsystem 才会按 Scope 解析。

参考：[Scoped Registration](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/scope)

### Service Isolation（Realm）

**DI / service-resolution 边界**：同名 Service 在不同子树解析到不同 instance（例如不同 timeout 的 `ctx.shell`）。

```text
Agent Scope        = 「这个 Agent 看得到哪些 registrations？」
Service Isolation  = 「这里访问 ctx.shell 解析到哪一个 instance？」
```

二者正交。`isolate()` 见 [Context](https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/context)。

---

## 4. Cordis Event

### Cordis Event

**当前进程内的通知 / 拦截 / 生命周期协作。** 不是 durable truth。

自然语言：「发生了什么 / 谁要观察或拦截这个过程？」

五种 dispatch（详见 [Cordis Events](https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-api/events)）：

| Dispatch    | 要点                                                                |
| ----------- | ------------------------------------------------------------------- |
| `emit`      | 同步广播；忽略 return；不等待 Promise；fire-and-forget              |
| `parallel`  | 并发跑 listeners；等全部 settle                                     |
| `serial`    | 依次 await；顺序有意义；可 bail 提前结束                            |
| `bail`      | Chain of Responsibility；dispatcher 推进；第一个有效返回值 claim    |
| `waterfall` | Middleware；当前 listener 必须 `next()` 才进下游；可包住结果 / veto |

`bail` vs `waterfall`：

|                | Bail                    | Waterfall                 |
| -------------- | ----------------------- | ------------------------- |
| 谁推进下一个   | Dispatcher              | 当前 listener 的 `next()` |
| 怎么继续       | 返回空值                | 调用 `next()`             |
| 怎么停止       | 返回有效值              | 不调用 `next()`           |
| 能包住下游结果 | 否                      | 是                        |
| 典型           | handler / provider 选择 | policy、approval、rewrite |

**Service 调用不会自动变成 Event**；只有显式 `emit` / `parallel` / `serial` / `waterfall` / `bail` 才会。

---

## 5. Session：事实与派生

### SessionEvent

**需要永久记录、可 replay 的事实。** Session 是 typed SessionEvent 的 append-only 唯一真源；模型历史由 log 派生。

参考：[Sessions](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/session)

### `session/event`（Cordis live Event）

每个 **committed** SessionEvent 会触发统一 live 通知：

```ts
ctx.on('session/event', (session, event) => {
  /* event.type === 'tool/call' 等 */
});
```

```text
SessionEvent   = durable fact
session/event  = 「刚 commit 事实」的 process-local 通知
```

实时 UI / 动画优先听 live Agent / stream / tool lifecycle 等 Cordis events；**不要把 SessionEvent 当逐帧 UI bus**。

### Projection

```text
SessionEvent[] + reducer/fold => current read model
```

可重建的派生状态，不是另一份真相。见 [Session Projections](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/session-projection)。

### Session Persistence / Session Query

|                                 | 角色                    |
| ------------------------------- | ----------------------- |
| Session Persistence（如 JSONL） | canonical durable truth |
| Session Query（如 SQLite FTS）  | derived search index    |

参考：[Persistence](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/persistence) · [Session Query](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/session-query)

---

## 6. 执行与存储相关

### Execution World

**程序到底在哪里运行？**（本机 / Docker / remote / microVM / cloud sandbox）

### `ctx.sandbox`

当前语义主要是 **same-world subprocess 的 filesystem-effect confinement**。
container / microVM / remote 是 **whole-capability seam 的 sibling Provider**，不是 `ctx.sandbox` 的一种 provider。

参考：[Process Sandbox](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/sandbox)

### Shell / Subprocess

```text
bash Tool → ctx.shell → Shell Provider → ctx.subprocess → Subprocess Provider → OS
```

`ctx.subprocess` 是 argv/process primitive，不等于 shell command string。

### Job / Terminal(PTY) / Schedule

|                    | 适合                                                |
| ------------------ | --------------------------------------------------- |
| **Job**            | 长时间任务：start → JobId → status / collect / stop |
| **Terminal / PTY** | REPL、交互 CLI、需 controlling terminal 的 session  |
| **Schedule**       | 未来何时再投递工作（不是 Job）                      |

### Spill

大 Tool Result 存出线（`ctx.spillStore`），模型上下文只进 preview / locator。何时 spill、preview 多少由 consumer policy 决定。

### Storage / Storage Domain

存 **非 SessionEvent Log** 的产品数据；typed domain/KV，可路由 JSON / SQLite。大规模 IM / 复杂关系查询宜独立 business seam，不要把 StorageDomain 当完整 ORM。

---

## 7. UI 与边界

### Slots

Web UI composition seam。Cardinality：`single` / `list` / `keyed` / `chain` 决定冲突与共存语义。

### Typert / API Gateway

Host ↔ Client 的 typed remote boundary。

### Conversation Assembly

Session log ≠ Chat UI。把 durable event window + transient live chunks 组装成 target-neutral presentation nodes，再由 Chat / Trajectory 等渲染。

```text
Projection             = domain history → current domain state
Conversation Assembly  = event window + transient → UI presentation model
```

---

## 8. 三层 Composition

```text
Level 1  Profile / Bundles     → 启动哪些 feature packages？
Level 2  Plugin Tree / Fibers  → 如何加载与拥有生命周期？
Level 3  Registrations         → 此刻贡献了哪些 runtime entries？
```

Agent Scope 主要作用于 Level 3。

```text
Profile = Plugin 的 composition
Registry = Plugin 贡献物的 composition
```

---

## 9. 一句话速记

> **Plugin 是容器；Service 是能力正门；Provider 是实现；Consumer 是使用者；Event 是响应与扩展点；Registry 管理运行时可用条目；Registration 是其中一条；SessionEvent 是 durable 事实；Projection 是可重建读模型；Profile / Bundle 决定 Plugin 是否被加载。**
