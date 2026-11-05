import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

import { CliLiveError } from './cli-live-error.js';
import type { VoiceCallEvent, VoiceCallView } from '../voice/call-contract.js';
import { readWavAs16kMono } from '../voice/wav.js';
import { CallVideoError, videoKeyframes, type VideoKeyframes } from '../voice/call-video.js';

export type CallPost = (body: Record<string, unknown>) => Promise<Record<string, unknown>>;

export const CALL_PATH = '/api/voice/call';

export const CALL_OPTIONS = {
  script: { type: 'string' },
  'reply-wait': { type: 'string' },
  video: { type: 'string' },
  screen: { type: 'string' },
} as const;

export interface CallValues {
  file?: string;
  script?: string;
  'reply-wait'?: string;
  video?: string;
  screen?: string;
}

export const CALL_COMMANDS = [
  {
    command: 'call-readiness',
    description:
      'show whether a Bot can be called now and what is missing (ASR or TTS Provider, media helper)',
  },
  {
    command: 'call-status',
    description: "show this caller's calls with their phase, busy state and recent events",
  },
  {
    command: 'call-hangup',
    description: 'end a call by id',
  },
  {
    command: 'call-simulate',
    description:
      'call a Bot with synthetic audio: plays --file <abs.wav> (or a --script <abs.json> timeline) into a Host call without a phone, optionally sharing --video (camera) or --screen <abs video file or JPEG folder> as keyframes, waits for the spoken reply and reports event timings',
  },
] as const;

type Command = (typeof CALL_COMMANDS)[number]['command'];

export function isCallCommand(command: string): command is Command {
  return CALL_COMMANDS.some((entry) => entry.command === command);
}

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

function result(value: Record<string, unknown>): Record<string, unknown> {
  if (value['ok'] === false)
    throw new CliLiveError(
      typeof value['code'] === 'string' ? value['code'] : 'host-protocol-error',
      typeof value['error'] === 'string' ? value['error'] : 'The Host refused the call command.',
    );
  return value;
}

interface ScriptEntry {
  at: number;
  file: string;
}

function script(values: CallValues): ScriptEntry[] {
  if ((values.file === undefined) === (values.script === undefined))
    usage('call-simulate needs exactly one of --file <abs.wav> or --script <abs.json>.');
  if (values.file !== undefined) {
    if (!isAbsolute(values.file)) usage('--file must be an absolute WAV path.');
    return [{ at: 0, file: values.file }];
  }
  if (!isAbsolute(values.script!)) usage('--script must be an absolute JSON path.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(values.script!, 'utf8'));
  } catch {
    usage('--script must be a readable JSON file.');
  }
  const steps = Array.isArray(parsed) ? parsed : (parsed as { steps?: unknown })?.steps;
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > 20)
    usage('--script holds 1–20 steps like [{"at": 0, "file": "/abs/question.wav"}].');
  return steps.map((step) => {
    const entry = (typeof step === 'object' && step !== null ? step : {}) as Record<
      string,
      unknown
    >;
    if (
      typeof entry['at'] !== 'number' ||
      !Number.isFinite(entry['at']) ||
      entry['at'] < 0 ||
      entry['at'] > 600_000 ||
      typeof entry['file'] !== 'string' ||
      !isAbsolute(entry['file'])
    )
      usage('Each script step needs "at" (ms from call start) and an absolute "file".');
    return { at: entry['at'], file: entry['file'] };
  });
}

const SIMULATION_BUDGET_MS = 540_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function pcmBase64(samples: Int16Array): string {
  const bytes = Buffer.alloc(samples.length * 2);
  for (let index = 0; index < samples.length; index += 1)
    bytes.writeInt16LE(samples[index]!, index * 2);
  return bytes.toString('base64');
}

function visualInput(
  values: CallValues,
): { source: 'camera' | 'screen'; path: string } | undefined {
  if (values.video !== undefined && values.screen !== undefined)
    usage('call-simulate shares one source: pass --video or --screen, not both.');
  const path = values.video ?? values.screen;
  if (path === undefined) return undefined;
  if (!isAbsolute(path)) usage('--video and --screen take an absolute video file or JPEG folder.');
  return { source: values.video !== undefined ? 'camera' : 'screen', path };
}

async function loadVisual(values: CallValues): Promise<VideoKeyframes | undefined> {
  const input = visualInput(values);
  if (input === undefined) return undefined;
  try {
    return await videoKeyframes(input.path, input.source);
  } catch (error) {
    if (error instanceof CallVideoError) throw new CliLiveError(error.code, error.message);
    throw error;
  }
}

async function simulate(
  slug: string,
  values: CallValues,
  post: CallPost,
  clock: { now(): number; sleep(ms: number): Promise<void> },
): Promise<unknown> {
  const steps = script(values)
    .map((step) => {
      let audio: Int16Array;
      try {
        audio = readWavAs16kMono(readFileSync(step.file));
      } catch (error) {
        throw new CliLiveError(
          'invalid-input',
          `${step.file}: ${error instanceof Error ? error.message : 'cannot read'}`,
        );
      }
      return { ...step, audio };
    })
    .sort((left, right) => left.at - right.at);
  const replyWaitMs = Number(values['reply-wait'] ?? 90) * 1000;
  if (!Number.isFinite(replyWaitMs) || replyWaitMs < 1_000 || replyWaitMs > 540_000)
    usage('--reply-wait must be 1–540 seconds.');
  const timeline: Int16Array[] = [];
  let end = 0;
  for (const step of steps) {
    const start = Math.round((step.at * 16_000) / 1000);
    if (start < end)
      usage('Script steps must not overlap: each "at" must come after the previous file ends.');
    if (start > end) timeline.push(new Int16Array(start - end));
    timeline.push(step.audio);
    end = start + step.audio.length;
  }
  timeline.push(new Int16Array(24_000));
  const total = timeline.reduce((sum, part) => sum + part.length, 0);
  if ((total / 16_000) * 1000 + replyWaitMs > SIMULATION_BUDGET_MS)
    usage('The audio timeline plus --reply-wait must fit in 9 minutes.');
  const visual = await loadVisual(values);
  const audio = new Int16Array(total);
  let offset = 0;
  for (const part of timeline) {
    audio.set(part, offset);
    offset += part.length;
  }
  const opened = result(await post({ kind: 'open', slug, media: 'synthetic' }));
  const call = opened['call'] as VoiceCallView;
  const callId = call.callId;
  const frames = [...(visual?.keyframes ?? [])];
  const sentFrames: { atMs: number; bytes: number; postMs: number }[] = [];
  const started = clock.now();
  const events: VoiceCallEvent[] = [...call.events];
  let seq = call.lastSeq;
  const collect = (view: VoiceCallView | undefined) => {
    if (view === undefined) return;
    for (const event of view.events) if (event.seq > seq) events.push(event);
    seq = Math.max(seq, view.lastSeq);
  };
  const heartbeat = async () =>
    collect(result(await post({ kind: 'heartbeat', callId, after: seq }))['call'] as VoiceCallView);
  const CHUNK = 16_000;
  const silence = new Int16Array(CHUNK);
  let streamMs = 0;
  const shareDue = async () => {
    if (visual === undefined) return;
    const elapsed = clock.now() - started;
    while (frames.length > 0 && frames[0]!.atMs <= elapsed) {
      const frame = frames.shift()!;
      const before = clock.now();
      collect(
        result(
          await post({
            kind: 'frame',
            callId,
            source: visual.source,
            jpeg: Buffer.from(frame.jpeg).toString('base64'),
            score: frame.score,
            skipped: frame.skipped,
            after: seq,
          }),
        )['call'] as VoiceCallView,
      );
      sentFrames.push({
        atMs: frame.atMs,
        bytes: frame.jpeg.byteLength,
        postMs: clock.now() - before,
      });
    }
  };
  try {
    if (visual !== undefined)
      collect(
        result(await post({ kind: 'visual', callId, source: visual.source }))[
          'call'
        ] as VoiceCallView,
      );
    for (let position = 0; position < audio.length; position += CHUNK) {
      const due = started + (position / 16_000) * 1000;
      const wait = due - clock.now();
      if (wait > 0) await clock.sleep(wait);
      await shareDue();
      const chunk = audio.slice(position, position + CHUNK);
      collect(
        result(await post({ kind: 'inject', callId, pcm: pcmBase64(chunk), after: seq }))[
          'call'
        ] as VoiceCallView,
      );
      streamMs += (chunk.length / 16_000) * 1000;
    }
    const deadline = clock.now() + replyWaitMs;
    const count = (...types: VoiceCallEvent['type'][]) =>
      events.filter((event) => types.includes(event.type)).length;
    const settled = () =>
      count('speech-start') <= count('transcribing', 'noise-discarded') &&
      count('transcribing') <= count('sent', 'asr-failed', 'send-failed', 'nothing-heard') &&
      count('reply-done') >= count('sent');
    while (clock.now() < deadline) {
      await clock.sleep(1_000);
      await shareDue();
      collect(
        result(
          await post({
            kind: 'inject',
            callId,
            pcm: pcmBase64(silence.subarray(0, 4_000)),
            after: seq,
          }),
        )['call'] as VoiceCallView,
      );
      await heartbeat();
      if (events.some((event) => event.type === 'ended')) break;
      if (settled()) break;
    }
  } finally {
    const hungUp = await post({ kind: 'hangup', callId }).catch(() => undefined);
    collect(hungUp?.['call'] as VoiceCallView | undefined);
  }
  const heard = events.filter(
    (event): event is Extract<VoiceCallEvent, { type: 'sent' }> => event.type === 'sent',
  );
  const replies = new Map<
    string,
    {
      replyId: string;
      messageId?: string;
      sentences: number;
      bytes: number;
      textMs?: number;
      responseMs?: number;
      firstAudioAt?: number;
      committedAt?: number;
    }
  >();
  const reply = (replyId: string) => {
    let entry = replies.get(replyId);
    if (entry === undefined) {
      entry = { replyId, sentences: 0, bytes: 0 };
      replies.set(replyId, entry);
    }
    return entry;
  };
  for (const event of events) {
    if (event.type === 'reply-text') {
      if (event.responseMs !== undefined) reply(event.replyId).textMs = event.responseMs;
    } else if (event.type === 'playing') {
      const entry = reply(event.replyId);
      entry.bytes += event.bytes;
      entry.firstAudioAt ??= event.at;
      if (event.responseMs !== undefined) entry.responseMs ??= event.responseMs;
    } else if (event.type === 'played') reply(event.replyId).sentences += 1;
    else if (event.type === 'committed') {
      const entry = reply(event.replyId);
      entry.messageId = event.messageId;
      entry.committedAt = event.at;
    }
  }
  const spoken = [...replies.values()].filter((entry) => entry.firstAudioAt !== undefined);
  const first = <K extends 'textMs' | 'responseMs'>(key: K) =>
    [...replies.values()].find((entry) => entry[key] !== undefined)?.[key] ?? null;
  const ack = events.find(
    (event): event is Extract<VoiceCallEvent, { type: 'ack' }> => event.type === 'ack',
  );
  const of = <T extends VoiceCallEvent['type']>(type: T) =>
    events.filter((event): event is Extract<VoiceCallEvent, { type: T }> => event.type === type);
  const visualReport =
    visual === undefined
      ? undefined
      : {
          source: visual.source,
          samples: visual.samples,
          keyframes: visual.keyframes.length,
          sentFrames: sentFrames.length,
          frameBytes: sentFrames.reduce((sum, frame) => sum + frame.bytes, 0),
          pickMs: visual.pickMs,
          prepareMs: of('frame-received').map((event) => event.prepareMs),
          framePostMs: sentFrames.map((frame) => frame.postMs),
          grids: of('grid-built').map((built) => {
            const sent = of('grid-sent').find((event) => event.grid === built.grid);
            return {
              frames: built.frames,
              dropped: built.dropped,
              layout: built.layout,
              bytes: built.bytes,
              composeMs: built.composeMs,
              ...(sent === undefined ? {} : { messageId: sent.messageId, waitedMs: sent.waitedMs }),
            };
          }),
          unchanged: of('grid-unchanged').map((event) => ({
            messageId: event.messageId,
            sameAs: event.sameAs,
          })),
          failed: of('grid-failed').map((event) => event.message),
        };
  return {
    callId,
    slug,
    streamedMs: Math.round(streamMs),
    ...(visualReport === undefined ? {} : { visual: visualReport }),
    heard: heard.map((event) => ({
      messageId: event.messageId,
      text: event.text,
      asrMs: event.asrMs,
      at: event.at,
      ...(event.streamed === true ? { streamed: true } : {}),
      ...(event.segments === undefined ? {} : { segments: event.segments }),
    })),
    hearing: events
      .filter(
        (event): event is Extract<VoiceCallEvent, { type: 'hearing' }> => event.type === 'hearing',
      )
      .map((event) => ({ text: event.text, at: event.at })),
    replies: spoken.map((entry) => ({
      ...entry,
      ...(entry.committedAt === undefined
        ? {}
        : { audioBeforeCommit: entry.firstAudioAt! < entry.committedAt }),
    })),
    ackMs: ack?.ms ?? null,
    firstTextMs: first('textMs'),
    firstAudioMs: first('responseMs'),
    answered:
      heard.length > 0 &&
      events.some((event) => event.type === 'reply-done' && event.sentences > 0),
    events,
  };
}

export async function runCallCommand(
  command: Command,
  rest: string[],
  values: CallValues,
  connect: () => Promise<CallPost>,
  clock: { now(): number; sleep(ms: number): Promise<void> } = { now: Date.now, sleep },
): Promise<unknown> {
  const one = (shape: string) => {
    if (rest.length !== 1 || !rest[0]!.trim()) usage(`${command} needs ${shape}.`);
    return rest[0]!.trim();
  };
  if (command === 'call-status') {
    if (rest.length !== 0) usage('call-status takes no positional arguments.');
    return result(await (await connect())({ kind: 'status' }));
  }
  if (command === 'call-readiness') {
    const slug = one('one bot id');
    return result(await (await connect())({ kind: 'readiness', slug }));
  }
  if (command === 'call-hangup') {
    const callId = one('one call id');
    return result(await (await connect())({ kind: 'hangup', callId }));
  }
  const slug = one('one bot id');
  script(values);
  visualInput(values);
  return simulate(slug, values, await connect(), clock);
}
