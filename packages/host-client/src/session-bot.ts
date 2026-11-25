import type { HostSessionRow } from '@botharness/host-protocol/host-sessions';
import { answerRecord, record, type HostCall } from './host-answer';
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
  addWorkspaces?: boolean;
}

export const IMPORT_PRODUCTS = ['deepseek', 'claude-code', 'codex'] as const;
export type ImportProduct = (typeof IMPORT_PRODUCTS)[number];

export type ImportableSession = HostSessionRow & {
  cwd: string;
  workspacePath: string;
  product: ImportProduct;
  addsWorkspace?: true;
};

interface ExternalRow {
  sessionId: string;
  source: Exclude<ImportProduct, 'deepseek'>;
  title?: string;
  cwd: string;
  lastActivityAt: number;
}

function externalRows(value: unknown): ExternalRow[] {
  const sessions = record(value)?.['sessions'];
  if (!Array.isArray(sessions)) return [];
  return sessions.flatMap((row): ExternalRow[] => {
    const item = record(row);
    const sessionId = item?.['sessionId'];
    const source = item?.['source'];
    const title = item?.['title'];
    const cwd = item?.['cwd'];
    const lastActivityAt = item?.['lastActivityAt'];
    if (
      typeof sessionId !== 'string' ||
      (source !== 'claude-code' && source !== 'codex') ||
      typeof cwd !== 'string' ||
      typeof lastActivityAt !== 'number'
    )
      return [];
    return [
      {
        sessionId,
        source,
        ...(typeof title === 'string' ? { title } : {}),
        cwd,
        lastActivityAt,
      },
    ];
  });
}

export async function readExternalSessions(host: HostCall): Promise<ExternalRow[]> {
  return externalRows(await host.call('externalSessions', {}));
}

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
  const [{ sessions }, workspaces, others] = await Promise.all([
    readHostSessionList(host, { source: 'native' }),
    loadWorkspaceOptions(host),
    readExternalSessions(host),
  ]);
  const roots = workspaces.map((workspace) => workspace.path);
  const native = sessions.flatMap((row): ImportableSession[] => {
    if (row.source.kind !== 'native' || row.lastPromptAt === null || row.cwd === undefined)
      return [];
    const workspacePath = grantedWorkspacePath(roots, row.cwd);
    return workspacePath === undefined
      ? []
      : [{ ...row, cwd: row.cwd, workspacePath, product: 'deepseek' }];
  });
  const imported = others.map((row): ImportableSession => {
    const workspacePath = grantedWorkspacePath(roots, row.cwd);
    return {
      sessionId: row.sessionId,
      source: { kind: 'native' },
      ...(row.title === undefined ? {} : { title: row.title }),
      folderName: folderName(row.cwd),
      cwd: row.cwd,
      running: false,
      lastPromptAt: row.lastActivityAt,
      updatedAt: row.lastActivityAt,
      product: row.source,
      workspacePath: workspacePath ?? row.cwd,
      ...(workspacePath === undefined ? { addsWorkspace: true as const } : {}),
    };
  });
  return [...native, ...imported].sort((a, b) => sessionActivityAt(b) - sessionActivityAt(a));
}

export function grantPreview(
  rows: readonly ImportableSession[],
  selected: ReadonlySet<string>,
): { paths: string[]; added: string[] } {
  const picked = rows.filter((row) => selected.has(row.sessionId));
  const existing = new Set(
    picked.filter((row) => !row.addsWorkspace).map((row) => row.workspacePath),
  );
  const missing = [...new Set(picked.filter((row) => row.addsWorkspace).map((row) => row.cwd))];
  const added = missing.filter(
    (path) => !missing.some((other) => other !== path && contains(other, path)),
  );
  return { paths: [...new Set([...existing, ...added])].sort(), added: added.sort() };
}

export function productCounts(rows: readonly ImportableSession[]): Record<ImportProduct, number> {
  const counts: Record<ImportProduct, number> = { deepseek: 0, 'claude-code': 0, codex: 0 };
  for (const row of rows) counts[row.product] += 1;
  return counts;
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
      ...(input.addWorkspaces === true ? { addWorkspaces: true } : {}),
    }),
    'createFromSessions',
  );
}
