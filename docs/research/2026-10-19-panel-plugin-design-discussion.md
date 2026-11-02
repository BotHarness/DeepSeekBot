# Panel plugins: design discussion

Date: 2026-10-19. Baseline: BotHarness main `508e3b3c0`.

This records the ongoing `grill-with-docs` discussion. Accepted design direction is now recorded in [ADR-0234](../adr/0234-panels-are-native-plugins-with-independent-binding.md); this discussion is supporting evidence, not implementation authorization. Existing implementation facts are in [the event audit](2026-10-19-panel-events-audit.md) and [the pinned DSH mechanism investigation](2026-10-19-panel-authoring-dsh-mechanisms.md).

## Human-confirmed direction

- Establish a documented public capability and business-event foundation before expanding panel authoring adapters.
- Refactor first-party Panels into Plugins, following DSH's everything-is-plugin ecosystem. This is a first-party decoupling goal as well as a third-party extension goal.
- Expose meaningful underlying changes, including Memory file changes and PersonaBot Activity, so independent Services and DSH Plugins can react across Bots.
- Support Global Panel, Bot-bound Panel, Channel-bound Panel and Group-channel-bound Panel. Binding is separate from placement. In a Channel workspace, binding normally follows the current Channel context; an instance in the Global workspace may explicitly select a fixed Bot or Channel and must visibly identify that subject, for example in its header. Fixed geometry is not the meaning of Bot-bound. Channel files apply to both DM and Group Channels; group membership is Group-channel-bound.
- All first-party Panels, including system entry surfaces, should be Plugins and allow replacement. Q10 accepts one effective implementation per required role, a first-party fallback and an independent recovery entry, while directing conflict handling to follow native DSH mechanisms. Concrete failure detection still needs source and runtime qualification.
- Observe Memory changes even without an active conversation, including external editor, Shell and Git changes. Preserve the distinction between observed working-tree changes and Git commits; do not promise one notification per disk write or infer an author from observation.
- Installation should display the contributed Panel in the UI. One installation makes an implementation available; ordinary content supports multiple instances with separate bindings, and reinstall must not duplicate instances. Required shell roles retain their cardinality.

These directions do not imply that each Panel needs a separately published npm package, that installing a UI grants access to every Bot, or that a UI Plugin owns the underlying domain data. Those interpretations require separate decisions.

## Responsibility split recorded in ADR-0234

| Responsibility                                          | Primary seam                                                                      | Lifetime / authority                                                               |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Memory, Activity and other shared business capabilities | Application-defined Service Definition / Provider                                 | Owning Host module; independent of whether a Panel is mounted                      |
| Committed or observed business changes                  | Typed application-defined Cordis Event                                            | Host process-local notification with explicit production semantics                 |
| Host data in a browser Panel                            | Authenticated Typert / API Gateway or existing exact routes and supported streams | Explicit query/subscription adapter; lifecycle and authorization owned             |
| Panel UI contribution                                   | Browser Plugin/Fiber and Panel Registry Registration                              | Disposable contribution; binding and presentation are separate from data authority |
| Distribution and enablement                             | Native Bundle/Profile/Patch and Plugin Manager                                    | Profile composition; one Bundle may compose several Plugins                        |

Independent capability Providers, public event producers and Panel Consumers must not acquire a mandatory dependency on the Panel being visible. Initial reads, live subscriptions, reconnection, bad consumers and unload behavior are part of the public contract. Exact versioned public signatures remain implementation work.

## Human answers to Q7–Q11

7. **Binding, placement and applicability are separate.** Bot-bound and Channel-bound content normally appears inside Messages and follows the selected Channel. A 3D companion may instead be placed in the Global workspace with an explicit binding selector and a visible Bot/Channel identity. Group-channel-bound reuses Channel binding with Group-only applicability. This does not automatically enable cross-workspace dragging of existing Channel subpanels.
8. **Ordinary content supports multiple instances.** The Human explicitly accepted two Global-workspace instances of the same 3D implementation, bound to different Bots. Install/reinstall and instance creation are separate; required system roles retain uniqueness.
9. **Keep the first foundation live-only.** Do not add a generic offline replay, acknowledgement or durable event queue. Follow native Cordis Event semantics. Consumers needing stronger guarantees own their additional recovery requirements against an appropriate domain authority. A baseline query for current presentation is distinct from recovering every missed event; its concrete adapter remains to be designed.
10. **Required-role recovery is accepted; follow DSH conflicts.** The Human accepted the suggested first-party fallback and independent recovery entry and requested native DSH conflict handling. Native precedence/disposal and application render-failure recovery must not be conflated. See [the follow-up source investigation](2026-10-19-cordis-events-and-slot-conflicts.md).
11. **Reuse native Plugin/Bundle conventions.** Authored Panels are trusted native DSH Plugins, installed through native authorization. Do not add a Bot-specific sandbox, alternative package manager or extra installation permission layer. A display binding is not a code execution boundary.

These answers were recovered from the referenced chat after its continuation failed before updating this file. They replace the previous “awaiting answers” status; they are design direction, not implementation completion.

## Human answers to Q12–Q13

12. **Bot-bound Panels do not appear in Group Channels.** The Human rejected a group member picker. Inside Messages, a Bot-bound Panel follows the current PersonaBot DM; a Group Channel has neither that Panel nor its open action. Keep its DM preferences for returning later. This concerns Channel-workspace applicability; the already accepted explicitly bound Global-workspace instance remains independent of active Channel selection.
13. **First slice: independent companion Panel plus Activity.** The Human selected this ahead of Memory. The slice must exercise the public capability/event seam, Panel binding and instances, and native Plugin/Bundle lifecycle. The existing WindowCompanions implementation is an overlay, not an existing Dock Panel; reuse appropriate rendering and Activity capabilities without assuming the move is mechanical. Memory observation and other first-party Panels remain subsequent slices.

## Later Human-confirmed slice revisions

After Q13 and ticket publication, the Human selected VRM for T1, including mappings from Activity and actual Bot speech. T2 changed from a multi-Bot office to a Global Task Kanban with Human controls and Bot query/create/update tools. These decisions supersede the earlier existing-renderer-only proposal and office example. [T1 #2222](https://github.com/BotHarness/DeepSeekBot/issues/2222) and [T2 #2223](https://github.com/BotHarness/DeepSeekBot/issues/2223) carry acceptance criteria; ADR-0234 and the living architecture carry the design. Both remain unimplemented.

T2 reuses/evolves #1792's durable to-do owner rather than creating another store. Profile-wide shared Tasks have identity, title, description, status, latest progress and update time. Human edits and Bot tools share authorization, commands, conflict handling and post-commit notification. Task is separate from Session-local plans and Assignment execution; moving a card does not automatically launch work. Tools remain usable while the Panel is closed and have matching direct CLI paths. This initial board does not promise a full Linear/Notion clone or their external integrations.

## Current first-slice plan

Observable behavior: an independently installed native VRM companion Panel shows its bound PersonaBot, maps current Activity to movement, and presents actual committed Bot output through a separate speaking layer. Two explicitly bound Global-workspace instances can independently show two Bots; working and speaking may overlap.

- Use Three.js/three-vrm with a provenance-checked model and supplied clips/VRMA. Keep Activity facts unchanged; speaking is Client presentation, not another Activity state or Output authority.
- Drive initial mouth/expression/gesture playback from actual committed text and available expressions; degrade to neutral/text when assets fail. No historical speech replay on mount/reconnect, duplicate sound across instances, or new TTS/phoneme dependency.
- Include reduced motion, hidden-instance throttling, two-instance measurement and owned GPU disposal. A character editor, wardrobe, marketplace, world simulation and complete overlay migration remain outside this slice.
- Inside Messages, follow the active PersonaBot DM; hide both content and entry in a Group. Do not select a member Bot automatically and do not add a member picker.
- In the Global workspace, explicitly choose a Bot and show its identity in the Panel header. Switching the active conversation does not change that binding.
- Use the existing Activity authority for current-state reads and live changes. Mount/reconnect resynchronizes current state without replaying intermediate events. Define race-safe read/subscription ordering in the adapter.
- Native installation makes the Panel discoverable and presents either the correctly bound instance or a binding prompt. Explicit additional instances are allowed; reinstall does not create duplicates.
- Persist instance identity, binding and presentation preferences through the existing layout owner. Unavailable/deleted Bots produce an explicit unavailable state; never silently substitute another Bot.
- Disable/unload removes live contributions and owned subscriptions/render resources without stopping the Bot. Re-enable must not accumulate duplicate instances or listeners.
- Ship the matching direct CLI paths for any new Host API, public types and one buildable external example. Verify native install, Activity changes, two bindings, Group absence, reconnect and disposal on an isolated Host before claiming success.

This proposal narrows the already chosen slice. Exact public method names, payloads, persistence shape and native API wiring are engineering details to verify, not additional Human product decisions. The Human requested a documentation commit/PR followed by reviewed ticket decomposition; this does not start implementation. Later Memory and system-role replacement designs are not implementation prerequisites for it.

## First-slice source constraints

At the existing audit baseline, the current companion is registered in the native shell.overlay Slot (packages/client/src/client/index.ts:311). Its existing character renderer is PersonaBotAvatar (packages/client/src/client/avatar.tsx:344). This is a baseline implementation fact, not the selected renderer for T1: the later VRM decision supersedes the initial reuse-only proposal. Any reused presentation capability needs a public contract rather than imports from another feature Plugin's internals.

Current Activity reads and streams already exist (packages/core/src/bridge/methods.ts:2613, packages/core/src/bridge/rpc.ts:257). The followActivity implementation subscribes before yielding its baseline and then coalesces changes into current snapshots (packages/core/src/channels/live.ts:472). The Client currently disables its separate Activity subscription while the companion feed updates the shared store (packages/client/src/client/index.ts:694). The extracted capability must preserve one coherent data owner and work with or without the old overlay; moving a UI import alone does not establish independent lifetime.

The existing DockPanel contract exposes only global | channel, current-Channel props and a registration id (packages/client/src/client/dock-panels.ts:15). Independent implementation and instance identities, explicit binding and generic applicability need a real public contract. These are source constraints for the proposed slice, not runtime verification.

## Platform follow-up

The [native event and conflict investigation](2026-10-19-cordis-events-and-slot-conflicts.md) checks Cordis 4.0.5 and pinned DSH source. Cordis Event does not provide offline replay. Native Slots already provide priority-based selection and failure abdication inside their rendering boundary, so required-role replacement should reuse that capability with a registered first-party fallback. This does not imply automatic restoration of a previous Client module after a failed hot update. Source findings establish mechanism, not runtime verification. A live Host proof is required before claiming any replacement, external Bundle or event path works.

## Additional source facts for this frontier

- Bot-native file tools and Shell can write directly into Memory: `packages/core/src/runtime/dsh-bot-agent-adapter.ts:204` and `packages/core/src/plugin.ts:1124`. A notification attached only to a Memory Service mutation would miss allowed writes.
- The existing observation owner uses `scanChanges` in `packages/core/src/memory/accepted.ts:1015`. It compares a bounded Git worktree observation with checkpoints, not an OS write journal. Runtime startup (`bot-runtime.ts:7921`), turn preparation (`:4291`), steering (`:2085`) and completion reconciliation (`:4372`) are relevant triggers. No always-on Memory file watcher was found in the inspected production sources; this is not a runtime timing measurement.
- The observation recorder at `packages/core/src/runtime/bot-runtime.ts:7961` commits Source Event, Inbox Admission and Memory checkpoint together. Preserve this owner rather than creating a second admission authority for public notifications.
- Messages has a placeholder registration (`packages/client/src/client/workspace.tsx:104`), while `channel-dock.tsx:650` and `:679` select its dedicated implementation. Control Rail is supplied through Workspace context (`workspace.tsx:158`) and receives special layout constraints (`channel-dock.tsx:657`, `:1192`). Independent replacement is not already established by the ordinary Panel Registry.

Q4–Q13 are settled at the direction level. T1–T7 and the T8–T15 migration parent/children have been published under #2219 for v2.0 in Panel Plugins Project #21; implementation has not started. T1 runtime validation and Human feedback gate expansion, with migration explicitly blocked by T1. Native API details and implementation verification remain engineering work, not questions for the Human to research.

Questions about exact event payload fields, SDK signatures and implementation slices follow these decisions. No speculative public event names are introduced in this record. The four accepted product category names are recorded in the bilingual glossary; their registration representation remains open.

## Ticket consistency follow-through

The published set is T1–T7 under #2219 and T8–T15 under migration hub #2234. The earlier instruction to wait before publishing migration tickets is superseded; runtime validation and Human feedback still gate expansion. T2–T6 depend directly on T1, T7 on T6, and the migration hub and each migration child on T1. Migration does not wait for T7 or its coordinating parent to finish. ADR-0234 also makes explicit that Sessions retains ADR-0220's existing member-Bot scope filter, Global Group-bound Members remains independent of active DM selection, and unloading a Panel Consumer differs from uninstalling its domain Provider. This is documentation maintenance, not authorization to implement.

## Documentation follow-through

The four resolved Panel category names have been added to `CONTEXT.md` and its Chinese counterpart, explicitly labelled as authoring target terminology. Existing runtime layout rules remain in force: ADR-0221 and the Channel workspace definition currently prohibit Channel subpanels from docking into the Global workspace. Q7 permits separately instantiated, explicitly bound content in the Global workspace; it does not silently change existing dragging behavior. Q10 accepts required-role recovery while preferring native conflict mechanisms. ADR-0234 now records the durable direction and both living architecture versions link its target result. This discussion does not supersede that ADR or claim delivery.
