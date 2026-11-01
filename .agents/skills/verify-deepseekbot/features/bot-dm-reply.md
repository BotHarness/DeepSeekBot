# Bot DM reply

A Human sends a message in a Bot's DM, the Bot runs a session on its configured model, and its reply lands in the same DM.

## Sub-features

- `send` posts the Human message from the composer.
- `run` starts the Bot's session, visible in the Channel sidebar `Sessions` tab as `Running`.
- `explicit-send` uses `bot_send_message` for local text, with a trusted reply Source Event or explicit proactive Channel.
- `turn-conclusion` permits `end_turn` only after a committed send and successful requested Inbox resolution; a question can leave its source open, and a later Human message still starts work.
- `reply` commits the Bot's answer to the DM timeline.
- `network-connect-dm` discovers and contacts same-account online Hosts through Connect without Tailscale or Human device pairing.
- `network-lan-admission` discovers nearby Host identities, requires bilateral exact-key Human approval, and carries Bot DMs over the existing LAN entry and Inbox.
- `network-route-continuity` preserves one colleague and DM when an explicit new send changes between Tailnet and Connect, without replaying failed or unknown sends.
- `network-contact-lifecycle` refreshes a colleague's public facts and availability in the CLI and read-only remote DM.
- `network-scope-withdrawal` cancels unstarted relationship work, preserves history and prevents reconnection from reviving it.
- `network-third-colleague` preserves the causal chain and wake limit when a Bot explicitly contacts another eligible Host.

## How to get to it (user POV)

- Enter Bot mode, open the `DeepSeek Bot` DM, type in `Message DeepSeek Bot`, press Enter.

## Driving it with verify-app

Preconditions: `launch` reported a model credential, `doctor` passes, and the default DeepSeek Bot exists (see [bot-mode.md](bot-mode.md)).

- **Scripted model path.** `node scripts/e2e-llm-scenarios.mjs --name <n> --scenario dm-reply --model host-default` checks the model/API path; the composer path below is a separate UI proof.
- **Send and wait.** Run `node scripts/verify-app.mjs shot dm-reply --name <n> --bot-mode --fill "Message DeepSeek Bot=What is 6 times 7? Answer with digits only." --press Enter --wait-text 42`. The step list ends with `saw text "42"`, and the screenshot shows the Human message and the Bot reply.
- **Canonical state.** Get the slug from `rpc botharness/list`, then the Channel id from `rpc botharness/channelDm '{"slug":"<slug>","displayName":"DeepSeek Bot"}'`, then run `rpc botharness/channelTimeline '{"channelId":"<id>"}'`. The entries end with a `human` entry holding the prompt and a `bot` entry holding the reply.

## Gotchas

- The bottom-right Window Companion covers the `Send` button at 1440×900, so `--click Send` lands on the companion. Press Enter instead.
- `--wait-text` ignores the composer value but matches the sent Human message, sidebar previews and error details. A reply word in the prompt passes before the Bot answers; `42` also matches a `429` quota failure. Use a distinctive computed answer, inspect the actual conversation screenshot and require a canonical Bot-authored reply without `sessionFailure`.
- On a keyless Host the message sends and the session fails. That is a missing precondition, not a product failure.
- `--click-text "DeepSeek Bot"` matches the conversation header chip last and opens the conversation menu (View profile goes directly to the full profile). The DM is already selected on first entry.

For the explicit-send slice, correlate the visible reply with `bot-trace`: require a committed
`bot_send_message` result, the intended reply source and Inbox resolution. Compare a send with
`end_turn: true` against an ordinary send: the former must finish without a redundant final model
request. Send a fresh Human message afterward and verify another reply. The direct path is
`bot-tool <slug> bot_send_message --args-stdin`; verify its actual message in the same DM.

## Explicit LAN admission and Bot DM

Use two isolated Profiles with distinct Host identities. Two Profiles on one machine qualify the Host/runtime path; acceptance on two physical LAN devices must be recorded separately. Leave existing services and shared device QA resources untouched.

1. Run `device-lan enable --confirm` on both Hosts, or use Bot settings → Connections → Manage → Enable local access. In LAN Bot collaboration, verify nearby Host names are marked not allowed. `bot-lan list` must show `discovered: true`, `admitted: false`; neither a discovery advertisement nor Human device pairing can reveal private Bot contacts or send a Bot DM.
2. Open **Show identity fingerprint** on each Host. Compare full Host IDs and fingerprints, then choose **Review and allow** for the intended peer and confirm the matching identity. Repeat on the other Host; one-sided approval is insufficient. CLI parity is `bot-lan admit <host-id> <public-key> --confirm`. A wrong key or a candidate changed during review must refuse without granting access. The `approval` projection preserves the old approved identity when a different key is advertised, so its access remains revocable.
3. Query `bot-tool <caller> list_bot_contacts`, then drive the existing Human DM request → explicit Bot send → receiving Inbox → Bot reply path described below. Require the remote Channel's membership provenance to be `lan`, both real transcripts and Inbox facts, the stable colleague identity, and a read-only Human conversation. Do not count a Tailnet or Connect route as LAN proof.
4. From Connections, revoke the peer and require its local approval to disappear in `bot-lan list`. A new send must refuse; old accepted history stays visible. An offline previously approved Host must still offer revocation. If its advertised key changes, show the old approved fingerprint when revoking. Use `bot-lan revoke <host-id> --confirm` for the equivalent CLI operation. Confirm an independent still-valid network scope continues to authorize its own route.
5. Stop only the task-owned peer, try a uniquely marked send, then restart the same Profile. Check no queued send or deferred reply appears. Keep timeout/unknown-result fault injection separate from live evidence. Close discovery with `device-lan disable`, stop verified owned PIDs/children, and confirm listener release.

Capture real light/dark before/after UI and console output. Use `--click "Show identity fingerprint"` for the disclosure: `--click-text` targets buttons/links, not native summary elements. On a fresh Profile, dismiss **Welcome to Tobs** with **Skip** before settings; wait for LAN Bot collaboration data instead of capturing the initial loading state.

## Cross-Host Bot DM (Tailscale)

Use two isolated Hosts with active Bots in the same verified tailnet. Run them on separate devices for cross-device acceptance; two profiles on one machine only qualify the Host bridge. Do not enter peer addresses or pair individual Bots. Keep the test Hosts, source events and evidence separate from ordinary conversations.

1. Through `bot-tool <caller> list_bot_contacts --args-stdin`, find the remote colleague. Verify distinct Host/Bot identity, public description, actual device platform/model and capability facts; missing values remain unavailable. No private Memory, SOUL, local path or management credential belongs in this result.
2. Send a Human DM asking the caller to find the iOS colleague and request a unique acknowledgement. Inspect `bot-trace` for the explicit contact lookup and committed `bot_send_message`, then inspect both Hosts' Channel timelines and recipient Inbox. Receiver acceptance alone is not observation or completion.
3. Open the originating Human DM, follow its message trace into the remote Bot DM, and inspect the request and reply. The conversation stays read-only for the Human. Hover or focus the remote author's name to inspect its public profile, device and capabilities; it must not offer local Bot management or a Human DM action. Capture both themes and inspect the actual screenshots and console.
4. Separately run `bot-tool <caller> bot_send_message --cause-event <real-admitted-source> --args-stdin` with the discovered `bot_id` and text `body`. The CLI runs the production tool directly. Verify committed history and the direct trace without attributing a model's later reply to the direct runner. Missing or another Bot's cause must fail.
5. Stop only the owned recipient Host and try a new uniquely marked send. Expect unable-to-deliver, then restart that same profile: no delayed send may appear. Use the bridge fault-injection test for a lost acknowledgement after acceptance: the result is delivery-unknown, accepted history remains once, and restart/discovery must not replay it. Record that injection separately from live-device evidence.
6. Restart each task Host with its existing profile. Accepted history survives; there is no executable outgoing queue. Correlate the two timelines, Inbox admissions, direct/tool traces and bounded bridge lifecycle records. Never publish login URLs, tailnet addresses or unrelated conversations.

Discovery refresh is asynchronous. If a newly created colleague is not yet listed, inspect the bridge listener and discovery diagnostics before repeating a mutation. Ordinary contacts polling must never resend a message.

### Colleague and scope lifecycle

1. Create a new uniquely named Bot on the owned recipient Host. The next `list_bot_contacts` query must show its new identity. Update its public description and confirm the next query and author card show the new facts. Preserve `null` for unknown device facts; do not infer a capability from its description.
2. Archive that Bot after obtaining its contact result. A send using the stale identifier must be refused. Unarchive, query again, then delete through the existing confirmed Bot deletion path. The old identifier must still refuse sends. Create a same-name replacement and verify that its new identity and DM have no inherited messages or receipts; the original conversation remains inspectable.
3. In the remote DM, inspect the read-only footer and author card in light and dark themes. Correlate their availability label with `channels[].remoteAvailability`: available, unavailable, withdrawn, or bot-unavailable. Stop only the owned recipient Host to prove temporary unavailability; no local work may be canceled merely because the route disappeared. Restart it and confirm no failed-send marker appears later.
4. Use an isolated membership authority for removal tests. Never remove a shared production device from its tailnet to simulate this state. The regression in `packages/core/test/bot-tailnet-bridge.test.ts` injects removal/rejoin events into the actual bridge, while `network-bot-runtime.test.ts` verifies the existing Inbox owner: accepted/unstarted work is canceled, started work can finish but cannot reply, and reopening the same database does not resurrect canceled work. Keep this injected evidence distinct from real-device route-loss evidence. The native subscription must also successfully observe the installed daemon's initial status and close on disposal.
5. Run `packages/core/test/network-lifecycle.test.ts` for the model-free public tool path across three real HTTP/Noise bridges and separate Core owners. Require explicit third-colleague contact, unchanged root/parent/hop facts, no transitive admission across the injected network scopes, and no recipient wake at hop 33. This qualifies the owner/transport integration, not a three-physical-device deployment.
6. Correlate the live journey with `watch-started`, any coded watcher failures, discovery and send lifecycle records. Native notification payloads, keys, addresses and unrelated device data must stay out of published evidence. A failed watcher or an unavailable query is not proof of membership withdrawal.


## Cross-Host Bot DM (dual-route continuity)

Use two task-owned Hosts with both verified Tailnet and Connect routes. Query contacts through the CLI and inspect the existing read-only DM in the Client: require one stable colleague identity, public profile and conversation even when names match. Do not change a production device's memberships to create a failure.

1. Send and receive over Tailnet, then make only that task-owned route unavailable. Send a new uniquely marked message without manually querying contacts first; require Connect diagnostics and both messages in the same canonical Channel and visible DM.
2. After a real Connect receiver commit, drop its acknowledgement and make Tailnet available. Require `delivery-unknown`, one receiver message, no fabricated sender success and no alternate send. A later explicit message may use Tailnet in the same DM.
3. Make both task routes unavailable. A new send must fail. Restore one route and explicitly send a different message, then restart both isolated Profiles. The failed marker must remain absent; accepted history and Channel identity must remain. No outgoing message may appear merely from reconnecting or restarting.
4. Remove one eligible collaboration scope while the other remains valid, then remove both. One valid scope preserves contact eligibility; no valid scope refuses new contacts/sends. Keep injected authority evidence separate from actual-device connectivity evidence.
5. Run `packages/core/test/bot-network-continuity.test.ts` for the real Core, HTTP/Noise and direct Bot-tool regression. Its external membership authorities are injected; passing it does not qualify real WorkOS, Tailscale or Cloudflare. Keep same-name identity and public-profile checks from the contact-lifecycle journey.

## Cross-Host Bot DM (Connect-only)

Use two task-owned isolated Hosts and an isolated relay/database with Bot registration support. Sign both Hosts into the same verified Connect account, retain their normal model/Workspace permissions, and make Tailscale unavailable to these test Hosts. Never unlink or reconfigure a shared production device to simulate withdrawal.

1. Query `bot-tool <bot> list_bot_contacts` on each Host. Require the other Host's active Bots, stable identity, public description and actual capability projection without per-Bot approval or Human Device pairing. Correlate the result with Connect bridge diagnostics; a tailnet-only result does not qualify this journey.
2. With an owned Human Source Event, send a uniquely marked DM using `bot_send_message`. Require canonical receiver Source Event, Channel placement and Inbox Admission, then a real model reply with the same conversation/cause chain. Inspect both timelines through CLI and the read-only Client; capture light/dark evidence and public author facts.
3. Stop only the task-owned recipient Host. A fresh send must report inability to deliver; reconnect and restart both profiles and verify it never appears later. Record the controlled lost-ack test separately: `connect-network-inbox.test.ts` covers `delivery-unknown`, receiver acceptance once, no fabricated sender success and no restart replay using real Core/HTTP/Noise with an injected account authority.
4. In the isolated account, remove the peer registration or sign out. Accepted unstarted work must be retired; already-started local work keeps its permissions but cannot reply through the withdrawn scope. If another verified scope remains valid, it preserves eligibility. Rejoining must not revive canceled work.
5. Exercise an expired account token and a recipient paused after discovery. The former can refresh only the rejected control-plane request; the latter returns an authenticated refusal. Neither sends another message automatically. Keep fake authority/unit evidence distinct from real WorkOS, relay, tunnel and cross-device evidence.

Qualification remains incomplete until the real cloud route, model reply and visible Client path above have passed on the PR head. A signed-out Host smoke test or passing injected-authority tests alone is insufficient.

Connect qualification must traverse the real cloudflared loopback origin, not only the Host handler. Verify the exact Bot handshake/request POST paths are reachable while Human authorization headers, cookies, query variants and Bot-path WebSocket upgrades remain refused.
