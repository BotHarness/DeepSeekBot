# Install a fresh native Profile from source artifacts

Use this developer path when a reviewed source revision contains business CLI capabilities that have not reached the public npm package. It builds the full product with the existing artifact mechanism, then installs it into a new native DSH Profile. This is a candidate build, not a public npm release.

The qualified toolchain for this path is Node 24.21.0, pnpm 12.4.2 and DSH 0.2.0-rc.1. A declared compatibility range is not proof that another Host version works. Select an exact reviewed Git revision containing `scripts/install-source-profile.mjs`, and keep that revision with your artifact manifest and file digests.

## Build on the development machine

Start from a dedicated checkout. Do not update a checkout with another task's uncommitted work.

```bash
git clone https://github.com/BotHarness/DeepSeekBot.git botharness-source
cd botharness-source
git checkout <reviewed-source-sha>
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm build

git clone https://github.com/DoodleBears/dsh-im.git qualified-provider
git -C qualified-provider checkout 602baa37fa327f7069545aaadbbd34db8a8f4636
cd qualified-provider
npm ci --ignore-scripts
cd ..
node scripts/product-artifacts.mjs \
  --output .humanlayer/product-candidate \
  --provider-source qualified-provider \
  --version <explicit-candidate-semver>
```

`product-artifacts.mjs` checks the immutable Provider source, packages Core, Client, browser, computer, Provider, the per-platform `cloudflared` packages (it downloads the pinned release and checks its SHA-256; pass `--cloudflared-assets <dir>` to reuse a folder) and the application Bundle, and writes `artifacts.json` with package integrities. Use a fresh output directory. A plain `npm pack` of a workspace source directory does not replace this step. Recheck the pinned Provider revision in the selected source's `productImProvider` before building a different revision.

Keep the resulting archives and `artifacts.json` together. For a small VPS, transfer the precompiled result rather than building all workspace packages there. Record the archive SHA-256 before transfer and verify the same digest on the destination.

## Install on the destination

Use a dedicated runtime user and writable `DSH_HOME`. Parent directories must grant that user traversal; the current working directory must also be readable by it. Check for an existing home, Profile and service before choosing names. Install the pinned Node, pnpm and DSH CLI with the destination's actual OS instructions.

The destination needs these repository helpers together in one private installation-kit directory:

```text
install-source-profile.mjs
packaged-profile.mjs
product-artifacts.mjs
dev-im-provider.mjs
dev-package-manager.mjs
```

Their runtime dependencies are `yaml@2.9.1` and `semver@7.8.5`; install them in that kit, or run the helper from a prepared source checkout. Invoke it as the runtime user, with the pinned toolchain on PATH:

```bash
node <kit>/install-source-profile.mjs \
  --home <new-writable-dsh-home> \
  --profile tutorial-web \
  --artifacts <directory-containing-artifacts-json-and-archives> \
  --dsh <pinned-dsh-binary>
```

The helper validates artifact integrity, checks DSH and pnpm versions, lets native DSH create the custom Profile from its `web` default, applies the packaged Bundle dependencies and reviewed build policy, then verifies the installed packages and all six active product components. An existing Profile refuses without being overwritten. Inspect a failed partial installation before recovery; rerunning is not an update workflow.

Start that exact Profile using flags verified by its installed `dsh web --help`. Bind the Host to loopback, keep native Owner authentication, and verify a real model reply. Service management, Tailscale Serve, application authorization and binding are separate steps. A successful installer alone verifies none of them.

## Qualification evidence

Issue [#1438](https://github.com/BotHarness/DeepSeekBot/issues/1438) used this fresh-profile installer on an actual Ubuntu 26.04 VPS with 2 vCPU and 4 GB cloud memory, using DSH 0.2.0-rc.1 and source `73c75f86aa50767be34a5c8d2cadc17b6a3e8862`. Native loopback authentication, tailnet HTTPS, a real correlated local DM and a fresh DM after the task service restarted were verified. A later source update to `031a14db43af5b3bf52e76b01c30e27828e6e9c9` retained that Bot and produced a new correlated reply.

The separate QQ qualification subsequently correlated distinct requests before and after Host restart with handled Inbox Admissions and provider-accepted Outbox intents; the Human confirmed both matching replies in the original group. Public group images and video review remain pending. Follow the [VPS/QQ walkthrough](../vps-qq-tutorial.md), [reusable QQ QA clients](qq-test-clients.md) and [QQ connection guide](../qq-connection.md) for the full installation and acceptance boundaries.

![The actual tutorial Bot's model settings and its reply to the source-version marker](../assets/vps-source/01-real-dm-031a14db.png)

_Captured on 2026-10-11 at 17:55 UTC from the running source candidate `1.2.1-vps.20261012.sha031a14db`. The bottom request and matching reply are real model output; the larger welcome card above them is explicitly labeled preset product text. This image contains no authorization form or browser address bar._
