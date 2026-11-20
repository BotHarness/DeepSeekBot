import { afterEach } from 'vitest';
import { attachOperationalModule, type OperationalDatabaseOwner } from '../src/database/owner.js';
import { createWorkspaceGrantStore, type DshWorkspaceLookup } from '../src/workspaces/grants.js';
import { FIXED_NOW, createTempRoot } from './helpers.js';

export const TEST_GRANT_ID = 'test-workspace-grant';

const nativeWorkspaces = new Map<string, ReturnType<typeof nativeWorkspace>>();
afterEach(() => nativeWorkspaces.clear());

export function createTestNativeWorkspace(profile: string) {
  let workspace = nativeWorkspaces.get(profile);
  if (!workspace) {
    workspace = nativeWorkspace();
    nativeWorkspaces.set(profile, workspace);
  }
  return workspace;
}

function nativeWorkspace() {
  const workspace = {
    id: 'test-workspace',
    path: createTempRoot('botharness-native-workspace-'),
    title: 'Test Workspace',
    status: async () => 'ok' as const,
  };
  const lookup: DshWorkspaceLookup = {
    get: (id) => (id === workspace.id ? workspace : undefined),
    list: () => [workspace],
  };
  return { ...workspace, lookup };
}

export function createTestWorkspaceGrants(owner: OperationalDatabaseOwner, workspacePath: string) {
  const database = attachOperationalModule(owner, 'workspace-grant-test');
  database.transaction(
    (connection) => {
      connection
        .prepare(`INSERT OR IGNORE INTO workspace_grants
      (id, bot_slug, workspace_id, workspace_path, workspace_title, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
        .run(
          TEST_GRANT_ID,
          'ada',
          'test-workspace',
          workspacePath,
          'Test Workspace',
          FIXED_NOW().toISOString(),
        );
    },
    ['workspace-grants'],
  );
  return createWorkspaceGrantStore({
    database,
    now: FIXED_NOW,
    workspaces: () => ({
      get: (id: string) =>
        id === 'test-workspace'
          ? { id, path: workspacePath, title: 'Test Workspace', status: async () => 'ok' as const }
          : undefined,
      list: () => [
        {
          id: 'test-workspace',
          path: workspacePath,
          title: 'Test Workspace',
          status: async () => 'ok' as const,
        },
      ],
    }),
  });
}
