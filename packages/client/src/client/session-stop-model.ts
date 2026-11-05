import type { PersonaBotSessionActivity } from '../../../core/src/state/tool-activity.js';

export interface RunningSession {
  readonly id: string;
  readonly role: 'orchestrator' | 'assignment';
  readonly name?: string | undefined;
  readonly state: 'thinking' | 'working';
}

export interface RunningSessionGroup<Bot> {
  readonly bot: Bot;
  readonly sessions: readonly RunningSession[];
}

export function runningSessions(
  sessions: readonly PersonaBotSessionActivity[] | undefined,
): RunningSession[] {
  const running: RunningSession[] = [];
  for (const session of sessions ?? []) {
    if (session.role === 'subagent') continue;
    if (session.state !== 'thinking' && session.state !== 'working') continue;
    running.push({
      id: session.id,
      role: session.role,
      ...(session.name === undefined ? {} : { name: session.name }),
      state: session.state,
    });
  }
  const at = new Map((sessions ?? []).map((session) => [session.id, session.at]));
  return running.sort(
    (left, right) =>
      (left.role === 'orchestrator' ? 0 : 1) - (right.role === 'orchestrator' ? 0 : 1) ||
      (at.get(left.id) ?? 0) - (at.get(right.id) ?? 0),
  );
}

export function runningSessionGroups<
  Bot extends { sessionActivity?: readonly PersonaBotSessionActivity[] },
>(bots: readonly Bot[]): RunningSessionGroup<Bot>[] {
  return bots.flatMap((bot) => {
    const sessions = runningSessions(bot.sessionActivity);
    return sessions.length === 0 ? [] : [{ bot, sessions }];
  });
}

export function runningSessionCount(groups: readonly RunningSessionGroup<unknown>[]): number {
  return groups.reduce((total, group) => total + group.sessions.length, 0);
}
