# README visual evidence

The product captures in this directory were taken on macOS on 2026-10-01 in the
Mac native Chrome browser (a task-owned incognito window) for Groups, and the
Mac Codex in-app browser for Memory, against the isolated Web Profile launched from
BotHarness main `f0f34fc5` and the pinned DSH `0.2.0-rc.1` CLI. The Profile was
separate from the user's ordinary DSH data. Mira, Theo, Nova, Alex, and the
Observatory exhibit are fictional demo identities and content.

| Asset                     | What it shows                                                                                                                                                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `memory-evolution.jpg`    | The actual Memory evolution graph with a merged branch, commit history, an uncommitted file, and the selected commit's line diff. Fixture files and ordinary Git commits were created in the Bot's isolated Memory Repository, then read through the production Host/Client seam. |
| `group-invite.jpg`        | The actual Group invitation dialog with Nova selected. Completing the invitation added Nova to the Group without a model wake.                                                                                                                                                    |
| `group-collaboration.jpg` | Actual model-generated replies committed to the local Group by three distinct PersonaBots. The Human's mentions used canonical Channel commands; Bot authors and replies were not injected or drawn into the UI.                                                                  |

The README additionally reuses
[`../pr/611-browser-profile-names/ui-completed.jpg`](../pr/611-browser-profile-names/ui-completed.jpg)
from merged [PR #615](https://github.com/BotHarness/BotHarness/pull/615). It shows
a named browser profile, live test-page preview, and Human controls; its caption
does not claim a button click or external send.

Existing Memory evidence from PRs #445 and #469 informed the capture plan;
Group invitation evidence from PR #391 was inspected before recapture. The new shots
avoid the older QA timestamps and use one coherent fictional team. No real IM
message was sent for this README update.

The Memory image is a front-facing 1000 × 530 viewport crop containing the actual
diff, graph, and history. [`memory-evolution-full.jpg`](memory-evolution-full.jpg)
is the unmodified 1280 × 800 browser capture. Only the viewport was cropped; no
perspective effect, generated content, or text replacement was applied. Both
were reopened from disk in the Mac browser and checked at README display width.

`readme-before.jpg` and `readme-after.jpg` compare the Chinese README at
1280 × 720 in the same local GitHub-flavoured Markdown renderer on the Mac
in-app browser. `readme-memory-after.jpg` shows the Memory section at its
actual README width. These are documentation render checks, not GitHub-page
captures or generated application mockups.

`auto-allow-before.jpg` and `auto-allow-after.jpg` compare the Computer/Browser
README table at 1280 × 720 using the same Mac browser and local Markdown
renderer. The baseline is merged main `bf7ce448`; the correction explicitly
conditions Session approval on Auto-allow being off. Runtime settings were not
changed for this documentation correction.

`hero.webp` is the Human-supplied concept illustration: a Human collaborates with
three bots in distinct roles. It was generated artwork, not a DSH capture, and
both READMEs label it explicitly before the real product screenshots. The original
2048 × 768 PNG is retained locally; only the WebP is shipped in the repository.
The conversion used `cwebp -q 90 -m 6 -sharp_yuv -af -metadata none`, with no
resizing or cropping: 2,242,152 bytes became 304,460 bytes (86.42% smaller).
Quality 85, 90, and 95 sizes were compared; quality 90 was visually checked
against the original PNG and preserved the visible linework and detail.

`hero-before-zh.jpg` / `hero-after-zh.jpg` and `hero-before-en.jpg` /
`hero-after-en.jpg` compare the two README introductions at 1280 × 960.
`hero-before-mobile.jpg` / `hero-after-mobile.jpg` compare the Chinese introduction
at 390 × 844; the English mobile layout was also checked. These were rendered on
macOS with the installed Google Chrome in headless mode, using a separate
empty temporary profile and the same local GitHub-flavoured Markdown renderer.
The baseline is main `0ada01e2`; these are local documentation render checks,
not screenshots of a GitHub page or the running product.

## v3 product captures (DeepSeekBot 1.4.1 READMEs)

`v3/zh/` and `v3/en/` replace the v2 shots in `README.md`, `README.en.md` and the npm
README (`packages/deepseekbot/README.md`). The v2 files stay in place. They were captured on
2026-10-20 in a Linux cloud container, against BotHarness main `b39972c9` and the pinned DSH
`0.2.1-rc.2` CLI. Each language ran in its own fresh isolated Host launched with
`node scripts/dev-instance.mjs --home <temporary DSH_HOME> --port <n>`; the Web Client was
driven with Playwright (Chromium 1194, headless) at 1440 × 900 and device scale factor 2, so
every file is 2880 × 1800. The browser locale was `zh-CN` or `en-US`, the time zone
`Asia/Shanghai`, and the theme light, except `hero-dark.jpg`, which is the same view with the
dark color scheme. PNG captures were saved as JPEG (quality 82, progressive, no metadata);
nothing was retouched, cropped or generated.

Bots replied through the AX default model, `opencode-go/deepseek-v4.1-flash`, the newest
DeepSeek model in the pinned catalog. Bot messages are real model replies committed to the
Channel. Nothing was injected into the UI.

The data is fictional. The demo team (Mira, Theo, Nova, Juniper, Kai) and the
Observatory Studio Group (天文台工作室) were created with the `deepseekbot` CLI
(`create`, `group-create`). The DMs used `deepseekbot send`. The Group message and its three
@mentions were typed in the Group composer. Mira's Memory Repository holds fixture files and
ordinary Git commits, made before the DM: visitor feedback notes, a spring exhibit plan and a
merged `research/kids` branch. In the Chinese capture, the uncommitted change to
`projects/spring-exhibit.md` was made by Mira herself during the Group reply. Kai made the
weekly schedule from the DM request. Tob answered the Home starter question. The Bot
Marketplace showed four `sample-bots/*` listings served by a loopback stub through the Host's
`marketplaceUrl` setting, because the capture container could not reach the real Marketplace.
The wallpapers are procedurally drawn images (gradients and hills) imported through the
Appearance page. The capture skipped the onboarding tutorial and removed Tob's Window
Companion from the view, as a Human can. No real IM message was sent, and no credential, token, local path or personal
data is visible.

| Asset             | What it shows                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `hero.jpg`        | Bot mode with the control rail and channel list, Mira's DM and her Memory evolution graph.         |
| `hero-dark.jpg`   | The same view in dark mode; GitHub shows it to readers who use a dark theme.                       |
| `group.jpg`       | Observatory Studio: three @mentioned Bots reply in turn, with the Members panel.                   |
| `schedules.jpg`   | Kai's DM after he created a weekly schedule, with the Schedules panel.                             |
| `marketplace.jpg` | The Bot Marketplace with topic filters, pixel banners and Install buttons (sample data).           |
| `home.jpg`        | Home (token usage, Bot activity) docked beside Tob's DM answering "How are my Bots doing?".        |
| `appearance.jpg`  | Bot settings → Appearance with Mist Purple, a three-item wallpaper library and see-through panels. |
