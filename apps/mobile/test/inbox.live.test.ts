import { existsSync, readFileSync, rmSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createHostClient, type HostClient } from '../src/host/client';
import { createInbox, type Inbox } from '../src/host/inbox';
import {
  answerQuestion,
  decideApproval,
  loadApproval,
  loadQuestion,
  requestRef,
  type RequestRef,
} from '../src/host/requests';
import type { HumanAttentionItem } from '../src/host/wire';
import { pairWithLiveHost } from './live-pairing';
import { nodeCarrier } from './node-carrier';

const live = process.env['MOBILE_LIVE_HOST_URL'];

async function until<T>(read: () => T | undefined, what: string, ms = 120_000): Promise<T> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const value = read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${what}`);
}

function action(inbox: Inbox, kind: string, since: string): HumanAttentionItem | undefined {
  const snapshot = inbox.getSnapshot();
  if (snapshot.status !== 'ready') return undefined;
  return snapshot.sections.action.find((item) => item.kind === kind && item.createdAt > since);
}

function listed(inbox: Inbox, id: string): boolean | undefined {
  const snapshot = inbox.getSnapshot();
  return snapshot.status !== 'ready'
    ? undefined
    : snapshot.sections.action.some((item) => item.id === id);
}

describe.skipIf(live === undefined)('Human Inbox against a live isolated Host', () => {
  it('approves a Tool call, sees a computer decision, and answers a question', async () => {
    const phone = await pairWithLiveHost(live!, 'mobile inbox live test');
    const other = await pairWithLiveHost(live!, 'mobile inbox live test, other device');
    const client: HostClient = createHostClient({
      routes: phone.host.routes,
      credential: phone.host.credential,
      carrier: nodeCarrier(),
    });
    client.start();
    const inbox = createInbox(client);
    const computer = createHostClient({
      routes: other.host.routes,
      credential: other.host.credential,
      carrier: nodeCarrier(),
    });
    const marker = `/tmp/mobile-inbox-${Date.now()}.txt`;
    try {
      await until(
        () => (client.getSnapshot().connection.status === 'connected' ? true : undefined),
        'connected',
      );
      const bot = client.getSnapshot().roster!.bots[0]!;
      await until(() => (inbox.getSnapshot().status === 'ready' ? true : undefined), 'inbox');
      const idle = () =>
        until(
          () => (client.getSnapshot().roster?.bots[0]?.state === 'idle' ? true : undefined),
          'the Bot to settle',
        );
      let since = new Date().toISOString();
      const say = (body: string) => {
        since = new Date().toISOString();
        return computer.call('channelSend', {
          channelId: `dm-${bot.slug}`,
          body,
          messageId: `human-${crypto.randomUUID()}`,
        });
      };
      await idle();

      await say(`Use your bash tool now to run exactly: echo approved > ${marker}`);
      const first = await until(() => action(inbox, 'tool-approval', since), 'a Tool approval');
      const firstRef = requestRef(first)!;
      const approval = await loadApproval(client, firstRef);
      expect(approval).toMatchObject({ toolName: 'bash', status: 'pending' });
      expect(approval.input).toContain(marker);
      expect(await decideApproval(client, firstRef, 'allowed-once')).toBe('accepted');
      await until(() => (listed(inbox, first.id) === false ? true : undefined), 'item to leave');
      await until(() => (existsSync(marker) ? true : undefined), 'the approved command');
      expect(readFileSync(marker, 'utf8').trim()).toBe('approved');
      expect(await decideApproval(client, firstRef, 'rejected')).toBe('decided');
      expect((await loadApproval(client, firstRef)).outcome).toBe('allowed-once');

      await idle();
      await say(`Use your bash tool now to run exactly: rm ${marker}`);
      const second = await until(() => action(inbox, 'tool-approval', since), 'a second approval');
      const secondRef: RequestRef = requestRef(second)!;
      await computer.call('toolApprovalDecide', {
        channelId: secondRef.channelId,
        messageId: secondRef.messageId,
        outcome: 'rejected',
      });
      await until(() => (listed(inbox, second.id) === false ? true : undefined), 'live removal');
      expect(await decideApproval(client, secondRef, 'allowed-once')).toBe('decided');
      expect(existsSync(marker)).toBe(true);

      await idle();
      await say(
        'Use your ask_user_question tool now to ask me one question: "Which colour?" with the options "Teal" and "Amber". After I answer, reply with only the colour I chose.',
      );
      const asked = await until(() => action(inbox, 'user-question', since), 'a Human question');
      const askedRef = requestRef(asked)!;
      const question = await loadQuestion(client, askedRef);
      expect(question.status).toBe('pending');
      const item = question.questions[0]!;
      const teal = item.options?.find((option) => /teal/iu.test(option.label));
      expect(teal).toBeDefined();
      expect(
        await answerQuestion(client, askedRef, {
          answers: question.questions.map((entry) =>
            entry.id === item.id
              ? { id: entry.id, selected: [teal!.label] }
              : { id: entry.id, selected: [], custom: 'no preference' },
          ),
        }),
      ).toBe('accepted');
      await until(
        () => (listed(inbox, asked.id) === false ? true : undefined),
        'question to leave',
      );
      let botReply: string | undefined;
      let reading = false;
      const readReply = async () => {
        if (reading) return;
        reading = true;
        const { page } = await computer.call<{
          page: { entries: { id: string; body: string; author: { kind: string } }[] };
        }>('channelTimeline', {
          channelId: askedRef.channelId,
          direction: 'around',
          around: askedRef.messageId,
          olderLimit: 0,
          newerLimit: 20,
        });
        botReply = page.entries.find(
          (entry) => entry.id !== askedRef.messageId && entry.author.kind === 'bot',
        )?.body;
        reading = false;
      };
      await until(() => {
        void readReply();
        return botReply;
      }, 'the Bot to reply after the answer');
      expect(botReply).toMatch(/teal/iu);
      expect(
        await answerQuestion(client, askedRef, {
          answers: [{ id: item.id, selected: [teal!.label] }],
        }),
      ).toBe('decided');
    } finally {
      rmSync(marker, { force: true });
      inbox.stop();
      client.stop();
      computer.stop();
    }
  }, 600_000);
});
