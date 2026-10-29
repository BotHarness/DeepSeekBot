# Android native motion QA — #3146

Physical USB Android, 1220 × 2712, arm64-v8a, development application ID with bundled Release JS. Synthetic dedicated QA Host only; no messages sent or durable Host data changed in this run.

## Provenance

- Before captures: installed baseline794856ec489b (prior notification candidate; old profile-preview and bottom-filter behavior).
- Six-case Activity matrix:0e88d4f9553295555e5d9237dcd12392e5d1f2b5, font1.0/1.3/2.0 × light/dark. Each case: scroll to Reset, tap Reset, scrim close, hardware Back, open/close/repeated left swipe.
- Final installed runtime:45d380c022e47e7d8196825e7bdcda46033748ca; includes visible-page hit testing and hidden-scrim touch passthrough. Targeted final checks: chat row actually opens; real Profile held/reversed in one touch; Memory tab retained; SOUL.md child route opens and returns; visible real keyboard; group Profile left swipe and Back; actual filter selection/readback, retained choice, reset, two successive left swipes, maximum-text dark bottom action.
- al.png, ad.png, md.png, ap.png: final runtime45d380c022e4. ml.png: matrix runtime0e88d4f95532. bl.png, bd.png and bp.png: baseline.
- Status bars cropped. Dedicated test computer labels masked with solid blocks. ml/md are bottom crops; other images preserve the remaining full viewport. Originals retained in the primary checkout's ignored task evidence directory.

## Limits

This proves the listed interactions, not FPS or Human smoothness acceptance. iOS native regression, actual TalkBack output, predictive Back cancellation, reduced-motion, pair-DM and dirty-editor guards were not completed in this window. The drawer/gesture screenshots show different mid-drag distances; exact reproduction is to hold a partial left drag then reverse without lifting.

## Regressions found and fixed during QA

- Modern Android hardware Back initially skipped the inline Profile.
- Activity panel under the navigation bar and extra bottom spacer were replaced with a root modal side sheet.
- An unmeasured hidden scrim initially did not render; a measured hidden scrim then intercepted RN clicks. Hidden leaf is now disabled for RN hit testing.
- Disabled Compose pager internals reported stale horizontal semantics after the first gesture. Hit testing now respects the public pager and visible actual page views.

Refs #3146. Agent task:codex/local/01a17bef-21c0-75f0-bf5d-2fedb6df7b73.

## Earlier bottom-sheet surface slice — PR #3149

Physical Android, arm64 development-ID Release. Baseline main ef5d00ff5e89; candidate runtime 2feb357bc059. Native screenshots cropped only: system status, accounts, usage, Host identity and conversation content are excluded. b/a are before/after Activity filter, l/d light/dark. s-* show only the Settings top region; the extra title is removed, while Close and child headers remain. No generated product pixels.

All five Profile buttons matched exactly after tap versus pager swipe (31,680 pixels per button); Human also reported no current shape problem. Real-scene Profile dragging and Activity side-sheet migration remain outside this slice, tracked in #3146.
