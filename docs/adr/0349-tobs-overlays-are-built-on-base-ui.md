---
Status: Proposed
Date: 2026-11-16
Issues: [#4282](https://github.com/BotHarness/DeepSeekBot/issues/4282), [#4285](https://github.com/BotHarness/DeepSeekBot/issues/4285)
---

# Tobs overlays are built on Base UI

ADR-0028 kept a component library out of the in-harness plugin, and DSH's Modal, Menu, Tooltip and Toast became our overlays. ADR-0348 gave Bot mode its own tokens, but those overlays still render DSH's markup and styles, so a Bot-mode dialog cannot follow the Tobs spec. The owner chose Base UI to replace them.

## Decision

Tobs's overlays (`ds/Dialog`, then Menu, Popover, Tooltip, Select and Toast) are built on `@base-ui/react` and styled only with Tobs tokens.

- **Bundled inline.** Base UI is a pinned dependency of `@botharness/ui` and is inlined in `lib/client.js`. The bundle still requires only the shell baseline, and the bundle contract test checks this.
- **One seam with DSH.** `ds/shell-layer.ts` is the only module that talks to DSH's overlay stack. It registers each Tobs overlay with DSH's modal layer, so the top layer, whether ours or DSH's, owns Escape and Tab and returns focus when it closes. The design-token guard exempts this file, and only this file, from the DSH-import rule.
- **Base UI owns structure, the shell layer owns the keyboard.** A Tobs dialog runs Base UI in non-modal mode with its own focus and dismissal turned off. Base UI provides the portal, roles, labelling and lifecycle. The shell layer handles Escape, the Tab trap and focus return. Pointer dismissal is the scrim's click only, so a DSH menu portalled outside the popup never closes the dialog under it.
- **Migration is incremental.** The settings dialog moves first. The remaining Modal, Menu, Tooltip and Toast call sites follow in small PRs, and the DSH-import baseline shrinks with each one.

This supersedes ADR-0028's "no component library in-harness" clause for Bot mode. Its other rules remain: COSS stays on the docs site, and DSH-hosted pages keep DSH's components.

## Considered Options

- **Keep DSH overlays and restyle them** — rejected: their markup and CSS modules are DSH's, so Tobs tokens can only override them from outside.
- **Write our own overlay primitives** — rejected: focus, portals, positioning and accessibility are what Base UI already does well.
- **Let Base UI own Escape and focus too** — rejected: DSH's own dialogs and menus would not know a Tobs dialog is on top, so Escape and shell shortcuts would reach the wrong layer.

## Consequences

- The client bundle grows by the Base UI parts we import.
- A Tobs overlay that DSH content sits inside must go through `ds/shell-layer.ts`; feature code never imports DSH overlay helpers.
- When the last DSH overlay call site is gone, the shell layer is the only remaining tie to DSH's overlay stack.
