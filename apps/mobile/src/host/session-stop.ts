import type { HostClient, RosterBot } from './client';
import type { WireSessionActivity } from './wire';

export type RunningSession = WireSessionActivity & { role: 'orchestrator' | 'assignment' };

const ORDER = { orchestrator: 0, assignment: 1 } as const;

export function runningSessions(bot: Pick<RosterBot, 'sessions'> | undefined): RunningSession[] {
  return (bot?.sessions ?? [])
    .filter((session): session is RunningSession => session.role !== 'subagent')
    .map((session, index) => ({ session, index }))
    .sort((a, b) => ORDER[a.session.role] - ORDER[b.session.role] || a.index - b.index)
    .map(({ session }) => session);
}

export function runningSessionCount(
  bots: readonly (Pick<RosterBot, 'sessions'> | undefined)[],
): number {
  return bots.reduce((total, bot) => total + runningSessions(bot).length, 0);
}

export interface SessionStopper {
  stopSession(botSlug: string, sessionId: string): Promise<void>;
  stopBot(botSlug: string): Promise<void>;
}

export function sessionStopper(
  client: Pick<HostClient, 'call'>,
  channelId?: string | undefined,
): SessionStopper {
  const notice = channelId === undefined ? {} : { channelId };
  return {
    async stopSession(botSlug, sessionId) {
      await client.call('sessionStop', { botSlug, activityId: sessionId, ...notice });
    },
    async stopBot(botSlug) {
      await client.call('botStop', { botSlug, ...notice });
    },
  };
}

export function sessionKey(botSlug: string, sessionId: string): string {
  return `${botSlug}\u0000${sessionId}`;
}

export function liveStopping(
  requested: ReadonlySet<string>,
  bots: readonly Pick<RosterBot, 'slug' | 'sessions'>[],
): Set<string> {
  const live = new Set(
    bots.flatMap((bot) => runningSessions(bot).map((session) => sessionKey(bot.slug, session.id))),
  );
  return new Set([...requested].filter((key) => live.has(key)));
}
