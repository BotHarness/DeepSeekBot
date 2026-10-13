import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import type { BotHarnessCore } from '../plugin.js';
import { PrivateInputs } from './private-inputs.js';
import { ProtectedExecution } from './protected-execution.js';
import type { PrivateInputLog } from './diagnostics.js';
import { LinuxMcp } from './linux-mcp.js';
import { PRIVATE_MCP_TOOL, ProtectedMcp } from './protected-mcp.js';
import { nativeExecutionRoot } from '../workspaces/grant-native-tools.js';
import { isQualifiedMessagingName, messagingToolDenial } from './messaging-tools.js';
import { privateInputWebUrl } from './web-locator.js';

const SAFE_TOOLS = new Set([
  'ask_secret',
  'protected_cli',
  'bash',
  'channel_send',
  'channel_read',
  'channel_list',
  'ask_user_question',
  'inbox_ignore',
  'bot_schedule_list',
  'bot_schedule_create',
  'bot_schedule_update',
  'bot_schedule_delete',
]);
export function mountPrivateInputs(
  ctx: Context,
  core: BotHarnessCore,
  enabled: boolean,
  execution = new ProtectedExecution((phase, details = {}) =>
    ctx.logger.info('private-input %j', { phase, ...details }),
  ),
  linuxMcp?: LinuxMcp,
  webUrl?: string,
): PrivateInputs {
  if (webUrl !== undefined)
    privateInputWebUrl(webUrl, 'dm-check', '00000000-0000-0000-0000-000000000000');
  const log: PrivateInputLog = (phase, details = {}) =>
    ctx.logger.info('private-input %j', { phase, ...details });
  const privateMcp = new ProtectedMcp(log);
  let mode: 'checking' | 'ordinary' | 'protected' | 'locked' = enabled ? 'protected' : 'checking';
  ctx.inject(['credentials'], (child) => {
    void child.credentials.listRecords().then(
      (records) => {
        if (!enabled)
          mode = records.some((record) => record.key.startsWith('botharness-private/'))
            ? 'locked'
            : 'ordinary';
        void owner.recover().catch(() => log('recovery-unavailable'));
      },
      () => {
        mode = 'locked';
        log('credential-inventory-failed');
      },
    );
    child.on('credentials/record-updated', (key) => {
      if (!enabled && key.startsWith('botharness-private/')) mode = 'locked';
    });
  });
  const owner = new PrivateInputs({
    channels: core.channels,
    ownership: core.ownership,
    registry: core.registry,
    credentials: () => ctx.get('credentials'),
    isLive: (agent) => ctx.agents.get(agent.id) === agent,
    canRequest: (agent, sourceEventId) =>
      core.runtime.canRequestPrivateInput?.(agent.session.id, sourceEventId) === true,
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
    qualified: () =>
      enabled && mode === 'protected' ? execution.qualified() : Promise.resolve(false),
    log,
    changed: (botSlug, count) => core.states.setPrivateInputCount(botSlug, count),
  });
  ctx.effect(() => () => owner.close(), 'botharness: private input owner');
  ctx.effect(() => () => execution.close(), 'botharness: protected Execution World');
  ctx.effect(() => () => privateMcp.close(), 'botharness: protected MCP lifetime');
  ctx.tools.guard(({ name, agent }) => {
    if (mode === 'ordinary') return undefined;
    if (mode !== 'protected' && name === 'bash')
      return 'Stored private grants require the protected Profile execution boundary';
    if (
      mode === 'protected' &&
      agent !== undefined &&
      core.ownership.resolve(agent.session.id)?.rootRole === 'orchestrator'
    ) {
      if (name === 'bash') return undefined;
      if (isQualifiedMessagingName(name)) return messagingToolDenial(ctx, agent, name);
      if (name === PRIVATE_MCP_TOOL) return privateMcp.denial(ctx, agent);
      if (name.startsWith('mcp__') && linuxMcp !== undefined)
        return linuxMcp.denial(ctx, agent, name);
    }
    if (
      !SAFE_TOOLS.has(name) ||
      (name.startsWith('bot_schedule_') &&
        (agent === undefined ||
          core.ownership.resolve(agent.session.id)?.rootRole !== 'orchestrator')) ||
      (name !== 'bash' &&
        (agent === undefined || core.ownership.resolve(agent.session.id) === undefined))
    )
      return 'This protected Profile has not qualified that Host capability; use an ordinary Profile for nonsecret Host tools';
    return undefined;
  });
  ctx.on(
    'tools/execute',
    async (call, next) => {
      if (mode === 'ordinary' || call.name !== 'bash') return next();
      if (mode !== 'protected')
        throw new Error('Protected execution is required for stored private grants');
      if (
        typeof call.arguments === 'object' &&
        call.arguments !== null &&
        'run_in_background' in call.arguments &&
        call.arguments.run_in_background === true
      )
        throw new Error('Protected commands require a foreground command');
      if (
        call.agent !== undefined &&
        core.ownership.resolve(call.agent.session.id)?.rootRole === 'orchestrator'
      ) {
        nativeExecutionRoot(core, call.agent.session, 'bash', call.arguments);
        return next();
      }
      const args = call.arguments;
      if (
        typeof args !== 'object' ||
        args === null ||
        !('command' in args) ||
        typeof args.command !== 'string' ||
        ('run_in_background' in args && args.run_in_background === true)
      )
        throw new Error('Protected commands require a foreground command');
      const text = await execution.command(args.command, call.signal);
      return {
        isError: false,
        value: {
          kind: 'foreground',
          exitCode: 0,
          signal: null,
          timedOut: false,
          aborted: false,
          timeoutMs: 30_000,
          stdout: { text, truncated: false },
          stderr: { text: '', truncated: true },
        },
        content: [{ type: 'text', text }],
      };
    },
    { global: true },
  );
  if (!enabled) return owner;
  ctx.effect(
    () =>
      core.contributeBotAgentSetup((agentCtx, agent, info) => {
        if (info.rootRole !== 'orchestrator') return;
        privateMcp.register(agentCtx, agent, owner);
        agentCtx.tools.register(
          defineTool({
            name: 'ask_secret',
            description:
              'Reuse configured private references, or ask the authenticated Owner for private strings in an interactive conversation. Declare account, purpose and dynamic fields. Web and scheduled runs must omit source_event_id; configured accounts can be reused without an IM source or new input. For an accepted IM Source Event the Host sends the Owner an existing Web Chat card link; never collect private values in IM text, attachments, quoted messages or ordinary questions. Returns opaque references only. Do not send references or private configuration details to IM; report only the authorized nonsecret operation result with bridge_reply to the same source. Private input does not approve execution. Unattended runs cannot open input cards. A failed handoff may already have sent its notice; report missing private configuration and do not retry.',
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
      }),
    'botharness: private input Tool Consumers',
  );
  return owner;
}
