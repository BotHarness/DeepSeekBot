import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import * as mcpClient from '@deepseek-ai/dsh-mcp-client';
import { defineTool } from '@deepseek-ai/dsh-tools';

import type { BotHarnessCore } from '../plugin-types.js';
import { CONNECTOR_CATALOG, matchesCatalog } from './catalog.js';
import {
  CONNECTOR_MCP_SERVER,
  CONNECTOR_TOOL_PREFIX,
  LEGACY_READ_REFUSAL,
  REMOTE_MCP_TOOL_PREFIX,
  connectorToolDenial,
  remoteMcpServerName,
  remoteMcpServerNames,
  remoteMcpToolDenial,
} from './policy.js';
import { FEATURED_MCP_SERVERS } from './remote.js';
import { ConnectorError, type ConnectorApp, type ConnectorService } from './service.js';
import type { ConnectorAccess } from './store.js';

type Fiber = ReturnType<Context['plugin']>;

const CATALOG_LIMIT = 15;

interface RemoteMount {
  accountId: string;
  signature: string;
  fiber: Fiber;
}

interface Mounted {
  botSlug: string;
  agentCtx: Context;
  signature: string | undefined;
  fiber: Fiber | undefined;
  remote: Map<string, RemoteMount>;
  queue: Promise<void>;
  disposed: boolean;
  retry: ReturnType<typeof setTimeout> | undefined;
  renew: ReturnType<typeof setTimeout> | undefined;
}

const SESSION_RETRY_MS = 30_000;
const RENEW_EARLY_MS = 60_000;
const LOOKUP_RETRY_MS = 30_000;
export const CONNECTOR_CALLBACK_PATH = '/botharness/connectors/oauth/callback';

export function connectorCallback() {
  let origin: (() => string) | undefined;
  return {
    url: () => (origin === undefined ? undefined : `${origin()}${CONNECTOR_CALLBACK_PATH}`),
    attach(next: (() => string) | undefined) {
      origin = next;
    },
  };
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function callbackPage(title: string, detail: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#f6f6f7;color:#18181b}@media (prefers-color-scheme:dark){body{background:#18181b;color:#f4f4f5}}main{max-width:28rem;padding:2rem;text-align:center}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p></main></body></html>`;
}

interface CallbackWebServer {
  getOrigin(): string;
  register(route: {
    kind: 'exact' | 'prefix';
    path: string;
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
  }): () => void;
}

function callbackWebServer(value: unknown): value is CallbackWebServer {
  const web = value as Partial<CallbackWebServer> | null | undefined;
  return typeof web?.getOrigin === 'function' && typeof web.register === 'function';
}

function mountCallback(
  ctx: Context,
  service: ConnectorService,
  callback: ReturnType<typeof connectorCallback>,
): void {
  ctx.inject(['webServer'], (webCtx) => {
    const web: unknown = webCtx.get('webServer');
    if (!callbackWebServer(web)) {
      webCtx.logger.warn('connectors phase=callback-unavailable');
      return;
    }
    webCtx.effect(() => {
      callback.attach(() => web.getOrigin());
      const off = web.register({
        kind: 'exact',
        path: CONNECTOR_CALLBACK_PATH,
        handler: async (request, response) => {
          const params = new URL(request.url ?? '/', 'http://callback').searchParams;
          let status = 200;
          let page: string;
          try {
            const account = await service.remote.finish(params);
            page = callbackPage(
              `${account.label} is connected`,
              'You can close this tab and go back to Tobs.',
            );
          } catch (error) {
            status = 400;
            page = callbackPage(
              'Sign-in did not finish',
              error instanceof ConnectorError ? error.message : 'Try connecting the app again.',
            );
          }
          response.writeHead(status, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            'referrer-policy': 'no-referrer',
            'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
          });
          response.end(page);
        },
      });
      return () => {
        off();
        callback.attach(undefined);
      };
    }, 'botharness: App connection sign-in callback');
  });
}

function remoteSignature(connection: { url: string; headers: Record<string, string> }): string {
  return createHash('sha256')
    .update(JSON.stringify([connection.url, connection.headers]))
    .digest('hex');
}

export function connectorAccessMap(
  service: Pick<ConnectorService, 'forBot'>,
  botSlug: string,
): Record<string, ConnectorAccess> {
  const access: Record<string, ConnectorAccess> = {};
  for (const connector of service.forBot(botSlug)) {
    if (connector.status !== 'active' || connector.provider !== 'composio') continue;
    access[connector.service] = access[connector.service] === 'read' ? 'read' : connector.access;
  }
  return access;
}

export function connectorCatalogFor(
  service: Pick<ConnectorService, 'forBot' | 'available' | 'appName'>,
  botSlug: string,
  configured: boolean,
  query?: string,
  apps?: readonly ConnectorApp[],
) {
  const granted = service.forBot(botSlug);
  const grantedIds = new Set(granted.map((connector) => connector.accountId));
  const requestable = service
    .available()
    .filter((account) => !grantedIds.has(account.accountId) && account.status === 'active');
  const catalog = (apps ?? CONNECTOR_CATALOG.filter((entry) => matchesCatalog(entry, query))).slice(
    0,
    CATALOG_LIMIT,
  );
  const usable = granted.some(
    (connector) => connector.status === 'active' && connector.provider === 'composio',
  );
  const servers = remoteMcpServerNames(
    granted.filter((connector) => connector.status === 'active'),
  );
  const remote = [...servers.values()].map((name) => `mcp__${name}__*`);
  const mcp = FEATURED_MCP_SERVERS.filter((server) =>
    [server.name, server.summary, ...server.keywords].some(
      (word) =>
        query === undefined ||
        query.trim() === '' ||
        query.toLowerCase().includes(word.toLowerCase()) ||
        word.toLowerCase().includes(query.trim().toLowerCase()),
    ),
  ).slice(0, 5);
  const steps = [
    ...(usable
      ? [
          `Use ${CONNECTOR_TOOL_PREFIX}COMPOSIO_SEARCH_TOOLS to find a tool, ${CONNECTOR_TOOL_PREFIX}COMPOSIO_GET_TOOL_SCHEMAS for its arguments, then ${CONNECTOR_TOOL_PREFIX}COMPOSIO_MULTI_EXECUTE_TOOL to run it.`,
        ]
      : []),
    ...(remote.length > 0 ? [`Use the MCP tools named ${remote.join(', ')}.`] : []),
  ];
  return {
    configured,
    granted: granted.map((connector) => ({
      account_id: connector.accountId,
      service: connector.service,
      name: service.appName(connector.service),
      label: connector.label,
      ...(connector.identity === undefined ? {} : { identity: connector.identity }),
      status: connector.status,
      access: connector.access,
      ...(servers.has(connector.accountId)
        ? { tools: `mcp__${servers.get(connector.accountId)}__*` }
        : {}),
    })),
    requestable: requestable.map((account) => ({
      account_id: account.accountId,
      service: account.service,
      name: service.appName(account.service),
      label: account.label,
    })),
    catalog: catalog.map((entry) => ({
      service: entry.service,
      name: entry.name,
      summary: entry.summary,
    })),
    mcp_servers: mcp.map((server) => ({
      service: server.service,
      name: server.name,
      summary: server.summary,
      sign_in: 'OAuth, no Composio key needed',
    })),
    next:
      steps.length > 0
        ? steps.join(' ')
        : requestable.length > 0
          ? 'Call connector_request with the account_id the user needs; the Owner approves it on a card.'
          : configured
            ? 'Tell the user which app connection would help and ask the Owner to connect it in Settings › App connections; then call connector_request.'
            : 'Ask the Owner to connect the app in Settings › App connections: many apps (for example PostHog, Notion, Linear) connect by signing in, and others need a Composio API key.',
  };
}

export function mountConnectors(
  ctx: Context,
  core: Pick<BotHarnessCore, 'contributeBotAgentSetup' | 'ownership'>,
  service: ConnectorService,
  callback?: ReturnType<typeof connectorCallback>,
): void {
  const mounted = new Map<Agent, Mounted>();
  if (callback !== undefined) mountCallback(ctx, service, callback);
  const remote = async (entry: Mounted): Promise<void> => {
    if (entry.renew !== undefined) clearTimeout(entry.renew);
    entry.renew = undefined;
    const granted = service
      .forBot(entry.botSlug)
      .filter((connector) => connector.provider === 'mcp' && connector.status === 'active');
    const names = remoteMcpServerNames(granted);
    let renewAt: number | undefined;
    for (const [serverName, current] of [...entry.remote]) {
      if (names.get(current.accountId) === serverName) continue;
      entry.remote.delete(serverName);
      await Promise.resolve(current.fiber.dispose()).catch(() => undefined);
    }
    for (const connector of granted) {
      if (entry.disposed) return;
      const serverName = names.get(connector.accountId)!;
      let connection: Awaited<ReturnType<ConnectorService['remote']['connection']>>;
      try {
        connection = await service.remote.connection(connector.accountId);
      } catch {
        renewAt = Math.min(renewAt ?? Infinity, Date.now() + LOOKUP_RETRY_MS);
        continue;
      }
      const current = entry.remote.get(serverName);
      if (connection === undefined) {
        if (current !== undefined) {
          entry.remote.delete(serverName);
          await Promise.resolve(current.fiber.dispose()).catch(() => undefined);
        }
        continue;
      }
      if (connection.expiresAt !== undefined)
        renewAt = Math.min(renewAt ?? Infinity, connection.expiresAt - RENEW_EARLY_MS);
      const signature = remoteSignature(connection);
      if (current?.signature === signature) continue;
      if (current !== undefined) {
        entry.remote.delete(serverName);
        await Promise.resolve(current.fiber.dispose()).catch(() => undefined);
      }
      if (entry.disposed) return;
      const mount: RemoteMount = {
        accountId: connector.accountId,
        signature,
        fiber: entry.agentCtx.plugin(mcpClient, {
          transport: 'streamable-http',
          serverName,
          url: connection.url,
          headers: connection.headers,
          toolCallTimeoutMs: 120_000,
        }),
      };
      entry.remote.set(serverName, mount);
    }
    if (renewAt !== undefined && !entry.disposed)
      entry.renew = setTimeout(
        () => {
          entry.renew = undefined;
          void sync(entry);
        },
        Math.max(5_000, renewAt - Date.now()),
      );
  };
  const sync = (entry: Mounted): Promise<void> => {
    entry.queue = entry.queue.then(async () => {
      if (entry.disposed) return;
      await remote(entry).catch((error: unknown) =>
        ctx.logger.warn(
          'botharness: remote MCP mount failed %j',
          error instanceof Error ? error.name : 'error',
        ),
      );
      if (entry.disposed) return;
      if (entry.retry !== undefined) clearTimeout(entry.retry);
      entry.retry = undefined;
      let session: Awaited<ReturnType<ConnectorService['session']>>;
      try {
        session = await service.session(entry.botSlug);
      } catch (error) {
        ctx.logger.warn(
          'botharness: connector session unavailable %j',
          error instanceof ConnectorError ? error.code : 'error',
        );
        if (!entry.disposed)
          entry.retry = setTimeout(() => {
            entry.retry = undefined;
            void sync(entry);
          }, SESSION_RETRY_MS);
        return;
      }
      if (entry.disposed || session?.signature === entry.signature) return;
      const previous = entry.fiber;
      entry.fiber = undefined;
      entry.signature = session?.signature;
      if (previous !== undefined) await Promise.resolve(previous.dispose()).catch(() => undefined);
      if (session === undefined || entry.disposed) return;
      entry.fiber = entry.agentCtx.plugin(mcpClient, {
        transport: 'streamable-http',
        serverName: CONNECTOR_MCP_SERVER,
        url: session.url,
        headers: session.headers,
        toolCallTimeoutMs: 120_000,
      });
    });
    return entry.queue;
  };
  ctx.effect(
    () =>
      service.onChange(() => {
        for (const entry of mounted.values()) void sync(entry);
      }),
    'botharness: connector changes',
  );
  ctx.tools.guard(({ name, agent }) => {
    if (!name.startsWith(REMOTE_MCP_TOOL_PREFIX)) return undefined;
    const entry = agent === undefined ? undefined : mounted.get(agent);
    if (entry === undefined) return 'App connection tools run only inside a Bot conversation.';
    const active = new Map(
      service
        .forBot(entry.botSlug)
        .filter((connector) => connector.status === 'active')
        .map((connector) => [connector.accountId, connector] as const),
    );
    const servers = new Map(
      [...entry.remote].flatMap(([serverName, mount]) => {
        const connector = active.get(mount.accountId);
        if (connector === undefined) return [];
        const legacy =
          connector.access === 'read' && service.account(mount.accountId)?.access === undefined;
        return [[serverName, legacy ? LEGACY_READ_REFUSAL : undefined] as const];
      }),
    );
    return remoteMcpToolDenial(name, servers);
  });
  ctx.tools.guard(({ name, agent, arguments: args }) => {
    if (!name.startsWith(CONNECTOR_TOOL_PREFIX)) return undefined;
    const botSlug =
      agent === undefined ? undefined : core.ownership.resolve(agent.session.id)?.botSlug;
    if (botSlug === undefined) return 'App connection tools run only inside a Bot conversation.';
    return connectorToolDenial(name, args, connectorAccessMap(service, botSlug));
  });
  ctx.effect(
    () =>
      core.contributeBotAgentSetup((agentCtx, agent, info) => {
        if (info.rootRole !== 'orchestrator') return;
        const live = (call: { agent?: Agent }) =>
          call.agent === agent && ctx.agents.get(agent.id) === agent;
        agentCtx.tools.register(
          defineTool({
            name: 'connector_catalog',
            description:
              'List the apps (App connections such as Gmail, Google Calendar, Drive, Notion, Slack, GitHub) you can use for the user, the Host accounts you could ask for, and the services the Owner could connect. Call it whenever the user asks what you can do, or asks for something in an outside app ("check my email", "我明天有什么会") before saying you cannot. Pass query with the user\'s words to search every app Composio supports (about 2,000); English words such as "email" or "crm" match best. It returns what to do next.',
            parameters: {
              query: {
                type: 'string',
                description: 'Optional words from the request, for example "email" or "日历".',
              },
            },
            output: {
              schema: { type: 'string' },
              render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: async (args, call) => {
              if (!live(call)) throw new Error('connector_catalog: this conversation ended');
              const configured = (await service.view()).configured;
              const found = await service.searchApps(args.query ?? '').catch(() => undefined);
              return JSON.stringify(
                connectorCatalogFor(service, info.botSlug, configured, args.query, found?.apps),
              );
            },
          }),
        );
        agentCtx.tools.register(
          defineTool({
            name: 'connector_request',
            description:
              'Ask the Owner to let you use one connected account listed as requestable by connector_catalog. The Owner approves or rejects it on a card that shows your reason. Ask for read unless the user asked you to send, create or change something there. A remote MCP account (service starting with mcp_) keeps the read or write access it was signed in with, whatever you ask for. After approval its tools appear under mcp__composio__ or the mcp__app_… name it returns.',
            parameters: {
              account_id: {
                type: 'string',
                required: true,
                description: 'account_id from connector_catalog.',
              },
              access: {
                type: 'string',
                required: true,
                enum: ['read', 'write'],
                description: 'read to look things up; write to also send, create or change.',
              },
              reason: {
                type: 'string',
                required: true,
                description: 'One sentence the Owner sees: what you will do with it for the user.',
              },
            },
            output: {
              schema: { type: 'string' },
              render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: async (args, call) => {
              if (!live(call)) throw new Error('connector_request: this conversation ended');
              if (args.access !== 'read' && args.access !== 'write')
                return JSON.stringify({
                  granted: false,
                  refused: 'access must be read or write',
                });
              const account = service.account(args.account_id);
              if (account === undefined)
                return JSON.stringify({
                  granted: false,
                  refused: 'Unknown account_id',
                });
              service.grant(info.botSlug, account.accountId, args.access);
              const entry = mounted.get(agent);
              if (entry !== undefined) await sync(entry);
              return JSON.stringify({
                granted: true,
                service: account.service,
                access:
                  service.forBot(info.botSlug).find((c) => c.accountId === account.accountId)
                    ?.access ?? args.access,
                tools:
                  account.provider === 'mcp'
                    ? `mcp__${remoteMcpServerName(account.accountId, account.service)}__*`
                    : `${CONNECTOR_TOOL_PREFIX}COMPOSIO_SEARCH_TOOLS`,
              });
            },
          }),
        );
        const entry: Mounted = {
          botSlug: info.botSlug,
          agentCtx,
          signature: undefined,
          fiber: undefined,
          remote: new Map(),
          queue: Promise.resolve(),
          disposed: false,
          retry: undefined,
          renew: undefined,
        };
        mounted.set(agent, entry);
        agentCtx.effect(
          () => () => {
            entry.disposed = true;
            if (entry.retry !== undefined) clearTimeout(entry.retry);
            entry.retry = undefined;
            if (entry.renew !== undefined) clearTimeout(entry.renew);
            entry.renew = undefined;
            for (const mount of entry.remote.values())
              void Promise.resolve(mount.fiber.dispose()).catch(() => undefined);
            entry.remote.clear();
            if (mounted.get(agent) === entry) mounted.delete(agent);
            const fiber = entry.fiber;
            entry.fiber = undefined;
            if (fiber !== undefined) void Promise.resolve(fiber.dispose()).catch(() => undefined);
          },
          'botharness: connector MCP',
        );
        void sync(entry);
      }),
    'botharness: connector tools',
  );
}
