# UI/UX PR visual evidence

Use this guide when a PR changes a rendered screen or user interaction: layout, styling, visible copy, navigation, forms, feedback states, or responsive behavior. The PR description keeps the headings from `visual-pr`; put this evidence inside its **Change outline**, next to the relevant structural view.

## Capture

Keep local originals, redacted copies and their source/build records according to
[local QA evidence and release archives](qa-evidence.md). Local inspection paths supplement the
public, content-addressed R2 evidence required below. Local files are temporary staging,
not a permanent archive. Do not commit screenshots or recordings to any Git branch or Git LFS.

1. Run the base revision and the PR revision through the real UI. Capture the baseline before editing when possible; otherwise use a separate base checkout. Take a **Before** and **After** screenshot for each materially changed view or interaction state. Include each viewport whose behavior changes.
2. Match viewport dimensions, theme, locale, test data, and UI state across each pair. Use representative data and remove secrets or personal information before publishing. For a new screen with no direct predecessor, show the prior entry point or absence state as **Before** and label it clearly.
3. Check the images side by side. They should show the actual change without relying on a mockup or a code diff. For motion or a multi-step interaction, capture the key states and add a short recording or exact reproduction steps.

## Mobile: Web preview first, native evidence follows

For Expo mobile UI changes, publish an **Expo Web layout preview** in the PR first when the affected screen has a working Web path. Follow with screenshots from the affected native platforms through [shared device QA](device-qa.md). Opening a PR and getting layout feedback need not wait for a device slot.

1. **Initial layout review.** Run real Expo Web exports of the base and PR revisions in a phone-sized viewport. Match the capture conditions above and include neighboring controls so alignment can be judged. Label every pair **Expo Web layout preview** and record the observed viewport, locale, theme and source revision. Keep compatibility setup in the opt-in screenshot/test harness rather than adding Web-only app runtime branches, as required by `apps/mobile/AGENTS.md`. Use the same adapters in both exports and name them in the capture record. Do not silently replace native components or hide errors to make the preview look complete. If the screen has no usable Web path, record that blocker and proceed to the native lane.
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

<img alt="Before: Channel composer with attachment selected" src="https://media.botharness.ai/pr/<base-sha12>/<before-sha256>.png" width="900">

**After** — The preview and send control are both visible.

<img alt="After: Channel composer with attachment selected" src="https://media.botharness.ai/pr/<candidate-sha12>/<after-sha256>.png" width="900">
```

Use image URLs that render for a reviewer in GitHub; local file paths are not PR evidence. Keep the images visible in the body, with a short caption pointing to the change. If capture is impossible, state the concrete blocker and a runnable review path in **Change outline**. The section is complete when every affected view or state has a comparable pair, or a clearly explained capture blocker, and the published images render in the PR.

## Publish to Cloudflare R2

The existing Cloudflare account `332e72d480d7cb3e60ee671d3ca0cad0` owns bucket
`botharness-media`, served by `https://media.botharness.ai`. PR evidence uses only the `pr/`
prefix; do not change bucket access, lifecycle, domains or other prefixes (including `git/`).
The domain is public: upload only reviewed, redacted derivatives. Never upload raw captures,
credentials, pairing links, serials, private paths, account details, HARs or unreviewed logs.

1. Capture under the ignored `.humanlayer/tasks/<task>/` directory and freeze each image's
   actual source SHA, build identity and capture conditions. A before image uses the base
   source SHA, not the candidate SHA. Record a dirty-source diff when applicable; an upload
   receipt does not establish that a working tree was clean or that a check passed.
2. Inspect and redact the selected images or recordings. Publish each reviewed file:

   ```bash
   pnpm evidence:publish \
     --file .humanlayer/tasks/<task>/redacted/after.png \
     --source-sha <full-tested-source-sha> --reviewed --remove-local
   ```

   The command uses the workspace's installed Wrangler and its machine-local authentication.
   Run `pnpm install` if Wrangler is absent. If access is missing, stop and configure a private,
   least-privilege credential; never put credentials in argv, the repository or the PR. There
   is no fallback to Git, a Git evidence branch, LFS, a local-only link or an expiring signed URL.

   In a cloud agent session (Claude Code on the web and similar), Wrangler reads
   `CLOUDFLARE_API_TOKEN` from the environment; the account ID is fixed in `scripts/pr-evidence.mjs`.
   Ask the Human to create a custom Cloudflare API token with **Account → Workers R2 Storage →
   Edit** on account `332e72d480d7cb3e60ee671d3ca0cad0`, with an expiry, and to add it as an
   environment variable of the cloud environment. `wrangler r2 object put --remote` uses this
   account-level permission, so the token also reaches the account's other R2 buckets; keep its
   expiry short. Never ask for the token in chat.
   Only a new session picks it up. Before capturing, confirm it is active without putting it in an
   argument list; the command exits non-zero for an invalid or inactive token:

   ```bash
   printf 'header = "Authorization: Bearer %s"\n' "$CLOUDFLARE_API_TOKEN" |
     curl -fsS -K - https://api.cloudflare.com/client/v4/user/tokens/verify |
     grep -q '"status":"active"'
   ```

3. The uploader sets the media type and immutable cache metadata, then downloads the public
   URL and checks its media type, byte count and SHA-256. Only after success does it write
   `<file>.r2.json` and honor `--remove-local`. An upload/readback failure retains the local
   file. Keep the small receipt and link it from the task's provenance index.
4. Copy the returned URL verbatim into the PR and read the body back. Confirm every image
   renders in GitHub; a successful R2 upload alone is not rendering or runtime acceptance.
   Recordings use the same uploader and a short caption/link beside the image pair.

Supported uploads are PNG, JPEG, WebP, GIF, MP4, WebM, MOV, PDF and reviewed HTML, one file at a
time, at most 100 MiB each. Trim recordings rather than publishing whole sessions. HTML explainers
are forced downloads (`application/octet-stream` plus `Content-Disposition: attachment`), not
executable pages on the shared media origin; public readback must verify both headers. Link the
download beside its exact source/head SHA and open the downloaded standalone file locally.
Other review artifacts must also use R2 and the same privacy review, immutable key and public
readback. SVG and unreviewed traces/logs are refused; report a publishing blocker instead of
committing them to Git.

### Image reference format

Reference the exact URL returned by the uploader:

```html
<img alt="…" src="https://media.botharness.ai/pr/<source-sha12>/<content-sha256>.png" width="900" />
```

- **Keep every image URL at 150 characters or fewer.** When a body or comment is written through the GitHub MCP tools (`create_pull_request`, `update_pull_request`, `add_issue_comment`, `update_issue_comment`), longer URLs come back wrapped in backticks (``src="`https://…`"``), and GitHub then shows the tag as text instead of the image. In #2402, URLs of 150–151 characters survived and URLs of 162 characters or more were wrapped every time, whatever the host or position in the body.
- The key is `pr/<source-sha12>/<full-content-sha256>.<extension>`. A new image gets a new key; never overwrite a key with different bytes. Keep the full source SHA in the receipt/index. Source identity, content identity and native/build acceptance are separate facts.
- Use the public HTTPS R2 custom-domain URL, without a query string or expiry. Do not use GitHub raw/blob URLs, branch URLs, local paths or Markdown `![alt](url)` syntax for new PR images. Put each `<img>` on its own line with a blank line before and after it.
- Some cloud agent environments filter image embeds in every GitHub write, whichever client makes it. In #3318 the GitHub MCP tools and `gh api` both stored `<img>` as `` `&lt;img …&gt;` `` and stripped the `!` from `![alt](url)`, even with URLs well under 150 characters. When the read-back shows that, replace each image with a plain link, `[Before: …](https://media.botharness.ai/pr/…)`, say in the body that inline images were blocked, and tell the Human: adding a `!` before each link on GitHub embeds it. Do not try other ways around the filter.
- After every write, read the body or comment back (`pull_request_read` `get`, `issue_read` `get_comments`, or `gh pr view --json body`) and confirm every `src="…"` is a bare URL with no backticks. Spot-check that one URL returns `200 image/png`, for example `curl -sIL -o /dev/null -w '%{http_code} %{content_type}' <url>`. A PR with broken images is not ready for review.

## Retention, legacy files and enforcement

- Git stores product assets, maintained documentation illustrations, necessary test fixtures
  and small textual reports/manifests. PR screenshots, recordings, traces, archives and HTML
  review artifacts are not source assets; do not rename or relocate them to evade this boundary.
- `.github/pr-screenshots/`, `.github/pr-assets/`, `docs/assets/pr/`, `docs/evidence/`, `docs/qa/`,
  `docs/research/evidence/`
  and `.humanlayer/` are ignored staging/legacy paths. `pnpm evidence:check` rejects new or
  modified media artifacts there, including force-added files. CI compares the complete PR
  against its base so committing a file does not bypass the check. Legacy unchanged files and
  deletions are allowed; small tracked textual reports and test inputs remain usable.
- Remove published staging derivatives after verified readback. At merge/close, remove this
  task's disposable originals and recordings after checking process ownership and pending
  QA/release holds. Keep URLs, hashes and provenance, not duplicate local media archives.
- The Human authorized retiring evidence from already-merged PRs without migrating old image
  links. Retirement must still exclude active PR/shared-QA resources, product assets and test
  fixtures. Do not delete another task's unresolved evidence or blanket-delete `.humanlayer/`.
- Removing tracked files shrinks future checkouts, not existing Git history. History rewriting,
  force-pushing and cross-worktree cleanup are separate coordinated operations, never an
  implicit part of publishing evidence. A separate Git evidence branch is not a size fix.

### Performance boundary

This tooling adds no Host, Client or mobile runtime dependency or background process. The CI
guard reads changed path metadata, not media blobs, and fetches only its comparison commit.
Upload work is explicit and sequential, bounded to one 100 MiB file; public readback hashes a
stream rather than buffering a second copy. Tests guard these limits, failure retention and
delete-after-verification ordering. No application performance gain is claimed from this
repository-storage change.
