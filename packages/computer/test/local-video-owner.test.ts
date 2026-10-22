import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createComputerPauseStore, createLocalVideoOwner, type ComputerPauseStore } from '../src/local-video-owner.js';
import type { LocalVideoBinding, LocalVideoMedia, LocalVideoMediaStatus, LocalVideoOwner, LocalVideoState } from '../src/local-video-contract.js';

const caller = { deviceId: 'phone-a' };
const other = { deviceId: 'phone-b' };
const click = { kind: 'click', x: 20, y: 30, button: 'left', count: 1 } as const;
const owners: LocalVideoOwner[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const owner of owners.splice(0)) await owner.dispose().catch(() => undefined);
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(options: { store?: ComputerPauseStore; media?: LocalVideoMedia; timeout?: number } = {}) {
  let time = 10_000;
  let savedPause = false;
  let report: ((status: LocalVideoMediaStatus) => void) | undefined;
  const writes: boolean[] = [];
  const driver = { call: vi.fn(async (_tool: string, _args: Record<string, unknown>, _signal?: AbortSignal) => ({ content: [] })) };
  const geometry = { width: 1920, height: 1080, scale_factor: 1.5 };
  const probe = vi.fn(async () => ({ structuredContent: { ...geometry } }));
  const peer = {
    offer: { type: 'offer' as const, sdp: 'offer' },
    display: { width: 1920, height: 1080 },
    answer: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  const media = options.media ?? {
    open: vi.fn(async (input) => { report = input.onStatus; return peer; }),
  } satisfies LocalVideoMedia;
  const owner = createLocalVideoOwner({
    pause: options.store ?? {
      read: () => savedPause,
      write: (value) => { savedPause = value; writes.push(value); },
    },
    driver: { call: (tool, args, signal) => tool === 'get_screen_size' ? probe() : driver.call(tool, args, signal) },
    media, isRunning: () => true, now: () => time,
    operationTimeoutMs: options.timeout ?? 1_000,
    cleanupTimeoutMs: 100,
  });
  owners.push(owner);
  const capture = (alive = true): void => report?.({
    status: 'live', captureAlive: alive, width: 1920, height: 1080, framesEncoded: 100,
  });
  const connect = async (): Promise<LocalVideoBinding> => {
    const opened = await owner.handle(caller, { kind: 'open' });
    const binding = opened.binding!;
    await owner.handle(caller, { kind: 'signal', binding, answer: { type: 'answer', sdp: 'answer' } });
    capture();
    await owner.handle(caller, { kind: 'heartbeat', binding, playback: { presenting: true, presentedFrames: 1 } });
    return binding;
  };
  const take = (binding: LocalVideoBinding): Promise<LocalVideoState> => owner.handle(caller, { kind: 'takeover', binding });
  const input = (binding: LocalVideoBinding, generation: number, sequence = 1) => owner.handle(caller, {
    kind: 'input', binding, generation, sequence, input: click,
  });
  const failMedia = (): void => report?.({ status: 'failed', captureAlive: false, width: 1920, height: 1080 });
  return { owner, peer, media, driver, geometry, probe, writes, capture, failMedia, connect, take, input, advance: (ms: number) => { time += ms; } };
}

describe('Local Computer owner authority', () => {
  it('observes without pausing and refuses a second viewer without replacing the first', async () => {
    const h = harness();
    const binding = await h.connect();
    expect((await h.owner.handle(caller, { kind: 'status' })).paused).toBe(false);
    expect(h.writes).toEqual([]);
    await expect(h.owner.handle(other, { kind: 'open' })).rejects.toMatchObject({ code: 'viewer-limit' });
    expect((await h.owner.handle(caller, { kind: 'status' })).binding).toEqual(binding);
    expect(h.peer.close).not.toHaveBeenCalled();
    await expect(h.input(binding, 1)).rejects.toMatchObject({ code: 'control-required' });
    expect(h.driver.call).not.toHaveBeenCalled();
  });

  it('persists pause before draining an admitted Bot screenshot and withholds the result', async () => {
    const h = harness();
    const binding = await h.connect();
    const screenshot = deferred<string>();
    const bot = h.owner.runBotOperation(() => screenshot.promise);
    const withheld = expect(bot).rejects.toMatchObject({ code: 'control-required' });
    let granted = false;
    const taking = h.take(binding).then((value) => { granted = true; return value; });
    await Promise.resolve();
    expect(h.writes).toEqual([true]);
    expect(h.owner.isPaused()).toBe(true);
    expect(granted).toBe(false);
    await expect(h.owner.runBotOperation(async () => 'private')).rejects.toMatchObject({ code: 'control-required' });
    screenshot.resolve('private screen');
    await withheld;
    const control = await taking;
    expect(control.controller).toBe(true);
    await h.input(binding, control.grant!.generation);
    expect(h.driver.call).toHaveBeenCalledTimes(1);
  });

  it('refuses takeover on drain timeout and leaves pause durable even after the old call completes', async () => {
    const h = harness({ timeout: 10 });
    const binding = await h.connect();
    const operation = deferred<string>();
    const bot = h.owner.runBotOperation(() => operation.promise);
    const withheld = expect(bot).rejects.toMatchObject({ code: 'control-required' });
    await expect(h.take(binding)).rejects.toMatchObject({ code: 'drain-timeout' });
    expect(await h.owner.handle(caller, { kind: 'status' })).toMatchObject({ paused: true, controller: false });
    operation.resolve('late screenshot');
    await withheld;
    expect(h.writes).toEqual([true]);
    expect(h.driver.call).not.toHaveBeenCalled();
  });

  it('grants nothing on pause write failure and never reopens Bot execution', async () => {
    const h = harness({ store: { read: () => false, write: () => { throw new Error('disk'); } } });
    const binding = await h.connect();
    await expect(h.take(binding)).rejects.toMatchObject({ code: 'pause-write-failed' });
    expect(h.owner.isPaused()).toBe(true);
    await expect(h.input(binding, 1)).rejects.toMatchObject({ code: 'control-required' });
  });

  it('serializes concurrent takeovers into one exclusive grant', async () => {
    const h = harness();
    const binding = await h.connect();
    const [first, second] = await Promise.all([h.take(binding), h.take(binding)]);
    expect(first.grant).toEqual(second.grant);
    expect(h.writes).toEqual([true]);
  });

  it('release during pending takeover invalidates its eventual grant', async () => {
    const h = harness();
    const binding = await h.connect();
    const operation = deferred<void>();
    const bot = h.owner.runBotOperation(() => operation.promise).catch(() => undefined);
    const taking = h.take(binding);
    const refused = expect(taking).rejects.toMatchObject({ code: 'stale-grant' });
    await Promise.resolve();
    const releasing = h.owner.handle(caller, { kind: 'release', binding });
    operation.resolve();
    await bot;
    await refused;
    expect(await releasing).toMatchObject({ paused: true, controller: false });
  });

  it('release preserves pause; explicit resume drains Human input and fences queued inputs', async () => {
    const h = harness();
    const binding = await h.connect();
    const control = await h.take(binding);
    const generation = control.grant!.generation;
    const effect = deferred<{ content: never[] }>();
    h.driver.call.mockImplementationOnce(() => effect.promise);
    const first = h.input(binding, generation);
    await vi.waitFor(() => expect(h.driver.call).toHaveBeenCalledTimes(1));
    const queued = h.input(binding, generation, 2);
    const queuedRefused = expect(queued).rejects.toMatchObject({ code: 'control-required' });
    let resumed = false;
    const resuming = h.owner.handle(caller, { kind: 'resume', runtimeId: binding.runtimeId, binding, generation }).then((value) => { resumed = true; return value; });
    await Promise.resolve();
    expect(resumed).toBe(false);
    expect(h.owner.isPaused()).toBe(true);
    effect.resolve({ content: [] });
    await first;
    await queuedRefused;
    expect(await resuming).toMatchObject({ paused: false, controller: false });
    expect(h.driver.call).toHaveBeenCalledTimes(1);
    expect(h.writes).toEqual([true, false]);
  });

  it('resume persistence failure keeps Bots paused and invalidates control', async () => {
    const h = harness({ store: { read: () => false, write: (paused) => { if (!paused) throw new Error('disk'); } } });
    const binding = await h.connect();
    const control = await h.take(binding);
    await expect(h.owner.handle(caller, { kind: 'resume', runtimeId: binding.runtimeId, binding, generation: control.grant!.generation })).rejects.toMatchObject({ code: 'pause-write-failed' });
    expect(await h.owner.handle(caller, { kind: 'status' })).toMatchObject({ paused: true, controller: false });
    await expect(h.owner.runBotOperation(async () => 'secret')).rejects.toMatchObject({ code: 'control-required' });
  });

  it('cancelled resume never commits unpause after an in-flight Human effect drains', async () => {
    const h = harness();
    const binding = await h.connect();
    const control = await h.take(binding);
    const effect = deferred<{ content: never[] }>();
    h.driver.call.mockImplementationOnce(() => effect.promise);
    const input = h.input(binding, control.grant!.generation);
    await vi.waitFor(() => expect(h.driver.call).toHaveBeenCalledTimes(1));
    const abort = new AbortController();
    const resuming = h.owner.handle(caller, {
      kind: 'resume', runtimeId: binding.runtimeId, binding, generation: control.grant!.generation,
    }, abort.signal);
    const refused = expect(resuming).rejects.toMatchObject({ code: 'stale-attempt' });
    await Promise.resolve();
    abort.abort();
    effect.resolve({ content: [] });
    await input;
    await refused;
    expect(h.writes).toEqual([true]);
    expect(await h.owner.handle(caller, { kind: 'status' })).toMatchObject({ paused: true, controlHeld: false });
  });

  it('release keeps Bots paused and global CLI status agrees without exposing the phone grant', async () => {
    const h = harness();
    const binding = await h.connect();
    const control = await h.take(binding);
    const cli = await h.owner.handle({ deviceId: 'host-owner' }, { kind: 'status' });
    expect(cli).toMatchObject({ paused: true, viewerCount: 1, controlHeld: true, controller: false, media: { status: 'live' } });
    expect(cli.binding).toBeUndefined();
    expect(cli.grant).toBeUndefined();
    const released = await h.owner.handle(caller, { kind: 'release', binding, generation: control.grant!.generation });
    expect(released).toMatchObject({ paused: true, controlHeld: false, controller: false });
    await expect(h.owner.runBotOperation(async () => 'screenshot')).rejects.toMatchObject({ code: 'control-required' });
    expect(h.writes).toEqual([true]);
  });

  it('helper failure stops its established peer and leaves durable pause active', async () => {
    const h = harness();
    const binding = await h.connect();
    await h.take(binding);
    h.failMedia();
    await Promise.resolve();
    expect(h.peer.close).toHaveBeenCalledTimes(1);
    expect(await h.owner.handle(caller, { kind: 'status' })).toMatchObject({ paused: true, viewerCount: 0, controlHeld: false });
    expect(h.writes).toEqual([true]);
  });

  it('never replays an input with a lost result and drains it before resume', async () => {
    const h = harness({ timeout: 10 });
    const binding = await h.connect();
    const control = await h.take(binding);
    const effect = deferred<{ content: never[] }>();
    h.driver.call.mockImplementationOnce(() => effect.promise);
    await expect(h.input(binding, control.grant!.generation)).rejects.toMatchObject({ code: 'input-result-unknown' });
    await expect(h.input(binding, control.grant!.generation)).rejects.toMatchObject({ code: 'control-required' });
    await expect(h.owner.handle(caller, { kind: 'resume', runtimeId: binding.runtimeId })).rejects.toMatchObject({ code: 'drain-timeout' });
    expect(h.owner.isPaused()).toBe(true);
    effect.resolve({ content: [] });
    await Promise.resolve();
    expect(h.driver.call).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate sequence, foreign identity, stale runtime and outside-display input before effects', async () => {
    const h = harness();
    const binding = await h.connect();
    const control = await h.take(binding);
    const generation = control.grant!.generation;
    await h.input(binding, generation);
    await expect(h.input(binding, generation)).rejects.toMatchObject({ code: 'input-sequence' });
    await expect(h.owner.handle(other, { kind: 'input', binding, generation, sequence: 2, input: click })).rejects.toMatchObject({ code: 'viewer-not-found' });
    await expect(h.owner.handle(caller, { kind: 'input', binding, generation, sequence: 2, input: { ...click, x: 1920 } })).rejects.toMatchObject({ code: 'invalid-input' });
    await h.owner.resetRuntime();
    await expect(h.input(binding, generation, 3)).rejects.toMatchObject({ code: 'stale-attempt' });
    expect(h.driver.call).toHaveBeenCalledTimes(1);
    expect(h.peer.close).toHaveBeenCalledTimes(1);
  });

  it('keeps physical desktop input unchanged at 150% Windows display scaling', async () => {
    const h = harness();
    const binding = await h.connect();
    const control = await h.take(binding);
    expect(h.geometry.scale_factor).toBe(1.5);
    await h.input(binding, control.grant!.generation);
    expect(h.probe).toHaveBeenCalledTimes(2);
    expect(h.driver.call.mock.calls[0]?.[1]).toMatchObject({ scope: 'desktop', x: 20, y: 30 });
  });

  it('refuses mismatched primary-display geometry before granting control or sending input', async () => {
    const h = harness();
    const binding = await h.connect();
    h.geometry.width = 1280;
    await expect(h.take(binding)).rejects.toMatchObject({ code: 'media-not-live' });
    expect(h.owner.isPaused()).toBe(true);
    expect(h.driver.call).not.toHaveBeenCalled();
    h.geometry.width = 1920;
    const control = await h.take(binding);
    h.geometry.height = 720;
    await expect(h.input(binding, control.grant!.generation)).rejects.toMatchObject({ code: 'media-not-live' });
    expect(h.driver.call).not.toHaveBeenCalled();
  });

  it('resume drains the native geometry query and fences input again after the query', async () => {
    const h = harness();
    const binding = await h.connect();
    const control = await h.take(binding);
    const geometry = deferred<{ structuredContent: typeof h.geometry }>();
    h.probe.mockImplementationOnce(() => geometry.promise);
    const input = h.input(binding, control.grant!.generation);
    const refused = expect(input).rejects.toMatchObject({ code: 'control-required' });
    await vi.waitFor(() => expect(h.probe).toHaveBeenCalledTimes(2));
    let resumed = false;
    const resuming = h.owner.handle(caller, { kind: 'resume', runtimeId: binding.runtimeId }).then(() => { resumed = true; });
    await Promise.resolve();
    expect(resumed).toBe(false);
    expect(h.writes).toEqual([true]);
    geometry.resolve({ structuredContent: h.geometry });
    await refused;
    await resuming;
    expect(h.driver.call).not.toHaveBeenCalled();
    expect(h.writes).toEqual([true, false]);
  });

  it('distinguishes static live video from failed capture despite continuing receiver frames', async () => {
    const h = harness();
    const binding = await h.connect();
    const control = await h.take(binding);
    h.advance(4_000);
    h.capture();
    await h.owner.handle(caller, { kind: 'heartbeat', binding, playback: { presenting: true, presentedFrames: 2 } });
    await h.input(binding, control.grant!.generation);
    h.capture(false);
    await h.owner.handle(caller, { kind: 'heartbeat', binding, playback: { presenting: true, presentedFrames: 3 } });
    await expect(h.input(binding, control.grant!.generation, 2)).rejects.toMatchObject({ code: 'media-not-live' });
    expect(h.driver.call).toHaveBeenCalledTimes(1);
    expect(h.owner.isPaused()).toBe(true);
  });

  it('rejects lost control immediately at its bound and expires within 30 seconds without resuming', async () => {
    const h = harness();
    const binding = await h.connect();
    const control = await h.take(binding);
    h.advance(6_000);
    h.capture();
    await expect(h.input(binding, control.grant!.generation)).rejects.toMatchObject({ code: 'control-disconnected' });
    h.advance(24_000);
    expect(await h.owner.handle(caller, { kind: 'status' })).toMatchObject({ paused: true, controller: false });
    await Promise.resolve();
    expect(h.peer.close).toHaveBeenCalledTimes(1);
  });

  it('actively stops established media on revoke, ignores late callbacks and keeps pause', async () => {
    const h = harness();
    const binding = await h.connect();
    await h.take(binding);
    await h.owner.revoke(caller.deviceId);
    expect(h.peer.close).toHaveBeenCalledTimes(1);
    h.capture();
    expect(await h.owner.handle(caller, { kind: 'status' })).toMatchObject({ paused: true, controller: false, media: { status: 'closed' } });
    await expect(h.owner.handle(caller, { kind: 'heartbeat', binding, playback: { presenting: true, presentedFrames: 2 } })).rejects.toMatchObject({ code: 'viewer-not-found' });
  });

  it('owns cancellation before helper readiness and closes a late successful peer', async () => {
    const opening = deferred<Awaited<ReturnType<LocalVideoMedia['open']>>>();
    const h = harness({ media: { open: () => opening.promise } });
    const abort = new AbortController();
    const pending = h.owner.handle(caller, { kind: 'open' }, abort.signal);
    const refused = expect(pending).rejects.toMatchObject({ code: 'stale-attempt' });
    await Promise.resolve();
    abort.abort();
    await expect(h.owner.handle(other, { kind: 'open' })).rejects.toMatchObject({ code: 'not-ready' });
    opening.resolve(h.peer);
    await refused;
    expect(h.peer.close).toHaveBeenCalledTimes(1);
  });

  it('restores only durable pause and permits explicit runtime-bound resume without media', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bh-computer-pause-'));
    dirs.push(dir);
    const path = join(dir, 'computer-pause.json');
    const store = createComputerPauseStore(path);
    const first = harness({ store });
    const binding = await first.connect();
    await first.take(binding);
    await first.owner.dispose();
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ version: 1, paused: true });
    const restarted = harness({ store });
    const restored = await restarted.owner.handle(caller, { kind: 'status' });
    expect(restored).toMatchObject({ paused: true, controller: false });
    expect(restored.binding).toBeUndefined();
    expect(restored.grant).toBeUndefined();
    await expect(restarted.owner.handle(caller, { kind: 'resume', runtimeId: binding.runtimeId })).rejects.toMatchObject({ code: 'stale-attempt' });
    expect(await restarted.owner.handle(caller, { kind: 'resume', runtimeId: restored.runtimeId })).toMatchObject({ paused: false });
    expect(await restarted.owner.runBotOperation(async () => 'fresh screenshot')).toBe('fresh screenshot');
  });

  it('restores malformed or unreadable pause records fail-closed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bh-computer-pause-'));
    dirs.push(dir);
    const path = join(dir, 'computer-pause.json');
    writeFileSync(path, '{broken');
    const h = harness({ store: createComputerPauseStore(path) });
    expect(h.owner.isPaused()).toBe(true);
    await expect(h.owner.runBotOperation(async () => 'effect')).rejects.toMatchObject({ code: 'control-required' });
  });
});
