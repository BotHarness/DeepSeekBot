import {
  voiceCallDuration,
  type ChannelVoiceCallRecord,
} from '../../../../../packages/core/src/channels/voice-call-record';
import { locale, t as defaultStrings } from '../strings';

export type CallCopy = Pick<
  typeof defaultStrings.call,
  'recordStarted' | 'recordEnded' | 'recordStartedAt' | 'recordLength'
>;

function clock(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }).format(date);
}

export function callRecordLines(
  record: ChannelVoiceCallRecord,
  copy: CallCopy = defaultStrings.call,
): { title: string; detail: string } {
  return record.state === 'started'
    ? { title: copy.recordStarted, detail: copy.recordStartedAt(clock(record.startedAt)) }
    : { title: copy.recordEnded, detail: copy.recordLength(voiceCallDuration(record.durationMs)) };
}

export function callRecordPreview(
  record: ChannelVoiceCallRecord,
  copy: CallCopy = defaultStrings.call,
): string {
  const { title, detail } = callRecordLines(record, copy);
  return `${title} · ${detail}`;
}
