# Android settings: OCAT references and Material components

Date: 2026-10-17. Scope: issue #2072, Android settings components in the Expo SDK 58 app. This is implementation research, not runtime verification.

## What the supplied screenshots establish

The Human's six OCAT screenshots show a dark canvas, lighter rounded groups, accent-colored section headings, and rows with a strong title above quieter supporting text. Thin dividers stop inside each group. Navigation rows have trailing chevrons; compact choices put their current value beside a downward caret. Switches have visibly different checked and unchecked tracks/thumbs. A model chooser uses a rounded tonal surface, leading provider marks, and an accent-colored selected item with a check.

These are visual observations, not evidence of OCAT's source code, component library, exact dp measurements, gesture behavior, or accessibility. They do not establish an Android 17-only style. The references contain personal account content; do not copy or publish the attachments. Capture BotHarness's own isolated QA state for review evidence.

## Official component facts

**Theme.** Android's Material 3 implementation organizes appearance around color, typography, and shapes. It supports light/dark schemes and wallpaper-derived dynamic color. The official guide describes M3 Expressive as an expansion of Material 3 and associates it with Android 16 system styling; this is not a rule that applications must mimic a particular OS screenshot. [Android: Material Design 3 in Compose](https://developer.android.com/develop/ui/compose/designsystems/material3)

**Switch.** Expo's SDK 58 documentation recommends `@expo/ui ~58.0.20`. Its Android `Switch` takes `value`, `onCheckedChange`, `enabled`, and optional state-specific colors. Import it from `@expo/ui/jetpack-compose`. [Expo SDK 58: Switch](https://docs.expo.dev/versions/v58.0.0/sdk/ui/jetpack-compose/switch/)

This is a real Material 3 control: Expo's SDK 58 Kotlin implementation imports `androidx.compose.material3.Switch` and forwards its checked value, change callback, enabled state, modifiers, and `SwitchDefaults` colors. It is not a React Native drawing of a switch. The branch source is mutable; verify the installed package when implementing. [Expo SDK 58: SwitchView.kt](https://github.com/expo/expo/blob/sdk-58/packages/expo-ui/android/src/main/java/expo/modules/ui/SwitchView.kt)

**Host boundary.** Every Expo Compose component needs a `Host`. React Native styles apply to this wrapper. `matchContents` measures Compose content into the RN layout; never use it on a scrollable child's scroll axis without finite constraints. `colorScheme` can follow the device or force light/dark. The default palette follows wallpaper on Android 12+, otherwise the Material baseline; `seedColor` instead derives a palette from an application color. [Expo SDK 58: Host](https://docs.expo.dev/versions/v58.0.0/sdk/ui/jetpack-compose/host/)

**Rows.** Expo's native `ListItem` supports headline, supporting, overline, leading, and trailing slots. These slots are a useful semantic reference for the existing RN settings rows; adopting every row as Compose is a separate scope decision. [Expo SDK 58: ListItem](https://docs.expo.dev/versions/v58.0.0/sdk/ui/jetpack-compose/listitem/)

**Accessibility.** Android recommends at least 48dp interaction targets. Material controls provide minimum interactive sizing when actionable, but an enclosing layout must leave enough space to prevent neighboring targets overlapping. Android also describes moving a selection action to a parent with one semantic control rather than creating redundant actions. Native defaults still require checking in the actual app. [Android: Compose accessibility API defaults](https://developer.android.com/develop/ui/compose/accessibility/api-defaults)

## First slice recommendation

Keep the tested RN settings rows, list virtualization, nested page stack, and drawer gesture shell. Introduce the native Compose switch only at the trailing control boundary, using a content-sized or explicitly bounded `Host` with space for the full touch target. This is a project recommendation to constrain integration risk, not an Expo requirement. Do not add a second Compose scrolling container inside the existing drawer.

Define Android settings tokens for group shape, row inset/spacing, section-heading color, supporting text, divider, container, and switch states. Use the app's resolved light/dark appearance at the Host boundary so an explicit app theme cannot disagree with the device theme. Choose either a deliberately seeded native palette or explicit semantic switch colors; do not accidentally combine wallpaper colors in the switch with unrelated fixed RN colors.

Maintain one owner for value and persistence. Forward one native change to the existing setting action; derive `value` from the existing state. An RN row and its native switch must not both toggle from one tap. Keep a localized accessible name, checked state, and disabled state observable across the RN/Compose boundary. Decorative chevrons/dividers must not become separate focus stops.

The first physical-phone integration exposed an interop limitation: the nested Compose control rendered correctly but the Android XML tree omitted its checked role, while the old disabled RN Pressable row appeared as a disabled button. The adapter therefore renders non-actionable Android rows as plain Views and exposes one RN semantic switch around the native control, forwarding accessibility activation to the same existing owner. Its Compose child remains the real pointer/drag control and is hidden only from duplicate accessibility discovery. This is an observed integration workaround for this app/build, not a claim that every Expo Compose switch needs a wrapper. The native XML check changed from zero checkable switches to one labeled, checked switch with a 52×48dp target; manual TalkBack exploration is a separate acceptance step.

## Acceptance criteria

- Dark and light: groups separate visibly from the drawer canvas; title, supporting text, divider, selected state, and disabled state remain distinct. Header and drawer body continue to use their shared surface contract.
- Font scale 1.0, 1.3, and 2.0: supporting text wraps, row height grows, trailing controls stay reachable, and long Chinese/English labels do not collide with them. These are proposed QA cases, not evidence already collected.
- Touch and accessibility: tap and drag the switch, operate with TalkBack, verify its localized name and checked/disabled state, and confirm one action produces one state transition. Verify measured target bounds rather than relying on the drawn track size.
- Persistence and lifecycle: change an existing preference, leave/reopen settings, and cold launch. Confirm the same canonical value, no duplicate mutation, no snap-back, and no drawer-drag regression around the control.

## Selection dialogs: next slice

Android documents dialogs as an overlay for attention or input, including a list of selectable options. Use the existing nested settings page for substantial configuration, and evaluate a compact native selection dialog for short option lists. A tall message-directory panel is not automatically an alert dialog. [Android: Dialog](https://developer.android.com/develop/ui/compose/components/dialog)

Expo's `AlertDialog` maps title, text, icon, confirm, and dismiss slots to Compose, exposes color overrides, and provides `onDismissRequest`. It is a candidate for confirmations; richer choice content should be evaluated against `BasicAlertDialog` rather than forced into an alert's slots. [Expo SDK 58: AlertDialog](https://docs.expo.dev/versions/v58.0.0/sdk/ui/jetpack-compose/alertdialog/)

For that later slice, verify selected label plus check/radio semantics, original selection on reopen, Android Back/outside dismissal, restored focus, safe-area and keyboard behavior, large-font scrolling, and whether selection commits immediately or requires confirmation. Specify that behavior before changing an existing chooser. None of these dialog behaviors are proven by the OCAT screenshots.
