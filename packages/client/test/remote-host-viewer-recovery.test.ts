import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserViewer } from '../../../apps/mobile/src/host/browser-viewer.js';
import { createComputerViewer } from '../../../apps/mobile/src/host/computer-viewer.js';
import type {
  HostApiAnswer,
  HostApiInit,
  HostClient,
} from '../../../apps/mobile/src/host/client.js';
import { createRemoteHostViewer } from '../src/client/remote-host-viewer.js';

afterEach(() => vi.useRealTimers());

function staticFrameHost() {
  const framePaths: string[] = [];
  const inputs: unknown[] = [];
  const failure = Promise.withResolvers<HostApiAnswer>();
  const input = Promise.withResolvers<HostApiAnswer>();
  let reads = 0;
  const client: Pick<HostClient, 'api' | 'subscribe' | 'getSnapshot'> = {
    subscribe: () => () => {},
    getSnapshot: () => ({ connection: { status: 'connected', route: 'host-b' } }),
    async api(path: string, init?: HostApiInit): Promise<HostApiAnswer> {
      if (path.includes('/frame')) {
        framePaths.push(path);
        reads += 1;
        if (reads === 2) return failure.promise;
        const after = new URL(path, 'http://host.test').searchParams.get('after');
        if (after === '7')
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              init?.signal?.removeEventListener('abort', abort);
              resolve({ status: 204, body: null });
            }, 10_000);
            function abort(): void {
              clearTimeout(timer);
              reject(new DOMException('aborted', 'AbortError'));
            }
            if (init?.signal?.aborted) abort();
            else init?.signal?.addEventListener('abort', abort, { once: true });
          });
        return {
          status: 200,
          body: {
            seq: 7,
            data: 'unchanged',
            width: 100,
            height: 100,
            viewport: { width: 100, height: 100 },
            mode: 'stream',
          },
        };
      }
      if (path.endsWith('/input')) {
        inputs.push(init?.body);
        return inputs.length === 1 ? input.promise : { status: 200, body: {} };
      }
      return {
        status: 200,
        body: {
          takeover: init?.body?.['active'] === true,
          paused: init?.body?.['active'] === true,
        },
      };
    },
  };
  return {
    client,
    framePaths,
    inputs,
    fail(mode: 'network' | '502' | 'malformed') {
      if (mode === 'network') failure.reject(new TypeError('Frame transport lost'));
      else failure.resolve({ status: mode === '502' ? 502 : 200, body: {} });
    },
    finishInput: () => input.resolve({ status: 200, body: {} }),
    failInput: () => input.reject(new TypeError('Input transport lost')),
    unchangedFrame: () => failure.resolve({ status: 204, body: null }),
  };
}

describe.each(['browser', 'computer'] as const)('%s static-frame recovery', (kind) => {
  it('fetches the current frame when an already-pending poll returns 204 after control transport loss', async () => {
    vi.useFakeTimers();
    const h = staticFrameHost();
    const viewer = createRemoteHostViewer(h.client, kind, 'ada');
    const stop = viewer.subscribe(() => {});
    try {
      await vi.waitFor(() => expect(h.framePaths).toHaveLength(2));
      await viewer.setControl(true);
      const click = viewer.send({ kind: 'click', x: 1, y: 1 });
      const text = viewer.send({ kind: 'type', text: 'old-input' });
      await vi.waitFor(() => expect(h.inputs).toHaveLength(1));
      h.failInput();
      await Promise.all([click, text]);
      expect(viewer.getSnapshot()).toMatchObject({
        status: 'unreachable',
        control: false,
        notice: 'Input transport lost',
      });
      await vi.advanceTimersByTimeAsync(10_000);
      h.unchangedFrame();
      await vi.waitFor(() => expect(viewer.getSnapshot().status).toBe('live'));
      expect(viewer.getSnapshot()).toMatchObject({ control: false, frame: { seq: 7 } });
      expect(h.framePaths.filter((path) => !path.includes('after='))).toHaveLength(2);
      expect(h.inputs).toHaveLength(1);
    } finally {
      h.finishInput();
      stop();
    }
  });

  it.each(['network', '502', 'malformed'] as const)(
    'resets the shared cursor after %s without requiring a changed frame',
    async (failure) => {
      vi.useFakeTimers();
      const h = staticFrameHost();
      const viewer =
        kind === 'browser'
          ? createBrowserViewer({ client: h.client, slug: 'ada' })
          : createComputerViewer({ client: h.client });
      viewer.start();
      try {
        await vi.waitFor(() => expect(h.framePaths).toHaveLength(2));
        expect(viewer.getState().frame?.seq).toBe(7);
        h.fail(failure);
        await vi.waitFor(() => expect(viewer.getState().status).toBe('unreachable'));
        await vi.advanceTimersByTimeAsync(32_000);
        expect(viewer.getState()).toMatchObject({ status: 'live', frame: { seq: 7 } });
        expect(viewer.getState().frame?.uri).toContain('unchanged');
        expect(h.framePaths.filter((path) => !path.includes('after='))).toHaveLength(2);
        expect(h.framePaths.slice(3).every((path) => path.includes('after=7'))).toBe(true);
      } finally {
        viewer.stop();
      }
    },
  );

  it.each(['network', '502', 'malformed'] as const)(
    'keeps Web read-only across %s and repeated unchanged-frame 204 responses',
    async (failure) => {
      vi.useFakeTimers();
      const h = staticFrameHost();
      const viewer = createRemoteHostViewer(h.client, kind, 'ada');
      const stop = viewer.subscribe(() => {});
      try {
        await vi.waitFor(() => expect(h.framePaths).toHaveLength(2));
        await viewer.setControl(true);
        const click = viewer.send({ kind: 'click', x: 1, y: 1 });
        const text = viewer.send({ kind: 'type', text: 'old-input' });
        await vi.waitFor(() => expect(h.inputs).toHaveLength(1));
        h.fail(failure);
        await vi.waitFor(() => expect(viewer.getSnapshot().status).toBe('unreachable'));
        expect(viewer.getSnapshot().frame).toBeUndefined();
        expect(viewer.getSnapshot().control).toBe(false);
        await vi.advanceTimersByTimeAsync(32_000);
        expect(h.client.getSnapshot().connection.status).toBe('connected');
        expect(viewer.getSnapshot()).toMatchObject({
          status: 'live',
          control: false,
          frame: { seq: 7 },
        });
        await viewer.send({ kind: 'type', text: 'no-takeover' });
        await viewer.setControl(true);
        h.finishInput();
        await Promise.all([click, text]);
        expect(h.inputs).toHaveLength(1);
        await viewer.send({ kind: 'type', text: 'new-input' });
        expect(h.inputs).toHaveLength(2);
      } finally {
        h.finishInput();
        stop();
      }
    },
  );
});
