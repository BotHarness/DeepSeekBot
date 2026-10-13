---
Status: Accepted
Date: 2026-10-13
Issues: [#1589](https://github.com/BotHarness/DeepSeekBot/issues/1589), [#1591](https://github.com/BotHarness/DeepSeekBot/issues/1591)
---

# The DeepSeekBot design system is StyleX tokens and components over DSH

The Channel sidebar set the bar for how Bot mode should look: 32px headers, hairline card lists, 13px titles over 12px secondary text, and quiet icon buttons. Nothing else followed it. Bot settings mixed native `<select>` boxes, a 15px bold heading, a table, internal revision numbers and three different save buttons. The client stylesheet used twelve font sizes, more than fifteen radius spellings and seven feature-local alias tables, so every new surface copied whichever neighbour its author opened.

The owner asked for the sidebar's qualities to become the product rule: show only what matters, save space, and keep unrelated information out of a view.

## Decision

DeepSeekBot has a small design system layered on ADR-0028. It is a semantic layer over DSH, not a second design system: colours still resolve to `--dsw-*`, dark mode still follows `body[data-ds-dark-theme]`, and DSH primitives (Modal, Menu, Button, Input, Switch, Tag) stay the controls.

- **Tokens** live in `packages/client/src/client/ds/tokens.stylex.ts`: spacing 2/4/8/12/16/24, type roles meta 12/16, body 13/20, title 14/20 at 500 and heading 16/24 at 500, radius roles control 6, row 8, card 10 and panel (DSH), control sizes 26/28/32/40, and colour roles that each name one `--dsw-alias-*` token.
- **Components** live next to them in `ds/`: `SettingsDialog` (navigation, title, close, scrolling body, attention dots, narrow-screen picker), `SettingsSection`, `SettingsRow`, `Select` (a Menu pill), `NumberStepper`, `Note` and `EmptyState`. Bot settings and Channel settings share `SettingsDialog`.
- **Content rules** apply to every surface built from them:
  - a row has one title, at most one line of description and one control;
  - switches, choices and steppers apply as soon as they change, and a single text field saves on Enter or when it loses focus;
  - footer buttons are kept for multi-field transactions and destructive steps, with at most one primary button;
  - internal identifiers, revisions and protocol terms stay out of the default view.
- **StyleX** is the authoring layer. `scripts/stylex-plugin.mjs` runs the StyleX Babel plugin inside the tsdown client bundle and inside Vitest, collects the generated rules, and writes them into the `CSS` string that `installStyles()` already injects and removes. Class names carry the `bhx` prefix.

## The StyleX gate

The first slice had to meet every criterion in #1589 before any surface depended on StyleX. It did:

- The bundle still requires only the shell's baseline modules. The small StyleX runtime is inlined.
- The generated rules ship inside the existing plugin stylesheet. No stylesheet is fetched.
- Tokens resolve to `--dsw-*` and follow the dark theme without extra selectors. They are `defineConsts`, not `defineVars`: DSH defines its alias tokens on `body`, so a variable declared on `:root` would resolve before they exist. Constants are inlined at each use site, where the DSH tokens are in scope.
- `bhx`-prefixed atomic classes cannot collide with DSH classes or with the legacy `bh-` classes. Their `:not(#\#)` specificity lets a component win over DSH primitive styles without `!important`.
- Build, typecheck, lint, tests and the `pnpm dev:client` watch loop keep working.
- Legacy classes and StyleX components coexist. Surfaces move one slice at a time.

## Considered Options

- **CSS custom properties and plain class names** — the fallback named in #1589. It would have worked, but gives no compile-time check that a token exists and leaves components free to drift back to literals.
- **A component library or Tailwind** — still ruled out by ADR-0028.
- **StyleX with `defineVars`** — rejected for colour tokens for the `:root` reason above.

## Consequences

- New Bot-mode UI composes `ds/` components and tokens. A guard test rejects literal colours and literal spacing, type and radius values in StyleX code.
- Bot settings is rebuilt on the system. Messaging shows one platform at a time as rows and applies each change at once; Window companion and the Assignment limit use steppers; the default name saves on Enter or blur; the IM apps empty state offers the one action that fixes it.
- Channel settings sections, form and confirm modals, and the large workspace modals follow in later slices of #1589. Legacy `bh-` rules are deleted as surfaces stop rendering them.
