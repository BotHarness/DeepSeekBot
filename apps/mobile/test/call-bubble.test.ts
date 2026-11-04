import { describe, expect, it, vi } from 'vitest';

import type { CallClientState } from '../../../packages/core/src/voice/call-client';
import type { VoiceCallView } from '../../../packages/core/src/voice/call-contract';
import { callBubbleModel } from '../src/ui/chat/call-model';
import { createCallSessions, type CallControls } from '../src/ui/chat/call-session';
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
const live = (patch: Partial<VoiceCallView> = {}, extra: Record<string, unknown> = {}) =>
  ({
    status: 'live',
    call: view(patch),
    events: [],
    muted: false,
    reconnecting: false,
    ...extra,
  }) as CallClientState;

const controls = () =>
  ({
    mute: vi.fn(),
    hangup: vi.fn(),
    choose: vi.fn(async () => null),
  }) satisfies CallControls;

describe('call session store (#3468)', () => {
  it('keeps a running call when the call screen is minimized and reopens it without dialing', () => {
    const sessions = createCallSessions();
    expect(sessions.open({ slug: 'mira' })).toBe('started');
    const key = sessions.getSnapshot()!.key;
    const call = controls();
    sessions.attach(key, call);
    sessions.publish(key, { microphone: 'granted', state: live() });

    sessions.minimize(key);
    expect(sessions.getSnapshot()).toMatchObject({ key, expanded: false });
    expect(call.hangup).not.toHaveBeenCalled();

    expect(sessions.open({ slug: 'mira' })).toBe('joined');
    expect(sessions.getSnapshot()).toMatchObject({
      key,
      expanded: true,
      attempt: 0,
    });
  });

  it('hangs up and forgets the call on close', () => {
    const sessions = createCallSessions();
    sessions.open({ slug: 'mira', hostId: 'h1' });
    const key = sessions.getSnapshot()!.key;
    const call = controls();
    sessions.attach(key, call);
    sessions.close(key);
    expect(call.hangup).toHaveBeenCalledOnce();
    expect(sessions.getSnapshot()).toBeUndefined();
    sessions.minimize(key);
    expect(sessions.getSnapshot()).toBeUndefined();
  });

  it('drops an ended call or one still waiting for the microphone instead of minimizing it', () => {
    const sessions = createCallSessions();
    sessions.open({ slug: 'mira' });
    const key = sessions.getSnapshot()!.key;
    sessions.publish(key, {
      microphone: 'granted',
      state: { status: 'ended', reason: 'hangup', events: [] },
    });
    sessions.minimize(key);
    expect(sessions.getSnapshot()).toBeUndefined();

    sessions.open({ slug: 'mira' });
    const waiting = sessions.getSnapshot()!.key;
    sessions.publish(waiting, { microphone: 'blocked' });
    sessions.minimize(waiting);
    expect(sessions.getSnapshot()).toBeUndefined();
  });

  it('keeps an ended call behind the bubble when it ends while minimized', () => {
    const sessions = createCallSessions();
    sessions.open({ slug: 'mira' });
    const key = sessions.getSnapshot()!.key;
    sessions.publish(key, { microphone: 'granted', state: live() });
    sessions.minimize(key);
    sessions.publish(key, {
      state: { status: 'ended', reason: 'connection-lost', events: [] },
    });
    expect(sessions.getSnapshot()).toMatchObject({
      expanded: false,
      state: { status: 'ended' },
    });
  });

  it('hangs up the current call before calling another Bot', () => {
    const sessions = createCallSessions();
    sessions.open({ slug: 'mira' });
    const first = sessions.getSnapshot()!.key;
    const call = controls();
    sessions.attach(first, call);
    expect(sessions.open({ slug: 'kai' })).toBe('started');
    expect(call.hangup).toHaveBeenCalledOnce();
    expect(sessions.getSnapshot()).toMatchObject({
      request: { slug: 'kai' },
      expanded: true,
    });
    expect(sessions.controls()).toBeUndefined();
    sessions.publish(first, { state: live() });
    expect(sessions.getSnapshot()!.state).toEqual({ status: 'idle' });
  });

  it('treats the same Bot on another computer as another call', () => {
    const sessions = createCallSessions();
    sessions.open({ slug: 'mira', hostId: 'a' });
    expect(sessions.open({ slug: 'mira', hostId: 'b' })).toBe('started');
  });

  it('retries with a fresh attempt', () => {
    const sessions = createCallSessions();
    sessions.open({ slug: 'mira' });
    const key = sessions.getSnapshot()!.key;
    sessions.publish(key, {
      microphone: 'denied',
      startedAt: 5,
      state: { status: 'ended', reason: 'hangup', events: [] },
    });
    sessions.retry(key);
    expect(sessions.getSnapshot()).toMatchObject({
      attempt: 1,
      state: { status: 'idle' },
      startedAt: undefined,
      microphone: undefined,
    });
  });

  it('notifies subscribers', () => {
    const sessions = createCallSessions();
    const listener = vi.fn();
    const remove = sessions.subscribe(listener);
    sessions.open({ slug: 'mira' });
    remove();
    sessions.minimize(sessions.getSnapshot()!.key);
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe('floating call bubble model (#3468)', () => {
  it('maps call phases to ring tones and keeps the time running', () => {
    const at = (state: CallClientState, interrupted = false) =>
      callBubbleModel(en, { state, interrupted, startedAt: 1_000 }, 66_000);
    expect(at({ status: 'opening' })).toMatchObject({
      tone: 'connecting',
      muted: false,
    });
    expect(at(live())).toEqual({
      tone: 'listening',
      status: 'Listening',
      muted: false,
      duration: '01:05',
    });
    expect(at(live({ phase: 'user-speaking' })).tone).toBe('hearing');
    expect(at(live({ phase: 'transcribing' })).tone).toBe('thinking');
    expect(at(live({ phase: 'bot-speaking' })).tone).toBe('speaking');
    expect(at(live({}, { muted: true }))).toMatchObject({
      tone: 'muted',
      muted: true,
    });
    expect(at(live({}, { reconnecting: true })).tone).toBe('connecting');
    expect(at(live(), true)).toMatchObject({
      tone: 'paused',
      status: 'Paused',
    });
    expect(at({ status: 'ended', reason: 'hangup', events: [] })).toEqual({
      tone: 'ended',
      status: 'Call ended',
      muted: false,
    });
  });

  it('names the Bot, status and time for screen readers in both languages', () => {
    expect(en.call.bubble('Mira', 'Listening', '01:05')).toBe(
      'Back to call with Mira. Listening. 01:05',
    );
    expect(zh.call.bubble('Mira', '在听', undefined)).toBe('回到与 Mira 的通话，在听');
  });
});
