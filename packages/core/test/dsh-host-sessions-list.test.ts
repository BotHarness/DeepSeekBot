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
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const ctx = {
    get: (name: string) => (name === 'sessionController' ? controller : undefined),
    on: (name: string, handler: (...args: unknown[]) => void) => handlers.set(name, handler),
  };
  const sessions = dshHostSessions(ctx as never as Context, {} as DshSessionStore);
  handlers.get('api-session/error')?.('idle', 'Model provider refused the request');
  expect(await sessions.list()).toEqual([
    {
      sessionId: 'asking',
      model: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
      waiting: true,
      pendingInput: 'question',
      cwd: '/work/site',
      lastPromptAt: 2,
      running: true,
      updatedAt: 2,
    },
    { sessionId: 'busy', lastPromptAt: null, running: true, updatedAt: 3 },
    { sessionId: 'idle', failed: true, lastPromptAt: null, running: false, updatedAt: 1 },
  ]);
  expect(state.mock.calls.map(([request]) => request.sessionId)).toEqual(['asking', 'busy']);
  handlers.get('api-session/status')?.('idle', true);
  expect((await sessions.list()).find((row) => row.sessionId === 'idle')).not.toHaveProperty(
    'failed',
  );
});

it('creates a native Session in a folder or a registered DSH Workspace', async () => {
  const create = vi.fn(async () => ({ sessionId: 'created' }));
  const ctx = {
    get: (name: string) => (name === 'sessionController' ? { create } : undefined),
    on: () => () => {},
  };
  const sessions = dshHostSessions(ctx as never as Context, {} as DshSessionStore);
  expect(await sessions.create?.({ cwd: '/work/app' })).toEqual({ sessionId: 'created' });
  expect(await sessions.create?.({ workspaceId: '77e8496c-4fdc-4d42-8918-142c99f4a48f' })).toEqual({
    sessionId: 'created',
  });
  expect(await sessions.create?.({ cwd: '/work/app', sessionId: 'blank' })).toEqual({
    sessionId: 'created',
  });
  expect(create.mock.calls).toEqual([
    [{ cwd: '/work/app' }],
    [{ workspaceId: '77e8496c-4fdc-4d42-8918-142c99f4a48f' }],
    [{ cwd: '/work/app', sessionId: 'blank' }],
  ]);
});
