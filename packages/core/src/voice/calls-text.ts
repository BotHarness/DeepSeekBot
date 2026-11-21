import { randomUUID } from 'node:crypto';
import { VOICE_CALL_LIMITS, type VoiceCallBargeIn } from './call-contract.js';
import { VoiceError } from './providers.js';
import type { CallVisualSource } from './keyframes.js';
import { ended } from './calls-types.js';
import type {
  Call,
  VoiceCallText,
  GridJob,
  VisualFrame,
  VoiceCallSentVisual,
  VoiceCallsDeps,
  EventInput,
  VoiceCallSpeechRange,
} from './calls-types.js';
import { MIN_TAIL_SAMPLES, joinTranscripts, contentWords } from './calls-transcript.js';
import { record } from './calls-command.js';

export function createCallText(wiring: {
  now: () => number;
  prune: (call: Call) => void;
  calls: Map<string, Call>;
  visualBase: (call: Call) => number;
  takeGrid: (call: Call) => GridJob | undefined;
  commit: (
    call: Call,
    session: number,
    source: CallVisualSource,
    batches: readonly (readonly VisualFrame[])[],
  ) => void;
  gridVisual: (
    call: Call,
    grid: GridJob | undefined,
  ) => Promise<{ visual: VoiceCallSentVisual | undefined; waitedMs: number }>;
  restoreGrid: (call: Call, grid: GridJob | undefined) => void;
  log: NonNullable<VoiceCallsDeps['log']>;
  gridSent: (
    call: Call,
    grid: GridJob | undefined,
    visual: VoiceCallSentVisual | undefined,
    messageId: string,
    waitedMs: number,
  ) => void;
  push: (call: Call, event: EventInput) => void;
  recognize: (call: Call, pcm: Int16Array) => Promise<string>;
  dismiss: (call: Call, reason: 'ended' | 'filler') => void;
  settle: (call: Call) => void;
  deps: VoiceCallsDeps;
  barge: VoiceCallBargeIn;
  confirm: (call: Call, by: 'duration' | 'words') => void;
}) {
  const {
    now,
    calls,
    visualBase,
    takeGrid,
    commit,
    gridVisual,
    restoreGrid,
    log,
    gridSent,
    push,
    recognize,
    settle,
    deps,
    barge,
  } = wiring;

  const noteHeard = (call: Call) => {
    call.lastHeardAt = now();
    if (!call.busy && call.ownTurn === 'none') {
      call.ownTurn = 'sent';
      call.ownTurnAt = now();
    }
    wiring.prune(call);
  };

  const bounded = async (work: Promise<unknown> | undefined) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.resolve(work).catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, VOICE_CALL_LIMITS.operationTimeoutMs);
        timer.unref?.();
      }),
    ]);
    clearTimeout(timer);
  };

  const text = async (input: {
    channelId: string;
    messageId: string;
    picture?: boolean | undefined;
  }): Promise<VoiceCallText | undefined> => {
    const call = [...calls.values()].find(
      (candidate) =>
        !ended(candidate) && candidate.connected && candidate.channelId === input.channelId,
    );
    if (call === undefined) return undefined;
    const atMs = Math.max(0, now() - visualBase(call));
    let grid = input.picture === false ? undefined : takeGrid(call);
    let land!: () => void;
    const landed = new Promise<void>((resolve) => {
      land = resolve;
    });
    const before = call.transcription;
    const recorded = call.recorded;
    const prepared = (async () => {
      await bounded(Promise.all([before, recorded]));
      if (ended(call)) {
        if (grid !== undefined && grid.frames.length > 0)
          commit(call, grid.session, grid.source, [grid.frames]);
        grid = undefined;
        return { visual: undefined, waitedMs: 0 };
      }
      return gridVisual(call, grid);
    })();
    call.transcription = prepared.then(() => bounded(landed)).catch(() => undefined);
    const { visual, waitedMs } = await prepared.catch(() => ({
      visual: undefined,
      waitedMs: 0,
    }));
    let settled = false;
    return {
      callId: call.id,
      atMs,
      ...(visual === undefined ? {} : { visual }),
      settle(sent) {
        if (settled) return;
        settled = true;
        land();
        if (!sent) {
          if (grid !== undefined && grid.frames.length > 0 && ended(call))
            commit(call, grid.session, grid.source, [grid.frames]);
          else restoreGrid(call, grid);
          log('call-text-failed', { call: call.id, atMs });
          return;
        }
        if (ended(call)) return;
        gridSent(call, grid, visual, input.messageId, waitedMs);
        noteHeard(call);
        push(call, {
          type: 'text',
          messageId: input.messageId,
          atMs,
          ...(grid === undefined || grid.frames.length === 0 ? {} : { grid: grid.id }),
        });
        log('call-text', {
          call: call.id,
          atMs,
          frames: visual !== undefined && 'image' in visual ? visual.frames : 0,
        });
      },
    };
  };

  const transcribe = (
    call: Call,
    pcm: Int16Array,
    audioMs: number,
    segmentedSamples: number,
    grid: GridJob | undefined,
    speech: VoiceCallSpeechRange,
    gate: 'words' | 'filler' | undefined = undefined,
  ) => {
    const gated = gate === 'words';
    const stream = call.stream;
    const segments = call.segments;
    call.stream = undefined;
    call.segments = undefined;
    clearTimeout(call.hearing?.timer);
    call.hearing = undefined;
    const started = now();
    let early: Promise<string> | undefined;
    let mode: 'batch' | 'stream' | 'segments' = 'batch';
    let pieces = 0;
    if (stream !== undefined) {
      mode = 'stream';
      early = stream.finish().then((result) => result.text);
    } else if (segments !== undefined && segments.parts.length > 0) {
      mode = 'segments';
      const rest = pcm.slice(Math.min(segmentedSamples, pcm.length));
      const parts = [...segments.parts];
      if (rest.length >= MIN_TAIL_SAMPLES) parts.push(recognize(call, rest));
      else rest.fill(0);
      pieces = parts.length;
      early = Promise.all(parts).then(joinTranscripts);
    }
    early?.catch(() => undefined);
    if (early !== undefined) pcm.fill(0);
    call.transcription = call.transcription.then(async () => {
      if (call.phase === 'ended') return;
      if (!gated) call.phase = 'transcribing';
      push(call, { type: 'transcribing', audioMs });
      let text: string;
      try {
        text = early !== undefined ? await early : await recognize(call, pcm);
      } catch (error) {
        if (ended(call)) return;
        const code = error instanceof VoiceError ? error.code : 'asr-failed';
        const message = error instanceof VoiceError ? error.message : 'Speech recognition failed.';
        push(call, {
          type: 'asr-failed',
          code,
          message: message.slice(0, 200),
        });
        log('call-asr-failed', { call: call.id, code, mode });
        restoreGrid(call, grid);
        if (gated) wiring.dismiss(call, 'filler');
        return;
      } finally {
        if (call.phase === 'transcribing') call.phase = 'listening';
        settle(call);
      }
      const asrMs = now() - started;
      if (ended(call)) return;
      if (gate === 'filler' && contentWords(text, deps.bot(call.slug)?.asr?.language) === 0) {
        restoreGrid(call, grid);
        wiring.dismiss(call, 'filler');
        return;
      }
      if (gated) {
        if (contentWords(text, deps.bot(call.slug)?.asr?.language) < barge.confirmWords) {
          restoreGrid(call, grid);
          wiring.dismiss(call, 'filler');
          return;
        }
        wiring.confirm(call, 'words');
      }
      if (text.replace(/[\s\p{P}]/gu, '') === '') {
        push(call, { type: 'nothing-heard' });
        restoreGrid(call, grid);
        return;
      }
      const messageId = `human-${randomUUID()}`;
      await call.recorded;
      if (ended(call)) return;
      const { visual, waitedMs } = await gridVisual(call, grid);
      if (ended(call)) return;
      try {
        await deps.send({
          slug: call.slug,
          channelId: call.channelId,
          messageId,
          body: text,
          callId: call.id,
          speech,
          ...(visual === undefined ? {} : { visual }),
        });
      } catch (error) {
        restoreGrid(call, grid);
        const failure = record(error);
        push(call, {
          type: 'send-failed',
          code: typeof failure['code'] === 'string' ? failure['code'] : 'send-failed',
          message: (error instanceof Error ? error.message : 'The message was not sent.').slice(
            0,
            200,
          ),
        });
        return;
      }
      gridSent(call, grid, visual, messageId, waitedMs);
      call.heard += 1;
      noteHeard(call);
      push(call, {
        type: 'sent',
        messageId,
        text,
        asrMs,
        ...(mode === 'stream' ? { streamed: true } : {}),
        ...(mode === 'segments' ? { segments: pieces } : {}),
      });
      log('call-heard', {
        call: call.id,
        bot: call.slug,
        chars: text.length,
        asrMs,
        mode,
      });
    });
  };

  return { text, transcribe };
}
