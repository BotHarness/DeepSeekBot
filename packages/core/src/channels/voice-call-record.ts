export type ChannelVoiceCallEndReason =
  | 'hangup'
  | 'connection-lost'
  | 'connect-timeout'
  | 'media-failed'
  | 'replaced'
  | 'bot-unavailable'
  | 'host-stopped';

export type ChannelVoiceCallRecord =
  | {
      callId: string;
      botSlug: string;
      state: 'started';
      startedAt: string;
    }
  | {
      callId: string;
      botSlug: string;
      state: 'ended';
      startedAt: string;
      endedAt: string;
      durationMs: number;
      reason: ChannelVoiceCallEndReason;
      heard: number;
      startMessageId?: string;
    }
  | {
      callId: string;
      botSlug: string;
      state: 'frames';
      startedAt: string;
      source: 'camera' | 'screen';
      frames: number;
      layout: '1x1' | '2x2' | '3x3' | '4x4';
      fromMs: number;
      toMs: number;
    }
  | {
      callId: string;
      botSlug: string;
      state: 'share-stopped';
      startedAt: string;
      source: 'camera' | 'screen';
      atMs: number;
    };

export type ChannelVoiceCallLifecycle = Exclude<ChannelVoiceCallRecord, { state: 'frames' }>;

const CALL_ID = /^call-[a-f0-9]{16}$/u;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const REASONS: ReadonlySet<string> = new Set([
  'hangup',
  'connection-lost',
  'connect-timeout',
  'media-failed',
  'replaced',
  'bot-unavailable',
  'host-stopped',
]);

const time = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function isChannelVoiceCallRecord(value: unknown): value is ChannelVoiceCallRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (
    typeof record['callId'] !== 'string' ||
    !CALL_ID.test(record['callId']) ||
    typeof record['botSlug'] !== 'string' ||
    !SLUG.test(record['botSlug']) ||
    !time(record['startedAt'])
  )
    return false;
  if (record['state'] === 'started') return Object.keys(record).length === 4;
  if (record['state'] === 'frames')
    return (
      Object.keys(record).length === 9 &&
      (record['source'] === 'camera' || record['source'] === 'screen') &&
      count(record['frames']) &&
      (record['frames'] as number) >= 1 &&
      (record['frames'] as number) <= 16 &&
      ['1x1', '2x2', '3x3', '4x4'].includes(record['layout'] as string) &&
      count(record['fromMs']) &&
      count(record['toMs']) &&
      (record['toMs'] as number) >= (record['fromMs'] as number)
    );
  if (record['state'] === 'share-stopped')
    return (
      Object.keys(record).length === 6 &&
      (record['source'] === 'camera' || record['source'] === 'screen') &&
      count(record['atMs'])
    );
  if (record['state'] !== 'ended') return false;
  return (
    time(record['endedAt']) &&
    count(record['durationMs']) &&
    typeof record['reason'] === 'string' &&
    REASONS.has(record['reason']) &&
    count(record['heard']) &&
    (record['startMessageId'] === undefined ||
      (typeof record['startMessageId'] === 'string' &&
        record['startMessageId'].length > 0 &&
        record['startMessageId'].length <= 128))
  );
}

export function voiceCallDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

export function voiceCallRecordBody(record: ChannelVoiceCallRecord): string {
  if (record.state === 'frames')
    return `${record.source === 'camera' ? 'Camera' : 'Screen'} record of call ${record.callId} from ${voiceCallDuration(record.fromMs)} to ${voiceCallDuration(record.toMs)} while the Human was silent: ${record.frames === 1 ? 'one keyframe' : `a ${record.layout} grid of ${record.frames} keyframes`}, oldest first.`;
  if (record.state === 'share-stopped')
    return `${record.source === 'camera' ? 'The camera' : 'Screen sharing'} in call ${record.callId} stopped at ${voiceCallDuration(record.atMs)} without the Human turning it off; the call went on with voice only.`;
  return record.state === 'started'
    ? `Voice call ${record.callId} started at ${record.startedAt}.`
    : `Voice call ${record.callId} ended at ${record.endedAt} after ${voiceCallDuration(record.durationMs)} (${record.reason}). Messages from ${record.startedAt} to ${record.endedAt} in this DM are from that call.`;
}
