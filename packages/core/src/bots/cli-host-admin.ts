import type { AltchaChallenge } from '../marketplace/altcha.js';
import { parseChallenge, solveChallenge } from '../marketplace/altcha.js';
import { pairingCapabilities, type PairingCapability } from '../messaging/pairing.js';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';

export const HOST_ADMIN_OPTIONS = {
  query: { type: 'string' },
  topic: { type: 'string' },
  sort: { type: 'string' },
  reason: { type: 'string' },
  decision: { type: 'string' },
  capability: { type: 'string', multiple: true },
  confirm: { type: 'boolean' },
} as const;

export interface HostAdminValues {
  query?: string;
  topic?: string;
  sort?: string;
  cursor?: string;
  reason?: string;
  decision?: string;
  capability?: string[];
  role?: string[];
  confirm?: boolean;
  enabled?: boolean;
  disabled?: boolean;
}

export const HOST_ADMIN_COMMANDS = [
  { command: 'marketplace-list', description: 'browse or search Bot Marketplace listings' },
  { command: 'marketplace-topics', description: 'list Bot Marketplace topics with counts' },
  { command: 'marketplace-detail', description: 'read one Bot Marketplace listing and README' },
  {
    command: 'marketplace-submit',
    description: 'list a public GitHub Bot repository on the Bot Marketplace',
  },
  { command: 'marketplace-report', description: 'report a Bot Marketplace listing for review' },
  { command: 'release-check', description: 'check the release channel for a newer version' },
  {
    command: 'release-prompt',
    description: 'consume this Profile/version Beta reminder; needs --confirm; never installs',
  },
  { command: 'release-channel', description: 'read this Host stable/Beta choice' },
  {
    command: 'release-channel-set',
    description:
      'choose stable or beta for this Host; needs --confirm; never installs or downgrades',
  },
  { command: 'release-install', description: 'install a newer release; needs --confirm' },
  {
    command: 'release-restart',
    description: 'restart the Host into an installed release; needs --confirm',
  },
  { command: 'telemetry-status', description: 'read the usage statistics choice' },
  { command: 'telemetry-set', description: 'turn usage statistics on or off' },
  { command: 'git-status', description: 'read whether the Host can use Git for Memory' },
  { command: 'git-install', description: 'install Git through the Host when it is missing' },
  { command: 'pairing-list', description: "list a Bot's IM pairing requests and roles" },
  {
    command: 'pairing-review',
    description: 'approve, reject or revoke an IM pairing request (revoke needs --confirm)',
  },
] as const;

export type HostAdminCommand = (typeof HOST_ADMIN_COMMANDS)[number]['command'];

type Rpc = <T>(method: string, args: Record<string, unknown>) => Promise<T>;

const MAX_REPORT_REASON_LENGTH = 500;

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function isHostAdminCommand(command: string): command is HostAdminCommand {
  return HOST_ADMIN_COMMANDS.some((entry) => entry.command === command);
}

const POSITIONALS: Record<HostAdminCommand, number> = {
  'marketplace-list': 0,
  'marketplace-topics': 0,
  'marketplace-detail': 1,
  'marketplace-submit': 1,
  'marketplace-report': 1,
  'release-check': 0,
  'release-prompt': 1,
  'release-channel': 0,
  'release-channel-set': 1,
  'release-install': 1,
  'release-restart': 0,
  'telemetry-status': 0,
  'telemetry-set': 0,
  'git-status': 0,
  'git-install': 0,
  'pairing-list': 1,
  'pairing-review': 2,
};

const POSITIONAL_NAMES: Record<number, string> = {
  1: 'exactly one target',
  2: 'a bot id and a pairing id',
};

interface PairingReview {
  kind: 'approve' | 'reject' | 'revoke';
  capabilities?: PairingCapability[];
  roleId?: string;
}

function releaseRefusalGuidance(reason: unknown): string | undefined {
  if (reason === 'beta-not-enabled')
    return 'This Host has not joined Beta. Opt in explicitly with release-channel-set beta --confirm before retrying.';
  if (reason === 'busy') return 'The Host is busy. Wait for work to finish, then retry explicitly.';
  if (reason === 'activity-unavailable')
    return 'Host activity could not be checked. Restore the activity services, then retry.';
  return undefined;
}

function validate(command: HostAdminCommand, rest: string[], values: HostAdminValues) {
  const expected = POSITIONALS[command];
  if (rest.length !== expected || rest.some((value) => !value.trim()))
    usage(
      expected === 0
        ? `${command} takes no positional arguments.`
        : `${command} needs ${POSITIONAL_NAMES[expected]!}.`,
    );
  if (
    values.sort !== undefined &&
    (command !== 'marketplace-list' || (values.sort !== 'updated' && values.sort !== 'stars'))
  )
    usage('--sort must be updated or stars, on marketplace-list.');
  if (command === 'marketplace-report' && values.reason !== undefined) {
    if (values.reason.trim().length > MAX_REPORT_REASON_LENGTH)
      usage(`--reason must be at most ${String(MAX_REPORT_REASON_LENGTH)} characters.`);
  }
  if ((command === 'release-install' || command === 'release-restart') && values.confirm !== true)
    usage(
      command === 'release-install'
        ? 'release-install replaces the installed DeepSeekBot. Pass --confirm to install.'
        : 'release-restart restarts this Host only when idle. Pass --confirm to request a restart.',
    );
  if (command === 'telemetry-set' && values.enabled === values.disabled)
    usage('telemetry-set needs exactly one of --enabled or --disabled.');
  if (command === 'release-prompt' && values.confirm !== true)
    usage(
      'release-prompt consumes the automatic reminder for this Profile/version. Pass --confirm; use release-check for a read-only check.',
    );
  if (
    command === 'release-channel-set' &&
    (values.confirm !== true || !['stable', 'beta'].includes(rest[0]!))
  )
    usage(
      'release-channel-set needs stable or beta and --confirm. This only changes future selection, not installed versions.',
    );
  if (command !== 'pairing-review') return undefined;
  const kind = values.decision;
  if (kind !== 'approve' && kind !== 'reject' && kind !== 'revoke')
    usage('--decision must be approve, reject or revoke.');
  const roles = (values.role ?? []).map((role) => role.trim()).filter(Boolean);
  const capabilities = (values.capability ?? []).map((capability) => capability.trim());
  for (const capability of capabilities)
    if (!(pairingCapabilities as readonly string[]).includes(capability))
      usage(`--capability must be one of ${pairingCapabilities.join(', ')}.`);
  if (kind !== 'approve') {
    if (roles.length > 0 || capabilities.length > 0)
      usage('--role and --capability only apply to --decision approve.');
    if (kind === 'revoke' && values.confirm !== true)
      usage('Revoking ends this person’s access through the Bot. Pass --confirm to revoke.');
    return { kind } satisfies PairingReview;
  }
  if (roles.length > 1) usage('pairing-review takes at most one --role.');
  if ((roles.length === 1) === capabilities.length > 0)
    usage('Approve needs exactly one of --role <role-id> or --capability <capability> ...');
  return roles.length === 1
    ? ({ kind, roleId: roles[0]! } satisfies PairingReview)
    : ({
        kind,
        capabilities: [...new Set(capabilities)] as PairingCapability[],
      } satisfies PairingReview);
}

async function proveHuman(rpc: Rpc, signal: AbortSignal): Promise<string> {
  const challenge: AltchaChallenge | undefined = parseChallenge(
    await rpc('marketplaceChallenge', {}),
  );
  if (challenge === undefined)
    throw new CliLiveError('host-protocol-error', 'The Host returned an invalid challenge.');
  const payload = await solveChallenge(challenge, { signal });
  if (payload === undefined)
    throw new CliLiveError(
      signal.aborted ? 'host-unreachable' : 'challenge-invalid',
      signal.aborted
        ? 'The marketplace challenge was not solved before the command deadline.'
        : 'The marketplace challenge could not be solved.',
    );
  return payload;
}

function pairingSummary(value: unknown) {
  const pairing = record(value);
  const pick = [
    'id',
    'reference',
    'status',
    'purpose',
    'accountName',
    'actorId',
    'actorName',
    'conversationId',
    'conversationKind',
    'capabilities',
    'roleId',
    'revision',
    'createdAt',
    'expiresAt',
    'reviewedAt',
  ];
  return Object.fromEntries(pick.filter((key) => key in pairing).map((key) => [key, pairing[key]]));
}

async function messagingSnapshot(rpc: Rpc, slug: string) {
  const snapshot = record(await rpc('messagingSnapshot', { slug }));
  const list = (key: string) => (Array.isArray(snapshot[key]) ? snapshot[key] : []).map(record);
  return { pairings: list('pairings'), roles: list('roles') };
}

export async function runHostAdminCommand(
  command: HostAdminCommand,
  rest: string[],
  values: HostAdminValues,
  _io: BotCreateCliIo,
  host: { connect: () => Promise<Rpc>; signal: AbortSignal },
): Promise<unknown> {
  const review = validate(command, rest, values);
  const target = rest[0]?.trim() ?? '';
  const rpc = await host.connect();
  switch (command) {
    case 'marketplace-list':
      return rpc('marketplaceList', {
        query: {
          ...(values.query === undefined ? {} : { q: values.query }),
          ...(values.topic === undefined ? {} : { topic: values.topic }),
          ...(values.sort === undefined ? {} : { sort: values.sort }),
          ...(values.cursor === undefined ? {} : { cursor: values.cursor }),
        },
      });
    case 'marketplace-topics':
      return { topics: await rpc('marketplaceTopics', {}) };
    case 'marketplace-detail':
      return rpc('marketplaceDetail', { id: target });
    case 'marketplace-submit':
      return rpc('marketplaceSubmit', {
        url: target,
        altcha: await proveHuman(rpc, host.signal),
      });
    case 'marketplace-report': {
      const reason = values.reason?.trim() ?? '';
      return rpc('marketplaceReport', {
        id: target,
        altcha: await proveHuman(rpc, host.signal),
        ...(reason === '' ? {} : { reason }),
      });
    }
    case 'release-check':
      return rpc('releaseUpdate', {});
    case 'release-prompt': {
      const result = record(await rpc('releasePrompt', { version: target }));
      if (result['status'] === 'failed')
        throw new CliLiveError(
          `release-${String(result['reason'])}`,
          'Release reminder was not claimed. Manual release-check remains available.',
        );
      return result;
    }
    case 'release-channel':
      return rpc('releaseChannel', {});
    case 'release-channel-set': {
      const result = record(await rpc('releaseChannelSet', { channel: target }));
      if (result['status'] === 'failed')
        throw new CliLiveError(
          `release-${String(result['reason'])}`,
          'Release channel was not saved. Retry explicitly after the current operation completes or storage is restored.',
        );
      return result;
    }
    case 'release-install': {
      const result = record(await rpc('releaseInstall', { version: target }));
      if (result['status'] === 'failed')
        throw new CliLiveError(
          `release-${String(result['reason'])}`,
          [
            `Release ${target} was not installed (${String(result['reason'])}).`,
            releaseRefusalGuidance(result['reason']),
            typeof result['diagnostic'] === 'string' ? result['diagnostic'] : '',
            typeof result['logPath'] === 'string' ? `Log: ${result['logPath']}` : '',
          ]
            .filter(Boolean)
            .join(' '),
        );
      return result;
    }
    case 'release-restart': {
      const result = record(await rpc('releaseRestart', {}));
      if (result['status'] === 'failed')
        throw new CliLiveError(
          `release-${String(result['reason'])}`,
          releaseRefusalGuidance(result['reason']) ??
            (result['reason'] === 'not-pending'
              ? 'No installed release is waiting for a restart.'
              : 'This Host cannot restart itself; restart it from its launcher.'),
        );
      return result;
    }
    case 'telemetry-status':
      return rpc('telemetryStatus', {});
    case 'telemetry-set':
      return rpc('telemetrySet', { enabled: values.enabled === true });
    case 'git-status':
      return rpc('gitStatus', {});
    case 'git-install':
      return rpc('gitInstall', {});
    case 'pairing-list': {
      const snapshot = await messagingSnapshot(rpc, target);
      return {
        pairings: snapshot.pairings.map(pairingSummary),
        roles: snapshot.roles.map((role) => ({
          id: role['id'],
          name: role['name'],
          capabilities: role['capabilities'],
          revision: role['revision'],
        })),
      };
    }
    case 'pairing-review': {
      const pairingId = rest[1]!.trim();
      const snapshot = await messagingSnapshot(rpc, target);
      const pairing = snapshot.pairings.find((entry) => entry['id'] === pairingId);
      if (pairing === undefined)
        throw new CliLiveError(
          'unknown-pairing',
          `Bot ${target} has no pairing request ${pairingId}.`,
        );
      let role: Record<string, unknown> | undefined;
      if (review?.roleId !== undefined) {
        role = snapshot.roles.find((entry) => entry['id'] === review.roleId);
        if (role === undefined)
          throw new CliLiveError('unknown-role', `Bot ${target} has no role ${review.roleId}.`);
      }
      const result = record(
        await rpc('pairingReview', {
          slug: target,
          input: {
            kind: review!.kind,
            id: pairingId,
            expectedRevision: pairing['revision'],
            ...(review?.capabilities === undefined ? {} : { capabilities: review.capabilities }),
            ...(role === undefined
              ? {}
              : { roleId: role['id'], expectedRoleRevision: role['revision'] }),
          },
        }),
      );
      return { pairing: pairingSummary(result['pairing']) };
    }
  }
}
