import type { Context } from '@deepseek-ai/cordis';
import { expect, it, vi } from 'vitest';
import { dshHostSessions } from '../src/features/sessions/dsh-host-sessions.js';
import { createSessionListChanges } from '../src/features/sessions/session-list-changes.js';
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

it('creates a native Session in a folder or a registered DSH Workspace', async () => {
  const create = vi.fn(async () => ({ sessionId: 'created' }));
  const ctx = {
    get: (name: string) => (name === 'sessionController' ? { create } : undefined),
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

it('reads Session creation times from the headers once per Host run and dates newer Sessions by their first event', async () => {
  let items = [{ sessionId: 'old', running: false, updatedAt: 50 }];
  const listSessions = vi.fn(async () => [{ header: { id: 'old', createdAt: 5 } }]);
  const controller = { list: async () => ({ items }), state: vi.fn() };
  const query = { listSessions };
  const ctx = {
    get: (name: string) =>
      name === 'sessionController' ? controller : name === 'sessionQuery' ? query : undefined,
  };
  const journal = createSessionListChanges(() => undefined, { epoch: 'run' });
  const sessions = dshHostSessions(
    ctx as never as Context,
    { get: () => undefined } as unknown as DshSessionStore,
    undefined,
    journal,
  );
  expect((await sessions.list()).map((r) => [r.sessionId, r.createdAt])).toEqual([['old', 5]]);

  items = [...items, { sessionId: 'new', running: false, updatedAt: 90 }];
  journal.changed(false, 'new', 80);
  journal.changed(false, 'new', 85);
  expect((await sessions.list()).map((r) => [r.sessionId, r.createdAt])).toEqual([
    ['old', 5],
    ['new', 80],
  ]);
  expect(listSessions).toHaveBeenCalledTimes(1);
});
