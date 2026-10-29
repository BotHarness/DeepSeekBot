import { expect, it, vi } from 'vitest';
import {
  createSessionMaintenance,
  sessionMaintenanceFor,
} from '../src/shared/session-maintenance.js';
it('shares one in-flight operation across surfaces and keeps the result', async () => {
  const owner = {};
  let finish!: (result: unknown) => void;
  const port = {
    compact: vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
    newSession: vi.fn(async () => undefined),
  };
  const card = sessionMaintenanceFor(owner, 'dm-ada', 'ada', port);
  const popover = sessionMaintenanceFor(owner, 'dm-ada', 'ada', port);
  const changed = vi.fn();
  const unsubscribe = popover.subscribe(changed);
  const first = card.run('compact');
  expect(popover.run('new-session')).toBe(first);
  expect(popover.getSnapshot().pending).toBe('compact');
  await Promise.resolve();
  finish({ outcome: 'nothing' });
  await first;
  expect(port.compact).toHaveBeenCalledExactlyOnceWith('ada');
  expect(port.newSession).not.toHaveBeenCalled();
  expect(popover.getSnapshot()).toEqual({ pending: undefined, notice: 'nothing' });
  expect(changed).toHaveBeenCalledTimes(2);
  unsubscribe();
  await card.run('new-session');
  expect(port.newSession).toHaveBeenCalledExactlyOnceWith('ada');
  expect(card.getSnapshot().notice).toBe('new');
  expect(changed).toHaveBeenCalledTimes(2);
});
it.each(['compacted', 'nothing', 'busy'])('preserves Host outcome %s', async (outcome) => {
  const controller = createSessionMaintenance('dm-ada', 'ada', {
    compact: async () => ({ outcome }),
    newSession: async () => undefined,
  });
  await controller.run('compact');
  expect(controller.getSnapshot()).toEqual({ pending: undefined, notice: outcome });
});
it.each(['compact', 'new-session'] as const)(
  'shows busy for a coded refusal of %s',
  async (action) => {
    const reject = async () => {
      throw { code: 'bot-busy' };
    };
    const controller = createSessionMaintenance('dm-ada', 'ada', {
      compact: reject,
      newSession: reject,
    });
    await controller.run(action);
    expect(controller.getSnapshot()).toEqual({ pending: undefined, notice: 'busy' });
  },
);
it('points compaction of a never-saved Session to a new Session', async () => {
  const controller = createSessionMaintenance('dm-ada', 'ada', {
    compact: async () => {
      throw { code: 'session-unsaved' };
    },
    newSession: async () => undefined,
  });
  await controller.run('compact');
  expect(controller.getSnapshot()).toEqual({ pending: undefined, notice: 'unsaved' });
});
it('refuses group and mismatched DM scope before calling Host', async () => {
  const port = { compact: vi.fn(), newSession: vi.fn() };
  for (const channel of ['group-team', 'dm-other', undefined]) {
    const controller = createSessionMaintenance(channel, 'ada', port);
    await controller.run('compact');
    await controller.run('new-session');
    expect(controller.available).toBe(false);
    expect(controller.getSnapshot().notice).toBe('unavailable');
  }
  expect(port.compact).not.toHaveBeenCalled();
  expect(port.newSession).not.toHaveBeenCalled();
});
it('releases failures for another attempt and isolates Hosts and Bots', async () => {
  const port = {
    compact: vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ outcome: 'compacted' }),
    newSession: vi.fn(),
  };
  const owner = {};
  const controller = sessionMaintenanceFor(owner, 'dm-ada', 'ada', port);
  expect(sessionMaintenanceFor({}, 'dm-ada', 'ada', port)).not.toBe(controller);
  expect(sessionMaintenanceFor(owner, 'dm-bob', 'bob', port)).not.toBe(controller);
  await controller.run('compact');
  expect(controller.getSnapshot().notice).toBe('failed');
  await controller.run('compact');
  expect(controller.getSnapshot().notice).toBe('compacted');
});
