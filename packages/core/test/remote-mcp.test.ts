import { OAuthError } from '@modelcontextprotocol/client';
import { describe, expect, it } from 'vitest';

import { runConnectorCommand } from '../src/bots/cli-connectors.js';
import { createConnectorsBridgeMethods } from '../src/features/connectors/methods.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createConnectorStore } from '../src/connectors/store.js';
import { ConnectorService } from '../src/connectors/service.js';
import type { ComposioClient } from '../src/connectors/composio.js';
import { remoteMcpUrl, type RemoteMcpClient } from '../src/connectors/remote-mcp.js';
import {
  LEGACY_READ_REFUSAL,
  remoteMcpServerNames,
  remoteMcpToolDenial,
} from '../src/connectors/policy.js';
import { grantedAccess } from '../src/connectors/remote.js';
import {
  CONNECTOR_CALLBACK_PATH,
  CONNECTOR_DEVICE_CALLBACK_PATH,
  connectorCallback,
} from '../src/connectors/mount.js';
import { fetchImage, publicDestination } from '../src/connectors/images.js';
import { secretMcpPlan } from '../src/credentials/secret-mcp.js';
import { createTempRoot } from './helpers.js';

const POSTHOG = 'https://mcp.posthog.com/mcp';
const OAUTH = {
  authorizationServer: 'https://oauth.posthog.com/',
  resource: POSTHOG,
  scope: 'openid profile insight:read insight:write annotation:read annotation:write introspection',
};

function vault() {
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

function fakeMcp(overrides: Partial<RemoteMcpClient> = {}) {
  const calls: Array<[string, ...unknown[]]> = [];
  let issued = 0;
  const client: RemoteMcpClient = {
    discover: async (url) => {
      calls.push(['discover', url]);
      return url === POSTHOG ? OAUTH : undefined;
    },
    register: async (oauth, redirectUri) => {
      calls.push(['register', oauth.authorizationServer, redirectUri]);
      return { client_id: 'client-1', redirect_uris: [redirectUri] };
    },
    authorize: async (oauth, client, redirectUri, state) => {
      calls.push(['authorize', client.client_id, redirectUri, oauth.scope]);
      return {
        url: `https://oauth.posthog.com/oauth/authorize/?state=${state}`,
        verifier: 'verifier-1',
      };
    },
    exchange: async (_oauth, _client, input) => {
      calls.push(['exchange', input.code, input.verifier, input.iss]);
      issued += 1;
      return {
        access_token: `access-${issued}`,
        token_type: 'Bearer',
        refresh_token: 'refresh-1',
        expires_in: 3600,
      };
    },
    refresh: async (_oauth, _client, refreshToken) => {
      calls.push(['refresh', refreshToken]);
      issued += 1;
      return { access_token: `access-${issued}`, token_type: 'Bearer', expires_in: 3600 };
    },
    inspect: async (url, token) => {
      calls.push(['inspect', url, token]);
      return {
        name: 'PostHog',
        tools: [{ name: 'insights-get-all' }, { name: 'feature-flag-update' }],
      };
    },
    image: async () => undefined,
    registry: async (query, cursor) => {
      calls.push(['registry', query, cursor]);
      return {
        servers: [
          {
            id: 'io.github.example/analytics',
            name: 'Example Analytics',
            summary: 'Charts',
            url: 'https://mcp.example.com/mcp',
            icon: 'https://example.com/icon.png',
          },
          {
            id: 'com.posthog/mcp',
            name: 'PostHog',
            summary: 'Duplicate of the featured entry',
            url: POSTHOG,
          },
        ],
        next: 'page-2',
      };
    },
    ...overrides,
  };
  return { client, calls };
}

function setup(client: RemoteMcpClient) {
  const home = createTempRoot('botharness-remote-mcp-');
  const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  const store = createConnectorStore(attachOperationalModule(owner, 'connectors'));
  const credentials = vault();
  const changes: string[] = [];
  const service = new ConnectorService({
    store,
    credentials: () => credentials.provider as never,
    client: {} as ComposioClient,
    mcpClient: client,
    redirectUri: () => 'http://127.0.0.1:7777/botharness/connectors/oauth/callback',
  });
  service.onChange(() => changes.push('changed'));
  return { owner, store, service, credentials, changes };
}

function stateOf(url: string): string {
  return new URL(url).searchParams.get('state')!;
}

describe('remote MCP App connections', () => {
  it('signs in to PostHog with OAuth, stores the token outside the database and mounts it', async () => {
    const { client, calls } = fakeMcp();
    const { owner, store, service, credentials } = setup(client);
    try {
      const started = await service.connect({ service: 'mcp_posthog', label: 'Work' });
      expect(started.account).toMatchObject({
        provider: 'mcp',
        service: 'mcp_posthog',
        label: 'Work',
        status: 'pending',
      });
      expect(started.url).toContain('https://oauth.posthog.com/oauth/authorize/');
      expect(calls).toContainEqual([
        'register',
        OAUTH.authorizationServer,
        'http://127.0.0.1:7777/botharness/connectors/oauth/callback',
      ]);
      expect(store.mcpServer('mcp_posthog')).toMatchObject({ name: 'PostHog', url: POSTHOG });

      const finished = await service.remote.finish(
        new URLSearchParams({ state: stateOf(started.url!), code: 'code-1', iss: 'x' }),
      );
      expect(finished.status).toBe('active');
      expect(calls).toContainEqual(['exchange', 'code-1', 'verifier-1', 'x']);
      expect(JSON.stringify(owner)).not.toContain('access-1');
      expect(JSON.stringify([...credentials.records.values()])).toContain('access-1');
      expect(await service.remote.connection(finished.accountId)).toMatchObject({
        url: POSTHOG,
        headers: { Authorization: 'Bearer access-1' },
      });
      expect(await service.remote.tools(finished.accountId)).toHaveLength(2);

      await expect(
        service.remote.finish(
          new URLSearchParams({ state: stateOf(started.url!), code: 'code-1' }),
        ),
      ).rejects.toMatchObject({ code: 'invalid' });

      const second = await service.connect({ service: 'mcp_posthog', label: 'Personal' });
      expect(calls.filter((call) => call[0] === 'register')).toHaveLength(1);
      await service.remote.remove(second.account.accountId);
      expect(store.mcpServer('mcp_posthog')).toBeDefined();
      await service.remote.remove(finished.accountId);
      expect(store.mcpServer('mcp_posthog')).toBeUndefined();
      expect(store.accounts()).toEqual([]);
    } finally {
      owner.close();
    }
  });

  it('asks for every scope and records the access the service granted', async () => {
    let granted = 'openid profile insight:read annotation:read';
    const { client, calls } = fakeMcp({
      exchange: async () => ({ access_token: 'access-1', token_type: 'Bearer', scope: granted }),
    });
    const { owner, store, service } = setup(client);
    try {
      const started = await service.connect({ service: 'mcp_posthog', label: 'Reader' });
      expect(calls).toContainEqual([
        'authorize',
        'client-1',
        'http://127.0.0.1:7777/botharness/connectors/oauth/callback',
        OAUTH.scope,
      ]);
      const finished = await service.remote.finish(
        new URLSearchParams({ state: stateOf(started.url!), code: 'code-1' }),
      );
      expect(finished).toMatchObject({ status: 'active', access: 'read' });
      service.grant('tob', finished.accountId, 'write');
      expect(service.forBot('tob')).toMatchObject([
        { accountId: finished.accountId, access: 'read' },
      ]);

      granted = OAUTH.scope;
      const again = await service.reconnect(finished.accountId);
      await service.remote.finish(
        new URLSearchParams({ state: stateOf(again.url!), code: 'code-2' }),
      );
      expect(store.account(finished.accountId)).toMatchObject({
        status: 'active',
        access: 'write',
      });
      expect(service.forBot('tob')).toMatchObject([{ access: 'write' }]);
    } finally {
      owner.close();
    }
  });

  it('marks a refused sign-in failed and lets it reconnect', async () => {
    const { client } = fakeMcp();
    const { owner, store, service } = setup(client);
    try {
      const started = await service.connect({ service: 'mcp_posthog' });
      await expect(
        service.remote.finish(
          `http://127.0.0.1:7777/cb?state=${stateOf(started.url!)}&error=access_denied`,
        ),
      ).rejects.toMatchObject({ code: 'invalid' });
      expect(store.account(started.account.accountId)?.status).toBe('failed');
      const again = await service.reconnect(started.account.accountId);
      expect(again.url).toContain('state=');
    } finally {
      owner.close();
    }
  });

  it('lets only the latest sign-in for an account finish', async () => {
    let release: () => void = () => undefined;
    const { client } = fakeMcp();
    const exchange = client.exchange;
    let hold = true;
    client.exchange = async (...args) => {
      if (hold) await new Promise<void>((resolve) => (release = resolve));
      return exchange(...args);
    };
    const { owner, store, service } = setup(client);
    try {
      const started = await service.connect({ service: 'mcp_posthog' });
      const first = service.remote.finish(
        new URLSearchParams({ state: stateOf(started.url!), code: 'old' }),
      );
      await Promise.resolve();
      hold = false;
      const again = await service.reconnect(started.account.accountId);
      release();
      await expect(first).rejects.toMatchObject({ code: 'invalid' });
      expect(store.account(started.account.accountId)?.status).toBe('pending');
      const done = await service.remote.finish(
        new URLSearchParams({ state: stateOf(again.url!), code: 'new' }),
      );
      expect(done.status).toBe('active');
    } finally {
      owner.close();
    }
  });

  it('keeps a token without a refresh token usable until it really expires', async () => {
    const { client } = fakeMcp({
      exchange: async () => ({ access_token: 'short', token_type: 'Bearer', expires_in: 60 }),
    });
    const { owner, store, service } = setup(client);
    try {
      const started = await service.connect({ service: 'mcp_posthog' });
      const { accountId } = await service.remote.finish(
        new URLSearchParams({ state: stateOf(started.url!), code: 'c' }),
      );
      expect((await service.remote.connection(accountId))?.headers['Authorization']).toBe(
        'Bearer short',
      );
      expect(store.account(accountId)?.status).toBe('active');
    } finally {
      owner.close();
    }
  });

  it('refreshes a token before it expires and expires the account when refresh fails', async () => {
    let fail: Error | undefined;
    const { client, calls } = fakeMcp({
      exchange: async () => ({
        access_token: 'access-old',
        token_type: 'Bearer',
        refresh_token: 'refresh-1',
        expires_in: 60,
      }),
    });
    const refresh = client.refresh;
    client.refresh = async (...args) => {
      if (fail !== undefined) throw fail;
      return refresh(...args);
    };
    const { owner, store, service } = setup(client);
    try {
      const started = await service.connect({ service: 'mcp_posthog' });
      const { accountId } = await service.remote.finish(
        new URLSearchParams({ state: stateOf(started.url!), code: 'c' }),
      );
      const [first, again] = await Promise.all([
        service.remote.connection(accountId),
        service.remote.connection(accountId),
      ]);
      expect(first?.headers['Authorization']).toBe(again?.headers['Authorization']);
      expect(first?.headers['Authorization']).not.toBe('Bearer access-old');
      expect(calls.filter((call) => call[0] === 'refresh')).toHaveLength(1);

      const second = await service.connect({ service: 'mcp_posthog', label: 'Other' });
      const other = await service.remote.finish(
        new URLSearchParams({ state: stateOf(second.url!), code: 'c2' }),
      );
      fail = new TypeError('fetch failed');
      expect((await service.remote.connection(other.accountId))?.headers['Authorization']).toBe(
        'Bearer access-old',
      );
      expect(store.account(other.accountId)?.status).toBe('active');
      fail = new OAuthError('invalid_grant', 'refused');
      expect(await service.remote.connection(other.accountId)).toBeUndefined();
      expect(store.account(other.accountId)?.status).toBe('expired');
    } finally {
      owner.close();
    }
  });

  it('keeps a newer sign-in when a refresh races, and records the access a refresh grants', async () => {
    let release: (() => void) | undefined;
    let scope: string | undefined;
    let rejected = false;
    let refreshes = 0;
    const { client } = fakeMcp({
      exchange: async (_oauth, _client, input) => ({
        access_token: `access-${input.code}`,
        token_type: 'Bearer',
        refresh_token: `refresh-${input.code}`,
        expires_in: 60,
        scope: 'openid insight:read',
      }),
      refresh: async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        refreshes += 1;
        if (rejected) throw new OAuthError('invalid_grant', 'refused');
        return {
          access_token: 'access-refreshed',
          token_type: 'Bearer',
          expires_in: 60,
          ...(scope === undefined ? {} : { scope }),
        };
      },
    });
    const { owner, store, service } = setup(client);
    try {
      const started = await service.connect({ service: 'mcp_posthog' });
      const { accountId } = await service.remote.finish(
        new URLSearchParams({ state: stateOf(started.url!), code: 'a' }),
      );
      const racing = service.remote.connection(accountId);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const again = await service.reconnect(accountId);
      await service.remote.finish(new URLSearchParams({ state: stateOf(again.url!), code: 'b' }));
      release!();
      expect((await racing)?.headers['Authorization']).toBe('Bearer access-b');
      expect(store.account(accountId)?.access).toBe('read');

      rejected = true;
      const stale = service.remote.connection(accountId);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const third = await service.reconnect(accountId);
      await service.remote.finish(new URLSearchParams({ state: stateOf(third.url!), code: 'c' }));
      release!();
      expect((await stale)?.headers['Authorization']).toBe('Bearer access-c');
      expect(store.account(accountId)?.status).toBe('active');
      rejected = false;

      scope = 'openid insight:read insight:write';
      const widening = service.remote.connection(accountId);
      await new Promise((resolve) => setTimeout(resolve, 0));
      release!();
      expect((await widening)?.headers['Authorization']).toBe('Bearer access-refreshed');
      expect(store.account(accountId)).toMatchObject({ status: 'active', access: 'write' });

      attachOperationalModule(owner, 'connectors').transaction((database) =>
        database.prepare('UPDATE connector_accounts SET access = NULL').run(),
      );
      service.grant('tob', accountId, 'read');
      const legacy = service.remote.connection(accountId);
      await new Promise((resolve) => setTimeout(resolve, 0));
      release!();
      await legacy;
      expect(refreshes).toBe(4);
      expect(store.account(accountId)?.access).toBeUndefined();
      expect(service.forBot('tob')).toMatchObject([{ access: 'read' }]);
    } finally {
      owner.close();
    }
  });

  it('keeps a Read grant on an account signed in before Tobs recorded granted access', async () => {
    const { client } = fakeMcp();
    const { owner, store, service } = setup(client);
    try {
      const legacy = store.createAccount({
        provider: 'mcp',
        service: 'mcp_posthog',
        label: 'Old',
        externalId: 'old',
      });
      service.grant('tob', legacy.accountId, 'read');
      expect(service.forBot('tob')).toMatchObject([
        { accountId: legacy.accountId, access: 'read' },
      ]);
    } finally {
      owner.close();
    }
  });

  it('connects a server without sign-in at once and searches the registry', async () => {
    const { client } = fakeMcp();
    const { owner, store, service } = setup(client);
    try {
      const found = await service.remote.search('analytics');
      expect(found.apps.map((app) => app.service)).toEqual([
        'mcp_posthog',
        'mcp_io_github_example_analytics_5f4669a6',
      ]);
      expect(found.next).toBe('page-2');
      const linked = await service.connect({ service: 'mcp_io_github_example_analytics_5f4669a6' });
      expect(linked.url).toBeUndefined();
      expect(linked.account.status).toBe('active');
      expect(store.mcpServer('mcp_io_github_example_analytics_5f4669a6')).toMatchObject({
        url: 'https://mcp.example.com/mcp',
        icon: 'https://example.com/icon.png',
      });
      expect(service.appName('mcp_io_github_example_analytics_5f4669a6')).toBe('PostHog');
      expect(await service.remote.connection(linked.account.accountId)).toEqual({
        url: 'https://mcp.example.com/mcp',
        headers: {},
      });

      expect((await service.remote.search('数据分析')).apps.map((app) => app.service)).toContain(
        'mcp_posthog',
      );
      await expect(service.remote.add({ url: 'http://mcp.example.com/mcp' })).rejects.toMatchObject(
        { code: 'invalid' },
      );
    } finally {
      owner.close();
    }
  });

  it('falls back to featured servers when the registry is down', async () => {
    const { client } = fakeMcp({
      registry: async () => {
        throw new TypeError('fetch failed');
      },
    });
    const { owner, service } = setup(client);
    try {
      const found = await service.remote.search('');
      expect(found.offline).toBe(true);
      expect(found.apps.length).toBeGreaterThan(5);
      await expect(service.remote.search('x', 'page-2')).rejects.toMatchObject({
        code: 'upstream',
      });
    } finally {
      owner.close();
    }
  });

  it('exposes Owner-only bridge methods and CLI commands', async () => {
    const { client } = fakeMcp();
    const { owner, service } = setup(client);
    try {
      let isOwner = false;
      const methods = createConnectorsBridgeMethods(
        { connectors: service, registry: { get: () => undefined } },
        () => isOwner,
      );
      expect(await methods.connectorMcpSearch({ query: '' })).toMatchObject({
        ok: false,
        error: { code: 'permission-required' },
      });
      isOwner = true;
      const added = await methods.connectorMcpAdd({ url: POSTHOG, label: 'Team' });
      expect(added).toMatchObject({ ok: true, value: { account: { label: 'Team' } } });
      const url = (added as { value: { url: string } }).value.url;
      const finished = await methods.connectorMcpFinish({
        url: `http://localhost/cb?state=${stateOf(url)}&code=abc`,
      });
      expect(finished).toMatchObject({ ok: true, value: { account: { status: 'active' } } });
      expect(await methods.connectorMcpFinish({ url: 'not a url' })).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      });

      const sent: Array<[string, Record<string, unknown>]> = [];
      const run = (command: string, rest: string[], values: Record<string, unknown> = {}) =>
        runConnectorCommand(
          command as never,
          rest,
          values,
          {},
          async () => async (method, body) => {
            sent.push([method, body]);
            return {};
          },
        );
      await run('connector-mcp-search', ['analytics'], { cursor: 'p2' });
      await run('connector-mcp-add', [POSTHOG], { name: 'PostHog', label: 'Work' });
      await run('connector-mcp-finish', ['http://localhost/cb?state=s&code=c']);
      expect(sent).toEqual([
        ['connectorMcpSearch', { query: 'analytics', cursor: 'p2' }],
        ['connectorMcpAdd', { url: POSTHOG, name: 'PostHog', label: 'Work' }],
        ['connectorMcpFinish', { url: 'http://localhost/cb?state=s&code=c' }],
      ]);
      await expect(run('connector-mcp-add', [])).rejects.toMatchObject({ code: 'usage' });
    } finally {
      owner.close();
    }
  });
});

describe('App connection sign-in callback', () => {
  it('returns to a public Host address when one is published, so any device can finish sign-in', async () => {
    let published: string[] = [];
    const callback = connectorCallback(async () => published);
    expect(await callback.url()).toBeUndefined();
    callback.attach(() => 'http://127.0.0.1:7777');
    expect(await callback.url()).toBe(`http://127.0.0.1:7777${CONNECTOR_CALLBACK_PATH}`);
    published = ['https://abc.deepseekbot.dev', 'https://pc.tail1234.ts.net'];
    expect(await callback.url()).toBe(
      `https://abc.deepseekbot.dev${CONNECTOR_DEVICE_CALLBACK_PATH}`,
    );
    const failing = connectorCallback(async () => {
      throw new Error('offline');
    });
    failing.attach(() => 'http://127.0.0.1:7777');
    expect(await failing.url()).toBe(`http://127.0.0.1:7777${CONNECTOR_CALLBACK_PATH}`);
  });
});

describe('remote MCP tool policy', () => {
  it('names servers per account and mirrors the MCP client tool names', () => {
    const names = remoteMcpServerNames([
      { accountId: 'b', provider: 'mcp', service: 'mcp_posthog' },
      { accountId: 'a', provider: 'mcp', service: 'mcp_posthog' },
      { accountId: 'c', provider: 'composio', service: 'gmail' },
    ]);
    expect([...names.keys()]).toEqual(['b', 'a']);
    expect(names.get('a')).toMatch(/^app_posthog_[0-9a-f]{6}$/);
    expect(names.get('b')).toMatch(/^app_posthog_[0-9a-f]{6}$/);
    expect(names.get('a')).not.toBe(names.get('b'));
    const alone = remoteMcpServerNames([
      { accountId: 'b', provider: 'mcp', service: 'mcp_posthog' },
    ]);
    expect(alone.get('b')).toBe(names.get('b'));
  });

  it('lets a Bot call every tool of a granted MCP account and leaves read or write to the server', () => {
    const servers = new Map<string, string | undefined>([
      ['app_posthog_be7f6b', undefined],
      ['app_linear_123456', undefined],
      ['app_notion_abcdef', LEGACY_READ_REFUSAL],
    ]);
    expect(remoteMcpToolDenial('mcp__app_notion_abcdef__search', servers)).toBe(
      LEGACY_READ_REFUSAL,
    );
    expect(remoteMcpToolDenial('mcp__app_posthog_be7f6b__exec', servers)).toBeUndefined();
    expect(remoteMcpToolDenial('mcp__app_linear_123456__create_issue', servers)).toBeUndefined();
    expect(remoteMcpToolDenial('mcp__app_gone_000000__x', servers)).toContain('any more');
    expect(remoteMcpToolDenial('mcp__composio__X', servers)).toBeUndefined();
  });

  it('reads Read only when every granted scope is a read scope', () => {
    expect(grantedAccess('openid profile insight:read annotation:read introspection')).toBe('read');
    expect(grantedAccess(OAUTH.scope)).toBe('write');
    expect(grantedAccess('read:user')).toBe('read');
    expect(grantedAccess('https://www.googleapis.com/auth/gmail.readonly')).toBe('read');
    expect(grantedAccess('projects:read_write offline_access')).toBe('write');
    expect(grantedAccess('repo user')).toBe('write');
    expect(grantedAccess('openid profile')).toBe('write');
    expect(grantedAccess(undefined)).toBe('write');
  });

  it('fetches registry icons only from public addresses, and no more than the size limit', async () => {
    const lookup = async (host: string) =>
      host === 'inside.example' ? [{ address: '10.0.0.5' }] : [{ address: '93.184.216.34' }];
    for (const url of [
      'https://169.254.169.254/icon.png',
      'https://[::1]/icon.png',
      'https://[fd00::1]/icon.png',
      'https://[::ffff:10.0.0.5]/icon.png',
      'https://localhost/icon.png',
      'https://inside.example/icon.png',
    ])
      expect(await publicDestination(new URL(url), lookup)).toBe(false);
    expect(await publicDestination(new URL('https://cdn.example/icon.png'), lookup)).toBe(true);
    const huge = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(64 * 1024));
      },
    });
    const fetched = await fetchImage(
      async () => new Response(huge, { headers: { 'content-type': 'image/png' } }),
      'https://cdn.example/icon.png',
    );
    expect(fetched).toBeUndefined();
  });

  it('accepts only https or loopback MCP addresses', () => {
    expect(remoteMcpUrl(POSTHOG)?.href).toBe(POSTHOG);
    expect(remoteMcpUrl('http://localhost:3000/mcp')).toBeDefined();
    expect(remoteMcpUrl('http://example.com/mcp')).toBeUndefined();
    expect(remoteMcpUrl('https://user:pw@example.com/mcp')).toBeUndefined();
  });

  it('keeps the app_ server prefix for App connections', () => {
    expect(() =>
      secretMcpPlan({ server_name: 'app_posthog', program: 'npx', args: [], env: [] }),
    ).toThrow(/reserved/);
  });
});

describe('Composio key kinds', () => {
  it('refuses the Connect MCP key and the personal user key with a clear reason', async () => {
    const { client } = fakeMcp();
    const { owner, service } = setup(client);
    try {
      await expect(service.setKey('ck_consumer_key_1234')).rejects.toThrow(/ak_/);
      await expect(service.setKey('uak_user_key_1234')).rejects.toThrow(/ak_/);
    } finally {
      owner.close();
    }
  });
});
