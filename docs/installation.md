# Install Tobs

Install the **Tobs** plugin in DeepSeek Harness (DSH), enable it and create your first PersonaBot. You install one product package; Core, Client and the qualified IM Provider arrive with it.

Install the stable npm package **`@botharness/tobs@1.5.1`**. Use **DSH `0.2.1-rc.3`**; the same released packages passed installation, Host startup, Bot/DM creation and restart persistence on **0.2.0-rc.2, 0.2.1-rc.2 and 0.2.1-rc.3**. Declared admission is `>=0.2.0-0`, not runtime qualification of every version. The screenshots below are historical UI records; follow the current text. Back up the Profile before upgrading; returning to an older binary may require the pre-upgrade backup.

New installations use `@botharness/tobs` and the `tobs` command. Existing `deepseekbot` users can keep `deepseekbot` and their original command; do not delete Profiles, pairings or chats. Both packages use the same product components.

## 1. Open Plugins

Start DSH and open its Web interface. If DSH is not installed yet, follow the [official DSH getting-started documentation](https://deepseek-harness.github.io/deepseek-harness/). Follow [API and Bot model setup](/docs/model-setup) to configure a provider first; after creating the Bot, choose its models under **Model** in the DM's Channel sidebar.

Click **Plugins (插件)** in the left sidebar, then **Add plugin (添加插件)**.

![DSH sidebar with the Plugins entry](/guides/install/01-dsh-entry-zh.webp)

## 2. Enter the public package name

Paste this exact value into **Package name or address (包名或地址)**:

```text
@botharness/tobs@1.5.1
```

Keep **npm official registry (npm 官方源)** as the installation source and click **Install (安装)**. Wait for the installation task to finish.

![Add plugin dialog with the npm package name filled in](/guides/install/02-install-source-zh.webp)

_This field imports the package source, not an uploaded file. Screenshots are historical UI references; use the exact package spec above, not the earlier version shown in a screenshot._

### New-release age policy and recovery

Do not replace the exact spec with `deepseekbot` or `deepseekbot@latest`. With pnpm 11.7 defaults, both selected 1.2.0 during 1.2.1's 24-hour release-age window, even though DSH's preview displayed 1.2.1. Core 1.2.0 requires DSH 0.2.0-rc.1 exactly; Core 1.2.1 declares `>=0.1.7-0`. These are different installed packages, not a remaining version ceiling in 1.2.1.

Retry using the exact spec above. For an existing Desktop Profile, fully quit Desktop before running `dsh plugin --profile desktop add @botharness/tobs@1.5.1`; restart afterwards and check the actual installed Product/Core versions. Preserve the Profile and its data; do not delete it to retry.

Explicit versions can record exact `minimumReleaseAgeExclude` entries under pnpm defaults. If strict policy prompts or refuses, obtain approval for only the verified package versions or wait for the policy window; do not globally disable supply-chain protection or use DSH version exemptions. These instructions do not claim native Windows Desktop verification or compatibility with every future DSH release.

## 3. Enable the installed plugin

The completed task shows **Installed (已安装)**, the package name and the installed version. Click **Enable now (立即启用)**. If you closed the task, return to Plugins and turn on **Enable @botharness/tobs (启用 @botharness/tobs)**.

![Actual successful installation showing version and Enable now](/guides/install/03-installed-zh.webp)

Once enabled, **Bot mode (Bot 模式)** appears in the sidebar. In the verified RC1 setup it loaded immediately. If your DSH reports that a restart is required, restart the same DSH Profile and reopen its Web page.

![Installed plugin enabled and Bot mode available in the sidebar](/guides/install/04-enabled-zh.webp)

## 4. Start with Home onboarding

Open **Bot mode**, configure a model in Home and send Tob an editable creation request. Follow the journey to create a real Bot and group, with existing management approvals, then learn to drag panel titles, resize panels and reopen them from the control rail. Finish by clicking the **Home title** to close Home and enter the original Tob DM.

New Bots no longer receive an automatic welcome message. Send your own greeting and check a real reply to verify model usability. DSH still manages credentials; npm installation does not provide them. See [API and Bot models](/docs/model-setup) and [Settings guide](/docs/settings) for appearance, concurrency, persona, attention, sidebar, and workspace authorization fields.

## 5. Connect a messaging app

The initial installation has no IM accounts connected. After the local DM works, follow [Connect a Bot to Lark / Feishu](/docs/lark-connection). App credentials, external identity binding and group authorization are separate steps; installing the plugin does not authorize external groups.

## Git

Bot mode needs Git 2.28 or newer on the computer that runs DSH, because each Bot's memory is a Git repository. When Git is missing or too old, Bot mode says so at the top of the roster and turns off creating and importing Bots until Git works.

The quickest fix is the **Install Git** button in that notice. It downloads a portable Git (about 65 MB) into the DeepSeek Harness data folder, checks it against a pinned checksum, and starts using it right away. It needs no admin rights and does not change the Git installed on your computer. DeepSeekBot downloads it from `media.botharness.ai` first and from GitHub if that fails. A usable system Git always takes priority, so installing Git yourself later replaces it on the next DeepSeek Harness start.

To install Git yourself instead:

- **macOS**: run `xcode-select --install` in Terminal and follow the prompt, or install Git with Homebrew (`brew install git`).
- **Windows**: install [Git for Windows](https://git-scm.com/download/win) with the default options.
- **Linux**: install the `git` package with your distribution's package manager, for example `sudo apt install git`. Ubuntu 20.04 ships Git 2.25; use the [git-core PPA](https://launchpad.net/~git-core/+archive/ubuntu/ppa) for a newer one.

After installing it yourself, restart DeepSeek Harness and click **Check again** in Bot mode.

The **Git** row in DeepSeekBot settings shows the Git version in use and whether it is your system Git or the Managed Git.

When you import a Bot from an SSH address such as `git@github.com:owner/repo.git` and the Host has no SSH key for it, DeepSeekBot retries once with the matching HTTPS address and tells you it switched. The Bot then syncs over HTTPS. Addresses with a custom SSH port are not converted.

## Other installation methods

The [official DSH packaging reference](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish) also supports CLI installation into a named Profile:

```bash
dsh plugin --profile <your-profile> add @botharness/tobs@1.5.1
```

Use the Profile you actually start. Enable the plugin in that Profile's Plugins page afterward.

To import the same precompiled archive, download the public npm tarball with `npm pack @botharness/tobs@1.5.1`, which saves `botharness-tobs-<version>.tgz` in the current directory. In the Web interface, enter its **absolute path on the machine running DSH** in Package name or address; a path on a different browser machine is not a Host path. With the CLI you can instead use `dsh plugin --profile <your-profile> add ./botharness-tobs-<version>.tgz` from the download directory.

## If installation does not finish

| What you see                              | Next check                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| deepseekbot is incompatible with this DSH | Use qualified DSH 0.2.0-rc.2, 0.2.1-rc.2 or 0.2.1-rc.3 and confirm the exact `@botharness/tobs@1.5.1` package.            |
| Package or version not found              | Check the exact package spelling and version, choose npm official registry and retry once registry metadata is available. |
| Installed but no Bot mode                 | Enable @botharness/tobs in the current Profile; follow any DSH restart notice, then reload the Web page.                  |
| Bot mode works but the Bot cannot reply   | Check the selected model and DSH credentials; installation and model access are separate.                                 |
| IM settings are empty                     | Add the app account through the connection guide; an empty account list is expected on first installation.                |

For source development rather than installation, see the [repository README](https://github.com/BotHarness/BotHarness#readme) and [local development guide](/dev/guides/client-bridge).
