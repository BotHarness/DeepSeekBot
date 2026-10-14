import { describe, expect, it } from 'vitest';

import { createHostClient, type HostClient } from '../src/host/client';
import { createConversation, type ConversationSnapshot } from '../src/host/conversation';
import { pairWithLiveHost } from './live-pairing';
import { nodeCarrier } from './node-carrier';

const live = process.env['MOBILE_LIVE_HOST_URL'];

async function until<T>(read: () => T, accept: (value: T) => boolean, ms = 90_000): Promise<T> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const value = read();
    if (accept(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out; last ${JSON.stringify(read()).slice(0, 2000)}`);
}

function unique(snapshot: ConversationSnapshot): boolean {
  const ids = snapshot.messages.map((message) => message.id);
  const revisions = snapshot.messages.flatMap((message) =>
    message.revision === undefined ? [] : [message.revision],
  );
  return (
    new Set(ids).size === ids.length &&
    revisions.every((value, index) => index === 0 || value === revisions[index - 1]! + 1)
  );
}

describe.skipIf(live === undefined)('DM conversation against a live isolated Host', () => {
  it('sends, streams the real reply and resumes after the app was away', async () => {
    const { route, operator: actor, host } = await pairWithLiveHost(live!, 'mobile DM live test');
    const client: HostClient = createHostClient({
      routes: host.routes,
      credential: host.credential,
      carrier: nodeCarrier(),
    });
    client.start();
    try {
      await until(client.getSnapshot, (s) => s.connection.status === 'connected', 20_000);
      let bot = client.getSnapshot().roster?.bots[0];
      if (bot === undefined) {
        await client.call('create', { displayName: 'Mobile DM Probe', roles: ['tester'] });
        await client.refresh();
        bot = client.getSnapshot().roster!.bots[0]!;
      }
      const conversation = createConversation({
        host: client,
        botSlug: bot.slug,
        displayName: bot.displayName,
      });
      const drafts: string[] = [];
      conversation.subscribe(() => {
        const body = conversation.getSnapshot().drafts[0]?.body;
        if (body !== undefined && body !== drafts.at(-1)) drafts.push(body);
      });
      conversation.start();
      await until(conversation.getSnapshot, (s) => s.status === 'live', 20_000);
      const marker = `mobile DM probe ${Date.now().toString(36)}`;
      const id = conversation.send(`${marker}: reply with one short Markdown list of two fruits.`);
      expect(conversation.getSnapshot().messages.at(-1)).toMatchObject({ id, delivery: 'pending' });
      const replied = await until(conversation.getSnapshot, (s) => {
        const index = s.messages.findIndex((message) => message.id === id);
        return (
          index >= 0 &&
          s.messages[index]!.revision !== undefined &&
          s.messages.slice(index + 1).some((message) => message.author === 'bot')
        );
      });
      expect(unique(replied)).toBe(true);
      console.info(`drafts observed: ${drafts.length}; reply: ${replied.messages.at(-1)?.body}`);

      client.stop();
      const away = `human-${crypto.randomUUID()}`;
      await actor.request(`${route}/api/botharness/channelSend`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({
          type: 'client-request',
          rpcId: crypto.randomUUID(),
          method: 'botharness/channelSend',
          payload: {
            args: {
              channelId: `dm-${bot.slug}`,
              body: `${marker}: sent while away`,
              messageId: away,
            },
          },
        }),
      });
      client.start();
      const resumed = await until(
        conversation.getSnapshot,
        (s) => s.status === 'live' && s.messages.some((message) => message.id === away),
      );
      expect(unique(resumed)).toBe(true);
      expect(resumed.messages.filter((message) => message.id === id)).toHaveLength(1);
      conversation.stop();
    } finally {
      client.stop();
    }
  }, 180_000);
});
