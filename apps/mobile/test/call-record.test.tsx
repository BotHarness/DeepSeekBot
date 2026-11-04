// @vitest-environment jsdom
import { vi, expect, it } from 'vitest';

vi.mock('react-native', async () => await import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, Circle: () => null }));

import { activityOf } from '../src/host/channel-activity';
import type { ChannelWireMessage } from '../src/host/wire';
import { callRecordLines, callRecordPreview } from '../src/ui/chat/call-record-text';
import { callStrings } from '../src/ui/strings';

const started = {
  callId: 'call-0123456789abcdef',
  botSlug: 'mira',
  state: 'started',
  startedAt: '2026-11-04T10:00:00.000Z',
} as const;
const ended = {
  ...started,
  state: 'ended',
  endedAt: '2026-11-04T10:12:04.000Z',
  durationMs: 724_000,
  reason: 'hangup',
  heard: 6,
} as const;
const message = (voiceCallRecord: unknown, kind = 'system') =>
  ({
    id: 'voice-call',
    at: '2026-11-04T10:12:04.000Z',
    body: 'Voice call ended.',
    author: { kind },
    voiceCallRecord,
  }) as unknown as ChannelWireMessage;

it('reads Host call notices as call activity and ignores forged ones', () => {
  expect(activityOf(message(ended))).toEqual({ kind: 'voice-call', record: ended });
  expect(activityOf(message(started))).toEqual({ kind: 'voice-call', record: started });
  expect(activityOf(message(ended, 'human'))).toBeUndefined();
  expect(activityOf(message({ ...ended, durationMs: 'long' }))).toBeUndefined();
});

it('shows the start time and the call length in the Human’s language', () => {
  expect(callRecordLines(ended, callStrings.zh)).toEqual({
    title: '语音通话结束',
    detail: '时长 12:04',
  });
  expect(callRecordPreview(ended, callStrings.en)).toBe('Voice call ended · Lasted 12:04');
  expect(callRecordLines(started, callStrings.zh).title).toBe('语音通话开始');
  expect(callRecordLines(started, callStrings.en).detail).toMatch(/^Started \d/u);
});
