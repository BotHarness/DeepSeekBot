import { randomUUID } from 'node:crypto';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

import {
  composioAuthorizationScope,
  connectorAccessMap,
  runComposioInvocation,
} from '../../connectors/mount.js';
import {
  CONNECTOR_TOOL_PREFIX,
  LEGACY_READ_REFUSAL,
  STALE_SIGN_IN_REFUSAL,
  connectorToolDenial,
  remoteMcpServerName,
} from '../../connectors/policy.js';
import type { ConnectorService } from '../../connectors/service.js';
import type { EngineBotTool, EngineToolSource } from '../../engines/engine-tools.js';

interface McpConnection {
  url: string;
  headers: Record<string, string>;
}

async function withClient<T>(
  connection: McpConnection,
  signal: AbortSignal,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  const transport = new StreamableHTTPClientTransport(new URL(connection.url), {
    requestInit: { headers: connection.headers, redirect: 'error' },
  });
  const client = new Client({ name: 'Tobs', version: '1.0.0' });
  try {
    await client.connect(transport, { signal });
    return await run(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

const DISCOVERY_ARGS = { tools: [] };
const DISCOVERY_TIMEOUT = 8000;

export function engineConnectorTools(
  service: ConnectorService,
  approval: () => Parameters<typeof runComposioInvocation>[0]['approve'],
): EngineToolSource {
  return async ({ botSlug, sessionId, signal }) => {
    const scope = { sessionId };
    const granted = service.forBot(botSlug, scope).filter((account) => account.status === 'active');
    const timeout = AbortSignal.timeout(DISCOVERY_TIMEOUT);
    const discovery = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
    const listed = async (connection: McpConnection) =>
      withClient(
        connection,
        discovery,
        async (client) => (await client.listTools(undefined, { signal: discovery })).tools,
      );
    const composio = async (): Promise<EngineBotTool[]> => {
      const signature = composioAuthorizationScope(service, botSlug, scope);
      const connection = await service.session(botSlug, scope);
      if (connection === undefined) return [];
      const tools = await listed(connection);
      const initial = connectorAccessMap(service, botSlug, scope);
      return tools.flatMap((tool): EngineBotTool[] => {
        const name = CONNECTOR_TOOL_PREFIX + tool.name;
        const batch = tool.name === 'COMPOSIO_MULTI_EXECUTE_TOOL';
        if (!batch && connectorToolDenial(name, DISCOVERY_ARGS, initial) !== undefined) return [];
        return [
          {
            name,
            description: tool.description ?? tool.name,
            inputSchema: tool.inputSchema,
            assignment: true,
            async run(args, signal, context) {
              if (context?.session.id !== sessionId)
                throw new Error('App connection tools require their engine Session.');
              const authorize = () => {
                signal.throwIfAborted();
                const access = connectorAccessMap(service, botSlug, scope);
                const denial = connectorToolDenial(name, args, access);
                if (denial !== undefined) throw new Error(denial);
                if (signature !== composioAuthorizationScope(service, botSlug, scope))
                  throw new Error(STALE_SIGN_IN_REFUSAL);
                return access;
              };
              authorize();
              const callId = `connector:${randomUUID()}`;
              const agent = {
                id: `engine:${sessionId}`,
                session: context.session,
              } as unknown as Agent;
              const execution = {
                name,
                callId,
                rootCallId: callId,
                agent,
                signal,
                arguments: args,
              } as unknown as ToolExecution;
              return runComposioInvocation({
                service,
                botSlug,
                scope,
                execution,
                authorize,
                approve: approval(),
                dispatch: (claim) =>
                  withClient(connection, signal, async (client) => {
                    const finish = claim();
                    try {
                      return await client.callTool(
                        { name: tool.name, arguments: args },
                        { signal },
                      );
                    } finally {
                      finish();
                    }
                  }),
              });
            },
          },
        ];
      });
    };
    const remote = async (account: (typeof granted)[number]): Promise<EngineBotTool[]> => {
      const { accountId } = account;
      const revision = service.account(accountId)?.revision;
      const connection = await service.remote.connection(accountId);
      if (connection === undefined) return [];
      const prefix = `mcp__${remoteMcpServerName(accountId, account.service)}__`;
      const tools = await listed(connection);
      const authorize = () => {
        const current = service
          .forBot(botSlug, scope)
          .find((entry) => entry.accountId === accountId && entry.status === 'active');
        const record = service.account(accountId);
        if (current === undefined || record?.revision !== revision)
          throw new Error(STALE_SIGN_IN_REFUSAL);
        if (current.access === 'read' && record?.access !== 'read')
          throw new Error(LEGACY_READ_REFUSAL);
      };
      authorize();
      return tools.map((tool) => ({
        name: prefix + tool.name,
        description: tool.description ?? tool.name,
        inputSchema: tool.inputSchema,
        assignment: true,
        async run(args, signal, context) {
          if (context?.session.id !== sessionId)
            throw new Error('App connection tools require their engine Session.');
          authorize();
          const current = await service.remote.connection(accountId);
          if (current === undefined) throw new Error(STALE_SIGN_IN_REFUSAL);
          return withClient(current, signal, async (client) => {
            signal.throwIfAborted();
            authorize();
            const finish = service.consumeOnce(botSlug, sessionId, new Set([accountId]));
            try {
              return await client.callTool({ name: tool.name, arguments: args }, { signal });
            } finally {
              finish();
            }
          });
        },
      }));
    };
    const available = await Promise.allSettled([
      ...(granted.some((account) => account.provider === 'composio') ? [composio()] : []),
      ...granted.filter((account) => account.provider === 'mcp').map(remote),
    ]);
    return available.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
  };
}
