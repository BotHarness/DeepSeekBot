import { randomUUID } from 'node:crypto';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';

export const MESSAGING_OPTIONS = {
  'input-stdin': { type: 'boolean' },
  confirm: { type: 'boolean' },
  binding: { type: 'string' },
  source: { type: 'string' },
  channel: { type: 'string' },
  pairing: { type: 'string' },
  delivery: { type: 'string' },
  'request-id': { type: 'string' },
} as const;

export const MESSAGING_COMMANDS = [
  {
    command: 'messaging-defaults',
    description: 'read IM messaging defaults for one platform',
  },
  {
    command: 'messaging-defaults-set',
    description: 'set IM messaging defaults for one platform with JSON from stdin',
  },
  {
    command: 'messaging-grants',
    description: "list a Bot's authorized IM conversations with their policies and post limits",
  },
  {
    command: 'messaging-targets',
    description: 'list the conversations an IM app can reach',
  },
  {
    command: 'messaging-authorize',
    description: 'authorize a Bot to message one IM target',
  },
  {
    command: 'messaging-revoke',
    description: "revoke a Bot's IM conversation authorization (--confirm)",
  },
  {
    command: 'messaging-receive',
    description: 'turn receiving from an authorized IM conversation on or off',
  },
  {
    command: 'messaging-channel-target',
    description: 'route an authorized IM conversation into a Channel, or back to the Bot DM',
  },
  {
    command: 'messaging-group-policy',
    description: 'set the collection and wake policy of an IM group with JSON from stdin',
  },
  {
    command: 'messaging-thread-policy',
    description: 'set the follow and wake policy of an IM thread with JSON from stdin',
  },
  {
    command: 'messaging-source',
    description: 'read one received IM Source Event',
  },
  {
    command: 'messaging-conversation',
    description: 'open, mute, allow or block an IM conversation with JSON from stdin',
  },
  {
    command: 'messaging-reachable',
    description: 'list the groups a Bot binding can post to proactively',
  },
  {
    command: 'messaging-post',
    description: 'post a proactive message into a reachable IM group',
  },
  {
    command: 'messaging-post-status',
    description: 'inspect the proactive post a request id created, without posting again',
  },
  {
    command: 'messaging-post-limit',
    description: "set or clear a Bot binding's daily proactive post limit",
  },
  {
    command: 'messaging-send',
    description: 'send a message to an authorized IM conversation as the Bot',
  },
  {
    command: 'sender-access',
    description: 'change IM sender roles, groups, permissions or policy with JSON from stdin',
  },
  {
    command: 'channel-bridges',
    description: "list a Channel's IM bridges and bridge sources",
  },
  {
    command: 'channel-bridge',
    description: 'add, update or delete a Channel IM bridge with JSON from stdin',
  },
  {
    command: 'approval-routes',
    description: "read a Bot's IM approval route, destinations and deliveries",
  },
  {
    command: 'approval-route',
    description: 'route tool approvals to a paired IM user, or turn the route off',
  },
  {
    command: 'approval-test',
    description: 'send a test approval through the IM route',
  },
  {
    command: 'approval-retry',
    description: 'retry one failed IM approval delivery',
  },
  {
    command: 'question-retry',
    description: 'repair one IM question notification or unconfirmed answer',
  },
  {
    command: 'question-deliveries',
    description: "read a Bot's IM question notifications",
  },
  {
    command: 'failure-alerts',
    description: "read a Bot's IM failure-alert setting and deliveries",
  },
  {
    command: 'failure-alerts-set',
    description: 'turn IM failure alerts on or off for a Bot',
  },
  {
    command: 'failure-alerts-test',
    description: 'send a test failure alert through IM',
  },
  {
    command: 'failure-alerts-retry',
    description: 'retry one failed IM failure-alert delivery',
  },
] as const;

export type MessagingCommand = (typeof MESSAGING_COMMANDS)[number]['command'];

export interface MessagingValues {
  'input-stdin'?: boolean;
  confirm?: boolean;
  binding?: string;
  source?: string;
  channel?: string;
  pairing?: string;
  delivery?: string;
  'request-id'?: string;
  conversation?: string;
  grant?: string;
  app?: string;
  target?: string;
  cursor?: string;
  limit?: string;
  body?: string;
  'body-stdin'?: boolean;
  enabled?: boolean;
  disabled?: boolean;
}

type Rpc = <T>(method: string, args: Record<string, unknown>) => Promise<T>;

const PLATFORMS = ['feishu', 'slack', 'discord', 'weixin'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const STDIN_COMMANDS = new Set<MessagingCommand>([
  'messaging-defaults-set',
  'messaging-group-policy',
  'messaging-thread-policy',
  'messaging-conversation',
  'sender-access',
  'channel-bridge',
]);
const BODY_COMMANDS = new Set<MessagingCommand>([
  'messaging-post',
  'messaging-post-status',
  'messaging-send',
]);

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function uuid(value: string | undefined, flag: string): string {
  const trimmed = value?.trim() ?? '';
  if (!UUID.test(trimmed)) usage(`${flag} must be a UUID.`);
  return trimmed;
}

function required(value: string | undefined, flag: string): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) usage(`${flag} is required.`);
  return trimmed;
}

function destructive(input: Record<string, unknown>, command: MessagingCommand): boolean {
  const kind = typeof input['kind'] === 'string' ? input['kind'] : '';
  if (command === 'channel-bridge') return kind === 'delete';
  if (command === 'messaging-conversation') return kind === 'block' || kind === 'block-held';
  if (command === 'sender-access') return kind.startsWith('delete-');
  return false;
}

export interface MessagingOperation {
  command: MessagingCommand;
  target: string;
  values: MessagingValues;
  input?: Record<string, unknown>;
  text?: string;
}

export async function prepareMessaging(
  command: MessagingCommand,
  rest: string[],
  values: MessagingValues,
  io: BotCreateCliIo,
): Promise<MessagingOperation> {
  const what =
    command === 'messaging-defaults' || command === 'messaging-defaults-set'
      ? 'a platform'
      : command === 'messaging-targets'
        ? 'an IM app ref'
        : command.startsWith('channel-')
          ? 'a Channel id'
          : 'a Bot id';
  if (rest.length !== 1 || !rest[0]?.trim()) usage(`${command} needs exactly one target: ${what}.`);
  const target = rest[0].trim();
  if (what === 'a platform' && !PLATFORMS.includes(target))
    usage(`Choose one of ${PLATFORMS.join(', ')}.`);
  const operation: MessagingOperation = { command, target, values };
  if (STDIN_COMMANDS.has(command)) {
    if (values['input-stdin'] !== true) usage(`${command} requires --input-stdin.`);
    const raw = await (io.readStdin?.() ?? Promise.resolve(''));
    let parsed: unknown;
    try {
      if (raw.length > 65536) throw new Error('too large');
      parsed = JSON.parse(raw);
    } catch {
      usage('--input-stdin must be one JSON object of at most 64 KiB.');
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
      usage('--input-stdin must be one JSON object of at most 64 KiB.');
    operation.input = parsed as Record<string, unknown>;
    if (destructive(operation.input, command) && values.confirm !== true)
      usage(`This ${String(operation.input['kind'])} change needs --confirm.`);
  } else if (values['input-stdin'] === true) usage(`--input-stdin is not valid for ${command}.`);
  if (BODY_COMMANDS.has(command)) {
    if ((values.body !== undefined) === (values['body-stdin'] === true))
      usage(`${command} requires exactly one of --body or --body-stdin.`);
    const text = values['body-stdin']
      ? await (io.readStdin?.() ?? Promise.resolve(''))
      : values.body;
    if (!text?.trim()) usage(`${command} requires a nonempty message.`);
    if (text.length > 4000) usage('Messages are limited to 4000 characters.');
    operation.text = text;
  }
  const requestId = values['request-id'];
  if (requestId !== undefined && !/^[A-Za-z0-9_:.-]{8,128}$/u.test(requestId))
    usage('--request-id must be 8–128 letters, digits, _ : . or -.');
  switch (command) {
    case 'messaging-targets':
    case 'messaging-defaults':
    case 'messaging-defaults-set':
    case 'messaging-grants':
    case 'messaging-conversation':
    case 'sender-access':
    case 'channel-bridges':
    case 'channel-bridge':
    case 'approval-routes':
    case 'approval-test':
    case 'question-deliveries':
    case 'failure-alerts':
    case 'failure-alerts-test':
      break;
    case 'messaging-authorize':
      required(values.app, '--app');
      required(values.target, '--target');
      break;
    case 'messaging-revoke':
      uuid(values.grant, '--grant');
      if (values.confirm !== true)
        usage('Revoking stops the Bot from messaging this conversation. Pass --confirm.');
      break;
    case 'messaging-receive':
    case 'failure-alerts-set':
      if (command === 'messaging-receive') uuid(values.grant, '--grant');
      if (values.enabled === values.disabled)
        usage(`${command} needs exactly one of --enabled or --disabled.`);
      break;
    case 'messaging-channel-target':
      uuid(values.grant, '--grant');
      required(values.channel, '--channel');
      break;
    case 'messaging-group-policy':
    case 'messaging-send':
      uuid(values.grant, '--grant');
      break;
    case 'messaging-thread-policy':
    case 'messaging-source':
      required(values.source, '--source');
      break;
    case 'messaging-reachable':
      uuid(values.binding, '--binding');
      break;
    case 'messaging-post':
    case 'messaging-post-status':
      uuid(values.binding, '--binding');
      required(values.conversation, '--conversation');
      if (command === 'messaging-post-status' && requestId === undefined)
        usage('messaging-post-status requires the --request-id of the post.');
      break;
    case 'messaging-post-limit': {
      uuid(values.binding, '--binding');
      const limit = values.limit?.trim();
      if (
        limit !== 'none' &&
        !(Number.isSafeInteger(Number(limit)) && Number(limit) >= 1 && Number(limit) <= 10000)
      )
        usage('--limit must be 1–10000, or none to clear it.');
      break;
    }
    case 'approval-route':
      if (values.pairing !== 'none') uuid(values.pairing, '--pairing');
      break;
    case 'approval-retry':
    case 'question-retry':
    case 'failure-alerts-retry':
      uuid(values.delivery, '--delivery');
      break;
  }
  return operation;
}

export async function runMessaging(operation: MessagingOperation, rpc: Rpc): Promise<unknown> {
  const { command, target, values } = operation;
  const input = operation.input ?? {};
  const snapshot = async () => record(await rpc('messagingSnapshot', { slug: target }));
  const app = async (ref: string) => {
    const found = list(record(await rpc('messagingApps', {}))['apps']).find(
      (entry) => entry['ref'] === ref,
    );
    if (found === undefined)
      throw new CliLiveError('unknown-app', `The Host has no connected IM app ${ref}.`);
    return found;
  };
  const requestId = values['request-id'] ?? `cli-${randomUUID()}`;
  switch (command) {
    case 'messaging-defaults':
      return rpc('messagingDefaults', { platform: target });
    case 'messaging-defaults-set':
      return rpc('messagingDefaultsSet', { input: { ...input, platform: target } });
    case 'messaging-grants': {
      const value = await snapshot();
      return {
        grants: list(value['grants']).map((grant) => ({
          id: grant['id'],
          bindingId: grant['bindingId'],
          platform: grant['platform'],
          app: grant['accountRef'],
          target: grant['targetRef'],
          name: grant['targetName'],
          revision: grant['revision'],
          availability: grant['availability'],
          reception: grant['reception'],
          canReceive: grant['canReceive'],
          canPost: grant['canPost'],
          muted: grant['muted'] === true,
          openGroup: grant['openGroup'] === true,
          channelId: grant['receiveTargetChannelId'] ?? null,
          groupPolicy: grant['groupPolicy'] ?? null,
          threadPolicies: grant['threadPolicies'] ?? [],
        })),
        bindings: list(value['identities']).map((identity) => ({
          id: identity['id'],
          app: identity['accountRef'],
          platform: identity['platform'],
          postLimit: identity['postLimit'] ?? null,
          postLimitRevision: identity['postLimitRevision'],
        })),
        held: value['heldConversations'] ?? [],
        blocked: value['blockedConversations'] ?? [],
        senderPolicy: value['senderPolicy'] ?? null,
        roles: value['roles'] ?? [],
        permissionGroups: value['permissionGroups'] ?? [],
        behaviorPermissions: value['behaviorPermissions'] ?? [],
      };
    }
    case 'messaging-targets': {
      const found = await app(target);
      return rpc('messagingTargets', {
        providerId: found['providerId'],
        accountRef: target,
      });
    }
    case 'messaging-authorize': {
      const ref = values.app!.trim();
      const found = await app(ref);
      const targets = list(
        record(
          await rpc('messagingTargets', {
            providerId: found['providerId'],
            accountRef: ref,
          }),
        )['targets'],
      );
      const chosen = targets.find((entry) => entry['ref'] === values.target!.trim());
      if (chosen === undefined)
        throw new CliLiveError(
          'unknown-target',
          `IM app ${ref} cannot reach ${values.target!.trim()}; list messaging-targets first.`,
        );
      return rpc('messagingAuthorize', {
        botSlug: target,
        providerId: found['providerId'],
        accountRef: ref,
        targetRef: chosen['ref'],
        fingerprint: found['fingerprint'],
        targetDigest: chosen['digest'],
      });
    }
    case 'messaging-revoke':
      return rpc('messagingRevoke', {
        slug: target,
        grantId: values.grant!.trim(),
      });
    case 'messaging-receive':
      return rpc('messagingReceive', {
        slug: target,
        grantId: values.grant!.trim(),
        enabled: values.enabled === true,
      });
    case 'messaging-channel-target': {
      const channel = values.channel!.trim();
      return rpc('messagingChannelTarget', {
        slug: target,
        grantId: values.grant!.trim(),
        channelId: channel === 'none' ? null : channel,
      });
    }
    case 'messaging-group-policy':
      return rpc('messagingGroupPolicy', {
        slug: target,
        grantId: values.grant!.trim(),
        policy: input,
      });
    case 'messaging-thread-policy':
      return rpc('messagingThreadPolicy', {
        slug: target,
        sourceEventId: values.source!.trim(),
        policy: input,
      });
    case 'messaging-source':
      return rpc('messagingSource', {
        slug: target,
        sourceEventId: values.source!.trim(),
      });
    case 'messaging-conversation':
      return rpc('messagingConversation', { slug: target, input });
    case 'messaging-reachable':
      return rpc('messagingReachable', {
        slug: target,
        bindingId: values.binding!.trim(),
        ...(values.cursor === undefined ? {} : { cursor: values.cursor }),
      });
    case 'messaging-post':
    case 'messaging-post-status': {
      const value = record(
        await rpc(
          command === 'messaging-post' ? 'messagingPostConversation' : 'messagingPostRequest',
          {
            slug: target,
            bindingId: values.binding!.trim(),
            conversationId: values.conversation!.trim(),
            requestId,
            text: operation.text,
          },
        ),
      );
      return { requestId, ...value };
    }
    case 'messaging-post-limit': {
      const bindingId = values.binding!.trim();
      const identity = list((await snapshot())['identities']).find(
        (entry) => entry['id'] === bindingId,
      );
      if (identity === undefined)
        throw new CliLiveError('unknown-binding', `Bot ${target} has no binding ${bindingId}.`);
      const limit = values.limit!.trim();
      return rpc('messagingPostLimit', {
        slug: target,
        bindingId,
        expectedRevision: identity['postLimitRevision'] ?? identity['revision'],
        limit: limit === 'none' ? null : Number(limit),
      });
    }
    case 'messaging-send': {
      const value = record(
        await rpc('messagingSend', {
          slug: target,
          grantId: values.grant!.trim(),
          requestId,
          text: operation.text,
        }),
      );
      return { requestId, ...value };
    }
    case 'sender-access':
      await rpc('senderAccess', { slug: target, input });
      return { updated: true };
    case 'channel-bridges':
      return rpc('channelBridges', { channelId: target });
    case 'channel-bridge':
      return rpc('channelBridge', { channelId: target, input });
    case 'approval-routes':
      return record((await snapshot())['approvals']);
    case 'approval-route': {
      const approvals = record((await snapshot())['approvals']);
      return rpc('approvalRoute', {
        slug: target,
        pairingId: values.pairing === 'none' ? null : values.pairing!.trim(),
        expectedRevision: approvals['routeRevision'] ?? 0,
      });
    }
    case 'approval-test':
      return rpc('approvalTest', { slug: target });
    case 'approval-retry':
      return rpc('approvalRetry', {
        slug: target,
        id: values.delivery!.trim(),
      });
    case 'question-retry':
      return rpc('questionRetry', {
        slug: target,
        id: values.delivery!.trim(),
      });
    case 'question-deliveries':
      return { deliveries: (await snapshot())['questions'] ?? [] };
    case 'failure-alerts':
      return record((await snapshot())['failureAlerts']);
    case 'failure-alerts-set': {
      const alerts = record((await snapshot())['failureAlerts']);
      return rpc('failureAlertsSet', {
        slug: target,
        enabled: values.enabled === true,
        expectedRevision: alerts['revision'] ?? 0,
      });
    }
    case 'failure-alerts-test':
      return rpc('failureAlertsTest', { slug: target });
    case 'failure-alerts-retry':
      return rpc('failureAlertsRetry', {
        slug: target,
        id: values.delivery!.trim(),
      });
  }
}
