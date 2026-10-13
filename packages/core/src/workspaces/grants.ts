import { randomUUID } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import type { OperationalDatabaseModulePort } from '../database/owner.js';

export interface WorkspaceGrant {
  id: string;
  botSlug: string;
  workspaceId: string;
  workspacePath: string;
  workspaceTitle: string;
  createdAt: string;
  revokedAt?: string;
  orchestratorWrite?: boolean;
  writeRevision?: number;
}

export interface AssignmentPermissionSnapshot {
  grantId: string;
  workspaceId: string;
  primaryCwd: string;
  mode: 'workspace-write' | 'danger-full-access';
  approval: 'ask' | 'never';
  presetRevision: number;
}

export interface DshWorkspace {
  id: string;
  path: string;
  title: string;
  status(): Promise<'ok' | 'missing-dir'>;
}
export interface DshWorkspaceLookup {
  get(id: string): DshWorkspace | undefined;
  list(): DshWorkspace[];
  readonly archivedSessionIds?: readonly string[];
}
export class WorkspaceGrantError extends Error {
  constructor(
    readonly code: 'unknown-workspace' | 'unavailable-workspace' | 'invalid-grant',
    message: string,
  ) {
    super(message);
    this.name = 'WorkspaceGrantError';
  }
}
export interface WorkspaceGrantStore {
  list(botSlug: string): WorkspaceGrant[];
  create(
    botSlug: string,
    workspaceId: string,
    confirmation?: {
      validate(): void;
      onCreated(): void;
    },
  ): Promise<WorkspaceGrant>;
  revoke(botSlug: string, grantId: string): WorkspaceGrant;
  requireActive(botSlug: string, grantId: string): WorkspaceGrant;
  setOrchestratorWrite(botSlug: string, grantId: string, enabled: boolean): WorkspaceGrant;
  availableWorkspaces(): { id: string; path: string; title: string }[];
}

interface GrantRow {
  id: string;
  bot_slug: string;
  workspace_id: string;
  workspace_path: string;
  workspace_title: string;
  created_at: string;
  revoked_at: string | null;
  orchestrator_write: number;
  write_revision: number;
}
function toRecord(row: GrantRow): WorkspaceGrant {
  return {
    id: row.id,
    botSlug: row.bot_slug,
    workspaceId: row.workspace_id,
    workspacePath: row.workspace_path,
    workspaceTitle: row.workspace_title,
    createdAt: row.created_at,
    orchestratorWrite: row.orchestrator_write === 1,
    writeRevision: row.write_revision,
    ...(row.revoked_at === null ? {} : { revokedAt: row.revoked_at }),
  };
}
function isCurrentDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory() && realpathSync(path) === path;
  } catch {
    return false;
  }
}
export function createWorkspaceGrantStore(options: {
  database: OperationalDatabaseModulePort;
  workspaces: () => DshWorkspaceLookup | undefined;
  now?: () => Date;
  createId?: () => string;
}): WorkspaceGrantStore {
  const { database, workspaces } = options;
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;
  const lookup = (): DshWorkspaceLookup => {
    const current = workspaces();
    if (current === undefined) {
      throw new WorkspaceGrantError(
        'unavailable-workspace',
        'DSH Workspace registry is unavailable',
      );
    }
    return current;
  };
  const read = (botSlug: string, grantId: string): WorkspaceGrant | undefined => {
    const row = database.read((connection) =>
      connection
        .prepare('SELECT * FROM workspace_grants WHERE bot_slug = ? AND id = ?')
        .get(botSlug, grantId),
    ) as GrantRow | undefined;
    return row === undefined ? undefined : toRecord(row);
  };
  return {
    list(botSlug) {
      const rows = database.read((connection) =>
        connection
          .prepare('SELECT * FROM workspace_grants WHERE bot_slug = ? ORDER BY created_at DESC, id')
          .all(botSlug),
      ) as unknown as GrantRow[];
      return rows.map(toRecord);
    },
    async create(botSlug, workspaceId, confirmation) {
      const activeAtStart = database.read(
        (connection) =>
          connection
            .prepare(
              'SELECT id FROM workspace_grants WHERE bot_slug = ? AND workspace_id = ? AND revoked_at IS NULL',
            )
            .get(botSlug, workspaceId) as { id: string } | undefined,
      );
      const revokedCountAtStart = database.read(
        (connection) =>
          connection
            .prepare(
              'SELECT COUNT(*) AS count FROM workspace_grants WHERE bot_slug = ? AND workspace_id = ? AND revoked_at IS NOT NULL',
            )
            .get(botSlug, workspaceId) as { count: number },
      ).count;
      const workspace = lookup().get(workspaceId);
      if (workspace === undefined) {
        throw new WorkspaceGrantError('unknown-workspace', 'Unknown DSH Workspace: ' + workspaceId);
      }
      if ((await workspace.status()) !== 'ok' || !isCurrentDirectory(workspace.path)) {
        throw new WorkspaceGrantError(
          'unavailable-workspace',
          'DSH Workspace is unavailable: ' + workspaceId,
        );
      }
      const at = now().toISOString();
      let created = false;
      let refusal = 'Workspace Grant was revoked while authorization was pending';
      confirmation?.validate();
      const current = lookup().get(workspaceId);
      if (current?.path !== workspace.path || !isCurrentDirectory(workspace.path)) {
        throw new WorkspaceGrantError(
          'unavailable-workspace',
          'Workspace changed while authorization was pending',
        );
      }
      const row = database.transaction(
        (connection) => {
          const existing = connection
            .prepare(
              'SELECT * FROM workspace_grants WHERE bot_slug = ? AND workspace_id = ? AND revoked_at IS NULL',
            )
            .get(botSlug, workspaceId) as unknown as GrantRow | undefined;
          const revokedCountNow = (
            connection
              .prepare(
                'SELECT COUNT(*) AS count FROM workspace_grants WHERE bot_slug = ? AND workspace_id = ? AND revoked_at IS NOT NULL',
              )
              .get(botSlug, workspaceId) as { count: number }
          ).count;
          if (
            revokedCountNow !== revokedCountAtStart ||
            (activeAtStart !== undefined && existing?.id !== activeAtStart.id)
          ) {
            return undefined;
          }
          if (existing !== undefined) {
            if (existing.workspace_path !== workspace.path) {
              refusal = 'Existing Workspace Grant no longer matches the directory';
              return undefined;
            }
            return existing;
          }
          const id = createId();
          connection
            .prepare(
              'INSERT INTO workspace_grants (id, bot_slug, workspace_id, workspace_path, workspace_title, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            )
            .run(id, botSlug, workspaceId, workspace.path, workspace.title, at);
          created = true;
          return connection
            .prepare('SELECT * FROM workspace_grants WHERE id = ?')
            .get(id) as unknown as GrantRow;
        },
        ['workspace-grants'],
      );
      if (row === undefined) {
        throw new WorkspaceGrantError('invalid-grant', refusal);
      }
      if (created) confirmation?.onCreated();
      return toRecord(row);
    },
    revoke(botSlug, grantId) {
      const at = now().toISOString();
      const row = database.transaction(
        (connection) => {
          connection
            .prepare(
              'UPDATE workspace_grants SET revoked_at = COALESCE(revoked_at, ?) WHERE bot_slug = ? AND id = ?',
            )
            .run(at, botSlug, grantId);
          return connection
            .prepare('SELECT * FROM workspace_grants WHERE bot_slug = ? AND id = ?')
            .get(botSlug, grantId) as GrantRow | undefined;
        },
        ['workspace-grants'],
      );
      if (row === undefined) {
        throw new WorkspaceGrantError('invalid-grant', 'Unknown Workspace Grant: ' + grantId);
      }
      return toRecord(row);
    },
    requireActive(botSlug, grantId) {
      const grant = read(botSlug, grantId);
      if (grant === undefined || grant.revokedAt !== undefined) {
        throw new WorkspaceGrantError(
          'invalid-grant',
          'Workspace Grant is missing or revoked: ' + grantId,
        );
      }
      const workspace = lookup().get(grant.workspaceId);
      if (
        workspace === undefined ||
        workspace.path !== grant.workspacePath ||
        !isCurrentDirectory(workspace.path)
      ) {
        throw new WorkspaceGrantError(
          'unavailable-workspace',
          'Workspace Grant target is unavailable: ' + grantId,
        );
      }
      return grant;
    },
    setOrchestratorWrite(botSlug, grantId, enabled) {
      this.requireActive(botSlug, grantId);
      const row = database.transaction(
        (connection) => {
          connection
            .prepare(`UPDATE workspace_grants
          SET orchestrator_write = ?, write_revision = write_revision + 1
          WHERE bot_slug = ? AND id = ? AND revoked_at IS NULL AND orchestrator_write != ?`)
            .run(enabled ? 1 : 0, botSlug, grantId, enabled ? 1 : 0);
          const current = connection
            .prepare('SELECT * FROM workspace_grants WHERE bot_slug = ? AND id = ?')
            .get(botSlug, grantId) as unknown as GrantRow | undefined;
          if (current === undefined || current.revoked_at !== null)
            throw new WorkspaceGrantError(
              'invalid-grant',
              'Workspace Grant is missing or revoked: ' + grantId,
            );
          return current;
        },
        ['workspace-grants'],
      );
      return toRecord(row);
    },
    availableWorkspaces() {
      return lookup()
        .list()
        .map(({ id, path, title }) => ({ id, path, title }));
    },
  };
}
