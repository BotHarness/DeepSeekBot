import {
  unpinnedEntries,
  type BotProfile,
  type MemoryEntry,
  type PinnedMemory,
  type ProfileAssignment,
  type ProfilePart,
} from '../../host/bot-profile';
import type { RosterBot, RosterChannel } from '@botharness/host-client/client';
import { runningSessions, type RunningSession } from '../../host/session-stop';
import type { MemoryChange } from '../../host/memory-changes';
import type { BotScheduleSummary, ProfileActivity } from '@botharness/host-protocol/wire';
import { t } from '../strings';
import { memoryGridRows } from './memory-browser';
import { routineGroups, type RoutineGroup } from './profile-routines';
import type { MemoryChanges } from './memory-changes';

export const PROFILE_SECTIONS = [
  'work',
  'activity',
  'memory',
  'routines',
  'channels',
  'files',
] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

type RowBody =
  | { kind: 'item'; title: string; detail?: string }
  | { kind: 'pinned'; pinned: PinnedMemory[] }
  | { kind: 'grid'; entries: MemoryEntry[]; columns: number; lead: boolean }
  | { kind: 'commit'; change: MemoryChange }
  | { kind: 'more'; busy: boolean }
  | {
      kind: 'routine-group';
      group: RoutineGroup;
      routines: BotScheduleSummary[];
    }
  | { kind: 'assignment'; assignment: ProfileAssignment }
  | { kind: 'day'; label: string }
  | {
      kind: 'working-head';
      label: string;
      botSlug: string;
      sessionIds: string[];
      lead: boolean;
      bot?: RosterBot;
    }
  | { kind: 'session'; botSlug: string; session: RunningSession }
  | { kind: 'activity'; activity: ProfileActivity }
  | { kind: 'note'; text: string }
  | { kind: 'failed'; error: string }
  | { kind: 'loading' };

export type Row = RowBody & { key: string; first: boolean; last: boolean };

function boundary(body: RowBody | undefined): boolean {
  return body?.kind === 'day' || body?.kind === 'working-head';
}

function frame(section: ProfileSection, bodies: RowBody[]): Row[] {
  return bodies.map((body, index) => ({
    ...body,
    key: `${section}:${index}`,
    first: index === 0 || boundary(bodies[index - 1]),
    last: index === bodies.length - 1 || boundary(bodies[index + 1]),
  }));
}

function workingKey(body: RowBody): string {
  if (body.kind === 'working-head') return `working:bot:${body.botSlug}`;
  if (body.kind === 'session') return `working:${body.botSlug}:${body.session.id}`;
  return 'working:heading';
}

export function workingRows(bots: readonly RosterBot[], grouped: boolean): Row[] {
  const running = bots
    .map((bot) => ({ bot, sessions: runningSessions(bot) }))
    .filter(({ sessions }) => sessions.length > 0);
  if (running.length === 0) return [];
  const bodies: RowBody[] = grouped ? [{ kind: 'day', label: t.workingNow }] : [];
  for (const [index, { bot, sessions }] of running.entries()) {
    bodies.push({
      kind: 'working-head',
      label: grouped ? bot.displayName : t.workingNow,
      botSlug: bot.slug,
      sessionIds: sessions.map((session) => session.id),
      lead: index === 0,
      ...(grouped ? { bot } : {}),
    });
    for (const session of sessions) bodies.push({ kind: 'session', botSlug: bot.slug, session });
  }
  return bodies.map((body, index) => ({
    ...body,
    key: workingKey(body),
    first: index === 0 || boundary(bodies[index - 1]),
    last: index === bodies.length - 1 || boundary(bodies[index + 1]),
  }));
}

export function sessionTitle(session: RunningSession): string {
  if (session.role === 'orchestrator') return t.sessionOrchestrator;
  const name = session.name?.trim() ?? '';
  return name === '' ? t.sessionAssignment : name;
}

function partRows<T>(
  part: ProfilePart<T> | undefined,
  section: ProfileSection,
  rows: (value: T) => RowBody[],
): RowBody[] {
  if (part === undefined) return [{ kind: 'loading' }];
  if (part.status === 'failed') return [{ kind: 'failed', error: part.error }];
  const ready = rows(part.value);
  return [
    ...(part.staleError === undefined ? [] : [{ kind: 'failed' as const, error: part.staleError }]),
    ...(ready.length === 0 ? [{ kind: 'note' as const, text: t.profileEmpty[section] }] : ready),
  ];
}

function localDay(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '' : at.toDateString();
}

function dayRows<T>(
  items: readonly T[],
  at: (item: T) => string,
  body: (item: T) => RowBody,
  now: Date,
): RowBody[] {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const label = (iso: string) => {
    const day = localDay(iso);
    if (day === now.toDateString()) return t.usageToday;
    if (day === yesterday.toDateString()) return t.yesterday;
    const at = new Date(iso);
    return Number.isNaN(at.getTime())
      ? ''
      : at.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          ...(at.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
        });
  };
  const rows: RowBody[] = [];
  let previous: string | undefined;
  for (const item of items) {
    const day = localDay(at(item));
    if (day !== previous) rows.push({ kind: 'day', label: label(at(item)) });
    previous = day;
    rows.push(body(item));
  }
  return rows;
}

export function workRowBodies(assignments: readonly ProfileAssignment[], now = new Date()) {
  return dayRows(
    assignments,
    (assignment) => assignment.updatedAt,
    (assignment) => ({ kind: 'assignment', assignment }),
    now,
  );
}

export function memoryChangeRows(
  changes: MemoryChanges,
  now = new Date(),
  empty = t.memoryChangesEmpty,
): Row[] {
  if (!changes.loaded)
    return frame(
      'memory',
      changes.error === undefined
        ? [{ kind: 'loading' }]
        : [{ kind: 'failed', error: changes.error }],
    );
  return frame('memory', [
    ...(changes.commits.length === 0
      ? [{ kind: 'note' as const, text: empty }]
      : dayRows(
          changes.commits,
          (change) => change.authoredAt,
          (change) => ({ kind: 'commit', change }),
          now,
        )),
    ...(changes.error === undefined ? [] : [{ kind: 'failed' as const, error: changes.error }]),
    ...(changes.hasMore ? [{ kind: 'more' as const, busy: changes.busy }] : []),
  ]);
}

export function assignmentRows(part: ProfilePart<ProfileAssignment[]> | undefined): Row[] {
  return frame(
    'work',
    partRows(part, 'work', (work) => workRowBodies(work)),
  );
}

export function profileRows(
  profile: BotProfile | undefined,
  channels: RosterChannel[],
  columns = 3,
): Record<ProfileSection, Row[]> {
  return {
    work: assignmentRows(profile?.work),
    activity: frame(
      'activity',
      partRows(profile?.activity, 'activity', (activity) => [{ kind: 'activity', activity }]),
    ),
    memory: frame(
      'memory',
      partRows(profile?.memory, 'memory', (memory): RowBody[] =>
        memory.status === 'unavailable'
          ? [{ kind: 'note', text: t.memoryNotAttached }]
          : [
              { kind: 'pinned', pinned: memory.pinned },
              ...(memory.files.length === 0
                ? [{ kind: 'note' as const, text: t.profileEmpty.memory }]
                : memoryGridRows(unpinnedEntries(memory.files, memory.pinned), columns).map(
                    (entries, index): RowBody => ({
                      kind: 'grid',
                      entries,
                      columns,
                      lead: index === 0,
                    }),
                  )),
            ],
      ),
    ),
    routines: frame(
      'routines',
      partRows(profile?.routines, 'routines', (routines) =>
        routineGroups(routines).map(({ group, routines }) => ({
          kind: 'routine-group',
          group,
          routines,
        })),
      ),
    ),
    channels: frame(
      'channels',
      channels.length === 0
        ? [{ kind: 'note', text: t.profileEmpty.channels }]
        : channels.map((channel) => ({
            kind: 'item',
            title: `# ${channel.name}`,
            detail: t.members(channel.memberCount),
          })),
    ),
    files: frame(
      'files',
      partRows(profile?.files, 'files', (grants) =>
        grants.map((grant) => ({
          kind: 'item',
          title: grant.workspaceTitle,
          detail: `${grant.orchestratorWrite === true ? t.folderCanEdit : t.folderReadOnly} · ${grant.workspacePath}`,
        })),
      ),
    ),
  };
}

export type WorkRow = Row;
