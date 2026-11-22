# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Ticket topology: hub + native sub-issues (used by `/to-tickets`)

A feature with many tickets gets one **hub** (orchestrator) issue and every slice
ticket hangs off it as a **GitHub native sub-issue** — not just a `Parent #n`
line in the body (the body line stays too, as fallback/readable context).

- **Hub**: label `scope:hub`, title names the feature/slice-group. A hub holds
  coordination (goal, ticket index, phase plan); it is not an implementation slice.
- **Attach**: after creating each child, attach it with the sub-issues endpoint
  (child identity is its numeric database id, not `#number`):
  `gh api --method POST repos/<owner>/<repo>/issues/<hub-number>/sub_issues -F sub_issue_id=<child-db-id>`,
  where `<child-db-id>` comes from `gh api repos/<owner>/<repo>/issues/<n> --jq .id`.
  List children with `gh api repos/<owner>/<repo>/issues/<hub-number>/sub_issues`.
- **Nesting**: a hub may itself be a sub-issue of a larger hub (epic → feature hub
  → slice). Nesting is how cross-linked tickets stay navigable.
- **Blocking** between siblings reuses the native dependency mechanism documented
  under "Wayfinding operations" (`dependencies/blocked_by`), with a
  `Blocked by: #<n>` body line as fallback where dependencies aren't available.

### Pre-flight: understand existing open issues before publishing

`/to-tickets` must not duplicate or orphan. Before creating anything:

1. List open issues in the feature area
   (`gh issue list --state open --label "feature:<x>"` and/or `--label "scope:hub"`).
2. Fetch each candidate hub's sub-issue tree
   (`gh api repos/<owner>/<repo>/issues/<n>/sub_issues`) plus `Blocked by` lines,
   so existing parents, children, and nesting (a parent that is itself
   someone's sub-issue) are understood.
3. Reuse/attach: if a hub or slice already exists, attach to it or update it
   instead of creating a duplicate. Only genuinely new slices become new issues.

## Project & Milestone

- **Project**: a hub and all its children go into the **same org ProjectV2**
  (the feature's project, e.g. `V1 · Memory`; list with
  `gh project list --owner BotHarness`). Add with
  `gh project item-add <project-number> --owner BotHarness --url <issue-url>`.
  Confirm the target project with the user at quiz time.
- **Milestone**: the GitHub **milestone** (`v1.0` / `v1.1` / `v2.0`) is the source
  of truth for the expected implementation phase
  (`gh issue edit <n> --milestone "<title>"`). Do **not** add the legacy
  capitalised `V1.0` / `V1.1` / `V2.0` labels to new tickets — they duplicate
  milestones and are kept only for old issues.

## Claim protocol: `in-progress` label (assignee is NOT the signal)

Several coding agents run in parallel sessions under the **same GitHub user**, so
`assignee` cannot tell sessions apart. The claim signal is:

- **Held** = the `in-progress` label is on the issue. An open,
  `ready-for-agent` issue **without** `in-progress` is takeable; with it, hands off.
- **Who** = a `Claim:` comment posted as the session's first write, e.g.
  `Claim: opencode/session-<id> — starting <ticket title>`. Read the latest
  `Claim:` comment to see which agent/session holds the ticket.
- Do **not** create per-session labels (`agent:foo`, `session:bar`, …) — they
  explode. One state label + one comment scales.
- On finish, remove `in-progress` when closing
  (`gh issue edit <n> --remove-label in-progress`, or close with it — closed
  means released either way) and leave a resolution comment.

`/implement` sessions follow the same protocol: claim first (label + comment),
then work.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.

## Tracer-bullet delivery

For a feature that crosses layers, deliver a sequence of **tracer bullets**: the smallest production-shaped end-to-end slice that reaches the owning Host module, durable authority, adapter/RPC, Client surface, and a Human-testable runtime path. Validate that slice before expanding the next one. This follows the [tracer-bullet practice](https://www.aihero.dev/tracer-bullets): build one narrow vertical path, test it immediately, get feedback, then extend it.

- Start from one observable user behavior, not a complete horizontal layer. Implement only the contracts and data needed to exercise that behavior through the real architecture.
- Keep authority boundaries real in the first slice. A demo path still uses the owning deep module, canonical persistence, trusted adapter context, and existing Host↔Client seam; it does not introduce a temporary second store or lifecycle.
- Include the smallest useful Host behavior and Client interaction together whenever the feature has both. A backend-only foundation or disconnected UI mock is preparatory work, not a completed tracer bullet.
- End each slice with focused automated coverage plus a runnable verification path. For in-harness UI, provide a state the Human can open, operate, and judge; capture evidence when the issue or PR requires it.
- Seek Human feedback after the first working slice before broadening sibling views, providers, variants, policies, or edge cases.
- Order issues and sub-issues by runnable vertical slices. Open research or grilling only when an unresolved decision blocks the next slice; defer speculative branches that would only create more unvalidated tickets.
- A slice is complete when one coherent behavior works end-to-end through production seams and its regression is observable automatically. Then start the next slice with a fresh, narrow scope.
