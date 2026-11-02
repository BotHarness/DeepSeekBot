# Connection UX evidence

Issue #2784. Images contain only synthetic preview data or this task's isolated Host.

- `before.png`: Expo Web base `4f0044dd1248`, 430 × 932, Chinese, dark. The former environment customization page is shown because connection details had no predecessor.
- `after.png`: Expo Web connection-details UI at `4d9146323694`, same viewport/locale/theme. Saved-address fixture is intentionally offline; unreachable labels are real client observations, not a successful network test. The native Appearance setter is unavailable in RN Web; the capture server applies the same optional-setter compatibility adapter to both exports. No app runtime branch or substitute UI is added.
- `desktop.png`: real isolated DSH Host, 1440 × 900, English, light. The Devices section shows independent connection preparation followed by pairing. Local access remains off.
- `connect.png`: the same Host and viewport, independent Connect settings. No account was signed in for this test.

The desktop baseline was not captured before its bundle was replaced, so these desktop images are after-only evidence. Reproduce the old view from base `4f0044dd1248`: Bot settings → Devices; the old Connect controls appear in that section. This gap remains visible in the draft PR.

Web layout evidence does not qualify Android/iOS controls, system text, real phone network handover, or physical-device performance. The native queue must verify LAN pair → learn Tailscale → leave Wi-Fi → return, preserving an in-flight upload and the approved device identity, plus copy/test/scan recovery at all required text sizes.
