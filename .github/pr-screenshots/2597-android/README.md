# Android list-layout comparison — PARTIAL

Batch `windows-2596-layout-r2`, 2026-10-22 17:15:35–17:27:29 UTC.

- Baseline: `914bfa57ed04807dc3f94a1ed6a4e678da898591`.
- Runtime candidate: `b3c0f4236533226433b0e89102d707f25f955ca0`.
- PR successor `4d77e61c69b4678d206412e05687b7b67506ebb0` only removes two test comments. Its product/dependency bytes match this candidate; it was not separately run.
- Physical POCO 24069PC21G, Android 16/API 36, arm64-v8a, 1220 × 2712 physical pixels, density 480. Chinese UI, keyboard closed, no scrolling gestures during captures.
- SDK 58.0.17 / RN 0.88.0; compatible reused Debug APK SHA256 `DB841DD80BEE8606B18150804CC0788A13761F87477D8138B0C47E745BDC7DC1`, 116488768 bytes, development app ID. Strict native fingerprint `1d971f8f1e438ac99cb56339c9300cf53092be9f`.
- Baseline and candidate ran through separate sequential Metro processes from their exact frozen worktrees. One dedicated QA Host held the same four previously committed synthetic Bot messages. Canonical author, exact body hash and lengths were checked again; no model call, duplicate send or store injection.

## Completed layout results

All published images use default font scale 1.0 and dark theme. They are lossless crops of real screenshots, without rescaling or generated content. Status bar, unrelated notifications and development overlay are excluded. Long/prose crops are x0/y420/1000×2030; short/nested crops x0/y1700/1000×800. Crops do not establish full-screen geometry.

| Fixture | Baseline | Candidate | Result |
| --- | --- | --- | --- |
| 40-item ordered list, 12740 UTF-16 units | First visible item body 34px, one-character column | Last item body 726px, wrapped text and item 40 ending visible | Narrow-column regression corrected in sampled visible content |
| Three-item short list, 34 units | Same first Text node 7px, clipped glyphs | 294px, all three items visible | PASS |
| Nested list, 98 units | Same first Text node 7px, descendants not readable | 666px, all nested content visible | PASS |
| Plain long paragraph, 12350 units | Text node width 846px | Same message Text node width 846px | No observed width regression |

Widths are UI Automator Text-node bounds in physical pixels, not glyph-ink measurements or full un-clipped node heights. See `bounds.json`. The long-list and prose views automatically opened at different scroll positions: baseline near the beginning, candidate at the end. They are the same canonical messages, viewport, font and theme, but are **not** equal-offset or equal-item pixel comparisons. Short and nested comparisons use the same text and visible message position.

| Case | Before | After |
| --- | --- | --- |
| Long list | [long-before.png](long-before.png) | [long-after.png](long-after.png) |
| Short list | [short-before.png](short-before.png) | [short-after.png](short-after.png) |
| Nested list | [nested-before.png](nested-before.png) | [nested-after.png](nested-after.png) |
| Plain prose | [plain-before.png](plain-before.png) | [plain-after.png](plain-after.png) |

## Additional finding and limits

At font scale 1.3/light theme, the long list also expanded from a narrow column to a wrapping body (candidate last item Text width 704px). However, following font/theme activity recreation, Expo Router logged `Looks like you have configured linking in multiple places` at 17:23:35 UTC and displayed a development error toast. The private screenshot and app-only logcat preserve it; attribution is unresolved. This configuration is PARTIAL, not a clean matrix pass. Host observation exited 2 (incomplete browser observation); this does not erase the native error.

OEM maximum font, other widths, the full font/theme cross-product, TalkBack, iOS, history/Jump, streaming arrival/playback drain, FPS and Human visual acceptance are untested. These completed-message cases do not prove the historical playback backlog or performance problem is fixed. No product code was edited by the runner. Existing CI Expo Doctor dependency failure remains separate.

## Restoration

The previous blocked attempt required a Human reboot. Restore-only recovery succeeded at 17:14:46 UTC and was verified before this new window. After this comparison, the original self-contained Release development-ID APK was installed and pulled back again: SHA256 `3B6A93CCA306A6AD854E9476C4D50E95DDD04CECDC8AF743D5605ED94779C848`, 52736761 bytes. Eight recorded settings and the original USB reverse list match. The Human explicitly chose Allow for notifications; that grant was preserved and read back.

The sole QA phone pairing was removed through its menu. The Host confirmed its credential was already revoked; an additional explicit revoke returned `device-already-revoked`, then readback confirmed revocation. Own Metro/Host process trees and listeners were absent; lease and heavy resources released at `2026-10-22T17:27:29.9775527Z`. No uninstall, data clear, global ADB restart or production app changes occurred.

This evidence-only publication commit is not a new tested runtime input or a product merge.
