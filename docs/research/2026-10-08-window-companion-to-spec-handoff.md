# Window Companion specification handoff

Date: 2026-10-08. Status: complete design synthesis; runtime implementation is not delivered.

The Human confirmed the complete Q1–Q23 design and the default shared-Channel visibility, then clarified that the pixel companion surface omits its Avatar background to reveal a transparent bust silhouette; then authorized this documentation commit/PR and to-spec publication. The canonical implementation specification is [#1135](https://github.com/BotHarness/BotHarness/issues/1135), labelled ready-for-agent. [#1132](https://github.com/BotHarness/BotHarness/issues/1132) tracks this documentation handoff only. No follow-on implementation claim, milestone or Project was inferred.

## Authorities

- [Bilingual product glossary](../../GLOSSARY.md): Window Companion and Companion Visibility.
- [ADR-0144](../adr/0144-window-companions-consume-owned-activity-and-scoped-output.md): local presentation and qualified owned-output consumption; [ADR-0049](../adr/0049-personabot-activity-is-a-projection-with-live-events.md) and [ADR-0118](../adr/0118-editable-avatar-appearance-is-independent-of-activity.md) retain Activity and appearance authority.
- [Living architecture](../architecture/botharness-architecture.en.md#53--window-companions-accepted-design-not-yet-implemented) and its Chinese counterpart integrate the target boundaries.
- [Source-backed research and interview](2026-10-08-coopanion-pixel-desktop-pet.md) distinguish the initial desktop-pet investigation from the accepted in-window goal.
- [Reviewed static HTML](evidence/coopanion-animation/window-companion-design.html) shows the design; it is not production interaction or performance evidence.

## Test seam and tracer bullets

The confirmed review path is Human pin → owning identity/Activity and committed Channel data → authenticated Host-to-Client consumption → movable Avatar with anchored cards → cross-page, restart and bounded reconnect behavior. Use existing public integration seams; no test-only data source or duplicate durable feed is required.

| Stage                      | Observable path                                                                                                                                           | Verification and existing prior art                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First working slice        | One real pixel Bot selected, Activity/DM, bottom roaming/drag, cards, existing independent attention and local preference recovery across pages           | Registry, PersonaBot-output, Channel query/live, Activity live, Avatar and public Client interaction tests; isolated verified official DSH with a real DM and Tool run; Human feedback |
| Extend confirmed scope     | Both selection entries, multiple companions, group playback and all three scopes including Bot–Bot DM, bounded recovery, archive/delete and accessibility | Visibility × playback matrix at owning read boundary; baseline-race/dedupe/generation and bounded-read tests; stable hover/focus reading and lifecycle evidence                        |
| Compatible mouth extension | Closed/half-open/open text-paced mouth for a supported BotPixel rig after the first path feels right                                                      | Saved appearance/fallback/anchor compatibility, text reveal pacing and real rendered motion; no TTS or phoneme claim                                                                   |

Scope changes apply the same future-only rule as newly enabled sources. The broadest scope observes selected Bot outputs through an explicit trusted Human read contract; original Channel navigation and model permissions retain their owning checks. A backend-only feed or disconnected static prototype is preparatory work, not a completed tracer bullet.

## Baseline and remaining validation

The original research fixed BotHarness at 29dbcd0bd6b756606b8c9b77b7566742077eeac9. Documentation was prepared from refreshed main 4a2fc156715d2d37ee48daf02c7d39cae5adf039, where Activity query/output notification and single-Channel feed limits were rechecked. The implementation must verify the actual authenticated cross-Channel output contract, owner-bounded reads/cursor/baseline race, mode-independent Slot lifecycle, Client/Profile storage key, Avatar anchors and measured resource budgets against its current revision and running Host. These validation details do not reopen the accepted product choices or narrow the overall spec.

Coopanion is a design precedent: its current AGPL code and excluded Whale artwork are distinct from the MIT predecessor. Current pixel Avatar resources and saved recipes stay ours; the reference checkouts remain ignored and are not dependencies. No independent window, installer/fork release or full-body asset program is required.
