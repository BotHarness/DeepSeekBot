# Panel authoring: DSH mechanisms and current BotHarness seam

Date: 2026-10-19. Investigation only; no product decision, ADR, installation, or live Host verification.

## Evidence boundary

- BotHarness inspected at `508e3b3c0`; its root `package.json:45` pins `@deepseek-ai/dsh` to `0.2.1-rc.2` (also pinned across `packages/client/package.json`).
- The upstream [`dsh-v0.2.1-rc.2` tag](https://api.github.com/repos/deepseek-ai/deepseek-harness/git/ref/tags/dsh-v0.2.1-rc.2) resolves to `687f282e8625c6b8d11ff58211a90524be2e4317`. The upstream master tree returned the same SHA during this investigation. Source links below are fixed to that SHA; the official docs site remains a moving reference.
- No dependencies were installed in this worktree and no Host was launched. These are source/documentation contracts, not proof that an arbitrary external Bundle works in our launched Profile.

## Creator mode: package authoring is possible; the documented example is configuration only

The [current official tutorial](https://deepseek-harness.github.io/deepseek-harness/en/develop/practice/dynamic-cordis) demonstrates writing a configuration-only Bundle and invoking `plugin_manager install_bundle` to add an MCP client. It asks for both an applied management result and an actual tool call. It does not demonstrate an arbitrary JavaScript evaluation tool. Earlier research about `cordis_define`/`cordis_run` must not substitute for this current contract.

Plugin Manager is broader than that example: it installs external npm, local-path, git and tarball Bundles. Its Creator tool changes the current Profile, persists across Sessions, and its installed Host code runs inside the Host process. This is not a Bot-local sandbox. Tool authorization and dependency build-script approval are distinct. See [Plugin Manager README, lines 27–47](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/boot/plugin-manager/README.md#L27-L47).

Thus “a Bot writes/builds a proper Plugin package, then installs it” fits native packaging. “Creator automatically grants arbitrary code a Bot-only execution boundary” does not follow. **Bot ownership, installation ownership, display placement, and data access remain separate application-defined questions.**

## There are three different live-update mechanisms

### Profile composition / Host activation

With DSH HMR enabled, Plugin Manager recomposes the Profile. Without it, activation waits for restart. A package moved to another directory or a changed module outside the reloadable Loader graph can still yield `restart-required`; the reason is explicit. Package download/build success is not activation success, and a Host management result does not prove browser synchronization. See [Plugin Manager activation and limitations](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/boot/plugin-manager/README.md#L94-L142).

### Host source/module replacement

The base Bundle enables HMR with `root: []` when launcher Profile facts exist. That watches configuration, not arbitrary source edits. A configured source watch root or a later Profile recomposition can replace reloadable modules; recomposition compares installed and linked package files. Host dependencies outside the traversable Loader tree stay pending. HMR is neither a TypeScript compiler nor a guarantee of process-wide module replacement. See [DSH HMR configuration and algorithm](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/boot/hmr/README.md#L27-L76) and its [limitations](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/boot/hmr/README.md#L109-L132).

### Browser Client artifact replacement

A Client Plugin declares `dsh.client` with `platform: 'web'`, exports a built `./client`, and declares exact non-baseline external requests. The Host serves built artifacts, even when launching Host source. Enabling/disabling entries changes the browser graph; disposal waits for asynchronous effects before unused modules/styles are removed. See [Client Modules authoring and live composition](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/modules/README.md#L28-L54).

Client HMR watches the stamped bundle entry and delivers graph/rebuilt frames. The browser downloads the replacement, drains the old Fiber, removes owned styles, and mounts fresh exports. Injected service dependents cascade through Cordis. React component state is lost; after teardown a failed replacement has no automatic rollback. This is bundle/Fiber replacement, not React Fast Refresh. See [Client HMR development flow](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/hmr/README.md#L27-L48), [swap and failure policy](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/hmr/README.md#L60-L74), and [limitations](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/hmr/README.md#L109-L118).

BotHarness separately provides `pnpm dev:client` (`package.json:31`, `tsdown.client.config.ts:5`) and an opt-in localhost full-page refresh on its rebuilt frame (`packages/client/src/client/dev-client-refresh.ts:1`). That refresh path cannot establish that an independently authored Plugin hot-swaps correctly without refreshing the page.

## External Client Plugins should consume Services and Slots with owned cleanup

The browser is a separate Cordis application. Cross-feature behavior uses injected Services; cross-feature UI uses Slots. Shared declarations may use type imports. Runtime-importing another feature Plugin's implementation is not the intended seam, and adding `dsh.client.external` is not permission to bypass that boundary. Host capability crosses generated Remote/API Gateway or exact Fetch routes; an ordinary Cordis Event does not automatically travel to the browser or replay after reconnect. See [Web Client: communication, package boundaries and reconnection](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/subsystems/web-client.md).

Inference for a Three.js panel: its Plugin/Fiber must own event unsubscriptions, animation frames, browser listeners and renderer/GPU teardown. Native HMR can await registered effects; it cannot infer cleanup for resources the panel created outside its lifecycle. An Office scene likewise needs a baseline query/projection if joining after an Event occurred must display current state.

## BotHarness already has a panel Registry, but no complete public authoring SDK

Current implementation facts:

- `packages/client/src/client/dock-panels.ts:15` defines `DockPanelScope = 'global' | 'channel'`. A channel supplies `id`, `type`, and optional `botSlug` (`:22`); this does not yet declare a separately enforced per-Bot installation or permission scope.
- `DockPanelRegistry.register()` returns an unregister function (`dock-panels.ts:54`). The implementation rejects duplicate IDs (`:98`) and removes a registration with an identity-safe disposer (`:104`). Its subscriber interface observes local Registry changes, not a documented external Cordis Event schema.
- `packages/client/src/client/index.ts:416` creates the Registry and `:417` publishes `dockPanels` through `ctx.provide`. The built-in Activity Center registers through it (`:471`). This is an application-defined Client Service seam worth evaluating, rather than evidence that nothing exists.
- Public packaging is incomplete for external typed authors: `packages/client/package.json:13` exports only the Host root, `./client` runtime and `./package.json`. The browser build has `dts: false` (`tsdown.config.ts:33`); the Host root (`packages/client/src/index.ts:1`) does not export `DockPanel`/`DockPanelRegistry`. No Cordis Context declaration for `dockPanels` was found under `packages/client/src`. External authors cannot currently rely on a dedicated public panel-type entry from `@botharness/ui`.
- Tests at `packages/client/test/dock-panels.test.ts:29` cover ordering, duplicate rejection, disposer identity and layout delegation. They are implementation coverage, not external-package or native browser-HMR proof; they were not run in this read-only investigation.

## Questions these mechanisms leave open

These are review questions, not decisions:

1. Is an authored panel a trusted DSH Plugin (Profile-wide installation/code authority), a restricted browser document, or another application-defined execution boundary?
2. Does Bot binding mean display filtering, installation ownership, data authorization, persistence ownership, or all of them? Current `global | channel` placement does not answer this.
3. Which facts are Host Cordis Events, browser Cordis Events, or durable domain facts with baseline/replay? A universal “panel event bus” cannot implicitly grant all three.
4. What minimal public type entry, Service contract, identity/namespace and cleanup contract must an external author use? How is replacement failure exposed and repaired?
5. Can one external test Bundle build, install, render, consume an authorized event, hot-swap, disable, and dispose correctly on pinned `0.2.1-rc.2`? That is the missing runtime proof before promising immediate development/loading.
