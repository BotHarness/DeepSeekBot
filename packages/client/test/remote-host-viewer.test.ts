import { describe, expect, it, vi } from 'vitest';
import type {
  HostApiAnswer,
  HostApiInit,
  HostClient,
  HostSnapshot,
} from '../../../apps/mobile/src/host/client.js';
import { createRemoteHostViewer } from '../src/client/remote-host-viewer.js';

function fakeHost(label: string) {
  let snapshot: HostSnapshot = { connection: { status: 'connected', route: label } };
  const listeners = new Set<() => void>();
  const calls: { path: string; init?: HostApiInit }[] = [];
  let first = true;
  let takeover: ((answer: HostApiAnswer) => void) | undefined;
  let delayTakeover = false;
  let delayInput = false;
  let input: (() => void) | undefined;
  const api = vi.fn(async (path: string, init?: HostApiInit): Promise<HostApiAnswer> => {
    calls.push({ path, ...(init === undefined ? {} : { init }) });
    if (path.endsWith('/input') && delayInput) {
      delayInput = false;
      return new Promise((resolve) => {
        input = () => resolve({ status: 200, body: {} });
      });
    }
    if (path.includes('/takeover')) {
      if (delayTakeover && init?.body?.['active'] === true)
        return new Promise((resolve) => {
          takeover = resolve;
        });
      return {
        status: 200,
        body: { takeover: init?.body?.['active'], paused: init?.body?.['active'] },
      };
    }
    if (path.includes('/observation')) return { status: 200, body: { takeover: false } };
    if (path.includes('/frame')) {
      if (first) {
        first = false;
        return {
          status: 200,
          body: {
            seq: 1,
            data: label,
            width: 100,
            height: 100,
            viewport: { width: 100, height: 100 },
            mode: 'stream',
          },
        };
      }
      return new Promise((_resolve, reject) => {
        const fail = () => reject(new DOMException('aborted', 'AbortError'));
        if (init?.signal?.aborted) fail();
        else init?.signal?.addEventListener('abort', fail, { once: true });
      });
    }
    return { status: 200, body: {} };
  });
  const client: Pick<HostClient, 'api' | 'subscribe' | 'getSnapshot'> = {
    api,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    client,
    calls,
    pauseInput() {
      delayInput = true;
    },
    finishInput() {
      input?.();
    },
    delay() {
      delayTakeover = true;
    },
    finish() {
      takeover?.({ status: 200, body: { takeover: true, paused: true } });
    },
    connection(status: 'connected' | 'stopped' | 'refused') {
      first = true;
      snapshot = {
        connection:
          status === 'refused'
            ? { status, route: label, code: 'device-revoked', reason: 'revoked' }
            : { status, route: label },
      };
      for (const listener of listeners) listener();
    },
  };
}

describe.each(['browser', 'computer'] as const)('remote %s viewer ownership', (kind) => {
  it('orders input and discards queued actions when its source closes', async () => {
    const h = fakeHost('host-b');
    const viewer = createRemoteHostViewer(h.client, kind, 'ada');
    const stop = viewer.subscribe(() => {});
    await vi.waitFor(() => expect(viewer.getSnapshot().status).toBe('live'));
    await viewer.setControl(true);
    h.pauseInput();
    const first = viewer.send({ kind: 'click', x: 10, y: 10 });
    const second = viewer.send({ kind: 'type', text: 'after-focus' });
    await vi.waitFor(() =>
      expect(h.calls.filter((call) => call.path.endsWith('/input'))).toHaveLength(1),
    );
    h.finishInput();
    await Promise.all([first, second]);
    expect(h.calls.filter((call) => call.path.endsWith('/input'))).toHaveLength(2);
    h.pauseInput();
    const third = viewer.send({ kind: 'click', x: 20, y: 20 });
    const fourth = viewer.send({ kind: 'type', text: 'discarded' });
    await vi.waitFor(() =>
      expect(h.calls.filter((call) => call.path.endsWith('/input'))).toHaveLength(3),
    );
    stop();
    h.finishInput();
    await Promise.all([third, fourth]);
    expect(h.calls.filter((call) => call.path.endsWith('/input'))).toHaveLength(3);
  });

  it('keeps equal Bot slugs on two Hosts separate and sends only after takeover', async () => {
    const a = fakeHost('host-a');
    const b = fakeHost('host-b');
    const va = createRemoteHostViewer(a.client, kind, 'ada');
    const vb = createRemoteHostViewer(b.client, kind, 'ada');
    const stopA = va.subscribe(() => {});
    const stopB = vb.subscribe(() => {});
    await vi.waitFor(() => expect(va.getSnapshot().status).toBe('live'));
    await vi.waitFor(() => expect(vb.getSnapshot().status).toBe('live'));
    expect(va.getSnapshot().frame?.uri).toContain('host-a');
    expect(vb.getSnapshot().frame?.uri).toContain('host-b');
    await vb.send({ kind: 'type', text: 'blocked' });
    expect(b.calls.some((call) => call.path.endsWith('/input'))).toBe(false);
    await vb.setControl(true);
    await vb.send({ kind: 'type', text: 'only-b' });
    expect(a.calls.some((call) => call.path.endsWith('/input'))).toBe(false);
    expect(b.calls.find((call) => call.path.endsWith('/input'))?.init?.body).toMatchObject({
      text: 'only-b',
    });
    stopA();
    stopB();
    expect(vb.getSnapshot().frame).toBeUndefined();
    await vi.waitFor(() =>
      expect(b.calls.filter((call) => call.init?.body?.['active'] === false)).toHaveLength(1),
    );
    expect(
      b.calls.find((call) => call.path.includes('/frame?after=') || call.path.includes('&after='))
        ?.init?.signal?.aborted,
    ).toBe(true);
  });

  it('releases a late takeover on its original Host and rejects late input after close', async () => {
    const h = fakeHost('host-b');
    const viewer = createRemoteHostViewer(h.client, kind, 'ada');
    const stop = viewer.subscribe(() => {});
    await vi.waitFor(() => expect(viewer.getSnapshot().status).toBe('live'));
    h.delay();
    const taking = viewer.setControl(true);
    stop();
    await viewer.send({ kind: 'click', x: 10, y: 10 });
    expect(h.calls.filter((call) => call.path.endsWith('/input'))).toHaveLength(0);
    h.finish();
    await taking;
    await vi.waitFor(() =>
      expect(h.calls.filter((call) => call.init?.body?.['active'] === false)).toHaveLength(1),
    );
  });

  it('clears the frame on revocation and reconnects without replaying input or takeover', async () => {
    const h = fakeHost('host-b');
    const viewer = createRemoteHostViewer(h.client, kind, 'ada');
    const stop = viewer.subscribe(() => {});
    await vi.waitFor(() => expect(viewer.getSnapshot().status).toBe('live'));
    await viewer.setControl(true);
    h.connection('stopped');
    expect(viewer.getSnapshot()).toMatchObject({ status: 'unreachable', control: false });
    expect(viewer.getSnapshot().frame).toBeUndefined();
    await viewer.send({ kind: 'type', text: 'never-replay' });
    h.connection('connected');
    await vi.waitFor(() => expect(viewer.getSnapshot().status).toBe('live'));
    expect(viewer.getSnapshot().control).toBe(false);
    expect(h.calls.filter((call) => call.init?.body?.['active'] === true)).toHaveLength(1);
    expect(h.calls.filter((call) => call.path.endsWith('/input'))).toHaveLength(0);
    h.connection('refused');
    expect(viewer.getSnapshot().status).toBe('refused');
    expect(viewer.getSnapshot().frame).toBeUndefined();
    stop();
  });

  it('waits for a closing viewer before a replacement reads the same runtime', async () => {
    const h = fakeHost('host-b');
    const old = createRemoteHostViewer(h.client, kind, 'ada');
    const stop = old.subscribe(() => {});
    await vi.waitFor(() => expect(old.getSnapshot().status).toBe('live'));
    h.delay();
    const taking = old.setControl(true);
    const replacement = createRemoteHostViewer(h.client, kind, 'ada');
    stop();
    const before = h.calls.length;
    const stopReplacement = replacement.subscribe(() => {});
    await Promise.resolve();
    expect(h.calls).toHaveLength(before);
    h.finish();
    await taking;
    await vi.waitFor(() => expect(h.calls.length).toBeGreaterThan(before));
    expect(h.calls[before]?.init?.body?.['active']).toBe(false);
    stopReplacement();
  });
});
