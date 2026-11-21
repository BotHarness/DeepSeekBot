import { afterEach, describe, expect, it, vi } from 'vitest';
import { caller, cleanup, deferred, harness } from './local-video-owner-fixture.js';

afterEach(cleanup);

describe('continuous scroll authority', () => {
  it('converts Retina coordinates and stops on handback; native frames recheck authority', async () => {
    let allowed: () => void = () => {};
    const motion = {
      update: vi.fn(async (_input: unknown, guard: () => void) => {
        allowed = guard;
      }),
      stop: vi.fn(async () => {}),
    };
    const h = harness({ points: true, scrollMotion: motion });
    h.geometry.width = 960;
    h.geometry.height = 540;
    h.geometry.scale_factor = 2;
    const binding = await h.connect();
    const { grant } = await h.take(binding);
    const command = {
      kind: 'input',
      binding,
      generation: grant!.generation,
      sequence: 1,
      input: { kind: 'scroll-motion', x: 200, y: 400, vx: 0, vy: -200 },
    } as const;
    const state = await h.owner.handle(caller, command);
    expect(state.continuousScroll).toBe(true);
    expect(motion.update).toHaveBeenCalledWith(
      { x: 100, y: 200, vx: 0, vy: -200 },
      expect.any(Function),
    );
    expect(() => allowed()).not.toThrow();
    const count = motion.stop.mock.calls.length;
    await h.owner.handle(caller, { kind: 'release', binding, generation: grant!.generation });
    expect(motion.stop.mock.calls.length).toBeGreaterThan(count);
    expect(() => allowed()).toThrow();
    await expect(h.owner.handle(caller, { ...command, sequence: 2 })).rejects.toMatchObject({
      code: 'control-required',
    });
  });

  it('zero velocity stops without a new geometry probe; revoked control cannot continue', async () => {
    const motion = { update: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
    const h = harness({ scrollMotion: motion });
    const binding = await h.connect();
    const { grant } = await h.take(binding);
    await h.owner.handle(caller, {
      kind: 'input',
      binding,
      generation: grant!.generation,
      sequence: 1,
      input: { kind: 'scroll-motion', x: 20, y: 30, vx: 100, vy: 0 },
    });
    const probes = h.probe.mock.calls.length;
    await h.owner.handle(caller, {
      kind: 'input',
      binding,
      generation: grant!.generation,
      sequence: 2,
      input: { kind: 'scroll-motion', x: 20, y: 30, vx: 0, vy: 0 },
    });
    expect(h.probe.mock.calls.length).toBe(probes);
    expect(motion.update).toHaveBeenCalledTimes(1);
    await h.owner.revoke(caller.deviceId);
    expect(motion.stop).toHaveBeenCalled();
  });

  it('rejects unsupported Hosts and invalid velocity without calling the driver', async () => {
    const h = harness();
    const binding = await h.connect();
    const { grant } = await h.take(binding);
    await expect(
      h.owner.handle(caller, {
        kind: 'input',
        binding,
        generation: grant!.generation,
        sequence: 1,
        input: { kind: 'scroll-motion', x: 20, y: 30, vx: 201, vy: 0 },
      }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(
      h.owner.handle(caller, {
        kind: 'input',
        binding,
        generation: grant!.generation,
        sequence: 2,
        input: { kind: 'scroll-motion', x: 20, y: 30, vx: 100, vy: 0 },
      }),
    ).rejects.toMatchObject({ code: 'update-required' });
    expect(h.driver.call).not.toHaveBeenCalled();
  });
});

it.each(['dispose', 'resetRuntime', 'revoke', 'close'] as const)(
  'waits for native process exit during %s',
  async (action) => {
    const stopped = deferred<void>();
    const motion = { update: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
    const h = harness({ scrollMotion: motion });
    const binding = await h.connect();
    await h.take(binding);
    motion.stop.mockImplementation(() => stopped.promise);
    let finished = false;
    const operation =
      action === 'revoke'
        ? h.owner.revoke(caller.deviceId)
        : action === 'close'
          ? h.owner.handle(caller, { kind: 'close', binding })
          : h.owner[action]();
    const waiting = operation.then(() => {
      finished = true;
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(finished).toBe(false);
    stopped.resolve();
    await waiting;
    expect(finished).toBe(true);
  },
);

it.each(['resume', 'takeover', 'close', 'revoke'] as const)(
  'fails closed if native exit times out during %s',
  async (action) => {
    const stopped = deferred<void>();
    const motion = { update: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
    const h = harness({ scrollMotion: motion, timeout: 200 });
    const binding = await h.connect();
    const { grant } = await h.take(binding);
    motion.stop.mockImplementation(() => stopped.promise);
    const operation =
      action === 'revoke'
        ? h.owner.revoke(caller.deviceId)
        : action === 'resume'
          ? h.owner.handle(caller, {
              kind: 'resume',
              runtimeId: binding.runtimeId,
              binding,
              generation: grant!.generation,
            })
          : action === 'close'
            ? h.owner.handle(caller, { kind: 'close', binding })
            : (async () => {
                await h.owner.handle(caller, { kind: 'release', binding });
                await h.take(binding);
              })();
    await expect(operation).rejects.toMatchObject({ code: 'operation-timeout' });
    expect(h.writes.at(-1)).toBe(true);
    stopped.resolve();
  },
);
