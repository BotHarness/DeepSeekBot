# Android environment identity evidence

Physical POCO / Android 16; dark theme, default text size; Chinese UI.
Frozen app JavaScript source: bd62dad0bd3b48ed3eb8d2af18e2e7a40755174d.
Shared QA batch: windows-2795-r3, 2026-10-26 JST.
Images: 1220 x 2582 pixels, cropped by the QA owner to remove the top 130-pixel notification bar. Development Tools overlay remains visible. Synthetic QA names and messages only. Publication explicitly authorized in this task on 2026-10-26.

- chats.png: first-line Bot name, colored environment icon and environment name; second-line message preview.
- activity.png: green laboratory icon for B, blue/purple laptop for A. Editing B's appearance updated both lists without a reload and left A unchanged.

The QA owner verified All Chats and Activity taps opened B's actual DM, Back returned to the originating list, and only B unread cleared, with canonical source-specific message readback. First-pair automatic appearance assignment, colliding-ID history, iOS, large-text/light-theme/accessibility and background push were not verified in this batch.

These images document bd62dad0bd3b, not the later main integration. The device was subsequently restored to its preceding independent development APK without clearing app data; the captured build is not claimed to remain installed. The QA owner released all batch resources and retained the evidence offline.
