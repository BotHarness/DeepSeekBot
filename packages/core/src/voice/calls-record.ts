import type { VoiceCallEndReason } from './call-contract.js';
import type {
  ChannelVoiceCallLifecycle,
  ChannelVoiceCallShareChange,
} from '../channels/voice-call-record.js';
import type { CallVisualSource } from './keyframes.js';
import type { Call, VoiceCallsDeps } from './calls-types.js';

export function createCallRecording({
  deps,
  log,
  now,
}: {
  deps: VoiceCallsDeps;
  log: NonNullable<VoiceCallsDeps['log']>;
  now: () => number;
}) {
  const iso = (ms: number) => new Date(ms).toISOString();

  const writeRecord = async (call: Call, record: ChannelVoiceCallLifecycle) => {
    if (deps.record === undefined) return undefined;
    try {
      return await deps.record({ slug: call.slug, channelId: call.channelId, record });
    } catch (error) {
      log('call-record-failed', {
        call: call.id,
        state: record.state,
        message: (error instanceof Error ? error.message : 'unknown').slice(0, 200),
      });
      return undefined;
    }
  };

  let recordTail: Promise<unknown> = Promise.resolve();

  const recordStart = (call: Call) => {
    if (deps.record === undefined || call.connectedAt === undefined) return;
    const before = recordTail;
    const connectedAt = call.connectedAt;
    call.recorded = before.then(() =>
      writeRecord(call, {
        callId: call.id,
        botSlug: call.slug,
        state: 'started',
        startedAt: iso(connectedAt),
      }),
    );
    recordTail = call.recorded;
  };

  const recordShare = (
    call: Call,
    state: ChannelVoiceCallShareChange,
    source: CallVisualSource,
  ) => {
    const started = call.recorded;
    const connectedAt = call.connectedAt;
    if (started === undefined || connectedAt === undefined) return;
    const atMs = Math.max(0, now() - connectedAt);
    log(`call-${state}`, { call: call.id, source, atMs });
    const before = recordTail;
    call.recorded = before.then(async () => {
      const startMessageId = await started;
      await writeRecord(call, {
        callId: call.id,
        botSlug: call.slug,
        state,
        startedAt: iso(connectedAt),
        source,
        atMs,
      });
      return startMessageId;
    });
    recordTail = call.recorded;
  };

  const recordEnd = (call: Call, reason: VoiceCallEndReason) => {
    const started = call.recorded;
    const connectedAt = call.connectedAt;
    if (started === undefined || connectedAt === undefined) return;
    const endedAt = call.endedAt ?? now();
    const pending = call.transcription.catch(() => undefined);
    call.recorded = (async () => {
      const startMessageId = await started;
      await pending;
      return writeRecord(call, {
        callId: call.id,
        botSlug: call.slug,
        state: 'ended',
        startedAt: iso(connectedAt),
        endedAt: iso(endedAt),
        durationMs: Math.max(0, endedAt - connectedAt),
        reason,
        heard: call.heard,
        ...(startMessageId === undefined ? {} : { startMessageId }),
      });
    })();
    recordTail = call.recorded;
  };

  return { iso, recordStart, recordShare, recordEnd };
}
