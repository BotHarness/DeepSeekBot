---
Status: Accepted
Date: 2026-10-08
---

# Window Companions consume owned activity and scoped Bot output

Human confirmed Q1–Q23: a Window Companion keeps a selected PersonaBot's existing half-body Avatar inside the official DSH main window across pages, with bounded bottom motion, drag and anchored pixel message cards. It is an application-defined Binding, independent of Channel pinning and the active conversation. This records the accepted target; the design/specification PR does not deliver runtime behavior.

## Ownership and visibility

Reuse the PersonaBot Registry for identity/appearance, ADR-0049's shared Activity Projection for execution and independent Human attention, and canonical Channel messages for committed output. DSH SessionEvents remain execution authority. Rendered poses, positions, typing and card expiry belong to the Client; they do not change saved appearance, read position, attention or execution. Other Plugins query the same Activity Service and synchronize through its Cordis notification, rather than consume companion UI state.

Selection, per-Bot Activity/DM/group playback switches, walking preference and Companion Visibility are local to the current Client × DSH Profile. Global collapsed-layer and retained-card settings apply to its companions. They are not PersonaBot Memory or cross-client configuration. The default switches are Activity on, DM on and groups off; default visibility is Channels where the Human and selected Bot are both members. The other choices are their own DM only or all Channels the selected Bot has joined. Bot–Bot DM belongs to the DM switch; only the selected Bot's authored, committed output is shown.

The broadest choice intentionally includes Bot–Bot DM and groups without the Human. Implement it as a Host-owned, read-only observation contract for a trusted Human Consumer, bounded to the selected Bot's outputs and current scope. It does not widen general Channel timeline permissions, expose other authors' complete history, change membership, or grant model read/send authority. Source Channel navigation still checks its original owner and explains unavailable context. An existing Channel list or process-local output notification is not that authenticated durable feed.

First selection and Client/Host restart establish a Host-consistent future-message baseline without replaying earlier output. Current Activity is queried directly. Short disconnect/background recovery reads only a bounded, deduplicated set of unplayed enabled-source output after that baseline. Disable clears that source's cards and pending work; re-enable or newly eligible scope starts from the current baseline. A transient Cordis notification is a synchronization signal, not durable replay authority; exact cursor/query/transport mechanics remain implementation validation.

## Presentation and lifecycle

Supported pixel companions omit the Avatar tile/backplate and square frame background so the bust has a transparent character silhouette. This is a rendering-surface choice: preserve the saved recipe and ordinary roster Avatar presentation. Keep independent attention labels/badges and a usable transparent hit area. Static-image or missing-rig snapshots preserve their supplied alpha/appearance; this decision does not promise automatic raster cutout.

Deepen an independent Client companion owner around preferences, qualified consumption, generation/baseline reconciliation, card capacity and disposal, while composing the existing Avatar module. Use the verified official RC shell overlay Slot; current Bot-mode-gated Activity consumption must become available to the independent companion consumer. Do not infer a new desktop-window interface or rewrite the shared Avatar appearance protocol.

Each Bot has its own stack, defaults to 3 collapsed layers and at most 20 unexpired retained cards, and types committed messages concurrently. Hover/focus expands a stable list, stops roaming and expiry, continues visible typing and counts new arrivals without displacing current cards. Human attention remains independent of playback and opens its owning surface. No automatic +N companion fold or selection cap is imposed; Humans drag, pause walking or remove companions, with basic bounds and bubble avoidance.

Archive retains a static companion and archived label; deletion removes selection. Motion pause never pauses execution. Existing reduced-motion, freshness, fallback and cleanup semantics apply; static uploaded images keep their appearance and do not acquire unsupported face rigging. First validate the current pixel bust in a real Host→Client Activity/DM slice and get Human feedback, then expand the confirmed multiple-Bot/group/scope/recovery behavior. Closed/half-open/open text-paced BotPixel mouths follow as a separate compatible extension.

## Considered options

- Independent desktop windows require a maintained DSH fork and its installer/signing/update compatibility; the official-window overlay satisfies the confirmed initial goal without that distribution commitment.
- Reusing Channel pins or canonical PersonaBot configuration for companion choices couples local presentation to conversation organization or other clients. Independent Client/Profile preferences preserve their separate meaning.
- Making every companion a state aggregator or output store duplicates existing authority and loses consistent Plugin consumption and restart behavior. Consume owning projections/messages instead.
- Reusing general Human timeline reads alone cannot fulfill the third visibility choice; deleting membership checks would expand unrelated access. A narrowly qualified Bot-output observation path preserves the explicit product choice and existing owners.
- Coopanion's single FIFO bubble does not meet the confirmed concurrent stacked reading interaction. Implement the Sonner-inspired pattern with our own pixel presentation; current Coopanion AGPL code and excluded Whale artwork are not presumed MIT.

## Evidence

- [Accepted research and Q1–Q23](../research/2026-10-08-coopanion-pixel-desktop-pet.md)
- [Reviewed static HTML](../research/evidence/coopanion-animation/window-companion-design.html)
- [Documentation handoff #1132](https://github.com/BotHarness/BotHarness/issues/1132)
- [Implementation specification #1135](https://github.com/BotHarness/BotHarness/issues/1135)
- [ADR-0049: shared Activity Projection](../decisions/release.md#adr-0049)
- [ADR-0118: appearance vs presentation](0118-editable-avatar-appearance-is-independent-of-activity.md)
