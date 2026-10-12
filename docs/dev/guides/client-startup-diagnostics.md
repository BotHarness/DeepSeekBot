# Read Client startup diagnostics before accepting UI readiness

Use this loop after every isolated DSH launch, Client rebuild/reload, and interaction that changes the page. Read the real browser console yourself; do not wait for a Human to copy an error.

## Launch and read

The AX launcher enables application-defined Client diagnostics in its own child Host. Ordinary installed Profiles remain opt-in through `BOTHARNESS_CLIENT_DIAGNOSTICS=1`; `--no-client-diagnostics` disables them for a launcher run, as does explicitly setting BOTHARNESS_CLIENT_DIAGNOSTICS to 0.

```bash
node scripts/dev-instance.mjs --home <isolated-home> --port <port> --json > <private-launch.json>
node scripts/dev-client-diagnostics.mjs --launch <private-launch.json>
```

Keep the launch file private: it includes the local login token. The reader authenticates in memory, accepts only a loopback HTTP login URL, and never prints that URL or cookie. Its output includes all retained attempts and identifies earlier failures. By default it selects the newest document by its start time, so a delayed report from an older background page cannot replace it. Pin `--attempt <uuid>` when comparing a particular failed attempt; a later successful reload does not erase it.

| State              | Meaning                                                                 | Reader exit |
| ------------------ | ----------------------------------------------------------------------- | ----------- |
| `unobserved`       | No browser report reached this Host                                     | 2           |
| `starting`         | Observer installed; shell has not been confirmed                        | 2           |
| `shell-ready`      | A visible committed BotHarness navigation button survived a frame check | 0           |
| `failed`           | An exception, missing shell, or foreground boot timeout was observed    | 1           |
| `stale` / `closed` | Reports expired or the document left                                    | 2           |

`0` certifies this shell observation only. Independently read the actual browser console and DOM through the available browser tool before accepting the UI; data readiness, a working composer, and model usability need their own real interactions. A successful `/api` response alone proves none of them. A hidden page defers the foreground boot deadline because Chrome can pause animation callbacks; delayed timers are reported with their actual elapsed time.

## Proactive browser loop

1. Open the launch URL in the authorized browser. Read console errors/warnings and a fresh DOM snapshot immediately after startup and after each relevant interaction. With CUA, use `tab.dev.logs({levels:['error','warn'], limit:50})` and `tab.playwright.domSnapshot()`. Do not use page evaluation to access application internals or a different browser driver when the task requires CUA.
2. Read the diagnostic report and save it beside the private console/DOM evidence. Check `firstFailure`, event sequence, omitted counts, delivery/persistence availability and freshness. The first _observed_ error is a lead, not proof of the causal root.
3. If the browser tool times out or disconnects, preserve that operation's failure separately. Inspect the existing tab before retrying: the operation may already have happened. A browser-control timeout does not prove a product error. For an authenticated fixture, check native admission separately: pinned RC1 rejects cross-site requests with 403 even with a valid cookie. A visible same-origin application link preserves that fence and is the verified fixture navigation path. `net::ERR_BLOCKED_BY_CLIENT` during fixture navigation remains a navigation refusal; do not label it a product crash or claim that the fixture ran.
4. Build a repeatable failing test at the responsible seam, change one variable, rebuild/restart only the exact owned Host, and explicitly reload the browser. Preserve the first failure and every retry's result. Do not swallow exceptions, automatically reload indefinitely, or mutate a paired Profile to get a green result.
5. Finish when the original regression is green, a fresh real DOM shows the intended behavior, and the current console has no unexplained new error. If a native/platform cause cannot be fixed here, hand off its pinned source location, smallest runnable reproduction and unresolved attribution instead of claiming recovery as a fix.

## Capture and ownership

The Host owns the application-defined `client-diagnostics` collector. Its Cordis Fiber installs a native `webServer.tapIndex` transform before the first script, so failures before the BotHarness Client imports can be observed. The browser observes `error` (including resource failures), `unhandledrejection`, and `console.error`; recognized native warning codes retain their order. Console calls still reach the original console. It never calls `preventDefault` or reloads the document.

Only fixed codes, source, attempt UUID, monotonic sequence and elapsed time leave the browser. Unknown exceptions become `unclassified-exception`: raw messages, stacks, URLs, Session IDs, page content, cookies and credentials are omitted rather than scrubbed after transmission. Host validation reconstructs only allowed fields, even for an authenticated report.

`GET/POST /api/botharness/client-diagnostics` uses Connection Fetch's exact authenticated route, without another `/api` interceptor. POST is diagnostic evidence, never authority for product actions. The observer retains the first 16 events and latest 48, with independent first-failure and shell-mount fields and an omitted count; the Host retains 20 document attempts and reports evictions. Reports coalesce, heartbeat every 10 seconds without SSE, and regular delivery stops after four consecutive failures. Document exit makes one final best-effort keepalive POST even if an earlier report is in flight, then disposes without retries. A new document gets a new attempt. A report older than 35 seconds cannot certify a healthy shell.

New ordered events also enter the existing `logs.db` (`plugin='client-diagnostics'`, `kind='client-observation'`, `trace_id=attempt`) under ADR-0063/0064 retention, excluded from backup. Persistence failure is explicit and does not break Client startup. The live endpoint starts empty after Host restart; query the existing database read-only for earlier Host evidence:

```sql
SELECT id, ts, trace_id, detail
FROM log_entries
WHERE plugin = 'client-diagnostics'
ORDER BY id DESC LIMIT 100;
```

See [reading operational logs](reading-operational-logs.md) for WAL and read-only handling. Fiber disposal removes the transform/route and closes its log connection. Document disposal removes observer listeners, timers and console wrappers.

## Pinned RC1 failure attribution

### Two-document request starvation (#1451)

On the pinned RC1 HTTP/1 Host, two simultaneous Bot-mode documents can consume the browser's shared connection budget with independent Channel, roster and Activity SSE streams. A verified loop found one-page authenticated messagingSnapshot reads succeeding, the same read timing out at six seconds after opening a second native document (models/messages/identities remained at Loading), and recovery after the second document navigated to about:blank without a Host restart. CLI and QQ reception remained healthy. Both documents reported visible; hidden-page pausing alone did not address this case. The earlier native Client-runner exceptions remain separately attributed.

The selected Channel, roster and Activity now share one physical EventSource per document at the existing authenticated stream route. With a selected Channel it uses `channelId`, `after`, `roster=1` and `activity=1`; without one it uses `scope=roster&activity=1`. Pinned native client-hmr keeps its own `/plugins/events` connection, so sharing only roster/Activity was insufficient in the real two-document replay. The owning Channel live hub sends Activity from the same projection, coalesces slow-reader updates, and skips heartbeat writes under backpressure. Independent logical Activity consumers share the current healthy baseline; any transport error discards that replay baseline so a late consumer stays stale and retains HTTP recovery until fresh transport data arrives. The last logical consumer closes the physical stream. Channel selection reconfigures the query; constructor refusal preserves the old healthy transport, disposal completes without throwing, and stale replaced-stream callbacks are ignored. The Host composes the existing authoritative Channel and roster streams with at most one in-flight chunk per reader and cancels both on disconnect. Existing purge selectors and Channel revision/Last-Event-ID replay remain authoritative. This changes no Owner authentication, Channel authority or API Gateway registration. See [#1451](https://github.com/BotHarness/DeepSeekBot/issues/1451).

Verified native source: DSH `0.2.0-rc.1`, revision [`4878cdabd87d4041bdaff61d04c966883b9fd07a`](https://github.com/deepseek-ai/deepseek-harness/tree/4878cdabd87d4041bdaff61d04c966883b9fd07a). The shared reference checkout can be on a newer revision; inspect this tag with `git show`, without changing another task's checkout.

```bash
pnpm exec vitest run packages/client/test/native-startup-repro.test.ts
```

This loads the actual installed official renderer and Conversation artifacts. The renderer reproduction registers `root`, obtains its render tree, disposes the registration, then renders through real React DOM. This produces exactly `renderSlot('root') before any 'root' registration (boot order)` from native `ui-renderer/src/client/scoped-slots.tsx`'s `RootOutlet`. Calling `renderSlot` without ever registering root instead produces a different synchronous guard; that is not the reported failure.

The Conversation reproduction invokes actual `UiConversation.binding` with an absent Session and produces `uiConversation.binding: unknown session`. Native `ui-conversation/src/client/apply.ts` subscribes `refreshViews` to locale changes and iterates its tracked bindings by Session ID; this is a source-based candidate for stale-lifecycle investigation, not proof that it caused the original QA crash.

These are minimal native guard reproductions, not a reproduction of the original Profile's triggering action or proof of a native defect. The original registration owner/removal initiator and locale lifecycle interleaving remain unproven. No upstream package is patched and no guard is weakened. Qualification and outstanding scope are tracked in [#1184](https://github.com/BotHarness/DeepSeekBot/issues/1184).
