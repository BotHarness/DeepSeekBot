import './call-visual-fixtures.js';
import { describe, expect, it } from 'vitest';
import { isChannelCallVisual, isChannelMessage } from '../src/channels/channel.js';
import {
  isChannelVoiceCallRecord,
  voiceCallRecordBody,
  type ChannelVoiceCallRecord,
} from '../src/channels/voice-call-record.js';
import { callTimelineNote, callVisualNote } from '../src/runtime/bot-runtime.js';

describe('call visuals in Channel messages', () => {
  it('accepts a grid or an unchanged view and refuses anything else', () => {
    const range = { fromMs: 58_000, toMs: 80_000 };
    expect(isChannelCallVisual({ source: 'camera', frames: 4, layout: '2+2', ...range })).toBe(
      true,
    );
    expect(isChannelCallVisual({ source: 'screen', sameAs: 'human-1' })).toBe(true);
    expect(
      isChannelCallVisual({ source: 'camera', frames: 1, layout: '1', unseen: true, ...range }),
    ).toBe(true);
    expect(
      isChannelCallVisual({ source: 'camera', frames: 1, layout: '1', unseen: false, ...range }),
    ).toBe(false);
    expect(isChannelCallVisual({ source: 'camera', frames: 4, layout: '2+2' })).toBe(false);
    for (const bad of [
      { fromMs: 80_000, toMs: 58_000 },
      { fromMs: -1, toMs: 5 },
      { fromMs: 1.5, toMs: 5 },
      { fromMs: 0 },
    ])
      expect(isChannelCallVisual({ source: 'camera', frames: 4, layout: '2+2', ...bad })).toBe(
        false,
      );
    expect(isChannelCallVisual({ source: 'camera', sameAs: 'human-1', fromMs: 0, toMs: 1 })).toBe(
      false,
    );
    for (const [frames, layout] of [
      [1, '1x1'],
      [4, '2x2'],
      [9, '3x3'],
      [16, '4x4'],
      [5, '2+3'],
      [5, '3+3'],
      [10, '3+3+3'],
    ] as const)
      expect(isChannelCallVisual({ source: 'camera', frames, layout, ...range })).toBe(false);
    expect(isChannelCallVisual({ source: 'camera', unseen: true })).toBe(false);
    expect(isChannelCallVisual({ source: 'tv', frames: 1, layout: '1', ...range })).toBe(false);
    expect(
      isChannelCallVisual({ source: 'camera', frames: 1, layout: '1', extra: 1, ...range }),
    ).toBe(false);
    const message = {
      id: 'human-1',
      at: '2026-11-04T00:00:00.000Z',
      author: { kind: 'human' },
      body: '这是什么',
      voiceCall: {
        callId: 'call-0123456789abcdef',
        visual: { source: 'camera', sameAs: 'human-0' },
      },
    };
    expect(isChannelMessage(message)).toBe(true);
    expect(
      isChannelMessage({ ...message, voiceCall: { callId: 'call-0123456789abcdef', other: 1 } }),
    ).toBe(false);
    const said = { callId: 'call-0123456789abcdef', speechFromMs: 66_000, speechToMs: 80_000 };
    expect(isChannelMessage({ ...message, voiceCall: said })).toBe(true);
    expect(isChannelMessage({ ...message, voiceCall: { callId: said.callId, atMs: 70_000 } })).toBe(
      true,
    );
    for (const voiceCall of [
      { ...said, speechToMs: 1_000 },
      { callId: said.callId, speechFromMs: 66_000 },
      { ...said, speechFromMs: -5 },
      { ...said, atMs: 70_000 },
      { callId: said.callId, atMs: -1 },
      { callId: said.callId, atMs: 1.5 },
      { callId: said.callId, atMs: 70_000, speechToMs: 80_000 },
    ])
      expect(isChannelMessage({ ...message, voiceCall })).toBe(false);
  });

  it('tells the Bot where the picture is, or that it has not changed', () => {
    const image = {
      fileId: 'file:00000000-0000-4000-8000-000000000000',
      name: 'call.jpg',
      mime: 'image/jpeg',
      size: 10,
    };
    const base = {
      id: 'human-2',
      at: '2026-11-04T00:00:00.000Z',
      author: { kind: 'human' as const },
      body: '这是什么',
    };
    const grid = callVisualNote(
      'dm-mira',
      {
        ...base,
        attachments: [image],
        voiceCall: {
          callId: 'call-0123456789abcdef',
          speechFromMs: 66_000,
          speechToMs: 80_000,
          visual: { source: 'camera', frames: 5, layout: '3+2', fromMs: 58_000, toMs: 80_000 },
        },
      },
      'HINT',
    );
    expect(grid).toContain('a 3+2 grid of 5 keyframes');
    expect(grid).toContain('picture 0:58–1:20 of the call');
    expect(grid).toContain(
      'before 0:58 on this call is saved as frame records: channel_read with call call-0123456789abcdef and to_ms 58000',
    );
    expect(grid).toContain(`attachment_id ${image.fileId}`);
    expect(grid).toContain('channel_id dm-mira');
    expect(grid).toContain('HINT');
    expect(
      callVisualNote(
        'dm-mira',
        {
          ...base,
          voiceCall: {
            callId: 'call-0123456789abcdef',
            visual: { source: 'screen', sameAs: 'human-1' },
          },
        },
        'HINT',
      ),
    ).toContain('open it with channel_read_image, channel_id dm-mira and message_id human-1');
    expect(callVisualNote('dm-mira', { ...base }, 'HINT')).toBeUndefined();
    expect(
      callTimelineNote({
        callId: 'call-0123456789abcdef',
        speechFromMs: 66_000,
        speechToMs: 80_000,
        visual: { source: 'camera', frames: 5, layout: '3+2', fromMs: 58_000, toMs: 80_000 },
      }),
    ).toBe('this message 1:06–1:20, picture 0:58–1:20');
    expect(
      callTimelineNote({
        callId: 'call-0123456789abcdef',
        speechFromMs: 3_000,
        speechToMs: 4_500,
        visual: { source: 'camera', sameAs: 'human-1' },
      }),
    ).toBe('this message 0:03–0:04');
    expect(
      callTimelineNote({
        callId: 'call-0123456789abcdef',
        atMs: 84_000,
        visual: { source: 'camera', frames: 2, layout: '2', fromMs: 80_000, toMs: 83_000 },
      }),
    ).toBe('typed at 1:24, picture 1:20–1:23');
    expect(callTimelineNote({ callId: 'call-0123456789abcdef' })).toBeUndefined();
  });

  it('refuses the removed frame-record list on call messages', () => {
    const range = { fromMs: 0, toMs: 5_000 };
    expect(
      isChannelCallVisual({
        source: 'camera',
        frames: 4,
        layout: '2+2',
        records: ['r-1'],
        ...range,
      }),
    ).toBe(false);
    expect(isChannelCallVisual({ source: 'camera', sameAs: 'h-1', records: ['r-1'] })).toBe(false);
    expect(isChannelCallVisual({ source: 'camera', sameAs: 'h-1', records: [] })).toBe(false);
  });

  it('accepts frame records and refuses the removed unsaved marker', () => {
    expect(
      isChannelCallVisual({ source: 'camera', frames: 4, layout: '2+2', unsaved: false }),
    ).toBe(false);
    expect(isChannelCallVisual({ source: 'camera', frames: 4, layout: '2+2', unsaved: true })).toBe(
      false,
    );
    const record = {
      callId: 'call-0123456789abcdef',
      botSlug: 'mira',
      state: 'frames',
      startedAt: '2026-11-04T00:00:00.000Z',
      source: 'screen',
      frames: 9,
      layout: '3+3+3',
      fromMs: 12_000,
      toMs: 40_000,
    };
    expect(isChannelVoiceCallRecord(record)).toBe(true);
    expect(isChannelVoiceCallRecord({ ...record, toMs: 1_000 })).toBe(false);
    expect(isChannelVoiceCallRecord({ ...record, frames: 10 })).toBe(false);
    expect(isChannelVoiceCallRecord({ ...record, frames: 16, layout: '4x4' })).toBe(false);
    expect(isChannelVoiceCallRecord({ ...record, frames: 8 })).toBe(false);
    expect(voiceCallRecordBody(record as ChannelVoiceCallRecord)).toBe(
      'Screen record of call call-0123456789abcdef from 0:12 to 0:40: a 3+3+3 grid of 9 keyframes, oldest first.',
    );
  });
});
