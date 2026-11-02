# Complete environment backup across versions

## Sub-features

- Preview and download a Profile Backup on a compatible Host without an exact DSH release gate.
- Inspect historical v1 and current v2 archives; distinguish upgrade requirements from integrity failures.
- Managed Restore into a new stopped Profile; preserve identity, Memory, attachment bytes and history while Bots remain cold.
- Model-free CLI preview/export/inspect/recovery/authorization/activation and explicit local restore.

## How to get to it (user POV)

Bot mode → Bot settings → Data and privacy → Environment backup → Manage backups.
Choose Preview export, review the counts and old-backup warning, then Download backup. Choose backup file in the Import area to inspect it. Export errors belong to the Export area and inspection errors to the Import area.

Export and Import each group their action with a heading. Contents and limits and Recovery details are collapsed initially and keyboard-operable. Sensitive-data handling stays visible; the old-backup purge warning appears before download. Restored Bots show their state beside their name. External-authority limits and the duplicate-running acknowledgement stay visible before activation.

Restore uses the displayed local `tobs profile-backup-restore` command with a new directory and `--confirm`. Start that new Profile with a compatible trusted installation, return to Settings and review readiness. Data restoration does not activate a Bot or authorize external accounts.

## Driving it with verify-app

Launch a uniquely named isolated Host from this worktree and run doctor. Preserve its private instance metadata and resource record. Use the observed accessible names for Settings navigation; capture preview counts and a successfully inspected download, then capture a damaged-file refusal in the import area. Repeat the visible checks in English/Chinese and light/dark themes. Read console and Client diagnostic evidence after each drive.

Use the same Host authority through the CLI: `profile-backup-preview`; pipe its JSON to `profile-backup-export --confirmation-stdin --out <new-file>`; then `profile-backup-inspect --file <file>`. Restore locally with `profile-backup-restore --file <file> --new-home <new-directory> --confirm`. The target must not exist. Use `profile-backup-recovery` after starting the target to verify cold readiness, and ordinary Bot/history/Memory reads to verify persistence.

Qualify isolated DSH 0.2.1-rc.2 and rc.3 and restore an archive from one on the other. Retain the actual producer facts and public data observations. The fixed v1 fixture is separately exercised by the Profile Backup regression tests; a synthetic version string is not runtime qualification. No model reply is needed for backup and cold-restore proof.

## Gotchas

- Host version and plugin-resolved DSH tools version can differ. Neither is a substitute for the archive format or Schema Generation.
- Version 2 records nullable provenance; earlier Tobs readers may require upgrading before they can read it. Historical v1 remains supported.
- Native Session logs, credentials and Workspace content are not included. Unavailable Session References are not resumed.
- Never test against a production Profile. Preserve failed-drive observations before retrying, and stop only this task's recorded Hosts after verifying their owned children and ports. Retain evidence outside disposable Profiles.
