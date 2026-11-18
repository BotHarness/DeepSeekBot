import { afterEach, expect, it, vi } from 'vitest';
import { observeResource } from '../src/client/messaging-defaults-live.js';

const streams: Events[] = [];
class Events extends EventTarget {
  readyState = 0;
  closed = false;
  constructor(readonly url: string) {
    super();
    streams.push(this);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
}

afterEach(() => {
  streams.length = 0;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function change(resource: string, revision: number): MessageEvent {
  return new MessageEvent('resource/changed', { data: JSON.stringify({ resource, revision }) });
}

it('re-reads a resource when the Host says it changed, without a timer while the stream is healthy', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('EventSource', Events);
  const devices = vi.fn();
  const relationships = vi.fn();
  const stopDevices = observeResource('devices', devices, 3000);
  const stopRelationships = observeResource('relationships', relationships, 3000);
  try {
    const stream = streams.at(-1)!;
    stream.readyState = 1;
    stream.dispatchEvent(new Event('open'));
    await vi.advanceTimersByTimeAsync(30);
    expect(devices).toHaveBeenCalledTimes(1);
    expect(relationships).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(devices).toHaveBeenCalledTimes(1);
    stream.dispatchEvent(change('devices', 1));
    stream.dispatchEvent(change('devices', 2));
    stream.dispatchEvent(change('unknown', 3));
    await vi.advanceTimersByTimeAsync(30);
    expect(devices).toHaveBeenCalledTimes(2);
    expect(relationships).toHaveBeenCalledTimes(1);
  } finally {
    stopDevices();
    stopRelationships();
  }
  expect(streams.every((stream) => stream.closed)).toBe(true);
});

it('falls back to a recovery poll only while the live stream is down', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('EventSource', Events);
  const devices = vi.fn();
  const stop = observeResource('devices', devices, 3000);
  try {
    await vi.advanceTimersByTimeAsync(3100);
    expect(devices).toHaveBeenCalledTimes(1);
    const stream = streams.at(-1)!;
    stream.readyState = 1;
    stream.dispatchEvent(new Event('open'));
    await vi.advanceTimersByTimeAsync(30);
    const healthy = devices.mock.calls.length;
    await vi.advanceTimersByTimeAsync(9000);
    expect(devices).toHaveBeenCalledTimes(healthy);
    stream.dispatchEvent(new Event('error'));
    await vi.advanceTimersByTimeAsync(3100);
    expect(devices).toHaveBeenCalledTimes(healthy + 1);
  } finally {
    stop();
  }
});

it('re-reads on a slow safety interval and when the page becomes visible again', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('EventSource', Events);
  const visibility = { state: 'visible' };
  const page = { listeners: new Set<() => void>() };
  vi.stubGlobal('document', {
    get visibilityState() {
      return visibility.state;
    },
    addEventListener: (_type: string, listener: () => void) => page.listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => page.listeners.delete(listener),
  });
  const devices = vi.fn();
  const stop = observeResource('devices', devices, 3000, 60_000);
  try {
    const stream = streams.at(-1)!;
    stream.readyState = 1;
    stream.dispatchEvent(new Event('open'));
    await vi.advanceTimersByTimeAsync(30);
    expect(devices).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(devices).toHaveBeenCalledTimes(2);
    visibility.state = 'hidden';
    for (const listener of page.listeners) listener();
    await vi.advanceTimersByTimeAsync(30);
    expect(devices).toHaveBeenCalledTimes(2);
    visibility.state = 'visible';
    for (const listener of page.listeners) listener();
    await vi.advanceTimersByTimeAsync(30);
    expect(devices).toHaveBeenCalledTimes(3);
  } finally {
    stop();
  }
  expect(page.listeners.size).toBe(0);
});
