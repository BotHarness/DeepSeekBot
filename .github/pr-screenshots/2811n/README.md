# Mobile feedback layout revision

Source: 17292e7f3876f84f5d9b6c21a79ae03286b05e76, 2026-10-26 Asia/Tokyo.

All images are **Expo Web layout previews**, 390 × 844 CSS pixels, 2× scale, default browser text scale. The opt-in BOTHARNESS_MOBILE_WEB_PREVIEW adapters are unchanged. The app connected to the same isolated Host and synthetic fixture as the preceding captures. Only synthetic feedback was sent to existing PostHog.

- en.png: English/light, separate rating and local diagnostic groups; file list collapsed.
- zh-dark.png: Chinese/dark, same grouping and concise copy.
- ok.png: English/light success receipt, local download remains in its own group.

Before layout revision: ../2811l/mobile.png and ../2811l/mobile-ok.png at cfac35d7161626074be62cb9523d0105f2ea7518.

Native iOS uses SwiftUI action buttons, segmented Picker and button-style Toggle tags. Android uses Compose Material buttons, ToggleButton group, FilterChips and existing Expressive grouped surfaces. These mappings are source/typechecked, not native rendering evidence. Physical iPhone/Android, keyboard, screen reader, light/dark and default/intermediate/maximum system text checks remain pending under #2811; no native lane was reserved for this Expo Web run.
