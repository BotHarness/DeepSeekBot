import { describe, expect, it } from 'vitest';

import type { CallClientState } from '../src/voice/call-client.js';
import type {
  VoiceCallEvent,
  VoiceCallReadiness,
  VoiceCallView,
} from '../src/voice/call-contract.js';
import {
  CALL_TRANSIENT_MS,
  callEndView,
  callLiveView,
  callReadinessVerdict,
  callRefusalNotice,
  formatCallDuration,
} from '../src/voice/call-view.js';

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

const live = (
  patch: Partial<VoiceCallView> = {},
  extra: { muted?: boolean; reconnecting?: boolean; events?: VoiceCallEvent[] } = {},
): CallClientState => ({
  status: 'live',
  call: view(patch),
  events: extra.events ?? [],
  muted: extra.muted ?? false,
  reconnecting: extra.reconnecting ?? false,
  syncedAt: 50_000,
});

const readiness = (patch: Partial<VoiceCallReadiness> = {}): VoiceCallReadiness => ({
  slug: 'mira',
  ready: true,
  missing: [],
  asrProviderId: 'asr',
  ttsProviderId: 'tts',
  media: 'ready',
  activeCallId: null,
  callElsewhere: false,
  ...patch,
});

describe('call view: live call', () => {
  it('names what the call is doing', () => {
    expect(callLiveView({ status: 'idle' })).toBeUndefined();
    expect(callLiveView({ status: 'opening' })).toMatchObject({
      activity: 'connecting',
      connected: false,
      durationMs: 0,
    });
    expect(callLiveView(live({ phase: 'connecting' }))).toMatchObject({
      activity: 'connecting',
      connected: false,
      durationMs: 0,
    });
    expect(callLiveView(live())?.activity).toBe('listening');
    expect(callLiveView(live({ phase: 'user-speaking' }))?.activity).toBe('hearing');
    expect(callLiveView(live({ phase: 'transcribing' }))?.activity).toBe('thinking');
    expect(callLiveView(live({ phase: 'bot-speaking' }))?.activity).toBe('speaking');
    expect(callLiveView(live({}, { muted: true }))).toMatchObject({
      activity: 'muted',
      tone: 'muted',
      muted: true,
    });
    expect(callLiveView(live({}, { reconnecting: true }))).toMatchObject({
      activity: 'reconnecting',
      tone: 'warning',
    });
  });

  it('takes the call time from the Host clock once connected', () => {
    expect(callLiveView(live({ durationMs: 65_400 }))).toMatchObject({
      connected: true,
      durationMs: 65_400,
    });
  });

  it('shows busy, but not while the Bot speaks', () => {
    expect(callLiveView(live({ busy: true }))).toMatchObject({ hint: 'busy', tone: 'busy' });
    expect(callLiveView(live({ busy: true, phase: 'user-speaking' }))?.hint).toBe('busy');
    expect(callLiveView(live({ busy: true, phase: 'bot-speaking' }))).toMatchObject({
      activity: 'speaking',
      hint: undefined,
      tone: 'live',
    });
  });

  it('shows a recent problem while listening, then forgets it', () => {
    const at = 9_000;
    const missed = [{ seq: 3, at, type: 'nothing-heard' as const }];
    expect(callLiveView(live({}, { events: missed }))).toMatchObject({
      hint: 'not-heard',
      tone: 'warning',
    });
    expect(
      callLiveView(live({ durationMs: at + CALL_TRANSIENT_MS + 1 }, { events: missed }))?.hint,
    ).toBeUndefined();
    expect(
      callLiveView(live({ phase: 'user-speaking' }, { events: missed }))?.hint,
    ).toBeUndefined();
    const problems = [
      ['asr-failed', 'asr-failed'],
      ['send-failed', 'send-failed'],
      ['playback-failed', 'play-failed'],
    ] as const;
    for (const [type, hint] of problems)
      expect(
        callLiveView(live({}, { events: [{ seq: 1, at, type, code: 'x', message: 'x' } as never] }))
          ?.hint,
      ).toBe(hint);
  });

  it('ages a problem on the phone clock between Host updates', () => {
    const events: VoiceCallEvent[] = [{ seq: 3, at: 9_000, type: 'nothing-heard' }];
    const state = live({}, { events });
    expect(callLiveView(state, { now: 52_000 })?.hint).toBe('not-heard');
    expect(callLiveView(state, { now: 54_500 })?.hint).toBeUndefined();
    expect(callLiveView(state, { now: 40_000 })?.hint).toBe('not-heard');
  });

  it('drops a problem once a later turn went through', () => {
    const events = [
      { seq: 1, at: 8_000, type: 'nothing-heard' as const },
      {
        seq: 2,
        at: 9_000,
        type: 'sent' as const,
        messageId: 'human-1',
        text: 'hi',
        asrMs: 1,
        streamed: true,
      },
    ];
    expect(callLiveView(live({}, { events }))?.hint).toBeUndefined();
  });

  it('shows live text while speaking, then the sent text for a few seconds', () => {
    const speaking: VoiceCallEvent[] = [
      { seq: 1, at: 8_000, type: 'speech-start' },
      { seq: 2, at: 8_500, type: 'hearing', text: '明天上海' },
    ];
    expect(callLiveView(live({}, { events: speaking }))?.heard).toEqual({
      text: '明天上海',
      final: false,
    });
    const sent: VoiceCallEvent[] = [
      ...speaking,
      { seq: 3, at: 9_000, type: 'transcribing', audioMs: 1_000 },
      {
        seq: 4,
        at: 9_300,
        type: 'sent',
        messageId: 'human-1',
        text: '明天上海会下雨吗？',
        asrMs: 200,
        streamed: true,
      },
    ];
    expect(callLiveView(live({}, { events: sent }))?.heard).toEqual({
      text: '明天上海会下雨吗？',
      final: true,
    });
    expect(callLiveView(live({ durationMs: 20_000 }, { events: sent }))?.heard).toBeUndefined();
    const missed: VoiceCallEvent[] = [
      ...speaking,
      { seq: 3, at: 9_000, type: 'asr-failed', code: 'x', message: 'x' } as VoiceCallEvent,
    ];
    expect(callLiveView(live({}, { events: missed }))?.heard).toBeUndefined();
  });
});

describe('call view: readiness', () => {
  it('lets the Human dial only when ready and no call runs elsewhere', () => {
    expect(callReadinessVerdict(readiness())).toEqual({
      dial: true,
      offered: true,
      blocked: undefined,
      notices: [],
    });
    expect(callReadinessVerdict(readiness({ callElsewhere: true }))).toEqual({
      dial: false,
      offered: true,
      blocked: 'elsewhere',
      notices: ['elsewhere'],
    });
  });

  it('names every missing piece and hides the button only for missing setup', () => {
    expect(
      callReadinessVerdict(readiness({ ready: false, missing: ['asr', 'local-voice-off'] })),
    ).toEqual({
      dial: false,
      offered: false,
      blocked: 'missing',
      notices: ['missing.asr', 'missing.local-voice-off'],
    });
    expect(
      callReadinessVerdict(readiness({ ready: false, missing: ['media-helper-missing'] })).offered,
    ).toBe(true);
  });

  it('turns a refused readiness check into one notice', () => {
    expect(callReadinessVerdict({ code: 'unreachable', error: 'offline' })).toEqual({
      dial: false,
      offered: false,
      blocked: 'refused',
      notices: ['unreachable'],
    });
    expect(
      callReadinessVerdict({ code: 'connect-carrier-required', error: 'connect' }),
    ).toMatchObject({ offered: true, notices: ['connect-only'] });
  });

  it('groups Host refusal codes', () => {
    expect(callRefusalNotice('asr-not-configured')).toBe('missing.asr');
    expect(callRefusalNotice('tts-not-configured')).toBe('missing.tts');
    expect(callRefusalNotice('unknown-bot')).toBe('missing.bot');
    expect(callRefusalNotice('bot-paused')).toBe('ended.bot-unavailable');
    for (const code of ['media-failed', 'not-ready', 'queue-full', 'operation-timeout'])
      expect(callRefusalNotice(code)).toBe('missing.media-unavailable');
    expect(callRefusalNotice('call-active')).toBe('elsewhere');
    expect(callRefusalNotice('something-new')).toBe('refused');
    expect(callRefusalNotice(undefined)).toBe('refused');
  });
});

describe('call view: ended call', () => {
  it('explains why a call ended, and says nothing after a hang-up', () => {
    expect(callEndView(live())).toBeUndefined();
    expect(callEndView({ status: 'ended', reason: 'hangup', events: [] })).toEqual({
      refused: false,
      notice: undefined,
      retry: true,
    });
    expect(callEndView({ status: 'ended', reason: 'connection-lost', events: [] })?.notice).toBe(
      'ended.connection-lost',
    );
    expect(callEndView({ status: 'ended', reason: 'replaced', events: [] })).toMatchObject({
      notice: 'ended.replaced',
      retry: false,
    });
    expect(
      callEndView({
        status: 'ended',
        reason: 'refused',
        code: 'call-active',
        error: 'x',
        events: [],
      }),
    ).toEqual({ refused: true, notice: 'elsewhere', retry: true });
  });

  it('puts a microphone problem before the end reason', () => {
    expect(
      callEndView({
        status: 'ended',
        reason: 'media-failed',
        error: 'microphone-denied',
        events: [],
      })?.notice,
    ).toBe('microphone-denied');
    expect(
      callEndView({
        status: 'ended',
        reason: 'media-failed',
        error: 'microphone-missing',
        events: [],
      })?.notice,
    ).toBe('microphone-missing');
  });
});

describe('call duration', () => {
  it('formats one way on every Client and in Bot context', () => {
    expect(formatCallDuration(0)).toBe('0:00');
    expect(formatCallDuration(-5)).toBe('0:00');
    expect(formatCallDuration(5_999)).toBe('0:05');
    expect(formatCallDuration(65_400)).toBe('1:05');
    expect(formatCallDuration(3_725_000)).toBe('1:02:05');
  });
});
