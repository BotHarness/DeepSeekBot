import { VOICE_CALL_LIMITS, type VoiceCallBargeIn } from './call-contract.js';
import type { ChannelDraftEvent } from '../channels/draft.js';
import { VoiceError } from './providers.js';
import { joinAudio, speakableSentences, trimAudio, type AudioClip } from './speech.js';
import { ended } from './calls-types.js';
import type {
  Call,
  VoiceCallsDeps,
  Reply,
  EventInput,
  Spoken,
  CallSpeech,
  VoiceCallSpeechRange,
} from './calls-types.js';

const SETTLED_CLAIM_MS = 15_000;

export function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

export function createCallPlayback({
  deps,
  push,
  now,
  barge,
  settle,
  log,
  live,
  visualBase,
}: {
  deps: VoiceCallsDeps;
  push: (call: Call, event: EventInput) => void;
  now: () => number;
  barge: VoiceCallBargeIn;
  settle: (call: Call) => void;
  log: NonNullable<VoiceCallsDeps['log']>;
  live: () => Call | undefined;
  visualBase: (call: Call) => number;
}) {
  const synthesize = (call: Call, text: string, signal: AbortSignal): Promise<AudioClip> => {
    const voice = deps.bot(call.slug)?.voice;
    if (voice === undefined)
      return Promise.reject(new VoiceError('unknown-provider', 'No TTS Provider.'));
    return Promise.resolve().then(() =>
      deps.providers.synthesize({
        providerId: voice.providerId,
        voiceId: voice.voiceId,
        text,
        signal,
      }),
    );
  };

  const forget = (call: Call, reply: Reply) => {
    call.replies = call.replies.filter((other) => other !== reply);
  };

  const maybeDone = (call: Call, reply: Reply) => {
    if (
      reply.done ||
      !reply.claimed ||
      reply.messageId === undefined ||
      reply.finished < reply.sentences.length
    )
      return;
    reply.done = true;
    forget(call, reply);
    reply.settleArchive?.(
      archiveOf(call, reply).catch((error: unknown) => {
        if (reply.interrupted) return { interrupted: true };
        throw error;
      }),
    );
    if (!ended(call))
      push(call, {
        type: 'reply-done',
        replyId: reply.id,
        messageId: reply.messageId,
        sentences: reply.sentences.filter((spoken) => spoken.state === 'played').length,
      });
  };

  const archiveOf = async (
    call: Call,
    reply: Reply,
  ): Promise<{ clip?: AudioClip; interrupted: boolean }> => {
    const heard = reply.interrupted
      ? reply.archived.filter((spoken) => spoken.state === 'played' || spoken.state === 'cut')
      : reply.archived;
    if (heard.length === 0) return { interrupted: reply.interrupted };
    const clips = await Promise.all(
      heard.map(async (spoken) => {
        const clip = await spoken.clip.catch(() =>
          synthesize(
            call,
            spoken.text,
            AbortSignal.timeout(VOICE_CALL_LIMITS.operationTimeoutMs * 6),
          ),
        );
        return spoken.state === 'cut' ? trimAudio(clip, spoken.heardMs ?? 0) : clip;
      }),
    );
    const clip = joinAudio(clips.filter((item) => item !== undefined));
    return clip === undefined
      ? { interrupted: reply.interrupted }
      : { clip, interrupted: reply.interrupted };
  };

  const startPlaying = (call: Call) => {
    call.playing = true;
    call.guardUntil = Math.max(call.guardUntil, now() + barge.echoDelayMs + barge.echoGuardMs);
    settle(call);
  };

  const stopPlaying = (call: Call) => {
    call.playing = false;
    call.guardUntil = Math.max(call.guardUntil, now() + VOICE_CALL_LIMITS.playbackTailMs);
    settle(call);
  };

  const setGain = (call: Call, gain: number) => {
    if (call.gain === gain || ended(call)) return;
    call.gain = gain;
    void call.peer?.setGain?.(gain).catch(() => {
      if (call.gain === gain) call.gain = undefined;
      log('call-gain-failed', { call: call.id, gain });
    });
  };

  const talking = (call: Call) => call.playing || call.replies.some(pending);

  const suspect = (call: Call) => {
    call.barge = { state: 'suspected' };
    setGain(call, barge.duckGain);
    push(call, { type: 'barge-suspected' });
    log('call-barge-suspected', { call: call.id });
  };

  const interrupt = (call: Call, reply: Reply) => {
    reply.interrupted = true;
    for (const spoken of reply.sentences)
      if (spoken.state === 'playing' && spoken.startedAt !== undefined)
        spoken.heardMs = now() - spoken.startedAt;
    reply.stop.abort();
    reply.synth.abort();
    if (reply.draftId !== undefined) call.stoppedDrafts.add(reply.draftId);
    for (const spoken of reply.sentences) if (spoken.state === 'queued') spoken.state = 'skipped';
    forget(call, reply);
    if (!reply.claimed) {
      call.interrupted.push(reply);
      if (call.interrupted.length > 8) call.interrupted.shift();
    }
    push(call, { type: 'reply-stopped', replyId: reply.id, reason: 'interrupted' });
  };

  const confirm = (call: Call, by: 'duration' | 'words') => {
    if (by === 'duration') {
      call.barge = { state: 'confirmed' };
      call.vad.linger(barge.pauseMs);
    }
    const stopped = [...call.replies];
    for (const reply of stopped) interrupt(call, reply);
    setGain(call, 1);
    push(call, { type: 'barge-in', by, replyIds: stopped.map((reply) => reply.id) });
    log('call-barge-in', { call: call.id, by, replies: stopped.length });
    settle(call);
  };

  const dismiss = (call: Call, reason: 'ended' | 'filler') => {
    if (call.barge === undefined) setGain(call, 1);
    push(call, { type: 'barge-dismissed', reason });
    log('call-barge-dismissed', { call: call.id, reason });
  };

  const finishSentence = (call: Call, reply: Reply) => {
    reply.finished += 1;
    maybeDone(call, reply);
  };

  const pending = (reply: Reply) =>
    reply.sentences.some((spoken) => spoken.state === 'queued' || spoken.state === 'playing');

  const prune = (call: Call) => {
    for (const reply of [...call.replies])
      if (!reply.claimed && !pending(reply)) {
        reply.synth.abort();
        forget(call, reply);
      }
  };

  const playSentence = async (call: Call, reply: Reply, spoken: Spoken, index: number) => {
    const skip = () => {
      if (spoken.state === 'queued') spoken.state = 'skipped';
      finishSentence(call, reply);
    };
    if (ended(call) || reply.stop.signal.aborted || spoken.state !== 'queued') return skip();
    let clip: AudioClip;
    try {
      clip = await spoken.clip;
    } catch (error) {
      if (ended(call) || reply.stop.signal.aborted || spoken.state !== 'queued') return skip();
      spoken.state = 'failed';
      push(call, {
        type: 'playback-failed',
        replyId: reply.id,
        sentence: index,
        ...(reply.messageId === undefined ? {} : { messageId: reply.messageId }),
        code: error instanceof VoiceError ? error.code : 'synthesis-failed',
      });
      finishSentence(call, reply);
      return;
    }
    if (ended(call) || reply.stop.signal.aborted || spoken.state !== 'queued') return skip();
    spoken.state = 'playing';
    spoken.startedAt = now();
    startPlaying(call);
    const first = !reply.started;
    reply.started = true;
    push(call, {
      type: 'playing',
      replyId: reply.id,
      sentence: index,
      ...(reply.messageId === undefined ? {} : { messageId: reply.messageId }),
      bytes: clip.audio.byteLength,
      ...(first && reply.heardAt !== undefined ? { responseMs: now() - reply.heardAt } : {}),
    });
    if (first)
      log('call-first-audio', {
        call: call.id,
        reply: reply.id,
        ...(reply.heardAt === undefined ? {} : { ms: now() - reply.heardAt }),
        committed: reply.messageId === undefined ? 0 : 1,
      });
    try {
      if (call.peer !== undefined)
        await call.peer.play(
          clip.audio,
          clip.mime,
          AbortSignal.any([call.abort.signal, reply.stop.signal]),
        );
      if (reply.interrupted) {
        spoken.state = 'cut';
      } else if (ended(call) || reply.stop.signal.aborted) {
        spoken.state = 'skipped';
      } else {
        spoken.state = 'played';
        push(call, {
          type: 'played',
          replyId: reply.id,
          sentence: index,
          ...(reply.messageId === undefined ? {} : { messageId: reply.messageId }),
        });
      }
    } catch {
      spoken.state = reply.interrupted ? 'cut' : 'failed';
      if (!ended(call) && !reply.stop.signal.aborted)
        push(call, {
          type: 'playback-failed',
          replyId: reply.id,
          sentence: index,
          ...(reply.messageId === undefined ? {} : { messageId: reply.messageId }),
          code: 'playback-failed',
        });
    } finally {
      stopPlaying(call);
      finishSentence(call, reply);
    }
  };

  const enqueue = (call: Call, reply: Reply, text: string): Spoken => {
    const clip = reply.synthChain.then(() => synthesize(call, text, reply.synth.signal));
    clip.catch(() => undefined);
    reply.synthChain = clip.catch(() => undefined);
    const spoken: Spoken = { text, clip, state: 'queued' };
    const index = reply.sentences.push(spoken) - 1;
    call.playback = call.playback.then(() => playSentence(call, reply, spoken, index));
    return spoken;
  };

  const newReply = (call: Call, draftId?: string): Reply => {
    call.replyCount += 1;
    const reply: Reply = {
      id: `reply-${call.replyCount}`,
      ...(draftId === undefined ? {} : { draftId }),
      heardAt: call.lastHeardAt,
      sentences: [],
      stop: new AbortController(),
      synth: new AbortController(),
      synthChain: Promise.resolve(),
      claimed: false,
      started: false,
      finished: 0,
      done: false,
      interrupted: false,
      archived: [],
    };
    call.replies.push(reply);
    return reply;
  };

  const stopReply = (call: Call, reply: Reply, reason: 'abandoned' | 'revised' | 'replaced') => {
    reply.stop.abort();
    reply.synth.abort();
    if (reply.draftId !== undefined) call.stoppedDrafts.add(reply.draftId);
    for (const spoken of reply.sentences) if (spoken.state === 'queued') spoken.state = 'skipped';
    forget(call, reply);
    push(call, { type: 'reply-stopped', replyId: reply.id, reason });
    log('call-reply-stopped', { call: call.id, reply: reply.id, reason });
    settle(call);
  };

  const onDraft = (event: ChannelDraftEvent) => {
    const call = live();
    if (call === undefined || !call.connected) return;
    if (event.type === 'settled') {
      const draftId = event.draftId;
      if (event.channelId === call.channelId) call.settledDraft = draftId;
      const timer = setTimeout(() => {
        const reply = call.replies.find((item) => item.draftId === draftId && !item.claimed);
        if (reply !== undefined && !ended(call)) stopReply(call, reply, 'abandoned');
      }, SETTLED_CLAIM_MS);
      timer.unref?.();
      return;
    }
    if (event.type === 'abandoned') {
      if (event.channelId !== call.channelId) return;
      const draftId = event.draftId;
      call.interrupted = call.interrupted.filter((item) => item.draftId !== draftId);
      const reply = call.replies.find((item) => item.draftId === draftId && !item.claimed);
      if (reply !== undefined) stopReply(call, reply, 'abandoned');
      return;
    }
    const draft = event.draft;
    if (draft.channelId !== call.channelId || draft.botSlug !== call.slug || draft.voice !== true)
      return;
    if (call.stoppedDrafts.has(draft.draftId)) return;
    if (call.replies.some((item) => item.draftId === draft.draftId && item.claimed)) return;
    let reply = call.replies.find((item) => item.draftId === draft.draftId);
    const sentences = speakableSentences(draft.body, draft.bodyComplete === true);
    if (reply === undefined) {
      if (sentences.length === 0 && draft.body.trim() === '') return;
      reply = newReply(call, draft.draftId);
      push(call, {
        type: 'reply-text',
        replyId: reply.id,
        ...(reply.heardAt === undefined ? {} : { responseMs: now() - reply.heardAt }),
      });
      log('call-reply-text', {
        call: call.id,
        reply: reply.id,
        ...(reply.heardAt === undefined ? {} : { ms: now() - reply.heardAt }),
      });
    }
    const known = reply.sentences;
    const diverged =
      known.length > sentences.length ||
      known.some((spoken, index) => sentences[index] !== spoken.text);
    if (diverged) {
      stopReply(call, reply, 'revised');
      return;
    }
    for (const text of sentences.slice(known.length)) enqueue(call, reply, text);
  };

  const claim = (reply: Reply, messageId: string): CallSpeech => {
    reply.claimed = true;
    reply.messageId = messageId;
    const archive = new Promise<{ clip?: AudioClip; interrupted: boolean }>((resolve) => {
      reply.settleArchive = (settled) => resolve(settled);
    });
    archive.catch(() => undefined);
    return { archive };
  };

  const speak = async (input: {
    slug: string;
    channelId: string;
    messageId: string;
    at: string;
    body: string;
    signal?: AbortSignal | undefined;
  }): Promise<CallSpeech | undefined> => {
    const call = live();
    if (
      call === undefined ||
      !call.connected ||
      call.slug !== input.slug ||
      call.channelId !== input.channelId ||
      Date.parse(input.at) < call.startedAt - 1_000
    )
      return undefined;
    const final = speakableSentences(input.body, true);
    if (final.length === 0) return undefined;
    const prefix = (reply: Reply) => {
      let count = 0;
      while (
        count < reply.sentences.length &&
        count < final.length &&
        reply.sentences[count]!.text === final[count]
      )
        count += 1;
      return count;
    };
    const settledDraft = call.settledDraft;
    call.settledDraft = undefined;
    const cut =
      call.interrupted.find((item) => item.draftId === settledDraft) ??
      call.interrupted.find((item) => prefix(item) > 0);
    if (cut !== undefined) {
      call.interrupted = call.interrupted.filter((item) => item !== cut);
      const speech = claim(cut, input.messageId);
      cut.archived = [...cut.sentences];
      const heard = cut.sentences.filter(
        (spoken) => spoken.state === 'played' || spoken.state === 'cut',
      ).length;
      push(call, {
        type: 'committed',
        replyId: cut.id,
        messageId: input.messageId,
        reused: heard,
        synthesized: 0,
        interrupted: true,
      });
      log('call-reply-committed', {
        call: call.id,
        reply: cut.id,
        reused: heard,
        synthesized: 0,
        dropped: final.length - heard,
        interrupted: 1,
      });
      maybeDone(call, cut);
      return speech;
    }
    let reply: Reply | undefined;
    let matched = 0;
    for (const candidate of call.replies) {
      if (candidate.claimed || candidate.draftId === undefined) continue;
      const count = prefix(candidate);
      if (count > 0 && count >= matched) {
        reply = candidate;
        matched = count;
      }
    }
    for (const other of [...call.replies])
      if (!other.claimed && other !== reply && other.draftId !== undefined)
        stopReply(call, other, 'replaced');
    if (reply === undefined) reply = newReply(call);
    const claimed = reply;
    const speech = claim(claimed, input.messageId);
    for (const spoken of claimed.sentences.slice(matched))
      if (spoken.state === 'queued') spoken.state = 'skipped';
    claimed.archived = claimed.sentences.slice(0, matched);
    const tail = final.slice(matched);
    push(call, {
      type: 'committed',
      replyId: claimed.id,
      messageId: input.messageId,
      reused: matched,
      synthesized: tail.length,
    });
    log('call-reply-committed', {
      call: call.id,
      reply: claimed.id,
      reused: matched,
      synthesized: tail.length,
      dropped: claimed.sentences.length - matched,
    });
    for (const text of tail) claimed.archived.push(enqueue(call, claimed, text));
    maybeDone(call, claimed);
    call.lastHeardAt = undefined;
    return speech;
  };

  const speechRange = (call: Call, startMs: number, endMs: number): VoiceCallSpeechRange => {
    const toMs = Math.max(0, now() - visualBase(call) - (call.vad.timeMs() - endMs));
    return { fromMs: Math.max(0, toMs - (endMs - startMs)), toMs };
  };

  return { setGain, talking, suspect, confirm, dismiss, prune, onDraft, speak, speechRange };
}
