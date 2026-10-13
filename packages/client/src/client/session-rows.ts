import type { OwnedSessionSummary } from './store.js';

export interface NativeSessionSummary {
  displayTitle: string;
  cwd?: string;
  updatedAt: number;
  running: boolean;
}

export interface PersonaBotSessionRow {
  sessionId: string;
  role: OwnedSessionSummary['role'];
  assignmentAccessMode?: OwnedSessionSummary['assignmentAccessMode'];
  title: string;
  cwd: string | undefined;
  updatedAt: number;
  status: 'running' | 'stopping' | 'attention' | 'stopped' | 'idle' | 'unavailable';
}

function rowStatus(
  owned: OwnedSessionSummary,
  native: NativeSessionSummary | undefined,
): PersonaBotSessionRow['status'] {
  if (owned.assignmentActivity === 'stopping') return 'stopping';
  if (owned.assignmentActivity === 'stopped') return 'stopped';
  if (native?.running) return 'running';
  if (owned.assignmentActivity === 'error') return 'attention';
  if (native === undefined) return 'unavailable';
  return 'idle';
}

export function personaBotSessionRows(
  owned: readonly OwnedSessionSummary[],
  nativeById: Readonly<Record<string, NativeSessionSummary>>,
  view: 'current' | 'all',
): PersonaBotSessionRow[] {
  const orchestrators = owned.filter((item) => item.role === 'orchestrator');
  const latestOrchestrator = orchestrators.some((item) => item.currentOrchestrator !== undefined)
    ? orchestrators.find((item) => item.currentOrchestrator === true)?.sessionId
    : orchestrators.sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]
        ?.sessionId;
  const rows = owned.flatMap((item) => {
    const native = nativeById[item.sessionId];
    const status = rowStatus(item, native);
    const current =
      item.sessionId === latestOrchestrator ||
      status === 'running' ||
      status === 'stopping' ||
      status === 'attention' ||
      (item.assignmentActivity === 'working' && native === undefined);
    if (view === 'current' && !current) return [];
    return [
      {
        sessionId: item.sessionId,
        role: item.role,
        ...(item.role === 'assignment' && item.assignmentAccessMode !== undefined
          ? { assignmentAccessMode: item.assignmentAccessMode }
          : {}),
        title: native?.displayTitle || item.sessionId,
        cwd: native?.cwd ?? item.cwdReference,
        updatedAt: native?.updatedAt ?? Date.parse(item.createdAt),
        status,
      },
    ];
  });
  const priority = (row: PersonaBotSessionRow): number => {
    if (row.sessionId === latestOrchestrator) return 0;
    if (row.role === 'assignment' && (row.status === 'running' || row.status === 'stopping'))
      return 1;
    if (row.status === 'attention' || row.status === 'unavailable') return 2;
    if (row.status === 'running') return 3;
    return 4;
  };
  return rows.sort(
    (left, right) =>
      priority(left) - priority(right) ||
      right.updatedAt - left.updatedAt ||
      left.sessionId.localeCompare(right.sessionId),
  );
}

export interface SessionWorkspaceGroup {
  key: string;
  path: string | undefined;
  name: string | undefined;
  rows: PersonaBotSessionRow[];
}

export function groupSessionRowsByWorkspace(
  rows: readonly PersonaBotSessionRow[],
): SessionWorkspaceGroup[] {
  const groups = new Map<string, SessionWorkspaceGroup>();
  for (const row of rows) {
    const path = row.cwd?.replace(/\\/gu, '/').replace(/\/+$/u, '') || row.cwd;
    const key = path === undefined ? 'unknown' : 'cwd:' + path;
    let group = groups.get(key);
    if (group === undefined) {
      group = {
        key,
        path,
        name: path?.split('/').filter(Boolean).at(-1) ?? path,
        rows: [],
      };
      groups.set(key, group);
    }
    group.rows.push(row);
  }
  return [...groups.values()];
}
