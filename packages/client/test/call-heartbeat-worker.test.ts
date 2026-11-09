import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import {
  HEARTBEAT_WORKER_SOURCE,
  createWorkerHeartbeats,
  type HeartbeatWorkerLike,
} from '../src/client/call-heartbeat-worker.js';

function fakeWorker() {
  const sent: unknown[] = [];
  const worker: HeartbeatWorkerLike & { terminated: boolean } = {
    onmessage: null,
    terminated: false,
    postMessage: (message) => sent.push(message),
    terminate() {
      worker.terminated = true;
    },
  };
  return { worker, sent };
}

describe('worker heartbeats', () => {
  it('starts one worker per call, forwards the event cursor and results, and stops it', () => {
    const made: ReturnType<typeof fakeWorker>[] = [];
    const pump = createWorkerHeartbeats({
      url: 'dsh-app://app/api/voice/call',
      client: 'window-0001',
      maxInFlight: 4,
      worker: () => {
        const next = fakeWorker();
        made.push(next);
        return next.worker;
      },
    });
    expect(pump).toBeDefined();
    expect(made[0]?.worker.terminated).toBe(true);
    const results: unknown[] = [];
    const running = pump!.start({
      callId: 'call-1',
      periodMs: 1_000,
      onResult: (result) => results.push(result),
    });
    const { worker, sent } = made[1]!;
    expect(sent).toEqual([
      {
        type: 'start',
        url: 'dsh-app://app/api/voice/call',
        callId: 'call-1',
        client: 'window-0001',
        periodMs: 1_000,
        maxInFlight: 4,
      },
    ]);
    running.after(7);
    worker.onmessage?.({ data: { result: { ok: true } } } as MessageEvent);
    worker.onmessage?.({ data: {} } as MessageEvent);
    running.stop();
    worker.onmessage?.({ data: { result: { ok: true } } } as MessageEvent);
    expect(sent.slice(1)).toEqual([{ type: 'after', seq: 7 }, { type: 'stop' }]);
    expect(results).toEqual([{ ok: true }, undefined]);
    expect(worker.terminated).toBe(true);
  });

  it('falls back to the page timer when workers are unavailable', () => {
    expect(
      createWorkerHeartbeats({ url: 'x', client: 'c', maxInFlight: 4, worker: () => undefined }),
    ).toBeUndefined();
  });

  it('keeps beating while earlier requests are still waiting on the Host, up to the cap', async () => {
    vi.useFakeTimers();
    try {
      const posted: unknown[] = [];
      const bodies: unknown[] = [];
      const pending: ((value: unknown) => void)[] = [];
      let calls = 0;
      const scope: Record<string, unknown> = {
        setInterval,
        clearInterval,
        JSON,
        postMessage: (message: unknown) => posted.push(message),
        close: vi.fn(),
        fetch: async (_url: string, init: { body: string; signal?: unknown }) => {
          calls += 1;
          bodies.push({ ...JSON.parse(init.body), signal: init.signal !== undefined });
          if (calls === 1) throw new TypeError('fetch failed');
          return await new Promise((resolve) => pending.push(resolve));
        },
      };
      runInNewContext(HEARTBEAT_WORKER_SOURCE, scope);
      const send = (data: unknown) => (scope['onmessage'] as (event: unknown) => void)({ data });
      send({
        type: 'start',
        url: 'u',
        callId: 'call-1',
        client: 'w',
        periodMs: 1_000,
        maxInFlight: 2,
      });
      send({ type: 'after', seq: 4 });
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.advanceTimersByTimeAsync(3_000);
      expect(calls).toBe(3);
      pending.shift()?.({ json: async () => ({ ok: true, n: 2 }) });
      await vi.advanceTimersByTimeAsync(1_000);
      expect(calls).toBe(4);
      send({ type: 'stop' });
      pending.shift()?.({ json: async () => ({ ok: true, n: 3 }) });
      await vi.advanceTimersByTimeAsync(3_000);
      expect(posted).toEqual([{ result: undefined }, { result: { ok: true, n: 2 } }]);
      expect(bodies[0]).toEqual({
        kind: 'heartbeat',
        callId: 'call-1',
        after: 4,
        client: 'w',
        signal: false,
      });
      expect(scope['close']).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
