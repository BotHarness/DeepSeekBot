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
  section?: AssignmentSection;
  needs?: AssignmentNeed;
  archived?: true;
  triageOpenCount?: number;
}

export type AssignmentNeed = 'approval' | 'error' | 'waiting-human' | 'blocked' | 'failed';

export type AssignmentSection = 'needs-input' | 'working' | 'idle' | 'resolved';

export const ASSIGNMENT_SECTIONS: readonly AssignmentSection[] = [
  'needs-input',
  'working',
  'idle',
  'resolved',
];

function assignmentSection(
  owned: OwnedSessionSummary,
  status: PersonaBotSessionRow['status'],
): { section: AssignmentSection; needs?: AssignmentNeed } {
  if (owned.assignmentArchived === true || status === 'stopped') return { section: 'resolved' };
  if (owned.assignmentExecutionWait === 'waiting-human')
    return { section: 'needs-input', needs: 'approval' };
  if (status === 'attention') return { section: 'needs-input', needs: 'error' };
  if (status === 'running' || status === 'stopping') return { section: 'working' };
  const report = owned.assignmentReportState;
  if (report === 'waiting-human' || report === 'blocked' || report === 'failed')
    return { section: 'needs-input', needs: report };
  return { section: 'idle' };
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
    const placement = item.role === 'assignment' ? assignmentSection(item, status) : undefined;
    const section = placement?.section;
    const current =
      item.sessionId === latestOrchestrator || (section !== undefined && section !== 'resolved');
    if (view === 'current' && !current) return [];
    return [
      {
        sessionId: item.sessionId,
        role: item.role,
        ...(item.role === 'assignment' && item.assignmentAccessMode !== undefined
          ? { assignmentAccessMode: item.assignmentAccessMode }
          : {}),
        title: native?.displayTitle || item.assignmentPurpose || item.sessionId,
        cwd: native?.cwd ?? item.cwdReference,
        updatedAt: native?.updatedAt ?? Date.parse(item.createdAt),
        status,
        ...(section === undefined ? {} : { section }),
        ...(placement?.needs === undefined ? {} : { needs: placement.needs }),
        ...(item.assignmentArchived === true ? { archived: true as const } : {}),
        ...(item.triageOpenCount === undefined || status !== 'running'
          ? {}
          : { triageOpenCount: item.triageOpenCount }),
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
