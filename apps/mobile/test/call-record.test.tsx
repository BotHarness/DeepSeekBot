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

it('reads a silent frame record as camera or screen activity with its time range', () => {
  const frames = {
    callId: 'call-0123456789abcdef',
    botSlug: 'mira',
    state: 'frames',
    startedAt: '2026-11-04T10:00:00.000Z',
    source: 'screen',
    frames: 9,
    layout: '3+3+3',
    fromMs: 12_000,
    toMs: 40_000,
  } as const;
  expect(activityOf(message(frames))).toEqual({ kind: 'voice-call', record: frames });
  expect(callRecordLines(frames, callStrings.en)).toEqual({
    title: 'Screen while you were silent',
    detail: '0:12–0:40 · 9 keyframes',
  });
});

it('reads a share the system stopped as a voice-only note', () => {
  const stopped = {
    callId: 'call-0123456789abcdef',
    botSlug: 'mira',
    state: 'share-stopped',
    startedAt: '2026-11-04T10:00:00.000Z',
    source: 'screen',
    atMs: 95_000,
  } as const;
  expect(activityOf(message(stopped))).toEqual({ kind: 'voice-call', record: stopped });
  expect(callRecordLines(stopped, callStrings.en)).toEqual({
    title: 'Screen sharing stopped',
    detail: 'Voice only from 1:35',
  });
  expect(callRecordPreview({ ...stopped, source: 'camera' }, callStrings.zh)).toBe(
    '摄像头已断开 · 1:35 起仅语音',
  );
});
