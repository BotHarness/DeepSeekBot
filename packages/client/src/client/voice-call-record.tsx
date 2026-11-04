import type { ReactElement } from 'react';

import { voiceCallDuration } from '../../../core/src/channels/voice-call-record.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ChannelMessage } from './store.js';

type CallRecord = NonNullable<ChannelMessage['voiceCallRecord']>;

function clock(at: string, t: BotHarnessTranslate): string {
  return new Date(at).toLocaleTimeString(t('main.date.locale'), {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function recordLines(record: CallRecord, t: BotHarnessTranslate): [string, string] {
  if (record.state === 'frames')
    return [
      t(record.source === 'camera' ? 'call.recordCamera' : 'call.recordScreen'),
      t('call.recordFrames', {
        from: voiceCallDuration(record.fromMs),
        to: voiceCallDuration(record.toMs),
        frames: String(record.frames),
      }),
    ];
  return record.state === 'started'
    ? [t('call.recordStarted'), t('call.recordStartedAt', { time: clock(record.startedAt, t) })]
    : [
        t('call.recordEnded'),
        t('call.recordLength', { time: voiceCallDuration(record.durationMs) }),
      ];
}

export function voiceCallRecordText(record: CallRecord, t: BotHarnessTranslate): string {
  if (record.state === 'frames') return recordLines(record, t).join(' · ');
  return record.state === 'started'
    ? `${t('call.recordStarted')} · ${t('call.recordStartedAt', { time: clock(record.startedAt, t) })}`
    : `${t('call.recordEnded')} · ${t('call.recordLength', { time: voiceCallDuration(record.durationMs) })}`;
}

export function VoiceCallRecordBubble({
  messageId,
  record,
  t,
}: {
  messageId: string;
  record: CallRecord;
  t: BotHarnessTranslate;
}): ReactElement {
  const started = record.state === 'started';
  const [title, detail] = recordLines(record, t);
  return (
    <div
      className="bh-call-record"
      data-message-id={messageId}
      data-state={record.state}
      role="note"
      aria-label={`${title}, ${detail}`}
    >
      <span className="bh-call-record-icon" aria-hidden="true">
        <ChannelSidebarIcon
          name={
            record.state === 'frames'
              ? record.source === 'camera'
                ? 'video'
                : 'monitor'
              : started
                ? 'phone'
                : 'phone-off'
          }
        />
      </span>
      <span className="bh-call-record-text">
        <span className="bh-call-record-title">{title}</span>
        <span className="bh-call-record-detail">{detail}</span>
      </span>
    </div>
  );
}
