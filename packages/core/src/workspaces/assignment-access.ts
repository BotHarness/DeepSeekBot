import type { OperationalDatabaseModulePort } from '../database/owner.js';

export type AssignmentAccessMode = 'workspace-write' | 'danger-full-access';
export type AssignmentAccessScope = 'chat' | 'assignments';
export interface AssignmentAccessPreset {
  botSlug: string;
  mode: AssignmentAccessMode;
  scope: AssignmentAccessScope;
  revision: number;
  changedAt?: string;
}
interface PresetRow {
  bot_slug: string;
  mode: AssignmentAccessMode;
  scope: AssignmentAccessScope;
  revision: number;
  changed_at: string;
}
export interface AssignmentAccessStore {
  get(botSlug: string): AssignmentAccessPreset;
  set(
    botSlug: string,
    mode: AssignmentAccessMode,
    scope?: AssignmentAccessScope,
  ): AssignmentAccessPreset;
}
export function createAssignmentAccessStore(
  database: OperationalDatabaseModulePort,
): AssignmentAccessStore {
  return {
    get(botSlug) {
      const row = database.read((connection) =>
        connection.prepare('SELECT * FROM bot_assignment_access WHERE bot_slug = ?').get(botSlug),
      ) as PresetRow | undefined;
      return row === undefined
        ? { botSlug, mode: 'workspace-write', scope: 'chat', revision: 0 }
        : {
            botSlug,
            mode: row.mode,
            scope: row.scope,
            revision: row.revision,
            changedAt: row.changed_at,
          };
    },
    set(botSlug, mode, scope = 'chat') {
      if (mode !== 'workspace-write' && mode !== 'danger-full-access')
        throw new TypeError('Invalid Assignment access mode');
      if (scope !== 'chat' && scope !== 'assignments')
        throw new TypeError('Invalid Assignment access scope');
      return database.transaction(
        (connection) => {
          const current = connection
            .prepare('SELECT * FROM bot_assignment_access WHERE bot_slug = ?')
            .get(botSlug) as PresetRow | undefined;
          if (
            (current?.mode === mode && (mode === 'workspace-write' || current.scope === scope)) ||
            (current === undefined && mode === 'workspace-write')
          ) {
            return current === undefined
              ? { botSlug, mode, scope: 'chat', revision: 0 }
              : {
                  botSlug,
                  mode,
                  scope: current.scope,
                  revision: current.revision,
                  changedAt: current.changed_at,
                };
          }
          const revision = (current?.revision ?? 0) + 1;
          const changedAt = new Date().toISOString();
          connection
            .prepare(
              `INSERT INTO bot_assignment_access (bot_slug, mode, scope, revision, changed_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (bot_slug) DO UPDATE SET mode = excluded.mode, scope = excluded.scope,
             revision = excluded.revision, changed_at = excluded.changed_at`,
            )
            .run(botSlug, mode, scope, revision, changedAt);
          connection
            .prepare(
              `INSERT INTO bot_assignment_access_events
           (bot_slug, revision, prior_mode, mode, changed_at, actor_kind)
           VALUES (?, ?, ?, ?, ?, 'human')`,
            )
            .run(botSlug, revision, current?.mode ?? 'workspace-write', mode, changedAt);
          return { botSlug, mode, scope, revision, changedAt };
        },
        ['assignment-access'],
      );
    },
  };
}
