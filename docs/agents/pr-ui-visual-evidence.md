# UI/UX PR visual evidence

Use this guide when a PR changes a rendered screen or user interaction: layout, styling, visible copy, navigation, forms, feedback states, or responsive behavior. The PR description keeps the headings from `visual-pr`; put this evidence inside its **Change outline**, next to the relevant structural view.

## Capture

1. Run the base revision and the PR revision through the real UI. Capture the baseline before editing when possible; otherwise use a separate base checkout. Take a **Before** and **After** screenshot for each materially changed view or interaction state. Include each viewport whose behavior changes.
2. Match viewport dimensions, theme, locale, test data, and UI state across each pair. Use representative data and remove secrets or personal information before publishing. For a new screen with no direct predecessor, show the prior entry point or absence state as **Before** and label it clearly.
3. Check the images side by side. They should show the actual change without relying on a mockup or a code diff. For motion or a multi-step interaction, capture the key states and add a short recording or exact reproduction steps.

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
