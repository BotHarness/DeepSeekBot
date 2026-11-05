import { describe, expect, it, vi } from 'vitest';

import {
  CALL_AUDIO_CONSTRAINTS,
  micConstraints,
  micOptions,
  MIC_DEVICE_STORAGE_KEY,
  openMicrophone,
  readMicDevice,
  savedMicMissing,
  writeMicDevice,
} from '../src/client/mic-device.js';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('microphone choice', () => {
  it('lists real inputs once, without the default and communications aliases', () => {
    expect(
      micOptions([
        { kind: 'audioinput', deviceId: 'default', label: 'Default - MacBook Pro Microphone' },
        { kind: 'audioinput', deviceId: 'communications', label: 'Communications' },
        { kind: 'audioinput', deviceId: 'mac', label: 'MacBook Pro Microphone ' },
        { kind: 'audioinput', deviceId: 'usb', label: 'USB Mic' },
        { kind: 'audioinput', deviceId: 'usb', label: 'USB Mic' },
        { kind: 'audiooutput', deviceId: 'speaker', label: 'Speakers' },
        { kind: 'audioinput', deviceId: '', label: '' },
      ]),
    ).toEqual([
      { id: 'mac', label: 'MacBook Pro Microphone' },
      { id: 'usb', label: 'USB Mic' },
    ]);
  });

  it('reports a saved microphone that is no longer connected', () => {
    const options = [{ id: 'mac', label: 'Mac' }];
    expect(savedMicMissing('usb', options)).toBe(true);
    expect(savedMicMissing('mac', options)).toBe(false);
    expect(savedMicMissing(undefined, options)).toBe(false);
    expect(savedMicMissing('usb', [])).toBe(false);
  });

  it('stores the choice per browser and ignores pseudo devices', () => {
    const store = memoryStorage();
    expect(readMicDevice(store)).toBeUndefined();
    writeMicDevice('usb', store);
    expect(store.getItem(MIC_DEVICE_STORAGE_KEY)).toBe('usb');
    expect(readMicDevice(store)).toBe('usb');
    writeMicDevice('default', store);
    expect(readMicDevice(store)).toBeUndefined();
  });

  it('adds the exact device to the call audio constraints', () => {
    expect(micConstraints(undefined)).toEqual(CALL_AUDIO_CONSTRAINTS);
    expect(micConstraints('usb')).toEqual({
      ...CALL_AUDIO_CONSTRAINTS,
      deviceId: { exact: 'usb' },
    });
  });

  it('retries once with the default microphone and forgets a missing choice', async () => {
    const store = memoryStorage();
    writeMicDevice('gone', store);
    const stream = {} as MediaStream;
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('gone'), { name: 'OverconstrainedError' }))
      .mockResolvedValueOnce(stream);
    await expect(openMicrophone({ getUserMedia }, store)).resolves.toEqual({
      stream,
      fellBack: true,
    });
    expect(getUserMedia.mock.calls.map(([request]) => request.audio.deviceId)).toEqual([
      { exact: 'gone' },
      undefined,
    ]);
    expect(readMicDevice(store)).toBeUndefined();
  });

  it('does not retry a denied microphone', async () => {
    const store = memoryStorage();
    writeMicDevice('usb', store);
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    const getUserMedia = vi.fn().mockRejectedValue(denied);
    await expect(openMicrophone({ getUserMedia }, store)).rejects.toBe(denied);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(readMicDevice(store)).toBe('usb');
  });
});
