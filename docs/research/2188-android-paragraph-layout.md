# Android paragraph bounds during parent relayout

Issue [#2188](https://github.com/BotHarness/DeepSeekBot/issues/2188) originally appeared after sequential font/theme changes. The minimized phone reproduction cold-opens the same committed paragraph, 19,221 UTF-16 code units, without changing either setting. The canonical message remains complete while the bubble is blank.

## Observed boundary

The original Arena control failed two of three cold opens; its parser-reuse arm passed all three. A standalone pre-reuse main Release also reproduced the failure. These are small reproduction samples, not evidence that parser reuse repairs native layout.

Package-scoped Android view snapshots distinguish the states:

```text
Blank:   StreamRevealView 835 × 69420 → TextView 0 × 0
Visible: StreamRevealView 835 × 69420 → TextView 835 × 69420
```

`StreamRevealView` extends the SDK 58 `ExpoView`, which inherits Android `LinearLayout`. Its inherited parent layout can replace externally assigned child bounds with the child's still-zero measured size. React Native owns those child bounds. Its own [ReactViewGroup implementation](https://github.com/react/react-native/blob/v0.88.0/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/view/ReactViewGroup.kt) leaves child layout to UIManager.

The container must preserve both React Native passes: `onMeasure` accepts its own Yoga size without remeasuring children, and `onLayout` leaves their assigned bounds intact. An onLayout-only candidate was rejected on the phone: the child regained its bounds but inherited measurement left its text wrapped into a narrow vertical column. An accessibility final-marker check alone missed that visual failure.

The fix does not assign replacement child sizes, reparse messages, flush playback, or add layout work on animation frames.

## Regression seam

`StreamRevealViewTest` instantiates the actual container and a native `TextView`. One regression assigns the child bounds as React Native does, then lays out and relays out the parent. Before the fix, the first parent layout changes `Rect(13,17–848,69437)` to `Rect(0,0–0,0)`. Another measures the text independently and checks that measuring the parent cannot measure it again or replace its native text-layout width. The existing Unicode, span budget, reduced-motion and cleanup tests remain unchanged.

This regression checks the Android parent/child layout boundary. It does not simulate Fabric scheduling, hardware drawing, text selection or TalkBack.

## Separate tail-only observation

[#2190](https://github.com/BotHarness/DeepSeekBot/issues/2190) remains distinct: its original rich-Markdown reply was complete in the Host but its final paragraph was absent until a cold reopen. Four new rich replies on the previously installed normal build displayed the final marker; three had an automated independent canonical reread of exactly 4,504 characters. The first run's early UI Automator idle failure is a capture failure, not a message failure. No failing tail-only native tree was captured, so this change does not claim its cause or close that issue.

## Accepted native checks

On a physical Android 16 phone, Expo SDK 58 / React Native 0.88, the final minified arm64 Release passed all 12 cold-open checks: font scales 1, 1.3 and 2, light and dark, in two existing fixture DMs. Each preserved nonzero native text bounds, the final accessibility marker and ordinary multiline wrapping in the actual screenshot. The unminified Release independently passed the same 12-case matrix.

For the controlled native comparison, the failing standalone baseline and revised native container use the identical baseline Hermes bundle. Nine fixed-font dark cold opens passed with the revised container. The primary before/after crops use the same DM, text, font, theme and bundle; the base is intermittently blank, rather than failing every launch. Additional default/intermediate/maximum light/dark pairs show the normal installed build and final Release on the same fixture.

Two fresh plain streams in the final minified Release completed with visible final markers and independently read canonical bodies of exactly 19,221 UTF-16 code units. One fresh mixed-Markdown stream completed with its 40-row table and final paragraph, independently read as 4,504 code units; three further mixed replies passed in the unminified Release. Each final minified case has exactly one user message and one Bot reply. None required reopening to expose the suffix; this does not reproduce or resolve the original #2190 failure.

A fixed body-region pixel check rejects both the blank screenshot and the rejected vertical-column candidate; it accepts all 12 final matrix screenshots and nine dark controlled screenshots. This check is specific to the plain-text fixture and supplements visual inspection, not a general rendering oracle.

All 11 native module tests pass, including both regressions. The mobile suite reports 726 passed and eight skipped; its exit code was zero, with a worker-termination timeout warning after the summary. Typecheck, lint, formatting, changelog and feature-map checks pass. The [sanitized evidence manifest](../../.github/pr-screenshots/2188-stream-child-layout/evidence.json) records APK and source provenance. CI remains a separate PR check.

The retained paired QA Host is DSH 0.2.0-rc.2; source dependencies are 0.2.1-rc.2. Deterministic local tool replay supplies test content without a live LLM. The private QA binary permits only the existing loopback test route; that configuration is absent from committed app configuration.

A fresh Android build is required; JavaScript reload or OTA alone cannot apply this fix. No new FPS, scrolling, iOS, selection or TalkBack qualification follows from it. Computer-injected phone touch is refused by the OS, so these checks do not substitute for real gesture acceptance.
