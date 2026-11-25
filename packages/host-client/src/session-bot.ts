import type { HostSessionRow } from '@botharness/host-protocol/host-sessions';
import { answerRecord, type HostCall } from './host-answer';
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
}

export interface SessionWorkspace {
  cwd: string;
  name: string;
  sessionIds: string[];
  lastAt: number;
}

export function sessionActivityAt(row: HostSessionRow): number {
  return row.lastPromptAt ?? row.updatedAt;
}

export async function readImportableSessions(host: HostCall): Promise<HostSessionRow[]> {
  const { sessions } = await readHostSessionList(host, { source: 'native' });
  return sessions
    .filter((row) => row.source.kind === 'native' && row.lastPromptAt !== null)
    .sort((a, b) => sessionActivityAt(b) - sessionActivityAt(a));
}

export function sessionWorkspaces(rows: readonly HostSessionRow[]): SessionWorkspace[] {
  const groups = new Map<string, SessionWorkspace>();
  for (const row of rows) {
    if (row.cwd === undefined) continue;
    const group = groups.get(row.cwd) ?? {
      cwd: row.cwd,
      name: row.folderName ?? row.cwd,
      sessionIds: [],
      lastAt: 0,
    };
    group.sessionIds.push(row.sessionId);
    group.lastAt = Math.max(group.lastAt, sessionActivityAt(row));
    groups.set(row.cwd, group);
  }
  return [...groups.values()].sort((a, b) => b.lastAt - a.lastAt || a.cwd.localeCompare(b.cwd));
}

export function latestSessionIds(
  rows: readonly HostSessionRow[],
  count: number,
  cwd?: string,
): string[] {
  return rows
    .filter((row) => cwd === undefined || row.cwd === cwd)
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
    }),
    'createFromSessions',
  );
}
