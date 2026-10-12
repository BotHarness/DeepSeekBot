# DSH debugging playbook

## RC1 streaming routes with GET

Register GET routes with `requestBody: 'buffered'`. The installed RC1 HTTP bridge attaches
`Readable.toWeb(req)` as a body for streaming routes, including GET; WHATWG Request rejects
that combination before the registered handler runs. A real Profile backup preview returned
an empty HTTP 400 while direct handler tests passed. Keep large POST uploads streaming and
verify GET plus POST through the actual authenticated Host after restart. This was reproduced
and corrected on DSH 0.2.0-rc.1 in [#886](https://github.com/BotHarness/DeepSeekBot/issues/886).

## Authenticated fixture navigation

In pinned RC1, native connection.admit also applies the Host/Origin fence: a request with Sec-Fetch-Site: cross-site receives 403 even with a valid cookie. A CUA direct navigation to an authenticated fixture produced Chrome ERR_BLOCKED_BY_CLIENT; the same URL reached through a visible same-origin application link passed admission and ran. Check bounded, credential-free admission metadata before blaming the browser extension or product startup. Keep the native fence intact; use normal application navigation for the verification path. Do not log cookie values, launch tokens or request contents ([#1184](https://github.com/BotHarness/DeepSeekBot/issues/1184)).

## Client startup errors versus browser-control failures

Pinned RC1 has two distinct root guards: `SlotRegistry.renderSlot` refuses assembly with no root registration, while React `RootOutlet` emits `renderSlot('root') before any 'root' registration (boot order)` if the registration disappears after assembly. Reproduce the latter with the installed renderer and real React DOM before attributing it to boot order. Native Conversation locale refresh iterates tracked Session bindings; `uiConversation.binding: unknown session` names an absent native Session, but its appearance after a root crash does not prove causation. Keep the first error and later sequence, and hand off unresolved initiator/lifecycle evidence. See [the executable loop and pinned sources](../../../../docs/dev/guides/client-startup-diagnostics.md) ([#1184](https://github.com/BotHarness/DeepSeekBot/issues/1184)).

A browser tool's mouse/evaluation/screenshot timeout, connection reset or navigation refusal is control-plane evidence. Inspect the current page before retrying and keep those failures separate from product exceptions. Chrome may defer frame callbacks in background tabs; a foreground observation deadline must not treat that as a white-screen crash. An authenticated API 200 alone is only Host transport evidence.

For displayed local-origin permissions, occupied-port checks and bounded browser-control retries, follow the [AX browser qualification loop](../../../../docs/agents/ax-browser.md). Its #1225 evidence records allowed-origin refusals separately from Host health and earlier successful Client actions.

## Temporary SSE refusal versus network reconnect

In the pinned DSH 0.2.0 RC1 installed Profile, a loopback transport fixture severed one application SSE while leaving canonical model commits and the Host alive. Returning temporary HTTP 503 on reconnection made Chrome's EventSource terminally CLOSED; restoring the endpoint alone did not create another request. Distinguish this from a network interruption, where the browser keeps its EventSource reconnect machinery. Check terminal readyState explicitly and replace the application-owned closed transport with one bounded-backoff timer; preserve only its process-local resume identity and cancel the timer on removal/disposal. A replacement EventSource cannot set Last-Event-ID itself: an authenticated application-defined resume parameter may carry the lease, while native Last-Event-ID must take precedence on subsequent automatic reconnects. Keep normal authentication, canonical qualification and lease expiry unchanged. Preserve failed real-Profile evidence and re-run that exact refusal/restore path after the fix ([#1141](https://github.com/BotHarness/DeepSeekBot/issues/1141)).

## Packaged-artifact qualification

Pinned DSH `0.2.0-rc.1` resolves Bundle packages from the running CLI installation
before trying the Profile. A CLI inside the monorepo can therefore load linked
development packages despite a successful tarball install and API probe. Use an
independently installed official CLI, then verify the actual Client version and
component inventory as well as installed artifact integrity. Changing only cwd
does not change the CLI installation anchor. In pnpm 12, local artifact overrides
belong in `pnpm-workspace.yaml`, not `package.json.pnpm.overrides`; preserve existing
settings and reviewed build decisions. The product qualification helper exercises
this path in [#823](https://github.com/BotHarness/BotHarness/issues/823).

Symptoms → checks → conclusions, in the cheapest-first order. All commands assume WSL with the fnm node on PATH; `DSH_HOME=$HOME/.dsh-m35`; repo root.

## 1. Boot verification (always after restarting the dev server)

```bash
cd <repo> && DSH_HOME=$HOME/.dsh-m35 setsid nohup dsh --profile web-dev --no-open > /tmp/dsh-web.log 2>&1 &
sleep 12
cat /tmp/dsh-web.log                     # → dsh web: http://127.0.0.1:3080/?token=…
pgrep -af "node .*installation/bin/dsh" | grep -v bash   # server alive?
```

Then validate the plugin layer actually mounted, not just the HTML shell:

```bash
TOKEN=<token from the log>
curl -s -c /tmp/dsh-cj -o /dev/null "http://127.0.0.1:3080/?token=$TOKEN"
curl -s -o /dev/null -w "%{http_code}\n" -b /tmp/dsh-cj \
  -X POST -H 'content-type: application/json' \
  -d '{"type":"client-request","rpcId":"probe","method":"settings/describe","payload":{"args":{}}}' \
  http://127.0.0.1:3080/api/settings/describe
```

Status semantics:

| Status | Meaning |
| ------ | ------- |
| `401` | no/expired cookie (login step failed or cookie authority mismatch) |
| `404` + plain `not found` | shared `/api` handler found **no matching interceptor claim** — plugin layer broken or wrong interceptor occupying the slot |
| `200` + `server-response` envelope | Host API healthy (Client readiness unverified); bad envelope fields come back as `gateway/bad-request`, not 404 |
| connection refused | server not booted / wrong port / killed by wrapper exit (use `setsid`) |

No-cookie probes: `/` → 401 means the HTTP shell is up; `/api/*` → 404 without a cookie proves only that the route dispatcher ran — **always probe with a cookie**.

## 2. Is the WebSocket stream mux up? (remote events / streaming)

```bash
curl -s -i -N --max-time 5 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" \
  -H "Origin: http://127.0.0.1:3080" -b /tmp/dsh-cj \
  http://127.0.0.1:3080/api/remote.mux | head -5
```

`101 Switching Protocols` = api-gateway host half is alive (registered by `@deepseek-ai/dsh-api-gateway`). This does **not** imply the HTTP `/api` claims work.

## 3. Headless browser probe (console + network + WS)

```bash
cd apps/docs
node ../../.agents/skills/dsh-dev/references/probe-web.mjs http://127.0.0.1:3080 <token>
```

Prints origin/service-worker state, in-page fetches, console errors, failed requests, and WS creations. Use it before blaming the user's browser cache; it reproduces server-side breakage deterministically (headless Chrome, fresh profile).

## 4. Bisect the plugin layer

Two levers, both applied at boot (restart needed, no reinstall):

```
# a) remove a bundle from $DSH_HOME/profiles/web-dev/package.json → dsh.profile.bundles
# b) disable one plugin by id via the user patch layer $DSH_HOME/profiles/web-dev/cordis.patch.yml:
- id: botharness-core
  disabled: true
```

Example that localized the `/api` interceptor conflict: with `deepseekbot` present → native APIs 404; disabled → 200; then binary-search inside the bundle (`botharness-core` vs `botharness-client`).

Clean-room control (is it the profile or DSH itself?):

```bash
DSH_HOME=/tmp/dsh-clean setsid nohup dsh web --no-open --port 3096 > /tmp/dsh-clean.log 2>&1 &
# fresh DSH_HOME: profile "web" boots from the shipped template (dsh-base + dsh-web-app)
```

If the clean profile works and ours does not, the deviation is in our profile/bundles — not DSH.

## 5. Where the contracts live (read the installed code first)

Read the **TS source first**: `reference/deepseek-harness` in this worktree (pinned to the installed tag, see SKILL.md).

Installed packages under `~/.dsh-m35/profiles/node_modules/@deepseek-ai/` are **symlinks to the global dsh install** (`…/fnm/…/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/…`) — when you must read the shipped build, grep with `find -L` or grep `"$dir"/*/lib/*.js`; plain `grep -r` skips symlinked dirs.

- HTTP transport + auth fence: `dsh-client-connection/lib/index.js` (`createSharedFetchHandler`, `registerInterceptor` — single slot per channel, `register` for prefix routes).
- Endpoint claiming: `dsh-api-gateway/lib/index.js` (`intercept('/api', claimsEndpoint, dispatchRpc)`; WS mux at `/api/remote.mux`).
- Browser transport: `dsh-client-connection/lib/client.js` (`createWebConnectionRpc`, `INTERNAL_BASE`, error text `transport failure for <channel>/<endpoint>: HTTP <status>`).
- Boot globals injected into index.html: `__DSH_BOOT__`, `__DSH_CONNECTION_RECOVERY__`, `__DSH_BOOT_READY__` (`dsh-client-connection` host `webserver/index-inject`). `__DSH_TRANSPORT__` is optional; absent = plain HTTP to `location.origin`.

## 6. Preserve the receiver of native Client service callbacks

A class service method such as `uiWorkspace.pickDirectory()` uses its receiver. Passing
`workspace.pickDirectory` as a detached callback loses `this.directoryPicker` and can make a
working native picker appear unavailable. Wrap the call (`() => workspace.pickDirectory()`) or
bind it to the service before injecting it into a UI face. Verify the registration with a
receiver-dependent service fixture and the real Client, rather than an arrow-only mock (#166).

On pinned DSH `0.2.0-rc.1`, the browse backend's directory flow is rendered through workspace
Slots; it does not make `uiWorkspace.pickDirectory()` an in-app dialog. A Consumer using that
native command should keep a manual path fallback when the Host has no native chooser. Do not
replace the gateway, borrow another entry's child Slot, or expose the Host to force a different
picker. For an unbindable macOS system dialog, record native selection as Human QA pending;
opening its process alone is not evidence that a directory was selected.

## Local Computer target verification (DSH 0.2.0 RC1)

Native settings expose only volatile fields. Volatile references have `get()` rather than a subscription; the pinned Loader commits them before emitting the Fiber-filtered `loader/volatile-update` event with changed paths. A resource-owning consumer must react to that event, dispose the old target and invalidate cached tools/session grants instead of capturing the initial target. Patch config replaces the whole object, so the Computer Bundle declares the fresh local default while the schema keeps the legacy container fallback. Verify a real native Settings selection plus Host read-back and restart persistence.

Pinned cua-driver 0.28.0 `doctor --json` checks installation, not TCC grants. Use `mcp --direct --embedded` for the Host-owned stdio runtime and read `check_permissions({prompt:false})`; the ordinary macOS proxy path belongs to the standalone driver identity. Embedded mode does not raise permission prompts. Granted OS booleans do not prove direct ScreenCaptureKit capture: preserve a real first-observation failure and report it separately from installation/permissions. Do not silently retry a native permission refusal. See the [upstream embedding contract](https://github.com/trycua/cua/blob/cua-driver-rs-v0.28.0/libs/cua-driver/rust/Skills/cua-driver/EMBEDDING.md).

For a mode that categorically refuses an upload, register its route as buffered under the native request-body cap instead of streaming. The pinned HTTP bridge destroys unread streaming requests after writing the response; a short early refusal can reach Undici as a socket-close error. Computer re-registers the upload route when its target changes: local is buffered and refused; container keeps the existing streaming TAR path. Verify the refusal over real HTTP, not only with a constructed Request.

Pinned DSH MCP `createMcpToolDefinition` retains `structuredContent` in the canonical result value, but its Native model text projection reads only `content`. A driver that emits a count-only text block can therefore hide window IDs and snapshot element tokens from the model. Computer mirrors the same structured payload into a JSON text block before the Native adapter, keeping image blocks and the original structured value intact; it never mirrors this observation data into Computer Audit. Validate with a real model Turn rather than only asserting the raw driver return.


### Checked external replies with reception disabled

A connected third-party IM account can still refuse a checked reply if its runtime remains in a standalone consumer mode. Verify the pinned Provider contract and the actual responder account: mocked reply qualification alone does not exercise exclusive consumer acquisition. Keep reply connection ownership separate from receive scope; use the existing consumer fanout and lifecycle cancellation without enabling Inbox admission or a standalone Session runner merely to make the reply succeed. #637 validates this boundary with an independent responder identity.

## Native `read_image` and scoped filesystem injection (DSH 0.2.0-rc.1)

A successful external image download and a model route declaring image input do not prove the native image Tool can read it. In an Orchestrator with an isolated filesystem Provider, the pinned `@deepseek-ai/dsh-tool-fs` attachment subplugin declares only `attachments`; its later `ctx.fs` access fails with `cannot get property "fs" without inject`. Reproduce through the real Cordis Tool Registry using `packages/core/test/orchestrator-file-tools.test.ts`, not a mocked Tool implementation.

The task-qualified package patch declares both `attachments` and `fs` for that subplugin. It reuses the existing Provider, native image-capability checks, canonical Attachment service and per-call Grant gate; it adds no authority or parallel image Tool. The regression must return an ImageBlock on an authorized path, refuse after Grant revocation without another filesystem read, and remove the registration on awaited disposal. Build and reinstall the packaged product, restart the exact isolated Host, then require fresh native `read_image` and model visual evidence; a Client preview or a green unit test alone is insufficient ([#904](https://github.com/BotHarness/BotHarness/issues/904)).

## Windows candidate installation and native execution (DSH 0.2.0-rc.1)

Check the physical QA path before handing a script to a Human's ordinary PowerShell. In the packaged Codex desktop process, Windows redirected an apparent `%LOCALAPPDATA%/BotHarness/qa` home into the app package's `LocalCache/Local` tree; both agent and elevated child checks passed while the Human's unredirected path was absent. `GetFinalPathNameByHandle` on the existing patch file identified its physical location. Use that verified location consistently in the private wizard and credential helper, and keep the IM Fiber disabled; a repeated check in the same redirected process does not prove the Human can use the alias.

An isolated Profile outside the checkout does not inherit the root `packageManager` pin. During [#1029](https://github.com/BotHarness/BotHarness/issues/1029), that Profile used pnpm 10 and resolved a cross-drive absolute `file:` dependency beneath the Profile directory, causing `ENOENT`. Set the Profile's package-manager pin explicitly. A verified alternative is to copy the candidate's complete published file set into the same QA home and install through a relative `file:` dependency. Compare the installed source and artifacts, including locale files, against the candidate checkout; a shared package version does not identify the candidate. Keep the IM Fiber disabled until exclusive receiver ownership is authorized.

Preserve pnpm's supply-chain policy when repairing that installation. An earlier unpinned install selected a dependency too new for pnpm 12's minimum release age; the QA Profile was re-resolved with the pinned manager and an override taken from the candidate's committed lockfile. Do not lower the age gate merely to make a local install pass.

The pinned Windows composition enables `pwsh-sandbox`; a Tool named `bash` does not by itself identify its Shell Provider. A real approved `printf` invocation reached Git/MSYS and failed with a Win32 signal-pipe error and `[exit code: 1]`, while its native result had `isError: false`. Inspect the actual output and exit evidence as well as the canonical decision. A fresh bounded `node -e` print invocation verified successful execution on Windows; a separate rejected request returned the native rejection error with no replacement call. Keep failed evidence, and do not retry a denied operation under a different command. Authenticated Web approval qualification remains separate from real IM button-to-native-result qualification.

Preserve the instant when comparing an owned Host's process start time. PowerShell's `ConvertFrom-Json` can turn an ISO timestamp into `DateTime`; converting that object back to a culture-specific string and parsing it as `DateTimeOffset` can lose the original UTC offset. This made an exact-PID cleanup guard refuse the correct process. Cast the typed value directly, or retain the original ISO string, and compare UTC instants before stopping the process. The corrected manual check matched with zero time difference. Keep the original refusal as evidence; correcting the helper does not prove its independent automatic cutoff ran successfully. Server-owned restoration and explicit local cleanup must have separate evidence.

## Readable diagnostics require an actual Cordis exporter

In the QQ QA Profile on pinned DSH 0.2.0 RC1, Cordis Logger accepted structured
messages while the CLI output contained only its startup URL. An empty stdout
file therefore did not establish that no native callback arrived. Mount a
task-owned, bounded exporter through a Patch `insert` entry, verify a known
lifecycle record reaches it, and then inspect the wanted records. A new top-level
`{ id, name, config }` patch only targets an existing row; it does not add a Plugin.
Keep the diagnostic sink process evidence, whitelist fields, exclude text and
secrets, and remove the task Patch after qualification.

This exposed an application-defined QQ restoration failure: account readiness
was temporarily unavailable at boot, the group receiver classified the missing
control lease as non-retryable, and the account receiver later recovered while
the first new mention missed Channel placement. Inspect account readiness before
requiring the control lease so the existing bounded transient retry remains
applicable; verify the first new message after a delayed-ready restart, not only
retained history or replay of old replies ([#1156](https://github.com/BotHarness/DeepSeekBot/issues/1156)).

A separate Client capture in this Profile became blank after the native locale
subscriber raised `uiConversation.binding: unknown session`. Reload recovered the
Client; the cause is unconfirmed. Preserve that browser error and failed capture,
and do not classify it as QQ transport failure or fix it by changing `/api` ownership.

## RC1 native Human waits hold their current Agent step

For same-PersonaBot wait experiments, distinguish durable Inbox Admission and
accepted `steer` from actual native input claim/model processing. Pinned DSH
`0.2.0-rc.1` keeps the current Agent step inside awaited tool preparation/body;
its driver cannot claim next-step input until approval/question resolves.
An independent Assignment approval can leave its Orchestrator available when
that Orchestrator ends its dispatch turn. This does not release the Assignment
running permit or qualify an Orchestrator's own wait. Test native approval and
formal question separately through existing Web controls, retain exact original
Session/call/arguments, native decision/result and the unrelated `channel_send`
receipt. Recheck scope changes/revocation. Cancellation/cold resume are not
preserved-call suspension. See the [bounded #1036 experiment](../../../../docs/research/1036-native-wait-experiment.md)
and [local capability blocker #1220](https://github.com/BotHarness/DeepSeekBot/issues/1220).

## RC2 timed questions outlive their foreground wait

In isolated DSH `0.2.0-rc.2`, configure the native `tool-ask-user` Plugin inside
the selected Agent Preset's `config.plugins` for timed mode. The Tool can truthfully
return pending while the original question's native Projection remains continued.
The foreground signal abort is not necessarily parent Agent cancellation: an
application answerer that treats every abort as final cancellation can expire its
card even though the native question remains answerable. Do not keep the expired
Promise as a second authority; qualify the native Projection and late-reply seam.

Service parameter names do not necessarily equal named HTTP gateway arguments.
The running RC2 `userQuestions/answer` descriptor expects `agentId` carrying the
Session ID, not `agent`; invalid fields are rejected before execution. Verify the
actual descriptor/Client and Host. Acceptance means queued input: retain original
call correlation, qualified reply enqueue and admission, settled Projection,
actual model processing and canonical Channel send receipt. A native control
probe does not establish downstream Channel actor or disclosure authority.

The [bounded RC2 experiment](../../../../docs/research/1220-native-timed-question-experiment.md)
verified the same-Session question path and retained the original incompatible application
card as negative evidence. The subsequent [DM card tracer](../../../../docs/research/1220-timed-question-card-e2e.md)
uses the native Projection and Service through the owning Orchestrator runtime. It did not upgrade production RC1, qualify permission
approval, or prove cold recovery/capacity release. Preserve native pending-result
explanatory fields; do not mistake an extra field or harmless answer punctuation
for a runtime failure. Keep earlier probe and Client startup failures separately.

## Timed-question cards need the application run lifecycle

For an application adapter whose tools require a live application run, qualify a late answer
after the ordinary native Turn has completely ended. Native `userQuestions.answer` can admit
the answer and start model work outside that application run; native settlement alone then
does not prove a Channel reply. In the RC2 card tracer this produced `channel_send: Orchestrator
run is unavailable`. Bind original source/Session/DM context while the question is asked,
serialize delivery through the owning runtime, recheck current authority, and keep that run
through native idle. The native Service still owns answer admission; the adapter supplies no
extra ordinary input, executor or decision. Capture native Tool results and actual Channel
receipts, including the failed run, before reporting success.

In real Web automation, a Channel composer can transition from textarea to rich contenteditable
after Channel metadata loads. Select the existing `.bh-composer-input`, click it, and type through
the browser; verify the actual send response. A cached textarea selector can disappear during
that transition. Retain the first failure and current DOM/console, then use the established
composer interaction path rather than bypassing it through RPC.
