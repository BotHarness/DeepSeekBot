# HIG components → our stack

One section per component: the HIG rules that matter on iPhone (paraphrased; follow the link for Apple's wording), what we build it with, and where the app stands today. "Checked" is the latest change-log date on Apple's page when this file was last compared.

Native-first order for building: Expo Router native presentation (`expo-router` skill) → `@expo/ui/swift-ui` views inside a `Host` (`expo-ui` skill) → our primitives in `src/ui/primitives` → a new primitive. Check the SDK 58 `@expo/ui` docs (`https://docs.expo.dev/versions/v58.0.0/sdk/ui/swift-ui/`) for exact component and modifier names before writing code.

## Pop-up buttons

[HIG](https://developer.apple.com/design/human-interface-guidelines/pop-up-buttons) · checked 2023-10-24

- A flat list of mutually exclusive options; after a choice the menu closes and the button's label shows the selection.
- Always start with a sensible default selected.
- Make the options predictable before opening: a leading label ("Model") or a button label that names the effect.
- Good where space is tight and the options needn't be visible all the time. A "Custom…" item can open the rare extra settings.
- Inside a sheet or form, prefer a pop-up over a disclosure row that pushes a whole page for a small, well-defined set.

Build: a SwiftUI `Picker` with the menu picker style, or a `Menu` whose label is the current value and whose items carry a checkmark on the selected one. Android: an exposed dropdown menu (Material 3).

Today: choice rows push pages (e.g. `PickerLink` in `src/ui/chat/model-settings-screen.tsx`). Where the option set is small and fixed, `DESIGN.md` now prefers a native pop-up.

## Pull-down buttons

[HIG](https://developer.apple.com/design/human-interface-guidelines/pull-down-buttons) · checked 2022-09-14

- Items are commands directly related to the button's purpose; the button's label does not change.
- Do not funnel every action of a view into one pull-down.
- Keep the menu short enough to scan; a title only when it adds meaning.
- Destructive items are marked destructive and confirmed before they run.
- Icons only where they add recognition, on every item of a group or none.
- A ⋯ **More** pull-down suits secondary actions where space is tight, at some cost to discoverability. Touch-and-hold on a button can also reveal a related menu (Safari's Tabs button).

Build: a SwiftUI `Menu` with `Button` items (destructive role for destructive items), triggered from a toolbar item or a ⋯ button. Android: a Material dropdown menu anchored to the overflow icon.

Today: `DESIGN.md` requires native pull-down menus on iOS. The Host drawer's ⋯ menu (`src/ui/shell/host-drawer.tsx`) and the group member ⋯ menu (`src/ui/chat/group-info.tsx`) still open a system alert listing their actions and are the open migrations.

## Menus (shared rules for pop-up, pull-down and context menus)

[HIG](https://developer.apple.com/design/human-interface-guidelines/menus) · checked 2026-06-08 (menu item icons)

- Short, clear labels in title case; dim items that are temporarily unavailable (context menus hide them instead).
- An ellipsis on an item that needs more input before it completes ("Rename…").
- Most-used items first; group related items with separators; one level of submenus, short.
- Toggled items: a checkmark for an attribute in effect, or a label that states the current state.
- iOS 27 icon guidance: icons sparingly and only where they really identify the action (standard actions use standard SF Symbols); a group has icons on all items or none.
- iOS layouts: _large_ (default list), _medium_ (three top actions with icon + short label), _small_ (four icon-only top actions for tightly related actions such as text styles).

## Context menus

[HIG](https://developer.apple.com/design/human-interface-guidelines/context-menus) · checked 2023-12-05

- Only the items most relevant to the pressed item; a small number; frequent ones first.
- Every action must also be reachable in the main UI.
- One level of submenus at most; hide unavailable items.
- Warn on destructive items. Offer a context menu or an edit menu for an item, not both.
- A preview helps identify the target; it must look right while it animates.

Build: SwiftUI `ContextMenu` around the item, or Expo Router `Link.Menu` / `Link.Preview` on a link. Android: long-press opens a Material dropdown or bottom sheet.

Today: a chat bubble long-press opens a native SwiftUI `BottomSheet` (reaction row + grouped actions with leading SF Symbols, `DESIGN.md` → Chat). Conversation rows: "long-press opens a native menu".

## Sheets

[HIG](https://developer.apple.com/design/human-interface-guidelines/sheets) · checked 2026-03-24 (button placement)

- Sheets suit a focused, contained task; a long or complex flow belongs in a pushed screen.
- One sheet at a time from the main interface; a sheet may push its own pages.
- A nonmodal sheet is right when its controls change the view behind it.
- Single-view sheets: **Cancel/Close leading, Done trailing**. Never Done alone (pair it with Cancel or Back); never Cancel, Done and Back together. Multi-step flows may vary per step.
- Resizable sheets show a grabber and support the medium detent for progressive disclosure; content made for full height (composers) may skip medium.
- Swipe down dismisses; if edits would be lost, confirm with an action sheet.

Build: `SheetScreen` + `sheetScreenOptions` (`src/ui/primitives/sheet-screen.tsx`: `formSheet`, detents `[0.75, 1]` or `[1]`, grabber on). Inner pages through `SheetStack`. On iOS 26 the system draws the sheet's glass; keep `theme.overlay.fill` behaviour as `DESIGN.md` → Sheet and drawer surfaces specifies.

## Scroll edge effects

[HIG](https://developer.apple.com/design/human-interface-guidelines/scroll-views#Scroll-edge-effects) · checked 2026-06-08

- They separate floating controls from the content scrolling under them; they are not decoration and not a dimming overlay.
- Prefer the automatic style; it goes more opaque for busy top toolbars, text outside glass controls and pinned headers. The soft style needs legibility testing in many contexts.
- Only where a scroll view sits behind floating UI; one per view.
- Custom bars may need the effect added by hand.

Build: native stack headers and `NativeTabs` apply it automatically; React Native Screens exposes per-edge `scrollEdgeEffects` for a screen. Do not paint a solid or translucent background under a bar instead of using it.

Today: chat keeps the automatic top edge effect under a transparent native header; its list runs top to bottom because an inverted list under that header dims on iOS 26 (`DESIGN.md` → Chat header). Other screens keep the system default.

## Tab bars

[HIG](https://developer.apple.com/design/human-interface-guidelines/tab-bars) · checked 2026-06-08 (terminology and art)

- Navigation only, never actions; visible across top-level sections.
- As few tabs as needed; no overflow ("More") tab; never hide or disable a tab even when its content is empty.
- Labelled tabs with SF Symbols; badges only for critical information.
- Don't give tab labels the same colour as content backgrounds.
- iPhone: the bar floats on glass over content; with an accessory it may minimise on scroll-down; a dedicated search tab may sit at the trailing end.

Build: our floating tab island with a separate circular **+** (ADR-0235, `src/ui/shell/navigation-destinations.ios.tsx`, `navigation-action.ios.tsx`), native SwiftUI buttons with `buttonStyle('glass')` on iOS 26 and `bordered` earlier. `NativeTabs` is not used; do not introduce it without revisiting ADR-0235. The **+** is an action next to the bar, not a tab, which keeps "tabs navigate, never act".

## Toolbars and navigation bars

[HIG](https://developer.apple.com/design/human-interface-guidelines/toolbars) · checked 2025-12-16 (Liquid Glass)

- Few items, grouped leading (back/close, navigation) · centre (title) · trailing (actions, Done); minimise groups; text-labelled actions sit apart from symbol buttons.
- System Back and Close; system symbols without borders; the prominent style only for the key action (Done, Submit).
- Fewer bar backgrounds and tinted items; overflow into a ⋯ More menu.
- iPhone: only the most important items in the main bar; large titles help orientation while scrolling.

Build: Expo Router stack header items (`headerLeft`/`headerRight`, or the SDK 58 toolbar APIs in the `expo-router` skill). Activity's header uses native toolbar buttons (`DESIGN.md` → Activity).

## Buttons

[HIG](https://developer.apple.com/design/human-interface-guidelines/buttons) · checked 2025-12-16 (Liquid Glass)

- The most likely action gets the prominent style; distinguish the preferred choice by style, not size; one or two prominent buttons per view.
- Primary role never goes to a destructive action.
- Every custom button has a pressed state; long-running actions show an activity indicator in the button.

## Materials and Liquid Glass

[Materials](https://developer.apple.com/design/human-interface-guidelines/materials) · [Color](https://developer.apple.com/design/human-interface-guidelines/color) · checked 2025-12-16

The rules are in the skill's Liquid Glass section. Build: `glassEffect({ glass: { variant: 'regular' }, shape })` or `buttonStyle('glass')` from `@expo/ui/swift-ui/modifiers`, gated on iOS ≥ 26 and Reduce Transparency off; reference implementation `src/ui/primitives/drawer-material.ios.tsx`. Standard (non-glass) materials for the content layer: `expo-blur` system materials, used sparingly because live blur over a scrolling list costs frames (`DESIGN.md` → Chat).
