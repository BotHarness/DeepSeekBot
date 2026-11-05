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
    };

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
  return record.state === 'started'
    ? `Voice call ${record.callId} started at ${record.startedAt}.`
    : `Voice call ${record.callId} ended at ${record.endedAt} after ${voiceCallDuration(record.durationMs)} (${record.reason}). Messages from ${record.startedAt} to ${record.endedAt} in this DM are from that call.`;
}
