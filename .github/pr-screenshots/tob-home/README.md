# Tob / Home T1 evidence

Issue: #2082. Base: `288238e51e9b9191b4c8b7f9076100cf273bba19`.

These are real isolated DSH rc.2 Web / macOS Desktop captures, not mockups. The Web pair uses Chinese, dark mode, 1440 × 900: the baseline opens the ordinary DeepSeek Bot welcome, while a fresh Client layout in the candidate opens Home. The candidate contains synthetic Tob QA history. Native images use Retina rendering: 1280 × 820 or 1024 × 700 logical pixels. Native renderer captures leave the titlebar inset visible but do not capture macOS traffic-light controls themselves.

The screenshot commit records the final source tree. The following CLI-only follow-up preserves offline pause/resume dispatch; it does not change captured UI or Host behavior.

## Verified

- Web: native model setup required/cancel/save/return with no automatic send; actual official-model reply; approve a global limit change and canonical read-back; denial and stale approval preserve the current setting.
- Web and macOS: Home uses `ChannelComposer`, the same component as Messages. A draft survives model-dialog cancellation; an uploaded synthetic attachment survives reload; Enter inserts a newline when configured and Shift+Enter submits exactly one Human message with the attachment.
- Web and macOS: v7 nested layout fixture migrates to v8 with original backup, hidden controls/order and per-Channel state retained. Home is opt-in on upgrade. Toggle size remains within 3 CSS pixels and sampled unrelated DOM contents stay mounted. Default Home shortcut and a custom binding operate; the custom binding survives reload.
- macOS: real model configuration, reply and approval/read-back; a subsequent native restart retains Tob identity, DM, a single welcome and the saved limit of 3. Home was inspected in light and dark modes at 1280 and 1024 widths. Main Desktop was restored after isolated candidate testing.
- Live CLI: `tob-home`, native default-model configuration, direct registered read tool; direct management write refuses without Human-DM provenance; archiving Tob returns `protected-bot`.
- Source checks: typecheck, lint, formatting, build and bilingual changelog validation. Full run: 6322 passed, 23 skipped, 2 failed; both failing files were corrected and rerun together with CLI coverage (142 passed). The two failures were a newly added test's incorrect Store field and offline pause/resume being caught by online dispatch. Earlier parallel-run timeouts, token-policy and inventory-hash failures were retained and separately rechecked.
- Owner tests cover singleton/restart/interrupted provisioning, revoked grants, protected delete/archive, invalid/stale/uncertain writes, accepted Human DM versus Group/ordinary Bot/fabricated Session, v1–v7 migration and malformed/future storage, native shortcut custom/disabled/conflict resolution and legacy Work migration.

## Limits and Human review

This is not blanket W1–W15 / M1–M6 qualification. Physical IME composition, titlebar dragging, native disabled/conflicting shortcut edits and Channel Alt+number/child-shortcut combinations remain Human checks. Actual lowering below an already-running Assignment burst and injected transport loss were not repeated live; existing scheduler tests and owner fault tests cover those boundaries. Group/IM/spoof refusal is not claimed as live external-IM qualification. Layout backup creation was verified; a full rollback rehearsal restoring a previous database generation was not performed. Desktop widths below the existing 961px workspace threshold retain the existing fallback and are outside these Home captures.

Provider quota exhaustion and an AX default-model override lock occurred during initial setup. Those attempts are not passes: model checks were rerun against the authorized official provider and native settings without a launch override. One candidate shutdown exceeded the short restore timeout; the exact process exited, main was restored, and later switching used a longer guarded wait.

## Review path

1. Enter Bot mode and open Home. Existing workspaces should not be replaced.
2. Configure a model if needed. Cancel once, then configure and type a draft or add an attachment.
3. Ask Tob to read the global Assignment concurrency limit. Continue in the same DM in Messages.
4. Request a different limit, inspect the global target/old/new/revision in the existing approval card, then approve or deny and read it back.
5. Reorder/resize Home, hide/show it, customize its shortcut, and restart. Check the previous Channel layout and draft.

Marketplace, complete analytics, moving Bot creation into Home and arbitrary cross-Bot management are later slices. No merge or release is implied by this evidence.
