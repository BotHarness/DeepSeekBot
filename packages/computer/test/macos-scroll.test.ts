import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const factory = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: factory.spawn }));
import { createMacScroll } from '../src/macos-scroll.js';
class Worker extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  frames: { dx: number; dy: number; until: number }[] = [];
  kill = vi.fn(() => {
    this.emit('close', 0);
    return true;
  });
  constructor() {
    super();
    this.stdin.on('data', (chunk) => this.frames.push(JSON.parse(String(chunk))));
  }
  ready() {
    this.stdout.write('{"ready":true}\n');
  }
  ack() {
    this.stdout.write('{"ack":true}\n');
  }
}
let worker: Worker;
beforeEach(() => {
  vi.useFakeTimers();
  worker = new Worker();
  factory.spawn.mockReturnValue(worker);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
const motion = { x: 100, y: 100, vx: 0, vy: -200 };
it('emits small bounded frames, never queues behind an unacknowledged native event, and expires', async () => {
  const scroll = createMacScroll();
  const start = scroll.update(motion, () => {});
  worker.ready();
  await start;
  await vi.advanceTimersByTimeAsync(200);
  expect(worker.frames).toHaveLength(1);
  expect(Math.abs(worker.frames[0]!.dy)).toBeLessThanOrEqual(4);
  worker.ack();
  await vi.advanceTimersByTimeAsync(16);
  expect(worker.frames).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(100);
  expect(worker.kill).toHaveBeenCalledOnce();
  await scroll.stop();
});
it('rechecks authority before every frame and stops without another input on revoke', async () => {
  const guard = vi.fn();
  const scroll = createMacScroll();
  const start = scroll.update(motion, guard);
  worker.ready();
  await start;
  await vi.advanceTimersByTimeAsync(16);
  worker.ack();
  guard.mockImplementation(() => {
    throw Error('revoked');
  });
  await vi.advanceTimersByTimeAsync(16);
  expect(worker.frames).toHaveLength(1);
  expect(worker.kill).toHaveBeenCalledOnce();
  await scroll.stop();
});
it('a stop while native startup is pending cannot be undone by late readiness', async () => {
  const scroll = createMacScroll();
  const start = scroll.update(motion, () => {});
  const rejected = expect(start).rejects.toThrow();
  await scroll.stop();
  worker.ready();
  await rejected;
  await vi.advanceTimersByTimeAsync(1000);
  expect(worker.frames).toHaveLength(0);
});
it('zero velocity closes the child and emits no further frames', async () => {
  const scroll = createMacScroll();
  const start = scroll.update(motion, () => {});
  worker.ready();
  await start;
  await vi.advanceTimersByTimeAsync(16);
  await scroll.update({ ...motion, vx: 0, vy: 0 }, () => {});
  worker.ack();
  await vi.advanceTimersByTimeAsync(500);
  expect(worker.frames).toHaveLength(1);
  expect(worker.kill).toHaveBeenCalledOnce();
});
it('missing accessibility permission fails closed', async () => {
  const scroll = createMacScroll();
  const start = scroll.update(motion, () => {});
  const rejected = expect(start).rejects.toThrow();
  worker.stdout.write('{"error":"accessibility-required"}\n');
  await rejected;
  expect(worker.frames).toHaveLength(0);
  expect(worker.kill).toHaveBeenCalledOnce();
});

it('an old startup watchdog cannot terminate a replacement while the old child closes slowly', async () => {
  const scroll = createMacScroll();
  const first = scroll.update(motion, () => {});
  const rejected = expect(first).rejects.toThrow();
  const old = worker;
  old.kill.mockImplementation(() => true);
  const closing = scroll.stop();
  await rejected;
  worker = new Worker();
  factory.spawn.mockReturnValue(worker);
  const next = scroll.update(motion, () => {});
  worker.ready();
  await next;
  for (let i = 0; i < 28; i++) {
    await scroll.update(motion, () => {});
    worker.ack();
    await vi.advanceTimersByTimeAsync(80);
  }
  expect(worker.kill).not.toHaveBeenCalled();
  old.emit('close', 0);
  await closing;
  await scroll.stop();
});
