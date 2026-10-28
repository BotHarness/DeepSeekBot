# Chats retained swipe — physical Android

Before: bundled development-ID arm64 APK from 45d380c022e47e7d8196825e7bdcda46033748ca.
After: bundled development-ID arm64 Release build from 709341fd6e4e64127a2668758867c5e117acb116; subsequent commits only adjust tests/typecheck ownership and evidence.

Same USB phone, 1220 × 2712 native pixels, Chinese, default system font, dedicated synthetic QA data. The before/after light pair uses the same continuous DOWN/MOVE/hold/reverse gesture. The native build also updates the base Expo native dependencies, so this is a behavioral comparison, not a pixel/color-difference benchmark.

Raw captures remain private. Published images crop the top 316 pixels (status icons and Host search title), then resize to 610 px width. Synthetic Bot names and fixture messages remain visible. No generative edits.

- before.png: synthetic preview below the FAB and bottom navigation.
- after.png: real cached messages and composer above the background navigation/FAB, held part-way.
- dark.png: same retained drag in dark appearance.

Verified on-device: held drag and reversal; full open; recent group selected while swiping from a different Bot row; one Back returns to Chats; regular row tap after cancellation; composer keyboard; nested Profile → memory file → Back → Profile → Back → chat → Back → Chats; default/1.3/2.0 font entry (reopen after Android activity recreation). Appearance restored.

The row-drag regression failed on the earlier build and passed after native gesture start/end handoff cancelled the underlying RN press. First-chat fallback and empty-list behavior are covered automatically without deleting the Human's recents/data.

Not qualified: numerical FPS, Human smoothness acceptance, iOS physical behavior, Cloud retained dragging, TalkBack and predictive-Back visual acceptance. Search-result horizontal dragging selected the result in the native search surface; search exclusion needs separate investigation and is not counted as a passed device check. No Web capture: this native SideSheetBehavior presentation has no equivalent Web path.
