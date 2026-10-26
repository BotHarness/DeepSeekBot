# Bot Marketplace

## Sub-features

- Flat borderless cards show the indexed Bot banner (pixel recipe or uploaded image) and a primary Import action. No banner keeps a neutral strip.
- Search, Upload Bot and sort controls share a 32px outer height; the row wraps inside a narrow dock.
- When the Panel is 380px wide or narrower, the sort tabs give way to a Sort menu with the same three choices, so no choice is clipped.
- Topic selection uses a filled surface without a border.
- A fresh browser defaults to most stars; changing sort persists on this browser origin, shared by the Panel and Marketplace modal. Invalid or blocked storage falls back to stars without blocking browsing.
- Most stars orders by stars, last push, creation time and stable ID, all descending. The Worker owns the order and cursor; the Client never reorders a page.

## How to get to it (user POV)

Enter Bot mode, dismiss the first-run welcome, and choose **Bot Marketplace / Bot 市场** in the Control Rail. Close Home for a full-height market. The fallback sidebar's New menu also opens the shared Marketplace modal.

## Driving it with verify-app

Launch a task-owned instance with `node scripts/verify-app.mjs launch --name <n>` and run `doctor`. Use its login URL in the browser, click the accessible controls, and retain screenshots, ARIA and console evidence.

1. With no `botharness.marketplace.sort` key, open the Panel and observe Most stars selected. Read `botharness/marketplaceList` with `{"sort":"stars"}` for the canonical catalog.
2. Compare light/dark cards to `banner` in that response. Measure all three toolbar children at 32px and cards/topic/import borders at 0px. Open a card to prove its banner and identity share the detail target.
3. Select Latest created, close/reopen the Panel, then reload. The selected tab and request remain `created`. Repeat with Recently updated and Most stars. Search on Enter and clear the query; the selected sort remains unchanged. The same choice appears in the fallback modal.
4. Select a topic and verify the visible filtered cards match the Host list call. Open Import and inspect the confirmation; cancel without cloning. Open Upload Bot and inspect the existing dialog.
5. Resize the dock narrow enough to wrap controls. Verify each control remains 32px high and cards do not overflow horizontally.
6. Open five full-height columns at 1440px (Bot Marketplace, Messages, Activity Center, Home, Channels). The Market column shows a Sort menu instead of tabs; open it, pick Recently updated, and confirm the list request and the tabs (after widening) both read `updated`.

For Worker tie/paging proof run `pnpm exec vitest run packages/market/test/market-search.test.ts`; it walks 1/2/3/50-item pages through the production Worker and D1 adapter with independent ties at every level. A live Host can point at a task-local Worker using the existing `marketplaceUrl` Plugin configuration, then exercise `deepseekbot marketplace-list --sort stars`.

## Gotchas

- The default `verify-app shot` locale is English; Chinese accessible names require `--locale zh`. The fresh Profile welcome dialog must be dismissed before market interaction.
- Production tie ordering changes only after the Worker and migration `0011_star_tiebreaks.sql` deploy. Old three-field stars cursors receive `invalid-cursor`; reopening/retrying starts from page one. Other cursors remain compatible.
- Browser sorting preferences are device-local; target-Client CLI preference control remains tracked by #2096. The existing `marketplace-list --sort` exercises each catalog order directly.
