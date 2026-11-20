import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';
import { messagingReadMode } from './cli-messaging.js';
import { connectLiveHost, record } from './cli-live-host.js';
import { timeoutMs, usage, type LiveValues } from './cli-live-input.js';

export const IM_CONTROL_COMMANDS = [
  'im-app-add',
  'im-app-status',
  'im-app-remove',
  'im-bind',
  'im-unbind',
  'im-reconnect',
  'im-status',
  'channel-connect',
  'channel-ingests',
] as const;

const TOKEN_IM_PLATFORMS = new Set(['discord', 'slack', 'qq', 'dingtalk', 'wecom', 'matrix']);

function appSummary(value: unknown) {
  const app = record(value);
  const bot = record(app['bot']);
  const error = app['error'] === null || app['error'] === undefined ? null : record(app['error']);
  return {
    id: app['botId'],
    name: bot['name'] ?? app['name'],
    state: app['state'],
    connected: app['connected'] === true,
    error: error === null ? null : { code: error['code'], message: error['message'] },
    ...(app['stats'] === undefined ? {} : { stats: app['stats'] }),
  };
}

function connectionSummary(platform: string, value: unknown) {
  const status = record(value);
  return {
    platform,
    state: status['state'],
    apps: (Array.isArray(status['bots']) ? status['bots'] : []).map(appSummary),
  };
}

export async function runImControlCommand(
  command: (typeof IM_CONTROL_COMMANDS)[number],
  rest: string[],
  values: LiveValues,
  io: BotCreateCliIo,
): Promise<unknown> {
  const mode = messagingReadMode(command, values['read-mode']);
  if (rest.length !== 1 || !rest[0]?.trim()) usage(`${command} needs exactly one target.`);
  const target = rest[0].trim();
  const app = values.app?.trim() ?? '';
  const platformCommand =
    command === 'im-app-add' || command === 'im-app-status' || command === 'im-app-remove';
  if (platformCommand && !TOKEN_IM_PLATFORMS.has(target))
    usage(
      `${command} supports ${[...TOKEN_IM_PLATFORMS].join(', ')}; use im-authorize for feishu or weixin.`,
    );
  let credentials: Record<string, unknown> | undefined;
  if (command === 'im-app-add') {
    if (values['credentials-stdin'] !== true) usage('im-app-add requires --credentials-stdin.');
    try {
      const parsed: unknown = JSON.parse(await (io.readStdin?.() ?? Promise.resolve('')));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new Error('not an object');
      credentials = parsed as Record<string, unknown>;
    } catch {
      usage('--credentials-stdin must be a JSON object, for example {"token":"…"}.');
    }
  }
  if (
    (command === 'im-app-remove' ||
      command === 'im-bind' ||
      command === 'im-unbind' ||
      command === 'im-reconnect') &&
    !app
  )
    usage(`${command} requires --app <app-id>.`);
  if (command === 'channel-connect' && (!values.bot?.trim() || !values.conversation?.trim()))
    usage('channel-connect requires --bot <bot-id> and --conversation <external-id>.');
  const signal = AbortSignal.timeout(timeoutMs(values.timeout));
  const { rpc } = await connectLiveHost(values, io, signal);
  const provider = (method: string, payload: Record<string, unknown>) =>
    rpc(`dsh-im/${target}`, { method, payload });
  if (command === 'im-app-add')
    return connectionSummary(target, await provider('bot.bind-credentials', credentials!));
  if (command === 'im-app-status')
    return connectionSummary(target, await provider('connection.status', {}));
  if (command === 'im-app-remove')
    return connectionSummary(target, await provider('bot.delete', { botId: app, confirm: true }));
  if (command === 'channel-ingests') return rpc('channelIngests', { channelId: target });
  if (command === 'im-bind') {
    const apps = record(await rpc('messagingApps', {}));
    const found = (Array.isArray(apps['apps']) ? apps['apps'] : [])
      .map(record)
      .find((entry) => entry['ref'] === app);
    if (found === undefined)
      throw new CliLiveError('unknown-app', `The Host has no connected IM app ${app}.`);
    return rpc('messagingIdentity', {
      slug: target,
      input: {
        kind: 'bind',
        providerId: found['providerId'],
        accountRef: found['ref'],
        fingerprint: found['fingerprint'],
      },
    });
  }
  const slug = command === 'channel-connect' ? values.bot!.trim() : target;
  const snapshot = record(await rpc('messagingSnapshot', { slug, ...(mode ? { mode } : {}) }));
  const identities = (Array.isArray(snapshot['identities']) ? snapshot['identities'] : []).map(
    record,
  );
  if (command === 'im-status')
    return {
      ...(snapshot['checks'] === undefined ? {} : { checks: snapshot['checks'] }),
      apps: (Array.isArray(snapshot['accounts']) ? snapshot['accounts'] : [])
        .map(record)
        .map((entry) => ({
          ref: entry['ref'],
          platform: entry['platform'],
          name: entry['name'],
          connected: entry['connected'] === true,
        })),
      bindings: identities.map((entry) => ({
        id: entry['id'],
        app: entry['accountRef'],
        platform: entry['platform'],
        name: entry['name'],
        enabled: entry['enabled'],
        availability: entry['availability'],
        reception: entry['reception'],
        conversations: entry['grantCount'],
        ...(entry['recovery'] === undefined ? {} : { recovery: entry['recovery'] }),
      })),
    };
  const binding = identities.find((entry) =>
    command === 'channel-connect'
      ? app === '' || entry['accountRef'] === app
      : entry['accountRef'] === app,
  );
  if (binding === undefined)
    throw new CliLiveError(
      'unknown-binding',
      command === 'channel-connect'
        ? `Bot ${slug} has no IM app binding to connect through.`
        : `Bot ${slug} is not bound to IM app ${app}.`,
    );
  if (command === 'im-unbind' || command === 'im-reconnect')
    return rpc('messagingIdentity', {
      slug,
      input: {
        kind: command === 'im-reconnect' ? 'reconnect' : 'unbind',
        id: binding['id'],
        expectedRevision: binding['revision'],
      },
    });
  return rpc('channelIngest', {
    channelId: target,
    input: {
      kind: 'add',
      bindingId: binding['id'],
      conversation: { kind: 'group', id: values.conversation!.trim() },
    },
  });
}
