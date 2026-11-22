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
