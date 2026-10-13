import { afterEach, expect, it, vi } from 'vitest';
import { CompanionFrames } from '../src/client/companion-frames.js';

afterEach(() => vi.unstubAllGlobals());

it('runs every companion read before any write in one shared frame and stops with the last task', () => {
  const callbacks: FrameRequestCallback[] = [];
  const cancelled: number[] = [];
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callbacks.push(callback);
    return ++id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => cancelled.push(id));
  const frames = new CompanionFrames();
  const order: string[] = [];
  const task = (name: string) => ({
    read: () => order.push(`read ${name}`),
    write: () => order.push(`write ${name}`),
  });
  const ada = task('ada');
  const grace = task('grace');
  frames.start(ada);
  frames.start(grace);
  expect(callbacks).toHaveLength(1);
  callbacks.shift()!(16);
  expect(order).toEqual(['read ada', 'read grace', 'write ada', 'write grace']);
  expect(callbacks).toHaveLength(1);
  frames.stop(ada);
  expect(cancelled).toEqual([]);
  frames.stop(grace);
  expect(cancelled).toEqual([2]);
  frames.start(ada);
  expect(callbacks).toHaveLength(2);
});

it('skips the write of a task stopped during the read phase and does not reschedule an empty loop', () => {
  const callbacks: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    callbacks.push(callback),
  );
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const frames = new CompanionFrames();
  const write = vi.fn();
  const task = { read: () => frames.stop(task), write };
  frames.start(task);
  callbacks.shift()!(16);
  expect(write).not.toHaveBeenCalled();
  expect(callbacks).toHaveLength(0);
});
