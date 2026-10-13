import { basename } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import type { BotHarnessCore } from '../plugin.js';
import { PrivateInputs } from './private-inputs.js';
import { ProtectedExecution, SecretHttpRefusal } from './protected-execution.js';
import {
  SecretCommandRefusal,
  runSecretCommand,
  secretCommandBaseEnv,
  secretCommandPlan,
} from './secret-command.js';
import { SecretMcpServers, rememberedStarts, secretMcpEnv, secretMcpPlan } from './secret-mcp.js';
import type { SecretMcpStore } from './secret-mcp-store.js';
import type { PrivateInputLog } from './diagnostics.js';
import { privateInputWebUrl } from './web-locator.js';
import { credentialStoreDenial, credentialStorePath, denyStoreRead } from './store-guard.js';
import { resolveDshHome } from '../im/config-store.js';

export function mountPrivateInputs(
  ctx: Context,
  core: BotHarnessCore,
  execution = new ProtectedExecution((phase, details = {}) =>
    ctx.logger.info('private-input %j', { phase, ...details }),
  ),
  webUrl?: string,
  dshHome = resolveDshHome(),
  store?: SecretMcpStore,
): PrivateInputs {
  if (webUrl !== undefined)
    privateInputWebUrl(webUrl, 'dm-check', '00000000-0000-0000-0000-000000000000');
  const log: PrivateInputLog = (phase, details = {}) =>
    ctx.logger.info('private-input %j', { phase, ...details });
  ctx.inject(['credentials'], () => {
    queueMicrotask(() => void owner.recover().catch(() => log('recovery-unavailable')));
  });
  const owner = new PrivateInputs({
    channels: core.channels,
    ownership: core.ownership,
    registry: core.registry,
    credentials: () => ctx.get('credentials'),
    isLive: (agent) => ctx.agents.get(agent.id) === agent,
    canRequest: (agent, sourceEventId) =>
      core.runtime.canRequestPrivateInput?.(agent.session.id, sourceEventId) === true,
    askChannel: (sessionId) => core.runtime.askChannel?.(sessionId),
    origin: (agent, sourceEventId) =>
      core.runtime.bindPrivateInputOrigin?.(agent.session.id, sourceEventId),
    replyAuthority: (botSlug, sourceEventId, authority) =>
      core.externalMessaging.privateInputReplyAuthority(botSlug, sourceEventId, authority),
    ...(webUrl === undefined
      ? {}
      : {
          notify: async (
            botSlug: string,
            origin: import('./im-origin.js').PrivateInputOrigin,
            channelId: string,
            messageId: string,
          ) => {
            if (!origin.current()) throw new Error('Private input IM authority changed');
            await core.externalMessaging.privateInputNotice(
              botSlug,
              origin.sourceEventId,
              messageId,
              privateInputWebUrl(webUrl, channelId, messageId),
              {
                signal: origin.signal,
                current: () => origin.current() && owner.status(channelId, messageId) === 'pending',
              },
            );
          },
        }),
    qualified: () => Promise.resolve(true),
    log,
    changed: (botSlug, count) => core.states.setPrivateInputCount(botSlug, count),
  });
  ctx.inject(['sandbox'], (child) => {
    const sandbox = child.get('sandbox') as unknown as {
      confine(...args: unknown[]): Promise<{ argv: string[] }>;
    };
    const original = sandbox.confine;
    const store = credentialStorePath(dshHome);
    const reported = new Set<string>();
    sandbox.confine = async function (this: unknown, ...args: unknown[]) {
      const confined = await original.apply(this, args);
      const denied = denyStoreRead(confined, store);
      const runner = basename(confined.argv[0] ?? 'none');
      if (denied === confined && !reported.has(runner)) {
        reported.add(runner);
        ctx.logger.warn(
          'botharness: the Shell sandbox runner %s has no credential store read denial; only the command text guard applies',
          runner,
        );
      }
      return denied;
    };
    child.effect(
      () => () => {
        sandbox.confine = original;
      },
      'botharness: credential store read denial',
    );
  });
  const mcpServers = new SecretMcpServers();
  ctx.effect(() => () => mcpServers.close(), 'botharness: secret MCP servers');
  owner.mcpServers = {
    list: (botSlug) => {
      const connected = mcpServers.connected(botSlug);
      return (store?.list(botSlug) ?? []).map((record) => ({
        serverName: record.serverName,
        account: record.account,
        program: record.program,
        args: record.args,
        approvedAt: record.approvedAt,
        connected: connected.has(record.serverName),
      }));
    },
    remove: async (botSlug, serverName) => {
      const stopped = await mcpServers.stopFor(botSlug, serverName);
      return (store?.remove(botSlug, serverName) ?? false) || stopped > 0;
    },
    erase: async (botSlug) => {
      await mcpServers.stopFor(botSlug);
      store?.eraseBot(botSlug);
    },
  };
  ctx.on(
    'tools/execute',
    async (call, next) => {
      const result = await next();
      if (call.agent === undefined || !call.name.startsWith('mcp__')) return result;
      const agent = call.agent;
      if (!mcpServers.owns(agent, call.name)) return result;
      const masked = (value: unknown): unknown => {
        if (typeof value === 'string') return mcpServers.mask(agent, call.name, value);
        if (Array.isArray(value)) return value.map(masked);
        if (
          value !== null &&
          typeof value === 'object' &&
          Object.getPrototypeOf(value) === Object.prototype
        )
          return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [key, masked(entry)]),
          );
        return value;
      };
      return masked(result) as typeof result;
    },
    { global: true },
  );
  ctx.effect(() => () => owner.close(), 'botharness: private input owner');
  ctx.effect(() => () => execution.close(), 'botharness: protected Execution World');
  ctx.tools.guard(({ name, agent, arguments: args }) =>
    credentialStoreDenial(name, args, dshHome, agent?.session.header.cwd),
  );
  ctx.effect(
    () =>
      core.contributeBotAgentSetup((agentCtx, agent, info) => {
        if (info.rootRole !== 'orchestrator') return;
        agentCtx.tools.register(
          defineTool({
            name: 'ask_secret',
            description:
              'Reuse configured private references, or ask the authenticated Owner for private strings in an interactive conversation. Declare account, purpose and dynamic fields. Web and scheduled runs must omit source_event_id; configured accounts can be reused without an IM source or new input. For an accepted IM Source Event the Host sends the Owner an existing Web Chat card link; never collect private values in IM text, attachments, quoted messages or ordinary questions. For a local Channel request the input card appears in the Channel the request came from, a Group or your Human DM; only the Owner can fill it, the values are never shown there, and only you receive the references. In a Group, say first in a sentence what the account is for, and never ask anyone to type a secret into the conversation. Returns opaque references only. Do not send references or private configuration details to IM; report only the authorized nonsecret operation result with bridge_reply to the same source. Private input does not approve execution. Unattended runs cannot open input cards. A failed handoff may already have sent its notice; report missing private configuration and do not retry.',
            parameters: {
              account: {
                type: 'string',
                required: true,
                description:
                  'Nonsecret name of the secret the Owner will recognise later, naming the service and credential kind, for example "GitHub personal access token".',
              },
              source_event_id: {
                type: 'string',
                description:
                  'Optional IM-only selector: exact currently accepted IM Source Event, required when several IM requests are active. Omit for Web and scheduled reuse; never pass a Schedule Source Event or historical IM source.',
              },
              purpose: {
                type: 'string',
                required: true,
                description:
                  'Why the secret is needed in this situation: which credential or API key it is, which service it is for and what the Bot will do with it. Shown to the Owner on the card and later in Channel settings.',
              },
              fields: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', required: true },
                    label: { type: 'string', required: true },
                    required: { type: 'boolean', required: true },
                  },
                  additionalProperties: false,
                },
                description:
                  '1–8 confidential fields with unique lowercase identifiers, labels and requiredness; no defaults or values.',
              },
            },
            output: {
              schema: { type: 'string' },
              render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: async (args, call) => {
              const { source_event_id: sourceEventId, ...declaration } = args;
              return JSON.stringify(
                await owner.ask(agent, declaration, call.signal, sourceEventId),
              );
            },
          }),
        );
        agentCtx.tools.register(
          defineTool({
            name: 'protected_cli',
            description:
              'Run a qualified trusted CLI using opaque private references. Supported consumer: http-status-v1, one GET with endpoint, api_key and api_secret references; returns only numeric HTTP status and request success, never response text. A successful HTTP status does not independently certify remote authentication. No arbitrary command, env, headers, redirects or plaintext fallback. Existing Human execution approval applies.',
            parameters: {
              consumer: { type: 'string', required: true, description: 'http-status-v1' },
              account: {
                type: 'string',
                required: true,
                description: 'Exact nonsecret account from ask_secret.',
              },
              endpoint: {
                type: 'string',
                required: true,
                description: 'Opaque endpoint reference.',
              },
              api_key: { type: 'string', required: true, description: 'Opaque API key reference.' },
              api_secret: {
                type: 'string',
                required: true,
                description: 'Opaque API secret reference.',
              },
            },
            output: {
              schema: { type: 'string' },
              render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: async (args, call) => {
              if (args.consumer !== 'http-status-v1')
                throw new Error('Protected CLI consumer is unsupported');
              return JSON.stringify(
                await owner.consume(
                  agent,
                  args.account,
                  { endpoint: args.endpoint, api_key: args.api_key, api_secret: args.api_secret },
                  (values, signal) => execution.authenticatedStatus(values, signal),
                  call.signal,
                ),
              );
            },
          }),
        );
        agentCtx.tools.register(
          defineTool({
            name: 'secret_http',
            description:
              'Call an HTTP API with secrets the Owner entered through ask_secret, without ever seeing them. The Host sends the request. The destination is the Owner-supplied endpoint field of that account; you choose only a path under it, the method, and where each secret goes. Write {{field_id}} in a header value, a query value or the body where a secret belongs and the Host substitutes it. Redirects are refused. Returns the HTTP status, content type and up to 32 KB of response text with the secret values masked. Existing Human execution approval applies.',
            parameters: {
              account: {
                type: 'string',
                required: true,
                description: 'Exact nonsecret account from ask_secret.',
              },
              references: {
                type: 'array',
                required: true,
                items: { type: 'string' },
                description:
                  'The opaque references from ask_secret that this request uses, including the one for the endpoint field.',
              },
              endpoint_field: {
                type: 'string',
                description:
                  'Field id that holds the Owner-supplied base URL; defaults to endpoint.',
              },
              method: {
                type: 'string',
                required: true,
                description: 'GET, POST, PUT, PATCH or DELETE.',
              },
              path: {
                type: 'string',
                required: true,
                description:
                  'Path and optional query under the endpoint, starting with /, or an empty string for the endpoint itself.',
              },
              headers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', required: true },
                    value: { type: 'string', required: true },
                  },
                  additionalProperties: false,
                },
                description:
                  'Request headers; a value may contain {{field_id}}, for example "Bearer {{api_key}}".',
              },
              query: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', required: true },
                    value: { type: 'string', required: true },
                  },
                  additionalProperties: false,
                },
                description: 'Extra query parameters; a value may contain {{field_id}}.',
              },
              body: {
                type: 'string',
                description: 'Request body text, up to 64 KB; may contain {{field_id}}.',
              },
            },
            output: {
              schema: { type: 'string' },
              render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: async (args, call) => {
              const endpointField = args.endpoint_field ?? 'endpoint';
              const references: Record<string, string> = {};
              for (const reference of args.references) {
                const field = /^private:[0-9a-f-]{36}:([a-z][a-z0-9_]{0,47})$/.exec(reference)?.[1];
                if (field === undefined || references[field] !== undefined)
                  throw new Error('references must be distinct ask_secret references');
                references[field] = reference;
              }
              if (references[endpointField] === undefined)
                throw new Error('references must include the endpoint field');
              return JSON.stringify(
                await owner.consume(
                  agent,
                  args.account,
                  references,
                  async (values, signal) => {
                    const fill = (text: string): string =>
                      text.replace(/\{\{([a-z][a-z0-9_]{0,47})\}\}/g, (_match, field: string) => {
                        const value = field === endpointField ? undefined : values[field];
                        if (value === undefined)
                          throw new SecretHttpRefusal(
                            'A placeholder names a field that was not referenced',
                          );
                        return value;
                      });
                    try {
                      return await execution.authenticatedRequest(
                        {
                          endpoint: values[endpointField]!,
                          path: args.path,
                          method: args.method,
                          headers: (args.headers ?? []).map((entry) => ({
                            name: entry.name,
                            value: fill(entry.value),
                          })),
                          query: (args.query ?? []).map((entry) => ({
                            name: entry.name,
                            value: fill(entry.value),
                          })),
                          ...(args.body === undefined ? {} : { body: fill(args.body) }),
                        },
                        Object.entries(values)
                          .filter(([field]) => field !== endpointField)
                          .map(([, value]) => value),
                        signal,
                      );
                    } catch (error) {
                      if (!(error instanceof SecretHttpRefusal)) throw error;
                      return {
                        consumer: 'http-request-v1',
                        successful: false,
                        refused: error.message,
                      };
                    }
                  },
                  call.signal,
                ),
              );
            },
          }),
        );
        agentCtx.tools.register(
          defineTool({
            name: 'secret_cli',
            description:
              'Run one installed command-line tool with secrets the Owner entered through ask_secret placed in its environment, for a tool that only reads its credential from an environment variable. Prefer secret_http for a plain HTTP API. The Host starts the program directly, without a shell: no pipes, redirects, variables or substitutions. Give the bare program name, its arguments, and the environment variables the tool documents, writing {{field_id}} where a secret belongs. It runs in your working folder inside the same file sandbox as bash, with a clean environment, for at most two minutes. Returns the exit code and up to 32 KB each of stdout and stderr with the secret values masked. Every call needs its own Human approval, which shows the exact program and arguments; a saved approval never covers it. Never ask the tool to print, export or store the credential.',
            parameters: {
              account: {
                type: 'string',
                required: true,
                description: 'Exact nonsecret account from ask_secret.',
              },
              references: {
                type: 'array',
                required: true,
                items: { type: 'string' },
                description: 'The opaque references from ask_secret that this command uses.',
              },
              program: {
                type: 'string',
                required: true,
                description:
                  'Bare name of the installed tool, for example gh. Not a path, shell or interpreter.',
              },
              args: {
                type: 'array',
                required: true,
                items: { type: 'string' },
                description: 'Arguments, one per item, passed as written. No secrets here.',
              },
              env: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', required: true },
                    value: { type: 'string', required: true },
                  },
                  additionalProperties: false,
                },
                description:
                  'Environment variables for the tool; a value contains {{field_id}}, for example name GH_TOKEN, value {{token}}.',
              },
            },
            output: {
              schema: { type: 'string' },
              render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: async (args, call) => {
              const references: Record<string, string> = {};
              for (const reference of args.references) {
                const field = /^private:[0-9a-f-]{36}:([a-z][a-z0-9_]{0,47})$/.exec(reference)?.[1];
                if (field === undefined || references[field] !== undefined)
                  throw new Error('references must be distinct ask_secret references');
                references[field] = reference;
              }
              const refuse = (reason: string) =>
                JSON.stringify({ consumer: 'command-v1', successful: false, refused: reason });
              const cwd = agent.session.header.cwd;
              const sandbox = ctx.get('sandbox') as unknown as
                | {
                    confine(
                      argv: readonly string[],
                      policy: { mode: 'workspace-write'; workspaceRoot: string },
                      signal?: AbortSignal,
                    ): Promise<{ argv: string[] }>;
                  }
                | undefined;
              if (cwd === undefined || sandbox === undefined)
                return refuse('The Shell sandbox is unavailable, so the command was not started');
              let command: string[];
              let names: string[];
              try {
                ({ command, names } = secretCommandPlan(args));
              } catch (error) {
                if (error instanceof SecretCommandRefusal) return refuse(error.message);
                throw error;
              }
              let confined: { argv: string[] };
              try {
                confined = await sandbox.confine(
                  command,
                  { mode: 'workspace-write', workspaceRoot: cwd },
                  call.signal,
                );
              } catch {
                return refuse('The Shell sandbox is unavailable, so the command was not started');
              }
              return JSON.stringify(
                await owner.consume(
                  agent,
                  args.account,
                  references,
                  async (values, signal) => {
                    try {
                      const env = secretCommandBaseEnv();
                      for (const [index, entry] of args.env.entries())
                        env[names[index]!] = entry.value.replace(
                          /\{\{([a-z][a-z0-9_]{0,47})\}\}/g,
                          (_match, field: string) => {
                            const value = values[field];
                            if (value === undefined)
                              throw new SecretCommandRefusal(
                                'A placeholder names a field that was not referenced',
                              );
                            return value;
                          },
                        );
                      return await runSecretCommand(
                        confined.argv,
                        env,
                        cwd,
                        Object.values(values),
                        signal,
                      );
                    } catch (error) {
                      if (!(error instanceof SecretCommandRefusal)) throw error;
                      return { consumer: 'command-v1', successful: false, refused: error.message };
                    }
                  },
                  call.signal,
                ),
              );
            },
          }),
        );
        const connectServer = async (
          input: {
            server_name: string;
            account: string;
            references: string[];
            program: string;
            args: string[];
            env: Array<{ name: string; value: string }>;
          },
          signal?: AbortSignal,
        ): Promise<string> => {
          const references: Record<string, string> = {};
          for (const reference of input.references) {
            const field = /^private:[0-9a-f-]{36}:([a-z][a-z0-9_]{0,47})$/.exec(reference)?.[1];
            if (field === undefined || references[field] !== undefined)
              throw new Error('references must be distinct ask_secret references');
            references[field] = reference;
          }
          const refuse = (reason: string) =>
            JSON.stringify({ consumer: 'mcp-v1', connected: false, refused: reason });
          const cwd = agent.session.header.cwd;
          const sandbox = ctx.get('sandbox') as unknown as
            | {
                confine(
                  argv: readonly string[],
                  policy: { mode: 'workspace-write'; workspaceRoot: string },
                  signal?: AbortSignal,
                ): Promise<{ argv: string[] }>;
              }
            | undefined;
          if (cwd === undefined || sandbox === undefined)
            return refuse('The Shell sandbox is unavailable, so the server was not started');
          let plan: ReturnType<typeof secretMcpPlan>;
          try {
            plan = secretMcpPlan(input);
          } catch (error) {
            if (error instanceof SecretCommandRefusal) return refuse(error.message);
            throw error;
          }
          if (mcpServers.has(agent, plan.serverName))
            return refuse('an MCP server with this server_name is already connected');
          let confined: { argv: string[] };
          try {
            confined = await sandbox.confine(
              plan.command,
              { mode: 'workspace-write', workspaceRoot: cwd },
              signal,
            );
          } catch {
            return refuse('The Shell sandbox is unavailable, so the server was not started');
          }
          return await new Promise<string>((resolve, reject) => {
            let settled = false;
            const settle = (text: string) => {
              if (settled) return;
              settled = true;
              resolve(text);
            };
            owner
              .consume(agent, input.account, references, async (values, signal) => {
                const env = secretMcpEnv();
                try {
                  for (const [index, entry] of input.env.entries())
                    env[plan.names[index]!] = entry.value.replace(
                      /\{\{([a-z][a-z0-9_]{0,47})\}\}/g,
                      (_match, field: string) => {
                        const value = values[field];
                        if (value === undefined)
                          throw new SecretCommandRefusal(
                            'A placeholder names a field that was not referenced',
                          );
                        return value;
                      },
                    );
                  const running = await mcpServers.start(
                    agentCtx,
                    agent,
                    {
                      botSlug: info.botSlug,
                      serverName: plan.serverName,
                      account: input.account,
                      argv: confined.argv,
                      cwd,
                    },
                    env,
                    Object.values(values),
                  );
                  settle(
                    JSON.stringify({
                      consumer: 'mcp-v1',
                      connected: true,
                      serverName: plan.serverName,
                      tools: running.tools,
                    }),
                  );
                  await new Promise<void>((stopped) => {
                    const stop = () => void running.stop().finally(stopped);
                    signal.addEventListener('abort', stop, { once: true });
                    agentCtx.effect(() => stop, 'botharness: secret MCP server');
                    running.stopped = stopped;
                  });
                  if (signal.aborted) throw new Error('Secret MCP server stopped');
                } catch (error) {
                  if (!(error instanceof SecretCommandRefusal)) throw error;
                  settle(refuse(error.message));
                } finally {
                  for (const name of plan.names) delete env[name];
                }
              })
              .then(
                () => settle(refuse('the MCP server stopped')),
                (error: unknown) => (settled ? undefined : reject(error)),
              );
          });
        };
        agentCtx.tools.register(
          defineTool({
            name: 'secret_mcp_connect',
            description:
              'Start an MCP server for yourself with secrets the Owner entered through ask_secret placed in its environment, then use its tools as mcp__<server_name>__<tool>. Use it for an integration that needs a client library or several calls; prefer secret_http for one plain HTTP request and secret_cli for one command. The Host starts the launcher directly, without a shell, inside the same file sandbox as bash with a clean environment; give the bare launcher name (for example npx or uvx), its arguments, and the environment variables the server documents, writing {{field_id}} where a secret belongs. The server stays connected for this conversation Session until you disconnect it or the account is revoked; it is not available to Assignments. Starting it needs a Human approval that shows the exact program and arguments; the Human may choose to remember it, and a remembered server is reconnected automatically when your Session starts, so check whether its tools are already present before connecting again. Each later tool call follows the usual approval. Returns the tool names the server offers.',
            parameters: {
              server_name: {
                type: 'string',
                required: true,
                description: 'Short name for the tool prefix: letters, digits, _ or -.',
              },
              account: {
                type: 'string',
                required: true,
                description: 'Exact nonsecret account from ask_secret.',
              },
              references: {
                type: 'array',
                required: true,
                items: { type: 'string' },
                description: 'The opaque references from ask_secret that this server uses.',
              },
              program: {
                type: 'string',
                required: true,
                description:
                  'Bare name of the installed launcher, for example npx. Not a path or shell.',
              },
              args: {
                type: 'array',
                required: true,
                items: { type: 'string' },
                description: 'Arguments, one per item, passed as written. No secrets here.',
              },
              env: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', required: true },
                    value: { type: 'string', required: true },
                  },
                  additionalProperties: false,
                },
                description:
                  'Environment variables for the server; a value contains {{field_id}}, for example name GITHUB_TOKEN, value {{token}}.',
              },
            },
            output: {
              schema: { type: 'string' },
              render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: async (args, call) => {
              const result = await connectServer(args, call.signal);
              if (rememberedStarts.delete(call.token) && mcpServers.has(agent, args.server_name))
                store?.put({
                  botSlug: info.botSlug,
                  serverName: args.server_name,
                  account: args.account,
                  program: args.program,
                  args: [...args.args],
                  env: args.env.map((entry) => ({ name: entry.name, value: entry.value })),
                  references: [...args.references],
                });
              return result;
            },
          }),
        );
        const remembered = store?.list(info.botSlug) ?? [];
        if (remembered.length > 0) {
          let disposed = false;
          agentCtx.effect(
            () => () => {
              disposed = true;
            },
            'botharness: secret MCP reconnect',
          );
          const reconnect = (attempt: number): void => {
            if (disposed || attempt > 120) return;
            if (ctx.agents.get(agent.id) !== agent) {
              setTimeout(() => reconnect(attempt + 1), 250).unref();
              return;
            }
            for (const server of remembered)
              void connectServer({
                server_name: server.serverName,
                account: server.account,
                references: server.references,
                program: server.program,
                args: server.args,
                env: server.env,
              }).then(
                (result) =>
                  log(
                    result.includes('"connected":true')
                      ? 'mcp-reconnected'
                      : 'mcp-reconnect-failed',
                    { botSlug: info.botSlug },
                  ),
                () => log('mcp-reconnect-failed', { botSlug: info.botSlug }),
              );
          };
          reconnect(0);
        }
        agentCtx.tools.register(
          defineTool({
            name: 'secret_mcp_disconnect',
            description:
              'Stop an MCP server you started with secret_mcp_connect, remove its tools and forget it so it is not reconnected. Without server_name it lists the servers you have connected.',
            parameters: {
              server_name: { type: 'string', description: 'The server_name used to connect.' },
            },
            output: {
              schema: { type: 'string' },
              render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: async (args) => {
              if (args.server_name === undefined)
                return JSON.stringify({ servers: mcpServers.list(agent) });
              const stopped = await mcpServers.stop(agent, args.server_name);
              const forgotten = store?.remove(info.botSlug, args.server_name) ?? false;
              return JSON.stringify({
                serverName: args.server_name,
                disconnected: stopped || forgotten,
                forgotten,
              });
            },
          }),
        );
      }),
    'botharness: private input Tool Consumers',
  );
  return owner;
}
