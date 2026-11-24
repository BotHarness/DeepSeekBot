import type { Context } from '@deepseek-ai/cordis';
import { expect, it, vi } from 'vitest';
import { dshHostSessions } from '../src/features/sessions/dsh-host-sessions.js';
import type { DshSessionStore } from '../src/sessions/source.js';

it('marks a running Session waiting for the Human and carries its last model', async () => {
  const state = vi.fn(async ({ sessionId }: { sessionId: string }) => ({
    cursor: 1,
    active: true,
    running: true,
    queue: [],
    pendingInput: sessionId === 'asking' ? ['question'] : [],
  }));
  const controller = {
    list: async () => ({
      items: [
        {
          sessionId: 'asking',
          running: true,
          updatedAt: 2,
          cwd: '/work/site',
          projections: {
            values: {
              modelSelection: {
                lastUsed: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
                next: null,
              },
              sessionListMetadata: { blank: false, lastPromptAt: 2 },
            },
          },
        },
        { sessionId: 'busy', running: true, updatedAt: 3 },
        { sessionId: 'idle', running: false, updatedAt: 1 },
        { sessionId: 'child', running: true, updatedAt: 4, origin: 'subagent' },
      ],
    }),
    state,
  };
  const ctx = { get: (name: string) => (name === 'sessionController' ? controller : undefined) };
  const sessions = dshHostSessions(ctx as never as Context, {} as DshSessionStore);
  expect(await sessions.list()).toEqual([
    {
      sessionId: 'asking',
      model: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
      waiting: true,
      cwd: '/work/site',
      lastPromptAt: 2,
      running: true,
      updatedAt: 2,
    },
    { sessionId: 'busy', lastPromptAt: null, running: true, updatedAt: 3 },
    { sessionId: 'idle', lastPromptAt: null, running: false, updatedAt: 1 },
  ]);
  expect(state.mock.calls.map(([request]) => request.sessionId)).toEqual(['asking', 'busy']);
});
