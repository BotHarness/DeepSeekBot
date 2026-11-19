# DSH 插件客户端（浏览器半边）构建模板对比选型：rewind / compass / dsh-market

## 0. 元信息

| 项         | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 问题       | DSH 官方不发布 client 构建 preset（仅仓库内 `packages/client/tsdown.client.ts`），`@botharness/client`（M3）必须自建等价物。本文把三家社区模板——A `SiriLee/dsh-rewind`（esbuild 手写链）、B `Happy2Git/dsh-compass`（tsdown 极简双 config）、C `dsh-market/dsh-market`（tsdown + 规范化 + CI 产物门）——与官方 preset 的产物契约逐项对齐，给出主选/副选、应吸收的局部、我们的差异项与 M3 落地清单。这是 `docs/client-bridge.md` §6「构建风险」、ADR-0023 后果第 4 条（M3 最大工程风险）的选型收口。                                                                                                                                             |
| 上游       | 官方：`deepseek-ai/deepseek-harness`（WSL 克隆 `/tmp/dsh-src-client`）。A：`https://github.com/SiriLee/dsh-rewind`（`/tmp/ui-dives/rewind`）。B：`https://github.com/Happy2Git/dsh-compass`（`/tmp/ui-patterns/dsh-compass`）。C：`https://github.com/dsh-market/dsh-market`（`/tmp/dsh-market`）。备选：`wolfsonliu/dsh-file-explorer`（`/tmp/ui-patterns/dsh-file-explorer`）、`toolclub/dsh-agent-team-gui`（`/tmp/ui-patterns/dsh-agent-team-gui`）、`miuzel/dsh-subagent-ui`（`/tmp/ui-dives/subagent-ui`）。                                                                                                                             |
| Pinned SHA | 官方 `ddefc45fbc7f8e46dd73185e68295696d1297887`（2026-09-17，`0.1.6-alpha.2`）；A `9b26ab463def45dd073ac950a26925fccd40e6c8`（2026-09-18，v0.13.0-alpha.2）；B `2676d15afb2b9d5a4a62715ea4c83fa7619081e0`（2026-08-18，v0.15.0）；C `66692ceb0e8f87a9cfbc7e2e6cb9a6b718ebf98f`（2026-09-19，v1.48.0）。备选：file-explorer `d0eedac095315f10e86c7e372e05e51be07c6e0b`、agent-team-gui `14ea11960b20b1f93c33541ba9df7746ed16d08a`、subagent-ui `e1c7fc262b41049b05ba4247d48c9a1c24b7b67a`。                                                                                                                                                     |
| 调研方法   | 一手来源优先：全部仓库为 `git clone --depth 1` 后逐文件读源码/脚本/CI/package.json；官方侧亲读 `docs/development.zh.md`、`packages/client/tsdown.client.ts`、`packages/client/web/src/platform.ts`、`docs/cookbook/adding-a-settings-card.md`、`docs/user/develop/basic/publish.zh.md`、`docs/cordis-tutorial/01..07`、`packages/client/modules/README.md`、`packages/client/hmr/README.md`、`packages/client/AGENTS.md`。本仓既有结论（`2026-09-19-dsh-plugin-authoring-client.md`、`2026-09-19-dsh-client-ui-common-patterns.md`、`2026-09-19-dsh-client-ui-flagship-dives.md`、`2026-09-19-dsh-market-deep-dive.md`）直接引用、不重复推导。 |
| 边界       | **未安装、未构建、未运行任何候选模板**；浏览器/HMR/安装行为均来自源码与文档，相关结论标「未验证」。本仓工具链事实（tsdown `0.23.0`、无 `.github/` CI、`packages/core` 用 `dist/`）来自只读检查。除目标文件外未写任何文件。                                                                                                                                                                                                                                                                                                                                                                                                                     |

**一句话结论：官方把 client bundle 的构建完整留在仓库内（无已发布 preset），仓库外只能自复刻；三家候选里 C（dsh-market）的 tsdown 链是唯一被 CI 与真实宿主浏览器 e2e 长期锤炼、且把可复现细节（一行 banner、仓库相对路径、class map 排序）做成机械门的一版——建议以其为骨架，起点形态取 B 的极简双 config，验证层吸收 A 的构建后 smoke 断言与 build hash，externals 换回官方 9 项基线；产物不提交（`prepare`/`prepack` 构建），M3.5 安装门用 tarball + link 两条路验证「产物存在且自注册」。**

---

## 1. 官方基线：仓库内怎么构建 client，仓库外缺什么

### 1.1 `docs/development.zh.md` 要点（官方搭建/构建教程）

| 事实                                                                                                                                                                                                                          | 原文位置                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Host 与 Client 是两个隔离的 tsconfig aggregate；**普通 Client 插件的两份运行时产物都在 Client 构建阶段生成**（不是 host 阶段）                                                                                                | `docs/development.zh.md:56-74`（结论句 `:72`） |
| 根构建按生成依赖排序：host tsc → host tsdown → client tsc → client tsdown → `build:web`                                                                                                                                       | `docs/development.zh.md:76-84`                 |
| 两次 tsdown 用同一组 workspace 匹配，按 `DSH_BUILD_FACE` 选面；tsdown 只消费前置 tsc 发出的 `lib/types` JS                                                                                                                    | `docs/development.zh.md:86`                    |
| `pnpm run build` 内联根包版本 + 七位 commit（+dirty 标记）与其他 `DSH_CLIENT_*` 公开值；`dev:web` 仍需先完成一次完整构建准备产物树，但不会校验构建记录                                                                        | `docs/development.zh.md:90`                    |
| 消费构建产物的门禁（publint、NodeNext 声明校验）必须先 build                                                                                                                                                                  | `docs/development.zh.md:96-102`                |
| 仓库内新插件清单是「五件套」：`package.json` + `tsconfig.json` + `tsdown.config.ts`（`clientBundle(...)`）+ 空 node 半 `src/index.ts` + `src/client/`，另有三个注册面（aggregate references、web-app patch 行、web-app 依赖） | `packages/client/AGENTS.md:136-145`            |

**仓库内与仓库外的关键落差**：这套流程依赖「根 solution + 两个 aggregate + 全 workspace tsdown + lib/types 前置发射 + Typert 生成」。仓库外只有单包，`pnpm build` 的等价物必须自己写：一份自包含 tsdown 配置（直接编译 `src/client/`，不做项目引用、不做 Typert）+ 一个薄宿主半作为 Loader entry。

### 1.2 官方 preset 的完整产物契约（`packages/client/tsdown.client.ts`，735 行）

| 契约            | 内容                                                                                                                                                                                                 | 行号                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 两半一次产出    | `clientBundle(id, libEntry)` 在 Client 面同时产出 Node 库与浏览器 bundle；`clientEntry = lib/types/client/index.js`                                                                                  | `:110-127`（`:118,:121-125`）                 |
| 浏览器 bundle   | `format: 'cjs'`、`platform: 'browser'`、`outDir: 'lib'`、入口固定 `lib/client.js`、chunk `client.[name].js`                                                                                          | `:473-490`、`:604-608`                        |
| lazy-CJS 自注册 | banner：`window.__ModuleLoader__.load({ id, [chunk: ...] factory: (require) => {`；footer：`return module.exports; } });`；intro 造 `module`/`exports`                                               | `:618-624`                                    |
| externals       | `PLATFORM_MODULES` + `PRELOADED_CLIENT_EXTERNALS` 隐式 external；`dsh.client.external` 追加精确请求；其余全部内联（`neverBundle`/`alwaysBundle` 对偶）                                               | `:401-425`、`:491-499`                        |
| 纯度门          | 跨插件 `@deepseek-ai/*` 值导入若既非请求外部、也非 `INLINE_SAFE`/生成 `/remote`/vendored 库，构建直接报错                                                                                            | `:64`、`:528-546`                             |
| CSS Modules     | `*.module.css` → lightningcss、类名 `[hash]_[local]`、class map **在发射时按 local 排序**、factory 执行时注入幂等 `<style data-plugin data-plugin-css>`；`*.css?inline` 导出文本；普通 `.css` 也注入 | `:30-56`、`:547-571`（排序 `:566-569`）       |
| sourcemap       | `sourcemap: true`；`sourcemapExcludeSources: false`；把 `lib/types` 的 tsc map 链进产物（拒绝实验性输入）                                                                                            | `:489`、`:604-617`、`:683-713`                |
| 构建期环境      | 静态替换 `DSH_CLIENT_*`（公开值）、`NODE_ENV`、`import.meta.env`                                                                                                                                     | `:520-527`；`packages/client/AGENTS.md:70-72` |
| chunk 与入口戳  | `import()` 编译为 `require.async("./client.<name>.js")`；写完所有输出后 `utimes` 把入口 mtime 推晚，供 HMR 判定 revision                                                                             | `:437-471`（touch `:462-469`）                |
| 基线模块表      | `PLATFORM_MODULES` 9 项 + `PRELOADED_CLIENT_EXTERNALS`（当前空）                                                                                                                                     | `packages/client/web/src/platform.ts:8-18`    |

### 1.3 「无已发布 preset」原文与外部包自复刻

> "Inside this repository `tsdown.config.ts` is three lines over the shared preset… **No published preset exposes this package, so a package outside this repository has to reproduce the same output format itself.**"
> — `docs/cookbook/adding-a-settings-card.md:94-102`（结论句 `:102`）

同页还确认了两条外部包约束：跨插件不能值导入（纯度门），卡片 chrome/staging 只能自绘（`:102`）。官方教程的另一侧（打包/安装）明确：git 安装只拿源码，作者必须提供**自包含**的 `prepare`（不能假设旁边有 monorepo checkout），用户侧 pnpm ≥10 需 `allowBuilds` 授权；不想让用户授权就发 npm 或 tarball（`docs/user/develop/basic/publish.zh.md:155-178`，自包含句 `:163`、allowBuilds 示例 `:164-173`、tarball 替代 `:175-178`）。

### 1.4 官方教程覆盖到哪一步

- `docs/cordis-tutorial/01..07` 全程是 **host 侧插件**教学：第一个插件、生命周期/effect、服务、事件、配置、组合与 HMR、注册工具（`01-first-plugin` 至 `07-into-the-harness`，07 结尾只导向工具/能力/架构文档，见 `07-into-the-harness.zh.md:97-108`）。**没有一页讲 client bundle 怎么构建。**
- `docs/user/develop/basic/index.zh.md:1-5` 把「最小插件加载进 Web UI」讲成「终端打印一行日志」；`tool.zh.md`/`config.zh.md`/`publish.zh.md` 分别覆盖工具 DSL、配置 schema、bundle/profile 安装，均不涉及 `dsh.client`、slots、客户端产物。
- 唯一触及 client 打包的官方文本是 cookbook `adding-a-settings-card.md` §2/§Packaging（`:48-102`）+ 子系统文档（`packages/client/modules/README.md`、`hmr/README.md`），且只给契约不给构建实现。
- **结论**：官方教程教到「host 半 + 安装」为止；从 client 源到 `lib/client.js` 的构建是文档空洞，外部包必须按 §1.2 的 preset 契约自行复刻（这也是三家候选与生态 12 家全部自建/借用的原因，见既有调研 `2026-09-19-dsh-client-ui-common-patterns.md:234`）。

### 1.5 外部包必须自己实现的清单（官方 preset 的不可复用部分）

1. CJS + `platform: browser` + 固定 `client.js` 文件名；
2. 手写 banner/footer/intro 的 lazy-CJS 自注册（preset 不导出这段，只是同文件里的配置）；
3. baseline externals 硬编码（外部包没有 `web/src/platform.ts` 可 import）+ `dsh.client.external` 追加（官方 preset 从包清单读，`tsdown.client.ts:415-425`）；
4. 其余依赖全部内联的 `noExternal` 兜底；
5. CSS Modules 虚拟模块 + lightningcss + 幂等 `<style>` 注入；
6. sourcemap（含 `lib/types` 链图，外部包若直接编译 `src/` 则退化为普通 map）；
7. `NODE_ENV`/`import.meta.env` define；
8. 等价的「跨插件值导入」纯度检查（可退化为构建后扫描/静态规则）；
9. 多输出时 `require.async` 改写与入口 mtime 戳（单输出可暂免）。

---

## 2. 三家模板逐维对比

### 2.0 总表

| 维度             | A rewind（esbuild 手写链）                                                              | B compass（tsdown 极简双 config）                                        | C dsh-market（tsdown + 规范化 + CI）                                                                     |
| ---------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 构建器           | esbuild `^0.28.2`，host ESM + client CJS 两段；tsc 出声明                               | tsdown `^0.22.0`，自包含双 config；`prepare` 只转译不查类型              | tsdown `^0.22.14` + tsc（host）+ 后处理脚本；`prepare`/`prepack` 全构建                                  |
| lazy-CJS 自注册  | **手写字符串拼接**（`build.mjs:100-113`）                                               | **手写 outputOptions banner/footer/intro**（`tsdown.config.ts:121-126`） | **手写 outputOptions banner/footer/intro**（`tsdown.config.ts:121-126`）                                 |
| externals 覆盖度 | 4/9 基线（`build.mjs:89`）                                                              | 7/9 基线 + 4 项非基线（`tsdown.config.ts:31-43`）                        | 4/9 基线（`tsdown.config.ts:26`）                                                                        |
| CSS Modules      | 无（字符串 CSS + token）                                                                | 有（lightningcss 虚拟模块；绝对路径喂 hash，class map 未排序）           | 有（同原理；仓库相对路径喂 hash + 显式 targets + class map 排序）                                        |
| sourcemap        | false（两端）                                                                           | true                                                                     | **false**（理由：提交产物 + 789KB 单行 map 的冲突税）                                                    |
| HMR 兼容         | 单输出，watch 重写即新 mtime；无显式入口戳                                              | 单输出；无显式入口戳；无 watch 说明                                      | 单输出；normalize 在构建后重写文件（mtime 自然late）；无显式戳                                           |
| 可复现/产物治理  | 源码 hash 注入运行期；产物不提交（`.gitignore` 忽略 `lib/`）                            | 无专门治理；不提交                                                       | **一行 banner/路径归一+泄漏门/class map 排序 + 产物提交 + CI diff 门 + preflight**                       |
| 验证层           | **构建后 smoke 断言最多**（wrapper/id/define/公开导出/声明/删除导出守卫）+ `check` 串联 | 无（3 个纯逻辑测试，无 CI；最后 push 2026-08-18）                        | CI 矩阵 ubuntu+windows：typecheck→build→committed-artifact diff→vitest→preflight→真实 dsh + Chromium e2e |
| 依赖成本         | esbuild + tsc + vitest + jsdom                                                          | tsdown + lightningcss + TS（无测试框架）                                 | tsdown + lightningcss + TS7 + vitest + jsdom + testing-library + playwright                              |
| 与本仓契合       | 引入第二个 bundler（esbuild），放弃已用 tsdown 链                                       | **同族 tsdown，配置最短**                                                | tsdown 同族；附带 2 个 `.mjs` 后处理 + CI 门，本仓目前无 CI                                              |
| 主要风险         | esbuild 输出形状变化靠 smoke 兜底；无 CSS Modules；`prepare` 门槛                       | 停更、无 CI、无验证；class hash/顺序不可复现；`prepare` 无类型门         | 576KB 产物提交的维护税；sourcemap 关闭；窄 externals；82 open issues                                     |

### 2.1 构建器与产物格式

- **A（esbuild）**：`scripts/build.mjs:22` 引 esbuild；host `bundle: true, format: 'esm', platform: 'node', external: ['@deepseek-ai/*']`（`:64-73`）；client `format: 'cjs', platform: 'browser', jsx: 'automatic'` 输出 `lib/_client.js`（`:76-96`），再用字符串模板包成 `window.__ModuleLoader__.load({ id, factory: (require) => { var module = { exports: {} }; ... return module.exports; } })`（`:100-113`）；类型由两次 `tsc -p` 单独发射（`:60-61`）。lazy-CJS 是**手写**，esbuild 不做。
- **B/C（tsdown）**：都是 `format: 'cjs'`、`platform: 'browser'`、`entryFileNames: 'client.js'`、`clean: false`（B `tsdown.config.ts:101-109`；C `tsdown.config.ts:36-44`），banner/footer/intro 全手写（B `:121-126`，C `:121-126`）；C 的 outDir 是 `client/`（`:40`）而非官方 `lib/`，因为 `exports["./client"]` 指向 `./client/client.js`（C `package.json:69`），官方 preset 亦只约束 `exports` 目标而不强制目录名。tsdown/rolldown **不提供 lazy-CJS preset**；且 rolldown 会把 banner 打成三行（C 的 `normalize-client-banner.mjs:36-52` 正是为此写的，官方 preset 的一行 banner 在仓库内同样会被 pretty-print，但官方宿主只要求执行注册、不 grep 文件头，见 `packages/client/modules/src/client/system.ts` 的失败文案逻辑）。
- 官方 preset 独有的 chunk 支持（`require.async` 改写 + 入口 `utimes`，`tsdown.client.ts:437-471`）三家都**没有**；三家 `src/client` 也都没有 `import()`（本次 grep 为 0 命中），因此 M3 只要保持单 bundle，就可以暂不移植 chunk 链。

### 2.2 externals 处理与「9 项基线」映射

我们的基线（`docs/client-bridge.md:67`，出自 `platform.ts:8-14`）：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`。

| 基线项                                  | A   | B                                                                                              | C   |
| --------------------------------------- | --- | ---------------------------------------------------------------------------------------------- | --- |
| `react`                                 | 是  | 是                                                                                             | 是  |
| `react/jsx-runtime`                     | 是  | 是                                                                                             | 是  |
| `react-dom`                             | 是  | 是                                                                                             | 是  |
| `react-dom/client`                      | 否  | 是                                                                                             | 否  |
| `@deepseek-ai/cordis`                   | 否  | 是                                                                                             | 否  |
| `@deepseek-ai/dsh-client-store`         | 否  | 否                                                                                             | 否  |
| `@deepseek-ai/dsh-client-ui-slots`      | 否  | 是                                                                                             | 否  |
| `@deepseek-ai/dsh-client-ui-primitives` | 是  | 是                                                                                             | 是  |
| `@deepseek-ai/dsh-client-ui-dockkit`    | 否  | 否                                                                                             | 否  |
| 额外非基线项                            | 无  | `dsh-client-web-react`、`ui-attachment`、`dsh-client-schema-form`、`dsh-client-runtime/client` | 无  |

- **A（`build.mjs:89`）与 C（`tsdown.config.ts:26`）都只列自己运行时真正 require 的 4 项**，其余靠「没导入就不需要」；B 把 7 项基线与 4 项非基线混在一张硬编码表里（`tsdown.config.ts:31-43`）。对照 pinned 官方 `PLATFORM_MODULES`，B 的 4 项额外条目**不在基线表内**；按官方规则它们属于应在 `dsh.client.external` 声明的非基线请求（`AGENTS.md:79`），B 未声明（`package.json:26-40` 的 `dsh.client` 只有 `platform/inject`），存在「靠已注册工厂兜底、排序无保证」的隐式依赖（未验证）。
- **三家都不读自己的 `dsh.client.external`**：官方 preset 的自动映射（`tsdown.client.ts:401-425`）在外部配置里全部退化为硬编码清单；A 的 `dsh.client` 无 `external`、C 的也无（`package.json:55-63`、`:51-58`）。→ 我们的配置应把 9 项基线硬编码（不要写进清单，官方 `AGENTS.md:78` 明确禁止在 manifest 重复基线），清单 `dsh.client.external` 留空；并加一条契约测试断言「配置里的 external 列表 === client-bridge §6 的 9 项」（rewind 式 SlotMap 锁的思路，见既有调研 `2026-09-19-dsh-client-ui-common-patterns.md:196`）。
- `noExternal` 兜底：B `:114`、C `:69` 都是「不在白名单就内联」；A 靠 esbuild 的 bundle 默认（除 `external` 外全内联）。这正是官方 `neverBundle/alwaysBundle` 对偶的等价物（`tsdown.client.ts:491-499`）。

### 2.3 CSS

| 项             | A                                                                                                                  | B                                                              | C                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 方案           | 无 CSS Modules；模板字符串 + `--dsw-*` token（`src/client/styles.ts:180-181` 注释提及他包的 module.css，自身不用） | lightningcss 虚拟模块插件（`tsdown.config.ts:45-84`）          | lightningcss 虚拟模块插件（`tsdown.config.ts:75-120`）                                                                               |
| 类名哈希输入   | —                                                                                                                  | `filename: fileId`（**绝对路径**，`:63`）                      | `filename: relative(process.cwd(), fileId)`（仓库相对，`:88-97`，注释记录了 #472：绝对路径让同一提交在不同 checkout 生成不同类前缀） |
| 注入形态       | —                                                                                                                  | 幂等 `<style data-plugin data-plugin-css>`（`:70-81`）         | 同左（`:106-118`）                                                                                                                   |
| class map 顺序 | —                                                                                                                  | 按 `Object.entries` 原序（`:68-69`），无排序                   | 构建后由 `sort-class-maps.mjs:36-64` 按 key 排序                                                                                     |
| 其他           | 字号/主题完全走 token，手写 CSS 字符串                                                                             | minify；无显式 targets（`backdrop-filter` 前缀坍缩风险未处理） | 显式 targets 保留 `-webkit-backdrop-filter` 双写（`:99-102`，注释记录 Firefox 丢失事故）                                             |

关键旁证：官方 preset 在**发射时**就把 class map 按 local 排序（`tsdown.client.ts:566-569`），B 没抄这一段，才需要 C 用后处理补课。我们的 HTML 插件直接采用「仓库相对 filename + 发射时排序 + 显式 targets」三件套后，C 的 `sort-class-maps.mjs` 可以不进主链。

### 2.4 sourcemap / 调试体验 / `dev:web` HMR 兼容性

- 官方 HMR 的 revision 判定：**入口文件字节 + 完成构建的戳（mtime）**，未变化则不读内容；preset 在写完所有 chunk 后 `utimes` 入口，让「只有 chunk 变化」的重建也推进 revision（`packages/client/hmr/README.md:62`、`packages/client/modules/README.md:74`、`tsdown.client.ts:462-469`）；开发循环可用 `pnpm run dev:web` 或「用共享 client tsdown preset 的 watch 进程」（`hmr/README.md:32`），轮询默认 500ms（`:42`）。`dev:web` 之前必须先完成一次完整构建来准备产物树（`development.zh.md:90`）。
- A：两端 `sourcemap: false`（`build.mjs:72,91`）；单输出、无需 chunk 戳，`watch` 重写 `lib/client.js` 即更新 mtime；未实测。
- B：`sourcemap: true`（`tsdown.config.ts:108`），map 会随 `files` 发布（`package.json:14-25` 含 `lib/client.js.map`）；单输出；未实测。
- C：`sourcemap: false`，理由完整（`tsdown.config.ts:45-63`）：提交的 576KB bundle 本体可读、栈能指到真名，而 789KB 单行 map 每次前端 PR 都整文件冲突、且随 npm 包发布没人消费。
- 与我们的对照：`docs/client-bridge.md:66` 已定「带 sourcemap」。若产物不提交，C 的冲突税不适用，sourcemap 应保留；调试价值在预览期更高。若未来把导入 `import()` 分包带进来，必须一并移植 `require.async` + 入口戳（官方两处实现），否则 HMR 与懒加载都会被绕过（未验证）。

### 2.5 可复现与产物治理

| 机制                 | A                                                                                                  | B                                                                       | C                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 产物提交             | 否（`.gitignore` ignores `lib/`；`prepare` 构建，`package.json:71`）                               | 否（`.gitignore` ignores `lib/`；`prepare: tsdown`，`package.json:42`） | **是**（`client/` 提交；`.gitignore` 只忽略 `client/*.map`，`:11`；`prepare`+`prepack` 都会重建，`package.json:30-31`）                             |
| 机器路径清除         | 无特殊处理                                                                                         | 无                                                                      | `normalize-client-banner.mjs:54-82`：CSS 虚拟 id 绝对路径 → `src/` 相对；并扫描本机 checkout 路径/绝对 id，**发现即 exit 1**；banner 折叠时保留行数 |
| banner 单行化        | 手写天然单行（自拼字符串）                                                                         | 无                                                                      | `:36-52` 把 rolldown 三行头折成契约要求的一行前缀（空行占位保行号）                                                                                 |
| class map 排序       | —                                                                                                  | 无                                                                      | `:84-86` + `sort-class-maps.mjs`（按 key、保行数、只匹配 CSS module 形状）                                                                          |
| 构建 hash / 版本标记 | **有**：源码 sha256 前 8 位经 define 进 bundle（`build.mjs:44-52,92-95`），运行期可辨别陈旧 bundle | 无                                                                      | 无（改用 CI diff 保证「提交物=源码」）                                                                                                              |
| CI 可复现门          | 无（但 `check` 本地串 typecheck+test+build+verify+pack，`package.json:70`）                        | 无                                                                      | **有**：`ci.yml:65-76` 重建后 `git diff --exit-code client/`，失败文案附命令；矩阵 ubuntu+windows（`:39-43`）                                       |
| 发布前检查           | `verify:host` + `npm pack --dry-run`（`package.json:69-70`）                                       | 无                                                                      | `preflight.mjs:14-22`（patch 按包名 insert、client.js 必须以规定 id 开头）、`:33-41`（lockfile 不得指向镜像，否则消费者 EALLOWREMOTE）              |

### 2.6 验证层

- **A 最强且最细**：写完盘后逐条断言——host 导出 `name/inject/apply`（`:118-120`）、host 不得静态 import 已被 DSH 0.1.2 删除的 `settingsNamespace`（`:121-129`）、client 以 `window.__ModuleLoader__.load` + 正确 id 开头（`:130-132`）、define 未泄漏（`:135-137`）、boot 身份行存在（`:138-140`）、公开导出与 `.d.ts` 重导出存在（`:141-158`）。这是把「产物契约」变成构建门的参考实现，正好补 tsdown 模板最薄的一环。
- **C 最系统**：committed-artifact diff 门 + preflight + 四层测试（49 行为 spec / 11 组件 spec / 8 web e2e / pnpm 兼容；见既有深读 `2026-09-19-dsh-market-deep-dive.md:207-222`），以及真实 dsh + Chromium 的安装 e2e（`ci.yml:96-146`；`DSHM_E2E_REQUIRED=1` 防静默跳过，`:143-146`）。`tests/client-inject.spec.ts` 把「源码用到的 `ctx.*`」与 `dsh.client.inject` 双向对齐（深读 `:220`）。
- **B 无验证层**：3 个纯逻辑测试、无 CI、无构建后断言（既有横向调研 `2026-09-19-dsh-client-ui-common-patterns.md:91`）。
- 安装门衔接：C 的 preflight（产物自注册前缀 + patch 包名）几乎可以原样成为我们 M3.5 gate 的产物检查；A 的 build hash 负责「装出来的是不是这一版」。

### 2.7 依赖与工具链成本

| 项           | A                                                                                                    | B                                                                                            | C                                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 直接 devDeps | esbuild、typescript 7、vitest 4、jsdom、@types/react(-dom)（`package.json:178-186`）                 | tsdown、lightningcss、typescript、@types/react、clsx（`package.json:54-65`；**无测试框架**） | tsdown、lightningcss、typescript 7、vitest 4、jsdom、testing-library、playwright、marked（`package.json:81-103`）        |
| Node 基线    | `^22.19.0 \|\| >=24.0.0`（`package.json:20-22`）                                                     | `^22.19 \|\| >=24`（`package.json:45-47`）                                                   | CI Node 24（`ci.yml:46-48`）                                                                                             |
| 构建命令     | `build`=node 脚本；`prepare`=build；`check`=typecheck+test+build+verify+pack（`package.json:66-71`） | `prepare`/`build` = `tsdown`（`package.json:41-44`）                                         | `build`=tsc+build:client；`build:client`=tsdown+normalize；`check`=typecheck+build+restart-smoke（`package.json:24-27`） |
| 维护心智     | 手写 wrapper + 手写 externals + 手写 smoke ≈ 一份小工具链                                            | 最短：130 行配置 = 全部                                                                      | 配置 + 2 个后处理脚本 + CI 门 + 发布纪律；换来「提交物可复现」                                                           |

### 2.8 与本仓工具链的契合度

- 本仓：pnpm 12.4.2、Node ≥22、TS 7、oxlint/oxfmt、vitest 5、**tsdown 0.23.0**（根 `package.json:24-34`），`pnpm build` 目前只构建 `packages/core`（根 `tsdown.config.ts:1-11`）；`packages/core` 用 `dist/` 与 `main: ./dist/index.mjs`（`packages/core/package.json:6-15`）；**仓库没有 `.github/` CI**（`Test-Path .github` = false）。
- B/C 同属 tsdown/rolldown 家族，配置可直接长在根工具链上，唯一新增的第三方运行时编译依赖是 `lightningcss`（官方 preset 同款，`tsdown.client.ts:19`）。A 会引入第二个 bundler（esbuild），与本仓已有 tsdown 并存，且 `pnpm-workspace.yaml` 已 `allowBuilds: esbuild: true`，成本不在安装而在「两套构建语义」。
- 需要实测的版本差异：候选配置写于 tsdown `0.22.x`，本仓 `0.23.0`。已在本仓 `node_modules/tsdown` 类型里确认 `noExternal`、`deps.neverBundle/alwaysBundle`、`banner/footer` 仍存在（`dist/types-CYHmmaKd.d.mts:1187-1188` 等），但 `outputOptions.intro` 透传行为未验证（M3 首个 PR 必须冒烟）。
- oxfmt/oxlint 对新增 `*.mjs` 归一化脚本、`tsdown.config.ts` 无冲突；核心风险只是上面这条 tsdown 大版本 API 漂移。

### 2.9 风险与已知问题

| 仓库     | 自曝/观测到的风险                                                                                                                                                                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A        | 不提交产物 → git/本地安装依赖 `prepare`；pnpm ≥10 拦截构建脚本需用户 `allowBuilds`（官方 `publish.zh.md:164-173`）。无 CSS Modules（想要就得另配 lightningcss 或后处理）。手写 wrapper 依赖 esbuild 输出形状，smoke 断言正是为此存在。单一版本线策略（`dsh.engines.dsh >=0.1.6-alpha.2`，`package.json:52-54`）牺牲兼容面换可验证性。 |
| B        | 2026-08-18 后停更；无 CI、无构建断言；`prepare`「transpile 不做类型检查」（`tsdown.config.ts:18-21`），发布物无类型门；lightningcss 喂绝对路径 + class map 不排序 → 一旦提交产物即不可复现；额外 4 项非基线 external 与 pinned 基线不符（未验证的隐式宿主依赖）。                                                                     |
| C        | 576KB 未压缩 `client/client.js` 提交并发布（深读 `2026-09-19-dsh-market-deep-dive.md:251`），每次前端改动都是大 artifact diff，靠 normalize+CI diff 维持；`sourcemap:false` 在预览期调试体验打折；82 open issues（深读 `:230-233`），另有类型/槽位靠手抄、自建 HTTP 路由未继承登录保护等结构性问题（深读 `:252-253`）。               |
| 三家共有 | 未实测 HMR；rolldown/tsdown 的 banner pretty-print、`[hash]` 输入、对象键序都是「工具行为」，版本升级可能悄悄改变，必须由构建后断言/规范化兜底。                                                                                                                                                                                      |

### 2.10 采用成本估算（相对「`deepseekbot` bundle + 独立 `@botharness/client` + 空宿主半」的形态）

- **共同成本**（无论选哪家）：独立包的薄宿主半 + 作为 Loader entry 进入 `deepseekbot` patch + 安装门，约 0.5–1 人日。
- **B**：复制 ~130 行 config + CSS 插件即可跑；但必须补验证层、修 class hash 路径与排序两处可复现缺陷，且 tsdown 0.23 冒烟，约 1–2 人日到「可用」。
- **C**：复制 config + 两个后处理脚本（~150 行）并裁掉 market 专属检查（registry/lockfile），把 `client/` 改回 `lib/client.js`、externals 扩到 9 项；因本仓无 CI，「diff 门」要么随 GitHub workflow 一起新建，要么降级为本地 `pnpm build` 后的字节复现测试，约 2–3 人日到「可交付」。
- **A**：复制 ~160 行 build.mjs + smoke，但把第二套 bundler 纳入本仓并接受无 CSS Modules（或自写 CSS 后处理），加 HMR 实测，约 2–4 人日。
- 结论：B 是起点成本最低，C 的增量都花在可复现与验证上、且这些增量正是我们最需要的；A 的成本花在替换构建器上，收益主要是验证层（可单独移植）。

### 2.11 备选模板速览

- **file-explorer**（`d0eedac0`）：39 行 tsdown 双 config（`tsdown.config.mjs:10-38`），`deps.neverBundle/alwaysBundle` + 5 项 `platformModules` + 手工 banner/footer，无 CSS Modules 插件、无 normalize、无 CI、`lib/` 提交。它是「最小 tsdown 手工 banner」样板，但没有任何产物治理，Q 维证据价值有限。
- **agent-team-gui**（`14ea1196`）：66 行自包含双 config（`tsdown.config.ts:1-66`），顶部注释明确「Git prepare 不依赖旁边存在 deepseek-harness checkout」（`:1-4`），`clean:false` 说明 `pnpm pack` 的 prepare/prepack 顺序坑（`:35`）；14 项 externals 含多个非基线 `/client` 行（`:9-24`）。CI 有 quality + hermetic web smoke + exact-revision（既有调研 `common-patterns.md:139`）。若我们想要「更完整的 self-contained 配置 + 重 CI」，它是 C 之外的第二参考。
- **subagent-ui**（`e1c7fc26`）：sucrase 逐模块转译 + 删 import/export + **按固定顺序拼接** + 包 wrapper（`scripts/build.mjs:17-76`），`verify-build.mjs:1-19` 用历史 golden 做 token 级等价对比。这是「把既有手写 bundle 迁到可维护源码」的一次性迁移工具，不是可发布构建模板；**M3 不采用**，但它的 golden 思路可用于将来迁移任何遗留手写产物。

---

## 3. 推荐选型与理由

### 3.1 主选 / 副选

- **主选：C（dsh-market）的 tsdown 构建链**，起点形态取 B 的极简双 config（不搬 market 的 site/registry 专属脚本）。
  - 同族：本仓已是 tsdown 0.23 + tsc，迁移面最小；官方 preset 也是 tsdown/rolldown（CSS 同为 lightningcss）。
  - 工程证据最强：C 是唯一同时具备「产物自注册契约检查 + 可复现归一化 + CI diff 门 + 真实宿主/浏览器 e2e」的样本，且它的三条规范化规则各自对应一个已编号事故（banner 三行、绝对路径指纹、class map 抖动）——这些不是理论风险，是外置包在本预览期必然踩的坑。
  - 直接解决 ADR-0023 的最大风险：把「手写 lazy-CJS 是否被宿主接受」变成可断言、可回归的构建产物，而不是一次性赌注。
- **副选：A（dsh-rewind）的 esbuild 手写 wrapper 路线**，仅在 M3 首个 PR 冒烟发现 tsdown 0.23 的 CJS/banner/intro 契约在本仓版本上不可复用时启用。
  - 理由：换构建器是最彻底的兜底；A 的 wrapper 与验证层是手写可控的，产物契约不依赖 rolldown 的 pretty-print/键序行为；代价是放弃 CSS Modules（退回 token 字符串 CSS）。
- **B 不作为副选**：与主选同为 tsdown，只少功能不少风险；它的价值在「最简形态」，已并入主选起点。

### 3.2 主选直接采用 / 需要吸收的局部

| 来源                  | 采用项                                                                                                                                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C                     | tsdown 双 config 结构；`external` + `noExternal` 兜底；lightningcss 虚拟模块（**仓库相对 filename** + 显式 targets + 幂等 `<style data-plugin data-plugin-css>`）；发送前检查（产物以规定 id 开头、patch 按包名）；若将来提交产物则全套 normalize + CI diff 门 |
| C（官方同款，C 未抄） | class map **在发射时按 local 排序**（`tsdown.client.ts:566-569`）——这样可省掉 C 的 `sort-class-maps.mjs` 后处理                                                                                                                                                |
| B                     | 双 config 的极简写法与注释密度（起点模板）；`define` 三键（`process.env.NODE_ENV`、`import.meta.env.MODE`、`import.meta.env`）                                                                                                                                 |
| A                     | 构建后 smoke 断言清单（wrapper/id/define 未泄漏/公开导出/声明存在/被删除导出守卫）；源码 hash 注入运行期（陈旧 bundle 可辨别）；`check` 脚本把 typecheck+test+build+verify+pack 串成一条本地门                                                                 |
| 官方                  | 9 项基线 implicit external；纯度门思想（构建后扫描跨插件值导入，退化为脚本检查）；sourcemap 保留；`dsh.client.external` 留空；`utimes` 入口戳仅当引入 chunk 时再移植                                                                                           |

### 3.3 我们的差异项

1. **externals 用 9 项基线，不是 C 的 4 项窄表**：`build.mjs:89`/`tsdown.config.ts:26` 只列自用项，官方语义是「基线对所有动态 bundle 隐式成立」（`AGENTS.md:78`）。我们的配置显式列出 9 项（避免 rolldown 把 `react-dom/client` 之类意外内联出第二份实例），`dsh.client.external` 保持空；加契约测试锁「配置列表 === client-bridge §6」。
2. **产物不提交（建议）**：
   - 分发路径支持：tarball 走 `pnpm pack` 触发 `prepack` 构建（官方 `publish.zh.md:175-178`）；npm 发布同理；git/`github:` 安装走 `prepare` + 用户 `allowBuilds`（`:161-173`）；本地 link 由 M3.5 gate 显式 `pnpm build` 前置（安装调研 §6.2 已如此）。
   - 提交产物的收益（绕过被拦截的构建脚本，C 的动机见 `tsdown.config.ts:47-52`）在我们的开发/CI 环境不成立；代价（576KB diff、banner/路径/排序三条归一化税、sourcemap 必须关闭）在预览期高于收益。
   - 保留退路：若 M3.5 实测用户环境普遍无法 `allowBuilds`，再切「提交产物 + CI diff 门」，并同时复制 C 的三个 normalize 脚本。
3. **M3.5 安装门里应加的构建检查**（在既有安装门 §6.3 的 (a)–(d) 上增补）：
   - (e1) **产物存在与形状**：profile 的 `node_modules/@botharness/client/lib/client.js` 存在；文件头即 `window.__ModuleLoader__.load({`，且注册 id 与包名一致；`exports['./client']` 可解析；`dsh.client` 被扫描器接受（对照 `client-modules` 的失败文案可区分「缺产物/缺 exports/清单畸形/未注册」四类，既有调研 §8.2）。
   - (e2) **两条安装路各验一次**：`pnpm pack` 产出的 tarball（无需脚本授权）与 `github:`/link（需要 `allowBuilds`，验证「第一次 add 失败→授权→成功」的官方 UX，`publish.zh.md:164-173`）；两路都要覆盖「装完/重装/重启后仍加载」。
   - (e3) **构建自检进 gate**：`pnpm build` 之后自动跑 smoke 脚本（3.2 的 A 层），失败即 gate 失败；再加一次「连续两次构建字节一致」的复现测试（替代无 CI 阶段的 diff 门）。
   - (e4) **运行面**：`window.__DSH_BOOT__.entries` 含包名、`/plugins/.../client.js` 200、Settings→Plugins 无页内同步失败、console 无 `bundle ... loaded without registering`。
   - (e5) **HMR（手测步骤）**：`tsdown --watch` 改源码后页面自动换 bundle，旧 fiber 拆卸、无残留 `<style>`（官方失败姿势与状态丢失预期见 `hmr/README.md:48,74`）。

### 3.4 明确不选的路线

| 路线                                                 | 样本                            | 不选理由                                                                                                                             |
| ---------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 动态 import 本机 harness checkout 的官方 preset      | R12 agent-team                  | 违反「仓库自包含」，官方明说外部包 `prepare` 不能假设旁边有 monorepo checkout（`publish.zh.md:163`），CI/贡献者门槛高（既有调研 N8） |
| 依赖仓库外相对路径的 preset（`../tsdown.client.ts`） | R6 side-tasks / R8 plugin-store | 仓库不可独立构建，只能发预构建物，产物与源码一致性不可验证（既有调研 §2.6/§2.8、N1/N2）                                              |
| sucrase 逐模块拼接 / 无打包器手工 bundle 顺序即语义  | R1 subagent-ui                  | 模块顺序成为运行时语义，心智负担与回归风险最高；无 CSS Modules；只在「迁移既有手写 bundle」时用 golden 对比，不作为新包模板（§2.11） |
| `lib/` 即源码、无构建（手写 CJS）                    | R5/R10                          | 无类型检查、无复现链、版本漂移不可发现；预览期最先腐坏（既有调研 N4）                                                                |
| 以 esbuild 为唯一构建（独占路线）                    | A                               | 与主选同收益但多引入一个 bundler、放弃现成 CSS Modules 链；仅作副选兜底                                                              |
| 首版就提交 576KB 产物 + 全套 normalize/CI 门         | C 的发行形态                    | 收益在「构建脚本被封锁」的安装端，不在我们当前开发/CI；先以不提交 + 本地门落地，留可逆切换点                                         |

---

## 4. M3 构建落地清单（文件与职责；不写代码）

1. `packages/client/package.json` —— 清单与脚本：`name: @botharness/client`；`type: module`；`exports` 至少 `.`、`./client`（指向 `./lib/client.js`）、`./package.json`；`dsh.client = { platform: 'web', inject: [官方包名] }`（`external` 留空）；`files` 白名单（`lib/index.js`、`lib/client.js`、`lib/client.js.map`、可选 `lib/types`）；scripts：`build`、`typecheck`、`prepare`、`prepack`；devDeps：`react`/`@types/react`、`lightningcss`、`tsdown`、客户端类型用 `@deepseek-ai/*`（**全部 dev-only**，运行时由宿主模块表供给）。
2. `packages/client/src/index.ts` —— 空/极薄宿主半（`apply` no-op）。职责：让包成为 Loader entry，从而 `dsh.client` 被扫描（扫描对象是 Loader entries）。
3. `packages/client/src/client/index.ts` —— 浏览器半入口（`apply` 内注册 slots；RPC 调用走 `ctx.connection.rpc.call('/api','botharness/<method>',…)`）。UI 主体由 M3 功能任务展开，本清单只固定入口形态。
4. `packages/client/tsdown.config.ts` —— 自包含双 config。宿主半 ESM（`platform: node`，`@deepseek-ai/*` external）；浏览器半：`format: cjs`、`platform: browser`、`outDir: lib`、`entryFileNames: client.js`、`sourcemap: true`、`clean: false`、`external` = 9 项基线硬编码、`noExternal` 兜底、三键 define、banner/footer/intro 手写 lazy-CJS。
5. `packages/client/build/css.ts`（或 config 内联插件） —— CSS Modules：lightningcss；`filename` 用仓库相对路径；`[hash]_[local]`；显式 targets；class map 在发射时按 key 排序；每 stylesheet 一个幂等 `<style data-plugin data-plugin-css>`；`addWatchFile` 保证 watch 依赖。
6. `packages/client/scripts/verify-bundle.mjs` —— 构建后 smoke（吸收 A）：文件头/注册 id；`factory: (require)` 与 `return module.exports;`；define 未泄漏（`process.env.` 残留检查）；无绝对构建路径；无未声明的 `@deepseek-ai/*` 值导入残留；`.d.ts`（若发布）存在。
7. `packages/client/scripts/build-hash.mjs`（或并入 build） —— 源码 sha256 注入 `__BOTHARNESS_CLIENT_BUILD__`/版本，运行期可打印，用于识别陈旧 bundle（吸收 A）。
8. 根 `package.json` / `tsdown.config.ts` —— 调整 `build`：先 `packages/core` 再 `packages/client`（或引入每包 build + `pnpm -r`）；`typecheck` 覆盖 client（DOM lib + jsx 配置）；把 smoke 挂进构建后钩子。
9. `packages/client/tsconfig.json` + `src/css-modules.d.ts` —— 只做类型检查（`noEmit`），声明 `*.module.css` 与 define 全局；类型来源：devDeps 的 `@deepseek-ai/*` npm 包（版本契约未验证，服从 M3.5 gate 结论）。
10. `.gitignore` —— 新增 `packages/client/lib/`（不提交产物路线）；若改判提交，则删掉该行并把 normalize 产物纳入 review。
11. `deepseekbot` bundle 包的 `cordis.patch.yml`（M3 末期或 M3.5 建） —— 插入 `@botharness/client` 行（独立包 + 薄宿主半），与 `@botharness/core` 行并列；`package.json` 依赖同时声明两者，使 profile 安装后 client 包成为 Loader entry。
12. 安装/构建门脚本与文档 —— 把 §3.3(e1)–(e5) 写进 M3.5 gate 步骤（安装调研 §6 增补）；M3 阶段至少固化 e1/e3 为本机可跑脚本。可选第 13 项：locale 单源（zh 为 key 真源、en 编译期穷尽）+ jsdom 组件测试脚手架（吸收 C，放 M3 UI 任务内）。

---

## 5. 未验证 / 存疑

1. **tsdown 0.23 API 兼容**：候选配置全部写于 tsdown 0.22.x；本仓 0.23.0 的 `noExternal`/`deps.neverBundle/alwaysBundle`/`banner/footer` 已从类型文件确认存在，但 `outputOptions.intro` 透传、rolldown 对 banner 的 pretty-print 行为、类名哈希输入是否仅取决于 filename 均未实测（M3 首个 PR 必须冒烟）。
2. **HMR 等价性**：三家模板都未提供 watch/HMR 实测证据；自建链「单输出 + mtime 更新」预计被官方 500ms stat-poll 接受（`hmr/README.md:62`），未验证；一旦引入 `import()` 分包，官方 `require.async` + `utimes` 链必须移植（`tsdown.client.ts:437-471`）。
3. **`dsh.client.external` 留空的边界**：官方规则说基线隐式（`AGENTS.md:78`），但发布态宿主是否在所有预览版本保持一致未验证；M3.5 安装门应对真实宿主核验。
4. **B 的 4 项非基线 external**：`dsh-client-web-react`、`ui-attachment`、`dsh-client-schema-form`、`dsh-client-runtime/client` 不在 pinned `PLATFORM_MODULES`，B 也未在 `dsh.client.external` 声明；推断其目标宿主版本有对应动态行，未验证（不采纳该做法）。
5. **产物提交与否是暂定决策**：本文建议「不提交」，依赖 M3.5 对 `allowBuilds` UX 的实测；若失败则切 C 式提交 + 归一化 + CI diff，届时需新建 CI。
6. **本仓无 CI**：C 的 diff 门需要 GitHub workflow（本仓 `.github/` 不存在）；M3 先以本地「构建后 smoke + 两次构建字节比对」替代，CI 化留到仓库引入 workflow 时。
7. **lightningcss targets 与 `[hash]` 稳定性**：需用两次构建字节比对实测；官方 preset 自身喂绝对路径，说明官方也不保证跨机 hash（官方产物不提交，故无感）。
8. **pnpm 12 的 prepare/allowBuilds 行为**：本仓 `pnpm-workspace.yaml` 已有 `allowBuilds`（esbuild/workerd/puppeteer），但针对 git 依赖的 `prepare` 授权路径未实测（官方 `publish.zh.md:164-173` 描述的是 pnpm ≥10 的普适行为）。
9. **候选模板的运行时质量**：本次仅读源码，未安装/未构建/未跑测试；「可接受产物」的最终判据只能是 M3.5 安装门的真宿主验证。
10. **`@deepseek-ai/*` devDeps 版本契约**：npm 发布态（rc 线）与 pinned 宿主（0.1.6-alpha.2）的类型兼容性未验证（沿用既有调研 §10 结论）。

---

## 6. 一手来源与访问日期

> 全部仓库为 2026-09-19 只读检查（浅克隆 + 本地文件读取）；官方 Pinned SHA `ddefc45f…`，A `9b26ab46…`，B `2676d15a…`，C `66692ceb…`，备选 SHA 见 §0。

| 来源（pinned SHA 内路径）                                                                                                                                                                                                                                                                                                                                                 | 支撑内容                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/development.zh.md:56-102`                                                                                                                                                                                                                                                                                                                                           | TypeScript 双 aggregate、根构建顺序（tsc→tsdown host→client→build:web）、两份产物在 Client 阶段、`DSH_CLIENT_*` 内联、`dev:web` 前置 |
| `packages/client/tsdown.client.ts:110-127,401-425,473-499,504-546,547-625,629-713,437-471`                                                                                                                                                                                                                                                                                | 官方 preset 全契约：两半产出、externals、CSS、纯度门、sourcemap、banner/footer/intro、chunk/touch                                    |
| `packages/client/web/src/platform.ts:8-18`                                                                                                                                                                                                                                                                                                                                | 9 项 `PLATFORM_MODULES` + 空 `PRELOADED_CLIENT_EXTERNALS`                                                                            |
| `docs/cookbook/adding-a-settings-card.md:80-102`                                                                                                                                                                                                                                                                                                                          | 「无已发布 preset，外部包必须自复刻」原文 + 两半打包/exports 示例                                                                    |
| `docs/user/develop/basic/publish.zh.md:153-178`                                                                                                                                                                                                                                                                                                                           | git 安装 `prepare` 自包含要求、pnpm `allowBuilds`、npm/tarball 替代                                                                  |
| `docs/cordis-tutorial/01-first-plugin.zh.md`–`07-into-the-harness.zh.md`                                                                                                                                                                                                                                                                                                  | 官方教程只覆盖 host 侧（服务/事件/配置/组合 HMR/工具），无 client bundle 构建                                                        |
| `docs/user/develop/basic/index.zh.md:1-5`                                                                                                                                                                                                                                                                                                                                 | 「加载进 Web UI」实为 host 日志插件，不涉及客户端半                                                                                  |
| `packages/client/modules/README.md:38,46,50,66-74`                                                                                                                                                                                                                                                                                                                        | lazy-CJS 模型、`require.async`、共享模块规则、构建要求、HMR revision（入口字节+完成戳）                                              |
| `packages/client/hmr/README.md:28-48,62,74`                                                                                                                                                                                                                                                                                                                               | `dev:web`/watch、500ms 轮询、revision 判定、状态丢失与失败策略                                                                       |
| `packages/client/AGENTS.md:58-83,126-145`                                                                                                                                                                                                                                                                                                                                 | 依赖声明纪律、共享模块 9 项基线（不得重复声明）、新包清单、「改包必须重建产物」                                                      |
| `SiriLee/dsh-rewind` `scripts/build.mjs:1-159`、`package.json`、`.gitignore`、`.github/workflows/ci.yml:12-27`                                                                                                                                                                                                                                                            | A 的 esbuild 链、build hash、smoke 断言、prepare/不提交、CI 矩阵                                                                     |
| `Happy2Git/dsh-compass` `tsdown.config.ts:1-128`、`package.json`、`.gitignore`                                                                                                                                                                                                                                                                                            | B 的双 config、externals、CSS 插件、prepare、无验证层                                                                                |
| `dsh-market/dsh-market` `tsdown.config.ts:1-127`、`package.json:23-103`、`scripts/normalize-client-banner.mjs`、`scripts/sort-class-maps.mjs`、`scripts/preflight.mjs`、`.github/workflows/ci.yml:39-146`                                                                                                                                                                 | C 的 config、可复现归一化三件套、产物提交、preflight、CI diff 门与 web e2e                                                           |
| 备选：`dsh-file-explorer/tsdown.config.mjs:1-39`；`dsh-agent-team-gui/tsdown.config.ts:1-66`；`subagent-ui/scripts/build.mjs:1-76` + `verify-build.mjs:1-19`                                                                                                                                                                                                              | 简化 banner 样板 / 自包含 + 重 CI 样板 / sucrase 拼接 + golden 对比                                                                  |
| 本仓：`docs/client-bridge.md:63-70`；[ADR-0023 at the time of this research](https://github.com/BotHarness/DeepSeekBot/blob/c29037589fa5ebdd7c9eb2790421f142ff8da233/docs/adr/0023-client-bridge-is-rpc-not-cordis.md)；`PRD.md:157-167`；`docs/research/2026-09-18-dsh-plugin-installation.md:176-245`；`package.json`、`tsdown.config.ts`、`packages/core/package.json` | 既有决策与基线、M3.5 安装门现状、本仓工具链无 CI 事实                                                                                |
| 既有调研（引用结论，不复述）：`2026-09-19-dsh-plugin-authoring-client.md` §7/§9.3；`2026-09-19-dsh-client-ui-common-patterns.md` §1/§2.3-2.5/§5/§8；`2026-09-19-dsh-client-ui-flagship-dives.md` §2.3；`2026-09-19-dsh-market-deep-dive.md` §1.1-1.4/§4.1-4.3/§7.2                                                                                                        | 3.2/3.3 的候选证据与事故编号                                                                                                         |

访问日期：2026-09-19（全部）。
