# UI/UX PR visual evidence

Use this guide when a PR changes a rendered screen or user interaction: layout, styling, visible copy, navigation, forms, feedback states, or responsive behavior. The PR description keeps the headings from `visual-pr`; put this evidence inside its **Change outline**, next to the relevant structural view.

## Capture

Keep local originals, redacted copies and their source/build records according to
[local QA evidence and release archives](qa-evidence.md). Local inspection paths supplement the
public, commit-pinned evidence required below.

1. Run the base revision and the PR revision through the real UI. Capture the baseline before editing when possible; otherwise use a separate base checkout. Take a **Before** and **After** screenshot for each materially changed view or interaction state. Include each viewport whose behavior changes.
2. Match viewport dimensions, theme, locale, test data, and UI state across each pair. Use representative data and remove secrets or personal information before publishing. For a new screen with no direct predecessor, show the prior entry point or absence state as **Before** and label it clearly.
3. Check the images side by side. They should show the actual change without relying on a mockup or a code diff. For motion or a multi-step interaction, capture the key states and add a short recording or exact reproduction steps.

## Mobile: Web preview first, native evidence follows

For Expo mobile UI changes, publish an **Expo Web layout preview** in the PR first when the affected screen has a working Web path. Follow with screenshots from the affected native platforms through [shared device QA](device-qa.md). Opening a PR and getting layout feedback need not wait for a device slot.

1. **Initial layout review.** Run real Expo Web exports of the base and PR revisions in a phone-sized viewport. Match the capture conditions above and include neighboring controls so alignment can be judged. Label every pair **Expo Web layout preview** and record the observed viewport, locale, theme and source revision. If Web needs compatibility adapters, use the same adapters in both exports and name them in the capture record. Do not silently replace native components or hide errors to make the preview look complete. If the screen has no usable Web path, record that blocker and proceed to the native lane.
2. **Native follow-up.** Supplement the preview with comparable before/after screenshots from a physical iPhone and/or Android phone for every affected platform. Simulator/emulator images can land earlier, but do not replace the pending physical-device captures. Label the actual environment and build revision, and run the native interaction checks required by the feature and mobile design rules. Add native images to the PR's Change outline, or a linked follow-up comment if it has already merged, and retain the Web preview's provenance.
3. **Keep pending work visible.** Until native results arrive, list each missing platform/state, the concrete blocker, the shared-QA queue or tracking issue, and the steps to reproduce. Report Web layout, native simulation, physical-device checks and Human acceptance separately. Web evidence does not satisfy or remove the native/Human QA gates in `apps/mobile/AGENTS.md` and `apps/mobile/DESIGN.md`. If the Human explicitly directs an earlier merge, carry the pending native work into a linked issue and queue entry instead of marking it verified or dropping it.

Use these labels consistently:

| Capture                          | What it can establish                                           |
| -------------------------------- | --------------------------------------------------------------- |
| Expo Web layout preview          | Browser-rendered layout, copy and implemented Web interactions  |
| iOS Simulator / Android emulator | The actual native build and controls on that simulator/emulator |
| Physical iPhone / Android phone  | The tested native behavior on the named device environment      |

An iPhone-sized viewport, browser user agent, iOS-like styling or Material icons do **not** turn Expo Web into an iOS or Android native simulation. Web cannot render SwiftUI or Jetpack Compose controls. In particular, native menus, typography/text scaling, keyboard behavior, accessibility services and persistence must be qualified in their own native environments. The iOS Simulator runs on macOS; Windows agents can prepare the Web preview and submit iOS checks to the Mac lane.

## Put the evidence in the PR

Place each pair directly in **Change outline**, with a short heading that names the view or interaction and viewport:

```markdown
### Channel composer — 390 × 844, attachment selected

**Before** — The attachment preview covered the send control.

<img alt="Before: Channel composer with attachment selected" src="https://github.com/BotHarness/DeepSeekBot/raw/<sha>/.github/pr-screenshots/<slug>/before.png" width="900">

**After** — The preview and send control are both visible.

<img alt="After: Channel composer with attachment selected" src="https://github.com/BotHarness/DeepSeekBot/raw/<sha>/.github/pr-screenshots/<slug>/after.png" width="900">
```

Use image URLs that render for a reviewer in GitHub; local file paths are not PR evidence. Keep the images visible in the body, with a short caption pointing to the change. If capture is impossible, state the concrete blocker and a runnable review path in **Change outline**. The section is complete when every affected view or state has a comparable pair, or a clearly explained capture blocker, and the published images render in the PR.

### Image reference format

Commit the images under `.github/pr-screenshots/<slug>/` on the PR branch and reference each one with exactly this form:

```html
<img
  alt="…"
  src="https://github.com/BotHarness/DeepSeekBot/raw/<12-char-sha>/.github/pr-screenshots/<slug>/<file>.png"
  width="900"
/>
```

- **Keep every image URL at 150 characters or fewer.** When a body or comment is written through the GitHub MCP tools (`create_pull_request`, `update_pull_request`, `add_issue_comment`, `update_issue_comment`), longer URLs come back wrapped in backticks (``src="`https://…`"``), and GitHub then shows the tag as text instead of the image. In #2402, URLs of 150–151 characters survived and URLs of 162 characters or more were wrapped every time, whatever the host or position in the body.
- To stay under the limit, pin a 12-character commit SHA (`git rev-parse --short=12 HEAD`) rather than the full 40, and keep `<slug>` and file names short (`2402-pair/en-light.png`, not `2402-pairing-guide/2402-pairing-guide-en-light.png`). Check lengths before posting, for example `echo -n "<url>" | wc -c`.
- Pin a commit SHA that contains the file, never a branch name, so the image does not change or break when the branch moves.
- Use the `https://github.com/<owner>/<repo>/raw/<sha>/…` path. Do not use `raw.githubusercontent.com` (its URLs are longer), `/blob/<sha>/…?raw=true`, Markdown `![alt](url)` syntax, or a query string. Put each `<img>` on its own line with a blank line before and after it.
- After every write, read the body or comment back (`pull_request_read` `get`, `issue_read` `get_comments`, or `gh pr view --json body`) and confirm every `src="…"` is a bare URL with no backticks. Spot-check that one URL returns `200 image/png`, for example `curl -sIL -o /dev/null -w '%{http_code} %{content_type}' <url>`. A PR with broken images is not ready for review.
