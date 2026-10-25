import { randomBytes } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { ConnectChannel } from '../../../packages/core/src/devices/noise/channel';
import { noisePublicKey } from '../../../packages/core/src/devices/noise/xk';
import { encryptedCarrier } from '../src/host/encrypted-carrier';
import type { HostSocketEvents } from '../src/host/carrier';

afterEach(() => vi.unstubAllGlobals());

function connected() {
  const key = randomBytes(32);
  const received: Record<string, unknown>[] = [];
  const outer: string[] = [];
  const request = vi.fn();
  const carrier = encryptedCarrier({
    hostId: 'host',
    credential: 'synthetic-credential',
    encryption: {
      protocol: 'connect-noise-xk-v1',
      hostKey: Buffer.from(noisePublicKey(key)).toString('hex'),
      deviceKey: randomBytes(32).toString('hex'),
    },
    raw: {
      request,
      openSocket(_url: string, events: HostSocketEvents) {
        const peer = new ConnectChannel({
          role: 'responder',
          hostId: 'host',
          staticKey: key,
          hostKey: noisePublicKey(key),
          ephemeralKey: randomBytes(32),
        });
        const reply = (value: unknown) => {
          for (const wire of peer.send(JSON.stringify(value)))
            queueMicrotask(() => events.message(wire));
        };
        queueMicrotask(events.open);
        return {
          close: () => peer.close(),
          send(wire: string) {
            outer.push(wire);
            const decoded = peer.receive(wire);
            if (decoded.reply) queueMicrotask(() => events.message(decoded.reply!));
            if (decoded.message) {
              const value = JSON.parse(decoded.message);
              if (value.type === 'admit') reply({ type: 'admitted' });
              if (value.type === 'request') {
                received.push(value);
                reply({ type: 'response', id: value.id, status: 200, body: btoa('{}') });
              }
              reply({ type: 'ack', credit: value.credit });
            }
          },
        };
      },
    },
  });
  return { carrier, received, outer, request };
}

it('uploads a native Blob without arrayBuffer through the authenticated channel', async () => {
  const blob = new Blob(['native-upload-sentinel']);
  Object.defineProperty(blob, 'arrayBuffer', { value: undefined });
  vi.stubGlobal(
    'FileReader',
    class {
      result: ArrayBuffer | null = null;
      onload?: () => void;
      readAsArrayBuffer(value: Blob) {
        void Blob.prototype.arrayBuffer.call(value).then((result) => {
          this.result = result;
          this.onload?.();
        });
      }
    },
  );
  const { carrier, received, outer, request } = connected();
  try {
    await expect(
      carrier.request(
        'https://host.deepseekbot.dev/botharness-device/api/botharness/attachment/upload?name=qa.png',
        {
          method: 'POST',
          body: blob,
          signal: new AbortController().signal,
        },
      ),
    ).resolves.toMatchObject({ status: 200 });
    expect(received).toHaveLength(1);
    expect(received[0]?.body).toBe('bmF0aXZlLXVwbG9hZC1zZW50aW5lbA==');
    expect(outer.join('')).not.toContain('native-upload-sentinel');
    expect(request).not.toHaveBeenCalled();
  } finally {
    carrier.close?.();
  }
});

it.each(['error', 'throw', 'invalid-result', 'cancel'] as const)(
  'refuses a native Blob %s without sending a request or falling back',
  async (failure) => {
    const signal = new AbortController();
    const blob = new Blob(['do-not-send']);
    Object.defineProperty(blob, 'arrayBuffer', { value: undefined });
    const abort = vi.fn();
    vi.stubGlobal(
      'FileReader',
      class {
        result: unknown = 'invalid';
        onload?: () => void;
        onerror?: () => void;
        abort = abort;
        readAsArrayBuffer() {
          if (failure === 'throw') throw new Error('native read refused');
          if (failure === 'cancel') signal.abort();
          else if (failure === 'error') this.onerror?.();
          else this.onload?.();
        }
      },
    );
    const { carrier, received, request } = connected();
    try {
      await expect(
        carrier.request(
          'https://host.deepseekbot.dev/botharness-device/api/botharness/attachment/upload',
          {
            method: 'POST',
            body: blob,
            signal: signal.signal,
          },
        ),
      ).rejects.toThrow(failure === 'cancel' ? 'request-cancelled' : 'channel-body-read-failed');
      expect(received).toEqual([]);
      expect(request).not.toHaveBeenCalled();
      if (failure === 'cancel') expect(abort).toHaveBeenCalledOnce();
    } finally {
      carrier.close?.();
    }
  },
);
