# Environment panel and reciprocal Host connections

Accepted target design, confirmed by the Human on 2026-11-13 after Q1–Q28; not a description of shipped behavior or completed acceptance. Extends [#4069](https://github.com/BotHarness/DeepSeekBot/issues/4069); its original reciprocal-grant exclusion remains historical scope for the existing nine slices. See [ADR-0334](../adr/0334-host-relationships-authorize-independent-client-enrollment.md). [中文](environment-panel.zh.md).

## Panel and shared scope

Environment is a first-class Control Rail panel. Simple mode replaces the current panel; Advanced mode adds an independent column. Layout is Client-local. Include All, This Host and saved Remote Hosts, identity/look, connection status and unread count, per-Host management, and a persistent Add entry. First delivery excludes Cloud workspaces. Connections Modal remains the shared invitation/pairing/route-configuration surface, including phone installation guidance.

The Channels header filter and Environment panel manipulate one Client-local persisted Environment Scope shared with Chats and Activity. First use All, then restore the last choice. Removing the selected environment returns All. Filtering preserves the open conversation, read state and notification preferences; visible counts follow scope, while panel rows retain their own Host counts.

All merges Channels by latest message with an environment icon at the avatar's lower-right when multiple environments exist; ambiguous names get environment context. Single-Host scope shows and manages that Host's Channel Sections. Host aliases/icons remain Client-local, consistently used across all these surfaces; they never change actual Host identity.

Creation explicitly names its target. All defaults to the last creation Host; an offline target stays visible and requires explicit selection of an online Host rather than local fallback. A single available target can be preselected. Single-Host scope uses that Host.

## Connection and management

The durable relationship and per-Client credential boundaries are normative in ADR-0334. Manual A1→A2 setup explicitly authorizes a reciprocal relationship once at A2; account discovery auto-enrolls trusted same-account Hosts and reads their Channels without an extra click. Phones enroll each Host independently. Bot collaboration stays a separate opt-in. Routes do not create additional environments.

Report both reachability directions independently, guiding the missing route. An authorized but partially reachable relationship is not fully connected. Closing Connections Modal leaves completed route preparation running. Existing working routes may be reused; Back, method changes and adding another route do not duplicate lifecycles.

Disconnect names the relationship and both Hosts, revokes its derived grants, preserves independent phone grants, and suppresses automatic re-add until explicit reconnect. Offline peer revocation remains visibly pending until acknowledgement. Sign-out stops account discovery/new enrollment/official service but retains existing grants and independently usable routes. Removing an environment returns scope to All and closes its chat/management views; it does not delete remote Bots, Channels or messages.

## Settings target and offline state

Separate this-app preferences from environment settings. Environment settings has a persistent name/icon target selector, independent of Environment Scope. Per-environment management deep-links that exact Host; Bot settings targets the owning Host. First delivery edits one Host at a time, without All bulk writes.

Supported remote Bot management covers name, model/presets, Workspace and approval settings; Host management covers models, usage, storage and connections. Client appearance/notification preferences remain local. Retain each capability's confirmation/permission checks; explain local-interaction requirements for unsupported remote operations.

A dirty target switch offers save-and-switch/discard/cancel. Save failure retains the original target. In-flight requests remain bound to their original Host; an unavailable target never falls back to This Host. Offline environments retain already loaded Channels/content, but sending, creation and remote writes require reconnect. Do not silently queue commands.

Before an operation disables the active route, verify and switch to a working alternative if possible. Otherwise explicitly confirm the disconnection and retain offline content afterward. Transport loss may leave an unknown write outcome: read back through the owning capability before retry, never blindly replay.

The remote Connections section reuses the selected Host’s Device Pairing, individual private-route and account owners. Planned handover verifies an existing route, explicitly changes this Client’s manual preference, waits for the actual active connection and reads back the exact Host before one write. Private route stops name `quick` or `custom`, preserving sibling routes. Execution-only keys under the existing Client HostStorage owner bind an uncertain operation to its pinned Host key, device, generation and operation/route ID. They are execution state, not Host configuration authority; unrelated SavedHost array writes cannot erase them. One shared Web Lock covers prepare/persist, the single write and acknowledgement, and fresh owner readback with generation CAS; missing Web Locks refuse writes. At most 32 unresolved facts are retained, including old-grant facts that never transfer or replay under a new credential. Reload, late acknowledgement and unchanged state never trigger replay. Account sign-out, relationship disconnection and individual device revocation retain their distinct authorities and effects.

## Ownership and delivery

The panel, scope and settings target are application-defined Client presentation; layout persistence owns no Host relationship or remote settings. Host Relationship is durable application data outside DSH Session execution, owned under the operational database boundary, with protected secrets remaining in existing credential owners. Device Pairing remains device-grant authority; account registration and Bot collaboration retain their own authorities. API Gateway is the single Host/Client API interceptor; UI and CLI use the same owning capabilities. No new remote API is specified by this document.

Current main has Client-local RemoteHosts, selected tabs and supported remote settings, but not the complete reciprocal Host relationship or Environment Panel. Mobile provides the shared Chats/Activity filter precedent. Do not label target behavior implemented based on these precedents. Existing connection-stack UI changes and their runtime acceptance remain separate work.

Reference: T3 Code official repository, inspected at `2d8a843e6be9ca170f3bce98cc92ad76617b00c4`: `SettingsScopeSentence.tsx`, `_chat.settings.tsx`, `scopedSettings.ts`, `useScopedSettings.ts`. Adapt explicit device/environment scope, offline-target feedback and identity-bound writes. The inspected navigation layer does not establish draft preservation; our save/discard/cancel behavior is a separate confirmed requirement. The reference checkout is local under `reference/t3code`, not a product dependency.

## Acceptance and performance

| Journey                   | Observable result                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| Manual A1/A2 relationship | Both sides read and operate a real remote Channel after exact authorization                           |
| Another desktop Client    | Reuses the relationship with its own grant; mobile inherits no other Host                             |
| Same account              | Automatic verified enrollment and Channels, no extra click or manual fingerprints                     |
| All/single scope          | Ordering, avatar badges, Sections, Activity counts and creation target agree                          |
| Remote settings           | Only exact target changes; dirty switch, save failure and disconnect do not cross-write               |
| Offline disconnect        | Local refusal is immediate, remote revocation remains pending until acknowledged, no automatic re-add |
| Lost write response       | No duplicate replay; readback distinguishes success/failure/unknown                                   |

Use existing capability/CLI tests and real isolated two-Host runs, followed by separately reported installed Desktop and mobile acceptance under device QA rules. Each cross-layer slice is a runnable tracer bullet, not a horizontal foundation. Start with the narrow reciprocal relationship journey before broadening providers/settings surfaces. Measure three interleaved real-journey runs per side, report median/range/correctness, and guard bounded discovery, probes, derived grants, retained revocations and disposal. This documentation changes no runtime and claims no measured product speedup.
