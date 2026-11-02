import { describe, expect, it } from 'vitest';
import { createHostClient } from '../src/host/client';
import { createMessageFeedback } from '../src/host/message-feedback';
import type { HostCarrier } from '../src/host/carrier';

describe('phone feedback through the authenticated Host client', () => {
  it('previews selected evidence and retries the same frozen submission', async () => {
    const requests: Array<{ url: string; body: unknown; credential: string | undefined }> = [];
    let submits = 0;
    const carrier: HostCarrier = {
      openSocket: () => ({ send() {}, close() {} }),
      async request(url, init) {
        requests.push({
          url,
          body: JSON.parse(String(init.body)),
          credential: init.headers?.authorization,
        });
        if (url.endsWith('/preview'))
          return {
            status: 200,
            text: async () =>
              JSON.stringify({
                token: 'preview-token',
                canSubmit: true,
                bytes: 12,
                files: [{ path: 'manifest.json', content: '{}' }],
                summary: { channels: [], sessions: [], admissions: 0, omissions: [] },
              }),
          };
        submits++;
        return {
          status: submits === 1 ? 503 : 200,
          text: async () =>
            JSON.stringify(
              submits === 1
                ? { error: { code: 'upload-failed' } }
                : { reportId: 'report-1', expiresAt: '2026-11-25' },
            ),
        };
      },
    };
    const client = createHostClient({
      routes: ['https://example.ts.net'],
      credential: 'phone.secret',
      carrier,
    });
    const feedback = createMessageFeedback(client);
    const preview = await feedback.preview({ channelId: 'chat', messageId: 'anchor' });
    expect(preview.files[0]?.path).toBe('manifest.json');
    const report = {
      token: preview.token,
      feedback: { rating: 'bad' as const, tags: ['slow'], comment: 'Synthetic' },
    };
    await expect(feedback.submit(report)).rejects.toThrow('upload-failed');
    expect(await feedback.submit(report)).toEqual({
      reportId: 'report-1',
    });
    expect(requests[0]?.url).toBe(
      'https://example.ts.net/botharness-device/api/botharness/message-feedback/preview',
    );
    expect(requests.every((r) => r.credential === 'Device phone.secret')).toBe(true);
    expect(requests[1]?.body).toEqual(requests[2]?.body);
    client.stop();
  });
});

it('downloads evidence bytes through the same authenticated gateway', async () => {
  const bytes = new Uint8Array([80, 75, 3, 4]);
  const client = createHostClient({
    routes: ['https://example.ts.net'],
    credential: 'phone.secret',
    carrier: {
      openSocket: () => ({ send() {}, close() {} }),
      async request(url, init) {
        expect(url).toContain('/botharness-device/api/botharness/message-feedback/download');
        expect(init.headers?.authorization).toBe('Device phone.secret');
        return {
          status: 200,
          text: async () => {
            throw new Error('binary must not decode as text');
          },
          bytes: async () => bytes,
        };
      },
    },
  });
  expect(await createMessageFeedback(client).download('preview-token')).toEqual(bytes);
  client.stop();
});
