import {
  VOICE_CALL_BARGE_IN,
  VOICE_CALL_LIMITS,
  type VoiceCallBargeIn,
  type VoiceCallEndReason,
  type VoiceCallEvent,
  type VoiceCallView,
} from './call-contract.js';
import { perfFields } from './call-perf.js';
import { createCallImaging } from './call-frames.js';
import type { Call, EventInput, VoiceCallsDeps, VoiceCalls } from './calls-types.js';
import { OWN_TURN_START_MS, createCallCommands } from './calls-command.js';
import { createCallTranscript } from './calls-transcript.js';
import { createCallVisuals } from './calls-visual.js';
import { createCallRecording } from './calls-record.js';
import { createCallText } from './calls-text.js';
import { createCallPlayback } from './calls-playback.js';
export type {
  VoiceCallMedia,
  VoiceCallMediaPeer,
  CallSpeech,
  VoiceCallSentVisual,
  VoiceCallText,
  VoiceCallSpeechRange,
  VoiceCallBot,
  VoiceCallsDeps,
  VoiceCaller,
  VoiceCalls,
} from './calls-types.js';
export { joinTranscripts, contentWords } from './calls-transcript.js';
export { voiceCallClientId } from './calls-command.js';

export function createVoiceCalls(deps: VoiceCallsDeps): VoiceCalls {
  const now = deps.now ?? (() => Date.now());
  const barge: VoiceCallBargeIn = { ...VOICE_CALL_BARGE_IN, ...deps.bargeIn };
  const log = deps.log ?? (() => undefined);
  const cpuMs =
    deps.cpuMs ??
    (() => {
      const usage = process.cpuUsage();
      return (usage.user + usage.system) / 1000;
    });
  let imaging = deps.imaging;
  const images = () => (imaging ??= createCallImaging());
  const calls = new Map<string, Call>();
  const {
    clearKeptFrames,
    release,
    zoom,
    visualBase,
    reportDropped,
    commit,
    harvest,
    takeGrid,
    restoreGrid,
    gridVisual,
    gridSent,
  } = createCallVisuals({
    now,
    calls,
    get push() {
      return push;
    },
    log,
    images,
    deps,
    get iso() {
      return iso;
    },
  });
  let disposed = false;

  const live = (): Call | undefined => [...calls.values()].find((call) => call.phase !== 'ended');

  const push = (call: Call, event: EventInput) => {
    call.seq += 1;
    call.events.push({ ...event, seq: call.seq, at: now() - call.startedAt } as VoiceCallEvent);
    if (call.events.length > VOICE_CALL_LIMITS.events) call.events.shift();
  };

  const view = (call: Call, after = 0): VoiceCallView => ({
    callId: call.id,
    slug: call.slug,
    channelId: call.channelId,
    phase: call.phase,
    muted: call.muted,
    busy: call.busy,
    media: call.media,
    visual: call.visual,
    startedAt: call.startedAt,
    durationMs: (call.endedAt ?? now()) - call.startedAt,
    ...(call.endReason === undefined ? {} : { endReason: call.endReason }),
    ...(call.offer === undefined || call.connected ? {} : { offer: call.offer }),
    events: call.events.filter((event) => event.seq > after),
    lastSeq: call.seq,
    ...perfView(call),
  });

  const perfView = (call: Call) => {
    const perf = call.perf.view();
    return perf === undefined ? {} : { perf };
  };

  const samplePerf = async (call: Call, at: number) => {
    const peer = call.peer;
    if (peer?.stats === undefined || call.sampling) return;
    call.sampling = true;
    call.perfAt = at;
    try {
      const stats = await peer.stats();
      if (stats === undefined || call.phase === 'ended') return;
      const sample = call.perf.sample(stats, now() - call.startedAt, cpuMs());
      if (sample !== undefined)
        log('call-media-stats', {
          call: call.id,
          ...perfFields(sample),
          ...(stats.receivedAgeMs === undefined
            ? {}
            : { receivedAgeMs: Math.round(stats.receivedAgeMs) }),
        });
    } catch {
      log('call-media-stats-failed', { call: call.id });
    } finally {
      call.sampling = false;
    }
  };

  const settle = (call: Call) => {
    if (call.phase === 'ended' || call.phase === 'connecting') return;
    call.phase = call.playing
      ? 'bot-speaking'
      : call.vad.speaking
        ? 'user-speaking'
        : call.phase === 'transcribing'
          ? 'transcribing'
          : 'listening';
  };

  const end = async (call: Call, reason: VoiceCallEndReason) => {
    if (call.phase === 'ended') return;
    call.phase = 'ended';
    call.endReason = reason;
    call.endedAt = now();
    clearInterval(call.timer);
    call.abort.abort();
    for (const reply of call.replies) {
      reply.stop.abort();
      if (!reply.claimed) reply.synth.abort();
    }
    call.replies = [];
    call.interrupted = [];
    call.barge = undefined;
    if (call.visual !== 'off') {
      commit(call, call.visualSession, call.visual, call.harvest.flush());
      call.visual = 'off';
      push(call, { type: 'visual', source: 'off' });
      log('call-visual', { call: call.id, source: 'off' });
    }
    call.harvest.clear();
    release(call.id);
    call.vad.reset();
    dropStream(call);
    if (call.warmed !== undefined) deps.providers.cool?.(call.warmed);
    call.warmed = undefined;
    push(call, { type: 'ended', reason });
    log('call-ended', { call: call.id, bot: call.slug, reason, ms: call.endedAt - call.startedAt });
    recordEnd(call, reason);
    const perf = call.perf.view();
    if (perf === undefined && call.connected && call.peer?.stats !== undefined)
      log('call-media-summary', { call: call.id, samples: 0 });
    else if (perf !== undefined)
      log('call-media-summary', {
        call: call.id,
        samples: perf.samples,
        uplinkPpsAvg: perf.uplinkPps.avg,
        uplinkPpsMax: perf.uplinkPps.max,
        downlinkPpsAvg: perf.downlinkPps.avg,
        downlinkPpsMax: perf.downlinkPps.max,
        uplinkKbpsAvg: perf.uplinkKbps.avg,
        downlinkKbpsAvg: perf.downlinkKbps.avg,
        uplinkLossPct: perf.uplinkLossPct,
        hostCpuPctAvg: perf.hostCpuPct.avg,
        ...(perf.helperCpuPct === undefined ? {} : { helperCpuPctAvg: perf.helperCpuPct.avg }),
        ...(perf.rttMs === undefined ? {} : { rttMsAvg: perf.rttMs.avg }),
        ...(perf.disconnects === undefined ? {} : { disconnects: perf.disconnects }),
      });
    await call.peer?.close().catch(() => undefined);
    setTimeout(() => {
      if (calls.get(call.id) === call) calls.delete(call.id);
    }, 60_000).unref?.();
  };
  const { iso, recordStart, recordShare, recordEnd } = createCallRecording({ deps, log, now });
  const { dropStream, recognize, segment, startStream } = createCallTranscript({ deps, now, push });
  const { text, transcribe } = createCallText({
    now,
    get prune() {
      return prune;
    },
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
    get dismiss() {
      return dismiss;
    },
    settle,
    deps,
    barge,
    get confirm() {
      return confirm;
    },
  });
  const { setGain, talking, suspect, confirm, dismiss, prune, onDraft, speak, speechRange } =
    createCallPlayback({ deps, push, now, barge, settle, log, live, visualBase });

  const hear = (call: Call, samples: Int16Array) => {
    if (call.phase === 'ended' || call.phase === 'connecting') return;
    if (call.muted) return;
    call.vad.raise(!call.vad.speaking && now() < call.guardUntil ? barge.echoGuardDb : 0);
    for (const event of call.vad.push(samples)) {
      if (event.type === 'speech-start') {
        push(call, { type: 'speech-start' });
        startStream(call);
      } else if (event.type === 'audio') call.stream?.push(event.pcm);
      else if (event.type === 'segment') segment(call, event.pcm);
      else if (event.type === 'voiced') {
        if (event.voicedMs >= barge.confirmMs) {
          if (call.barge?.state === 'suspected' || (call.barge === undefined && talking(call)))
            confirm(call, 'duration');
        } else if (event.voicedMs >= barge.suspectMs) {
          if (call.barge === undefined && talking(call)) suspect(call);
        }
      } else if (event.type === 'noise') {
        dropStream(call);
        push(call, { type: 'noise-discarded', durationMs: event.durationMs });
        const suspected = call.barge?.state === 'suspected';
        call.barge = undefined;
        if (suspected) dismiss(call, 'ended');
      } else {
        const suspected = call.barge?.state === 'suspected';
        const gated = suspected && talking(call);
        call.barge = undefined;
        if (suspected && !gated) setGain(call, 1);
        transcribe(
          call,
          event.pcm,
          event.endMs - event.startMs,
          event.segmentedSamples,
          takeGrid(call),
          speechRange(call, event.startMs, event.endMs),
          gated ? 'words' : suspected ? 'filler' : undefined,
        );
      }
    }
    settle(call);
  };

  const silent = (call: Call, at: number) =>
    at - call.lastHeartbeat > VOICE_CALL_LIMITS.heartbeatLossMs &&
    at - call.mediaSeenAt > VOICE_CALL_LIMITS.heartbeatLossMs;

  const checkMedia = async (call: Call) => {
    let age: number | undefined;
    try {
      const stats = call.peer?.stats?.();
      const late = new Promise<undefined>((resolve) => {
        setTimeout(resolve, VOICE_CALL_LIMITS.operationTimeoutMs / 2);
      });
      age = (await Promise.race([stats, late]))?.receivedAgeMs;
    } catch {
      age = undefined;
    }
    if (call.phase === 'ended') return;
    const at = now();
    if (age !== undefined && age <= VOICE_CALL_LIMITS.heartbeatLossMs)
      call.mediaSeenAt = Math.max(call.mediaSeenAt, at - age);
    const lost = silent(call, at);
    log('call-media-liveness', {
      call: call.id,
      heartbeatAgeMs: at - call.lastHeartbeat,
      receivedAgeMs: age === undefined ? -1 : Math.round(age),
      lost: lost ? 1 : 0,
    });
    if (lost) await end(call, 'connection-lost');
  };

  const tick = (call: Call) => {
    if (call.phase === 'ended') return;
    const at = now();
    const stalled = at - call.tickedAt > VOICE_CALL_LIMITS.heartbeatMs * 2;
    call.tickedAt = at;
    if (
      call.media === 'webrtc' &&
      !call.connected &&
      at - call.startedAt >= VOICE_CALL_LIMITS.connectTimeoutMs
    ) {
      void end(call, 'connect-timeout');
      return;
    }
    if (call.connected && !stalled && silent(call, at)) {
      if (call.peer?.stats === undefined) {
        void end(call, 'connection-lost');
        return;
      }
      call.mediaCheck ??= checkMedia(call).finally(() => {
        call.mediaCheck = undefined;
      });
      return;
    }
    const bot = deps.bot(call.slug);
    if (bot === undefined || bot.paused === true) {
      void end(call, 'bot-unavailable');
      return;
    }
    if (call.connected && at - call.perfAt >= VOICE_CALL_LIMITS.perfSampleMs)
      void samplePerf(call, at);
    const running = deps.busy(call.slug);
    if (call.ownTurn === 'sent' && at - call.ownTurnAt > OWN_TURN_START_MS) call.ownTurn = 'none';
    else if (call.ownTurn === 'sent' && running) call.ownTurn = 'running';
    else if (call.ownTurn === 'running' && !running) call.ownTurn = 'none';
    const busy = running && call.ownTurn === 'none';
    if (busy !== call.busy) {
      call.busy = busy;
      push(call, { type: busy ? 'busy' : 'idle' });
    }
  };
  const commands = createCallCommands({
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
    get disposed() {
      return disposed;
    },
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
  });

  return {
    handle: commands.handle,
    draft: onDraft,
    speak,
    zoom,
    text,
    async revoke(deviceId) {
      await Promise.all(
        [...calls.values()]
          .filter((call) => call.caller === deviceId)
          .map((call) => end(call, 'connection-lost')),
      );
    },
    async dispose() {
      disposed = true;
      const open = [...calls.values()];
      await Promise.all(open.map((call) => end(call, 'host-stopped')));
      await Promise.race([
        Promise.all(open.map((call) => call.recorded)),
        new Promise((resolve) => setTimeout(resolve, 2_000).unref?.()),
      ]);
      calls.clear();
      clearKeptFrames();
    },
  };
}
