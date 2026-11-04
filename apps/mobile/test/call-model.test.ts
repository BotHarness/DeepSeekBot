import { describe, expect, it } from 'vitest';
import type { CallClientState } from '../../../packages/core/src/voice/call-client';
import type { VoiceCallView } from '../../../packages/core/src/voice/call-contract';
import { callScreenModel, formatCallDuration, readinessMessage } from '../src/ui/chat/call-model';
import { callLinkRedirect } from '../src/ui/chat/call-link';
import { callStrings } from '../src/ui/strings';

const en = { call: callStrings.en };
const zh = { call: callStrings.zh };

const view = (patch: Partial<VoiceCallView> = {}): VoiceCallView => ({
  callId: 'call-0000000000000001',
  slug: 'mira',
  channelId: 'dm-mira',
  phase: 'listening',
  muted: false,
  busy: false,
  media: 'webrtc',
  startedAt: 0,
  durationMs: 10_000,
  events: [],
  lastSeq: 0,
  ...patch,
});
const live = (patch: Partial<VoiceCallView> = {}, extra: Partial<CallClientState> = {}) =>
  ({
    status: 'live',
    call: view(patch),
    events: [],
    muted: false,
    reconnecting: false,
    ...extra,
  }) as CallClientState;

describe('call screen model', () => {
  it('names each phase in one short line', () => {
    expect(callScreenModel(en, { status: 'opening' }).status).toBe('Connecting…');
    expect(callScreenModel(en, live()).status).toBe('Listening');
    expect(callScreenModel(en, live({ phase: 'user-speaking' })).status).toBe('Hearing you');
    expect(callScreenModel(en, live({ phase: 'bot-speaking' })).status).toBe('Speaking');
    expect(callScreenModel(en, live({}, { muted: true } as never))).toMatchObject({
      status: 'Muted',
      muted: true,
    });
    expect(callScreenModel(en, live({}, { reconnecting: true } as never)).status).toBe(
      'Reconnecting to the computer…',
    );
  });

  it('shows the busy hint on screen only', () => {
    expect(callScreenModel(zh, live({ busy: true })).hint).toBe('它在忙，下一轮会听到');
    expect(callScreenModel(en, live()).hint).toBeUndefined();
  });

  it('shows a recent miss and forgets it after a few seconds', () => {
    const events = [{ seq: 3, at: 9_000, type: 'nothing-heard' as const }];
    expect(callScreenModel(en, live({}, { events } as never)).hint).toBe(
      'Didn’t catch that. Try again.',
    );
    expect(
      callScreenModel(en, live({ durationMs: 20_000 }, { events } as never)).hint,
    ).toBeUndefined();
  });

  it('ends clearly and keeps Connect separate', () => {
    expect(
      callScreenModel(en, { status: 'ended', reason: 'connection-lost', events: [] }),
    ).toMatchObject({ live: false, retry: true, ended: expect.stringContaining('in the chat') });
    expect(
      callScreenModel(en, {
        status: 'ended',
        reason: 'refused',
        code: 'connect-carrier-required',
        error: 'x',
        events: [],
      }).ended,
    ).toBe('Calls need the same Wi-Fi as the computer, or Tailscale.');
  });

  it('shows refusals in the app language, never the Host English text', () => {
    const refused = (code: string) =>
      callScreenModel(zh, {
        status: 'ended',
        reason: 'refused',
        code: code as never,
        error: 'Bind a speech recognition (ASR) Provider to this Bot before calling it.',
        events: [],
      }).ended;
    expect(refused('asr-not-configured')).toBe(zh.call.missing.asr);
    expect(refused('media-failed')).toBe(zh.call.missing['media-unavailable']);
    expect(refused('something-new')).toBe(zh.call.ended.refused);
    expect(readinessMessage(zh, { code: 'unreachable', error: 'offline' })).toBe(
      zh.call.unreachable,
    );
  });

  it('explains which Provider is missing before a call', () => {
    const readiness = {
      slug: 'mira',
      ready: false,
      missing: ['asr', 'tts'] as const,
      asrProviderId: null,
      ttsProviderId: null,
      media: 'ready' as const,
      activeCallId: null,
    };
    expect(readinessMessage(en, readiness)).toBe(
      [en.call.missing.asr, en.call.missing.tts].join('\n'),
    );
    expect(readinessMessage(en, { ...readiness, ready: true, missing: [] })).toBeUndefined();
  });

  it('formats call time', () => {
    expect(formatCallDuration(65_400)).toBe('01:05');
    expect(formatCallDuration(3_725_000)).toBe('1:02:05');
  });
});

describe('call links', () => {
  it('turns a call link into the DM so a call always starts from a tap', () => {
    expect(callLinkRedirect('deepseekbot://call/mira?hostId=h1', false)).toBe('/dm/mira?hostId=h1');
    expect(callLinkRedirect('deepseekbot://call/mira?script=x&hostId=a%20b#top', false)).toBe(
      '/dm/mira?hostId=a%20b',
    );
    expect(callLinkRedirect('/call/mira', false)).toBe('/dm/mira');
    expect(callLinkRedirect('deepseekbot-dev://call/mira?script=x', true)).toBeUndefined();
    expect(callLinkRedirect('/dm/mira', false)).toBeUndefined();
  });
});
