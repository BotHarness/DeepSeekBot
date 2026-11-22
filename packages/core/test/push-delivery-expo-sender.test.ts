import { describe, expect, it } from 'vitest';
import { type ExpoMessage } from '../src/push/delivery.js';
import { createExpoSender } from '../src/push/expo-sender.js';
import { TOKEN_A } from './push-delivery-fixtures.js';

describe('Expo sender', () => {
  it('posts to Expo Push Service and classifies failures for retry', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const answers = [
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 't1' }] }), { status: 200 }),
      new Response('busy', { status: 503 }),
      new Response(JSON.stringify({ errors: [{ code: 'PUSH_TOO_MANY_EXPERIENCE_IDS' }] }), {
        status: 400,
      }),
    ];
    const sender = createExpoSender((async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return answers.shift()!;
    }) as typeof fetch);
    const message: ExpoMessage = { to: TOKEN_A, badge: 0, data: { v: 1, hostId: 'h' } };
    expect(await sender.send([message])).toEqual([{ status: 'ok', id: 't1' }]);
    expect(calls[0]).toEqual({ url: 'https://exp.host/--/api/v2/push/send', body: [message] });
    await expect(sender.send([message])).rejects.toMatchObject({ retryable: true });
    await expect(sender.send([message])).rejects.toMatchObject({ retryable: false });
  });
});
