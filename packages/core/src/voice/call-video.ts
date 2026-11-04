import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { VOICE_CALL_LIMITS } from './call-contract.js';
import {
  KEYFRAME_DEFAULTS,
  createKeyframePicker,
  type CallVisualSource,
  type KeyframeOptions,
} from './keyframes.js';

export interface VideoKeyframe {
  readonly atMs: number;
  readonly jpeg: Uint8Array;
  readonly score: number;
  readonly skipped: number;
}

export interface VideoKeyframes {
  readonly source: CallVisualSource;
  readonly samples: number;
  readonly durationMs: number;
  readonly keyframes: readonly VideoKeyframe[];
  readonly pickMs: number;
}

export class CallVideoError extends Error {
  constructor(
    readonly code: 'ffmpeg-missing' | 'video-unreadable' | 'video-too-long',
    message: string,
  ) {
    super(message);
  }
}

const MAX_SAMPLES = 1_200;
const LONG_EDGE = 1920;

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { timeout: 300_000, maxBuffer: 4 * 1024 * 1024 }, (error) => {
      if (error === null) return resolve();
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return reject(
          new CallVideoError(
            'ffmpeg-missing',
            'Reading a video file needs ffmpeg on PATH; pass a folder of JPEG frames instead.',
          ),
        );
      reject(new CallVideoError('video-unreadable', 'ffmpeg could not read the video file.'));
    });
  });
}

async function jpegFiles(folder: string): Promise<string[]> {
  return (await readdir(folder))
    .filter((name) => /\.jpe?g$/iu.test(name))
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))
    .map((name) => join(folder, name));
}

export async function videoKeyframes(
  path: string,
  source: CallVisualSource,
  overrides: Partial<KeyframeOptions> = {},
): Promise<VideoKeyframes> {
  const options = { ...KEYFRAME_DEFAULTS[source], ...overrides };
  const { default: sharp } = await import('sharp');
  let folder = path;
  let scratch: string | undefined;
  try {
    const info = await stat(path).catch(() => undefined);
    if (info === undefined) throw new CallVideoError('video-unreadable', `${path} does not exist.`);
    if (!info.isDirectory()) {
      scratch = await mkdtemp(join(tmpdir(), 'botharness-call-video-'));
      folder = scratch;
      await ffmpeg([
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        path,
        '-vf',
        `fps=${options.sampleFps},scale='min(${LONG_EDGE},iw)':'min(${LONG_EDGE},ih)':force_original_aspect_ratio=decrease`,
        '-frames:v',
        String(MAX_SAMPLES + 1),
        '-q:v',
        '4',
        join(folder, '%05d.jpg'),
      ]);
    }
    const files = await jpegFiles(folder);
    if (files.length === 0)
      throw new CallVideoError('video-unreadable', 'The video has no frames to sample.');
    if (files.length > MAX_SAMPLES)
      throw new CallVideoError(
        'video-too-long',
        `At most ${MAX_SAMPLES / options.sampleFps / 60} minutes of video can be simulated.`,
      );
    const picker = createKeyframePicker(options);
    const keyframes: VideoKeyframe[] = [];
    let skipped = 0;
    let pickMs = 0;
    for (const [index, file] of files.entries()) {
      const bytes = await readFile(file);
      const started = performance.now();
      const thumb = await sharp(bytes)
        .resize({ width: options.thumbWidth })
        .greyscale()
        .raw()
        .toBuffer();
      const atMs = Math.round((index * 1000) / options.sampleFps);
      const decision = picker.push(new Uint8Array(thumb), atMs);
      pickMs += performance.now() - started;
      if (!decision.keyframe) {
        skipped += 1;
        continue;
      }
      let jpeg: Uint8Array = bytes;
      for (const quality of [70, 50, 35]) {
        if (jpeg.byteLength <= VOICE_CALL_LIMITS.frameBytes) break;
        jpeg = new Uint8Array(await sharp(bytes).jpeg({ quality }).toBuffer());
      }
      if (jpeg.byteLength > VOICE_CALL_LIMITS.frameBytes) {
        skipped += 1;
        continue;
      }
      keyframes.push({ atMs, jpeg, score: Math.min(1, decision.score), skipped });
      skipped = 0;
    }
    return {
      source,
      samples: files.length,
      durationMs: Math.round((files.length * 1000) / options.sampleFps),
      keyframes,
      pickMs: Math.round(pickMs),
    };
  } finally {
    if (scratch !== undefined) await rm(scratch, { recursive: true, force: true });
  }
}
