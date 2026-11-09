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
      timeoutMs: 3_000,
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
        timeoutMs: 3_000,
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
      createWorkerHeartbeats({ url: 'x', client: 'c', timeoutMs: 1, worker: () => undefined }),
    ).toBeUndefined();
  });

  it('beats from the worker with the cursor, retries a failed request once, and stops', async () => {
    vi.useFakeTimers();
    try {
      const posted: unknown[] = [];
      const bodies: unknown[] = [];
      let calls = 0;
      const scope: Record<string, unknown> = {
        setInterval,
        clearInterval,
        setTimeout,
        clearTimeout,
        AbortController,
        JSON,
        Error,
        postMessage: (message: unknown) => posted.push(message),
        close: vi.fn(),
        fetch: async (_url: string, init: { body: string; signal: AbortSignal }) => {
          calls += 1;
          bodies.push(JSON.parse(init.body));
          if (calls === 2) throw new TypeError('fetch failed');
          if (calls === 4)
            return await new Promise((_resolve, reject) =>
              init.signal.addEventListener('abort', () => reject(new Error('aborted'))),
            );
          return { json: async () => ({ ok: true, n: calls }) };
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
        timeoutMs: 500,
      });
      send({ type: 'after', seq: 4 });
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.advanceTimersByTimeAsync(600);
      send({ type: 'stop' });
      await vi.advanceTimersByTimeAsync(3_000);
      expect(posted).toEqual([
        { result: { ok: true, n: 1 } },
        { result: { ok: true, n: 3 } },
        { result: { ok: true, n: 5 } },
      ]);
      expect(bodies[0]).toEqual({ kind: 'heartbeat', callId: 'call-1', after: 4, client: 'w' });
      expect(calls).toBe(5);
      expect(scope['close']).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
