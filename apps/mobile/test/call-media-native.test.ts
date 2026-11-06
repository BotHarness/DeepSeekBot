import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  callAudioSupported: true,
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
});

describe('native call audio capability', () => {
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
