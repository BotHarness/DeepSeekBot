import { describe, expect, it } from 'vitest';
import type { CallClientState } from '../../../packages/core/src/voice/call-client';
import type {
  VoiceCallReadiness,
  VoiceCallView,
} from '../../../packages/core/src/voice/call-contract';
import {
  callConfigured,
  callScreenModel,
  formatCallDuration,
  microphoneRecovery,
  readinessMessage,
} from '../src/ui/chat/call-model';
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

  it('shows live text while speaking, then the sent text for a few seconds', () => {
    const at = (seq: number, ms: number) => ({ seq, at: ms });
    const speaking = [
      { ...at(1, 8_000), type: 'speech-start' as const },
      { ...at(2, 8_500), type: 'hearing' as const, text: '明天上海' },
    ];
    expect(callScreenModel(zh, live({}, { events: speaking } as never)).heard).toEqual({
      text: '明天上海',
      final: false,
    });
    const sent = [
      ...speaking,
      { ...at(3, 9_000), type: 'transcribing' as const, audioMs: 1_000 },
      {
        ...at(4, 9_300),
        type: 'sent' as const,
        messageId: 'human-1',
        text: '明天上海会下雨吗？',
        asrMs: 200,
        streamed: true,
      },
    ];
    expect(callScreenModel(zh, live({}, { events: sent } as never)).heard).toEqual({
      text: '明天上海会下雨吗？',
      final: true,
    });
    expect(
      callScreenModel(zh, live({ durationMs: 20_000 }, { events: sent } as never)).heard,
    ).toBeUndefined();
    const missed = [
      ...speaking,
      { ...at(3, 9_000), type: 'asr-failed' as const, code: 'x', message: 'x' },
    ];
    expect(callScreenModel(zh, live({}, { events: missed } as never)).heard).toBeUndefined();
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
      callElsewhere: false,
    };
    expect(readinessMessage(en, readiness)).toBe(
      [en.call.missing.asr, en.call.missing.tts].join('\n'),
    );
    expect(readinessMessage(en, { ...readiness, ready: true, missing: [] })).toBeUndefined();
  });

  it('offers a way back when the microphone is off', () => {
    expect(microphoneRecovery(en, 'granted')).toBeUndefined();
    expect(microphoneRecovery(en, undefined)).toBeUndefined();
    expect(microphoneRecovery(en, 'denied')).toEqual({
      message: 'Calls need the microphone.',
      action: 'ask',
    });
    expect(microphoneRecovery(en, 'blocked')?.action).toBe('settings');
    expect(microphoneRecovery(zh, 'blocked')?.message).toContain('麦克风');
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

describe('callConfigured', () => {
  const readiness = (missing: VoiceCallReadiness['missing']): VoiceCallReadiness => ({
    slug: 'mira',
    ready: missing.length === 0,
    missing,
    asrProviderId: missing.includes('asr') ? null : 'asr',
    ttsProviderId: missing.includes('tts') ? null : 'tts',
    media: 'ready',
    activeCallId: null,
    callElsewhere: false,
  });
  it('offers a call only when the Host has both ASR and TTS for the Bot', () => {
    expect(callConfigured(readiness([]))).toBe(true);
    expect(callConfigured(readiness(['asr']))).toBe(false);
    expect(callConfigured(readiness(['tts']))).toBe(false);
    expect(callConfigured(readiness(['bot']))).toBe(false);
  });
  it('keeps the button when only call media is missing, so the tap explains it', () => {
    expect(callConfigured(readiness(['media-helper-missing']))).toBe(true);
  });
  it('hides the button when the Host refuses the readiness check', () => {
    expect(callConfigured({ code: 'not-found', error: 'no' })).toBe(false);
  });
  it('keeps the button on a Connect route so the tap explains the transport', () => {
    expect(callConfigured({ code: 'connect-carrier-required', error: 'connect' })).toBe(true);
  });
});
