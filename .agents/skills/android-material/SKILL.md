---
name: android-material
description: Material 3 rules for the mobile app's Android surfaces, mapped to our Expo stack. Use when choosing or reviewing an Android control (menu, exposed dropdown, dialog, bottom sheet, top app bar, navigation bar, FAB, chips, segmented buttons), handling edge-to-edge insets or predictive back, or aligning an Android screen with Material 3.
---

# Material 3 for the mobile app

Material 3 (with its Expressive update) decides **which** control an Android surface uses and how it behaves; `apps/mobile/DESIGN.md` records what this app already decided; `expo-ui`, `expo-router` and `expo-native-ui` say how to build it. This skill is the bridge, the Android twin of `ios-hig`. For spec detail (tokens, colour roles, type scale, shape, motion, per-component anatomy) load the installed `material-3` skill; its examples are Compose and web, so translate them through the mapping below.

**Precedence.** The platform's native design and components are the standard (`DESIGN.md` → Native first). A decision written in `DESIGN.md` (or an ADR it cites) wins over this skill; where an older rule there prescribes a custom surface that Material covers natively (the OCAT-inspired choice menus, for example), it describes current implementation, and the change that touches the screen moves it to the Material component and updates the rule. Never carry an iOS look (glass, iOS-style switches, back chevrons, large titles) to Android.

## Steps

1. **Pick the component** from the [decision table](#decision-table). Done when every interactive element maps to one Material component.
2. **Build it native first:** `@expo/ui/jetpack-compose` views inside a `Host` (the app already uses its Material 3 `Switch` in `src/ui/primitives/toggle.android.tsx`), then Expo Router presentation, then our primitives. Check exact component names in the SDK 58 docs (`https://docs.expo.dev/versions/v58.0.0/sdk/ui/jetpack-compose/`). Done when no React Native view imitates a control Compose provides.
3. **Apply the Android system rules** in [System behaviour](#system-behaviour). Done when insets, Back and text scaling are handled.
4. **Review** with the [checklist](#review-checklist) and capture light and dark screenshots on Android for the PR.

## Decision table

| The user needs to…                                            | Use                                                                 | Not                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| run one of several commands from a ⋯ button or a long press   | **menu** (dropdown menu anchored to the trigger)                    | a dialog or panel of tonal buttons                    |
| pick one value from a short set, shown in place               | **exposed dropdown menu** (or a menu with a checked item)           | a full-screen page for 3–7 options                    |
| switch between 2–5 peer options, all visible                  | **segmented buttons** or **filter / choice chips**                  | a dropdown that hides them                            |
| choose from many options, or options that need explanation    | **modal bottom sheet** (radio list inside)                          | a menu                                                |
| confirm a destructive or irreversible action                  | **dialog** (title, consequence, text-button Cancel and action)      | acting straight from the menu item                    |
| move between top-level sections                               | **navigation bar** (phone), rail on wider windows                   | tabs that trigger actions                             |
| act on the current screen                                     | **top app bar** actions, overflow ⋯ for the rest                    | a row of filled buttons in content                    |
| one primary creation action on a screen                       | **FAB** (or extended FAB); several related ones → **FAB menu**      | more than one FAB                                     |
| a short, non-blocking result                                  | **snackbar**                                                        | a dialog                                              |

Our exception: the floating tab island with a separate **+** is app-owned on both platforms (ADR-0235). Keep it until a Human revisits that ADR; on Android it keeps the opaque surface `DESIGN.md` describes.

## System behaviour

- **Edge-to-edge.** Apps targeting Android 15+ draw behind the status and navigation bars, and Android 16 removes the opt-out. Pad content with safe-area insets, keep the IME from covering the focused field (`DESIGN.md` → Keyboard and text entry), and do not paint opaque bars behind the system bars.
- **Predictive back.** Back gestures preview the destination; every sheet, dialog, menu and drawer closes on Back, and custom back handling goes through the router or the platform callback, not a hardware-key listener.
- **Dynamic colour** is the Material default, but this app maps its own design tokens onto Material roles (ADR-0201); use the token roles, never raw hex, and keep contrast at every Material contrast level.
- **Text and targets.** Native nonlinear font scaling up to 200%; touch targets ≥ 48 × 48 dp; ripple on every pressable.
- **Motion.** Material 3 Expressive uses spring motion; Compose components bring it themselves. Respect Remove animations (Reduce Motion).

## Review checklist

- Every interactive element maps to a row of the decision table; menus hold verbs, exposed dropdowns hold state.
- Menus: sentence-case labels, most-used first, dividers between groups, destructive items confirmed in a dialog.
- Dialogs: one question, consequence stated, actions as text buttons on the trailing side with the confirming action last; never a menu disguised as a dialog.
- Bottom sheets: drag handle when resizable, Back and scrim tap dismiss, content scrolls to its last action at 200% text.
- Insets correct edge-to-edge with the keyboard open; Back closes the topmost surface.
- No iOS-only visuals; no hard-coded colours outside the design tokens.
- Drift from `DESIGN.md` named in the PR, with the rule updated in the same change.

## Keeping current

Material ships guidance updates around Google I/O and Android releases (I/O 2026 refreshed menus, lists, search and the expressive layout system; Android 16 brought Material 3 Expressive to the system UI). When a rule here looks stale, check [m3.material.io](https://m3.material.io) and the Android release notes for the current target SDK, then update this file. Verify `@expo/ui` Compose component names against the SDK 58 docs, not memory.
