---
Publish: true
---

# Bot identity and lifecycle decisions

The PersonaBot Registry owns identity and lifecycle. See the [living architecture](../architecture/botharness-architecture.md) for runtime relationships and the [Tob decisions](tob.md) for the built-in Steward Bot.

## BotHarness extends DSH through published plugins

<a id="adr-0015"></a>

BotHarness supplies the Host domain and Client extension through packages composed by the Tobs Bundle. DeepSeek Harness owns the native runtime and extension contracts.

Why: Plugins provide the tools, events, storage and Client seams needed for persistent Bots. Keeping that boundary lets DSH upgrades and other plugin consumers share the same foundation.

Enforced by: [product artifact contracts](../../scripts/test/product-artifacts.test.mjs), [DSH compatibility floors](../../scripts/test/manifest-engines.test.mjs).

## The Registry owns PersonaBot continuity

<a id="adr-0016"></a>

A PersonaBot has a Registry identity, Memory Repository and Channel bindings. DSH Agents and Sessions execute work for that identity through explicit [Session Ownership](sessions.md#adr-0035). Workspace Grants attach places to work. The [Activity Projection](release.md#adr-0049) derives Bot activity from execution facts.

Why: A Bot can work on multiple projects and survive a Session restart. Treating a project or Agent as the Bot would lose continuity and blur ownership.

Enforced by: [Bot runtime ownership](../../packages/core/test/bot-runtime.test.ts), [Workspace Grants](../../packages/core/test/workspace-grants.test.ts), [activity revisions](../../packages/core/test/bot-activity-snapshot-revision.test.ts).

## The Host assigns identity and Humans choose labels

<a id="adr-0046"></a>

The Host mints an opaque, filesystem-safe ID for each independent creation and serializes it as the Registry slug. A display name and role badges are editable labels. Duplicate names are valid, and a selected mention retains its target's identity.

Why: Filesystem constraints should not restrict the names Humans use. Stable IDs keep a rename or duplicate name from retargeting history, mentions or authority.

Enforced by: [Host-assigned identity](../../packages/core/test/bot-creation.test.ts), [CLI duplicate-name creation](../../packages/core/test/bot-create-model-cli.test.ts), [Group mentions](../../packages/core/test/group-mention.test.ts).

## Product chrome shares the configured Bot mark

<a id="adr-0057"></a>

The in-harness Bot entry and Bot Settings navigation resolve the mascot, blob or generic Bot glyph from the same Bot Mode preference. The Client ships the light and dark artwork as bundled assets. If the native Settings cell cannot be identified, it keeps its native glyph.

Why: One preference keeps independently rendered entries recognizable. Bundled assets make the mark available alongside the Client bundle without another fetch.

Enforced by: [Bot mark and Settings navigation](../../packages/client/test/bot-icon.test.ts).

## Uploaded avatars are bounded records served through an authenticated read route

<a id="adr-0032"></a>
<a id="adr-0086"></a>

The Registry avatar field owns uploaded PNG, JPEG or WebP data. The Host accepts sniffed image bytes up to the 128 KiB decoded limit and exposes an authenticated URL with cache validators in read models. An absent or invalid upload falls back to the Client's deterministic Avatar presentation for that Bot. The current default Avatar uses a seeded pixel recipe where supported.

Why: Storing a small image with the record keeps exports self-contained. URL projection avoids retransmitting base64 on every roster refresh.

Enforced by: [avatar data URL properties](../../packages/core/test/persona-bot-avatar.property.test.ts), [avatar route and fallback](../../packages/core/test/persona-bot-avatar.test.ts), [Client Avatar rendering](../../packages/client/test/avatar.test.tsx).

## The pixel rig separates saved appearance from activity presentation

<a id="adr-0118"></a>
<a id="adr-0148"></a>

The Registry owns saved Avatar Appearance. The Client renders that appearance with the shared Activity Projection and owns transient poses, attention indicators and motion. Species reuse the pixel rig and keep choices that are hidden by incompatible parts. Custom Parts are bounded pixel data embedded in the appearance. An unsaved avatar uses the applicable seed version, and existing recipes retain their compatible rendering.

Why: Rendering a new activity state should preserve the Human's saved appearance. A shared rig gives species the same motion vocabulary, and embedded parts keep shared recipes independent of another Profile's library.

Enforced by: [Avatar editor and species behavior](../../packages/client/test/avatar-appearance-editor.test.ts), [Custom Part tools](../../packages/client/test/custom-part-tools.test.ts), [Avatar render states](../../packages/client/test/avatar.test.tsx).

## Deletion retains attribution and requires separate consent for Memory erasure

<a id="adr-0130"></a>

PersonaBot deletion closes execution and new effects and retains a tombstone, historical attribution and the Memory Repository by default. The unchecked Memory erasure option binds explicit consent to the reviewed, exclusively owned managed repository. The Host revalidates that scope and reports incomplete cleanup. Ordinary Channel ending retains history. [Group disbanding](#adr-0274) and [Content Purge](persistence.md#adr-0146) have their own scopes.

Why: Removing an active identity should preserve historical attribution and avoid incidental loss of uncommitted Memory or other people's content. Explicit scope lets the Human independently inspect and erase the directory.

Enforced by: [deletion gates, tombstones and Memory cleanup](../../packages/core/test/personabot-deletion.test.ts), [purge and backup rules](../../packages/core/test/profile-backup.test.ts).

## A Bot Zip moves selected Memory into a fresh PersonaBot

<a id="adr-0135"></a>

A Bot Zip carries current Memory files and a portable descriptor. Whole-Bot export can include ordinary Git branches and tags. A selective export cannot carry history. Import allocates a fresh identity and never inherits Sessions, credentials, IM bindings or Workspace Grants. Public discovery and uploaded artifacts follow the [Marketplace decisions](marketplace.md).

Why: File sharing preserves useful work and appearance without transferring live authority. Omitting history from selective exports prevents an excluded file from returning through commits.

Enforced by: [Bot Zip format and round trip](../../packages/core/test/bot-zip.test.ts), [Bot Zip import](../../packages/core/test/bot-zip-import.test.ts).

## Programmatic creation uses the same Registry as the Client

<a id="adr-0156"></a>

The `tobs create` and compatible `deepseekbot create` command support blank creation, Git and Zip and return one JSON result with stable refusal codes. Sensitive input uses stdin or files. Blank creation need not wait for model setup. Offline commands use the Registry against the selected Profile and do not run the new Bot.

Why: Automation needs a machine-readable entry point and the same import, validation and initialization behavior as the UI. Keeping model setup independent lets the Human create and configure the Bot in separate steps.

Enforced by: [creation CLI contract](../../packages/core/test/bot-create-model-cli.test.ts), [live Bot CLI](../../packages/core/test/bot-live-cli.test.ts).

## Bot Primary Color is portable identity

<a id="adr-0177"></a>

The Registry stores the automatic or custom color policy. Automatic follows the pixel Avatar's main hair color when available, otherwise a carried fallback or a deterministic ID-derived color. Import preserves the fallback under a fresh ID. Deletion retains the last resolved source with attribution. Names, mentions and charts derive suitable theme and background variants from the source.

Why: Image pixels and changing themes should not choose the Bot's identity color. Storing its source preserves recognition through sharing and keeps display contrast a Client concern.

Enforced by: [name and chart color resolution](../../packages/client/test/bot-primary-color.test.ts), [descriptor portability](../../packages/core/test/bot-descriptor-sync.test.ts), [historical retention](../../packages/core/test/personabot-deletion.test.ts).

## Orchestrators create peers through the ordinary approval path

<a id="adr-0212"></a>

The Orchestrator's `bot_create` tool previews and creates a blank PersonaBot through the existing Registry and ordinary tool approval. An Avatar file requires the caller's read scope and must pass the bounded image checks. The new Bot is an independent peer with its own DM and no inherited authority. The tool records the creation in the originating conversation and has a direct CLI path.

Why: A request to create another Bot belongs in the conversation where the Human can review it. A shared Registry path keeps it equivalent to blank creation from the Client.

Enforced by: [scope, approval preview and creation result](../../packages/core/test/bot-create-tool.test.ts), [direct Bot tools](../../packages/core/test/cli-bot-tool.test.ts).

## Creation and import recover on the chosen Host

<a id="adr-0247"></a>

A submitted creation binds its Host, stable operation key and accepted input. The Host reserves or reuses the same identity and reconciles the Registry, Memory and Human DM after a lost response. Recovery rejects changed input and stays on the selected Host. Zip staging transfers bounded, digest-bound chunks independently of durable creation, and the phone stores a recovery reference. An explicit request for a second copy uses a new operation.

Why: After disconnect, the phone cannot infer failure from a missing response. A durable receipt makes retries safe across transport, filesystem and database boundaries.

Enforced by: [creation receipt and restart](../../packages/core/test/bot-creation.test.ts), [Zip staging and binding](../../packages/core/test/bot-zip-upload.test.ts), [native transport contract](../../apps/mobile/test/bot-zip-transport.test.ts).

## Tobs keeps existing installation and entry-point identities

<a id="adr-0248"></a>

Tobs is the application brand, BotHarness the framework and Tob the Steward Bot. The `tobs` npm entry depends on the exact matching `deepseekbot` release. Both use the same Bundle and compatible entry points. Mobile keeps its application and store identities. Brand migration preserves existing link identifiers, attribution and compatibility routes.

Why: A new public brand does not require moving Profiles, invalidating links or making users reinstall. Matching package versions preserve the same Plugins and storage from either entry point.

Enforced by: [product archive compatibility](../../scripts/test/product-artifacts.test.mjs), [CLI entries](../../scripts/test/product-cli.test.mjs), [iOS brand contract](../../apps/mobile/test/ios-brand.test.ts).

## Disbanding a local Group deletes its local content

<a id="adr-0274"></a>

Only a Human can disband a local Group. The Host ends membership and routes, stops Group turns and settles pending in-Group requests. Content Purge removes this Group's placements and exclusively referenced managed files. Shared placements, provider copies and Assignment work survive. The deleted identity remains a tombstone. Earlier disbands and incomplete purges remain available through Ended Channel history for explicit cleanup.

Why: Disbanding should finish the local Group lifecycle in one confirmation. Independent work and other placements have their own owners and should survive removal of this one conversation.

Enforced by: [disband authority, execution and content cleanup](../../packages/core/test/group-disband.test.ts).
