# Development reload status-bar recheck — 2026-10-16

Current PR source is unchanged: `a24cc09457a6c156656f273c71a4c26390240c40`, checked at evidence head `499824126583c9773d6915a31990c02d08774235`; local QA equivalent `4cd840a1b`.

## Result and correction

The current source did not reproduce the previously reported dark status bar after full development reload. The earlier failure screenshot was captured at intermediate source `5df379d27`, before the native Activity appearance callback in `f6aad393d2777cdc3979700733e63c9d9aa24ef8` and later search-toolbar changes. Previous reports carried that failure forward without requalifying this exact source. Their reload limitation is superseded by this bounded current-source verification; they remain historical records.

No new application patch was made in this follow-up. A temporary QA-only removal of the Activity appearance callback also passed, so this check does not isolate one callback as the cause or prove that it alone fixes all reload races. The exact tracked file was restored and the final checks below ran with an empty source diff.

## Native checks

Same reserved iOS 26 Simulator and compatible installed Batch 6 binary `0.0.1 (1)` from `1f0531dba1f4ea9536b55bd1d9dbe84bc2a420e8`; portrait 402 × 874, English, default text size. A new task-owned empty authenticated Host was used. No request was approved or answered.

- PASS: dark Activity, full `DevSettings.reload` from a fixed Activity launch URI.
- PASS: developer overlay menu → Reload.
- PASS: full reload while search and keyboard were open.
- PASS: full reload while Filter and sort was open.
- PASS: the earlier exact sequence, `agent-device metro reload --metro-port 8091`, then Simulator open URL `deepseekbot://activity`.
- PASS: repeated full Metro reload after restoring the unmodified source.
- PASS: light appearance and full Metro reload; dark status text remains readable on the light surface.
- PASS: change back to dark, relaunch the app, open Activity, then full Metro reload; white status text/icons remain readable.

The native screenshots were inspected. A local pixel assertion counted bright clock pixels in the original unedited PNG region x=50…94, y=23…40 (RGB channels above 180; minimum 20). It rejects the historical failure with 0 and accepts the final dark repeat with 131. This is a screenshot regression signal for this viewport, not a general contrast/accessibility certification. Read-only runtime inspection also found dark scheme with `light-content`, and light scheme with `dark-content`. No runtime style override was injected.

## Evidence

- `historical-dark-failure.png`: actual earlier failure at `5df379d27`, seeded task Host.
- `after-reload-dark.png`: final current-source dark reload, fresh empty task Host.
- `after-reload-light.png`: current-source light reload, same fresh empty Host.

All are unedited native captures. The historical and current images share viewport, locale and text size but NOT list data or time; compare status-bar ink only. This is an explicitly historical/current comparison, not a matched-data A/B or a newly implemented fix. No historical light reload failure was captured, so the light image is a regression check, not an invented before/after pair. The gear is the development-client overlay.

## Boundaries and cleanup

An initial reload replayed an already consumed pairing link; it was excluded from Activity evidence. Subsequent checks used the fixed Activity URI. No new source tests were needed or run for this evidence-only change; earlier source test results retain their original source attribution. Current-head CI is not claimed passed.

Android, physical devices, accessibility, larger text, landscape, full request lifecycle and latest-main native integration remain unqualified. Reused compatible binary; no native rebuild or global configuration change. No merge, release or deployment.

Task pairing removed; temporary Host and Metro stopped; the task device-control session closed. Original shared Host and seven pending approvals remained, confirmed in the native Computers drawer. Simulator returned to light appearance. Unrelated QA files were preserved. Disk remains below the native rebuild floor; next runner must check free space and claim the device lane.
