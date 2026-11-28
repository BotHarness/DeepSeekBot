import { createHash } from 'node:crypto';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type {
  CredentialKey,
  CredentialProvider,
  CredentialRecord,
} from '@deepseek-ai/dsh-credentials';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it, vi } from 'vitest';

import { createChannelStore } from '../src/channels/store.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { runConnectorCommand } from '../src/cli/cli-connectors.js';
import { googleScopes } from '../src/connectors/google-oauth.js';
import { ConnectorService } from '../src/connectors/service.js';
import { createConnectorStore } from '../src/connectors/store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { mountGoogleTools } from '../src/features/connectors/google-tools.js';
import { createConnectorsBridgeMethods } from '../src/features/connectors/methods.js';
import { connectorCallback, connectorCatalogFor } from '../src/features/connectors/plugin.js';
import { ChannelToolApproval } from '../src/workspaces/tool-approval.js';
import { createTempRoot, createTestOwnership } from './helpers.js';

const CLIENT_ID = 'demo.apps.googleusercontent.com';
const CLIENT_SECRET = 'fixture_client_secret';
const REDIRECT = 'http://127.0.0.1:3080/botharness/connectors/oauth/callback';
const accountArgs = { query: 'in:inbox' };
const sendArgs = { to: 'target@example.com', subject: 'Hello', body: 'World' };

function fixture() {
  const home = createTempRoot('botharness-google-');
  const open = () =>
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  let owner = open();
  const records = new Map<CredentialKey, CredentialRecord>();
  const credentials: Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'> = {
    readRecord: async (key) => records.get(key),
    modifyRecord: async (key, change) => {
      const previous = records.get(key);
      const next = await change(previous);
      if (next !== undefined) records.set(key, next);
      return next ?? previous;
    },
    deleteRecord: async (key) => {
      records.delete(key);
    },
  };
  const requestedScopes = new Map<string, string>();
  const tokenRequests: URLSearchParams[] = [];
  const apiRequests: { url: URL; bearer: string | null; method: string }[] = [];
  let rejectedRefresh = false;
  let now = Date.now();
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname === 'oauth2.googleapis.com') {
      if (url.pathname === '/revoke') return new Response();
      const fields = new URLSearchParams(await request.text());
      tokenRequests.push(fields);
      if (fields.get('grant_type') === 'refresh_token') {
        if (rejectedRefresh)
          return Response.json(
            { error: 'invalid_grant', error_description: CLIENT_SECRET },
            { status: 400 },
          );
        return Response.json({
          access_token: `refreshed-${fields.get('refresh_token')}`,
          expires_in: 3600,
        });
      }
      const code = fields.get('code') ?? '';
      return Response.json({
        access_token: `access-${code}`,
        refresh_token: `refresh-${code}`,
        expires_in: 3600,
        scope: requestedScopes.get(code),
      });
    }
    const bearer = request.headers.get('authorization');
    if (url.hostname === 'openidconnect.googleapis.com') {
      const work = bearer?.startsWith('Bearer access-work');
      return Response.json({
        email: work ? 'work@example.com' : 'home@example.com',
        sub: work ? '101' : '102',
      });
    }
    apiRequests.push({ url, bearer, method: request.method });
    if (url.pathname.endsWith('/messages/send')) return Response.json({ id: 'sent-1' });
    if (url.pathname.endsWith('/events') && request.method === 'POST')
      return Response.json({ id: 'event-1' });
    if (url.pathname.endsWith('/messages'))
      return Response.json({
        messages: [
          { id: bearer?.includes('work') ? 'work-mail' : 'home-mail', token: CLIENT_SECRET },
        ],
      });
    throw new Error(`Unexpected provider request ${url.pathname}`);
  };

  const start = () =>
    new ConnectorService({
      store: createConnectorStore(attachOperationalModule(owner, 'connectors')),
      credentials: () => credentials,
      google: { redirectUri: () => REDIRECT, fetcher, now: () => now },
    });
  async function finish(service: ConnectorService, link: string, code: string, scope?: string) {
    const url = new URL(link);
    const state = url.searchParams.get('state') ?? '';
    requestedScopes.set(code, scope ?? url.searchParams.get('scope') ?? '');
    return service.google.finish(new URLSearchParams({ state, code }));
  }
  return {
    service: start(),
    records,
    tokenRequests,
    apiRequests,
    finish,
    restart() {
      owner.close();
      owner = open();
      return start();
    },
    advance(ms: number) {
      now += ms;
    },
    rejectRefresh() {
      rejectedRefresh = true;
    },
    close: () => owner.close(),
  };
}

function mount(
  service: ConnectorService,
  botSlug: string,
  approval?: Pick<ChannelToolApproval, 'ask' | 'track' | 'executionGuard'>,
) {
  const tools = new Map<string, ToolDefinition>();
  const stop = mountGoogleTools({
    agentCtx: {
      tools: {
        register(tool) {
          tools.set(tool.name, tool);
          return () => {
            tools.delete(tool.name);
          };
        },
      },
    },
    botSlug,
    live: () => true,
    service,
    approval: () => approval,
  });
  const agent = {
    id: 'fixture-agent',
    session: { id: 'fixture-session', header: { cwd: '/fixture' } },
  } as Agent;
  function call(name: string, args: Record<string, unknown>, tool = tools.get(name)) {
    if (!tool) throw new Error(`Tool unavailable: ${name}`);
    const callId = ToolCallId('fixture-call');
    return tool.execute(args, {
      callId,
      rootCallId: callId,
      token: Symbol('fixture-call') as ToolRunContext['token'],
      name,
      arguments: args,
      agent,
      signal: new AbortController().signal,
      deferContext() {},
      concludeTurn() {},
    });
  }
  return { tools, call, stop };
}

describe('Google Workspace Connector Accounts', () => {
  it('offers loopback web client setup and keeps credentials out of every Owner result', async () => {
    const f = fixture();
    try {
      const callback = connectorCallback(async () => ['https://public.example.com']);
      callback.attach(() => 'http://127.0.0.1:3080');
      expect(callback.googleUrl()).toBe(REDIRECT);
      expect(await callback.url()).toContain('https://public.example.com/');
      callback.attach(() => 'http://192.0.2.1:3080');
      expect(callback.googleUrl()).toBeUndefined();

      const methods = createConnectorsBridgeMethods(
        { connectors: f.service, registry: { get: () => undefined } },
        () => true,
      );
      expect(await methods.connectorGoogleAdd({ accessToken: 'ya29.fixture' })).toMatchObject({
        ok: false,
        error: {
          code: 'invalid-input',
          message: expect.stringContaining('expire after about an hour'),
        },
      });
      expect(await methods.connectorGoogleLogin({ label: 'Work' })).toMatchObject({
        ok: false,
        error: { code: 'connector-not-configured' },
      });
      const added = await methods.connectorGoogleAdd({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
      });
      expect(added).toMatchObject({
        ok: true,
        value: {
          configured: true,
          redirectUri: REDIRECT,
          apis: expect.arrayContaining([{ id: 'gmail.googleapis.com', name: 'Gmail API' }]),
          limits: {
            testingRefreshTokenDays: 7,
            unverifiedExternalUserCap: 100,
            internalWorkspaceOnly: true,
          },
        },
      });
      expect(JSON.stringify(added)).not.toContain(CLIENT_SECRET);
      const methodsForMember = createConnectorsBridgeMethods(
        { connectors: f.service, registry: { get: () => undefined } },
        () => false,
      );
      expect(await methodsForMember.connectorGoogleSetup({})).toMatchObject({
        ok: false,
        error: { code: 'permission-required' },
      });
    } finally {
      f.close();
    }
  });

  it('uses an account chooser and single-use state with S256 PKCE', async () => {
    const f = fixture();
    try {
      const { service } = f;
      await service.google.setClient({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
      const login = await service.google.login('Work');
      const url = new URL(login.url);
      const params = url.searchParams;
      expect(params.get('prompt')?.split(' ')).toContain('select_account');
      expect(params.get('access_type')).toBe('offline');
      expect(params.get('code_challenge_method')).toBe('S256');
      expect(params.get('redirect_uri')).toBe(REDIRECT);
      expect(params.get('scope')?.split(' ')).toEqual(googleScopes('read'));
      expect(login.url).not.toContain(CLIENT_SECRET);
      const simultaneous = await Promise.allSettled([
        f.finish(service, login.url, 'work-1'),
        f.finish(service, login.url, 'work-1'),
      ]);
      expect(simultaneous.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
      expect(f.tokenRequests).toHaveLength(1);
      const exchange = f.tokenRequests[0];
      expect(exchange?.get('client_secret')).toBe(CLIENT_SECRET);
      expect(
        createHash('sha256')
          .update(exchange?.get('code_verifier') ?? '')
          .digest('base64url'),
      ).toBe(params.get('code_challenge'));
      expect(service.account(login.account.accountId)).toMatchObject({
        provider: 'google',
        status: 'active',
        identity: 'work@example.com',
        access: 'read',
      });
      expect(JSON.stringify(service.available())).not.toMatch(
        /access-work|refresh-work|fixture_client_secret/,
      );
      expect(JSON.stringify([...f.records.values()])).toContain('refresh-work-1');
      expect(JSON.stringify([...f.records.values()])).not.toContain('access-work-1');

      const abandoned = await service.google.login('Home');
      f.advance(10 * 60_000);
      await expect(f.finish(service, abandoned.url, 'home-1')).rejects.toThrow('expired');
      expect(f.tokenRequests).toHaveLength(1);
    } finally {
      f.close();
    }
  });

  it('refreshes once for concurrent calls and refreshes again after a Host restart, then expires on failure', async () => {
    const f = fixture();
    try {
      const { service } = f;
      await service.google.setClient({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
      const login = await service.google.login('Work');
      const account = await f.finish(service, login.url, 'work-1');
      service.grant('ada', account.accountId, 'read');
      service.grant('bea', account.accountId, 'read');
      const ada = mount(service, 'ada');
      const bea = mount(service, 'bea');
      f.advance(3600_000);
      await Promise.all([
        ada.call('google_gmail_search', accountArgs),
        bea.call('google_gmail_search', accountArgs),
      ]);
      expect(f.tokenRequests).toHaveLength(2);
      expect(f.apiRequests.map(({ bearer }) => bearer)).toEqual([
        'Bearer refreshed-refresh-work-1',
        'Bearer refreshed-refresh-work-1',
      ]);
      ada.stop();
      bea.stop();

      const restarted = f.restart();
      const afterRestart = mount(restarted, 'ada');
      expect(await afterRestart.call('google_gmail_search', accountArgs)).toBe(
        '{"messages":[{"id":"work-mail"}]}',
      );
      expect(f.tokenRequests).toHaveLength(3);
      expect(f.tokenRequests[2]?.get('refresh_token')).toBe('refresh-work-1');
      f.advance(3600_000);
      f.rejectRefresh();
      await expect(afterRestart.call('google_gmail_search', accountArgs)).rejects.toThrow(
        'Sign in to this Google Workspace account again.',
      );
      expect(restarted.account(account.accountId)?.status).toBe('expired');
      expect(afterRestart.tools.size).toBe(0);
      expect(f.apiRequests).toHaveLength(3);
      afterRestart.stop();
    } finally {
      f.close();
    }
  });

  it('pins separate accounts by Bot and requires a label only when more than one can serve the tool', async () => {
    const f = fixture();
    try {
      const { service } = f;
      await service.google.setClient({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
      const work = await service.google.login('Work');
      const home = await service.google.login('Home');
      await f.finish(service, work.url, 'work-1');
      await f.finish(service, home.url, 'home-1');
      service.grant('ada', work.account.accountId, 'read');
      service.grant('bea', home.account.accountId, 'read');
      const ada = mount(service, 'ada');
      const bea = mount(service, 'bea');
      expect(await ada.call('google_gmail_search', accountArgs)).toContain('work-mail');
      expect(await bea.call('google_gmail_search', accountArgs)).toContain('home-mail');
      await expect(
        bea.call('google_gmail_search', { ...accountArgs, account: 'Work' }),
      ).rejects.toThrow();
      service.grant('ada', home.account.accountId, 'read');
      await expect(ada.call('google_gmail_search', accountArgs)).rejects.toThrow();
      expect(await ada.call('google_gmail_search', { ...accountArgs, account: 'Home' })).toContain(
        'home-mail',
      );
      const second = await service.reconnect(work.account.accountId);
      await expect(f.finish(service, second.url ?? '', 'home-2')).rejects.toThrow(
        'originally connected',
      );
      const oldHomeTool = bea.tools.get('google_gmail_search');
      service.grant('bea', home.account.accountId, undefined);
      await expect(bea.call('google_gmail_search', accountArgs, oldHomeTool)).rejects.toThrow(
        'no longer has',
      );
      ada.stop();
      bea.stop();
    } finally {
      f.close();
    }
  });

  it('exposes writes only with both Write consent and a Write grant, and checks approval before sending', async () => {
    const f = fixture();
    try {
      const { service } = f;
      await service.google.setClient({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
      const login = await service.google.login('Work');
      const work = await f.finish(service, login.url, 'work-1');
      service.grant('ada', work.accountId, 'write');
      service.grant('bea', work.accountId, 'read');
      const ask = vi.fn<ChannelToolApproval['ask']>().mockResolvedValue('rejected');
      const allow = vi.fn().mockReturnValue(true);
      const track = vi.fn<ChannelToolApproval['track']>().mockReturnValue(() => {});
      const ada = mount(service, 'ada', { ask, track, executionGuard: () => allow });
      const bea = mount(service, 'bea');
      expect(ada.tools.has('google_gmail_send')).toBe(false);
      const upgrade = await service.reconnect(work.accountId);
      expect(new URL(upgrade.url ?? '').searchParams.get('scope')?.split(' ')).toEqual(
        googleScopes('write'),
      );
      const partial = await f.finish(
        service,
        upgrade.url ?? '',
        'work-partial',
        googleScopes('read').join(' '),
      );
      expect(partial.access).toBe('read');
      const retry = await service.reconnect(work.accountId);
      await f.finish(service, retry.url ?? '', 'work-2');
      expect(connectorCatalogFor(service, 'ada', false).granted[0]?.tools).toContain(
        'google_gmail_send',
      );
      expect(bea.tools.has('google_gmail_send')).toBe(false);
      await expect(ada.call('google_gmail_send', sendArgs)).rejects.toThrow('rejected');
      expect(track.mock.calls[0]?.[0].arguments).toMatchObject({ ...sendArgs, account: 'Work' });
      expect(f.apiRequests).toHaveLength(0);
      ask.mockResolvedValue('allowed-once');
      allow.mockReturnValueOnce(false);
      await expect(ada.call('google_gmail_send', sendArgs)).rejects.toThrow('changed');
      expect(f.apiRequests).toHaveLength(0);
      expect(await ada.call('google_gmail_send', sendArgs)).toContain('sent-1');
      expect(f.apiRequests.at(-1)).toMatchObject({
        bearer: 'Bearer access-work-2',
        method: 'POST',
      });
      ask.mockImplementationOnce(async () => {
        service.grant('ada', work.accountId, undefined);
        return 'allowed-once';
      });
      await expect(ada.call('google_gmail_send', sendArgs)).rejects.toThrow('no longer has');
      expect(f.apiRequests).toHaveLength(1);
      const downgrade = await service.reconnect(work.accountId);
      expect(new URL(downgrade.url ?? '').searchParams.get('scope')?.split(' ')).toEqual(
        googleScopes('read'),
      );
      ada.stop();
      bea.stop();
    } finally {
      f.close();
    }
  });

  it.each([
    { name: 'google_gmail_send', args: sendArgs },
    {
      name: 'google_calendar_create_event',
      args: {
        summary: 'Planning',
        start: '2026-11-28T09:00:00Z',
        end: '2026-11-28T10:00:00Z',
      },
    },
  ])('asks for approval under Full Access before $name reaches Google', async ({ name, args }) => {
    const f = fixture();
    const { service } = f;
    const channels = createChannelStore({ rootDir: createTempRoot('bh-google-approval-') });
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    if (!dm) throw new Error('Missing approval DM');
    const ownership = createTestOwnership({
      'fixture-session': { botSlug: 'ada', rootRole: 'orchestrator' },
    });
    const approval = new ChannelToolApproval(
      channels,
      ownership,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      () => true,
    );
    const ada = mount(service, 'ada', approval);
    try {
      await service.google.setClient({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
      const login = await service.google.login('Work');
      service.grant('ada', login.account.accountId, 'write');
      const consent = await service.reconnect(login.account.accountId);
      await f.finish(service, consent.url ?? '', 'work-write');
      const result = ada.call(name, args).catch((error: unknown) => error);
      await vi.waitFor(() => expect(channels.readMessages(dm.id)).toHaveLength(1));
      const [card] = channels.readMessages(dm.id);
      if (!card) throw new Error('Missing approval card');
      expect(card.toolApprovalRequest).toMatchObject({
        toolName: name,
        effects: { changes: 'irreversible', reach: 'external' },
        externalDecision: 'each-use',
      });
      expect(f.apiRequests).toHaveLength(0);
      expect(await approval.decide(OWNER_HUMAN_CONTEXT, 'ada', card.id, 'rejected')).toBe(true);
      expect(await result).toMatchObject({ message: expect.stringContaining('rejected') });
      expect(f.apiRequests).toHaveLength(0);
    } finally {
      ada.stop();
      approval.close();
      f.close();
    }
  });

  it('maps nested CLI commands to the Owner bridge and reads the client secret from stdin', async () => {
    const rpc = vi.fn();
    const connect = async () => rpc;
    const io = { readStdin: async () => ` ${CLIENT_SECRET}\n` };
    await runConnectorCommand('connector', ['setup', 'google'], {}, io, connect);
    await runConnectorCommand(
      'connector',
      ['add', 'google'],
      { 'client-id': CLIENT_ID, 'client-secret-stdin': true },
      io,
      connect,
    );
    await runConnectorCommand('connector', ['login', 'google'], { account: 'Work' }, io, connect);
    expect(rpc.mock.calls).toEqual([
      ['connectorGoogleSetup', {}],
      ['connectorGoogleAdd', { input: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET } }],
      ['connectorGoogleLogin', { label: 'Work' }],
    ]);
    await expect(
      runConnectorCommand('connector', ['add', 'google'], {}, io, connect),
    ).rejects.toThrow('expire after about an hour');
    await expect(
      runConnectorCommand('connector', ['login', 'google'], {}, io, connect),
    ).rejects.toThrow('--account');
  });
});
