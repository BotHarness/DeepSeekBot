import { describe, expect, it } from 'vitest';
import type { RosterBot } from '../../../apps/mobile/src/host/client.js';
import { createRemoteActivityProjection } from '../src/client/remote-host-activity.js';

describe('remote activity presentation', () => {
  it('keeps received tool and session times stable across unrelated Host updates', () => {
    const project = createRemoteActivityProjection();
    const bot: RosterBot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      computerAccess: false,
      browserAccess: false,
      paused: false,
      state: 'working',
      activity: { effect: 'executing', toolName: 'bash', activeToolCount: 2 },
      sessions: [
        {
          id: 'assignment',
          role: 'assignment',
          state: 'working',
          activity: { effect: 'coding', activeToolCount: 1 },
        },
      ],
    };
    const first = project([bot], 100).get('ada')!;
    expect(first.activity).toMatchObject({
      toolKind: 'other',
      startedAt: 100,
      effect: 'executing',
      activeToolCount: 2,
      sources: [{ role: 'assignment', count: 1 }],
    });
    expect(first.sessions?.[0]).toMatchObject({
      id: 'assignment',
      at: 100,
      activity: { toolKind: 'other', startedAt: 100 },
    });
    const republished = project([{ ...bot, preview: 'new preview' }], 200).get('ada')!;
    expect(republished.activity?.startedAt).toBe(100);
    expect(republished.sessions?.[0]).toBe(first.sessions?.[0]);
    const changed = project(
      [{ ...bot, activity: { effect: 'searching', activeToolCount: 1 } }],
      300,
    );
    expect(changed.get('ada')?.activity).toMatchObject({ effect: 'searching', startedAt: 300 });
    const { activity: _activity, sessions: _sessions, ...idle } = bot;
    expect(project([{ ...idle, state: 'idle' }], 400).get('ada')).toEqual({ state: 'idle' });
    expect(project([], 500).size).toBe(0);
  });
});
