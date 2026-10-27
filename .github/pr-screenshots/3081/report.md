# Android selection event startup proof

Task: codex/local/01a17bef-21c0-75f0-bf5d-2fedb6df7b73; issue #3081.

The same physical Android 16 phone failed to mount its first native Host with `Event cannot be both direct and bubbling: topSelect` before this fix. RN 0.88 registers `onSelect` as a bubbling base-view event; both application-owned Compose modules had reused it as a direct event.

The fix names the two direct events `onTabSelect` and `onButtonSelect` and migrates only their native adapters. Application callbacks remain unchanged. Both Kotlin modules compile in a fresh SDK 58 arm64 Debug binary. With that binary the app opens the chat list and the existing Bot creation flow. The included images show the actual startup error and the subsequently reachable creation page; status bars were cropped. The development tools button in the second image is development-client UI.

Frozen integration baseline: a1df8448e537c143eb45c9677a8639e08d4441da (main 6a3293cce08344b9344edc3cf534e2e4778bdcf1 plus unchanged performance PR #3050). Corrected integration source: 94797941062a5c956e158eabd79b7c8c6f7d0f51. Both exclude avatar changes and tag PR #3030. Debug build completed 919 tasks. The corrected binary adds only this event fix relative to the frozen baseline; its source includes the necessary internal-callback correction. Nine existing native-tab adapter tests pass after migrating the mock event. Android native selection interactions will be added with the final avatar journey. No iOS behavior changes or iOS verification are claimed.
