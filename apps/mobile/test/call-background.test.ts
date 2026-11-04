import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

import type { CallClientState } from '../../../packages/core/src/voice/call-client';
import type { VoiceCallView } from '../../../packages/core/src/voice/call-contract';
import { createCallAudioRoutePreference } from '../src/host/call-audio-route';
import {
  createCallActivity,
  type CallActivityHandle,
  type CallActivityProps,
} from '../src/ui/chat/call-activity';
import { callActivityPhase, callScreenModel } from '../src/ui/chat/call-model';
import { callStrings } from '../src/ui/strings';

const require = createRequire(import.meta.url);
const withLocalComputerVideo = require('../modules/local-computer-video/app.plugin.js');

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

describe('background call audio mode', () => {
  const infoPlist = async (modResults: Record<string, unknown>) => {
    const config = withLocalComputerVideo({
      name: 'Tobs',
      slug: 'tobs',
      mods: {
        ios: {
          infoPlist: (mod: unknown) => mod,
          podfile: (mod: unknown) => mod,
        },
      },
    });
    const result = await config.mods.ios.infoPlist({
      ...config,
      modRequest: {
        platform: 'ios',
        modName: 'infoPlist',
        projectRoot: '/qa/mobile',
      },
      modResults,
    });
    return result.modResults as { UIBackgroundModes?: string[] };
  };

  it('declares the audio background mode once, next to other modes', async () => {
    expect((await infoPlist({})).UIBackgroundModes).toEqual(['audio']);
    expect(
      (await infoPlist({ UIBackgroundModes: ['remote-notification'] })).UIBackgroundModes,
    ).toEqual(['remote-notification', 'audio']);
    expect((await infoPlist({ UIBackgroundModes: ['audio'] })).UIBackgroundModes).toEqual([
      'audio',
    ]);
  });
});

describe('call audio route preference', () => {
  it('starts on the speaker and remembers the last choice', async () => {
    const writes: string[] = [];
    const preference = createCallAudioRoutePreference({
      read: async () => undefined,
      write: (route) => writes.push(route),
    });
    await preference.ready;
    expect(preference.getSnapshot()).toMatchObject({
      route: 'speaker',
      loaded: true,
    });
    preference.setRoute('media');
    preference.setRoute('media');
    expect(preference.getSnapshot().route).toBe('media');
    expect(writes).toEqual(['media']);
  });

  it('reads a saved route, and ignores a value it does not know', async () => {
    const saved = createCallAudioRoutePreference({
      read: async () => 'receiver',
      write() {},
    });
    await saved.ready;
    expect(saved.getSnapshot().route).toBe('receiver');

    const odd = createCallAudioRoutePreference({
      read: async () => 'loud',
      write() {},
    });
    await odd.ready;
    expect(odd.getSnapshot()).toMatchObject({
      route: 'speaker',
      storageError: true,
    });
  });

  it('keeps a choice made before the saved one loads', async () => {
    let finish: (value: unknown) => void = () => undefined;
    const writes: string[] = [];
    const preference = createCallAudioRoutePreference({
      read: () => new Promise((resolve) => (finish = resolve)),
      write: (route) => writes.push(route),
    });
    preference.setRoute('media');
    finish('receiver');
    await preference.ready;
    expect(preference.getSnapshot().route).toBe('media');
    expect(writes).toEqual(['media']);
  });
});

describe('interrupted call', () => {
  it('stays live and explains the pause in place of other hints', () => {
    const model = callScreenModel(en, live({ busy: true }), {
      interrupted: true,
    });
    expect(model).toMatchObject({ live: true, status: 'Listening' });
    expect(model.hint).toBe('Paused by another call or app. It resumes when that ends.');
    expect(callScreenModel(zh, live(), { interrupted: true }).hint).toBe(
      '被其他通话或 App 打断，结束后自动恢复',
    );
  });
});

describe('call Live Activity', () => {
  it('follows the call phase and ends with the call', () => {
    expect(callActivityPhase({ status: 'idle' }, false)).toBeUndefined();
    expect(callActivityPhase({ status: 'opening' }, false)).toBe('connecting');
    expect(callActivityPhase(live(), false)).toBe('listening');
    expect(callActivityPhase(live({}, { muted: true }), false)).toBe('muted');
    expect(callActivityPhase(live({ phase: 'user-speaking' }), false)).toBe('hearing');
    expect(callActivityPhase(live({ phase: 'transcribing' }), false)).toBe('thinking');
    expect(callActivityPhase(live({ phase: 'bot-speaking' }), false)).toBe('speaking');
    expect(callActivityPhase(live({}, { reconnecting: true }), false)).toBe('reconnecting');
    expect(callActivityPhase(live({ phase: 'bot-speaking' }), true)).toBe('interrupted');
    expect(
      callActivityPhase({ status: 'ended', reason: 'hangup', events: [] }, false),
    ).toBeUndefined();
  });

  const props = (patch: Partial<CallActivityProps> = {}): CallActivityProps => ({
    name: 'Mira',
    phase: 'listening',
    startedAt: 1_000,
    muted: false,
    locale: 'en',
    ...patch,
  });

  const fake = () => {
    const updates: CallActivityProps[] = [];
    const end = vi.fn(async () => undefined);
    let resolve: (handle: CallActivityHandle | undefined) => void = () => undefined;
    const start = vi.fn(
      () =>
        new Promise<CallActivityHandle | undefined>((done) => {
          resolve = done;
        }),
    );
    const handle: CallActivityHandle = {
      update: async (next) => {
        updates.push(next);
      },
      end,
    };
    return { updates, end, start, handle, open: () => resolve(handle) };
  };
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('starts once, then updates only when what it shows changes', async () => {
    const native = fake();
    const activity = createCallActivity({ start: native.start });
    activity.sync(props({ phase: 'connecting' }));
    activity.sync(props({ phase: 'listening' }));
    native.open();
    await flush();
    expect(native.start).toHaveBeenCalledTimes(1);
    expect(native.updates).toEqual([props({ phase: 'listening' })]);
    activity.sync(props({ phase: 'listening' }));
    activity.sync(props({ phase: 'speaking' }));
    await flush();
    expect(native.updates.map((update) => update.phase)).toEqual(['listening', 'speaking']);
    activity.sync(undefined);
    expect(native.end).toHaveBeenCalledTimes(1);
    activity.sync(props());
    expect(native.start).toHaveBeenCalledTimes(1);
  });

  it('sends one update at a time so the latest phase is the one left showing', async () => {
    const native = fake();
    const applied: CallActivityProps[] = [];
    const waiting: (() => void)[] = [];
    native.handle.update = (next) =>
      new Promise<void>((done) => {
        waiting.push(() => {
          applied.push(next);
          done();
        });
      });
    const activity = createCallActivity({ start: native.start });
    activity.sync(props({ phase: 'hearing' }));
    native.open();
    await flush();
    activity.sync(props({ phase: 'speaking' }));
    activity.sync(props({ phase: 'listening' }));
    expect(waiting).toHaveLength(1);
    waiting.shift()?.();
    await flush();
    expect(waiting).toHaveLength(1);
    waiting.shift()?.();
    await flush();
    expect(waiting).toHaveLength(0);
    expect(applied.map((update) => update.phase)).toEqual(['speaking', 'listening']);
  });

  it('ends an activity that finishes starting after the call ended', async () => {
    const native = fake();
    const activity = createCallActivity({ start: native.start });
    activity.sync(props());
    activity.end();
    native.open();
    await flush();
    expect(native.end).toHaveBeenCalledTimes(1);
    expect(native.updates).toEqual([]);
  });

  it('leaves the call alone where Live Activities are unavailable or fail', async () => {
    const missingStart = vi.fn(async () => undefined);
    const missing = createCallActivity({ start: missingStart });
    missing.sync(props());
    await flush();
    missing.sync(props({ phase: 'speaking' }));
    missing.end();
    expect(missingStart).toHaveBeenCalledTimes(1);

    const failingStart = vi.fn(async () => {
      throw new Error('ActivityKit refused');
    });
    const failing = createCallActivity({ start: failingStart });
    failing.sync(props());
    await flush();
    failing.sync(props({ phase: 'speaking' }));
    failing.end();
    expect(failingStart).toHaveBeenCalledTimes(1);
  });
});
