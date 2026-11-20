# Worktree discipline

The main checkout is shared by many agents and the Human. Never work in it directly: no edits, no commits, no stash entries, no experiments, no scratch directories. It stays on `main`, clean, and only fast-forwards. Every task gets its own worktree and branch.

## One task, one worktree and branch

1. Follow [the coding-agent issue trace](agent-work-trace.md): claim the issue, then choose an issue-specific branch and worktree. Non-issue work (spikes, chores, cleanups) still gets a short-lived branch named after its purpose.
2. Create the worktree with `git worktree add` (or the runner's worktree tool) and do all editing, testing, committing, and pushing there. The main checkout is never the current working directory of a task.
3. Push the branch and open the PR from the worktree. After merge or abandonment, remove the worktree with `git worktree remove` and delete the merged branch. Never pass `--force` to remove a worktree with uncommitted changes: finish, commit, or hand the work over instead of discarding it.
4. Do not use the main checkout's stash as storage. A half-finished state belongs on a `wip/` branch, not in `git stash`.

## Budgets and shared state

- Keep at most 10 active linked worktrees on a machine. Before creating a new one past the budget, remove a merged or abandoned worktree first.
- Run `git worktree prune` when a worktree directory was deleted outside Git, so stale registrations do not accumulate.
- Scratch output goes under the gitignored scratch dirs (`.tmp/`, `output/`); never commit scratch, and do not invent new top-level scratch directories. Node scripts live in `scripts/` as `.mjs` (see `AGENTS.md` Conventions); the lint gate rejects `.ps1`/`.cmd`/`.bat`.
- When a shared checkout has grown stale registrations, bulk removals only delete clean worktrees; anything dirty is reported back to its owner instead of being forced.
