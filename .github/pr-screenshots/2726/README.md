# PR #2726 — physical Android menu evidence

Captured on 2026-10-24 in a separately owned Android QA batch. These are actual Compose menu and Settings screenshots from a physical Android API 36 phone, cropped from 1220 × 2712 captures. They are not Web previews.

- Installed code: `db4ee44f039522f60c0cc888c616c3c0cfdc4eca`, based on fetched main `6e87297f8`; this is the unmerged PR candidate.
- Fresh CNG arm64 Release, bundled JavaScript, no Metro. Expo `58.0.19`.
- Installed APK was pulled back and matched SHA-256 `56a01dcf6da438973a0c036d7c2aa869f2a07cf9a3b61dfca93b7ff38a05e249`.
- Embedded-JS SHA-256 `df946a4860783c212254409be339850d5d331b6f55e362b9db8f3e6068238e91` differs from the frozen-main before build.
- Strict post-CNG Android fingerprint: `da00bd93b5007e490109db5731ae9f4903a85dc6` (251 inputs); native inputs unchanged.

## Native results

Chinese locale: all six combinations passed actual selection, reopening, one checked option, Android Back cancellation without changing the value, and reachability of all three options. Inspected screenshots show semantic leading icons, one trailing selected check, blue selection, and readable labels without overlap.

| System font scale  | Theme | Settings            | Language menu       | Appearance menu     |
| ------------------ | ----- | ------------------- | ------------------- | ------------------- |
| 1.0 default        | Light | [image](s-10-l.png) | [image](l-10-l.png) | [image](a-10-l.png) |
| 1.0 default        | Dark  | [image](s-10-d.png) | [image](l-10-d.png) | [image](a-10-d.png) |
| 1.3 intermediate   | Light | [image](s-13-l.png) | [image](l-13-l.png) | [image](a-13-l.png) |
| 1.3 intermediate   | Dark  | [image](s-13-d.png) | [image](l-13-d.png) | [image](a-13-d.png) |
| 2.0 device maximum | Light | [image](s-20-l.png) | [image](l-20-l.png) | [image](a-20-l.png) |
| 2.0 device maximum | Dark  | [image](s-20-d.png) | [image](l-20-d.png) | [image](a-20-d.png) |

English at maximum 2.0 text / dark also passed actual selection and reopening: [Language](l-en20-d.png), [Appearance](a-en20-d.png), and selected [Follow system](a-en20-system.png). The longer selected label remains fully readable with its leading icon and trailing check.

## Boundaries and privacy

Menu crops include only the native popup; Settings crops begin at the language row. Notification/status/navigation areas, connection details, computer/device names, identifiers and private content are excluded. Raw PNG/XML stay private. Inspection contact sheets are local only; the published files are individual native captures.

Frozen-main before evidence and chat/restart results remain separate in [issue #2714](https://github.com/BotHarness/DeepSeekBot/issues/2714#issuecomment-6381458682). This visual follow-up does not requalify native caret retention, TalkBack, system-locale foregrounding, separate system-bar contrast or iOS. iOS is explicitly deferred by the Human; #2714 remains open.
