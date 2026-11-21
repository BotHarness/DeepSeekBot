# Bot Marketplace

## Sources

- `packages/market/**`
- `packages/core/src/marketplace/**`
- `packages/core/src/features/marketplace/**`
- `packages/client/src/client/marketplace-report.tsx`
- `packages/client/src/client/{marketplace,marketplace-browse-controls,marketplace-install-review,market-panel,market-avatars,market-avatar-apply,personabot-avatar-crop,standing-import-usage}.tsx`
- `packages/client/src/client/{profile-header,bot-sidebar-channel-actions}.tsx`
- `apps/mobile/src/marketplace/**`
- `apps/mobile/src/ui/shell/marketplace-*`
- `apps/mobile/src/ui/primitives/marketplace-topic-sheet*`
- `apps/mobile/app/marketplace*.tsx`

## Terms

- Bot Marketplace
- Marketplace Digest
- Marketplace Ranking
- Install Receipt
- Share Draft
- Listing

## Sub-features

- Flat borderless cards show the indexed Bot banner (pixel recipe or uploaded image) and a primary Import action. No banner keeps a neutral strip.
- Search, Upload Bot and sort controls share a 32px outer height; the row wraps inside a narrow dock.
- When the Panel is 380px wide or narrower, the sort tabs give way to a Sort menu with the same three choices, so no choice is clipped.
- Topic selection uses a filled surface without a border.
- A fresh browser defaults to most stars; changing sort persists on this browser origin, shared by the Panel and Marketplace modal. Invalid or blocked storage falls back to stars without blocking browsing.
- Sharing a Bot goes through a Share Draft (ADR-0267): Bot profile **⋯ → Share to Marketplace** (or Upload Bot → Share a Bot) shows the Check step; **Check with Tob** starts the draft, sends Tob a DM and closes the dialog. When Tob runs `share-draft-finish`, the upload form reopens on the draft at Check with the kept/rewritten/dropped counts, then Where (Tobs Marketplace or My GitHub).
- Most stars orders by stars, last push, creation time and stable ID, all descending. The Worker owns the order and cursor; the Client never reorders a page.

## How to get to it (user POV)

Enter Bot mode, dismiss the first-run welcome, and choose **Bot Marketplace / Bot 市场** in the Control Rail. The fallback sidebar's New menu also opens the shared Marketplace modal.

## Driving it with verify-app

Launch a task-owned instance with `node scripts/verify-app.mjs launch --name <n>` and run `doctor`. Use its login URL in the browser, click the accessible controls, and retain screenshots, ARIA and console evidence.

1. With no `botharness.marketplace.sort` key, open the Panel and observe Most stars selected. Read `botharness/marketplaceList` with `{"sort":"stars"}` for the canonical catalog.
2. Compare light/dark cards to `banner` in that response. Measure all three toolbar children at 32px and cards/topic/import borders at 0px. Open a card to prove its banner and identity share the detail target.
3. Select Latest created, close/reopen the Panel, then reload. The selected tab and request remain `created`. Repeat with Recently updated and Most stars. Search on Enter and clear the query; the selected sort remains unchanged. The same choice appears in the fallback modal.
4. Select a topic and verify the visible filtered cards match the Host list call. Open Import and inspect the confirmation; cancel without cloning. Open Upload Bot and inspect the existing dialog.
7. Share Draft: on a Bot profile choose **⋯ → Share to Marketplace → Check with Tob**. Prove with `deepseekbot share-draft-show <bot>` that a `reviewing` draft exists and that `git -C <memory> status --porcelain` stays empty. Drive the decisions through Tob's DM (or `share-draft-decide`), run `share-draft-finish`, and observe the dialog reopen on Check with the counts; continue to Where.
5. Resize the dock narrow enough to wrap controls. Verify each control remains 32px high and cards do not overflow horizontally.
6. Open five full-height columns at 1440px (Bot Marketplace, Messages, Activity Center, Generated files, Channels). The Market column shows a Sort menu instead of tabs; open it, pick Recently updated, and confirm the list request and the tabs (after widening) both read `updated`.

For Worker tie/paging proof run `pnpm exec vitest run packages/market/test/market-search.test.ts`; it walks 1/2/3/50-item pages through the production Worker and D1 adapter with independent ties at every level. A live Host can point at a task-local Worker using the existing `marketplaceUrl` Plugin configuration, then exercise `deepseekbot marketplace-list --sort stars`.

## Marketplace Avatars on Web

1. Point a task-owned Host at an isolated Marketplace Worker with its D1 migrations and R2 binding. Sign the owner in to Connect and accept upload terms.
2. Open **Avatars → Publish Avatar**, choose a rectangular image with both sides at least 256 px, move the crop, and save. Fill in the name, description and tags. Verify the confirmation identifies the author by display name and Author ID and explains that applied copies stay with other Bots.
3. Publish and compare the detail image with the form preview. Verify the description, tags, author and Apply Count of 0. Read the canonical result with `deepseekbot marketplace-avatar-detail <id>`. Confirm a file with a 255 px side is refused.
4. Seed more than 24 listings from at least two accounts, use **Load more**, and compare the visible IDs with `deepseekbot marketplace-avatar-list [--cursor <cursor>]`. Browse as a Team member, verify the publish entry is absent, and verify a member publish call receives `permission-required`.
5. Return to **Bots** and verify the current search, sort and cards are preserved. Initial Bots browsing makes no Avatar list request.
6. With listed Avatars tagged `Blue` and `blue`, open **Avatars** and verify that the `blue` chip shows their combined count. Select the chip, enter a keyword from a listing's name, description or tags, and press Enter. Compare the cards and each subsequent page with `deepseekbot marketplace-avatar-list --query <keyword> --tag BLUE`, and compare counts with `deepseekbot marketplace-avatar-tags`. Search for an absent keyword and verify the filtered empty state. Clear the keyword and select **All** to restore the full grid. Hide or remove a listing in the isolated Worker and verify it disappears from search and counts.

### Publish a Bot's current Avatar

1. As the Host owner, set a 256 × 256 PNG on a Bot. Open its profile, then **More** → **Publish Avatar**. Repeat from the Bot's DM context menu.
2. Zoom in one step. Confirm the 256 px crop message and disabled Save action. Return the slider to minimum, save, and publish using the existing author form. Compare the detail image with the crop and read it with `deepseekbot marketplace-avatar-detail <id>`.
3. Repeat with a Bot that has an Avatar Appearance. Verify the published still matches the Bot's appearance. Verify both menu entries are absent for a Blobatar-only Bot and for a Team member with `bots.manageAll`.
4. Run `deepseekbot marketplace-avatar-publish --from-bot <bot> --name <name> --confirm` as owner. Use a compliant stored image for success. Verify `no-stored-avatar` for a Blobatar, `unprocessed-image` with a Web instruction for a noncompliant image, and `permission-required` as a member.

## Tob install review

The import confirmation shows the standing memory usage and effective limits from the staged files. Check an older Bot Marketplace entry that exceeds a default limit and an entry carrying a valid custom pair. Before confirming, compare the usage to the CLI's `marketplace-install <listing-id>` review result. After confirming, read the new Bot's standing memory limits.

Install opens a review step: Tob reads the staged files and the step shows **Tob found nothing risky**, the findings (prompt injection, sends data out, script) with **Install anyway**, or **Tob couldn't review this Bot** with **Install without review**. Back creates nothing. The real-model journey is `node scripts/e2e-install-review.mjs`: it serves a local Marketplace with a planted-injection Bot and a clean Bot, launches an isolated Host pointed at it, and asserts the planted file is flagged, the clean Bot is not, a review creates no Bot, and `marketplace-install <id> --review <review-id> --confirm` installs. Use the AX model selection on the newest DeepSeek model.

## Gotchas

- Install source is an optional named gateway argument (`list`, `hot`, `new`, `rising`, `digest`). A source-bearing `/api/botharness/marketplaceInstall` request must reach the review owner, not fail with `unexpected "source"`. An expired review must still be refused; reaching that refusal proves admission only, not a successful installation. Qualify installation with a real staged review separately.

- The default `verify-app shot` locale is English; Chinese accessible names require `--locale zh`. The fresh Profile welcome dialog must be dismissed before market interaction.
- Production tie ordering changes only after the Worker and migration `0011_star_tiebreaks.sql` deploy. Old three-field stars cursors receive `invalid-cursor`; reopening/retrying starts from page one. Other cursors remain compatible.
- Browser sorting preferences are device-local; target-Client CLI preference control remains tracked by #2096. The existing `marketplace-list --sort` exercises each catalog order directly.

### Apply a Marketplace Avatar

1. Open a published Avatar in the Marketplace on the connected Host. Click **Apply** and select a Bot with a plain avatar. Confirm that the picker shows the Bot and omits the replacement warning.
2. Choose a Bot with an editable Appearance. Confirm the warning appears before the write, apply the Avatar, and open the Bot’s profile to check the new image. Check the same Bot with the CLI.
3. After the receipt reaches the Worker, run `deepseekbot marketplace-avatar-detail <id>` to confirm the increment. Apply again to the same Bot and check that the count stays the same.


### Report a Marketplace Avatar

1. Publish an Avatar on the isolated Worker and apply it to a test Bot. Open the loaded Avatar detail as a browsing Human. Click **Report**, add a reason, submit, and wait for **Report received**.
2. Run `deepseekbot marketplace-avatar-report <id> --reason <text>` from the same Host. Confirm the combined reports from that source count once.
3. On the isolated Worker, complete the report challenge from enough distinct sources to reach the configured threshold. Confirm the Avatar disappears from the list, its detail and image return 404, and another attempt to apply it is refused. Reopen the original Bot profile and compare its local Avatar.
4. With the isolated Worker's admin token and URL in the CLI environment, use `deepseekbot marketplace-blocklist restore avatar <id>` and confirm the original Apply Count. Use `block` and `restore` again and check that the same visibility rule applies.

The Worker HTTP coverage is in `packages/market/test/market-avatars.test.ts`. The Host copy check is in `packages/core/test/marketplace-avatar-apply.test.ts`.
