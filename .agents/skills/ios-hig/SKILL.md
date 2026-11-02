---
name: ios-hig
description: Apple HIG and Liquid Glass rules for the mobile app's iOS 26+ surfaces, mapped to our Expo stack. Use when choosing or reviewing an iOS control (pop-up or pull-down button, menu, context menu, sheet, toolbar, tab bar, segmented control), adding glass or blur, touching scroll edge effects, or aligning a screen with the HIG.
---

# iOS HIG for the mobile app

Apple's Human Interface Guidelines decide **which** control an iOS surface uses and how it behaves; `apps/mobile/DESIGN.md` records what this app already decided; `expo-ui`, `expo-router` and `expo-native-ui` say how to build it. This skill is the bridge: HIG rules in our words, each pointing at the component we build it with.

**Precedence.** The platform's native design and components are the standard on both iOS and Android (`DESIGN.md` → Native first). A decision written in `DESIGN.md` (or an ADR it cites) wins over this skill. When the HIG disagrees with one, keep the shipped behaviour and name the drift in the PR, so a Human decides; never change it silently. Where `DESIGN.md` is silent, the HIG decides.

## Steps

1. **Name the layer.** Every element is either _content_ (messages, rows, cards, media, backgrounds) or _functional_ (bars, toolbars, the tab island, sheets, menus, floating buttons). Done when each new or changed element is assigned one.
2. **Pick the component** from the [decision table](#decision-table). Done when every interactive element maps to one HIG component and the choice is defensible from its row.
3. **Build it native first.** Use the mapping in [references/components.md](references/components.md): system navigation and `@expo/ui` SwiftUI views before hand-drawn RN look-alikes. Done when no RN view imitates a control the system provides.
4. **Apply the glass rules** in [Liquid Glass](#liquid-glass). Done when glass sits only on functional elements and every glass surface has its fallbacks.
5. **Check the platform split.** Android follows Material 3 with its own native components (`@expo/ui` Jetpack Compose), per `DESIGN.md` → Native first; no iOS look crosses to Android. Done when the Android branch of each change is named and uses the Material counterpart.
6. **Review** with the [checklist](#review-checklist), and capture light and dark screenshots for the PR as the project requires.

## Decision table

| The user needs to…                                                    | Use                                                                    | Not                                                            |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| pick one value from a short, mutually exclusive set, shown in place   | **pop-up button** (a menu-style picker whose label is the current value) | a pull-down, a sheet of radio rows for ≤ ~7 options           |
| switch between 2–5 peer views or modes, all visible at once            | **segmented control**                                                  | a pop-up button (hides the options)                            |
| run one of several commands tied to one button's purpose              | **pull-down button** (menu of actions; ⋯ "More" for secondary actions) | one pull-down holding every action on the screen               |
| act on a specific item (row, message, attachment)                     | **context menu** on long-press, with the same actions reachable elsewhere | a context menu that is the only path to an action             |
| choose among options that need explanation, a long list, or input     | **sheet** (form sheet, detents, grabber)                               | a menu                                                         |
| confirm a destructive choice                                          | **confirmation** (`showAppDialog`, a system alert on iOS)               | doing it straight from the menu item                           |
| move between top-level sections                                       | **tab bar** (our tab island, ADR-0235)                                 | tabs that trigger actions; a hidden or disabled tab            |
| act on the current screen                                             | **toolbar** items in the navigation bar                                | a row of tinted buttons in the content                         |

Pop-up versus pull-down is the common confusion: a **pop-up** shows _state_ (its label changes to the chosen value; choosing is the whole interaction), a **pull-down** offers _verbs_ (its label stays; each item does something). If the menu needs submenus, multiple selection or actions, it is a pull-down.

`DESIGN.md` → iOS menus and native controls adopts these rules: action menus are native pull-down and context menus, single choices are native pop-up menus, and system alerts are for confirmations only. It also lists the iOS screens not yet migrated.

## Liquid Glass

Glass is the functional layer's material on iOS 26+. Its rules:

- **Functional layer only.** Bars, toolbars, the tab island and its **+**, sheets, menus, floating controls. Never rows, cards, bubbles or backgrounds. The one content exception: a slider or toggle may look glassy only while being dragged, which the system does for us.
- **Few custom surfaces.** System bars, sheets and menus get glass for free. Add `glassEffect` / `buttonStyle('glass')` by hand only to the few app-owned floating controls that need it (today: the tab island, the **+** button, drawer tabs and the drawer title capsule). Glass on glass muddies the hierarchy.
- **Regular, not clear,** unless the surface floats over photos or video; clear glass over bright media may need a ~35% dark dimming layer.
- **Colour sparingly.** Labels and symbols on glass stay monochrome; one prominent (tinted) action per view, coloured by its background, not its label. Keep the accent off most controls; selected tab, unread badge and the primary action are where it belongs. Check legibility at the resting scroll position.
- **Separate controls from content with the scroll edge effect,** not a painted bar background. Leave it on its automatic style; use it only where content scrolls under floating controls; one per view. The chat screen uses the native transparent header with the automatic top edge effect over a top-to-bottom (not inverted) list; an inverted list under a transparent header dims on iOS 26 (see `DESIGN.md`, Chat).
- **Fallbacks ship with the glass:** iOS < 26 → bordered/opaque `raised` surface; **Reduce Transparency** → opaque (follow `DrawerMaterial` in `src/ui/primitives/drawer-material.ios.tsx`); **Increase Contrast** → stronger edge; **Reduce Motion** → no morph; accessibility text sizes → an opaque rounded rectangle when text wraps inside a capsule.
- **Hit targets** stay ≥ 44 × 44 pt however small the glass shape looks.

### Native header recipes

Lessons from a production Expo 58 app with iOS 26 glass (t3code; notes in `/mnt/project-files/t3code-design-ref/`), checked against our stack:

- **Transparent native header:** leave the header `backgroundColor` undefined. Any colour, even fully transparent, replaces the system material.
- **Edge blur needs automatic insets.** Give the screen's scroll view `contentInsetAdjustmentBehavior="automatic"` and keep the top scroll edge effect `automatic`. A manual `contentInset` zeroes UIKit's adjusted inset, and the header blur disappears.
- **No hand-made glass on bar buttons.** Declare header items (SF Symbol, stable identifier, native menu) and let UIKit draw their shared glass background. Adding `glassEffect` to a bar item draws a second, thinner capsule.
- **Keep list and detail in one native stack** so iOS 26 can morph the header and matching bar buttons between them; a nested navigator in between breaks the morph.
- **No inverted list under a native header.** UIKit dims and mis-blurs it, which is why the chat screen hides the native header (`DESIGN.md` → Chat).
- **Gate glass on capability, not only the OS version.** With `expo-glass-effect`, check `isGlassEffectAPIAvailable()`; with `@expo/ui`, follow `DrawerMaterial`. Fall back to `expo-blur` or the opaque `raised` surface, and pass the app's `colorScheme` explicitly so glass follows the in-app appearance setting.

## Review checklist

- Every interactive element maps to a row of the decision table; pop-ups show state, pull-downs offer verbs.
- Menus: title-case labels, most-used first, related items grouped, at most one submenu level, destructive items marked and confirmed, icons on all items of a group or none.
- Context-menu actions also exist somewhere visible (header, ⋯ button, or the accessibility actions).
- Sheets: grabber when resizable, swipe-to-dismiss (confirm when it would lose edits), Cancel/Close leading and Done trailing, never Done alone, one sheet at a time from the main UI.
- Tab bar: navigation only, always visible on top-level screens, labelled, never disabled.
- Glass only on the functional layer; every glass surface has the iOS < 26, Reduce Transparency, Increase Contrast and large-text fallbacks.
- At most one tinted primary action per view; labels on glass monochrome.
- Scroll edge effect automatic, only under floating controls, one per view.
- Drift from `DESIGN.md` named in the PR, not silently resolved.

## Keeping current

Apple revises these pages around each WWDC and iOS point release (menus, scroll views and tab bars changed on 8 June 2026 for iOS 27). Each row in [references/components.md](references/components.md) links the HIG page and the change date this skill was checked against; when Apple's page shows a newer change-log entry, re-read it and update the row. Verify `@expo/ui` component and modifier names against the SDK 58 docs, not memory.
