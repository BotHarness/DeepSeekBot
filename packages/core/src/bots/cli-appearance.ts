import { WALLPAPER_COMMANDS, WALLPAPER_OPTIONS, runWallpaperCommand } from './cli-wallpaper.js';
import { CliLiveError } from './cli-live-error.js';
import type { BotCreateCliIo } from './bot-create-cli.js';
export const APPEARANCE_COMMANDS = [
  ...WALLPAPER_COMMANDS,
  {
    command: 'appearance-clear-panels',
    description:
      'clear only --mode light/dark Panel overrides on an explicit Client with --expected-revision',
  },
  {
    command: 'appearance-reset',
    description:
      'reset both modes and wallpaper on --client-id with --confirm-reset and both expected revisions',
  },
  {
    command: 'appearance-targets',
    description: 'list functional Panel appearance targets on an explicit --client-id',
  },
  {
    command: 'appearance-clients',
    description: 'list online Client targets for device-local Tobs appearance',
  },
  {
    command: 'appearance-get',
    description: 'read device-local appearance from an explicit --client-id',
  },
  {
    command: 'appearance-set',
    description: 'write --patch-stdin to an explicit --client-id with --expected-revision',
  },
] as const;
export const APPEARANCE_OPTIONS = {
  ...WALLPAPER_OPTIONS,
  'client-id': { type: 'string' },
  'confirm-reset': { type: 'boolean' },
  'expected-wallpaper-revision': { type: 'string' },
} as const;
export async function runAppearanceCommand(
  command: string,
  rest: string[],
  values: {
    'client-id'?: string;
    'expected-revision'?: string;
    'patch-stdin'?: boolean;
    file?: string;
    mode?: string;
    'confirm-reset'?: boolean;
    'expected-wallpaper-revision'?: string;
    'wallpaper-item'?: string;
  },
  io: BotCreateCliIo,
  connect: () => Promise<{
    http(path: string, body?: Record<string, unknown>): Promise<{ bytes: Uint8Array }>;
  }>,
) {
  if (command.startsWith('wallpaper-'))
    return runWallpaperCommand(command, rest, values, io, connect);
  if (rest.length || (command !== 'appearance-clients' && !values['client-id']))
    throw new CliLiveError('usage', 'Specify exactly one --client-id from appearance-clients.');
  if (command === 'appearance-clients' && values['client-id'])
    throw new CliLiveError('usage', 'appearance-clients does not take a target.');
  if (
    command !== 'appearance-reset' &&
    (values['confirm-reset'] || values['expected-wallpaper-revision'])
  )
    throw new CliLiveError(
      'usage',
      'Reset confirmation and wallpaper revision require appearance-reset.',
    );
  let recovery: unknown;
  let patch: unknown;
  if (command === 'appearance-reset') {
    if (
      !values['confirm-reset'] ||
      !values['expected-revision'] ||
      !values['expected-wallpaper-revision'] ||
      values['patch-stdin'] ||
      values.mode ||
      values.file
    )
      throw new CliLiveError(
        'usage',
        'appearance-reset requires --confirm-reset, --expected-revision and --expected-wallpaper-revision from the selected Client.',
      );
    recovery = {
      action: 'reset-all',
      confirmed: true,
      wallpaperRevision: values['expected-wallpaper-revision'],
    };
  } else if (command === 'appearance-clear-panels') {
    if (
      !values['expected-revision'] ||
      !['light', 'dark'].includes(values.mode ?? '') ||
      values['patch-stdin'] ||
      values.file
    )
      throw new CliLiveError(
        'usage',
        'appearance-clear-panels requires --mode light/dark and --expected-revision.',
      );
    patch = { mode: values.mode, clearPanels: true };
  }

  if (command === 'appearance-set') {
    if (!values['patch-stdin'] || !values['expected-revision'])
      throw new CliLiveError(
        'usage',
        'appearance-set needs --patch-stdin and --expected-revision from appearance-get.',
      );
    try {
      patch = JSON.parse(await (io.readStdin?.() ?? Promise.resolve('')));
    } catch {
      throw new CliLiveError('usage', 'Invalid appearance JSON on stdin.');
    }
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch))
      throw new CliLiveError('usage', 'Appearance patch must be an object.');
  } else if (
    !['appearance-clear-panels', 'appearance-reset'].includes(command) &&
    (values['patch-stdin'] || values['expected-revision'])
  )
    throw new CliLiveError('usage', 'Write options require appearance-set.');
  const host = await connect();
  const response = await host.http(
    '/api/botharness/appearance-control',
    command === 'appearance-clients'
      ? undefined
      : {
          action: 'request',
          clientId: values['client-id'],
          ...(patch === undefined ? {} : { patch, expectedRevision: values['expected-revision'] }),
          ...(recovery === undefined
            ? {}
            : { recovery, expectedRevision: values['expected-revision'] }),
        },
  );
  return JSON.parse(new TextDecoder().decode(response.bytes)) as unknown;
}
