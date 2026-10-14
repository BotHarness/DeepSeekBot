---
Status: Accepted
Date: 2026-10-10
Issues: [#1328](https://github.com/BotHarness/DeepSeekBot/issues/1328)
---

# DeepSeekBot default-bundles Browser, Computer and the IM Provider

Fresh `deepseekbot` installs shipped only Core and Client, so every new Profile needed hand assembly (workspace links plus profile patch entries) before browsing, computer use, or IM worked. We decided that **the `deepseekbot` package is the install unit and default-bundles every DSH runtime feature — Core, Client, Browser, Computer and the qualified IM Provider — while IM accounts start disconnected and per-Bot Browser/Computer Access stays off until a Human enables it.**

## Decision

- **Umbrella owns composition.** `packages/deepseekbot/cordis.patch.yml` (source) and `cordis.im.patch.yml` (product) insert all six loader rows: `botharness-core`, `botharness-client`, `botharness-browser`, `computer-use` (the official seam from ADR-0079, no config) and `botharness-computer` (`target: local`), plus `xmanrui-dsh-im` in the product patch. Members stay `link:`/`file:` dependencies but are never promoted to top-level Bundles (duplicate loader entry, dsh-dev pitfall 10). Members therefore declare no `dsh.bundle` of their own ([#1633](https://github.com/BotHarness/DeepSeekBot/issues/1633)): DSH's Plugins page offers any profile dependency that declares one, and enabling a member there added a second row whose default config replaced the umbrella's (Browser lost `headless: true`) and declared Core twice. A Profile that still selects a member now skips that name at boot while the umbrella keeps loading it.
- **Release packs six artifacts.** `publicationOrder` and `PRODUCT_PACKAGES` cover the IM Provider, Browser, Computer, Core, Client and the product umbrella; `verifyProductComposition` requires all six rows and refuses standalone member Bundles with a remove-entry/retain-data message.
- **Upgrade retains data.** Existing Profiles gain the rows through the normal `deepseekbot@<version>` update plus restart; formerly separate Browser/Computer/Core/Client Bundle entries migrate into the umbrella automatically on both dev and packaged paths (the helper names them as it does so). Standalone IM entries (`@xmanrui/dsh-im`, `@botharness/im-provider`) stay refusal-only: upstream vs product provider needs human eyes. Removing a standalone Bundle keeps stored account configuration and credentials.
- **Headless Browser by default.** The umbrella inserts `botharness-browser` with `headless: true` so fresh installs work on windowless servers as well as desktops; a Host that needs the visible window (one-time Human login) overrides it in a later Patch layer or Settings, which replace the row's whole config object.
- **Installing needs no build approval.** pnpm refuses unapproved install scripts, so no runtime dependency of the product may carry one. `agent-browser` (the Browser trial driver) has a postinstall script; it is an optional peer of Browser rather than a dependency, so a fresh Profile installs `deepseekbot` in one step. Selecting the trial driver requires adding `agent-browser@0.38.2` to that Profile. Packaged Profiles still carry the root `allowBuilds` adjudication; explicit Profile entries keep precedence. The release gate `scripts/e2e-fresh-profile-install.mjs` enforces this on every supported DSH release.
- **Supported DSH follows the bundled Computer runtime.** `@deepseek-ai/dsh-computer-use` is published per DSH release and its peers accept only that release, so DSH refuses a first install of the product on any other version. The product therefore supports exactly `0.2.0-rc.2` (`engines.dsh` and a `@deepseek-ai/dsh` peer, so DSH names `deepseekbot` when it refuses). Moving to a new DSH release moves the Computer pin, the repository pin and this range together. The separately versioned IM Provider keeps its minimum-only range.
- **Workers and CLIs stay out (maintainer-confirmed).** `market`, `links`, `ingest` (Cloudflare Workers) and `links-cli` (a CLI) carry no `dsh.bundle`/`dsh.client` manifest, so they cannot be Profile composition; they remain separate deployables. Community policy/probe stay operator concerns, out of the default product.

## Considered Options

- **Per-profile hand assembly (status quo):** rejected. It is exactly the failure the issue reports — full functionality required manual links and patch entries after install.
- **Top-level Bundles alongside the umbrella:** rejected. Promoting a member the umbrella patch already inserts fails boot with a duplicate loader entry.
- **Bundling Workers/CLI into the DSH product:** rejected. Without a Bundle manifest they are not Profile composition; shipping them inside the npm tarball would not make them load and would confuse the install unit.

## Consequences

- Fresh installs present Browser, Computer and IM with zero extra installs; IM requires user-supplied app credentials (no silent unauthenticated connections) and per-Bot Access gating is unchanged.
- Any new DSH runtime Plugin joins the umbrella patch, the release package set, and the composition verifier together — one slice, not a layered rollout.
- Changing product inputs still requires re-qualification per ADR-0127.
