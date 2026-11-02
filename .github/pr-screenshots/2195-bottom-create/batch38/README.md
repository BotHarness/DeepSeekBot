# Batch 38 — layout regression, UAT only

Shared Simulator queue lease, 2026-10-19. Before: `edf7c31f827b8e8f4df7670887e54749829dd47c`; after: `917b6e3d298e537bda174b950fa3deab10b7f23d`. Installed native baseline `494a20f1e`, Expo UI 58.0.20. 402 × 874 points / 1206 × 2622 pixels, English. Same existing Computer channels and app-local long Computer alias on both revisions. Cloud signed out. This evidence predates the subsequent theme-material repair.

## Observed

- Default light before/after: bounded single-line source tab, trailing ellipsis and retained Computer icon; grid replaced by left-aligned icon/text rows.
- Maximum light before/after: native nav labels no longer elide; Chats wraps within the word at the largest system size. Plus/close retains a separate fixed circle while the navigation island grows. Source tab stays single-line. Menu wraps labels and retains all actions/close.
- Actual native Chats/Activity and plus/close taps; All → New Channel → target chooser → Back → Close. Maximum dark chooser Back also exercised. No create action submitted.
- Intermediate light/dark captures were made locally; full interaction matrix was stopped on the theme failure below. No full-matrix pass claim.
- `native-menu.mp4`: final 53 seconds of the continuous native recording (idle lead-in removed), showing the list and target chooser/cancel flow.

## Failure retained

`after-max-dark-nav-confirmed.png` shows a real light→dark transition defect: the backdrop remains bright and the inactive Activity label has poor contrast. `after-intermediate-dark-restart-nav.png` shows correct dark material after restarting. Restart is diagnostic evidence, not a fix or a passing live-theme-transition result. Subsequent code repair and fresh CI/queue verification are required.

Driver refusals after transitions (unsettled refs and occasional 3-node AX) were retained privately. Fresh snapshots / one grounded Close tap recovered; no fake callbacks substituted. Native AX still exposes nested button nodes; VoiceOver announcements are unqualified.

## Restoration and limits

Only one new device pairing to this task's UAT Host; exact new device revoked. Original channels/device statuses preserved. Original app Cloud/Hosts and stopped Documents/Preferences restored byte-identically. Original light/large and Reduce Transparency false restored/unchanged. Driver/Metro closed; shared checkout and its original three untracked docs restored; lane released. No native build/install, Cloud login, WorkOS session, channel/Bot/message creation, model, phone, Prod or merge action.

Reduce Transparency toggle, Android, physical phone, VoiceOver, non-English rendering and Human acceptance are not passed by this run. Earlier authenticated Cloud/create-open evidence remains tied to Batch 36's source, not this run.
