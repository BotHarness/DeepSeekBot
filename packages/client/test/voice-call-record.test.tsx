import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import { parseChannelMessage } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { VoiceCallRecordBubble, voiceCallRecordText } from '../src/client/voice-call-record.js';

const base = {
  at: '2026-11-04T10:12:04.000Z',
  author: { kind: 'system' },
};
const started = {
  ...base,
  id: 'voice-call-started-call-0123456789abcdef',
  body: 'Voice call call-0123456789abcdef started at 2026-11-04T10:00:00.000Z.',
  voiceCallRecord: {
    callId: 'call-0123456789abcdef',
    botSlug: 'mira',
    state: 'started',
    startedAt: '2026-11-04T10:00:00.000Z',
  },
};
const ended = {
  ...base,
  id: 'voice-call-ended-call-0123456789abcdef',
  body: 'Voice call ended.',
  voiceCallRecord: {
    callId: 'call-0123456789abcdef',
    botSlug: 'mira',
    state: 'ended',
    startedAt: '2026-11-04T10:00:00.000Z',
    endedAt: '2026-11-04T10:12:04.000Z',
    durationMs: 724_000,
    reason: 'hangup',
    heard: 6,
  },
};

it('keeps call notices from the Host and drops forged or malformed ones', () => {
  expect(parseChannelMessage(started)?.voiceCallRecord).toEqual(started.voiceCallRecord);
  expect(parseChannelMessage(ended)?.voiceCallRecord).toEqual(ended.voiceCallRecord);
  expect(parseChannelMessage({ ...ended, author: { kind: 'human' } })).toBeUndefined();
  expect(
    parseChannelMessage({
      ...ended,
      voiceCallRecord: { ...ended.voiceCallRecord, durationMs: -1 },
    }),
  ).toBeUndefined();
});

it('shows the start time and the call length in the bubble and the chat preview', () => {
  const end = parseChannelMessage(ended)!.voiceCallRecord!;
  expect(voiceCallRecordText(end, zhTranslate)).toBe('语音通话结束 · 时长 12:04');
  const html = renderToStaticMarkup(
    <VoiceCallRecordBubble messageId="m" record={end} t={zhTranslate} />,
  );
  expect(html).toContain('data-state="ended"');
  expect(html).toContain('语音通话结束');
  expect(html).toContain('时长 12:04');
  const start = parseChannelMessage(started)!.voiceCallRecord!;
  expect(voiceCallRecordText(start, zhTranslate)).toMatch(/^语音通话开始 · 开始于 \d{2}:\d{2}$/u);
});
