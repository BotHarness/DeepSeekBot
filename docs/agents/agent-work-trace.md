# Coding-agent issue trace

Use this workflow for every coding-agent task that implements a GitHub issue or opens a PR in `BotHarness/BotHarness`. It makes the _task_ traceable even when every commit and PR uses the same Human GitHub account. A Codex task (or another runner's task) is not a DSH Session.

## Identity and authority

- Keep the real Git author and committer. Agent identity belongs in issue comments, commit trailers, and PR descriptions, not a spoofed Git account.
- `agent:active` is a filter meaning at least one coding-agent task is working on the issue. It is not a lock, an assignee, or proof of which task owns the work. The claim and outcome comments are the task-level record. Existing readiness, milestone, area, feature, and scope labels keep their own meanings.
- A task reference has the shape `<runner>/<host>/<stable-task-id>`, for example `codex/local/01a0c04d-aa49-7f73-a49d-d5def79a86cc`. Codex uses `CODEX_THREAD_ID` (or `CODEX_SESSION_ID` when the former is unavailable). Other runners use their platform's durable task/run ID. Record the host only to disambiguate IDs; do not publish machine names or absolute local paths. If the runner exposes no stable reference, obtain one before claiming rather than inventing an untraceable identity.

## Claim before implementation

1. If a planned PR has no issue, create a focused issue first. Read the issue, its latest claim/outcome comments, and open PRs. For a Wayfinder ticket, keep its existing assignee-based claim too; the task trace supplements it. If another task is active in the same scope, coordinate or split the work before editing.
2. Choose an issue-specific branch/worktree. Add a claim comment to **each** issue this task will implement, then add `agent:active`. Do this when substantive work starts, not during read-only triage.
3. Use this public-safe shape; the branch name is enough to identify the worktree:

   ```markdown
   ### Agent work claim

   - Agent: Codex
   - Task: `codex/local/<CODEX_THREAD_ID>` (not a DSH Session)
   - Issue scope: <bounded slice>
   - Branch: `codex/<issue>-<short-name>`
   - Started: <YYYY-MM-DD HH:MM UTC>
   - State: active
   ```

One issue may have several independent claims, and one task may claim several issues. Each task leaves its own comment; the label stays present while any claim remains active. Do not silently replace another task's claim.

## Carry the trace through Git and PRs

Give each issue-backed commit a normal result-focused subject and these body trailers:

```text
Issue: #196
Agent-Task: codex/local/<CODEX_THREAD_ID>
```

In the PR description, link the issue, the claim comment, and the same task reference. When the PR delivers the issue's feature or fixes its bug, write `Closes #196` as plain text (not inside a Markdown link, which GitHub ignores) so merging closes the issue. Do not keep the issue open for a release or for pending device/Human QA; move remaining QA to its own issue. Use `Refs #196` only for a slice that leaves part of the issue's scope unbuilt. GitHub acts on `Closes #196` only when the PR merges into `main`: once a stacked PR's parent has merged into `main`, retarget the stacked PR to `main` before merging it, or close the issue by hand once its work reaches `main`. If several tasks contributed, list each task reference and its scope. Preserve the reference in a squash-merge message when practical, but treat the issue and PR as the durable trail if GitHub rewrites the commit message.

## Finish, hand off, or recover

- After merge, pause, or handoff, add an outcome comment to every claimed issue: task reference, state (`completed`, `paused`, or `handed-off`), PR/commit link when present, and any remaining scope. Remove `agent:active` only when no other claim remains active; closing an issue does not itself identify the task.
- A later task checks the existing task's status and PR before taking over. If the prior claim is stale or its task is unavailable, state the evidence and superseding task reference in a new comment; retain the old comment as history. Never infer abandonment from elapsed time alone.
- Keep issue/PR text public-safe: no tokens, credentials, local paths, private prompts, raw logs, or automatic conversation share links. An opaque task ID is sufficient; share a conversation only after the Human explicitly approves it.

Completion is observable when an issue shows the active claim (or its outcome), its PR names the same task and issue, and `agent:active` reflects whether work is still underway.
