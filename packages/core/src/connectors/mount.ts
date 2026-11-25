import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import * as mcpClient from '@deepseek-ai/dsh-mcp-client';
import { defineTool } from '@deepseek-ai/dsh-tools';

import type { BotHarnessCore } from '../plugin-types.js';
import { CONNECTOR_CATALOG, catalogEntry, matchesCatalog } from './catalog.js';
import { CONNECTOR_MCP_SERVER, CONNECTOR_TOOL_PREFIX, connectorToolDenial } from './policy.js';
import { ConnectorError, type ConnectorService } from './service.js';
import type { ConnectorAccess } from './store.js';

type Fiber = ReturnType<Context['plugin']>;

interface Mounted {
  botSlug: string;
  agentCtx: Context;
  signature: string | undefined;
  fiber: Fiber | undefined;
  queue: Promise<void>;
  disposed: boolean;
}

export function connectorAccessMap(
  service: Pick<ConnectorService, 'forBot'>,
  botSlug: string,
): Record<string, ConnectorAccess> {
  const access: Record<string, ConnectorAccess> = {};
  for (const connector of service.forBot(botSlug)) {
    if (connector.status !== 'active') continue;
    if (access[connector.service] !== 'write') access[connector.service] = connector.access;
  }
  return access;
}

export function connectorCatalogFor(
  service: Pick<ConnectorService, 'forBot' | 'available'>,
  botSlug: string,
  configured: boolean,
  query?: string,
) {
  const granted = service.forBot(botSlug);
  const grantedIds = new Set(granted.map((connector) => connector.accountId));
  const requestable = service
    .available()
    .filter((account) => !grantedIds.has(account.accountId) && account.status === 'active');
  const catalog = CONNECTOR_CATALOG.filter((entry) => matchesCatalog(entry, query));
  const usable = granted.some((connector) => connector.status === 'active');
  return {
    configured,
    granted: granted.map((connector) => ({
      account_id: connector.accountId,
      service: connector.service,
      name: catalogEntry(connector.service)?.name ?? connector.service,
      label: connector.label,
      ...(connector.identity === undefined ? {} : { identity: connector.identity }),
      status: connector.status,
      access: connector.access,
    })),
    requestable: requestable.map((account) => ({
      account_id: account.accountId,
      service: account.service,
      name: catalogEntry(account.service)?.name ?? account.service,
      label: account.label,
    })),
    catalog: catalog.map((entry) => ({
      service: entry.service,
      name: entry.name,
      summary: entry.summary,
    })),
    next: usable
      ? `Use ${CONNECTOR_TOOL_PREFIX}COMPOSIO_SEARCH_TOOLS to find a tool, ${CONNECTOR_TOOL_PREFIX}COMPOSIO_GET_TOOL_SCHEMAS for its arguments, then ${CONNECTOR_TOOL_PREFIX}COMPOSIO_MULTI_EXECUTE_TOOL to run it.`
      : requestable.length > 0
        ? 'Call connector_request with the account_id the user needs; the Owner approves it on a card.'
        : configured
          ? 'Tell the user which app connection would help and ask the Owner to connect it in Settings › App connections; then call connector_request.'
          : 'App connections are not set up on this Host yet; ask the Owner to add a Composio API key in Settings › App connections.',
  };
}

export function mountConnectors(
  ctx: Context,
  core: Pick<BotHarnessCore, 'contributeBotAgentSetup' | 'ownership'>,
  service: ConnectorService,
): void {
  const mounted = new Map<Agent, Mounted>();
  const sync = (entry: Mounted): Promise<void> => {
    entry.queue = entry.queue.then(async () => {
      if (entry.disposed) return;
      const session = await service.session(entry.botSlug).catch((error: unknown) => {
        ctx.logger.warn(
          'botharness: connector session unavailable %j',
          error instanceof ConnectorError ? error.code : 'error',
        );
        return undefined;
      });
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
              'List the apps (App connections such as Gmail, Google Calendar, Drive, Notion, Slack, GitHub) you can use for the user, the Host accounts you could ask for, and the services the Owner could connect. Call it whenever the user asks what you can do, or asks for something in an outside app ("check my email", "我明天有什么会") before saying you cannot. Pass query with the user\'s words to narrow the list. It returns what to do next.',
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
              return JSON.stringify(
                connectorCatalogFor(service, info.botSlug, configured, args.query),
              );
            },
          }),
        );
        agentCtx.tools.register(
          defineTool({
            name: 'connector_request',
            description:
              'Ask the Owner to let you use one connected account listed as requestable by connector_catalog. The Owner approves or rejects it on a card that shows your reason. Ask for read unless the user asked you to send, create or change something there. After approval its tools appear under mcp__composio__.',
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
                access: args.access,
                tools: `${CONNECTOR_TOOL_PREFIX}COMPOSIO_SEARCH_TOOLS`,
              });
            },
          }),
        );
        const entry: Mounted = {
          botSlug: info.botSlug,
          agentCtx,
          signature: undefined,
          fiber: undefined,
          queue: Promise.resolve(),
          disposed: false,
        };
        mounted.set(agent, entry);
        agentCtx.effect(
          () => () => {
            entry.disposed = true;
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
