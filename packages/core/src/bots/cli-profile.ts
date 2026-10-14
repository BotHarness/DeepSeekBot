import { readFileSync, writeFileSync } from 'node:fs';
import { dmChannelId } from '../channels/channel.js';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';

export const PROFILE_OPTIONS = {
  file: { type: 'string' },
  'recipe-stdin': { type: 'boolean' },
  'part-stdin': { type: 'boolean' },
  color: { type: 'string' },
  automatic: { type: 'boolean' },
  'source-class': { type: 'string' },
  wake: { type: 'string' },
  delivery: { type: 'string' },
  'digest-count': { type: 'string' },
  'digest-interval': { type: 'string' },
  soul: { type: 'string' },
  'core-memory': { type: 'string' },
  section: { type: 'string' },
  confirm: { type: 'boolean' },
  slot: { type: 'string' },
  colors: { type: 'string' },
  parent: { type: 'string' },
  'part-id': { type: 'string' },
} as const;

export const PROFILE_COMMANDS = [
  { command: 'bot-avatar-set', description: "set a Bot's avatar image from a file, or --clear it" },
  {
    command: 'bot-banner-set',
    description: "set a Bot's profile banner from a 3:1 PNG, a recipe on stdin, or --clear",
  },
  {
    command: 'bot-appearance-set',
    description: "set a Bot's pixel Avatar Appearance from a recipe JSON on stdin",
  },
  {
    command: 'bot-primary-color-set',
    description: "set a Bot's primary color (--color #rrggbb) or return it to --automatic",
  },
  { command: 'bot-source-policies', description: "read a Bot's wake policy for each source" },
  { command: 'bot-source-policy-set', description: "set a Bot's wake policy for one source" },
  {
    command: 'bot-source-policy-reset',
    description: "return a Bot's wake policy for one source to its default",
  },
  {
    command: 'bot-standing-limits-set',
    description: "set a Bot's Soul and Core Memory standing limits",
  },
  { command: 'developer-mode-set', description: 'turn developer mode on or off on the Host' },
  { command: 'roster', description: 'read the sidebar roster: sections, order, pins and hidden' },
  {
    command: 'roster-batch',
    description: 'pin, unpin, hide or move several sidebar Channels at once',
  },
  { command: 'roster-pins-set', description: 'replace the pinned sidebar Channels' },
  { command: 'roster-hidden-set', description: 'replace the hidden sidebar Channels' },
  { command: 'roster-section-create', description: 'create a sidebar section' },
  { command: 'roster-section-rename', description: 'rename a sidebar section' },
  {
    command: 'roster-section-remove',
    description: 'remove a sidebar section (--confirm); its Channels move to the top level',
  },
  { command: 'roster-section-reorder', description: 'set the order of the sidebar sections' },
  {
    command: 'roster-top-reorder',
    description: 'set the top-level sidebar order of sections and Channels',
  },
  { command: 'human-identity', description: "read the Human's id and display name" },
  { command: 'part-library', description: 'list the Custom Part Library' },
  { command: 'part-library-add', description: 'save a Custom Part JSON from stdin to the library' },
  {
    command: 'part-library-import',
    description: 'import a part PNG or a zip of part PNGs into the library',
  },
  {
    command: 'part-library-import-image',
    description: 'turn a plain PNG into a Custom Part for one slot and save it',
  },
  {
    command: 'part-library-export',
    description: 'write one part, a worn part, or the whole library to a file',
  },
] as const;

export const PROFILE_ONLINE_COMMANDS = ['human-name-set', 'channel-human-name-set'] as const;

export interface ProfileValues {
  host?: string;
  timeout?: string;
  out?: string;
  name?: string;
  nickname?: string;
  clear?: boolean;
  enabled?: boolean;
  disabled?: boolean;
  file?: string;
  'recipe-stdin'?: boolean;
  'part-stdin'?: boolean;
  color?: string;
  automatic?: boolean;
  'source-class'?: string;
  wake?: string;
  delivery?: string;
  'digest-count'?: string;
  'digest-interval'?: string;
  soul?: string;
  'core-memory'?: string;
  section?: string;
  confirm?: boolean;
  slot?: string;
  colors?: string;
  parent?: string;
  'part-id'?: string;
}

export type ProfileRpc = <T>(method: string, args: Record<string, unknown>) => Promise<T>;

const IMMEDIATE_CLASSES = new Set(['human-dm', 'bot-dm', 'group-mention']);
const SOURCE_CLASSES = new Set([
  'assignment-report',
  'group-ordinary',
  'human-dm',
  'bot-dm',
  'group-mention',
]);

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

export function isProfileCommand(command: string): boolean {
  return (
    PROFILE_COMMANDS.some((entry) => entry.command === command) ||
    PROFILE_ONLINE_COMMANDS.some((entry) => entry === command)
  );
}

function readBytes(path: string | undefined, flag = '--file'): Buffer {
  if (!path?.trim()) usage(`${flag} <path> is required.`);
  try {
    return readFileSync(path);
  } catch {
    throw new CliLiveError('file-unreadable', `Cannot read ${flag} ${path}.`);
  }
}

function imageDataUrl(bytes: Buffer): string {
  const type = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? 'png'
    : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      ? 'jpeg'
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
        ? 'webp'
        : undefined;
  if (type === undefined) usage('--file must be a PNG, JPEG or WebP image.');
  return `data:image/${type};base64,${bytes.toString('base64')}`;
}

async function stdinJson(io: BotCreateCliIo, flag: string): Promise<unknown> {
  try {
    return JSON.parse(await (io.readStdin?.() ?? Promise.resolve('')));
  } catch {
    usage(`${flag} must be one JSON document.`);
  }
}

function count(value: string | undefined, flag: string, min = 0): number {
  const parsed = Number(value);
  if (value === undefined || value.trim() === '' || !Number.isSafeInteger(parsed) || parsed < min)
    usage(`${flag} must be a whole number of at least ${String(min)}.`);
  return parsed;
}

function oneBot(command: string, rest: string[]): string {
  if (rest.length !== 1 || !rest[0]?.trim()) usage(`${command} needs exactly one bot id.`);
  return rest[0].trim();
}

function noArguments(command: string, rest: string[]): void {
  if (rest.length > 0) usage(`${command} takes no positional arguments.`);
}

function ids(rest: string[]): string[] {
  return rest.map((id) => id.trim()).filter((id) => id.length > 0);
}

async function profileCall(
  command: string,
  rest: string[],
  values: ProfileValues,
  io: BotCreateCliIo,
): Promise<[method: string, args: Record<string, unknown>]> {
  switch (command) {
    case 'bot-avatar-set': {
      const channelId = dmChannelId(oneBot(command, rest));
      if ((values.file !== undefined) === (values.clear === true))
        usage('bot-avatar-set needs exactly one of --file or --clear.');
      return [
        'botAvatarSet',
        { channelId, avatar: values.clear ? null : imageDataUrl(readBytes(values.file)) },
      ];
    }
    case 'bot-banner-set': {
      const channelId = dmChannelId(oneBot(command, rest));
      const chosen = [values.file !== undefined, values['recipe-stdin'] === true, values.clear];
      if (chosen.filter(Boolean).length !== 1)
        usage('bot-banner-set needs exactly one of --file, --recipe-stdin or --clear.');
      const banner = values.clear
        ? null
        : values['recipe-stdin']
          ? { recipe: await stdinJson(io, '--recipe-stdin') }
          : { image: `data:image/png;base64,${readBytes(values.file).toString('base64')}` };
      return ['botBannerSet', { channelId, banner }];
    }
    case 'bot-appearance-set': {
      const channelId = dmChannelId(oneBot(command, rest));
      if (values['recipe-stdin'] !== true) usage('bot-appearance-set requires --recipe-stdin.');
      return ['botAppearanceSet', { channelId, recipe: await stdinJson(io, '--recipe-stdin') }];
    }
    case 'bot-primary-color-set': {
      const channelId = dmChannelId(oneBot(command, rest));
      if ((values.color !== undefined) === (values.automatic === true))
        usage('bot-primary-color-set needs exactly one of --color or --automatic.');
      if (values.color !== undefined && !/^#[0-9a-f]{6}$/iu.test(values.color))
        usage('--color must be #rrggbb.');
      return [
        'botPrimaryColorSet',
        {
          channelId,
          primaryColor: values.automatic
            ? { mode: 'automatic' }
            : { mode: 'custom', color: values.color!.toLowerCase() },
        },
      ];
    }
    case 'bot-source-policies':
      return ['botSourcePolicies', { slug: oneBot(command, rest) }];
    case 'bot-source-policy-set':
    case 'bot-source-policy-reset': {
      const slug = oneBot(command, rest);
      const sourceClass = values['source-class'] ?? '';
      if (!SOURCE_CLASSES.has(sourceClass))
        usage(
          '--source-class must be assignment-report, group-ordinary, human-dm, bot-dm or group-mention.',
        );
      if (command === 'bot-source-policy-reset')
        return ['botSourcePolicyReset', { slug, sourceClass }];
      if (IMMEDIATE_CLASSES.has(sourceClass)) {
        if (values.delivery !== 'steer' && values.delivery !== 'turn')
          usage(`${sourceClass} needs --delivery steer or turn.`);
        return [
          'botSourcePolicySet',
          { slug, sourceClass, wake: 'immediate', delivery: values.delivery },
        ];
      }
      if (sourceClass === 'group-ordinary') {
        if (!['immediate', 'digest', 'mentions', 'silent'].includes(values.wake ?? ''))
          usage('group-ordinary needs --wake immediate, digest, mentions or silent.');
        return [
          'botSourcePolicySet',
          {
            slug,
            sourceClass,
            wake: values.wake,
            digestCount: count(values['digest-count'], '--digest-count', 1),
            digestIntervalSeconds: count(values['digest-interval'], '--digest-interval', 1),
          },
        ];
      }
      if (values.wake !== 'conditional' && values.wake !== 'immediate')
        usage('assignment-report needs --wake conditional or immediate.');
      return ['botSourcePolicySet', { slug, sourceClass, wake: values.wake }];
    }
    case 'bot-standing-limits-set':
      return [
        'standingLimitsSet',
        {
          slug: oneBot(command, rest),
          soul: count(values.soul, '--soul'),
          coreMemory: count(values['core-memory'], '--core-memory'),
        },
      ];
    case 'developer-mode-set':
      noArguments(command, rest);
      if (values.enabled === values.disabled)
        usage('developer-mode-set needs exactly one of --enabled or --disabled.');
      return ['developerModeSet', { enabled: values.enabled === true }];
    case 'roster':
      noArguments(command, rest);
      return ['rosterGet', {}];
    case 'roster-batch': {
      const [action, ...channelIds] = rest;
      if (!['pin', 'unpin', 'hide', 'move'].includes(action ?? ''))
        usage('roster-batch needs an action: pin, unpin, hide or move.');
      if (ids(channelIds).length === 0) usage('roster-batch needs at least one channel id.');
      if (action !== 'move' && values.section !== undefined)
        usage('--section is only valid for roster-batch move.');
      return [
        'rosterBatch',
        {
          action,
          channelIds: ids(channelIds),
          ...(action === 'move' ? { sectionId: values.section?.trim() || null } : {}),
        },
      ];
    }
    case 'roster-pins-set':
      return ['pinsSet', { pins: ids(rest) }];
    case 'roster-hidden-set':
      return ['hiddenSet', { hidden: ids(rest) }];
    case 'roster-section-create': {
      if (rest.length !== 1 || !rest[0]?.trim()) usage('roster-section-create needs one name.');
      return ['sectionCreate', { name: rest[0].trim() }];
    }
    case 'roster-section-rename': {
      if (rest.length !== 1 || !rest[0]?.trim())
        usage('roster-section-rename needs exactly one section id.');
      if (!values.name?.trim()) usage('roster-section-rename requires --name <text>.');
      return ['sectionRename', { sectionId: rest[0].trim(), name: values.name.trim() }];
    }
    case 'roster-section-remove': {
      if (rest.length !== 1 || !rest[0]?.trim())
        usage('roster-section-remove needs exactly one section id.');
      if (values.confirm !== true)
        usage('roster-section-remove requires --confirm; its Channels move to the top level.');
      return ['sectionRemove', { sectionId: rest[0].trim() }];
    }
    case 'roster-section-reorder':
      if (ids(rest).length === 0) usage('roster-section-reorder needs the section ids in order.');
      return ['sectionReorder', { order: ids(rest) }];
    case 'roster-top-reorder': {
      if (ids(rest).length === 0)
        usage('roster-top-reorder needs section:<id> and channel:<id> entries in order.');
      const order = ids(rest).map((entry) => {
        const match = /^(section|channel):(.+)$/u.exec(entry);
        if (match === null)
          usage(`roster-top-reorder entry ${entry} must be section:<id> or channel:<id>.`);
        return { kind: match[1], id: match[2] };
      });
      return ['topReorder', { order }];
    }
    case 'human-identity':
      noArguments(command, rest);
      return ['humanIdentity', {}];
    case 'human-name-set': {
      noArguments(command, rest);
      const name = values.name?.trim();
      if ((name === undefined || name === '') === (values.clear !== true))
        usage('human-name-set needs --name or --clear, not both or neither.');
      return ['humanNameSet', { displayName: values.clear ? null : name }];
    }
    case 'channel-human-name-set': {
      if (rest.length !== 1 || !rest[0]?.trim())
        usage('channel-human-name-set needs exactly one channel id.');
      const nickname = values.nickname?.trim();
      if ((nickname === undefined || nickname === '') === (values.clear !== true))
        usage('channel-human-name-set needs --nickname or --clear, not both or neither.');
      return [
        'channelHumanNameSet',
        { channelId: rest[0].trim(), nickname: values.clear ? null : nickname },
      ];
    }
    case 'part-library':
      noArguments(command, rest);
      return ['partLibraryList', {}];
    case 'part-library-add': {
      noArguments(command, rest);
      if (values['part-stdin'] !== true) usage('part-library-add requires --part-stdin.');
      const part = await stdinJson(io, '--part-stdin');
      return [
        'partLibraryAdd',
        {
          part,
          name: values.name ?? '',
          ...(values.parent === undefined ? {} : { parent: values.parent.trim() }),
        },
      ];
    }
    case 'part-library-import':
      noArguments(command, rest);
      return ['partLibraryImport', { data: readBytes(values.file).toString('base64') }];
    case 'part-library-import-image': {
      noArguments(command, rest);
      if (!values.slot?.trim()) usage('part-library-import-image requires --slot <slot>.');
      return [
        'partLibraryImportImage',
        {
          data: readBytes(values.file).toString('base64'),
          slot: values.slot.trim(),
          colors: count(values.colors, '--colors', 1),
          name: values.name ?? '',
        },
      ];
    }
    case 'part-library-export': {
      noArguments(command, rest);
      const out = values.out ?? '';
      if (!out.startsWith('/') && !/^[A-Za-z]:[\\/]/u.test(out))
        usage('part-library-export requires --out <absolute-file>.');
      if (values['part-id'] !== undefined && values['part-stdin'] === true)
        usage('part-library-export takes --part-id or --part-stdin, not both.');
      if (values['part-stdin'] === true)
        return ['partLibraryExport', { part: await stdinJson(io, '--part-stdin') }];
      return [
        'partLibraryExport',
        values['part-id'] === undefined ? {} : { id: values['part-id'].trim() },
      ];
    }
    default:
      usage(`Unknown profile command ${command}.`);
  }
}

export async function runProfileCommand(
  command: string,
  rest: string[],
  values: ProfileValues,
  io: BotCreateCliIo,
  connect: () => Promise<ProfileRpc>,
): Promise<unknown> {
  const [method, args] = await profileCall(command, rest, values, io);
  const rpc = await connect();
  const result = await rpc<unknown>(method, args);
  if (command !== 'part-library-export') return result;
  const exported = result as { fileName?: unknown; data?: unknown };
  if (typeof exported.fileName !== 'string' || typeof exported.data !== 'string')
    throw new CliLiveError('host-protocol-error', 'The Host returned no part file.');
  const bytes = Buffer.from(exported.data, 'base64');
  writeFileSync(values.out!, bytes, { mode: 0o600 });
  return { fileName: exported.fileName, path: values.out, bytes: bytes.byteLength };
}
