import { randomBytes } from 'node:crypto';
import { dmChannelId } from '../channels/channel.js';
import {
  VOICE_CALL_HOST_OWNER,
  VOICE_CALL_LIMITS,
  isVoiceCallMediaError,
  type VoiceCallBargeIn,
  type VoiceCallCommand,
  type VoiceCallEndReason,
  type VoiceCallMissing,
  type VoiceCallReadiness,
  type VoiceCallRefusal,
  type VoiceCallResult,
  type VoiceCallView,
  type VoiceCallZoom,
} from './call-contract.js';
import type { ChannelVoiceCallShareChange } from '../channels/voice-call-record.js';
import { createCallPerf } from './call-perf.js';
import { createVad } from './vad.js';
import { PcmError, pcmFromBase64 } from './pcm.js';
import { resolveVoice } from './providers.js';
import { clipDurationMs } from './speech.js';
import { CallFrameError, isJpeg, type PreparedFrame } from './call-frames.js';
import { createHarvest } from './harvest.js';
import { MAX_GRID_FRAMES, type CallVisualSource } from './keyframes.js';
import {
  recordSchedulingDiagnostic,
  schedulingIdentity,
} from '../process/scheduling-diagnostics.js';
import { ended } from './calls-types.js';
import type {
  VoiceCaller,
  VoiceCallMediaPeer,
  VoiceCallsDeps,
  Call,
  VisualFrame,
  EventInput,
  VoiceCalls,
} from './calls-types.js';
import { pause } from './calls-playback.js';
import { SEGMENT_VAD } from './calls-transcript.js';

export class CallRefusal extends Error {
  constructor(
    readonly code: VoiceCallRefusal,
    message: string,
  ) {
    super(message);
  }
}

const CALL_ID = /^call-[a-f0-9]{16}$/u;

export const OWN_TURN_START_MS = 10_000;

const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/u;

export function voiceCallClientId(command: unknown): string | undefined {
  const value =
    typeof command === 'object' && command !== null
      ? (command as Record<string, unknown>)['client']
      : undefined;
  return typeof value === 'string' && CLIENT_ID.test(value) ? value : undefined;
}

const sameCaller = (call: { caller: string; client: string | undefined }, caller: VoiceCaller) =>
  call.caller === caller.deviceId && call.client === caller.client;

export function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function slugOf(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(value))
    throw new CallRefusal('invalid-input', 'A Bot id is required.');
  return value;
}

function callPcm(value: string): Int16Array {
  try {
    return pcmFromBase64(value);
  } catch (error) {
    if (error instanceof PcmError)
      throw new CallRefusal('invalid-input', 'pcm must be 16-bit little-endian samples.');
    throw error;
  }
}

function syntheticPeer(): VoiceCallMediaPeer {
  return {
    async answer() {
      throw new Error('A synthetic call takes no answer.');
    },
    play: (audio, mime, signal) => pause(clipDurationMs({ audio, mime }), signal),
    async setGain() {},
    async close() {},
  };
}

export function createCallCommands(wiring: {
  deps: VoiceCallsDeps;
  live: () => Call | undefined;
  calls: Map<string, Call>;
  end: (call: Call, reason: VoiceCallEndReason) => Promise<void>;
  barge: VoiceCallBargeIn;
  log: NonNullable<VoiceCallsDeps['log']>;
  now: () => number;
  recordStart: (call: Call) => void;
  push: (call: Call, event: EventInput) => void;
  samplePerf: (call: Call, at: number) => Promise<void>;
  hear: (call: Call, samples: Int16Array) => void;
  tick: (call: Call) => void;
  disposed: boolean;
  view: (call: Call, after?: number) => VoiceCallView;
  dropStream: (call: Call) => void;
  setGain: (call: Call, gain: number) => void;
  settle: (call: Call) => void;
  recordShare: (call: Call, state: ChannelVoiceCallShareChange, source: CallVisualSource) => void;
  commit: (
    call: Call,
    session: number,
    source: CallVisualSource,
    batches: readonly (readonly VisualFrame[])[],
  ) => void;
  images: () => NonNullable<VoiceCallsDeps['imaging']>;
  reportDropped: (call: Call, source: CallVisualSource, dropped: number) => void;
  harvest: (call: Call) => void;
  zoom: (input: { slug?: string; messageId: string; cell: number }) => VoiceCallZoom;
}): Pick<VoiceCalls, 'handle'> {
  const {
    deps,
    live,
    calls,
    end,
    barge,
    log,
    now,
    recordStart,
    push,
    samplePerf,
    hear,
    tick,
    view,
    dropStream,
    setGain,
    settle,
    recordShare,
    commit,
    images,
    reportDropped,
    harvest,
    zoom,
  } = wiring;

  const readiness = async (caller: VoiceCaller, slug: string): Promise<VoiceCallReadiness> => {
    const bot = deps.bot(slug);
    const missing: VoiceCallMissing[] = [];
    if (bot === undefined || bot.paused === true) missing.push('bot');
    const [asrVoice, ttsVoice] =
      bot === undefined
        ? [undefined, undefined]
        : await Promise.all([
            resolveVoice(deps.providers, { bot, kind: 'asr' }),
            resolveVoice(deps.providers, { bot, kind: 'tts' }),
          ]);
    const asr = asrVoice?.providerId ?? undefined;
    const tts = ttsVoice?.providerId ?? undefined;
    if (asrVoice === undefined || asrVoice.state === 'missing') missing.push('asr');
    if (ttsVoice === undefined || ttsVoice.state === 'missing') missing.push('tts');
    if (asrVoice?.state === 'off' || ttsVoice?.state === 'off') missing.push('local-voice-off');
    const media = deps.media();
    const availability =
      media === undefined
        ? 'unavailable'
        : await media.availability().catch(() => 'unavailable' as const);
    if (availability === 'unsupported-platform') missing.push('media-unsupported');
    else if (availability === 'helper-missing') missing.push('media-helper-missing');
    else if (availability === 'unavailable') missing.push('media-unavailable');
    const active = live();
    return {
      slug,
      ready: missing.length === 0,
      missing,
      asrProviderId: asr ?? null,
      ttsProviderId: tts ?? null,
      media: availability,
      activeCallId:
        active !== undefined && active.slug === slug && sameCaller(active, caller)
          ? active.id
          : null,
      callElsewhere: active !== undefined && !sameCaller(active, caller),
    };
  };

  const own = (caller: VoiceCaller, value: unknown, admin = false): Call => {
    if (typeof value !== 'string' || !CALL_ID.test(value))
      throw new CallRefusal('invalid-input', 'A call id is required.');
    const call = calls.get(value);
    if (
      call === undefined ||
      (!sameCaller(call, caller) && !(admin && caller.deviceId === VOICE_CALL_HOST_OWNER))
    )
      throw new CallRefusal('call-not-found', 'That call does not exist.');
    return call;
  };

  const prepareCall = async (
    caller: VoiceCaller,
    slug: string,
    kind: 'webrtc' | 'synthetic',
    signal: AbortSignal,
    startedAt: number,
  ): Promise<Call> => {
    signal.throwIfAborted();
    const bot = deps.bot(slug);
    if (bot === undefined) throw new CallRefusal('unknown-bot', `unknown PersonaBot: ${slug}`);
    if (bot.paused === true) throw new CallRefusal('bot-paused', 'This Bot is paused.');
    if (bot.asr === undefined || !deps.providers.has(bot.asr.providerId, 'asr'))
      throw new CallRefusal(
        'asr-not-configured',
        'Bind a speech recognition (ASR) Provider to this Bot before calling it.',
      );
    if (bot.voice === undefined || !deps.providers.has(bot.voice.providerId, 'tts'))
      throw new CallRefusal(
        'tts-not-configured',
        'Bind a TTS Provider to this Bot before calling it.',
      );
    const media = kind === 'webrtc' ? deps.media() : undefined;
    if (kind === 'webrtc' && (media === undefined || live() !== undefined)) {
      const availability =
        media === undefined ? 'unsupported-platform' : await media.availability(signal);
      signal.throwIfAborted();
      if (availability === 'unsupported-platform')
        throw new CallRefusal(
          'media-unsupported',
          'Calls need a Mac or Windows Host with the media helper.',
        );
      if (availability === 'helper-missing')
        throw new CallRefusal(
          'media-helper-missing',
          'Start Local Computer once on this Host to install its media helper, then call again.',
        );
    }
    const active = live();
    if (active !== undefined) {
      if (!sameCaller(active, caller))
        throw new CallRefusal('call-active', 'Another device is already on a call with this Host.');
      await end(active, 'replaced');
    }
    signal.throwIfAborted();
    const segmented = deps.providers.streams?.(bot.asr.providerId) !== true;
    const call: Call = {
      id: `call-${randomBytes(8).toString('hex')}`,
      slug,
      channelId: dmChannelId(slug),
      caller: caller.deviceId,
      client: caller.client,
      media: kind,
      startedAt,
      abort: new AbortController(),
      visual: 'off',
      visualSession: 0,
      harvest: createHarvest<VisualFrame>(VOICE_CALL_LIMITS.pendingFrames),
      committing: 0,
      commits: Promise.resolve(),
      grids: 0,
      vad: createVad({
        maxUtteranceMs: VOICE_CALL_LIMITS.maxUtteranceMs,
        stream: !segmented,
        ...(segmented ? SEGMENT_VAD : {}),
        ...(deps.speechDbfs === undefined ? {} : { minActiveDbfs: deps.speechDbfs() }),
        ...deps.vad,
        voicedMarksMs: [barge.suspectMs, barge.confirmMs],
      }),
      segmented,
      phase: 'connecting',
      muted: false,
      busy: deps.busy(slug),
      ownTurn: 'none',
      ownTurnAt: 0,
      playing: false,
      guardUntil: 0,
      gain: 1,
      interrupted: [],
      lastHeartbeat: startedAt,
      tickedAt: startedAt,
      mediaSeenAt: startedAt,
      connected: false,
      heard: 0,
      events: [],
      seq: 0,
      transcription: Promise.resolve(),
      playback: Promise.resolve(),
      replies: [],
      replyCount: 0,
      stoppedDrafts: new Set(),
      perf: createCallPerf(VOICE_CALL_LIMITS.perfSampleMs),
      perfAt: 0,
      sampling: false,
    };
    calls.set(call.id, call);
    if (!segmented && deps.providers.warm !== undefined) {
      call.warmed = bot.asr.providerId;
      deps.providers.warm(call.warmed);
    }
    log('call-opening', { call: call.id, bot: slug, media: kind });
    const connected = () => {
      if (call.connected || call.phase === 'ended') return;
      call.connected = true;
      call.connectedAt = now();
      call.lastHeartbeat = call.connectedAt;
      call.phase = 'listening';
      recordStart(call);
      push(call, { type: 'connected' });
      if (call.busy) push(call, { type: 'busy' });
      log('call-connected', { call: call.id, ms: now() - call.startedAt });
      void samplePerf(call, now());
    };
    if (kind === 'synthetic') {
      call.peer = syntheticPeer();
      connected();
    } else {
      const abort = () => {
        call.abort.abort();
        void end(call, 'media-failed');
      };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      try {
        call.abort.signal.throwIfAborted();
        const peer = await media!.open({
          callId: call.id,
          signal: call.abort.signal,
          onPcm: (samples) => hear(call, samples),
          onStatus: (status) => {
            if (status === 'connected') connected();
            else void end(call, 'media-failed');
          },
        });
        if (call.abort.signal.aborted) await peer.close();
        call.abort.signal.throwIfAborted();
        call.peer = peer;
        if (call.peer.offer === undefined) throw new Error('offer');
        call.offer = call.peer.offer;
      } catch (error) {
        await end(call, 'media-failed');
        calls.delete(call.id);
        if (error instanceof CallRefusal) throw error;
        if (isVoiceCallMediaError(error)) {
          if (error.code === 'unsupported-platform')
            throw new CallRefusal('media-unsupported', error.message);
          if (error.code === 'helper-missing')
            throw new CallRefusal('media-helper-missing', error.message);
        }
        throw new CallRefusal(
          'media-failed',
          'The call media could not start on this Host. Check the media helper and retry.',
        );
      } finally {
        signal?.removeEventListener('abort', abort);
      }
    }
    call.tickedAt = now();
    call.timer = setInterval(() => tick(call), VOICE_CALL_LIMITS.heartbeatMs);
    call.timer.unref?.();
    return call;
  };

  const open = async (
    caller: VoiceCaller,
    slug: string,
    kind: 'webrtc' | 'synthetic',
    signal: AbortSignal | undefined,
  ): Promise<Call> => {
    const cancellation = new AbortController();
    const cancel = () => cancellation.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    const startedAt = now();
    const timer = setTimeout(cancel, VOICE_CALL_LIMITS.connectTimeoutMs);
    let rejectCancelled!: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      rejectCancelled = () =>
        reject(
          cancellation.signal.reason instanceof Error
            ? cancellation.signal.reason
            : new Error('Voice call cancelled', { cause: cancellation.signal.reason }),
        );
      cancellation.signal.addEventListener('abort', rejectCancelled, { once: true });
      if (cancellation.signal.aborted) rejectCancelled();
    });
    try {
      return await Promise.race([
        prepareCall(caller, slug, kind, cancellation.signal, startedAt),
        cancelled,
      ]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      cancellation.signal.removeEventListener('abort', rejectCancelled);
    }
  };

  const run = async (
    caller: VoiceCaller,
    raw: unknown,
    signal: AbortSignal | undefined,
  ): Promise<VoiceCallResult> => {
    if (wiring.disposed) throw new CallRefusal('not-ready', 'Calls are stopping on this Host.');
    const command = record(raw) as Partial<VoiceCallCommand> & Record<string, unknown>;
    switch (command.kind) {
      case 'readiness':
        return { ok: true, readiness: await readiness(caller, slugOf(command['slug'])) };
      case 'status':
        return {
          ok: true,
          calls: [...calls.values()]
            .filter(
              (call) =>
                caller.deviceId === VOICE_CALL_HOST_OWNER || call.caller === caller.deviceId,
            )
            .map((call) => view(call)),
        };
      case 'open': {
        const media = command['media'] ?? 'webrtc';
        if (media !== 'webrtc' && media !== 'synthetic')
          throw new CallRefusal('invalid-input', 'media must be webrtc or synthetic.');
        return { ok: true, call: view(await open(caller, slugOf(command['slug']), media, signal)) };
      }
      case 'signal': {
        const call = own(caller, command['callId']);
        const answer = record(command['answer']);
        if (
          answer['type'] !== 'answer' ||
          typeof answer['sdp'] !== 'string' ||
          Buffer.byteLength(answer['sdp']) > VOICE_CALL_LIMITS.signalBytes ||
          !answer['sdp'].startsWith('v=0')
        )
          throw new CallRefusal('invalid-input', 'A WebRTC answer is required.');
        if (call.phase === 'ended') throw new CallRefusal('call-ended', 'The call has ended.');
        if (call.peer === undefined || call.connected)
          throw new CallRefusal('signal-failed', 'The call does not expect an answer.');
        try {
          await call.peer.answer({ type: 'answer', sdp: answer['sdp'] }, signal);
        } catch {
          await end(call, 'media-failed');
          throw new CallRefusal('signal-failed', 'The Host could not apply the answer.');
        }
        call.lastHeartbeat = now();
        return { ok: true, call: view(call) };
      }
      case 'heartbeat': {
        const call = own(caller, command['callId']);
        const after = command['after'];
        if (after !== undefined && (!Number.isSafeInteger(after) || (after as number) < 0))
          throw new CallRefusal('invalid-input', 'after must be an event sequence number.');
        const diagnosticCall = schedulingIdentity(call);
        const operation = schedulingIdentity();
        recordSchedulingDiagnostic({
          kind: 'heartbeat-owner-enter',
          call: diagnosticCall,
          operation,
          active: call.phase !== 'ended',
        });
        let outcome: 'ok' | 'error' = 'error';
        try {
          if (call.phase !== 'ended') {
            call.lastHeartbeat = now();
            tick(call);
          }
          const result = view(call, (after as number | undefined) ?? 0);
          outcome = 'ok';
          return { ok: true, call: result };
        } finally {
          recordSchedulingDiagnostic({
            kind: 'heartbeat-owner-settle',
            call: diagnosticCall,
            operation,
            outcome,
          });
        }
      }
      case 'mute': {
        const call = own(caller, command['callId']);
        if (typeof command['muted'] !== 'boolean')
          throw new CallRefusal('invalid-input', 'muted must be true or false.');
        if (call.phase === 'ended') throw new CallRefusal('call-ended', 'The call has ended.');
        if (call.muted !== command['muted']) {
          call.muted = command['muted'];
          if (call.muted) {
            call.vad.reset();
            dropStream(call);
            if (call.barge !== undefined) {
              call.barge = undefined;
              setGain(call, 1);
            }
          }
          push(call, { type: call.muted ? 'muted' : 'unmuted' });
          settle(call);
        }
        call.lastHeartbeat = now();
        return { ok: true, call: view(call) };
      }
      case 'inject': {
        const call = own(caller, command['callId']);
        if (call.media !== 'synthetic')
          throw new CallRefusal('synthetic-only', 'Only a synthetic call takes injected audio.');
        if (call.phase === 'ended') throw new CallRefusal('call-ended', 'The call has ended.');
        const pcm = command['pcm'];
        if (typeof pcm !== 'string' || pcm.length > VOICE_CALL_LIMITS.injectBytes)
          throw new CallRefusal(
            'invalid-input',
            'pcm must be base64 16 kHz mono 16-bit audio, at most 2 s per request.',
          );
        const after = command['after'];
        if (after !== undefined && (!Number.isSafeInteger(after) || (after as number) < 0))
          throw new CallRefusal('invalid-input', 'after must be an event sequence number.');
        const before = call.seq;
        call.lastHeartbeat = now();
        hear(call, callPcm(pcm));
        return { ok: true, call: view(call, (after as number | undefined) ?? before) };
      }
      case 'visual': {
        const call = own(caller, command['callId']);
        const source = command['source'];
        if (source !== 'camera' && source !== 'screen' && source !== 'off')
          throw new CallRefusal('invalid-input', 'source must be camera, screen or off.');
        if (command['save'] !== undefined)
          throw new CallRefusal(
            'invalid-input',
            'save is no longer accepted: frames are always saved to the DM while the camera or screen is on.',
          );
        const flags = (['stopped', 'paused', 'resumed'] as const).filter((flag) => {
          const value = command[flag] ?? false;
          if (typeof value !== 'boolean')
            throw new CallRefusal('invalid-input', `${flag} must be true or false.`);
          return value;
        });
        const change = flags[0];
        if (
          flags.length > 1 ||
          ((change === 'stopped' || change === 'paused') && source !== 'off') ||
          (change === 'resumed' && source === 'off')
        )
          throw new CallRefusal(
            'invalid-input',
            'stopped and paused go with source off, resumed with camera or screen, one at a time.',
          );
        if (call.phase === 'ended') throw new CallRefusal('call-ended', 'The call has ended.');
        if (change === 'resumed' && source !== 'off' && call.visual !== source)
          recordShare(call, 'share-resumed', source);
        else if (change !== undefined && change !== 'resumed' && call.visual !== 'off')
          recordShare(call, `share-${change}`, call.visual);
        if (call.visual !== source) {
          if (call.visual !== 'off')
            commit(call, call.visualSession, call.visual, call.harvest.flush());
          call.lastGrid = undefined;
          call.visualSession += 1;
          call.visual = source;
          push(call, { type: 'visual', source });
          log('call-visual', { call: call.id, source });
        }
        call.lastHeartbeat = now();
        return { ok: true, call: view(call) };
      }
      case 'frame': {
        const call = own(caller, command['callId']);
        if (call.phase === 'ended') throw new CallRefusal('call-ended', 'The call has ended.');
        const source = command['source'];
        if (source !== 'camera' && source !== 'screen')
          throw new CallRefusal('invalid-input', 'source must be camera or screen.');
        if (call.visual !== source)
          throw new CallRefusal('visual-off', `The call is not sharing the ${source} now.`);
        const jpeg = command['jpeg'];
        if (
          typeof jpeg !== 'string' ||
          jpeg.length === 0 ||
          jpeg.length > Math.ceil(VOICE_CALL_LIMITS.frameBytes / 3) * 4
        )
          throw new CallRefusal(
            'frame-invalid',
            'jpeg must be a base64 JPEG keyframe of at most 512 KB.',
          );
        const score = command['score'] ?? 1;
        const skipped = command['skipped'];
        const after = command['after'];
        if (typeof score !== 'number' || !(score >= 0 && score <= 1))
          throw new CallRefusal('invalid-input', 'score must be a number from 0 to 1.');
        if (skipped !== undefined && (!Number.isSafeInteger(skipped) || (skipped as number) < 0))
          throw new CallRefusal('invalid-input', 'skipped must be a count of samples.');
        if (after !== undefined && (!Number.isSafeInteger(after) || (after as number) < 0))
          throw new CallRefusal('invalid-input', 'after must be an event sequence number.');
        const bytes = new Uint8Array(Buffer.from(jpeg, 'base64'));
        if (!isJpeg(bytes) || bytes.byteLength > VOICE_CALL_LIMITS.frameBytes)
          throw new CallRefusal('frame-invalid', 'The keyframe must be a JPEG image.');
        const before = call.seq;
        const session = call.visualSession;
        call.lastHeartbeat = now();
        const started = now();
        let frame: PreparedFrame;
        try {
          frame = await images().prepare(bytes);
        } catch (error) {
          throw new CallRefusal(
            'frame-invalid',
            error instanceof CallFrameError ? error.message : 'The keyframe could not be read.',
          );
        }
        if (!ended(call) && call.visualSession === session) {
          const dropped = call.harvest.add({ at: now(), frame });
          push(call, {
            type: 'frame-received',
            source,
            bytes: bytes.byteLength,
            width: frame.width,
            height: frame.height,
            score: Math.round(score * 1000) / 1000,
            prepareMs: now() - started,
            ...(skipped === undefined ? {} : { skipped: skipped as number }),
          });
          reportDropped(call, source, dropped);
          harvest(call);
        }
        return { ok: true, call: view(call, (after as number | undefined) ?? before) };
      }
      case 'hangup': {
        const call = own(caller, command['callId'], true);
        await end(call, 'hangup');
        await Promise.race([call.recorded, new Promise((resolve) => setTimeout(resolve, 3_000))]);
        return { ok: true, call: view(call) };
      }
      case 'zoom': {
        const messageId = command['messageId'];
        const cell = command['cell'];
        if (typeof messageId !== 'string' || messageId.length === 0 || messageId.length > 150)
          throw new CallRefusal('invalid-input', 'messageId must name the message with the grid.');
        if (
          !Number.isSafeInteger(cell) ||
          (cell as number) < 1 ||
          (cell as number) > MAX_GRID_FRAMES
        )
          throw new CallRefusal(
            'cell-invalid',
            `cell must be a grid cell number from 1 to ${MAX_GRID_FRAMES}.`,
          );
        const result = zoom({ messageId, cell: cell as number });
        return {
          ok: true,
          zoom: result.released
            ? result
            : {
                released: false,
                messageId: result.messageId,
                cell: result.cell,
                cells: result.cells,
                source: result.source,
                width: result.width,
                height: result.height,
                bytes: result.jpeg.byteLength,
                jpeg: Buffer.from(result.jpeg).toString('base64'),
              },
        };
      }
      case undefined:
      default:
        throw new CallRefusal('invalid-input', 'Unknown call command.');
    }
  };

  return {
    async handle(caller, command, signal) {
      try {
        return await run(caller, command, signal);
      } catch (error) {
        if (error instanceof CallRefusal)
          return { ok: false, code: error.code, error: error.message };
        log('call-command-failed', { error: String(error).slice(0, 200) });
        return {
          ok: false,
          code: 'operation-timeout',
          error: 'The call command did not complete.',
        };
      }
    },
  };
}
