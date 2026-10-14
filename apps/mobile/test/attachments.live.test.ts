import { describe, expect, it } from 'vitest';

import { createHostClient } from '../src/host/client';
import { createConversation, type ConversationSnapshot } from '../src/host/conversation';
import { pairWithLiveHost } from './live-pairing';
import { nodeCarrier } from './node-carrier';

const live = process.env['MOBILE_LIVE_HOST_URL'];

const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (char) => char.charCodeAt(0),
);
const PDF = '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n';

async function until<T>(read: () => T, accept: (value: T) => boolean, ms = 20_000): Promise<T> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const value = read();
    if (accept(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out; last ${JSON.stringify(read()).slice(0, 2000)}`);
}

describe.skipIf(live === undefined)('attachments against a live isolated Host', () => {
  it('uploads a file through the device gateway and gets a Channel attachment back', async () => {
    const { host } = await pairWithLiveHost(live!, 'mobile attachment live test');
    const client = createHostClient({
      routes: host.routes,
      credential: host.credential,
      carrier: nodeCarrier(),
    });
    const text = `mobile attachment ${Date.now()}`;
    const ref = await client.upload('note.txt', new Blob([text]));
    expect(ref).toMatchObject({ name: 'note.txt', size: text.length });
    expect(ref.mime).toMatch(/^text\/plain/u);
    expect(ref.fileId ?? ref.hash).toMatch(/^(file|sha256):/u);
  });

  it('sends a photo and a PDF, then loads both back from the committed message', async () => {
    const { host } = await pairWithLiveHost(live!, 'mobile attachment view live test');
    const client = createHostClient({
      routes: host.routes,
      credential: host.credential,
      carrier: nodeCarrier(),
    });
    client.start();
    try {
      await until(client.getSnapshot, (s) => s.connection.status === 'connected');
      let bot = client.getSnapshot().roster?.bots[0];
      if (bot === undefined) {
        await client.call('create', { displayName: 'Mobile Attachment Probe', roles: ['tester'] });
        await client.refresh();
        bot = client.getSnapshot().roster!.bots[0]!;
      }
      const conversation = createConversation({
        host: client,
        botSlug: bot.slug,
        displayName: bot.displayName,
      });
      conversation.subscribe(() => {});
      conversation.start();
      await until(conversation.getSnapshot, (s) => s.status === 'live');
      const id = conversation.send('', [
        { name: 'dot.png', kind: 'image', read: async () => new Blob([PNG]) },
        { name: 'brief.pdf', kind: 'file', read: async () => new Blob([PDF]) },
      ]);
      const committed: ConversationSnapshot = await until(conversation.getSnapshot, (s) =>
        s.messages.some((message) => message.id === id && message.revision !== undefined),
      );
      const attachments = committed.messages.find((message) => message.id === id)!.attachments;
      expect(attachments.map(({ kind, name, mime }) => ({ kind, name, mime }))).toEqual([
        { kind: 'image', name: 'dot.png', mime: 'image/png' },
        { kind: 'file', name: 'brief.pdf', mime: 'application/pdf' },
      ]);
      for (const [index, attachment] of attachments.entries()) {
        expect(attachment.source?.uri).toContain('/botharness-device/api/botharness/attachment?');
        const response = await fetch(attachment.source!.uri, {
          headers: attachment.source!.headers,
        });
        expect(response.status).toBe(200);
        const bytes = new Uint8Array(await response.arrayBuffer());
        expect(bytes).toEqual(index === 0 ? PNG : new TextEncoder().encode(PDF));
      }
      conversation.stop();
    } finally {
      client.stop();
    }
  });
});
