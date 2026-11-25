import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import {
  createWorkspaceSessionReader,
  pathWithin,
  sessionSeedIds,
  sessionSeedMessage,
} from '../src/features/sessions/workspace-sessions.js';
import { createTempRoot } from './helpers.js';

const rows = [
  {
    sessionId: 'inside',
    cwd: '/work/app',
    title: 'Fix login',
    running: false,
    lastPromptAt: 20,
    updatedAt: 21,
  },
  { sessionId: 'nested', cwd: '/work/app/web', running: false, lastPromptAt: 30, updatedAt: 31 },
  { sessionId: 'sibling', cwd: '/work/app-old', running: false, lastPromptAt: 40, updatedAt: 41 },
  { sessionId: 'owned', cwd: '/work/app', running: false, lastPromptAt: 50, updatedAt: 51 },
  {
    sessionId: 'child',
    cwd: '/work/app',
    parentSessionId: 'inside',
    running: false,
    lastPromptAt: 60,
    updatedAt: 61,
  },
];

function reader() {
  const read = vi.fn(async (id: string) => ({
    events: [
      {
        type: 'user/message' as const,
        time: 1,
        seq: 1,
        data: { content: [{ type: 'text', text: 'Fix the login bug' }] },
      },
    ],
    seq: 1,
    running: false,
    ...(id === 'inside' ? { title: 'Fix login' } : {}),
    cwd: rows.find((row) => row.sessionId === id)!.cwd,
  }));
  const service = {
    list: vi.fn(async () => rows),
    read,
    isRoot: vi.fn(async (id: string) => id !== 'child'),
    send: vi.fn(),
  };
  const ownership = { resolve: (id: string) => (id === 'owned' ? ({} as never) : undefined) };
  return { read, service, sessions: createWorkspaceSessionReader(() => service, ownership) };
}

it('lists only unowned root Sessions whose folder lies inside an active Grant', async () => {
  const { sessions } = reader();
  expect((await sessions.list(['/work/app'])).map((row) => row.sessionId)).toEqual([
    'nested',
    'inside',
  ]);
  expect(await sessions.list([])).toEqual([]);
});

it('reads a granted Session as Markdown and refuses Sessions outside the Grants', async () => {
  const { sessions, read } = reader();
  const text = await sessions.read(['/work/app'], 'inside');
  expect(text).toContain('# Fix login');
  expect(text).toContain('## Human');
  expect(text).toContain('Fix the login bug');
  await expect(sessions.read(['/work/app'], 'sibling')).rejects.toMatchObject({
    code: 'session-outside-grant',
  });
  await expect(sessions.read(['/work/app'], 'owned')).rejects.toMatchObject({
    code: 'session-not-found',
  });
  await expect(sessions.read(['/work/app'], 'child')).rejects.toMatchObject({
    code: 'session-not-found',
  });
  expect(read).not.toHaveBeenCalledWith('owned');
});

it('compares canonical folders, so a sibling prefix or a symlink cannot escape a Grant', () => {
  const root = createTempRoot('workspace-sessions-');
  mkdirSync(join(root, 'app', 'web'), { recursive: true });
  mkdirSync(join(root, 'secret'));
  symlinkSync(join(root, 'secret'), join(root, 'app', 'link'));
  expect(pathWithin(join(root, 'app'), join(root, 'app', 'web'))).toBe(true);
  expect(pathWithin(join(root, 'app'), join(root, 'app-old'))).toBe(false);
  expect(pathWithin(join(root, 'app'), join(root, 'app', 'link'))).toBe(false);
});

it('accepts 1 to 50 well-formed Session ids and writes the seed message in the chosen language', () => {
  expect(sessionSeedIds(['b', 'a', 'b'])).toEqual(['a', 'b']);
  expect(sessionSeedIds([])).toBeUndefined();
  expect(sessionSeedIds(['../x'])).toBeUndefined();
  expect(sessionSeedIds(Array.from({ length: 51 }, (_, i) => `s${i}`))).toBeUndefined();
  const seeds = [{ sessionId: 'inside', title: 'Fix login', cwd: '/work/app' }];
  const zh = sessionSeedMessage(seeds, ['/work/app'], 'zh');
  expect(zh).toContain('workspace_sessions');
  expect(zh).toContain('- Fix login (app, `inside`)');
  expect(zh).toContain('- `/work/app`');
  expect(sessionSeedMessage(seeds, ['/work/app'], 'en')).toContain('Workspaces granted to you:');
});
