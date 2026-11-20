import { describe, expect, it, vi } from 'vitest';
import { holdCallBackgroundTask } from '../src/host/call-background-task';

function service(initial: string | null) {
  let token = initial;
  const listeners = new Set<() => void>();
  return {
    token: () => token,
    subscribe(changed: () => void) {
      listeners.add(changed);
      return () => {
        listeners.delete(changed);
      };
    },
    change(next: string | null) {
      token = next;
      for (const listener of listeners) listener();
    },
    listeners: () => listeners.size,
  };
}

describe('Android call background task', () => {
  it('holds JS execution until its native call service ends, then detaches', async () => {
    const owner = service('call-one');
    const ended = vi.fn();
    const task = holdCallBackgroundTask('call-one', owner).then(ended);
    await Promise.resolve();
    owner.change('call-one');
    expect(ended).not.toHaveBeenCalled();
    expect(owner.listeners()).toBe(1);
    owner.change(null);
    await task;
    expect(ended).toHaveBeenCalledOnce();
    expect(owner.listeners()).toBe(0);
  });

  it('does not keep a late task alive after its service stopped or was replaced', async () => {
    const owner = service(null);
    await holdCallBackgroundTask('old', owner);
    expect(owner.listeners()).toBe(0);
    owner.change('new');
    await holdCallBackgroundTask('old', owner);
    expect(owner.listeners()).toBe(0);
    const task = holdCallBackgroundTask('new', owner);
    owner.change(null);
    await task;
    expect(owner.listeners()).toBe(0);
  });

  it('ends the previous task on replacement without ending the new one', async () => {
    const owner = service('one');
    const first = holdCallBackgroundTask('one', owner);
    owner.change('two');
    await first;
    const ended = vi.fn();
    const second = holdCallBackgroundTask('two', owner).then(ended);
    owner.change('two');
    await Promise.resolve();
    expect(ended).not.toHaveBeenCalled();
    owner.change(null);
    await second;
    expect(owner.listeners()).toBe(0);
  });
});
