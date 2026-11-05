import {
  voiceCallDuration,
  type ChannelVoiceCallRecord,
} from '../../../../../packages/core/src/channels/voice-call-record';
import { locale, t as defaultStrings } from '../strings';

export type CallCopy = Pick<
  typeof defaultStrings.call,
  | 'recordStarted'
  | 'recordEnded'
  | 'recordStartedAt'
  | 'recordLength'
  | 'recordCamera'
  | 'recordScreen'
  | 'recordFrames'
  | 'recordShareStoppedCamera'
  | 'recordShareStoppedScreen'
  | 'recordShareStoppedAt'
  | 'recordSharePausedCamera'
  | 'recordSharePausedScreen'
  | 'recordShareResumedCamera'
  | 'recordShareResumedScreen'
  | 'recordShareResumedAt'
>;

function timeLocale(): string {
  const device = new Intl.DateTimeFormat().resolvedOptions().locale;
  if (device.toLowerCase().startsWith(locale)) return device;
  return locale === 'zh' ? 'zh-CN' : 'en';
}

function clock(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat(timeLocale(), {
        hour: 'numeric',
        minute: '2-digit',
      }).format(date);
}

export function callRecordLines(
  record: ChannelVoiceCallRecord,
  copy: CallCopy = defaultStrings.call,
): { title: string; detail: string } {
  if (record.state === 'frames')
    return {
      title: record.source === 'camera' ? copy.recordCamera : copy.recordScreen,
      detail: copy.recordFrames(
        voiceCallDuration(record.fromMs),
        voiceCallDuration(record.toMs),
        record.frames,
      ),
    };
  if ('atMs' in record) {
    const time = voiceCallDuration(record.atMs);
    const camera = record.source === 'camera';
    if (record.state === 'share-resumed')
      return {
        title: camera ? copy.recordShareResumedCamera : copy.recordShareResumedScreen,
        detail: copy.recordShareResumedAt(time),
      };
    return {
      title:
        record.state === 'share-paused'
          ? camera
            ? copy.recordSharePausedCamera
            : copy.recordSharePausedScreen
          : camera
            ? copy.recordShareStoppedCamera
            : copy.recordShareStoppedScreen,
      detail: copy.recordShareStoppedAt(time),
    };
  }
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
