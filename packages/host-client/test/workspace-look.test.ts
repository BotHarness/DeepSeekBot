import { expect, it, vi } from 'vitest';
import { readHostSessionList, readWorkspaceLook, setWorkspaceLook } from '../src/host-sessions';

const options = { search: '', sort: 'last-human-turn', source: 'all' } as const;
const row = (sessionId: string, folderLook?: unknown) => ({
  sessionId,
  running: false,
  updatedAt: 1,
  lastPromptAt: 1,
  source: { kind: 'native' },
  ...(folderLook === undefined ? {} : { folderLook }),
});

it('keeps a Session row folder look and drops malformed parts of it', async () => {
  const call = vi.fn(async () => ({
    queryVersion: 1,
    sources: [],
    sessions: [
      row('look', { color: 'purple', icon: { kind: 'emoji', emoji: '🧪' } }),
      row('favicon', { favicon: '/api/botharness/workspace-favicon?w=k&v=1' }),
      row('monogram', { icon: { kind: 'monogram' } }),
      row('foreign', { favicon: 'https://evil.example/x.png', icon: { kind: 'lucide' } }),
      row('plain'),
    ],
  }));
  const { sessions } = await readHostSessionList({ call }, options);
  expect(sessions.map((session) => session.folderLook)).toEqual([
    { color: 'purple', icon: { kind: 'emoji', emoji: '🧪' } },
    { favicon: '/api/botharness/workspace-favicon?w=k&v=1' },
    { icon: { kind: 'monogram' } },
    undefined,
    undefined,
  ]);
});

it('reads and saves a folder look, and clears it with null', async () => {
  const call = vi
    .fn()
    .mockResolvedValueOnce({ path: '/work/site', look: null })
    .mockResolvedValueOnce({
      path: '/work/site',
      look: { color: 'teal', icon: { kind: 'symbol', id: 'globe' } },
    })
    .mockResolvedValueOnce({ path: '/work/site', look: null });
  expect(await readWorkspaceLook({ call }, '/work/site')).toBeNull();
  expect(
    await setWorkspaceLook({ call }, '/work/site', {
      color: 'teal',
      icon: { kind: 'symbol', id: 'globe' },
    }),
  ).toEqual({ color: 'teal', icon: { kind: 'symbol', id: 'globe' } });
  expect(await setWorkspaceLook({ call }, '/work/site', null)).toBeNull();
  expect(call.mock.calls).toEqual([
    ['workspaceLook', { path: '/work/site' }],
    [
      'workspaceLookSet',
      { path: '/work/site', look: { color: 'teal', icon: { kind: 'symbol', id: 'globe' } } },
    ],
    ['workspaceLookSet', { path: '/work/site', look: null }],
  ]);
});
