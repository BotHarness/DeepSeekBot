import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { CliLiveError } from './cli-live-error.js';
import type { BotCreateCliIo } from './bot-create-cli.js';
export const WALLPAPER_COMMANDS = [
  {
    command: 'wallpaper-get',
    description: 'read the explicit Client local wallpaper metadata and revision',
  },
  {
    command: 'wallpaper-import',
    description:
      'read --file on this CLI machine and import image/video media to --client-id with --expected-revision',
  },
  {
    command: 'wallpaper-crop',
    description: 'save {x,y,zoom} from --patch-stdin on --client-id with --expected-revision',
  },
  {
    command: 'wallpaper-remove',
    description:
      'delete the shown wallpaper, or --wallpaper-item, from the library with --expected-revision',
  },
  {
    command: 'wallpaper-select',
    description:
      'show library --wallpaper-item <id>, or none, on --client-id with --expected-revision',
  },
  {
    command: 'wallpaper-rotation',
    description:
      'set {interval,shuffle} from --patch-stdin; interval is 0 or 60000/300000/900000/1800000/3600000 ms',
  },
] as const;
export const WALLPAPER_OPTIONS = {
  'wallpaper-item': { type: 'string' },
} as const;
export async function runWallpaperCommand(
  command: string,
  rest: string[],
  values: {
    'client-id'?: string;
    'expected-revision'?: string;
    'patch-stdin'?: boolean;
    file?: string;
    'wallpaper-item'?: string;
  },
  io: BotCreateCliIo,
  connect: () => Promise<{
    http(path: string, body?: Record<string, unknown>): Promise<{ bytes: Uint8Array }>;
  }>,
) {
  if (rest.length || !values['client-id'])
    throw new CliLiveError('usage', 'Wallpaper commands require exactly one --client-id.');
  if (command !== 'wallpaper-get' && !values['expected-revision'])
    throw new CliLiveError('usage', 'Read wallpaper-get and supply its --expected-revision.');
  if (
    command === 'wallpaper-get' &&
    (values['expected-revision'] || values.file || values['patch-stdin'])
  )
    throw new CliLiveError('usage', 'wallpaper-get takes no write options.');
  if (values.file && command !== 'wallpaper-import')
    throw new CliLiveError('usage', '--file requires wallpaper-import.');
  if (
    values['patch-stdin'] &&
    !['wallpaper-import', 'wallpaper-crop', 'wallpaper-rotation'].includes(command)
  )
    throw new CliLiveError(
      'usage',
      '--patch-stdin requires wallpaper-import, wallpaper-crop or wallpaper-rotation.',
    );
  const item = values['wallpaper-item'];
  if (
    item !== undefined &&
    !['wallpaper-crop', 'wallpaper-remove', 'wallpaper-select'].includes(command)
  )
    throw new CliLiveError(
      'usage',
      '--wallpaper-item requires wallpaper-crop, wallpaper-remove or wallpaper-select.',
    );
  if (command === 'wallpaper-select' && !item)
    throw new CliLiveError(
      'usage',
      'wallpaper-select requires --wallpaper-item <id> from wallpaper-get, or none.',
    );
  let crop: unknown;
  if (values['patch-stdin']) {
    try {
      crop = JSON.parse(await (io.readStdin?.() ?? Promise.resolve('')));
    } catch {
      throw new CliLiveError('usage', 'Invalid crop JSON.');
    }
  }
  if (command === 'wallpaper-rotation') {
    const rotation = crop as Record<string, unknown> | undefined;
    if (
      !rotation ||
      typeof rotation !== 'object' ||
      Array.isArray(rotation) ||
      !Object.keys(rotation).length ||
      Object.keys(rotation).some((key) => !['interval', 'shuffle'].includes(key))
    )
      throw new CliLiveError(
        'usage',
        'wallpaper-rotation requires --patch-stdin with interval and/or shuffle.',
      );
  }
  if (command === 'wallpaper-crop' && crop === undefined)
    throw new CliLiveError('usage', 'wallpaper-crop requires --patch-stdin.');
  let bytes: Buffer | undefined;
  if (command === 'wallpaper-import') {
    if (!values.file)
      throw new CliLiveError('usage', 'wallpaper-import requires --file on this CLI machine.');
    try {
      const path = resolve(values.file);
      const stat = statSync(path);
      if (!stat.isFile() || stat.size < 1 || stat.size > 100 * 1024 * 1024)
        throw new CliLiveError(
          'wallpaper-size-invalid',
          'Media must be nonempty: images up to 20 MB and videos up to 100 MB; the Client verifies decoding.',
        );
      bytes = readFileSync(path);
      if (bytes.length !== stat.size)
        throw new CliLiveError(
          'wallpaper-file-changed',
          'The input file changed while reading it.',
        );
    } catch (error) {
      if (error instanceof CliLiveError) throw error;
      throw new CliLiveError(
        'wallpaper-file-unavailable',
        'Cannot read the input media on this CLI machine.',
      );
    }
  }
  const host = await connect();
  const request = async (wallpaper: Record<string, unknown>): Promise<Record<string, unknown>> => {
    for (let attempt = 0; ; attempt++) {
      try {
        const reply = await host.http('/api/botharness/appearance-control', {
          action: 'request',
          clientId: values['client-id'],
          ...(values['expected-revision'] ? { expectedRevision: values['expected-revision'] } : {}),
          wallpaper,
        });
        return JSON.parse(new TextDecoder().decode(reply.bytes)) as Record<string, unknown>;
      } catch (error) {
        if (
          !(error instanceof CliLiveError) ||
          error.code !== 'appearance-client-unavailable' ||
          attempt >= 20
        )
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  };
  if (command === 'wallpaper-get') return request({ action: 'read' });
  const target = item === undefined ? {} : { item };
  if (command === 'wallpaper-remove') return request({ action: 'remove', ...target });
  if (command === 'wallpaper-crop') return request({ action: 'crop', crop, ...target });
  if (command === 'wallpaper-select')
    return request({ action: 'select', ...(item === 'none' ? {} : target) });
  if (command === 'wallpaper-rotation')
    return request({ action: 'rotation', ...(crop as Record<string, unknown>) });
  const begin = await request({ action: 'begin', size: bytes!.length });
  if (typeof begin.uploadId !== 'string')
    throw new CliLiveError('host-protocol-error', 'Client returned no upload receipt.');
  try {
    for (let offset = 0; offset < bytes!.length; offset += 192 * 1024) {
      const chunk = bytes!.subarray(offset, offset + 192 * 1024);
      const reply = await request({
        action: 'append',
        uploadId: begin.uploadId,
        offset,
        data: chunk.toString('base64'),
      });
      if (reply.offset !== offset + chunk.length)
        throw new CliLiveError(
          'host-protocol-error',
          'Client acknowledged a different upload offset.',
        );
    }
    return await request({
      action: 'commit',
      uploadId: begin.uploadId,
      ...(crop === undefined ? {} : { crop }),
    });
  } catch (error) {
    await request({ action: 'cancel', uploadId: begin.uploadId }).catch(() => {});
    throw error;
  }
}
