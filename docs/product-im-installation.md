# Packaged product with IM

The repository is still a source preview. The commands below build and test real
npm tarballs locally; they do not publish packages or claim that a public product
release exists. See [ADR-0127](adr/0127-product-artifacts-compose-an-independently-versioned-im-provider.md)
for the distribution decision and [#823](https://github.com/BotHarness/BotHarness/issues/823)
for the initial Lark qualification and Human QA evidence. [#868](https://github.com/BotHarness/BotHarness/issues/868) extends the independently pinned product Provider to the accepted Slack artifact `4.32.0-botharness.3`; this does not publish a registry release. [#878](https://github.com/BotHarness/BotHarness/issues/878) selects locally qualified `4.32.0-botharness.4` with real paired-owner WeChat receive/model/reply verified after installation; Human QA approved this first slice; registry publication remains separate.

## What the product installs

One `deepseekbot` product Bundle composes Core, Client and a pinned,
independently versioned `@botharness/im-provider`. The Provider is maintained from
[dsh-im](https://github.com/xmanrui/dsh-im) and ships its upstream license and
provenance. Users of the qualified product do not separately install a Git fork,
Lark SDK, or Human `lark-cli`. Credentials and connections remain with the Provider.

Installation leaves every account disconnected. In native Settings → IM bots,
choose the platform and connect its application identity. In the PersonaBot
Profile, bind that identity and explicitly authorize a saved test group. External
identities and Channel connectors have separate tables; merely installing or
binding an identity does not mirror messages into a local DM. The initial policy
is @mention-only to Bot Inbox. Test an actual @mention and compare the original
Lark topic reply with canonical source/Outbox details; Lark read indicators do not
prove Bot receipt. First-time guided setup is the separate #824 tracer. Personal WeChat uses QR pairing and an explicit paired-owner DM Grant instead; see the [WeChat connection guide](wechat-connection.md).

## Maintainer: build the distribution artifacts

Use Node ≥22 and the repository's pnpm version. The product targets DSH
`0.2.1-rc.2`; its Provider provenance records that qualified Host separately. The Provider revision below is
the one whose manifest, lockfile and runtime digests match `productImProvider` in
`scripts/product-artifacts.mjs`; when that record changes, update this revision with it.
Keep the Provider input outside the product workspace. Its immutable input
includes compiled runtime, source manifest and package lock; an unexpected input
fails before packing.

```bash
git clone https://github.com/DoodleBears/dsh-im.git /tmp/bh-im-source
git -C /tmp/bh-im-source checkout beaed4a6dabb583654d28fb09298716267039b4a
npm ci --prefix /tmp/bh-im-source --ignore-scripts --no-audit --no-fund
pnpm install --frozen-lockfile
pnpm build
node scripts/product-artifacts.mjs \
  --provider-source /tmp/bh-im-source \
  --output /tmp/bh-product-artifacts \
  --version 1.3.0-test.1155.1
```

Choose a fresh output directory. `artifacts.json` records the six actual tarballs,
exact versions, DSH revision and integrity. The test SemVer is for local
qualification only. Provider changes require their own version increment and
new behavioral qualification; do not silently replace the same published version.

## Verify an empty Profile

```bash
node scripts/dev-instance.mjs \
  --home /tmp/bh-product-qa \
  --port 32615 \
  --product-artifacts /tmp/bh-product-artifacts \
  --json
```

The helper installs an official fixed CLI in that task-owned home, verifies
tarball integrity and installed Provider runtime, and probes the authenticated
BotHarness API. Open its private login URL locally; never publish that URL or
raw credential logs. Plugins → deepseekbot must show the selected test version
and **six running components** (IM Provider, Core, Client, Browser, the
computer-use seam and Computer). Settings → IM bots must show the scoped
Provider version and **Updates with BotHarness**, with no connected accounts.

This is a real package install with local tarball substitutions for versions not
yet on npm. It uses no Provider Git dependency or local source link in the Profile.
After an independently authorized registry release, a normal native product
installation resolves those exact dependencies from npm without the local
substitution inventory. Registry publication is a separate release action.

## Restart, upgrade and conflicts

Stop only the PID returned by this task's helper. Restart with the same home and
artifact directory; verify the real model and source-bound receiver again. For a
representative upgrade, pack a new product test version into a new directory,
stop that Host and pass the new directory while retaining the home. The installer
preserves unrelated workspace/build settings, account state and canonical data.

If the Profile separately enables `@xmanrui/dsh-im` or `@botharness/im-provider`,
the helper refuses and names the offending Bundle. Stop its owning Host and
remove only that duplicate Bundle entry before retrying. Formerly separate
`@botharness/browser`, `@botharness/computer`, `@botharness/core` or
`@botharness/ui` entries instead migrate into the `deepseekbot` umbrella
automatically; the helper names them as it does so. Keep the stored
credentials, account settings and source/Outbox history.
An incompatible Provider replacement requires requalification, not a version
exemption or a second receiver. No restart/upgrade should backfill remote history
or blindly repeat an unknown send. Apply the existing database backup/forward
recovery rules before any retained Profile downgrade.

Operator preparation and explicit publication: [npm prerelease guide](npm-prerelease.md).

The product Provider pin is independent of the optional development Provider pin. Changing a development selection does not qualify or version a product artifact. This input preserves the accepted Slack public-channel contracts and adds the paired-owner WeChat DM candidate. #878 verifies retained pairing/authorization across installation restart and one fresh installed-artifact owner text/model/reply exchange. Human QA approved the first owner-text slice; broader live lifecycle qualification and registry publication remain separate.
