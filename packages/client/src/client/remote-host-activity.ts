import type { RosterBot } from '../../../../apps/mobile/src/host/client.js';
import type {
  WireToolActivity,
  WireSessionActivity,
} from '../../../../apps/mobile/src/host/wire.js';
import type {
  PersonaBotSessionActivity,
  PersonaBotToolActivity,
} from '../../../core/src/state/tool-activity.js';

export interface RemoteBotActivity {
  state: RosterBot['state'];
  activity?: PersonaBotToolActivity;
  sessions?: readonly PersonaBotSessionActivity[];
}

export function createRemoteActivityProjection() {
  const sessions = new WeakMap<WireSessionActivity, PersonaBotSessionActivity>();
  const received = new WeakMap<WireToolActivity, PersonaBotToolActivity>();
  const tool = (value: WireToolActivity, at: number): PersonaBotToolActivity => {
    let activity = received.get(value);
    if (activity === undefined) {
      activity = { ...value, toolKind: 'other', startedAt: at };
      received.set(value, activity);
    }
    return activity;
  };
  return (bots: readonly RosterBot[], at: number): ReadonlyMap<string, RemoteBotActivity> =>
    new Map(
      bots.map((bot) => [
        bot.slug,
        {
          state: bot.state,
          ...(bot.activity === undefined
            ? {}
            : {
                activity: {
                  ...tool(bot.activity, at),
                  ...(bot.sessions === undefined
                    ? {}
                    : {
                        sources: (['orchestrator', 'assignment', 'subagent'] as const).flatMap(
                          (role) => {
                            const count = bot.sessions!.filter(
                              (session) => session.role === role,
                            ).length;
                            return count > 0 ? [{ role, count }] : [];
                          },
                        ),
                      }),
                },
              }),
          ...(bot.sessions === undefined
            ? {}
            : {
                sessions: bot.sessions.map((session) => {
                  let projected = sessions.get(session);
                  if (projected === undefined) {
                    const { activity, ...identity } = session;
                    projected = {
                      ...identity,
                      revision: 0,
                      at,
                      ...(activity === undefined ? {} : { activity: tool(activity, at) }),
                    };
                    sessions.set(session, projected);
                  }
                  return projected;
                }),
              }),
        },
      ]),
    );
}
