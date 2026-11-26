import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import type { BridgeMethodsDeps } from '../src/bridge/methods.js';
import { BotCreationError, type BotCreationReceipt } from '../src/bots/creation.js';
import { OWNER_HUMAN_CONTEXT, type HumanContext } from '../src/humans/context.js';
import {
  createSessionBotMethods,
  seedMessageId,
  tooBroadToAdd,
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
  {
    sessionId: 'a2',
    cwd: '/work/app/web',
    running: false,
    lastPromptAt: 2,
    updatedAt: 2,
  },
  {
    sessionId: 'b1',
    cwd: '/work/docs',
    running: false,
    lastPromptAt: 3,
    updatedAt: 3,
  },
  {
    sessionId: 'owned',
    cwd: '/work/app',
    running: false,
    lastPromptAt: 4,
    updatedAt: 4,
  },
  { sessionId: 'loose', running: false, lastPromptAt: 5, updatedAt: 5 },
  {
    sessionId: 'stray',
    cwd: '/tmp/elsewhere',
    running: false,
    lastPromptAt: 6,
    updatedAt: 6,
  },
];

function setup(
  human: HumanContext = OWNER_HUMAN_CONTEXT,
  owner = true,
  extra: Partial<
    Pick<BridgeMethodsDeps, 'externalSessions' | 'registerWorkspace' | 'telemetry'>
  > = {},
  nativeList: () => Promise<typeof sessions> = async () => sessions,
) {
  const grants: WorkspaceGrant[] = [];
  const registered: { id: string; path: string; title: string }[] = [];
  const store = {
    availableWorkspaces: () => [
      { id: 'ws-work', path: '/work', title: 'work' },
      { id: 'ws-app', path: '/work/app', title: 'app' },
      { id: 'ws-docs', path: '/work/docs', title: 'docs' },
      ...registered,
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
  const send = vi.fn<Parameters<typeof createSessionBotMethods>[4]>(async (payload) => ({
    ok: true,
    value: { message: { id: payload.messageId } },
  }));
  const receipts = new Map<string, string>();
  const fingerprint = (input: unknown, scope: unknown) => JSON.stringify({ input, scope });
  const creations = {
    lookup: vi.fn(
      (
        key: string,
        input: { displayName: string },
        scope?: unknown,
      ): BotCreationReceipt | undefined => {
        const stored = receipts.get(key);
        if (stored === undefined) return undefined;
        if (stored !== fingerprint(input, scope))
          throw new BotCreationError('creation-key-conflict', 'key reused');
        return create(input, key).receipt;
      },
    ),
    create: vi.fn((input: { displayName: string }, key?: string, scope?: unknown) => {
      if (key !== undefined) {
        const stored = receipts.get(key);
        if (stored !== undefined && stored !== fingerprint(input, scope))
          throw new BotCreationError('creation-key-conflict', 'key reused');
        receipts.set(key, fingerprint(input, scope));
      }
      return create(input, key);
    }),
  };
  const deps = {
    nativeSessions: {
      list: nativeList,
      read: vi.fn(),
      isRoot: vi.fn(),
      send: vi.fn(),
    },
    ownership: { resolve: (id: string) => (id === 'owned' ? {} : undefined) },
    creations,
    grants: store,
    ...extra,
    ...(extra.registerWorkspace === undefined
      ? {}
      : {
          registerWorkspace: async (path: string) => {
            const added = await extra.registerWorkspace!(path);
            registered.push(added);
            return added;
          },
        }),
  } as unknown as BridgeMethodsDeps;
  const methods = createSessionBotMethods(
    human,
    deps,
    () => owner,
    (record) => ({ bot: record as never }),
    send,
  );
  return { methods, create: creations.create, lookup: creations.lookup, send, store, grants };
}

it('creates a blank Bot, grants each Session Workspace once and sends one seed message', async () => {
  const { methods, create, send, store } = setup();
  const input = {
    displayName: 'App keeper',
    sessionIds: ['a2', 'a1', 'b1'],
    operationKey: 'sessions:test-key',
    language: 'zh',
  };
  const result = await methods.createFromSessions(input);
  expect(result).toMatchObject({
    ok: true,
    value: {
      channelId: 'dm:bot-1',
      seedMessageId: seedMessageId('sessions:test-key'),
      receipt: { operationKey: 'sessions:test-key' },
    },
  });
  expect(create).toHaveBeenCalledWith({ displayName: 'App keeper' }, 'sessions:test-key', {
    kind: 'sessions-v1',
    sessionIds: ['a1', 'a2', 'b1'],
  });
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
    await setup({
      ...OWNER_HUMAN_CONTEXT,
      caller: 'bot',
    }).methods.createFromSessions({
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

it('refuses creation when the previewed Workspaces differ from the ones the Host resolves', async () => {
  const { methods, create, store } = setup();
  expect(
    await methods.createFromSessions({
      displayName: 'x',
      sessionIds: ['a1', 'b1'],
      workspacePaths: ['/work/app'],
    }),
  ).toMatchObject({ ok: false, error: { code: 'workspace-preview-changed' } });
  expect(create).not.toHaveBeenCalled();
  expect(store.create).not.toHaveBeenCalled();
  expect(
    await methods.createFromSessions({
      displayName: 'x',
      sessionIds: ['a1', 'b1'],
      workspacePaths: ['/work/docs', '/work/app'],
    }),
  ).toMatchObject({ ok: true });
});

it('creates from Claude Code sessions, adds their folder as a Workspace only when asked and records the products', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'cc-app-'));
  const nested = join(folder, 'web');
  mkdirSync(nested);
  const externalSessions = {
    list: async () => [
      {
        sessionId: 'claude-code:s1',
        source: 'claude-code' as const,
        title: 'Fix login',
        cwd: folder,
        lastActivityAt: 9,
      },
      {
        sessionId: 'codex:s2',
        source: 'codex' as const,
        cwd: nested,
        lastActivityAt: 8,
      },
    ],
    read: vi.fn(),
  };
  const registerWorkspace = vi.fn(async (path: string) => ({
    id: 'ws-new',
    path,
    title: 'new',
  }));
  const capture = vi.fn();
  const refused = setup(OWNER_HUMAN_CONTEXT, true, {
    externalSessions,
    registerWorkspace,
  });
  expect(
    await refused.methods.createFromSessions({
      displayName: 'Importer',
      sessionIds: ['claude-code:s1'],
      operationKey: 'sessions:import-refused',
    }),
  ).toMatchObject({ ok: false, error: { code: 'workspace-unavailable' } });
  expect(registerWorkspace).not.toHaveBeenCalled();

  const { methods, send, grants } = setup(OWNER_HUMAN_CONTEXT, true, {
    externalSessions,
    registerWorkspace,
    telemetry: { status: vi.fn(), setPreference: vi.fn(), capture },
  });
  expect(
    await methods.createFromSessions({
      displayName: 'Importer',
      sessionIds: ['claude-code:s1', 'codex:s2', 'a1'],
      operationKey: 'sessions:import-changed',
      addWorkspaces: true,
      workspacePaths: ['/work/app'],
    }),
  ).toMatchObject({ ok: false, error: { code: 'workspace-preview-changed' } });
  expect(registerWorkspace).not.toHaveBeenCalled();

  const result = await methods.createFromSessions({
    displayName: 'Importer',
    sessionIds: ['claude-code:s1', 'codex:s2', 'a1'],
    operationKey: 'sessions:import-key',
    addWorkspaces: true,
    workspacePaths: ['/work/app', folder],
    language: 'en',
  });
  expect(result.ok).toBe(true);
  expect(registerWorkspace).toHaveBeenCalledTimes(1);
  expect(registerWorkspace).toHaveBeenCalledWith(folder);
  expect(grants.map((grant) => grant.workspaceId).sort()).toEqual(['ws-app', 'ws-new']);
  const body = send.mock.calls[0]![0].body;
  expect(body).toContain('DeepSeek, Claude Code, Codex sessions of mine');
  expect(body).toContain('Fix login (Claude Code, ');
  expect(body).toContain('`codex:s2`');
  expect(capture).toHaveBeenCalledWith('bot_library:sessions_import', {
    has_deepseek: true,
    has_claude_code: true,
    has_codex: true,
    added_workspace: true,
  });
  expect(
    await methods.createFromSessions({
      displayName: 'Importer',
      sessionIds: ['claude-code:missing'],
      operationKey: 'sessions:import-missing',
    }),
  ).toMatchObject({ ok: false, error: { code: 'session-not-found' } });
});

it('lists sessions from other products only for the Host Owner', async () => {
  const externalSessions = { list: async () => [], read: vi.fn() };
  expect(
    await setup(OWNER_HUMAN_CONTEXT, true, {
      externalSessions,
    }).methods.externalSessions(),
  ).toEqual({ ok: true, value: { sessions: [] } });
  expect(
    await setup(OWNER_HUMAN_CONTEXT, false, {
      externalSessions,
    }).methods.externalSessions(),
  ).toMatchObject({ ok: false, error: { code: 'permission-required' } });
});

it('refuses to add the disk root, the home folder or agent config as a Workspace', async () => {
  expect(tooBroadToAdd('/', '/home/me')).toBe(true);
  expect(tooBroadToAdd('/home/me/', '/home/me')).toBe(true);
  expect(tooBroadToAdd('/home/me/.claude/projects', '/home/me')).toBe(true);
  expect(tooBroadToAdd('/home/me/.ssh', '/home/me')).toBe(true);
  expect(tooBroadToAdd('/home/me/code/app', '/home/me')).toBe(false);
  const home = mkdtempSync(join(tmpdir(), 'home-'));
  const link = join(mkdtempSync(join(tmpdir(), 'links-')), 'home-link');
  symlinkSync(home, link);
  expect(tooBroadToAdd(link, home)).toBe(true);
  const rootLink = `${link}-root`;
  symlinkSync('/', rootLink);
  expect(tooBroadToAdd(rootLink, home)).toBe(true);
  const registerWorkspace = vi.fn(async (path: string) => ({
    id: 'ws-new',
    path,
    title: 'new',
  }));
  const externalSessions = {
    list: async () => [
      {
        sessionId: 'codex:root',
        source: 'codex' as const,
        cwd: '/',
        lastActivityAt: 1,
      },
    ],
    read: vi.fn(),
  };
  const { methods } = setup(OWNER_HUMAN_CONTEXT, true, {
    externalSessions,
    registerWorkspace,
  });
  expect(
    await methods.createFromSessions({
      displayName: 'Importer',
      sessionIds: ['codex:root'],
      operationKey: 'sessions:import-root',
      addWorkspaces: true,
    }),
  ).toMatchObject({ ok: false, error: { code: 'workspace-too-broad' } });
  expect(registerWorkspace).not.toHaveBeenCalled();
});

it('imports other products when DeepSeek Sessions cannot be listed, and refuses a moved Workspace', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'cx-app-'));
  const externalSessions = {
    list: async () => [
      {
        sessionId: 'codex:s1',
        source: 'codex' as const,
        cwd: folder,
        lastActivityAt: 1,
      },
    ],
    read: vi.fn(),
  };
  const offline = async () => {
    throw new Error('offline');
  };
  const moved = setup(
    OWNER_HUMAN_CONTEXT,
    true,
    {
      externalSessions,
      registerWorkspace: async () => ({
        id: 'ws-new',
        path: '/elsewhere',
        title: 'new',
      }),
    },
    offline,
  );
  const request = {
    displayName: 'Importer',
    sessionIds: ['codex:s1'],
    operationKey: 'sessions:import-offline',
    addWorkspaces: true,
  };
  expect(await moved.methods.createFromSessions(request)).toMatchObject({
    ok: false,
    error: { code: 'workspace-preview-changed' },
  });
  expect(moved.create).not.toHaveBeenCalled();
  const ok = setup(
    OWNER_HUMAN_CONTEXT,
    true,
    {
      externalSessions,
      registerWorkspace: async (path: string) => ({
        id: 'ws-new',
        path,
        title: 'new',
      }),
    },
    offline,
  );
  expect(await ok.methods.createFromSessions(request)).toMatchObject({
    ok: true,
  });
});

it('holds an operation key while folders are added, so a concurrent request cannot claim it', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'cx-race-'));
  const externalSessions = {
    list: async () => [
      {
        sessionId: 'codex:r1',
        source: 'codex' as const,
        cwd: folder,
        lastActivityAt: 1,
      },
    ],
    read: vi.fn(),
  };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const registerWorkspace = vi.fn(async (path: string) => {
    await gate;
    return { id: 'ws-new', path, title: 'new' };
  });
  const { methods } = setup(OWNER_HUMAN_CONTEXT, true, {
    externalSessions,
    registerWorkspace,
  });
  const request = {
    displayName: 'Importer',
    sessionIds: ['codex:r1'],
    operationKey: 'sessions:import-race',
    addWorkspaces: true,
  };
  const first = methods.createFromSessions(request);
  await vi.waitFor(() => expect(registerWorkspace).toHaveBeenCalledTimes(1));
  expect(await methods.createFromSessions({ ...request, displayName: 'Other' })).toMatchObject({
    ok: false,
    error: { code: 'creation-in-progress' },
  });
  release();
  expect(await first).toMatchObject({ ok: true });
  expect(registerWorkspace).toHaveBeenCalledTimes(1);
});

it('retries a failed seed send under the same key without a second Bot, grant or import event', async () => {
  const capture = vi.fn();
  const { methods, create, send, store } = setup(OWNER_HUMAN_CONTEXT, true, {
    telemetry: { status: vi.fn(), setPreference: vi.fn(), capture },
  });
  send.mockResolvedValueOnce({ ok: false, error: { code: 'send-failed', message: 'down' } });
  const input = {
    displayName: 'Retry',
    sessionIds: ['a1', 'b1'],
    operationKey: 'sessions:retry',
  };
  expect(await methods.createFromSessions(input)).toMatchObject({
    ok: false,
    error: { code: 'send-failed' },
  });
  expect(await methods.createFromSessions({ ...input, sessionIds: ['b1', 'a1'] })).toMatchObject({
    ok: true,
    value: {
      channelId: 'dm:bot-1',
      receipt: { operationKey: 'sessions:retry' },
    },
  });
  expect(create).toHaveBeenCalledTimes(2);
  expect(store.create).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1]![0].messageId).toBe(send.mock.calls[0]![0].messageId);
  expect(capture).toHaveBeenCalledTimes(1);
  expect(await methods.createFromSessions({ ...input, sessionIds: ['a1'] })).toMatchObject({
    ok: false,
    error: { code: 'creation-key-conflict' },
  });
});

it('records the import when a retry finishes a Bot that an earlier attempt only reserved', async () => {
  const capture = vi.fn();
  const { methods, lookup } = setup(OWNER_HUMAN_CONTEXT, true, {
    telemetry: { status: vi.fn(), setPreference: vi.fn(), capture },
  });
  lookup.mockReturnValueOnce({
    operationKey: 'sessions:reserved',
    botSlug: 'bot-1',
    status: 'reserved',
  });
  expect(
    await methods.createFromSessions({
      displayName: 'Reserved',
      sessionIds: ['a1'],
      operationKey: 'sessions:reserved',
    }),
  ).toMatchObject({ ok: true });
  expect(capture).toHaveBeenCalledTimes(1);
});
