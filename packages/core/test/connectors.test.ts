import { describe, expect, it } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createConnectorStore } from '../src/connectors/store.js';
import { ConnectorError, ConnectorService, connectorAccess } from '../src/connectors/service.js';
import { createComposioClient, type ComposioClient } from '../src/connectors/composio.js';
import { connectorToolDenial, readOnlyTool } from '../src/connectors/policy.js';
import { connectorAccessMap, connectorCatalogFor } from '../src/connectors/mount.js';
import { runConnectorCommand } from '../src/bots/cli-connectors.js';
import { createTempRoot } from './helpers.js';

function credentials() {
  const records = new Map<string, { kind: 'grant'; payload: unknown }>();
  return {
    records,
    provider: {
      readRecord: async (key: string) => records.get(key),
      modifyRecord: async (
        key: string,
        change: (current: unknown) => Promise<{ kind: 'grant'; payload: unknown }>,
      ) => {
        records.set(key, await change(records.get(key)));
      },
      deleteRecord: async (key: string) => {
        records.delete(key);
      },
    },
  };
}

function fakeClient(overrides: Partial<ComposioClient> = {}) {
  const calls: Array<[string, ...unknown[]]> = [];
  const client: ComposioClient = {
    verify: async (apiKey) => {
      calls.push(['verify', apiKey]);
    },
    link: async (apiKey, userId, service, alias) => {
      calls.push(['link', apiKey, userId, service, alias]);
      return {
        url: 'https://connect.composio.dev/link/abc',
        accountId: 'ca_' + service,
      };
    },
    accounts: async (apiKey, userId) => {
      calls.push(['accounts', apiKey, userId]);
      return [
        {
          id: 'ca_gmail',
          service: 'gmail',
          status: 'active',
          identity: 'Work inbox',
        },
      ];
    },
    removeAccount: async (apiKey, accountId) => {
      calls.push(['removeAccount', apiKey, accountId]);
    },
    session: async (apiKey, userId, pinned) => {
      calls.push(['session', apiKey, userId, pinned]);
      return {
        sessionId: 'trs_1',
        url: 'https://backend.composio.dev/tool_router/trs_1/mcp',
      };
    },
    ...overrides,
  };
  return { client, calls };
}

function setup(client: ComposioClient) {
  const home = createTempRoot('botharness-connectors-');
  const owner = mountOperationalDatabase({
    dshHome: home,
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
  });
  const store = createConnectorStore(attachOperationalModule(owner, 'connectors'));
  const vault = credentials();
  const changes: string[] = [];
  const service = new ConnectorService({
    store,
    credentials: () => vault.provider as never,
    client,
  });
  service.onChange(() => changes.push('changed'));
  return { owner, store, service, vault, changes };
}

describe('connector accounts and grants', () => {
  it('stores the key, links an account, syncs it, grants it and pins the Bot session', async () => {
    const { client, calls } = fakeClient();
    const { owner, service, vault, changes } = setup(client);
    try {
      await expect(service.connect({ service: 'gmail' })).rejects.toMatchObject({
        code: 'not-configured',
      });
      const configured = await service.setKey('ak_test_key_1234');
      expect(configured.configured).toBe(true);
      expect(JSON.stringify([...vault.records.values()])).toContain('ak_test_key_1234');
      expect(JSON.stringify(configured)).not.toContain('ak_test_key_1234');
      const { account, url } = await service.connect({
        service: 'Gmail',
        label: 'Work Gmail',
      });
      expect(url).toBe('https://connect.composio.dev/link/abc');
      expect(account).toMatchObject({
        service: 'gmail',
        label: 'Work Gmail',
        status: 'pending',
      });
      await expect(
        service.connect({ service: 'gmail', label: 'Work Gmail' }),
      ).rejects.toMatchObject({
        code: 'invalid',
      });
      expect(await service.session('ada')).toBeUndefined();
      service.grant('ada', account.accountId, 'read');
      expect(await service.session('ada')).toBeUndefined();
      const refreshed = await service.refresh();
      expect(refreshed.accounts[0]).toMatchObject({
        status: 'active',
        identity: 'Work inbox',
        grants: [{ botSlug: 'ada', access: 'read' }],
      });
      expect(connectorAccessMap(service, 'ada')).toEqual({ gmail: 'read' });
      const session = await service.session('ada');
      expect(session).toMatchObject({
        url: 'https://backend.composio.dev/tool_router/trs_1/mcp',
        headers: { 'x-api-key': 'ak_test_key_1234' },
      });
      await service.session('ada');
      expect(calls.filter(([name]) => name === 'session')).toHaveLength(1);
      expect(calls.find(([name]) => name === 'session')?.[3]).toEqual({
        gmail: ['ca_gmail'],
      });
      service.grant('ada', account.accountId, 'write');
      expect(connectorAccessMap(service, 'ada')).toEqual({ gmail: 'write' });
      const relinked = await service.reconnect(account.accountId);
      expect(relinked.url).toBe('https://connect.composio.dev/link/abc');
      expect(relinked.account).toMatchObject({ accountId: account.accountId, status: 'pending' });
      expect(calls.slice(-2).map(([name]) => name)).toEqual(['removeAccount', 'link']);
      expect(service.forBot('ada')).toMatchObject([
        { accountId: account.accountId, access: 'write' },
      ]);
      await expect(service.reconnect('missing')).rejects.toMatchObject({ code: 'not-found' });
      await service.refresh();
      expect(service.grant('ada', account.accountId, undefined)).toBe(true);
      expect(service.forBot('ada')).toEqual([]);
      expect(() => service.grant('ada', 'missing', 'read')).toThrow(ConnectorError);
      expect(await service.remove(account.accountId)).toBe(true);
      expect(calls.at(-1)).toEqual(['removeAccount', 'ak_test_key_1234', 'ca_gmail']);
      expect((await service.view()).accounts).toEqual([]);
      expect(changes.length).toBeGreaterThan(3);
      await service.clearKey();
      expect((await service.view()).configured).toBe(false);
      expect(vault.records.size).toBe(0);
    } finally {
      owner.close();
    }
  });

  it('erases a deleted Bot grants and keeps the Host accounts', async () => {
    const { client } = fakeClient();
    const { owner, service } = setup(client);
    try {
      await service.setKey('ak_test_key_1234');
      const { account } = await service.connect({ service: 'notion' });
      service.grant('ada', account.accountId, 'write');
      service.grant('bob', account.accountId, 'read');
      await service.eraseBot('ada');
      expect(service.forBot('ada')).toEqual([]);
      expect(service.forBot('bob')).toHaveLength(1);
      expect(service.available()).toHaveLength(1);
    } finally {
      owner.close();
    }
  });

  it('reports a rejected key without saving it', async () => {
    const { client } = fakeClient({
      verify: async () => {
        const { ComposioError } = await import('../src/connectors/composio.js');
        throw new ComposioError(401, 'Composio returned HTTP 401');
      },
    });
    const { owner, service, vault } = setup(client);
    try {
      await expect(service.setKey('ak_bad_key_1234')).rejects.toMatchObject({
        code: 'invalid',
      });
      await expect(service.setKey('short')).rejects.toMatchObject({
        code: 'invalid',
      });
      expect(vault.records.size).toBe(0);
    } finally {
      owner.close();
    }
  });

  it('names the missing permission when the key is read-only', async () => {
    const { client } = fakeClient({
      link: async () => {
        const { ComposioError } = await import('../src/connectors/composio.js');
        throw new ComposioError(
          403,
          'Composio returned HTTP 403',
          'APIKey_InsufficientPermissions',
        );
      },
    });
    const { owner, service } = setup(client);
    try {
      await service.setKey('ak_read_only_1234');
      await expect(service.connect({ service: 'gmail' })).rejects.toMatchObject({
        code: 'invalid',
        message: expect.stringContaining('write access to Session management'),
      });
    } finally {
      owner.close();
    }
  });

  it('resolves the strongest access through the grant resolver', () => {
    const grants = [
      {
        botSlug: 'ada',
        accountId: 'a',
        access: 'read' as const,
        grantedAt: '',
      },
      {
        botSlug: 'ada',
        accountId: 'b',
        access: 'write' as const,
        grantedAt: '',
      },
    ];
    expect(connectorAccess(grants, 'a')).toBe('read');
    expect(connectorAccess(grants, 'b')).toBe('write');
    expect(connectorAccess(grants, 'c')).toBeUndefined();
  });
});

describe('connector tool policy', () => {
  it('classifies Composio tool slugs as read-only only when they only read', () => {
    expect(readOnlyTool('GMAIL_FETCH_EMAILS', 'gmail')).toBe(true);
    expect(readOnlyTool('GOOGLECALENDAR_EVENTS_LIST', 'googlecalendar')).toBe(true);
    expect(readOnlyTool('GMAIL_SEND_EMAIL', 'gmail')).toBe(false);
    expect(readOnlyTool('GMAIL_CREATE_EMAIL_DRAFT', 'gmail')).toBe(false);
    expect(readOnlyTool('GITHUB_LIST_AND_DELETE', 'github')).toBe(false);
    expect(readOnlyTool('NOTION_PAGE', 'notion')).toBe(false);
  });

  it('allows discovery, gates execution by service and access, and refuses sandboxes', () => {
    const access = { gmail: 'read', googlecalendar: 'write' } as const;
    const tool = (raw: string) => 'mcp__composio__' + raw;
    expect(connectorToolDenial('bash', {}, access)).toBeUndefined();
    expect(connectorToolDenial(tool('COMPOSIO_SEARCH_TOOLS'), {}, access)).toBeUndefined();
    expect(
      connectorToolDenial(
        tool('COMPOSIO_MULTI_EXECUTE_TOOL'),
        {
          tools: [
            { tool_slug: 'GMAIL_FETCH_EMAILS', arguments: {} },
            { tool_slug: 'GOOGLECALENDAR_CREATE_EVENT', arguments: {} },
          ],
        },
        access,
      ),
    ).toBeUndefined();
    expect(
      connectorToolDenial(
        tool('COMPOSIO_MULTI_EXECUTE_TOOL'),
        { tools: [{ tool_slug: 'GMAIL_SEND_EMAIL', arguments: {} }] },
        access,
      ),
    ).toContain('read-only');
    expect(
      connectorToolDenial(
        tool('COMPOSIO_MULTI_EXECUTE_TOOL'),
        { tools: [{ tool_slug: 'SLACK_FETCH_MESSAGES' }] },
        access,
      ),
    ).toContain('not granted');
    expect(
      connectorToolDenial(tool('COMPOSIO_MULTI_EXECUTE_TOOL'), { tools: [] }, access),
    ).toContain('tool_slug');
    expect(connectorToolDenial(tool('COMPOSIO_REMOTE_WORKBENCH'), {}, access)).toContain(
      'not available',
    );
    expect(connectorToolDenial(tool('GMAIL_SEND_EMAIL'), {}, access)).toContain('read-only');
    expect(connectorToolDenial(tool('COMPOSIO_SEARCH_TOOLS'), {}, {})).toContain(
      'No App connection',
    );
  });
});

describe('connector catalog for a Bot', () => {
  it('lists granted and requestable accounts and narrows the catalog by the user words', async () => {
    const { client } = fakeClient();
    const { owner, service } = setup(client);
    try {
      expect(connectorCatalogFor(service, 'ada', false).next).toContain('Composio API key');
      await service.setKey('ak_test_key_1234');
      const { account } = await service.connect({ service: 'gmail' });
      await service.refresh();
      const requestable = connectorCatalogFor(service, 'ada', true, '能不能帮我看一下 email');
      expect(requestable.requestable).toEqual([
        {
          account_id: account.accountId,
          service: 'gmail',
          name: 'Gmail',
          label: 'Gmail',
        },
      ]);
      expect(requestable.catalog.map((entry) => entry.service)).toEqual(['gmail', 'outlook']);
      expect(requestable.next).toContain('connector_request');
      service.grant('ada', account.accountId, 'read');
      const granted = connectorCatalogFor(service, 'ada', true);
      expect(granted.granted).toMatchObject([
        { service: 'gmail', access: 'read', status: 'active' },
      ]);
      expect(granted.requestable).toEqual([]);
      expect(granted.next).toContain('COMPOSIO_MULTI_EXECUTE_TOOL');
      expect(JSON.stringify(granted)).not.toContain('ak_test_key_1234');
    } finally {
      owner.close();
    }
  });
});

describe('Composio client', () => {
  it('sends the key header, pins accounts in the session and rejects an untrusted MCP URL', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    let mcpUrl = 'https://backend.composio.dev/tool_router/trs_9/mcp';
    const fetchImpl = (async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return new Response(
        JSON.stringify({
          session_id: 'trs_9',
          mcp: { type: 'http', url: mcpUrl },
        }),
        {
          status: 200,
        },
      );
    }) as unknown as typeof fetch;
    const client = createComposioClient({ fetch: fetchImpl });
    const session = await client.session('ak_1', 'botharness_u', {
      gmail: ['ca_1', 'ca_2'],
      notion: ['ca_3'],
    });
    expect(session.url).toBe(mcpUrl);
    const body = JSON.parse(String(requests[0]!.init.body)) as Record<string, unknown>;
    expect(new Headers(requests[0]!.init.headers).get('x-api-key')).toBe('ak_1');
    expect(body).toMatchObject({
      user_id: 'botharness_u',
      toolkits: { enable: ['gmail', 'notion'] },
      connected_accounts: { gmail: ['ca_1', 'ca_2'], notion: ['ca_3'] },
      manage_connections: { enable: false },
      multi_account: { require_explicit_selection: true },
    });
    mcpUrl = 'https://evil.example/mcp';
    await expect(client.session('ak_1', 'botharness_u', { gmail: ['ca_1'] })).rejects.toThrow(
      'untrusted MCP URL',
    );
  });

  it('maps account pages to statuses and identities', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              id: 'ca_1',
              status: 'ACTIVE',
              toolkit: { slug: 'GMAIL' },
              state: { val: { email: 'a@b.c' } },
            },
            { id: 'ca_2', status: 'INITIATED', toolkit: { slug: 'notion' } },
            { id: 'ca_3', status: 'EXPIRED', toolkit: { slug: 'slack' } },
          ],
          next_cursor: null,
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const accounts = await createComposioClient({ fetch: fetchImpl }).accounts('ak_1', 'u');
    expect(accounts).toEqual([
      { id: 'ca_1', service: 'gmail', status: 'active', identity: 'a@b.c' },
      { id: 'ca_2', service: 'notion', status: 'pending' },
      { id: 'ca_3', service: 'slack', status: 'expired' },
    ]);
  });
});

describe('deepseekbot connector commands', () => {
  const run = async (command: string, rest: string[], values = {}, stdin = '') => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    await runConnectorCommand(
      command as never,
      rest,
      values,
      { readStdin: async () => stdin },
      async () => async (method, payload) => {
        calls.push([method, payload]);
        return {};
      },
    );
    return calls;
  };

  it('maps commands to bridge methods and reads the key from stdin', async () => {
    expect(await run('connectors', [])).toEqual([['connectors', {}]]);
    expect(await run('connector-key-set', [], { 'key-stdin': true }, 'ak_live_1\n')).toEqual([
      ['connectorKeySet', { apiKey: 'ak_live_1' }],
    ]);
    expect(await run('connector-connect', ['gmail'], { label: 'Work' })).toEqual([
      ['connectorConnect', { service: 'gmail', label: 'Work' }],
    ]);
    expect(await run('connector-grant', ['ada', 'acc'], { access: 'none' })).toEqual([
      ['connectorGrantSet', { slug: 'ada', accountId: 'acc', access: null }],
    ]);
    expect(await run('connector-remove', ['acc'], { confirm: true })).toEqual([
      ['connectorAccountRemove', { accountId: 'acc' }],
    ]);
    expect(await run('bot-connectors', ['ada'])).toEqual([['botConnectors', { slug: 'ada' }]]);
  });

  it('refuses a key on the command line, a missing access and an unconfirmed removal', async () => {
    await expect(run('connector-key-set', ['ak_live_1'])).rejects.toThrow('no positional');
    await expect(run('connector-key-set', [])).rejects.toThrow('--key-stdin');
    await expect(run('connector-grant', ['ada', 'acc'])).rejects.toThrow('--access');
    await expect(run('connector-remove', ['acc'])).rejects.toThrow('--confirm');
    await expect(run('connector-key-clear', [])).rejects.toThrow('--confirm');
  });
});
