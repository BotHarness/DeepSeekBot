# Cross-site remote Host regression

Real Chromium on macOS,1440 ×1000,Chinese,dark theme,the same paired browser and isolated Host Profile with the same Release QA Remote Bot.

- Before: main31f313fcdaf0d1758e3dd02285e6ba15a91bf884 gateway; HTTP403 and unreachable Remote Host.
- After: same base plus the four excluded Fetch Metadata headers in this PR; HTTP200, remote Bot visible, no browser console issues during reload.
- Both directions of the pairing fingerprint were independently checked before exact device-key approval.
- Before capture masks only the computer name with a black rectangle. After has no visible computer name and needs no mask. No UI state was fabricated. Raw local snapshots and request-status records remain in the release preflight evidence folder.
- This proves remote-list admission/rendering. It is not a real-model DM, iOS/Android result, production Connect result,or final release acceptance.
