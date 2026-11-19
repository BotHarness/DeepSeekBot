# dsh-market 代码级深读 — 社区插件市场的装配、后端机制与前端实现

## 0. 元信息

| 项         | 内容                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 问题       | 社区市占第一的 DSH 插件市场 `dsh-market/dsh-market`（npm `dshmarket`）到底是怎么搭的：包如何装配（bundle/client 两半、预构建产物、无官方 preset 的自建构建链）、后端如何做 catalog/安装/回滚/路由、前端如何挂 slot 与组织组件/CSS/i18n、工程实践与取舍；对 BotHarness M7 registry 与 M3 `@botharness/client` 各能借什么、要警惕什么。本仓既有调研（§2.5）只到 metadata 层，本文深挖到源码行。       |
| 上游       | https://github.com/dsh-market/dsh-market（浅克隆 `\\wsl.localhost\Ubuntu-24.04\tmp\dsh-market`；`gh api` 元数据：4158★ / 211 fork / 82 open issues / MIT / pushed 2026-09-19T04:36:30Z / created 2026-08-14）                                                                                                                                                                                       |
| Pinned SHA | `66692ceb0e8f87a9cfbc7e2e6cb9a6b718ebf98f`（2026-09-19 12:36:23 +0800，`ci: the artifact guard now says what to run (#643)`；`git rev-parse HEAD`）。以下所有 `src/…`、`scripts/…`、`tests/…`、`*.md` 路径均相对该 SHA 的仓库根；`/tmp/dsh-src-client/…` 指前述既有调研钉住的 DSH 上游克隆（`ddefc45f…`，0.1.6-alpha.2）                                                                            |
| npm 快照   | `dshmarket@1.48.0`；dist-tags：`latest = 1.48.0`、`beta = 1.19.0-beta.4`、`dev = 1.16.0-dev.202608191514-19afba9`（`npm view`，2026-09-19）。根 `package.json:4-6`：version 1.48.0、`type: module`、`main: lib/index.js`                                                                                                                                                                            |
| 调研方法   | 一手来源优先：WSL `git clone --depth 1` 全仓盘点后逐文件读源码/测试/脚本/CI 与仓库内文档（README/TESTING/IMPROVEMENT-PLAN/UPDATE-API-V1）；`gh api`/`gh issue list` 只用于元数据与已知问题抽样；`npm view` 只读发布态。所有 `file:line` 均为 pinned SHA 下原文。**未安装、未运行该插件，未跑其任何脚本**；运行时行为类结论标「未验证」。除本文件外未写入任何文件                                    |
| 已知边界   | ① 未运行验证：浏览器 bundle 在真实宿主上的表现、热挂载、重启助手等均为源码/测试推读；② 上游 DSH 行为以既有两份调研（`docs/research/2026-09-18-dsh-plugin-installation.md`、`2026-09-19-dsh-plugin-authoring-client.md`）的 pinned SHA 为准，发布态宿主与仓库 SHA 可能存在差异（本文发现一处，见 §3.1 注）；③ open issues 只抽样 28 条标题，未逐条复现；④ 未审计其 site/ 构建与 dshmarket.com 运营面 |

一句话结论：**dsh-market 是「一个 576KB 预构建客户端 bundle + 4728 行 HTTP 路由 + 49 个宿主行为 spec」的长在 profile 里的运维系统——它把社区插件生态里所有没人管的失败模式（目录过期、pnpm 各 major 差异、构建脚本拦截、重复 loader id、假更新、无法回滚、Windows 文件锁）一个个做成了具名状态与一键恢复；它对 BotHarness 的价值主要不在产品形态，而在一套可直接复制的「安装安全网 + 可复现客户端构建链 + 前端崩溃可诊断」工程模板，以及作为 M7 registry 的事实参考实现。它同时反证了两件事：单组件 5000+ 行的 UI 不可学，以及把「市场自身」和「进程生命周期」耦合在一起会带来大量额外风险。**

---

## 1. 形态与装配

### 1.1 包清单：一个包两半，但客户端产物是独立目录

`package.json:47-80`：

```json
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": {
    "inject": ["@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-settings", "@deepseek-ai/dsh-client-ui-theme"],
    "platform": "web"
  }
},
"exports": {
  ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
  "./update-api-v1": { "types": "./lib/types/update-api-v1.d.ts", "default": "./lib/update-api-v1.js" },
  "./client": "./client/client.js",
  "./cordis.patch.yml": "./cordis.patch.yml",
  "./package.json": "./package.json"
},
"files": ["lib", "src", "client", "UPDATE-API-V1.md", "cordis.patch.yml", "LICENSE"]
```

- **bundle patch 只有 4 行**（`cordis.patch.yml:1-4`）：`- insert: [{ id: dsh-market, name: 'dshmarket' }]`——把自己的 host 半插进 profile 层栈；没有 config 块。
- 客户端不是官方惯例的 `lib/client.js` 而是**独立 `client/` 目录**（`exports["./client"]` 是任意相对路径，合法但偏离惯例，见 §3.1）；`files` 里 `client` 与 `src` 都进 npm 包（`package.json:73-80`）。
- 客户端声明了三段 seam：locale / ui-settings / ui-theme；**模块级 client `inject` 只有 `['slots','locale','theme']`**（`src/client/index.ts:87`），另有嵌套 `settingsScope`（`index.ts:179-189`）。
- `peerDependencies` 用「预览期三连」range：`@deepseek-ai/dsh-settings: ^0.1.0-rc.7 || ^0.1.1-rc.2 || ^0.1.2-alpha.2`（`package.json:42-46`），`schemastery`/`dsh-settings` 为 optional peer（`:107-114`）；`prepare: npm run build` 让普通 `npm install` 也触发构建（`:31`），同时 `client/client.js` 已提交，**构建脚本被 pnpm 拦截的环境也能直接用**（`tsdown.config.ts:47-52` 注释、`scripts/preflight.mjs:2-7`）。

### 1.2 host 半与 client 半如何分工

| 半边      | 源码位置                                                                | 构建                                                 | 进入宿主的方式                                                                          |
| --------- | ----------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| host 半   | `src/*.ts`（根目录，tsconfig `include: src`，`src/client` 被 exclude）  | `tsc -p tsconfig.json` → `lib/*.js` + `lib/types`    | `cordis.patch.yml` 的 insert 行；`dsh.bundle.patch` 声明                                |
| client 半 | `src/client/*.ts(x)`（`tsconfig.client.json` 只做 typecheck，`noEmit`） | `tsdown` → `client/client.js`（再经 normalize 脚本） | `dsh.client` 声明 + `exports["./client"]`，宿主扫描 Loader entry 后经 `/plugins/…` 提供 |

- 两半共享的只有**字符串与类型形状**：`src/client/market-data.ts:1-8` 明确「client bundle 不能 import server 模块」，因此把 `isGenerationSpec`（`market-data.ts:127-134`）等纯逻辑各写一份；Diagnostics.tsx 把 `CheckReport` 等接口重新声明（`src/client/Diagnostics.tsx:11-96`）。
- host 半没进 bundle 的依赖：运行时 `dependencies` 只有 `js-yaml`、`undici`（`package.json:38-41`）——全部解析逻辑自己写（比如 tar 读取器，`src/catalog-npm.ts:28-69`）。
- 客户端 bundle 的 externals 只有 4 项：`react`、`react/jsx-runtime`、`react-dom`、`@deepseek-ai/dsh-client-ui-primitives`（`tsdown.config.ts:26`）；**其余全部内联**（`noExternal`，`:69`），包括它自己用的 host 模块（不 import host 代码）。

### 1.3 `client/client.js` 是预构建产物，且仓库自带一条完整复刻链

这是本文最直接可用的答案：**官方不发布 client 构建 preset，dsh-market 手写了一份等价物并在仓库里维护**。

- `package.json:25-26`：`build = tsc -p tsconfig.json && npm run build:client`，`build:client = tsdown && node scripts/normalize-client-banner.mjs`。
- `tsdown.config.ts`（127 行，全注释版契约）：
  - 输出：`outDir: 'client'`、`format: 'cjs'`、`platform: 'browser'`、`entryFileNames: 'client.js'`（`:36-44, 121-122`）；
  - lazy-CJS 自注册：`banner: window.__ModuleLoader__.load({ id: "dshmarket", factory: (require) => {` + `footer: return module.exports; } });` + `intro` 造出 `module`/`exports`（`:121-126`）——与官方 preset 的 banner/footer 契约一致（参见 `docs/research/2026-09-19-dsh-plugin-authoring-client.md` §7.1）；
  - CSS Modules：自带 rolldown 插件把 `*.module.css` 变成虚拟模块，用 `lightningcss` 编译（`pattern: '[hash]_[local]'`、`minify`、显式 targets 防止 `backdrop-filter` 前缀坍缩），模块体在 factory 执行时注入 `<style data-plugin>`，默认导出 class map（`:75-120`）；
  - `sourcemap: false`，理由写得很具体：`client.js` 是**提交进仓库且发布**的产物，map 是一行 789KB，每次前端 PR 都整文件冲突，而 bundle 本身可读、栈能指到真名（`:45-63`）；
  - 平台无关可复现：CSS 虚拟 id 的 filename 用仓库相对路径（`:88-97`），且注释点名了「同一提交在不同 checkout 上 hash 不同」的 #472。
- `scripts/normalize-client-banner.mjs` 做三件后处理（每件都带事故编号）：
  1. **单行 banner**：rolldown 把 banner 打成三行，宿主/预检要求文件头精确一行；折叠时用空行占位保持行号（`:36-52`）；
  2. **路径归一**：把 CSS 虚拟 chunk 里的绝对构建路径（`/Users/…`、`D:\Github\…`）改成仓库相对形式，并**主动扫描确认没有泄漏绝对路径，否则 exit 1**（`:54-82`）；
  3. **class map 稳定排序**：tsdown 的 key 顺序不稳定，连续两次构建差 ~265 行，`prepare` 会在每个贡献者的 `npm install` 后触发 diff；按 key 排序且保行数（`:84-86`，实现 `scripts/sort-class-maps.mjs:36-64`）。
- `scripts/preflight.mjs` 在 `prepack` 前守三条：patch 按包名 insert（`:14-17`）、`client/client.js` 必须以 `window.__ModuleLoader__.load({ id: "dshmarket"` 开头（`:19-22`）、lockfile 不得解析到非 npmjs 镜像（否则消费者 EALLOWREMOTE，`:33-41`）。
- CI 对「提交的产物 == 源码重建」是**硬门**：`npm run check` 会重建，然后 `git diff --exit-code client/`，失败信息附命令与文件注释（`.github/workflows/ci.yml:54-76`）。这就是 #643 这个 HEAD commit 的主题。
- 仓库实际产物：`client/client.js` 576,128 字节、未压缩（`wc -c`）；`sourcemap:false` 后再无 map 文件。

### 1.4 CI/CD 全貌（三份 workflow 都读完）

| workflow         | 关键机制                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`         | ① `wrong-repo-guard`：拒绝把 catalog 写进本仓（`data/registry-snapshot.json` 只是下载物，`:9-37`）；② `check` 矩阵 ubuntu+windows：typecheck→build→restart-smoke→committed-artifact diff→vitest→preflight→validate-registry→smoke-spawn（`:39-80`）；③ `pnpm-compat`：真实 pnpm 9/10/11/12（npx）跑 `tests/*.compat.spec.ts`（`:82-93`）；④ `web-e2e` 矩阵：真 dsh（`0.1.0-rc.8` 与 `0.1.2-alpha.2`，alpha 只跑 Linux）× 两平台，装真 Chromium，`DSHM_E2E_REQUIRED=1` 防「静默跳过=绿」（`:95-146`） |
| `release.yml`    | npm trusted publishing（OIDC）与 workflow 文件名绑定，dev 通道不敢另开文件（`:1-10`）；`v*` tag → `latest`/`beta` + GitHub Release，tag 必须等于 package version（`:64-72`）；`workflow_dispatch` → `dev`，从任意分支发 `1.16.0-dev.<时间戳>-<sha>`，runner 内改版本、不提交（`:74-107`）；**prerelease 永不移动 `latest`**（`:74-77` 注释：1.13.0 曾因此发过坏版本）                                                                                                                                |
| `build-site.yml` | 每日 + push 触发；构建前下载 catalog 到临时 checkout（从不提交）；`docs/` 作为 Pages 产物发布（`:1-72`）                                                                                                                                                                                                                                                                                                                                                                                             |

---

## 2. 后端能力（host 半）

### 2.1 模块地图

| 职责组       | 模块（`src/`）                                                                                                                 | 一句话职责                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 入口/装配    | `index.ts`、`settings.ts`、`home-paths.ts`、`profile.ts`                                                                       | 注入 `webServer`/`loader`（或 Desktop 的 `desktopPnpm`）、profile 读写、settings 命名空间 |
| catalog/目录 | `registry.ts`、`catalog-npm.ts`、`catalog-local-match.ts`、`sources.ts`、`groups.ts`、`order.ts`、`discovery-compatibility.ts` | 目录抓取与校验、源→安装目标映射、本地 link 匹配、分组/排序、host 兼容发现                 |
| 安装执行     | `install.ts`、`dsh-install.ts`、`dsh-cli.ts`、`pnpm-compat.ts`、`hot.ts`、`restart.ts`、`store.ts`                             | 命令编排与自动重试、pnpm 失败分类、热挂载、自重启、store 清垃圾                           |
| 安全/恢复    | `verify.ts`、`check.ts`、`snapshot.ts`、`backup.ts`、`patch.ts`、`trial.ts`、`presets.ts`                                      | 激活六态、组合体检、快照/备份、patch 层开关、试组合校验                                   |
| 路由/传输    | `routes.ts`、`http.ts`、`ndjson.ts`、`log.ts`、`net.ts`                                                                        | 全部 HTTP 面（4728 行）、同源与体积限制、pnpm 进度解析、脱敏日志、代理感知 fetch          |
| 地域/加速    | `regions.ts`、`region-probe.ts`、`accelerate.ts`                                                                               | 路由表、一次性测速、GitHub 加速（只代理 ref 解析不代理 tarball）                          |
| 兼容/更新    | `compatibility.ts`、`updates.ts`、`update-api-v1.ts`、`source-migration.ts`、`channels.ts`、`changelog.ts`、`diagnostics.ts`   | peer 判定、更新检查、对外 v1 API、git→npm 迁移、发布通道、更新说明                        |
| 主题/杂项    | `themes.ts`、`gist.ts`、`agents.ts`                                                                                            | 主题互斥激活、gist 同步、agent 运行门                                                     |

### 2.2 Catalog：每次请求都向源站校验，失败即失败

- 数据源是 `awesome-dsh-plugin.com/plugins.json`（`regions.ts:80`），china 区首选 npm 包 `dsh-plugin-catalog`（`regions.ts:128,137-157`），理由写在 `catalog-npm.ts:1-20`：GitHub Pages 域名过不了国内公共 GitHub 代理（实测 403），而 npm 镜像天然可达且**目录有了版本号、可回滚**。
- `loadRegistry`（`registry.ts:169-229`）：按 region 的路由列表逐个源、每源两次尝试；带 `If-None-Match`/`If-Modified-Since`，**304 才复用上一次的 body**；`served` 记忆里按源 key 隔离 validator（跨区切换不会用从未见过的 origin 的 304 回答）。注释明确：旧版「1h 缓存 + 打包快照回退」会让当天发布的插件看起来不存在，**stale 对目录不是降级而是错误**（`registry.ts:92-120,149-168`），失败时把 elapsed/attempts/proxy 写进错误串（`registry.ts:242-250`）。
- npm 源路径手写了 tar 解析（只取 `package/plugins.json`，512 字节头 + 八进制 size，`catalog-npm.ts:49-69`），跟随 `dist.tarball` 以便镜像自改写（`:112-115`）。
- 结构校验 `asRegistry`：plugins 非空、每条 category 可用否则整体拒绝（`registry.ts:128-137`）；client 侧再有一层防御（`market-data.ts:36-75` 的 `pluginCategories` 去重）。
- 目录数据门在 CI：`scripts/validate-registry.mjs` 定义 E1–E12（必填字段、双语描述、npm 名语法、stars 可空、url 形态、owner 一致、category 白名单、page 前缀、added 非未来、**install 命令必须指向条目自己的仓库/npm**、**安装身份唯一**、count 一致），网络存在性探测故意不做（`:22-29`）。

### 2.3 安装路径：信任来自目录，目标映射有优先级，失败有一张恢复表

- **目标解析**（`sources.ts:330-339`）：`npm` 名合法 → npm 包（repo 验证防抢注）→ 作者提供的 GitHub Release 预构建 tarball（**必须与条目自己的 owner/repo 绑定**，`:33-49`，否则 `url: good/plugin` 可以装 `evil/repo` 的包）→ `github:owner/repo[#path:/sub]`。NPM 名正则就是 npm 官方语法（`:14`）。
- **安装路由**（`routes.ts:4339-4520+`）顺序：same-origin（`:4346-4350`）→ **有 agent 在跑就 409**（`:4352-4364`，`agents.ts:26-43`，消息给出 agent id）→ registry 查条目（`routes.ts:4365-4371`，不在册 400）→ npm 目标先钉 registry latest，对抗 pnpm 的 fresh-release 静默换版（`:4394-4406`）→ `acceleratedTarget` 按区解析 HEAD（`accelerate.ts:205-221`）→ 重复安装守卫 `findInstalledAlias`（身份集含 npm 名、name、`repo#path`，`sources.ts:545-577`）→ 同名不同源冲突拒绝（`routes.ts:4465-4478`）→ 记录 `before`/manifest 快照/坏 bundle 基线 → `withHoistRecovery` 执行 `add`。
- **pnpm 失败恢复表**（`install.ts:109-196`）：a) `hoist-pattern-diff` → 先 `install --no-frozen-lockfile` 重建再重试；b) `release-age-violation` → 一次性 `--config.minimum-release-age=0`（默认拒绝，安装路由在新鲜安装时禁用该旁路，`:114,126-133`）；c) 未发布的 host peer 404 → `--config.auto-install-peers=false` 重试（`:135-145`，识别依据是「包在 manifest 里吗」`isUnpublishedHostPeer`，`:73-80`）；d) 瞬时网络 → 原样重试一次；e) `fetch-timeout` → `--config.fetchTimeout=600000` 重试一次（`:146-165`）。注释记录 pnpm 12 的坑：`--config.minimum-release-age=0` 只认 kebab 拼法，`--config.fetchTimeout` 两种都不认（#600/#615，`install.ts:16-37`）。
- **失败分类器**（`pnpm-compat.ts:186-552`）有 19 个稳定 code + 双语可执行解释，包括：UNEXPECTED_STORE（**故意不自动修**，store 路径选择是用户决定）、MISSING_TARBALL_INTEGRITY（**拒绝为未验证字节生成校验值**，只点名要删哪条）、TARBALL_URL_MISMATCH、PATCH_FAILED、IGNORED_BUILDS / GIT_DEP_PREPARE_NOT_ALLOWED（引导一键批准）、PREPARE_PACKAGE（git 插件自带 lockfile 与镜像冲突）、FETCH_404（幽灵依赖）、NO_MATCHING_VERSION、Windows 文件锁（**不重试、不自动回滚**，因为同一 rename 会撞同一批句柄，并说明原生模块只有退出进程才释放）、pnpm 存在但起不来（9009/EACCES/ENOENT 三种修法）。
- **验真**（`install.ts:254-342`）：a) `retargetCollections`：装完发现是「仓库根无 dsh manifest 的聚合仓」就 remove 再对每个子目录 `#path:` 重装；b) `validateAddedPlugins`：新增包必须 `hasDshManifest` 且有 loadable entry（carrier bundle 例外见 `profile.ts:824-842`），并检查 loader id 冲突（`profile.ts:787-808`），不合格**当场移除并修 manifest**（`removeAndReconcile`，`:363-377`）；c) `brokenClientBundles` 前后对比，只报本次操作弄坏的那些（`verify.ts:434-450`）。
- **进度**：pnpm 命令统一追加 `--reporter=ndjson`（`dsh-cli.ts:838-851`），`ndjson.ts:70-185` 纯 reducer 解析 stage/progress/fetching-progress/lifecycle/ignored-scripts/error，未知事件容错；旧 pnpm 无结构化事件时回退人读行（`dsh-cli.ts:872-892`）。超时默认 15 分钟（`dsh-cli.ts:252`），取消用进程组杀（POSIX `kill(-pid)` + 5s SIGKILL 升级；Windows `taskkill /T /F`，`:556-576`）。
- **pnpm 供给**：`provisionPnpm` corepack → `npm i -g pnpm` → `npm prefix -g` 反查 bin 并记住目录（#149），全链路有日志（`dsh-cli.ts:662-686`）。

### 2.4 安全与恢复

- **激活六态**（`verify.ts:17-25,147-282`）：`live / restart / inert / broken / missing / disabled`。证据权威序：Loader 存活清单 > profile manifest > 包 manifest；「已由 loader 加载但无 dsh 字段」也算 live（官方 `dsh-tools` 就是这种，#135）。`carriedRowLive` 处理 carrier bundle（#103/#156）。`activationAfterReplace` 修正「更新后仍 live」为 restart（`verify.ts:311-319`，并排除 client-only）。
- **客户端 bundle 语法体检**（`verify.ts:452-491`）：用 `vm.Script` **只编译不执行**，抓住半写入/补丁损坏；ESM 语法错误被识别为「无法用该解析器判断」而不是损坏（防误报），实现克制（`clientBundlePath` 对不认识的 exports 形状一律 null）。
- **快照**（`snapshot.ts`）：固定捕获 `package.json`、`cordis.patch.yml`、`.dsh-market/state.json`（`:42`），v2 显式记录「文件不存在」以便恢复时删除（`:44-52,134-136`）；严格文档校验（路径白名单、表示唯一、id 正则），同目录 temp+rename 原子写（`:170-179`）；默认保留 20 份（`routes.ts:291-295`）。
- **备份**（`backup.ts`）：只带配置不带依赖；跳过 `node_modules/.git/.dsh-market/pnpm-lock.yaml` 与任何 `*.bak`（`:20-22,53-57`）；导入时拒绝绝对路径/`..`/重复/超 2MB（`:139-169`）；恢复逐文件 temp+rename，任一失败**全量回滚**（`:172-200`）；凭证文件只在 UI 提示数量，绝不掩盖（`:23-35`）。
- **patch 层开关**（`patch.ts`）：写 `- id: X` + `disabled: true|false` 到用户 `cordis.patch.yml`，DSH HMR ~1s 重组、重启后 loader 再应用；写入前校验 YAML 是合法条目数组，`[]` 占位会被注释掉，**删除最后一行时把 `[]` 放回**，否则 profile 起不来（`:397-449,489-504`）；host 基础设施（43 条正则，含 client-modules/connection/hmr/runtime/locale 等）拒开关（`:50-99`）；carrier bundle（patch 里 disable 别人）走「从 `dsh.profile.bundles` 移除」而不是写外人的行（`routes.ts:2201-2212`，`profile.ts:737-751`）。
- **试组合 + 预设**（`trial.ts:67-156`、`presets.ts:214-330`）：任何排序/preset 变更先离线重放整个组合（复用 `check.ts` 的 `buildBundleLayers`/`composeLayers`，与诊断报告同一套解析），有 duplicate/parse/error 就拒绝；通过后**先自动快照再写**；应用前给「会改什么」预览（reordered/enabled/disabled/noop）。`order.ts` 只允许重排社区 bundle，官方 in-box 三件套位置固定（`:22-26,185-207`），建议顺序用 Kahn + 「当前顺序做 tie-break」的最小变更（`:222-277`）。
- **重启**（`restart.ts`）：端点只收 loopback + same-origin + 无转发头（`:187-203`）；systemd 检测要「有 INVOCATION_ID/JOURNAL_STREAM **且** 自己是 unit 主进程（ppid==1 或 parent comm==systemd）」，注释里解释了为什么单一信号会误伤终端/CI（`:90-99`）；debugger latch 独立于 allowRestart，不被显式 true 覆盖（`:135-146`）；detached helper 等端口真正释放、启动后回连验证、失败写日志到 tmp（`:306-373`）；Windows 上用 `powershell -WindowStyle Hidden` 包一层避免可见控制台（`:250-273`，后续 issue #624 说明仍有残留窗口问题）。
- **网络**：`marketFetch` 走 undici 的 `EnvHttpProxyAgent`，因为 Node 全局 fetch 完全忽略代理环境变量，且 npm 自己的 `npm_config_*` 需显式传入（`net.ts:1-21,91-106`）；给 pnpm 的环境另做三向翻译（标准变量↔npm config↔git），并强制 `CI=true`、`GIT_TERMINAL_PROMPT=0`（`dsh-cli.ts:89-147,230-250`）。
- **日志**：内存 200 条 + 持久 NDJSON 256KB 环形裁剪；写入即脱敏（home→`~`、sk-/gh*/npm_ token、bearer、authorization/password），并去控制字符防日志注入（`log.ts:28-51,90-100`）；导出文件带 UTC 时区说明、profile 现状快照（bundle 是否可解析）与上一进程日志（`log.ts:159-206`，`routes.ts:2530+`）。

### 2.5 路由与状态：一个共享 mutation 链 + 大量具名状态

- 路由用 `host.webServer.register({kind:'exact'|'prefix', path, handler})`（`routes.ts:107-115`），全部挂在 `/dsh-market/*`；写操作统一 `sameOrigin` + 读 body 上限 4KiB（`http.ts:19-40`，个别路由放宽到 32KiB）。
- 互斥用**promise chain + 409**而不是队列：`withMutationLock`（`routes.ts:456-490`）在忙时立即 409，`busy` 标志区分 `install`（pnpm 操作，含装后处理窗口 #91）与 `write`（直接写文件）；favorites 走 `withMutationQueued`，安装中仍可收藏（`:430-443`）。
- boot 时回放：清 hot 输入、`mountClientOnlyDeps`（纯客户端插件 shim 挂载）、按 state.json 禁用表重新压条目，并监听 `internal/plugin` 自愈——fiber 起来了但用户禁过，再按下去（`routes.ts:402-423`）。
- 健康面：`/dsh-market/status` 一个响应里带进度、`busy`、pnpm 探测、boot id、版本、channel、region、githubRoutes、restart 能力与**为什么不能重启**（supervisor/debugger 具名字段，`routes.ts:2466-2540`）；`/installed` 带 activation 图、repo 身份/暗示、disabled/patchDisabled/groups/favorites。

### 2.6 更新与对外 API

- `checkUpdates`（`updates.ts:291-430`）：npm 查 `latest`/channel tag；github 用 **git 自身 info/refs 广告**而不是 REST API（匿名 60 次/小时会被几十个插件用光，#349，`:378-390`），且按安装时声明的 ref 询问（annotated tag 认 `^{}` peeled commit，#597）；`isUpgrade` 只认语义上的前进，`latest` 回退不会触发「更新」（#64，`:145-149`）；非 GitHub git（Gitea/GitLab）走 `gitUploadPackUrl` 且永不按名查 npm（#525）；`file:`/`link:`/desktop generation 各有 kind，generation 只报不装（`:325-363`）。
- 发布通道（`channels.ts`）：只有市场自己跟通道；`undefined ≠ stable`（无选择时按运行版本含 `-` 猜 beta），因为「手动装 beta」本身就是订阅（`:67-70`）。
- **对外 v1 API**（`routes.ts:1247-1523`，文档 `UPDATE-API-V1.md`）：`/dsh-market/api/v1/capabilities` 自描述 stability/features/endpoints；`updates/summary` 带 `checked` 分母；单包检查；`POST updates` 返回 202 + operationId，状态机 `queued/running/succeeded/failed/cancelled/rolled-back`，失败码 `DOWNGRADE_DETECTED`/`RESOLVED_VERSION_MISMATCH`；操作记录上限 50 且 id 内嵌 boot id（进程替换后浏览器旧记录不会误认）；rollback 按 operation 且需要保留恢复点；restart 沿用更严守卫。兼容策略：v1 内只加可选字段、不重定义、破坏性变更换路径。

---

## 3. 前端实现（`src/client/`，服务「UI 怎么搭」）

### 3.1 注册进哪些 slot、对官方规范做了什么偏离

`src/client/index.ts` 的 `apply(ctx)`：

| 位置               | slot / 入口                                             | 说明                                                                                                                                                 |
| ------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts:130-142` | `settings.section`（list，`id: 'market'`, `order: 40`） | 市场主页面；label 用 `() => t('nav')` thunk 跟随语言；注册由 sectionGate 管理可见性/退役                                                             |
| `index.ts:192-196` | `shell.overlay`（list，`id: 'dsh-market-toast'`）       | 安装/主题切换后的单次 Toast（数据经 sessionStorage 传递，`InstallToast.tsx:13-22`）                                                                  |
| `index.ts:179-189` | `settings.plugin.item`（keyed by `NS`）                 | 插件配置页的自我管理卡；**嵌套 inject `settingsScope`**，旧宿主上卡片不出现而非整页消失                                                              |
| `index.ts:152-172` | `ctx.provide('market', …)`                              | 给宿主 shell 的控制面：`version:1`、`setSettingsVisible/settingsVisible`、`render(props?)` 返回整块面板元素（供 Tauri 桌面把市场嵌进自己容器，#602） |

模块级 `inject = ['slots','locale','theme']`（`index.ts:87`）。这里有三个与既有调研需要对照的点：

1. **`dsh.client.inject` 在发行宿主上是硬门**。`tests/client-inject.spec.ts:1-21` 记录了 #554：manifest 里列了 `dsh-client-runtime`（某版本发布不完整）与 `dsh-client-connection` 却从不使用，市场在场时直接让另一个插件的命令注册失败；用例从源码扫描 `ctx.*` 与嵌套 `.inject([...])`，与声明双向对齐，并断言 optional 服务（settingsScope）必须嵌套。这补充了 `docs/research/2026-09-19-dsh-plugin-authoring-client.md:51`「inject 不参与激活顺序」的表述：至少在实际发行宿主上，列了不存在的 seam 会挡住 client entry，且 unused seam = 白白砍掉一片宿主版本兼容面。
2. **传输不是官方 Connection RPC**。前端一律 `fetch(api('/dsh-market/…'))`（如 `MarketSection.tsx:1561,1592,1629,1715,2127…`），而不是 `ctx.connection.rpc.call`；`tsdown` externals 里也没有 `dsh-client-connection`。这是一种与 ADR-0023 相反的选型（自有 HTTP 路由 + same-origin 校验 + 429/409 语义），优点是可以用 POST/GET、下载流、原生 URL；代价是要自己复刻鉴权/信任边界，并已暴露 issue #603「管理接口未继承 DSH 登录保护」的风险提示。
3. **`settings.plugin.item` 与 pinned 上游源码不一致**。dsh-market 的卡注册在 `settings.plugin.item`（`index.ts:183`），而钉住的上游克隆（0.1.6-alpha.2）里 `ui-settings-plugins` 只声明了 `settings.plugins.tab`（`/tmp/dsh-src-client/packages/client/ui-settings-plugins/src/client/index.ts:186-197`），`plugins.item` 在 `ui-plugin-manager`。dsh-market 在 rc.7+/rc.8 宿主上实际可用（README:50），说明**发布态宿主与 pinned 仓库 SHA 存在槽位差异**；写 Skill/实现前必须对真实宿主版本核对（§8）。

组件组织上还有两条「元素/数据层」划分经验：

- `market-element.ts`：把面板构建抽成**显式依赖注入的纯函数**（t/ locale/ theme/ themeStore/ crashText/ exportLog），两个调用方（settings.section 与 `market.render()`）共用且不漂移；注释直接说「这样测试能断言接线，而不是只有跑起来的宿主能揭示」（`market-element.ts:1-15`）。
- `section-gate.ts`：可见性用一个 4 状态小状态机而不是两个布尔（顺序才是难点：宿主先声明隐藏、slots 后来才到、不能闪一下；退役后不能再被 show 复活）（`section-gate.ts:1-19,42-78`）。

### 3.2 状态管理与数据流：React state + 模块级缓存，没有 store

- `MarketSection` 一个组件里约 100+ 个 `useState`（`MarketSection.tsx:1197-1620` 连续状态声明），locale/theme 用 `useSyncExternalStore` 订阅宿主服务（`:1186-1196`）；跨挂载缓存放在模块级变量（`cachedRegistry/cachedInstalled/…`，`:1197-1210`），mutation 后重新拉取。
- **刷新模型**：进入时并行拉 registry/status/installed；安装/更新运行中才启动 `setInterval` 轮询 status（进度、busy、phase/currentPackage），结束后停（`MarketSection.tsx:1856-1930`）；页面刷新丢失的进行中操作用 sessionStorage 标记恢复，并与宿主真值收敛（`dshm-pending`/`dshm-updating`/`dshm-restart` 均以 boot id 划界，`:1725-1845`）。
- 操作状态从卡片上移到 `operations.ts` 的**纯函数记录模型**：`queued/running/input/done/warned/failed` 六态归并成 busy/ok/attention 三桶（`:71-83`），补 `queuePosition`、`summarize`（面板显示「installing 3/7」而不是七个通知）、`recordForUrl`（卡片按最新记录显示状态，防失败后看起来没动过）。UI 组件只消费纯函数结果。
- 数据层 `market-data.ts`（1392 行）是「不依赖 React 的纯逻辑库」：`api()` 以 `document.baseURI` 锚定（反代子路径 #345，`:13-34`）；安装态匹配用身份集合（包名/npm 名/owner/repo/#path），并用 WeakMap 缓存热点（`looseMatchCount` 从 2.9s trace 降到常数级，#262/#589，`:721-825`）；README 截图候选按语义打分+尺寸探测排序（`:1096-1228`）；GitHub 路由 failover 要求响应内容通过类型校验（拒绝「代理 200 的 HTML 错误页」，`:1237-1285`）；`humanOutput` 从 pnpm ndjson 失败尾巴里剔进度噪音保留诊断（`:1292-1326`）。

### 3.3 组件清单

| 组件                                    | 结构要点                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MarketSection.tsx`（5329 行）          | 顶层 tabs：发现/主题（宿主有 theme 服务才出现）/收藏/已安装/高级（高级下再分备份恢复与诊断，`MarketSection.tsx:3799-3848`）；含搜索排序分页、分类 chips（sticky 折叠+测量）、瀑布流双列、截图轮播/lightbox（自建 portal host）、安装确认、更新说明、冲突决策、webdav/gist 导出…全部一个组件    |
| `SettingsCard.tsx`（619 行）            | 市场自我管理：展开时才请求 status/updates（`probed` ref 防重复，`:219-247`）；channel/region/proxy 都**只显示服务端返回的候选**（`:139-165,455-493`）；卸载两段确认 + purge 复选框，说明「保留数据会被市场停用的插件保持停用」；手写 chrome 刻意对齐宿主 `PluginCard` 的类名/token（`:19-34`） |
| `OperationsPanel.tsx`（365 行）         | 操作入口在 tab 行而非网格上方（分页/搜索不丢待决）；冲突决策用原生 radio + 结果预览（安装项 vs 已装项谁留下），「保留」默认安全；按钮按记录状态切换（刷新/放行构建/重试/关闭）                                                                                                                 |
| `Diagnostics.tsx`（906 行）             | 读 `/dsh-market/check` 的六个区块（bundle 栈、重复 id、peer 不匹配、多版本核心包、覆盖/孤儿、排序冲突），全折叠默认收起；内含拖拽排序草稿（只在显式「应用顺序」时写）、AI-fix 提示词复制                                                                                                       |
| `snapshot-panel.tsx`/`preset-panel.tsx` | 展开才拉取（`open` + loaded ref，失败不置 loaded 以便下次重试，`snapshot-panel.tsx:91-111`）；恢复/删除都内联二次确认；preset 保存时把当前 disabled 列表一起存，避免应用后静默启用全部                                                                                                         |
| `ErrorBoundary.tsx`（111 行）           | 类组件；崩溃记录（message/componentStack/时间）存模块级，导出日志时使用；恢复面板自带「重试渲染」+ 注入的「导出日志」按钮（按钮必须活过崩溃，#293）；渲染崩溃面板也带 `data-dsh-market-root` 以便日志区分「没挂载」与「崩了」                                                                  |
| `InstallToast.tsx`                      | 官方 `Toast` primitive + sessionStorage 单次读取，刷新后确认「装好了/主题切好了」                                                                                                                                                                                                              |
| `CommentsModal.tsx`                     | giscus iframe 脚本按需注入；暗色主题从**页面实际背景色**计算（不是 `prefers-color-scheme`），保证自定义主题下不出白盒；注明打开即联系 giscus.app/GitHub                                                                                                                                        |

### 3.4 样式组织：单个 830 行 CSS Modules，token + fallback

- 每行紧凑单行式（`.root{...}`），全部颜色 `var(--dsw-alias-*, <light-fallback>)`（`Market.module.css:1-6`）；交互 chrome 尽量用官方 primitives，自绘只留布局/卡片/进度条/banner/tab/色板。
- `.root` 声明 `container-type:inline-size`（`:8`）；两档媒体查询 + `prefers-reduced-motion`（`:156-166,246,377-382`）；无暗色分支——暗色完全由宿主 token 驱动。
- 注释密度极高且都是「事故编号 + 测量数据」：`overflow-anchor:none` 为什么必需（sticky header 折叠会触发 Chrome 滚动锚定死循环，#395，`:25-44`）；sticky 双行为什么合并、`::before` 为什么补 14px（`:44-67`）；瀑布流为什么不能 CSS grid/column-count（`:130-166`）；甚至用 `[role="dialog"]:has([data-dsh-market-root])` 反向适配宿主设置弹窗的全屏（`:239-245`）。
- CSS Modules 类名哈希在构建期内联，样式随 factory 执行注入 `<style data-plugin>`（见 §1.3），卸载由 loader 清理。

### 3.5 i18n / 类型来源

- `locales.ts`（1080 行）：`export const zh = {...}`（约 530 key，含注释与文档化取舍）→ `export type MarketKey = keyof typeof zh`（`:542`）→ `export const en: Record<MarketKey, string>`（`:544`）——**zh 是 key 的唯一真源，en 的缺 key 直接编译失败**；占位符 `{0}` 由调用方 replace。注册 `ctx.locale.register(NS, {zh,en})`（`index.ts:98`），`t = ctx.locale.bind(NS)`，slot label 用 thunk。
- 类型来源两类：宿主服务面在 `index.ts:45-81` **结构化声明子集**（不 import monorepo 内部类型）；`primitives.d.ts:1-9` 用 ambient module 声明只列自己用到的导出，注释明确「npm 发布包只是 jsdom 测试道的 dev-time mirror，浏览器里从宿主 module table 解析」，即**运行时由宿主提供、编译期靠手抄签名**，并注明对应 rc.6 源码。`globals.d.ts` 声明 `*.module.css` 与 `window.__DSH_BOOT__`。

---

## 4. 工程实践

### 4.1 测试：四层，全部 vitest，playwright 只当库

`TESTING.md:1-20` 的四层与规模（`ls`/`find` 实测）：

| 层          | 文件数                 | 位置                                      | 机制                                                                                                                                                                                                                                                                                                                                                 |
| ----------- | ---------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 行为 spec | 49（+2 compat 在层 4） | `tests/*.spec.ts`                         | 纯逻辑 + tmp 目录 fixture；`flows.spec.ts` 用可编程 FakeDsh 驱动全部 HTTP 路由（真实文件系统效果、可脚本化 npm 状态，更新逻辑无需发布版本）                                                                                                                                                                                                          |
| 2 组件 spec | 11                     | `tests/client/*.client.spec.*`            | `// @vitest-environment jsdom` + testing-library，对**真实组件 + 真实 locale 字典 + npm 发布的官方 primitives**；fetch 以 fixture stub（`market-section.client.spec.tsx:1-100`）；断言视觉排序时从双子列重组（`:80-100`）                                                                                                                            |
| 3 Web e2e   | 8 e2e + 2 guard        | `tests/web/`                              | 真 dsh web + 打包后的市场 + 真 Chromium；`install.e2e.ts` 装一个「自证活着」的 fixture（从 `apply()` 内注册 HTTP 路由，路由能应答才说明 loader 真的解析并执行了模块），市场的 `activation.state` 是推断、被拿来和这个 ground truth 对照（`TESTING.md:22-47`）；本地 fixture registry 真 packument+tarball，不联网；console tripwire 有页面错误即失败 |
| 4 边界      | compat + scripts       | `tests/*.compat.spec.ts`、`scripts/*.mjs` | 真 pnpm 9/10/11/12；`preflight`/`restart-smoke`/`smoke-spawn` 在 `npm run check` 里                                                                                                                                                                                                                                                                  |

三条可复制的具体实践：

1. **测试守卫声明**：`tests/client-inject.spec.ts` 从源码扫 `ctx.*` 反查 `dsh.client.inject` 的完整性与必要性；`primitives-guard.spec.ts` 守旧宿主缺导出时的降级路径。
2. **认证浏览器道禁 trace/HAR**：`tests/web/AUTHENTICATED-LANE.md:1-15` 讲明两种 artifact 天然保留 cookie，事后脱敏无意义；`scripts/check-web-auth-capture.mjs:7-14` 用 6 条正则扫 e2e 源码/vitest 配置/package script/CI，fail-closed，且要求 `test:web` 必须包含该守卫。
3. **防静默跳过**：无 dsh 时 e2e 本应 skip，CI 设 `DSHM_E2E_REQUIRED=1` 把它变成硬失败，理由是「CI 自己装 CLI，安装步骤坏掉时整条道会绿着什么都没断言」（`tests/web/scaffold.ts:44-62`）。

### 4.2 脚本与发布流程

- 8 个脚本各司其职：`preflight`（打包前命名检查）、`validate-registry`（目录 E1–E12 门）、`restart-smoke`/`smoke-spawn`（win32 cmd shim 与重启参数 smoke）、`check-web-auth-capture`、`sort-class-maps`、`normalize-client-banner`、`build-site`。
- 版本策略：minor 持续走、prerelease 打 `-beta.N`/`-dev.<时间戳>-<sha>`，`latest` 永不被 prerelease 移动；dev 构建允许从任意分支发、跑完整 check+test 但不留 tag/Release。
- 文档：`IMPROVEMENT-PLAN.md` 是审计阶段产物（P0-1…P2-13，已大部分落地），但其中 `:28` 仍写着「`client/client.js` 是无构建步骤的手写 CJS bundle」——**与现状（tsdown 构建产物）不符**，是文档腐坏的一个现成例子；`UPDATE-API-V1.md` 则保持与实现对账（含 beta 声明与 capabilities 自描述）。

### 4.3 已披露的取舍与已知问题（open issues 抽样）

- 82 个 open issues（2026-09-19）。抽样的高信号条目：#640 1.48.0 设置侧栏「插件市场」条目消失；#624 Windows 一键重启残留可见 PowerShell 窗口并持有服务器；#619 停用子路径入口的 bundle 无效（state.json 与运行态不一致）；#615 pnpm 12 忽略 `--config.fetchTimeout`；#603 管理接口未继承 DSH 登录保护；#599 非 GitHub git 安装更新无效；#597 annotated tag 安装永远显示有更新；#588 升级带来宿主兼容风险仅警告不拦截；#567 `dsh-client-ui-primitives` 未随 profile 安装导致 0.1.5-rc.1 下加载不出；#566 安装/更新其他插件会重置某插件的自定义配置。
- 仓库自己在代码注释里承认的边界：不修 store 路径（用户决定）、不为未验证字节生成 integrity、Windows 文件锁不自动回滚、`settings.plugin.item` 卡在 rc.7 前不出现、重启在 supervisor/debugger 下被隐藏。

---

## 5. 值得借鉴

1. **「目录无陈旧回退」的 catalog 治理**（`registry.ts:90-120,149-229`）：每次请求都校验、validator 只省字节不省请求、失败即具名失败并提供重试；安装信任绑定 curated registry（`routes.ts:4365-4371`），release tarball 必须属于条目自己的仓库（`sources.ts:16-49`）；CI 用 E1–E12 具名规则守目录（`validate-registry.mjs:4-29`），网络探测与合并门分离。M7 registry 可直接借用这套「schema 门 + 信任绑定 + 不静默降级」。
2. **安装前的身份去重与安装后的验真闭环**：`findInstalledAlias`（repo 证据优先、同名不误杀，`sources.ts:545-577`）+ `validateAddedPlugins`（dsh manifest / loadable entry / loader id 冲突，`install.ts:309-342`）+ 六态 activation（`verify.ts`）。社区里最常炸 profile 的「重复 loader id」「无 dsh 元数据」「源码检出没产物」全部在安装当场处理，而不是留给下次 boot 崩。
3. **失败分类器 + 自动恢复表**（`pnpm-compat.ts` + `install.ts:109-196`）：19 个稳定 code、每条给「为什么 + 你要做什么」双语文案、能自动重试的限一次且限定命令、涉及供应链判断的坚决不自动修。这是把「社区环境不可控」变成「可支持」的核心资产。
4. **客户端构建的可复现工程**（`tsdown.config.ts` + `normalize-client-banner.mjs` + `ci.yml:54-76`）：这是官方无 preset 条件下仓库外复刻的直接答案——CJS lazy 自注册 banner/footer、externals 白名单、CSS Modules 虚拟模块注入、仓库相对路径消除机器指纹、class map 稳定排序、产物提交 + CI diff 门。质量门槛（可复现、可 review）比「能不能跑」高一个档次。
5. **前端可诊断性**：ErrorBoundary 把崩溃变为可导出证据（`ErrorBoundary.tsx` + `self-check.ts`），bundle 双载计数、portal 容器位置、浏览器翻译标记、baseURI 都进日志——「用户报告 → 一句可粘贴的事实」；再加 `api()` 以 `document.baseURI` 锚定（反代可用）与 REQUIRED_PRIMITIVES 降级检测。
6. **状态与并发纪律**：mutation 用 promise chain + 409（`routes.ts:456-490`）、sessionStorage 挂起操作以 boot id 划界并回真值收敛、操作记录与纯函数模型分离（`operations.ts`）、`trialValidate` 先重放再写盘、快照先于写。
7. **i18n 的类型化单源**（`locales.ts:542-544`）：zh 是 key 真源、en 编译期穷尽；约 530 key 的产品体量也说明「文案集中管理」是能撑住的。
8. **发布工程**：OIDC trusted publishing、dev/beta/latest 三通道且 prerelease 不移动 latest、tag 与 package version 对账、Windows+Linux 双平台 CI 与「提交产物必须可由源码重建」。

## 6. 需警惕

1. **单组件 5329 行、单个实例 100+ useState**（`MarketSection.tsx`）：性能修复靠 WeakMap 记忆化和注释复盘（#262/#589），UI 回归靠 4455 行组件 spec；这段代码自身是「反面教材」，BotHarness 的 roster 面板不应复制这种结构（我们的 `operations.ts` 式的纯函数模型 + 小组件值得学，巨型容器不值得）。
2. **预构建产物的维护税**：未压缩 576KB 的 `client.js` 提交进仓库并发布，靠 normalize 脚本+CI diff 防止漂移；任何一次改动都产出一个大 artifact diff。我们若走 `@botharness/client` 自建链，需要接受同样的纪律（提交产物 + diff 门），或者承担「宿主不为插件构建、构建脚本可能被 pnpm 拦截」的失败模式（`tsdown.config.ts:47-52`）。
3. **与官方传输面的偏离要自己补齐安全论证**：全部 `fetch` 自有路由 + same-origin 检查，没有 `ctx.connection.rpc` 的 cookie/信任门（对照 `docs/research/2026-09-19-dsh-plugin-authoring-client.md` §5.2），已有 #603 的安全质疑。我们的 ADR-0023 选择通用 RPC 是更贴官方边界的方向；若要自建路由，至少照抄它的 same-origin + 体量上限 + loopback 判定。
4. **类型/槽位靠手抄与经验**：`primitives.d.ts` 手写签名对应 rc.6；`settings.plugin.item` 与 pinned 上游不一致。预览期任何宿主改动都可能让这类「隐式契约」断裂（#567 就是 primitives 依赖假设失效）。写死我们自己的类型检查与安装门（M3.5）比参考它的做法更稳。
5. **进程生命周期与自更新耦合**：自重启、自卸载、supervisor/debugger 探测、Windows 控制台处理、端口等待 helper——功能很强，但 #229/#471/#624 说明这是一条持续付利息的路。BotHarness 不应把「重启宿主/卸载自己」做进 M3 roster 的职责面。
6. **支持面膨胀**：49 个宿主 spec、19 个 pnpm 失败码、3 个 DSH 系列的 peer 兼容 shim、Windows/Linux/Desktop 三条路径。效仿它的纪律，但不必在第一版复制它的广度。
7. **文档腐坏**：`IMPROVEMENT-PLAN.md:28` 的「无构建步骤」已过时；`README` 与 issue 状态也会漂移。引用它的机制时以源码为准。

## 7. 对 BotHarness 的落点

### 7.1 M7 registry / 插件目录

| 可借用                                                                    | 来源                                                                 | 落点建议                                                                                                                         |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 条目 schema 与机械校验（E1–E12 式具名规则、双语必填、安装目标与仓库绑定） | `scripts/validate-registry.mjs:4-29,130-283`；`src/sources.ts:33-49` | 我们自己的 `validate-registry` 作为 CI merge gate；错误码稳定、可读、不联网                                                      |
| 安装身份唯一性与「同名不同源」拒绝                                        | `sources.ts:545-577`；`routes.ts:4465-4478`                          | registry 条目必须声明 npm 名或 `owner/repo[#path]`，安装前按身份集合查重，绝不做「同名猜测」                                     |
| 「目录无陈旧回退」策略                                                    | `registry.ts:149-229`                                                | 我们的 catalog 可以在本地有快照，但对用户明示数据版本与时间；失败时不假装有目录                                                  |
| 安装后验真六态 + 回滚                                                     | `verify.ts:17-25,147-282`；`snapshot.ts`；`backup.ts:139-169`        | 复用已有 M3.5 gate 结论，把「已安装 ≠ 已激活」的状态名与原因写进 API 与 UI                                                       |
| v1 风格的能力发现与操作记录                                               | `UPDATE-API-V1.md:25-127`；`update-api-v1.ts`                        | 任何对外 API 先给 `capabilities`（版本/stability/features），长操作返回 operationId + 轮询，操作 id 内嵌 boot id；失败码稳定枚举 |
| 通道/版本治理（latest 永不被 prerelease 移动；dev 不落 tag）              | `.github/workflows/release.yml:25-107`                               | 我们发 bundle 时的 dist-tag/预发布纪律直接照抄                                                                                   |

### 7.2 M3 `@botharness/client`

| 可借用                                                                                   | 来源                                                              | 与 ADR-0023 的关系                                                                                                                                                               |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tsdown 自建客户端构建模板（CJS/lazy banner/CSS Modules/仓库相对可复现/产物提交+CI diff） | `tsdown.config.ts:26,75-126`；`normalize-client-banner.mjs:36-86` | ADR-0023 已判定「手写等价构建是最大工程风险」；dsh-market 给出可直接移植的 `tsdown.config.ts` 骨架（注意我们的 externals 基线比它大，需按 `docs/client-bridge.md` §6 外置 9 项） |
| CSS Modules 组织 + `--dsw-*` token + fallback + 单文件按需注入                           | `Market.module.css:1-6`；`tsdown` CSS 插件                        | 样式组织可直接采用；体积/暗色都由宿主 token 兜底                                                                                                                                 |
| ErrorBoundary + 导出日志按钮在崩溃面板内 + 崩溃记录模块级                                | `ErrorBoundary.tsx:45-110`；`market-element.ts:41-59`             | M3 的 roster 面板应默认包一层；把「刷新/导出日志」作为恢复 UI                                                                                                                    |
| 嵌套 inject 处理可选服务、REQUIRED_PRIMITIVES 缺导出降级                                 | `index.ts:29-33,92-96,179-189`；`tests/client-inject.spec.ts`     | 直接采用：settingsScope 式可选依赖必须嵌套；declared↔used 的声明测试是低成本高收益                                                                                               |
| i18n zh 单源 + en 编译期穷尽 + label thunk                                               | `locales.ts:542-544`；`index.ts:134`                              | 直接采用                                                                                                                                                                         |
| `ctx.provide('market', control)` 给宿主 shell 的 `render()` 集成面                       | `index.ts:152-172`；`UPDATE-API-V1.md:157-186`                    | 比让宿主碰内部实现干净；M3 可提供 `provide('botharness', {version, render})`                                                                                                     |
| 组件测试范式（jsdom + 真字典 + fetch stub + 视觉排序断言）                               | `tests/client/market-section.client.spec.tsx:1-100`               | 我们的 client 包测试可照搬这套 stub 结构                                                                                                                                         |
| `api()` 的 baseURI 锚定                                                                  | `market-data.ts:13-34`                                            | 与 RPC 无关的通用修复，值得放进 M3 的 fetch 封装                                                                                                                                 |

**明确不要学**：5329 行单组件；把「市场自身分发/自更新/自卸载/宿主重启」做进产品面；`fetch` 自有路由取代官方 RPC（除非有 ADR 级理由）。

## 8. 未验证 / 存疑

1. **未运行验证**：热挂载、`MarketHotTree` 的 Include 行为、重启 helper、giscus、WebDAV/Gist 路径、Windows 表现均只来自源码与仓库测试；本次未安装、未运行该插件，也未复现任何 issue。
2. **`settings.plugin.item` 的宿主声明位置未定位**：dsh-market 生产代码注册它且 README 声称 rc.6+ 可用（`README.md:26-30,50`），但钉住的 DSH 上游克隆（0.1.6-alpha.2）的 `ui-settings-plugins` 只声明 `settings.plugins.tab`，`plugins.item` 在 `ui-plugin-manager`；发布态包与仓库 SHA 的差异未核对（未验证）。给 M3 写 slot 前必须对真实宿主版本验证。
3. **`dsh.client.inject` 的硬门语义**：`tests/client-inject.spec.ts:4-7` 的 #554 事故叙述把它描述为「列出的 seam 不存在就不放行 client entry」，与 `docs/research/2026-09-19-dsh-plugin-authoring-client.md` §2.1「信息性、不参与激活」的表述存在张力；上游源码未找到该门的实现（未验证，可能是「预检显示/HMR diff」层面的门而非激活门）。
4. **pnpm 行为矩阵的覆盖**：`pnpm-compat.ts:7-15` 的矩阵基于 pnpm 9.15.9/10.28.2/11.21.0（2026-08），仓库也有 12 的 compat lane，但 12 的 `--config.fetchTimeout` 失效问题（#615）说明矩阵不是全能；我们若复用这些重试参数需要在本机 pnpm 版本实测。
5. **`peerDependencies` 宽度**：`^0.1.0-rc.7 || ^0.1.1-rc.2 || ^0.1.2-alpha.2` 是否覆盖它实际兼容的宿主范围未验证；预览期 semver 排序（rc < alpha？）与 dist-tag 落差（beta tag 停在 1.19.0-beta.4 而 latest 1.48.0）说明发布通道自身也在漂移。
6. **open issues 抽样偏差**：只看了 28 条标题（按更新时间），未按严重度统计；#603 的安全问题未读全文，其影响范围（本机 loopback 之外的暴露面）未评估。
7. **`src` 进 `files` 的用途**：作者没有说明；推测与 sourcemap/调试/`./src/*` 导出习惯有关，未验证。
8. **文档时效**：`IMPROVEMENT-PLAN.md` 明确是历史审计文档；README 与实现也有轻微漂移（如 beta 通道入口的描述）。引用一律以 pinned SHA 源码为准。

## 9. 一手来源与访问日期

| 来源（pinned SHA `66692ceb…` 内路径，除注明外）                                                                                                                                                                                                                                                                                                 | 支撑内容                                                                                                                          | 访问日期   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `package.json:1-115`、`cordis.patch.yml:1-4`、`tsconfig.json`、`tsconfig.client.json`                                                                                                                                                                                                                                                           | 包名/版本、`dsh.bundle`/`dsh.client` 声明、exports/files、两半构建分工、peer range                                                | 2026-09-19 |
| `tsdown.config.ts:1-127`、`scripts/normalize-client-banner.mjs:1-89`、`scripts/sort-class-maps.mjs:1-65`、`scripts/preflight.mjs:1-47`                                                                                                                                                                                                          | 自建客户端构建链（externals、CSS Modules、banner/footer、sourcemap 取舍、可复现后处理）、打包前门                                 | 2026-09-19 |
| `.github/workflows/ci.yml:1-146`、`release.yml:1-136`、`build-site.yml:1-72`、`.gitattributes`                                                                                                                                                                                                                                                  | CI 矩阵、提交产物 diff 门、pnpm-compat/web-e2e、OIDC 发布与通道策略、行尾对可复现性的影响                                         | 2026-09-19 |
| `src/client/index.ts:1-197`、`market-element.ts:1-60`、`section-gate.ts:1-79`、`self-check.ts:1-147`、`primitives.d.ts:1-140`、`globals.d.ts:1-13`                                                                                                                                                                                              | slot 注册、控制面 `provide('market')`、降级守卫、元素层状态机、浏览器诊断、类型来源                                               | 2026-09-19 |
| `src/client/MarketSection.tsx`（关键区段 `:1163-1250,1505-1620,1620-1930,3780-3960`）、`SettingsCard.tsx:1-619`、`OperationsPanel.tsx:1-365`、`operations.ts:1-201`、`Diagnostics.tsx:1-320`、`snapshot-panel.tsx:1-244`、`preset-panel.tsx:1-120`、`ErrorBoundary.tsx:1-111`、`InstallToast.tsx:1-31`                                          | 前端状态管理、刷新/恢复模型、组件结构、Tab/高级信息架构、崩溃恢复                                                                 | 2026-09-19 |
| `src/client/market-data.ts:1-1392`、`Market.module.css:1-830`、`locales.ts:1-1080`、`comments.ts:1-54`、`CommentsModal.tsx:1-119`                                                                                                                                                                                                               | 数据层（api baseURI、安装匹配、截图、路由 failover）、样式组织、i18n 结构、giscus 共享线程约定                                    | 2026-09-19 |
| `src/index.ts:1-109`、`routes.ts`（要点 `:233-520,887-1060,1247-1523,1663-1740,2139-2260,2466-2590,4339-4520`）、`http.ts:1-41`                                                                                                                                                                                                                 | 宿主装配（含 Desktop `desktopPnpm` 分支）、mutation 锁、boot 回放、v1 API、registry/status/logs/install/toggle 路由、同源与体量门 | 2026-09-19 |
| `src/registry.ts:1-250`、`catalog-npm.ts:1-120`、`catalog-local-match.ts:1-144`、`sources.ts:1-578`、`regions.ts:1-305`、`region-probe.ts:1-97`、`accelerate.ts:1-222`、`net.ts:1-106`                                                                                                                                                          | catalog 抓取与校验、npm 目录包、源/身份映射、地域路由表与测速、GitHub 只代理 ref 解析                                             | 2026-09-19 |
| `src/install.ts:1-458`、`pnpm-compat.ts:1-553`、`dsh-cli.ts:1-1165`、`ndjson.ts:1-185`、`hot.ts:1-685`、`store.ts:1-89`、`restart.ts:1-396`                                                                                                                                                                                                     | 安装恢复表、失败分类、命令进程层、进度解析、热挂载与 state.json、store 清理、重启守卫                                             | 2026-09-19 |
| `src/verify.ts:1-492`、`check.ts`（导出面 `:37-229,302,714-992`）、`snapshot.ts:1-220`、`backup.ts:1-200`、`patch.ts:1-522`、`trial.ts:1-156`、`presets.ts:1-344`、`order.ts:1-303`、`profile.ts:550-900`                                                                                                                                       | 激活六态、组合体检与试组合、快照/备份、patch 开关、预设与排序、manifest/身份读取                                                  | 2026-09-19 |
| `src/updates.ts:1-430`、`compatibility.ts:1-237`、`update-api-v1.ts`（导出面）、`source-migration.ts:1-61`、`channels.ts:1-70`、`settings.ts:1-141`、`agents.ts:1-43`、`log.ts:1-206`、`dsh-install.ts:1-143`                                                                                                                                   | 更新检查与通道、peer 风险判定、v1 操作记录、git→npm 迁移、settings 命名空间、agent 门、日志脱敏、宿主版本发现                     | 2026-09-19 |
| `UPDATE-API-V1.md:1-194`、`README.md:1-144`、`TESTING.md:1-127`、`IMPROVEMENT-PLAN.md:1-342`                                                                                                                                                                                                                                                    | 对外 API 契约、产品能力与安全声明、四层测试与手动供给检查、历史审计与过时点                                                       | 2026-09-19 |
| `tests/client-inject.spec.ts:1-95`、`tests/client/primitives-guard.spec.ts:1-29`、`tests/client/market-section.client.spec.tsx:1-100`、`tests/client/error-boundary.client.spec.tsx:1-105`、`tests/web/scaffold.ts:1-120`、`tests/web/AUTHENTICATED-LANE.md:1-15`、`scripts/check-web-auth-capture.mjs:1-82`、`vitest{,.web,.compat}.config.ts` | 声明守卫、组件测试范式、e2e 脚手架与认证道禁 trace/HAR、三条测试 lane 的边界                                                      | 2026-09-19 |
| `scripts/validate-registry.mjs:1-320`、`scripts/restart-smoke.mjs:1-47`、`scripts/smoke-spawn.mjs:1-46`                                                                                                                                                                                                                                         | 目录数据门 E1–E12、重启安全 smoke、win32 spawn shim smoke                                                                         | 2026-09-19 |
| `git rev-parse HEAD` / `git log -1` / `git show --stat HEAD`（WSL 克隆）                                                                                                                                                                                                                                                                        | Pinned SHA、提交时间、HEAD 提交内容（artifact guard #643）                                                                        | 2026-09-19 |
| `gh api repos/dsh-market/dsh-market`、`gh issue list --limit 28`                                                                                                                                                                                                                                                                                | star/fork/issue/license/push 元数据；open issues 抽样                                                                             | 2026-09-19 |
| `npm view dshmarket version dist-tags peerDependencies`                                                                                                                                                                                                                                                                                         | 发布态 1.48.0 与三通道 dist-tags、peer range                                                                                      | 2026-09-19 |
| 本仓 `docs/research/2026-09-18-dsh-plugin-installation.md`、`docs/research/2026-09-19-dsh-plugin-authoring-client.md`、`docs/client-bridge.md`、`../decisions/desktop-ui.md#adr-0023`；上游 DSH 克隆 `/tmp/dsh-src-client`（`ddefc45f…`）                                                                                                       | 不重复的宿主安装/client 规范结论，以及 §3.1 槽位差异对照                                                                          | 2026-09-19 |
