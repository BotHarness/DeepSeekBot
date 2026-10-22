# Verification resource cleanup (AX)

This procedure applies to task-owned verification Hosts, Client/Metro watchers, previews,
browser drivers, tunnels and temporary worktrees. Resource cleanup is part of task completion,
including after a failed verification, timeout or interrupted run. Shared device resources remain
under the [device QA queue](device-qa.md), including its Windows lane.

## Record ownership before launch

Keep a private task-local resource record, for example under `.humanlayer/tasks/`, with the task
reference, purpose, source worktree and SHA, Profile/home, launcher and child PIDs, process start
time, listening ports, log/evidence paths and intended cleanup action. Record each resource as it
starts so a partial launch failure still has an exit path. Launcher output and `instance.json`
contain login URLs; keep them private and omit credentials from handoffs.

Identify current shared E2E/QA services and device leases before launching. Reuse this task's
healthy instance when its source and configuration match the next check. A second instance needs
a distinct verification purpose and its own record. Closing a tab, exiting the launcher or
finishing a PR does not establish that a detached Host has exited.

## Finish the run

1. **Preserve evidence.** Save screenshots, console output, failed attempts and verification
   results outside disposable directories. Keep source edits, untracked work, Git history and
   any Profile state needed for reproduction. A failure keeps its evidence before a retry.
2. **Recheck ownership.** Match the current PID and start time, command, worktree, Profile and
   port to the launch record; a PID alone may have been reused. Inspect clients, child processes,
   open files and shared consumers. An old process or a quiet port alone does not prove that
   another task's environment is abandoned. Preserve resources with unresolved ownership or use.
3. **Stop owned services.** Use the owner's stop path or a normal termination signal for the
   verified process. Stop task-owned watchers, preview/browser drivers and tunnels too; check
   children individually rather than terminating a shared process group. Wait for exit. On a
   timeout, preserve the Profile and logs and report cleanup as incomplete; forced termination
   requires a separate ownership and data-loss assessment. Avoid global process-name kills.
4. **Verify release.** Recheck that each stopped process has exited, its owned children have
   exited and its ports are free. Confirm protected E2E/QA listeners and device state remain as
   recorded. A successful signal command alone is not completion evidence.
5. **Remove disposable files last.** Only after the processes exit, check inbound symlinks,
   shared dependency/runtime references and open-file users before removing task-owned temporary
   dependencies or environments. Retain source changes and verification evidence. Whole-worktree
   removal additionally requires completed/merged work, retained commits, a verified recovery
   copy of material not retained in Git, and `git worktree remove` without force. Cleanup of a
   running service never begins by deleting its Profile, source worktree or dependency provider.
6. **Record the outcome.** Record stopped resources, released ports, retained evidence and
   remaining resources in the task outcome. For disk cleanup, use measured filesystem free space
   before/after; process memory accounting and directory sizes are not exact recovered bytes.
   Let the OS reclaim Swap; never manually delete its swap files.

Automated verification code must arrange this cleanup in `finally` (or an equivalent teardown)
for both successful and failed runs. If interruption prevents cleanup, the next turn first
reconciles the private resource record with live processes before launching replacements.

## Existing launchers

- `dev-instance.mjs` returns the Host PID, home, worktree, log and a stop command. Its Host can
  outlive the launcher. Revalidate that process identity before using the recorded stop command;
  preserve the Profile until the Host has exited.
- Use `node scripts/verify-app.mjs stop --name <n>` only after confirming that its disposable
  Profile has no process users other than the recorded Host: stop and verify owned children
  first, and retain shared or unresolved consumers. If sole use cannot be established, stop
  services separately, verify all users have exited, then assess directory removal. The helper
  waits only for the recorded Host, so checking children after it returns is too late to protect
  their Profile files. With those preconditions met, the current helper sends SIGTERM,
  waits up to 15 seconds, removes its matching temporary home and instance record, and retains
  the evidence directory. Independently verify process/port release and evidence retention.
  When Profile data must survive, stop the verified Host separately and preserve its closed
  Profile; the helper's combined stop-and-delete action is unsuitable for that case.

## Retained environments and handoff

Keep an environment running only for an explicit Human request, an active shared QA lease or
an accepted handoff naming its next owner. Record the reason, owner, source SHA, Profile, ports,
private evidence location and next review time or release condition. A review time is a reminder
to recheck ownership, not permission to stop another task's service. An unmerged PR or possible
future testing alone does not require its Host to remain running. Shared QA runners follow
their queue's restore/release procedure; other tasks leave those resources intact.

## Observed failure: orphaned verification Hosts

On 2026-10-22, six old verification Hosts were still running after more than four days and
their Profile directories were already absent, while processes held unlinked database files.
After an ownership/use check and explicit Human authorization, normal termination released
the processes and the OS reduced allocated Swap. The observation establishes incomplete
resource teardown; it does not establish a memory leak or who removed the directories.
Process exit must be verified before directory cleanup, and retained environments need an owner.
