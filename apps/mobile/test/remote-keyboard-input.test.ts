import { describe, expect, it, vi } from 'vitest';
import { createRemoteKeyboardInput } from '../src/host/remote-keyboard-input';
import type { DesktopInput } from '../../../packages/computer/src/desktop-view';

const key: DesktopInput = { kind: 'key', key: 'backspace', modifiers: [] };
const tick = async () => {
  for (let i = 0; i < 150; i++) await Promise.resolve();
};
describe('native keyboard input sequencing', () => {
  it('sends a four-line paste and 64 deletions in order with one outstanding request', async () => {
    const queue = createRemoteKeyboardInput();
    let active = 0;
    let maximum = 0;
    const received: DesktopInput[] = [];
    const send = vi.fn(async (input: DesktopInput) => {
      maximum = Math.max(maximum, ++active);
      await Promise.resolve();
      received.push(input);
      active--;
      return true;
    });
    const failed = vi.fn();
    const paste: DesktopInput[] = [
      { kind: 'type', text: 'a' },
      { kind: 'key', key: 'return', modifiers: [] },
      { kind: 'type', text: 'b' },
      { kind: 'key', key: 'return', modifiers: [] },
      { kind: 'type', text: 'c' },
      { kind: 'key', key: 'return', modifiers: [] },
      { kind: 'type', text: 'd' },
    ];
    const inputs = [...paste, ...Array.from({ length: 64 }, () => key)];
    inputs.forEach((input) => queue.enqueue(input, send, failed));
    await tick();
    expect(received).toEqual(inputs);
    expect(maximum).toBe(1);
    expect(failed).not.toHaveBeenCalled();
  });
  it('drops pending inputs on hide or grant loss and never replays an uncertain send', async () => {
    for (const cancel of [true, false]) {
      const queue = createRemoteKeyboardInput();
      let finish = (_: boolean) => {};
      const send = vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            finish = resolve;
          }),
      );
      const failed = vi.fn();
      queue.enqueue(key, send, failed);
      queue.enqueue(key, send, failed);
      if (cancel) queue.stop();
      finish(false);
      await tick();
      queue.enqueue(key, send, failed);
      expect(send).toHaveBeenCalledTimes(1);
      expect(failed).toHaveBeenCalledTimes(cancel ? 0 : 1);
    }
  });
  it('bounds queued text and clears pending work on overflow', async () => {
    const queue = createRemoteKeyboardInput();
    const send = vi.fn(() => new Promise<boolean>(() => {}));
    const failed = vi.fn();
    queue.enqueue({ kind: 'type', text: 'x'.repeat(2000) }, send, failed);
    queue.enqueue(key, send, failed);
    expect(failed).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
