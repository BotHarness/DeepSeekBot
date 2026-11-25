import { expect, it, vi } from 'vitest';
import type { BridgeMethodsDeps } from '../src/bridge/methods.js';
import { OWNER_HUMAN_CONTEXT, type HumanContext } from '../src/humans/context.js';
import {
  createSessionBotMethods,
  seedMessageId,
  sessionCreationKey,
} from '../src/features/sessions/session-bot-methods.js';
import type { WorkspaceGrant } from '../src/workspaces/grants.js';

const sessions = [
  {
    sessionId: 'a1',
    cwd: '/work/app',
    title: 'Login',
    running: false,
    lastPromptAt: 1,
    updatedAt: 1,
  },
  { sessionId: 'a2', cwd: '/work/app/web', running: false, lastPromptAt: 2, updatedAt: 2 },
  { sessionId: 'b1', cwd: '/work/docs', running: false, lastPromptAt: 3, updatedAt: 3 },
  { sessionId: 'owned', cwd: '/work/app', running: false, lastPromptAt: 4, updatedAt: 4 },
  { sessionId: 'loose', running: false, lastPromptAt: 5, updatedAt: 5 },
  { sessionId: 'stray', cwd: '/tmp/elsewhere', running: false, lastPromptAt: 6, updatedAt: 6 },
];

function setup(human: HumanContext = OWNER_HUMAN_CONTEXT, owner = true) {
  const grants: WorkspaceGrant[] = [];
  const store = {
    availableWorkspaces: () => [
      { id: 'ws-work', path: '/work', title: 'work' },
      { id: 'ws-app', path: '/work/app', title: 'app' },
      { id: 'ws-docs', path: '/work/docs', title: 'docs' },
    ],
    list: (slug: string) => grants.filter((grant) => grant.botSlug === slug),
    create: vi.fn(async (slug: string, workspaceId: string) => {
      const path = store.availableWorkspaces().find((ws) => ws.id === workspaceId)!.path;
      const grant = {
        id: `g-${workspaceId}`,
        botSlug: slug,
        workspaceId,
        workspacePath: path,
        workspaceTitle: path,
        createdAt: 'now',
      };
      grants.push(grant);
      return grant;
    }),
  };
  const create = vi.fn((input: { displayName: string }, operationKey?: string) => ({
    record: { slug: 'bot-1', displayName: input.displayName },
    channelId: 'dm:bot-1',
    receipt: {
      operationKey: operationKey!,
      botSlug: 'bot-1',
      status: 'created' as const,
      channelId: 'dm:bot-1',
    },
  }));
  const send = vi.fn(async (payload: { channelId: string; body: string; messageId: string }) => ({
    ok: true as const,
    value: { message: { id: payload.messageId } },
  }));
  const deps = {
    nativeSessions: { list: async () => sessions, read: vi.fn(), isRoot: vi.fn(), send: vi.fn() },
    ownership: { resolve: (id: string) => (id === 'owned' ? {} : undefined) },
    creations: { create },
    grants: store,
  } as unknown as BridgeMethodsDeps;
  const methods = createSessionBotMethods(
    human,
    deps,
    () => owner,
    (record) => ({ bot: record as never }),
    send,
  );
  return { methods, create, send, store, grants };
}

it('creates a blank Bot, grants each Session Workspace once and sends one seed message', async () => {
  const { methods, create, send, store } = setup();
  const input = {
    displayName: 'App keeper',
    sessionIds: ['a2', 'a1', 'b1'],
    operationKey: 'sessions:test-key',
    language: 'zh',
  };
  const key = sessionCreationKey('sessions:test-key', ['a1', 'a2', 'b1']);
  const result = await methods.createFromSessions(input);
  expect(result).toMatchObject({
    ok: true,
    value: {
      channelId: 'dm:bot-1',
      seedMessageId: seedMessageId(key),
      receipt: { operationKey: 'sessions:test-key' },
    },
  });
  expect(create).toHaveBeenCalledWith({ displayName: 'App keeper' }, key);
  expect(sessionCreationKey('sessions:test-key', ['a1'])).not.toBe(key);
  expect(store.create.mock.calls.map((call) => call[1])).toEqual(['ws-app', 'ws-docs']);
  const body = send.mock.calls[0]![0].body;
  expect(body).toContain('workspace_sessions');
  expect(body).toContain('`a1`');
  expect(body).toContain('- `/work/docs`');

  await methods.createFromSessions(input);
  expect(store.create).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1]![0].messageId).toBe(send.mock.calls[0]![0].messageId);
});

it('refuses non-owners, Bot-owned or child Sessions and Sessions outside any Workspace', async () => {
  expect(
    await setup(OWNER_HUMAN_CONTEXT, false).methods.createFromSessions({
      displayName: 'x',
      sessionIds: ['a1'],
    }),
  ).toMatchObject({ ok: false, error: { code: 'permission-required' } });
  expect(
    await setup({ ...OWNER_HUMAN_CONTEXT, caller: 'bot' }).methods.createFromSessions({
      displayName: 'x',
      sessionIds: ['a1'],
    }),
  ).toMatchObject({ ok: false, error: { code: 'permission-required' } });
  const { methods, create } = setup();
  for (const [id, code] of [
    ['owned', 'session-not-found'],
    ['missing', 'session-not-found'],
    ['loose', 'session-without-workspace'],
    ['stray', 'workspace-unavailable'],
  ] as const)
    expect(await methods.createFromSessions({ displayName: 'x', sessionIds: [id] })).toMatchObject({
      ok: false,
      error: { code },
    });
  expect(await methods.createFromSessions({ displayName: 'x', sessionIds: [] })).toMatchObject({
    ok: false,
    error: { code: 'invalid-input' },
  });
  expect(create).not.toHaveBeenCalled();
});
