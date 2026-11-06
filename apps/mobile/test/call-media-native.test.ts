import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  callAudioSupported: true,
  callAudioModeSupported: false,
  callAudioMode: vi.fn(async (_attempt: string, music: boolean) => ({ ...route, music })),
  callStart: vi.fn(async () => 'answer'),
  callMute: vi.fn(),
  callAudio: vi.fn(async () => route),
  callAudioState: vi.fn(async () => route),
  callStop: vi.fn(async () => null),
  addListener: vi.fn((name: string, listener: (event: unknown) => void) => {
    listeners.set(name, listener);
    return { remove: () => listeners.delete(name) };
  }),
}));
const listeners = new Map<string, (event: unknown) => void>();
const route = {
  output: 'speaker',
  outputs: [{ id: 'speaker', kind: 'speaker', name: '' }],
  microphone: 'iphone',
  microphones: [{ id: 'iphone', kind: 'phone', name: '' }],
  music: false,
};

vi.mock('expo', () => ({ requireOptionalNativeModule: () => native }));
vi.mock('expo-audio', () => ({
  getRecordingPermissionsAsync: vi.fn(),
  requestRecordingPermissionsAsync: vi.fn(),
}));

import { createCallMedia } from '../src/host/call-media-native';

beforeEach(() => {
  vi.clearAllMocks();
  listeners.clear();
  native.callAudioSupported = true;
  native.callAudioModeSupported = false;
});

describe('native call audio capability', () => {
  it('restores the saved headset input request and forwards refusal without inventing a selected microphone', async () => {
    const media = createCallMedia({ audio: () => ({ headsetMicrophone: 'iphone' }) });
    const changed = vi.fn();
    media?.audio?.onChange(changed);
    await media?.start({ callId: 'mic-call', offer: 'offer' });
    expect(native.callStart).toHaveBeenCalledWith('mic-call', 'offer', false, 'iphone');
    const rejected = {
      ...route,
      selectionFailed: true,
      microphoneConfirmed: true,
      microphones: [...route.microphones, { id: 'headset', kind: 'bluetooth', name: 'Headset' }],
    };
    listeners.get('onCallAudio')?.({ attemptId: 'mic-call', route: rejected });
    expect(changed).toHaveBeenLastCalledWith({ interrupted: false, route: rejected });
    listeners.get('onCallAudio')?.({
      attemptId: 'mic-call',
      route: { ...route, microphoneConfirmed: false, selectionFailed: false },
    });
    expect(changed.mock.lastCall?.[0].route.microphoneConfirmed).toBe(false);
    media?.stop();
  });

  it('exposes playback modes only when native supports them and scopes changes to the active call', async () => {
    expect(createCallMedia()?.audio?.mode).toBeUndefined();
    native.callAudioModeSupported = true;
    const media = createCallMedia();
    await media?.start({ callId: 'mode-call', offer: 'offer' });
    expect(await media?.audio?.mode?.(true)).toEqual({ ...route, music: true });
    expect(native.callAudioMode).toHaveBeenCalledWith('mode-call', true);
    media?.stop();
    expect(await media?.audio?.mode?.(false)).toBeNull();
    expect(native.callAudioMode).toHaveBeenCalledTimes(1);
  });

  it('keeps the new start signature on Android versions without selectable routes', async () => {
    native.callAudioSupported = false;
    const media = createCallMedia();
    expect(media?.audio).toBeUndefined();
    await media?.start({ callId: 'one', offer: 'offer' });
    expect(native.callStart).toHaveBeenCalledWith('one', 'offer', false, 'headset');
  });

  it('accepts confirmed Android routes and ignores events from a previous attempt', async () => {
    const media = createCallMedia();
    const changed = vi.fn();
    const unsubscribe = media?.audio?.onChange(changed);
    await media?.start({ callId: 'one', offer: 'offer' });
    expect(await media?.audio?.state()).toEqual(route);
    await media?.start({ callId: 'two', offer: 'offer' });
    listeners.get('onCallAudio')?.({ attemptId: 'one', route });
    expect(changed).not.toHaveBeenCalled();
    listeners.get('onCallAudio')?.({ attemptId: 'two', route });
    expect(changed).toHaveBeenCalledWith({ interrupted: false, route });
    media?.stop();
    listeners.get('onCallAudio')?.({ attemptId: 'two', route });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(await media?.audio?.choose('speaker', 'iphone')).toBeNull();
    expect(native.callAudio).not.toHaveBeenCalled();
    unsubscribe?.();
    expect(listeners.has('onCallAudio')).toBe(false);
  });
});
