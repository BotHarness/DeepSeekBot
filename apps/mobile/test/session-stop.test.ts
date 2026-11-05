import { describe, expect, it, vi } from 'vitest';

import type { RosterBot } from '../src/host/client';
import {
  liveStopping,
  runningSessionCount,
  runningSessions,
  sessionKey,
  sessionStopper,
} from '../src/host/session-stop';

const bot = (
  slug: string,
  sessions: RosterBot['sessions'],
): Pick<RosterBot, 'slug' | 'sessions'> => (sessions === undefined ? { slug } : { slug, sessions });

describe('running Sessions', () => {
  const ada = bot('ada', [
    { id: 'a1', role: 'assignment', name: 'Notes', state: 'working' },
    { id: 's1', role: 'subagent', state: 'working' },
    { id: 'o1', role: 'orchestrator', state: 'thinking' },
    { id: 'a2', role: 'assignment', state: 'blocked' },
  ]);

  it('lists the Orchestrator first, then Assignments, and leaves Subagents out', () => {
    expect(runningSessions(ada).map((session) => session.id)).toEqual(['o1', 'a1', 'a2']);
    expect(runningSessions(undefined)).toEqual([]);
    expect(runningSessions(bot('idle', undefined))).toEqual([]);
  });

  it('adds the counts of every Bot for a Group header', () => {
    expect(
      runningSessionCount([ada, bot('bo', [{ id: 'o', role: 'orchestrator', state: 'working' }])]),
    ).toBe(4);
    expect(
      runningSessionCount([
        undefined,
        bot('cy', [{ id: 's', role: 'subagent', state: 'working' }]),
      ]),
    ).toBe(0);
  });

  it('keeps a Stopping mark only while its Session still runs', () => {
    const requested = new Set([sessionKey('ada', 'a1'), sessionKey('ada', 'gone')]);
    expect([...liveStopping(requested, [ada])]).toEqual([sessionKey('ada', 'a1')]);
  });
});

describe('session stopper', () => {
  it('calls sessionStop and botStop with the Channel that receives the notice', async () => {
    const call = vi.fn(async () => ({ stopped: [], alreadyIdle: [] }));
    const stopper = sessionStopper({ call } as never, 'g1');
    await stopper.stopSession('ada', 'a1');
    await stopper.stopBot('ada');
    expect(call).toHaveBeenNthCalledWith(1, 'sessionStop', {
      botSlug: 'ada',
      activityId: 'a1',
      channelId: 'g1',
    });
    expect(call).toHaveBeenNthCalledWith(2, 'botStop', { botSlug: 'ada', channelId: 'g1' });
  });

  it('omits the Channel when the stop has no Channel', async () => {
    const call = vi.fn(async () => ({}));
    await sessionStopper({ call } as never).stopBot('ada');
    expect(call).toHaveBeenCalledWith('botStop', { botSlug: 'ada' });
  });
});
