import { attachOperationalModule, type OperationalDatabaseOwner } from '../database/owner.js';
import type { ProfileBackupManifest } from '../portability/package.js';

export function profileWorkspaceDependencies(
  database: OperationalDatabaseOwner,
): ProfileBackupManifest['dependencies'] {
  return attachOperationalModule(database, 'workspace-grants').read((db) =>
    db
      .prepare('SELECT bot_slug, workspace_path FROM workspace_grants WHERE revoked_at IS NULL')
      .all()
      .map((row) => ({
        kind: 'workspace' as const,
        scope: String(row.bot_slug),
        reference: String(row.workspace_path),
        required: false,
        contract: 'workspace-grant/1',
      })),
  );
}

export function suspendRestoredExecution(database: OperationalDatabaseOwner): void {
  attachOperationalModule(database, 'messaging').transaction((db) =>
    db.exec(`
      UPDATE channel_change_epoch
         SET epoch = lower(hex(randomblob(8))),
             floor_seq = coalesce((SELECT seq FROM sqlite_sequence WHERE name = 'channel_changes'), 0)
       WHERE singleton = 1;
    `),
  );
  const port = attachOperationalModule(database, 'bot-runtime');
  port.transaction((db) => {
    db.exec(`
      UPDATE source_events SET attempt_state = 'needs-repair' WHERE attempt_state IN ('pending', 'running', 'retryable');
      UPDATE inbox_admissions SET attempt_state = 'needs-repair', last_error = 'disaster-restore-no-replay'
        WHERE attempt_state IN ('pending', 'running', 'retryable');
      UPDATE assignments SET stop_state = 'stopped', activity = 'idle', continuity_key = NULL;
    `);
  });
  attachOperationalModule(database, 'bot-schedules').transaction((db) =>
    db.exec('UPDATE bot_schedules SET enabled = 0'),
  );
  attachOperationalModule(database, 'workspace-grants').transaction((db) =>
    db
      .prepare('UPDATE workspace_grants SET revoked_at = ? WHERE revoked_at IS NULL')
      .run(new Date().toISOString()),
  );
  attachOperationalModule(database, 'tool-approval-rules').transaction((db) =>
    db
      .prepare('UPDATE tool_approval_rules SET active = 0, revoked_at = ? WHERE revoked_at IS NULL')
      .run(new Date().toISOString()),
  );
  attachOperationalModule(database, 'assignment-access').transaction((db) =>
    db.exec("UPDATE bot_assignment_access SET mode = 'workspace-write', revision = revision + 1"),
  );
}
