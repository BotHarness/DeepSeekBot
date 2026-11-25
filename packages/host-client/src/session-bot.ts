import type { HostSessionRow } from '@botharness/host-protocol/host-sessions';
import { answerRecord, type HostCall } from './host-answer';
import { loadWorkspaceOptions } from './bot-settings';
import { readHostSessionList } from './host-sessions';

export const SESSION_BOT_MAX = 50;

export interface SessionBotInput {
  displayName: string;
  sessionIds: readonly string[];
  description?: string;
  roles?: readonly string[];
  persona?: string;
  operationKey?: string;
  language?: 'zh' | 'en';
  workspacePaths?: readonly string[];
}

export type ImportableSession = HostSessionRow & { cwd: string; workspacePath: string };

export interface SessionWorkspace {
  path: string;
  name: string;
  sessionIds: string[];
  lastAt: number;
}

export function sessionActivityAt(row: HostSessionRow): number {
  return row.lastPromptAt ?? row.updatedAt;
}

function contains(root: string, path: string): boolean {
  if (path === root) return true;
  const base =
    root.endsWith('/') || root.endsWith('\\') ? root : `${root}${root.includes('\\') ? '\\' : '/'}`;
  return path.startsWith(base);
}

export function grantedWorkspacePath(roots: readonly string[], cwd: string): string | undefined {
  return roots.filter((root) => contains(root, cwd)).sort((a, b) => b.length - a.length)[0];
}

export async function readImportableSessions(host: HostCall): Promise<ImportableSession[]> {
  const [{ sessions }, workspaces] = await Promise.all([
    readHostSessionList(host, { source: 'native' }),
    loadWorkspaceOptions(host),
  ]);
  const roots = workspaces.map((workspace) => workspace.path);
  return sessions
    .flatMap((row): ImportableSession[] => {
      if (row.source.kind !== 'native' || row.lastPromptAt === null || row.cwd === undefined)
        return [];
      const workspacePath = grantedWorkspacePath(roots, row.cwd);
      return workspacePath === undefined ? [] : [{ ...row, cwd: row.cwd, workspacePath }];
    })
    .sort((a, b) => sessionActivityAt(b) - sessionActivityAt(a));
}

function folderName(path: string): string {
  return path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path;
}

export function sessionWorkspaces(rows: readonly ImportableSession[]): SessionWorkspace[] {
  const groups = new Map<string, SessionWorkspace>();
  for (const row of rows) {
    const group = groups.get(row.workspacePath) ?? {
      path: row.workspacePath,
      name: folderName(row.workspacePath),
      sessionIds: [],
      lastAt: 0,
    };
    group.sessionIds.push(row.sessionId);
    group.lastAt = Math.max(group.lastAt, sessionActivityAt(row));
    groups.set(row.workspacePath, group);
  }
  return [...groups.values()].sort((a, b) => b.lastAt - a.lastAt || a.path.localeCompare(b.path));
}

export function latestSessionIds(
  rows: readonly ImportableSession[],
  count: number,
  workspacePath?: string,
): string[] {
  return rows
    .filter((row) => workspacePath === undefined || row.workspacePath === workspacePath)
    .sort((a, b) => sessionActivityAt(b) - sessionActivityAt(a))
    .slice(0, Math.max(0, Math.min(count, SESSION_BOT_MAX)))
    .map((row) => row.sessionId);
}

export async function createBotFromSessions(
  host: HostCall,
  input: SessionBotInput,
): Promise<Record<string, unknown>> {
  return answerRecord(
    await host.call('createFromSessions', {
      displayName: input.displayName,
      sessionIds: [...input.sessionIds],
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.roles === undefined ? {} : { roles: [...input.roles] }),
      ...(input.persona === undefined ? {} : { persona: input.persona }),
      ...(input.operationKey === undefined ? {} : { operationKey: input.operationKey }),
      ...(input.language === undefined ? {} : { language: input.language }),
      ...(input.workspacePaths === undefined ? {} : { workspacePaths: [...input.workspacePaths] }),
    }),
    'createFromSessions',
  );
}
