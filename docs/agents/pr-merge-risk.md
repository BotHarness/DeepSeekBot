# PR merge-risk classification

Classify every PR against the complete diff before publishing or updating its description. Put the result in one bullet under `visual-pr`'s **Special things to note** (one of its 1–3 bullets). Reassess when the PR scope changes.

## Reversibility: one-way or two-way door

- **Two-way door:** reverting the change restores the previous behavior without data repair, coordinated rollout, or lasting external effects. Name the practical revert path.
- **One-way door:** reversal needs an expensive migration, data restoration, external coordination, or forward recovery. Destructive schema/data changes and externally relied-on contracts are common examples. State the recovery path; if it is unknown, classify the door as one-way.

## Blast radius

Name the affected users, systems, and data, then the worst plausible failure. Label the radius **small**, **medium**, or **large** based on both reach and consequence. A change to shared durable state, permissions, a critical path, or several services can have a large radius even when the diff is small. Reversibility and blast radius are independent: an easy-to-revert change can still interrupt many users.

## Review focus

For a one-way door, direct reviewers to the migration and recovery plan. For a large blast radius, direct them to the affected boundaries, failure modes, and verification evidence. Give two-way, small-radius changes proportionate review. Make the classification specific enough that a reviewer can decide where to spend time.

Example PR bullet:

```markdown
- Merge risk: **two-way door** — revert this documentation commit; **small blast radius** — only future PR descriptions change, with no runtime impact. Review focus: fit with the current visual-pr template.
```

## Issue closing and stacked PRs

When a PR delivers an issue's feature or fixes its bug, write `Closes #N` as plain text in the PR body (not inside a Markdown link, which GitHub does not act on) so the issue closes on merge. Do not keep the issue open for a release or for pending device/Human QA; track remaining QA in its own issue. Use `Refs #N` only when part of the issue's scope is still unbuilt. GitHub acts on `Closes #N` only when the PR merges into `main`: once a stacked PR's parent has merged into `main`, retarget the stacked PR to `main` before merging it, or close the issue by hand once its work reaches `main`.
