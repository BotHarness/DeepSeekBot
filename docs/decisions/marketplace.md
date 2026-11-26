---
Publish: true
---

# Marketplace decisions

The Bot Marketplace catalogs Indexed Repositories and Uploaded Bots. The Worker owns the catalog, and the serving Host creates local PersonaBots.

## Public GitHub repositories opt in through a topic

<a id="adr-0131"></a>

A public GitHub repository opts into discovery with the `botharness-bot` topic. Pasting a URL requests immediate crawling under the same eligibility rules. The GitHub node ID supplies stable identity across renames and transfers. Daily discovery finds new opt-ins and hourly refresh hides entries that lose eligibility. A dedicated Worker uses D1 for the catalog and full-text search, with keyset pagination for browsing and bounded search results. Repository metadata and the README supply presentation, with optional overrides in `.botharness/bot.json`. The Client renders the README as sanitized Markdown. Submission and reporting use ALTCHA and rate limits, with moderation and blocklist controls.

The Host installs an Indexed Repository through Git-backed Bot creation. The install confirmation shows the indexed revision and the risk of bringing third-party content into Memory.

Why: The topic records consent in GitHub and makes withdrawal possible through the same repository. Reusing Git-backed Bot creation keeps the catalog separate from the local Bot lifecycle.

Enforced by: [discovery and refresh](../../packages/market/test/market-crawl.test.ts), [submission](../../packages/market/test/market-submission.test.ts), [protection and moderation](../../packages/market/test/market-protection.test.ts), [search](../../packages/market/test/market-search.test.ts), [indexed install](../../packages/core/test/marketplace-install-receipts.test.ts).

## Listing localization gives authors priority

<a id="adr-0240"></a>

The Worker serves English and Chinese author-supplied README variants and localized `name` and `bio` values on request. The default README remains the fallback. Where an author has supplied no bio for the requested language, the hourly refresh can generate one short, labeled summary. It bounds work and retries, caches by input and model configuration, and prefers available free OpenCode models before the configured paid fallback. Author text supersedes the generated summary. README bodies are served as written, and the catalog works without a summarizer key.

Why: Author text preserves the intended wording of instructions and descriptions. An optional, labeled summary improves discovery while keeping submitted catalog text untrusted and model costs bounded.

Enforced by: [localization and summary generation](../../packages/market/test/market-localization.test.ts), [language forwarding](../../packages/core/test/marketplace-bridge.test.ts).

## Connect accounts own Uploaded Bots

<a id="adr-0267"></a>

Signed-in Connect authors can publish, replace and delete Uploaded Bots in the same catalog. Browsing and installation are public. The catalog displays an author name and stable author ID. A ready Share Draft supplies bounded, allowlisted Memory files, stored individually in R2 for browsing. Tob helps the Human prepare the draft without changing source Memory and can review incoming files before install. An unavailable review is disclosed. Install creates a fresh PersonaBot with one initial commit. Replacement and deletion affect the hosted files and listing, while installed Bots are independent copies. [Bot Zip](bots.md#adr-0135) is a separate portable form.

The Host reports completed installs from UI and CLI for both sources. A marketplace-only random Host identifier lets the Worker deduplicate per entry independently of Telemetry. Daily snapshots power Hot, New and Rising rankings and the Marketplace Digest. Digest output fills fixed text fields.

Why: Hosting files through the existing account authority opens publication to authors without GitHub. Draft review makes the selected files visible before sharing, and counting completed installs keeps catalog statistics tied to actual creation.

Enforced by: [upload ownership and file limits](../../packages/market/test/market-uploads.test.ts), [Share Draft](../../packages/core/test/share-draft.test.ts), [Host upload and install](../../packages/core/test/marketplace-uploaded-bots.test.ts), [receipts](../../packages/market/test/market-receipts.test.ts), [rankings](../../packages/market/test/market-rankings.test.ts), [digest](../../packages/market/test/market-digest.test.ts).

## Apply Count counts PersonaBots, without anti-abuse

<a id="adr-0358"></a>
_Formerly ADR-0358._

A Marketplace Avatar's Apply Count, and the Hot and Rising rankings built on it, count distinct PersonaBots, not Hosts. The Worker deduplicates on a SHA-256 of the random Marketplace Host ID together with the PersonaBot ID. Like an Install Receipt, the Host reports once, asynchronously, after the Avatar write succeeds; a failure is not retried, and there is no receipt credential, HMAC secret or retry queue. A PersonaBot re-created on another Host or imported on its own counts again. A restore keeps the PersonaBot ID, but a Profile Backup does not carry the Marketplace Host ID (`marketplace-host.json` in the data directory), so a restore that starts without that file reports under a new Host ID and counts again. ADR-0358 said a restored Bot is not counted again; the code does not guarantee that.

Why: the number people want to see is how many Bots use an Avatar. Creating a PersonaBot is cheap, so one Host can inflate the count, and we accept that, together with a lost report meaning a missed count, rather than add signed receipts and a retry queue to protect a number with nothing at stake. Revisit this before rankings or counts are used for rewards; a later change of deduplication key cannot recover what old counts meant.

Enforced by: [Host apply report](../../packages/core/test/marketplace-avatar-apply.test.ts), [Worker avatars and counts](../../packages/market/test/market-avatars.test.ts).

## Marketplace Avatar images are processed on the client

<a id="adr-0359"></a>
_Formerly ADR-0359._

The Web and mobile clients crop, resize and re-encode an Avatar image before publishing. The result is a square still PNG, JPEG or WebP, 256 to 512 pixels on a side, with no metadata, of at most 128 KiB (`MIN_MARKETPLACE_AVATAR_SIDE`, `MAX_MARKETPLACE_AVATAR_SIDE`, `MAX_MARKETPLACE_AVATAR_BYTES` in `host-protocol`), the same as the Host's Avatar limit. The Worker reads only headers and chunk structure, never pixels: signature, header dimensions, squareness and bounds, size, no animation (APNG, animated WebP) and no metadata chunk (JPEG APP1 EXIF/XMP; PNG `eXIf`, `tEXt`, `iTXt`, `zTXt`; WebP `EXIF`, `XMP`). Anything that fails is refused as unprocessed, never silently fixed. The code also refuses PNG `zTXt`, which the ADR did not list.

Why: everyone who applies an Avatar receives its image, so a published image must carry no location or other metadata and must not be a disguised file, and the Worker cannot afford to decode every upload. A metadata chunk not on the list can still pass; the fix is to add it to the list, not to decode on the server.

Enforced by: [client image processing](../../apps/mobile/test/marketplace-avatar-image.test.ts), [Worker avatar checks](../../packages/market/test/market-avatars.test.ts).

## Marketplace Skills are indexed folders, added by copy after a Host review

<a id="marketplace-skills"></a>

The Marketplace has a Skills section ([#5439](https://github.com/BotHarness/DeepSeekBot/issues/5439), spec [#5366](https://github.com/BotHarness/DeepSeekBot/issues/5366)). The Worker discovers public GitHub repositories with the `tobs-skill` topic, the same way it discovers `botharness-bot` Indexed Repositories, and lists each folder that holds a valid `SKILL.md` (Agent Skills frontmatter: kebab-case `name` of at most 64 characters, `description` of at most 1024) as one Marketplace Skill, pinned to the commit it read. An administrator can also index a repository without the topic, for example an official collection. A folder over 100 files or 1 MiB is skipped. On indexing, the Worker scans `SKILL.md` and the text and script files for secret-like strings, prompt-injection phrases, exfiltration paths and hosts, and download-and-execute pipes. Download-and-execute makes the entry rejected and unlisted; the other findings list it with a warning. Every entry records its scripts, and the UI marks it 「含脚本」.

Adding is a copy, not a subscription. The Host downloads the files of the listed commit from GitHub, scans them again with the same rules, and shows the review (verdict, findings, scripts, files, name conflicts) before anything is written. The Human then picks one or more Bots they own, or global. For a Bot, the folder is written to `.agents/skills/<name>/` in its Memory Repository and committed once; global writes a Host Skill to `<DSH home>/skills/<name>/`, which the DSH filesystem provider watches. A Bot's own Project Skill with the same name still wins over the Host Skill (ADR-0345). The written `SKILL.md` records `metadata.tobs-source` (the entry id), `tobs-repository` and `tobs-hash` (a SHA-256 of the files as downloaded). A name already taken is refused unless the Human chooses to replace that folder or add under a free `<name>-N`, which also rewrites the `name` field. Each Bot target, and the global target, sends one Install Receipt keyed by a SHA-256 of the Marketplace Host ID and the target.

Only a Bot's owner may add to it, and only the Host owner (including the owner's own Bots through the CLI) may add globally. A Bot asked by its Human can search and add through `deepseekbot marketplace-skill-list` and `skills-add`; there is no resident search tool, and `skills-add` without `--confirm` only prints the review.

Why: a Skill is plain instructions plus optional scripts, so a folder pinned to a commit is enough to list and to add, and a copy in the Memory Repository keeps the Bot's history and lets the owner edit it. Scanning on both the Worker and the Host means a repository changed after indexing is still checked before it reaches a Bot. Pattern scanning catches careless and obvious cases, not a determined author; the review that lists every script, and the owner-only targets, are what limit the damage. Updates of an added Skill, author uploads to R2 and skills.sh search are later slices of #5366.

Enforced by: [Worker indexing and scan](../../packages/market/test/market-skills.test.ts), [Host review and add](../../packages/core/test/marketplace-skill-add.test.ts), [Skills section](../../packages/client/test/market-skills.test.ts).
