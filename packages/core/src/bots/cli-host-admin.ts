import { randomUUID } from 'node:crypto';
import {
  marketplaceAvatarImageType,
  readMarketplaceAvatarImage,
} from '@botharness/host-protocol/marketplace-avatar-image';
import {
  isMarketplaceAvatarRanking,
  parseMarketplaceAvatarEdit,
  parseMarketplaceAvatarText,
} from '@botharness/host-protocol/marketplace-avatar';
export { HOST_ADMIN_OPTIONS } from './cli-option-spec.js';
import type { AltchaChallenge } from '../marketplace/altcha.js';
import { parseChallenge, solveChallenge } from '../marketplace/altcha.js';
import type { MarketplaceDigestSummary } from '../marketplace/client.js';
import { pairingCapabilities, type PairingCapability } from '../messaging/pairing.js';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';
import { imageDataUrl, readBytes } from './cli-profile.js';

export interface HostAdminValues {
  force?: boolean;
  action?: string;
  query?: string;
  topic?: string;
  tag?: string;
  sort?: string;
  lang?: string;
  cursor?: string;
  bot?: string;
  reason?: string;
  decision?: string;
  capability?: string[];
  role?: string[];
  'avatar-tag'?: string[];
  'from-bot'?: string;
  confirm?: boolean;
  'confirmation-stdin'?: boolean;
  enabled?: boolean;
  disabled?: boolean;
  name?: string;
  description?: string;
  'operation-key'?: string;
  'accept-terms'?: boolean;
  'include-uploads'?: boolean;
  file?: string;
  clear?: boolean;
  review?: string;
  replaces?: string;
  day?: string;
  version?: string;
}

export const HOST_ADMIN_COMMANDS = [
  { command: 'onboarding', description: 'read or manage the Tob getting-started journey' },
  {
    command: 'acknowledgements',
    description: 'read the one-time notices this Profile has already seen',
  },
  {
    command: 'acknowledge',
    description: 'record that this Profile has seen a one-time notice',
  },
  { command: 'pause', description: 'archive a Bot through the Host owner' },
  { command: 'resume', description: 'restore an archived Bot through the Host owner' },
  {
    command: 'tob-home',
    description: 'prepare/reuse protected Tob, its Memory/Workspace/DM and Home status',
  },
  { command: 'marketplace-list', description: 'browse or search Bot Marketplace listings' },
  {
    command: 'marketplace-avatar-list',
    description: 'browse, search or rank Marketplace Avatars / 浏览、搜索或查看市场头像排行',
  },
  {
    command: 'marketplace-avatar-tags',
    description: 'list Marketplace Avatar tags with counts / 列出市场头像标签及数量',
  },
  {
    command: 'marketplace-avatar-mine',
    description: 'list your Marketplace Avatars / 列出我发布的市场头像',
  },
  {
    command: 'marketplace-avatar-edit',
    description:
      '<id> [--name <name>] [--description <text>] [--avatar-tag <tag> ...] edit Avatar text / 编辑头像的名称、简介和标签',
  },
  {
    command: 'marketplace-avatar-delete',
    description: '<id> --confirm delete a Marketplace Avatar / 删除市场头像',
  },
  {
    command: 'marketplace-avatar-detail',
    description: 'read a Marketplace Avatar / 查看市场头像详情',
  },
  {
    command: 'marketplace-avatar-report',
    description: 'report a Marketplace Avatar / 举报市场头像',
  },
  {
    command: 'marketplace-avatar-apply',
    description: 'apply a Marketplace Avatar to a Bot / 将市场头像应用到 Bot',
  },
  {
    command: 'marketplace-avatar-apply-candidates',
    description: 'list Bots eligible for Marketplace Avatar apply / 列出可应用市场头像的 Bot',
  },
  {
    command: 'marketplace-avatar-publish',
    description:
      'publish a processed Avatar from --file or --from-bot / 从文件或 Bot 发布已处理的头像',
  },
  { command: 'marketplace-topics', description: 'list Bot Marketplace topics with counts' },
  {
    command: 'marketplace-sections',
    description: "read today's Hot, New and Rising Bot Marketplace rows",
  },
  {
    command: 'marketplace-digest',
    description: "read today's Marketplace Digest, or one day's with --day",
  },
  { command: 'marketplace-digests', description: 'list past Marketplace Digests by date' },
  { command: 'marketplace-detail', description: 'read one Bot Marketplace listing and README' },
  {
    command: 'marketplace-file',
    description: 'read one text file of an Uploaded Bot, Markdown prepared like its README',
  },
  {
    command: 'marketplace-submit',
    description: 'list a public GitHub Bot repository on the Bot Marketplace',
  },
  { command: 'marketplace-report', description: 'report a Bot Marketplace listing for review' },
  {
    command: 'marketplace-account',
    description: 'read the Connect sign-in and its Account Profile (name, avatar, Author ID)',
  },
  {
    command: 'marketplace-author',
    description: 'set the Account Profile display name; uploading also needs --accept-terms once',
  },
  {
    command: 'marketplace-author-avatar',
    description: 'set the Account Profile avatar from a PNG, JPEG or WebP --file, or --clear it',
  },
  {
    command: 'marketplace-upload-plan',
    description: "list which of a Bot's files an upload would include or skip",
  },
  {
    command: 'marketplace-upload',
    description: "publish a Bot's ready Share Draft to the Bot Marketplace; needs --confirm",
  },
  {
    command: 'marketplace-mine',
    description: 'list your own Uploaded Bots, with file counts and whether one is blocked',
  },
  {
    command: 'marketplace-delete',
    description: 'delete one of your Uploaded Bots from the Bot Marketplace; needs --confirm',
  },
  {
    command: 'marketplace-install',
    description:
      'have Tob review a Bot Marketplace listing, then install it with --review <id> --confirm',
  },
  { command: 'release-check', description: 'check the release channel for a newer version' },
  { command: 'release-install', description: 'install a newer release; needs --confirm' },
  {
    command: 'release-restart',
    description: 'restart the Host into an installed release; needs --confirm',
  },
  { command: 'plugin-check', description: 'list BotHarness plugins and check each for an update' },
  {
    command: 'plugin-install',
    description: 'update one BotHarness plugin to a newer version; needs --confirm',
  },
  {
    command: 'plugin-restart',
    description: 'restart the Host to finish plugin updates; needs --confirm',
  },
  {
    command: 'update-status',
    description:
      'show the running (or last) release or plugin update: phase, commands, output and outcome',
  },
  { command: 'update-cancel', description: 'stop the running release or plugin update' },
  {
    command: 'data-reset-preview',
    description:
      'list every BotHarness folder a full data reset removes, with its confirmation token',
  },
  {
    command: 'data-reset-confirm',
    description:
      'clear all BotHarness data and restart the Host; needs --confirmation-stdin --confirm',
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
  pause: 1,
  resume: 1,
  'tob-home': 0,
  onboarding: 0,
  acknowledgements: 0,
  acknowledge: 1,
  'marketplace-list': 0,
  'marketplace-avatar-list': 0,
  'marketplace-avatar-tags': 0,
  'marketplace-avatar-mine': 0,
  'marketplace-avatar-edit': 1,
  'marketplace-avatar-delete': 1,
  'marketplace-avatar-detail': 1,
  'marketplace-avatar-report': 1,
  'marketplace-avatar-publish': 0,
  'marketplace-avatar-apply': 1,
  'marketplace-avatar-apply-candidates': 0,
  'marketplace-topics': 0,
  'marketplace-sections': 0,
  'marketplace-digest': 0,
  'marketplace-digests': 0,
  'marketplace-detail': 1,
  'marketplace-file': 2,
  'marketplace-submit': 1,
  'marketplace-report': 1,
  'marketplace-account': 0,
  'marketplace-author': 0,
  'marketplace-author-avatar': 0,
  'marketplace-upload-plan': 1,
  'marketplace-upload': 1,
  'marketplace-mine': 0,
  'marketplace-delete': 1,
  'marketplace-install': 1,
  'release-check': 0,
  'release-install': 1,
  'release-restart': 0,
  'plugin-check': 0,
  'plugin-install': 2,
  'plugin-restart': 0,
  'update-status': 0,
  'update-cancel': 0,
  'data-reset-preview': 0,
  'data-reset-confirm': 0,
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

function validate(command: HostAdminCommand, rest: string[], values: HostAdminValues) {
  const expected = POSITIONALS[command];
  if (rest.length !== expected || rest.some((value) => !value.trim()))
    usage(
      expected === 0
        ? `${command} takes no positional arguments.`
        : `${command} needs ${command === 'plugin-install' ? 'a package name and a version' : command === 'marketplace-file' ? 'a Bot id and a file path' : POSITIONAL_NAMES[expected]!}.`,
    );
  if (command === 'marketplace-avatar-list' && values.sort !== undefined) {
    if (!isMarketplaceAvatarRanking(values.sort))
      usage('--sort must be hot, new or rising, on marketplace-avatar-list.');
    if (values.cursor !== undefined) usage('--cursor cannot be used with an Avatar ranking.');
  } else if (
    values.sort !== undefined &&
    (command !== 'marketplace-list' ||
      (values.sort !== 'updated' && values.sort !== 'created' && values.sort !== 'stars'))
  )
    usage('--sort must be updated, created or stars, on marketplace-list.');
  if (
    values.lang !== undefined &&
    ((command !== 'marketplace-list' &&
      command !== 'marketplace-detail' &&
      command !== 'marketplace-sections' &&
      command !== 'marketplace-digest' &&
      command !== 'marketplace-digests' &&
      command !== 'marketplace-install' &&
      command !== 'marketplace-mine') ||
      (values.lang !== 'zh' && values.lang !== 'en'))
  )
    usage(
      '--lang must be zh or en, on marketplace-list, marketplace-detail, marketplace-sections, marketplace-digest, marketplace-digests, marketplace-mine or marketplace-install.',
    );
  if (
    values.day !== undefined &&
    (command !== 'marketplace-digest' || !/^\d{4}-\d{2}-\d{2}$/u.test(values.day))
  )
    usage('--day must be a YYYY-MM-DD date, on marketplace-digest.');
  if (
    (command === 'marketplace-report' || command === 'marketplace-avatar-report') &&
    values.reason !== undefined
  ) {
    if (values.reason.trim().length > MAX_REPORT_REASON_LENGTH)
      usage(`--reason must be at most ${String(MAX_REPORT_REASON_LENGTH)} characters.`);
  }
  if (values['include-uploads'] === true && command !== 'marketplace-list')
    usage('--include-uploads only applies to marketplace-list.');
  if (values.tag !== undefined && command !== 'marketplace-avatar-list')
    usage('--tag only applies to marketplace-avatar-list.');
  if (command === 'marketplace-avatar-apply' && !values.bot?.trim())
    usage('marketplace-avatar-apply needs --bot <bot>.');
  if (values.bot !== undefined && command !== 'marketplace-avatar-apply')
    usage('--bot only applies to marketplace-avatar-apply.');
  if (values.version !== undefined && command !== 'acknowledge')
    usage('--version only applies to acknowledge release-notes-seen.');
  if (
    command === 'acknowledge' &&
    (rest[0]?.trim() === 'release-notes-seen') !== (values.version !== undefined)
  )
    usage(
      'acknowledge release-notes-seen needs --version <x.y.z>; other notices take no --version.',
    );
  if (values.review !== undefined && command !== 'marketplace-install')
    usage('--review only applies to marketplace-install.');
  if (
    command === 'marketplace-install' &&
    (values.review === undefined) !== (values.confirm !== true)
  )
    usage(
      'Run marketplace-install <listing-id> first to see what Tob found, then install with --review <review-id> --confirm.',
    );
  if (command === 'marketplace-author' && (values.name === undefined || !values.name.trim()))
    usage('marketplace-author needs --name <display name>.');
  if (
    command === 'marketplace-author-avatar' &&
    (values.file !== undefined) === (values.clear === true)
  )
    usage('marketplace-author-avatar needs exactly one of --file or --clear.');
  if (values.replaces !== undefined && command !== 'marketplace-upload')
    usage('--replaces only applies to marketplace-upload.');
  if (command === 'marketplace-delete' && values.confirm !== true)
    usage(
      'marketplace-delete erases the Uploaded Bot, its files and counts for everyone. Pass --confirm.',
    );
  if (command === 'marketplace-avatar-delete' && values.confirm !== true)
    usage(
      'marketplace-avatar-delete erases the listing, its image and Apply Count. Pass --confirm.',
    );
  if (command === 'marketplace-avatar-edit' && values.file !== undefined)
    usage('marketplace-avatar-edit accepts only --name, --description and --avatar-tag.');
  if (
    command === 'marketplace-avatar-publish' &&
    ((values.file === undefined) === (values['from-bot'] === undefined) ||
      !(values.file ?? values['from-bot'])?.trim() ||
      !values.name?.trim() ||
      values.confirm !== true)
  )
    usage(
      'marketplace-avatar-publish needs exactly one of --file <image> or --from-bot <bot>, plus --name <name> --confirm.',
    );
  if (command === 'marketplace-upload') {
    if (values.name === undefined || !values.name.trim())
      usage('marketplace-upload needs --name <listing name>.');
    if (values.confirm !== true)
      usage(
        'marketplace-upload makes this Bot’s ready Share Draft public. Pass --confirm to upload.',
      );
  }
  if ((command === 'release-install' || command === 'release-restart') && values.confirm !== true)
    usage(
      command === 'release-install'
        ? 'release-install replaces the installed Tobs. Pass --confirm to install.'
        : 'release-restart stops every running Bot turn on this Host. Pass --confirm to restart.',
    );
  if ((command === 'plugin-install' || command === 'plugin-restart') && values.confirm !== true)
    usage(
      command === 'plugin-install'
        ? 'plugin-install replaces the installed plugin. Pass --confirm to install.'
        : 'plugin-restart stops every running Bot turn on this Host. Pass --confirm to restart.',
    );
  if (command === 'data-reset-confirm' && values.confirm !== true)
    usage(
      'data-reset-confirm removes every Bot and its data on this Host. Pass --confirm to clear.',
    );
  if (command === 'data-reset-confirm' && values['confirmation-stdin'] !== true)
    usage('data-reset-confirm requires --confirmation-stdin.');
  if (command === 'telemetry-set' && values.enabled === values.disabled)
    usage('telemetry-set needs exactly one of --enabled or --disabled.');
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

async function readResetToken(io: BotCreateCliIo): Promise<string> {
  let input: unknown;
  try {
    input = JSON.parse(await (io.readStdin?.() ?? Promise.resolve('')));
  } catch {
    usage('Confirmation stdin must be JSON with a token string.');
  }
  const token = record(input)['token'];
  if (
    typeof token !== 'string' ||
    !token.trim() ||
    token.length > 256 ||
    Object.keys(record(input)).some((key) => key !== 'token')
  )
    usage('Confirmation stdin must be JSON with only a token string from data-reset-preview.');
  return token;
}

export async function runHostAdminCommand(
  command: HostAdminCommand,
  rest: string[],
  values: HostAdminValues,
  io: BotCreateCliIo,
  host: { connect: () => Promise<Rpc>; signal: AbortSignal },
): Promise<unknown> {
  const review = validate(command, rest, values);
  const target = rest[0]?.trim() ?? '';
  const resetToken = command === 'data-reset-confirm' ? await readResetToken(io) : undefined;
  const rpc = await host.connect();
  switch (command) {
    case 'pause':
    case 'resume':
      return rpc(command, { slug: rest[0]!.trim() });
    case 'onboarding':
      if (
        values.action !== undefined &&
        !['start', 'pause', 'skip', 'continue', 'restart', 'finish'].includes(values.action)
      )
        usage('Invalid onboarding action.');
      return rpc('onboarding', values.action === undefined ? {} : { action: values.action });
    case 'acknowledgements':
      return rpc('acknowledgements', {});
    case 'acknowledge':
      return rpc('acknowledge', {
        key: rest[0]!.trim(),
        ...(values.version === undefined ? {} : { value: values.version }),
      });
    case 'tob-home':
      return rpc('tobHome', {});
    case 'marketplace-list':
      return rpc('marketplaceList', {
        query: {
          ...(values.query === undefined ? {} : { q: values.query }),
          ...(values.topic === undefined ? {} : { topic: values.topic }),
          ...(values.sort === undefined ? {} : { sort: values.sort }),
          ...(values.cursor === undefined ? {} : { cursor: values.cursor }),
          ...(values.lang === undefined ? {} : { lang: values.lang }),
          ...(values['include-uploads'] === true ? { includeUploads: true } : {}),
        },
      });
    case 'marketplace-avatar-list':
      return rpc('marketplaceAvatarList', {
        ...(values.cursor === undefined ? {} : { cursor: values.cursor }),
        ...(values.query === undefined ? {} : { q: values.query }),
        ...(values.tag === undefined ? {} : { tag: values.tag }),
        ...(values.sort === undefined ? {} : { sort: values.sort }),
      });
    case 'marketplace-avatar-tags':
      return { tags: await rpc('marketplaceAvatarTags', {}) };
    case 'marketplace-avatar-mine':
      return rpc('marketplaceAvatarMine', {});
    case 'marketplace-avatar-edit': {
      const tags = values['avatar-tag'];
      const patch = parseMarketplaceAvatarEdit({
        name: values.name,
        description: values.description,
        tags: tags?.length === 1 && tags[0] === '' ? [] : tags,
      });
      if (patch === undefined)
        return usage(
          'Supply --name (1–40 characters), --description (up to 160 characters), or up to five --avatar-tag values (1–24 characters each).',
        );
      return rpc('marketplaceAvatarEdit', { id: target, ...patch });
    }
    case 'marketplace-avatar-delete':
      return rpc('marketplaceAvatarDelete', { id: target });
    case 'marketplace-avatar-detail':
      return rpc('marketplaceAvatarDetail', { id: target });
    case 'marketplace-avatar-apply':
      return rpc('marketplaceAvatarApply', {
        id: target,
        bot: values.bot?.trim(),
        ...(values['operation-key'] === undefined ? {} : { operationKey: values['operation-key'] }),
      });
    case 'marketplace-avatar-apply-candidates':
      return rpc('marketplaceAvatarApplyCandidates', {});
    case 'marketplace-avatar-publish': {
      const text = parseMarketplaceAvatarText({
        name: values.name,
        description: values.description,
        tags: values['avatar-tag'],
      });
      if (text === undefined)
        usage(
          'Use a name of 1–40 characters, a description of up to 160 characters and up to five tags of 1–24 characters each.',
        );
      const requestKey = values['operation-key'] ?? randomUUID();
      if (!/^[a-zA-Z0-9_-]{1,100}$/u.test(requestKey)) usage('Invalid --operation-key.');
      const slug = values['from-bot']?.trim();
      let image: string;
      if (slug !== undefined) {
        const source = await rpc<{ image: string }>('marketplaceAvatarSource', { bot: slug });
        image = source.image;
        if (readMarketplaceAvatarImage(image) === undefined)
          throw new CliLiveError(
            'unprocessed-image',
            'This Bot’s Avatar needs cropping or re-encoding. Publish it from Web.',
          );
      } else {
        const bytes = readBytes(values.file);
        const contentType = marketplaceAvatarImageType(bytes);
        if (contentType === undefined)
          throw new CliLiveError(
            'unprocessed-image',
            'Use a still, metadata-free PNG, JPEG or WebP, square at 256–512 px and at most 128 KiB.',
          );
        image = `data:${contentType};base64,${bytes.toString('base64')}`;
      }
      return rpc('marketplaceAvatarPublish', {
        ...text,
        image,
        requestKey,
        confirm: true,
      });
    }
    case 'marketplace-topics':
      return { topics: await rpc('marketplaceTopics', {}) };
    case 'marketplace-sections':
      return rpc('marketplaceSections', values.lang === undefined ? {} : { lang: values.lang });
    case 'marketplace-digest':
      return rpc('marketplaceDigest', {
        ...(values.day === undefined ? {} : { day: values.day }),
        ...(values.lang === undefined ? {} : { lang: values.lang }),
      });
    case 'marketplace-digests': {
      const listed = await rpc<{ digests?: MarketplaceDigestSummary[] }>(
        'marketplaceDigests',
        values.lang === undefined ? {} : { lang: values.lang },
      );
      for (const digest of listed.digests ?? []) {
        const picks = (digest.picks ?? []).map((pick) => pick.displayName ?? pick.id);
        io.stderr(
          `tobs: ${digest.day} ${digest.title}${picks.length === 0 ? '' : ` | ${picks.join(', ')}`}`,
        );
      }
      return listed;
    }
    case 'marketplace-detail':
      return rpc(
        'marketplaceDetail',
        values.lang === undefined ? { id: target } : { id: target, lang: values.lang },
      );
    case 'marketplace-file':
      return { file: await rpc('marketplaceFileView', { id: target, path: rest[1]! }) };
    case 'marketplace-submit':
      return rpc('marketplaceSubmit', {
        url: target,
        altcha: await proveHuman(rpc, host.signal),
      });
    case 'marketplace-report':
    case 'marketplace-avatar-report': {
      const reason = values.reason?.trim() ?? '';
      return rpc(
        command === 'marketplace-report' ? 'marketplaceReport' : 'marketplaceAvatarReport',
        {
          id: target,
          altcha: await proveHuman(rpc, host.signal),
          ...(reason === '' ? {} : { reason }),
        },
      );
    }
    case 'marketplace-account':
      return rpc('marketplaceAccount', {});
    case 'marketplace-author':
      return {
        author: await rpc('marketplaceAuthorSave', {
          displayName: values.name!.trim(),
          acceptTerms: values['accept-terms'] === true,
        }),
      };
    case 'marketplace-author-avatar':
      return {
        author: await rpc('marketplaceAuthorAvatarSet', {
          avatar: values.clear === true ? null : imageDataUrl(readBytes(values.file)),
        }),
      };
    case 'marketplace-upload-plan':
      return rpc('marketplaceUploadPlan', { slug: target });
    case 'marketplace-upload': {
      const description = values.description?.trim();
      return rpc('marketplaceUpload', {
        slug: target,
        displayName: values.name!.trim(),
        ...(description === undefined || description === '' ? {} : { bio: description }),
        ...(values.role === undefined ? {} : { tags: values.role.map((role) => role.trim()) }),
        ...(values.replaces === undefined ? {} : { replaces: values.replaces.trim() }),
      });
    }
    case 'marketplace-mine':
      return rpc('marketplaceMine', values.lang === undefined ? {} : { lang: values.lang });
    case 'marketplace-delete':
      return rpc('marketplaceDelete', { id: target });
    case 'marketplace-install': {
      if (values.review === undefined) {
        const reviewed = record(
          await rpc('marketplaceInstallReview', {
            id: target,
            ...(values.lang === undefined ? {} : { lang: values.lang }),
          }),
        );
        return {
          ...reviewed,
          installed: false,
          next: [
            `deepseekbot marketplace-install ${target} --review ${String(reviewed['reviewId'])} --confirm`,
          ],
        };
      }
      return {
        ...record(
          await rpc('marketplaceInstall', {
            id: target,
            reviewId: values.review,
            ...(values['operation-key'] === undefined
              ? {}
              : { operationKey: values['operation-key'] }),
          }),
        ),
        installed: true,
      };
    }
    case 'release-check':
      return rpc('releaseUpdate', values.force === true ? { force: true } : {});
    case 'release-install': {
      const result = record(await rpc('releaseInstall', { version: target }));
      if (result['status'] === 'failed')
        throw new CliLiveError(
          `release-${String(result['reason'])}`,
          [
            `Release ${target} was not installed (${String(result['reason'])}).`,
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
          result['reason'] === 'not-pending'
            ? 'No installed release is waiting for a restart.'
            : 'This Host cannot restart itself; restart it from its launcher.',
        );
      return result;
    }
    case 'plugin-check':
      return rpc('pluginUpdates', values.force === true ? { force: true } : {});
    case 'plugin-install': {
      const version = rest[1]!.trim();
      const result = record(await rpc('pluginInstall', { name: target, version }));
      if (result['status'] === 'failed')
        throw new CliLiveError(
          `plugin-${String(result['reason'])}`,
          [
            `Plugin ${target}@${version} was not installed (${String(result['reason'])}).`,
            typeof result['diagnostic'] === 'string' ? result['diagnostic'] : '',
            typeof result['logPath'] === 'string' ? `Log: ${result['logPath']}` : '',
          ]
            .filter(Boolean)
            .join(' '),
        );
      return result;
    }
    case 'plugin-restart': {
      const result = record(await rpc('pluginRestart', {}));
      if (result['status'] === 'failed')
        throw new CliLiveError(
          `plugin-${String(result['reason'])}`,
          result['reason'] === 'not-pending'
            ? 'No plugin update is waiting for a restart.'
            : 'This Host cannot restart itself; restart it from its launcher.',
        );
      return result;
    }
    case 'update-status':
      return { run: await rpc('updateRun', {}) };
    case 'update-cancel': {
      const run = record(await rpc('updateRun', {}));
      const phase = run['phase'];
      if (
        typeof run['id'] !== 'string' ||
        phase === 'installed' ||
        phase === 'failed' ||
        phase === 'cancelled'
      )
        throw new CliLiveError('update-not-running', 'No release or plugin update is running.');
      const result = record(await rpc('updateCancel', { id: run['id'] }));
      if (result['status'] === 'too-late' || result['status'] === 'unsupported')
        throw new CliLiveError(
          `update-${String(result['status'])}`,
          result['status'] === 'too-late'
            ? 'The update is already being applied and can no longer be stopped.'
            : 'This DSH version cannot stop a running install.',
        );
      return { id: run['id'], ...result };
    }
    case 'data-reset-preview':
      return rpc('dataResetPreview', {});
    case 'data-reset-confirm':
      return rpc('dataResetConfirm', { token: resetToken });
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
