---
Status: Accepted
Date: 2026-09-19
---

# Sidebar organization is per scope: sections, sort modes, and 未分组

Bot-mode sidebar order is: the pinned Channel grid (always manual), then user-created **Channel sections** (collapsible, manually ordered, creation order until the user arranges them), then **未分组** at the bottom — flat, not collapsible, fixed position. Each scope carries a **sort mode**: `auto` (newest message first, by the Channel's `updatedAt`), `manual` (the user's frozen order), or `inherit` (follow the global default). Sections default to `inherit` and 未分组 always inherits; the global default is set from the Bots header `...` menu. The first manual drag inside a scope, or a drop into it, flips that scope to `manual` and freezes the order current at that moment — the source scope's mode is untouched — and 恢复自动 returns the scope to `inherit`.

The header copies the native Workspaces header: a `Bots` label on the left, icons on the right in native order **search → ellipsis (sort menu) → plus (create menu)**. The plus menu offers 创建 BOT (disabled placeholder until #41), 创建 Channel, and 创建 Channel section. A section header carries `+` (create a Channel that lands in that section) and `...` = 排序方式 (auto/manual/inherit, trailing check) → 上移/下移 → 重命名 → 删除, delete last in the danger slot; right-click and keyboard context-menu access open the same menu at the header. Rename opens a **Modal with an input** and delete a **Modal confirm with a red outline button** — DSH has no in-place rename and no two-click confirm, and `RiskConfirmation` is reserved for permission escalation. Deleting a section never deletes Channels: they become loose, ungrouped Channels. Moving is native HTML5 drag-and-drop replicating `ui-workspace` (insert-line gradient, half-row drop detection) plus a right-click `移动到 ▸ [新建分组并移动 + sections + 未分组]` menu built on the `Menu` primitive (one-level submenu, cursor anchoring via the JsonTree proxy-rect recipe). Channel rename is available; destructive Channel/PersonaBot deletion remains deferred to #138.

All of this is display configuration and lives browser-local in `roster.json` (pins, sections, order, sort modes) — it extends the existing local-display-config decision and never enters Host storage, `bot.json`, or a SoulSnapshot. Row styling aligns with the measured native sidebar: section header 34px (`projectRow`), channel/session row 32px, `padding: 0 8px`, inter-row `margin-top: 2px`, section blocks 4px apart, hover/selected `--dsw-alias-interactive-bg-hover`, disclosure `IconTriangleRightFill14` rotating 90°, action glyphs only on hover, and no extra indentation for Channels under a section (native has none).

## Considered Options

- **Flat list, no ungrouped bucket** — rejected: Channels dropped out of a section would have nowhere stable to land; a bottom bucket makes removal non-destructive.
- **Store the arrangement on the Host** — rejected: ordering is per-browser display state; Host storage would leak it into exports and conflate display with Soul data.
- **Drag-only movement (no context menu)** — rejected: drag has no keyboard path; the `Menu` submenu keeps the action discoverable and is already a primitive.
- **One fixed sort (always newest-first)** — rejected: users arrange Channels by workflow; manual freeze with an explicit 恢复自动 escape matches the native feel.
- **In-place rename / two-click delete** — rejected: no such native pattern exists; Modal input and Modal confirm are the shell's affordances (ADR-0028).
- **A second dropdown/DnD library** — rejected: no component library in-harness; native HTML5 DnD plus primitives covers it (ADR-0028).

## Consequences

- `roster.json` grows a global default and per-scope `order`/`sortMode`; parsing stays defensive, with unknown shapes falling back to defaults.
- New client work splits into tickets: row styling, section management, sort modes, and move (drag + context menu).
- Spec §2/§5 and PRD US-1 carry the model; ADR-0028's update records the vendored-glyph exception.
- `CONTEXT.md` gains Section order / Sort mode / 未分组; "未分组" is a product term, not a synonym for a folder.

## Update (2026-09-19) — arrangement moves host-side

The second paragraph's "all of this is display configuration and lives browser-local in `roster.json`" no longer holds for the arrangement. Sections (name, membership, order) and pins move into the Host-side BotHarness operational database, exposed to the client through fine-grained `botharness/*` bridge methods; the rejected "store the arrangement on the Host" option is superseded. The sort mode moves into the DSH settings namespace `ui-bot-mode` (per-profile, cross-browser) so it can also appear as a General settings row, with the sidebar `...` menu reading and writing the same scope; only `collapsed` remains browser-local view state. The SoulSnapshot avoidance still holds. The legacy browser `roster.json` is imported once into an empty database and kept as a backup. Details and the current physical map: ADR-0041.

## Update (2026-09-20) — Discord-pattern section headers and channel glyph

The section header no longer copies the native `projectRow` look: there is no left disclosure icon, only the label; the label is muted (`--dsw-alias-label-tertiary`) by default and goes solid on hover with **no background fill** (channel rows keep the hover fill, so the two stay distinguishable); a chevron (`IconChevronDownOutline14`), rotated -90° when collapsed, sits immediately right of the label; the band is compact (24px) instead of 34px. Channel rows use a vendored Lucide `hash` glyph (ISC, registered in `THIRD_PARTY_NOTICES.md`) sized to a 16px box instead of the text `#`.

## Update (2026-09-20) — block drops, stable drag layout, and loose top-level Channels

The whole Channel section block is a drop target, not merely its visible Channel rows: dropping an ungrouped Channel on the header or body assigns it to that section. A header drop inserts before the first Channel, matching the pointer's proximity to the section's top edge; empty, collapsed, and search-filtered row-less sections accept the Channel at index 0. The prediction line and every section-edge marker are absolutely positioned overlays. No target reserves space during a drag; the source row stays in its original slot at 40% opacity, so neither source nor target changes layout while the native gesture is active.

The bottom-fixed 未分组 bucket is retired. "未分组" remains the membership state and context-menu destination, but those Channels render as loose top-level rows in the same flat sequence as section blocks. Dropping a Channel into the gap before or after a section places it loose at that position. The current roster authority carries mixed `topOrder` and exposes `topReorder`; ADR-0041's planned database migration must preserve the same logical order and single-membership invariant. Explicit loose placement is stable in every sort mode; only Channels inside a section participate in that section's auto/manual policy.

This update supersedes the original fixed-bottom bucket and its muted 未分组 header: there is no bucket header after the flat remodel.

## Update (2026-09-21) — PersonaBot DMs use the Channel arrangement

A PersonaBot DM is a first-class `dm` Channel and follows the same section membership, loose top-level placement, drag/drop, prediction-line, context-menu move, and pin rules as a `group` Channel. Its row keeps the PersonaBot avatar, role badges, description, activity projection, and Bot-opening behavior; arranging it never turns the PersonaBot identity into a separate roster entity. The Host reconciles one deterministic DM Channel for every PersonaBot so older profiles and newly created Bots have a durable Channel id before the first conversation is opened. Pinned Channels remain in the dedicated pinned grid and their ordinary rows are omitted while pinned.

Pinning is a Channel presentation action, not Channel membership. Every unpinned `dm` or `group` Channel exposes `置顶频道` beside its existing `移动到` context-menu action; every pinned card exposes `取消置顶`. Pinning adds the Channel id to the Host-owned manual pin order without rewriting section membership or flat placement. Unpinning therefore restores that Channel to its previous section and position. A pinned group Channel uses the hash glyph until Channel-specific avatars/icons are available; a PersonaBot DM keeps its PersonaBot avatar and badges.

The pinned grid is also a drag boundary. When no Channel is pinned, its `拖到此处置顶` target is mounted but collapsed to zero height and hidden while idle. An ordinary Channel drag arms it on the next browser task and transitions it open; deferring the height change until after `dragstart` preserves Chromium's native gesture. Dropping there pins the Channel. Dragging a pinned card similarly reveals one dedicated dashed `取消置顶并回到原位` target between the pinned grid and ordinary roster. Only that explicit target restores the preserved placement; undifferentiated roster whitespace is not a drop target. Dropping on a concrete Channel row, section header/body, or section-edge gap instead both unpins and persists the prediction-line position. The latter is composed as one client mutation/refresh over existing Host arrangement methods so the user never observes an intermediate refreshed state. Both source forms remain in place at 40% opacity. Context-menu `取消置顶` remains the keyboard-accessible restore-to-origin equivalent. The durable `pins` list now canonically stores Channel ids; clients read legacy PersonaBot slugs as their DM Channel ids and rewrite the canonical form during roster initialization.

## Update (2026-09-21) — section-scoped creation and newest-first placement

The `+` action on a section header opens a small creation menu for either a group Channel or a PersonaBot DM; both are created directly into that section as its first Channel. Creation defaults are newest-first at every roster level: a new section is prepended to the absolute top-level order, while a new loose group Channel or PersonaBot DM is prepended ahead of every existing top-level entry. These are durable Host arrangement writes, not temporary optimistic rendering, so the first position survives refresh and remains the starting point for later manual drag ordering.

## Update (2026-09-21) — context menus are the complete keyboard organization path

A section header's ellipsis, right-click, and `Shift+F10`/Context Menu key open the same cursor-positioned primitive menu. Alongside its sort policy it can move the section one position up or down, rename it, or remove the section after confirmation. Boundary moves are disabled. Removing a section only removes the grouping record; its Channels remain durable and become loose.

Every group Channel and PersonaBot DM Channel, whether shown as an ordinary row or pinned card, uses one context menu: pin/unpin, move to an existing section, create a new section and move there, rename, and hide. A pinned move both removes the pin and commits the selected destination. Renaming a group changes its Channel name; renaming a DM also changes the owning PersonaBot's display name while retaining the stable Channel id and PersonaBot internal id. True Channel/PersonaBot deletion is intentionally absent until [#138](https://github.com/BotHarness/BotHarness/issues/138) defines the destructive lifecycle.

## Update (2026-09-21) — collapsed sidebar rail projects the same Channel order

Collapsing BOT mode does not collapse the roster into a single generic BOT launcher. The 56px native sidebar leaves a 36px content rail, and that rail projects every renderable Channel in the same durable order as the expanded roster. Pinned Channels form the first group; a divider appears only when both groups exist; the remaining Channels flatten each section's resolved order together with loose top-level Channels. Section headers themselves do not occupy rail slots. A PersonaBot DM uses its 32px avatar, while a group Channel uses the hash glyph until custom Channel imagery exists. Selecting either switches the DM or group conversation without expanding the sidebar.

Each rail slot uses the native portaled `HoverCard` to make the compact projection legible. It shows Channel identity, PersonaBot roles and optional description where applicable, and a short latest-message preview. `botharness/channels` derives that optional latest message from the existing per-Channel message authority; it is a read-model field, not duplicated durable state in `channel.json`. Opening or sending in a conversation updates the same client projection immediately. Search text and expanded/collapsed section view state do not remove Channels from the rail, because the rail is navigation over the complete arranged roster rather than a miniature rendering of the currently filtered list.

## Update (2026-09-21) — Hidden Channel is reversible roster presentation state

`隐藏频道` removes either a PersonaBot DM Channel or group Channel from every roster navigation projection: the expanded list, pinned grid, roster search, and collapsed rail. It does not archive, mute, or delete the Channel and does not mutate membership, message history, routing, PersonaBot identity, Memory, pin state, section membership, or flat order. The currently open conversation may remain visible because hiding only changes navigation. The Host-owned roster authority stores the ordered hidden Channel ids; legacy records with no `hidden` field read as an empty list.

The global header ellipsis is therefore a **More** menu: after the existing sort choices it exposes `隐藏的频道`. That action opens a native searchable Modal where each hidden DM or group Channel can be restored. Because hide never rewrites placement, restore returns the Channel to its retained pinned position or ordinary section/loose position. This is the reversible v1.0 path in [#137](https://github.com/BotHarness/BotHarness/issues/137).

True deletion remains separate. PersonaBot deletion must decide the fate of its managed Memory Repository, Sessions, Workspace Grants, bindings, exports, and audit data; Channel deletion must decide the fate of message bodies, shared attachments, provider copies, backups, and causal tombstones. Those destructive semantics follow ADR-0037's Content Purge / Purge Everywhere dependency-report and confirmation boundary and are deferred to [#138](https://github.com/BotHarness/BotHarness/issues/138).

## Update (2026-10-13) — loose rows follow the global sort mode

This update replaces the earlier rule that explicit loose placement is stable in every sort mode. Under the global **Recently updated** mode, each run of loose top-level Channels between two section blocks is ordered by its latest visible message time, falling back to the Channel record time when it has no message, so a Channel with a new message rises like it does in an IM client. Sections stay at their `topOrder` positions, and **Manual order** keeps loose rows at their stored positions. Section and pinned ordering use the same latest-message time. Opening or updating a Channel in the Client never moves it by itself; only the sort order does (#1530).
