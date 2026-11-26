import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { afterEach, expect, it } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { parseBlockCommand } from '../src/messaging/interactions/role-text.js';
import { fixture, cleanup } from './messaging-default-traffic-fixtures.js';
import {
  channelMessage,
  ids,
  pendingFor,
  reviewerSetup,
  type Fixture,
} from './messaging-pairing-text-fixtures.js';

afterEach(cleanup);

const { applicant, reviewer, other } = ids.slack;
const anchor = { threadId: 'om-blocked', rootId: 'om-blocked' };

function command(id: string, actorId: string, text: string, target = applicant) {
  const event = channelMessage('slack', id, actorId, text.replace('@target', `@${target}`));
  return {
    ...event,
    mentions: [
      ...event.mentions,
      ...(text.includes('@target') ? [{ id: target, key: `@${target}`, name: 'Ana' }] : []),
    ],
  };
}

async function setup() {
  const fx = await fixture('slack');
  await reviewerSetup(fx, 'slack', ['review-pairing'], ['approve']);
  await fx.receive(channelMessage('slack', 'blocked', applicant, 'question'));
  await fx.receive(channelMessage('slack', 'approve', reviewer, '同意', anchor, false));
  await fx.settle();
  expect(pendingFor(fx, applicant).status).toBe('approved');
  return fx;
}

const blocks = async (fx: Fixture) =>
  (await fx.core.externalMessaging.snapshot('ada')).senderBlocks ?? [];

it('parses block commands in both languages', () => {
  expect(parseBlockCommand('/block')).toEqual({ action: 'block' });
  expect(parseBlockCommand('／屏蔽 ')).toEqual({ action: 'block' });
  expect(parseBlockCommand('/取消屏蔽')).toEqual({ action: 'unblock' });
  expect(parseBlockCommand('/unblock now')).toBeUndefined();
  expect(parseBlockCommand('/blocked')).toBeUndefined();
});

it('a reviewer blocks a paired person in IM, whose messages then never reach the Inbox', async () => {
  const fx = await setup();
  await fx.receive(channelMessage('slack', 'before', applicant, 'first'));
  await fx.settle();
  const admitted = fx.admissions().length;
  expect(admitted).toBeGreaterThan(0);

  await fx.receive(command('block', reviewer, '/屏蔽 @target'));
  expect(fx.replies.at(-1)!.text).toBe(
    'Blocked @Ana. This Bot no longer receives their messages. / 已屏蔽 @Ana，此 Bot 不再接收其消息。',
  );
  expect(await blocks(fx)).toEqual([
    expect.objectContaining({
      actorId: applicant,
      actorName: 'Ana',
      blockedBy: 'paired-reviewer',
      reviewerActorId: reviewer,
    }),
  ]);
  await fx.receive(command('again', reviewer, '/block @target'));
  expect(fx.replies.at(-1)!.text).toContain('already blocked');

  const replies = fx.replies.length;
  await fx.receive(channelMessage('slack', 'while', applicant, 'second'));
  await fx.receive(command('grant', applicant, '/grant @target approve', other));
  await fx.settle();
  expect(fx.admissions()).toHaveLength(admitted);
  expect(fx.replies).toHaveLength(replies);

  await fx.receive(command('unblock', reviewer, '/取消屏蔽 @target'));
  expect(fx.replies.at(-1)!.text).toBe('Unblocked @Ana. / 已取消屏蔽 @Ana。');
  expect(await blocks(fx)).toEqual([]);
  await fx.receive(channelMessage('slack', 'after', applicant, 'third'));
  await fx.settle();
  expect(fx.admissions().length).toBeGreaterThan(admitted);
});

it('a blocked unpaired sender gets no pairing notice and no request', async () => {
  const fx = await fixture('slack');
  await reviewerSetup(fx, 'slack', ['review-pairing'], []);
  await fx.receive(command('block', reviewer, '/block @target', other));
  expect(fx.replies.at(-1)!.text).toContain('Blocked @Ana');
  const replies = fx.replies.length;
  await fx.receive(channelMessage('slack', 'stranger', other, 'hello'));
  await fx.settle();
  expect(fx.replies).toHaveLength(replies);
  expect(fx.core.externalMessaging.pairing.list('ada').some((p) => p.actorId === other)).toBe(
    false,
  );
  expect(fx.admissions()).toEqual([]);
});

it('refuses oneself, non-reviewers and people with more authority than the sender can delegate', async () => {
  const fx = await setup();
  await fx.receive(command('self', reviewer, '/block @target', reviewer));
  expect(fx.replies.at(-1)!.text).toBe('You cannot block yourself. / 不能屏蔽自己。');
  await fx.receive(command('member', applicant, '/block @target', other));
  expect(fx.replies.at(-1)!.text).toContain('can block senders');
  await fx.receive(command('none', reviewer, '/block'));
  expect(fx.replies.at(-1)!.text).toContain('Mention exactly one person');

  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core });
  const person = pendingFor(fx, applicant);
  expect(
    await methods.senderAccess({
      slug: 'ada',
      input: {
        kind: 'person-permissions',
        id: person.id,
        expectedRevision: person.revision,
        allow: ['reject'],
        deny: [],
      },
    }),
  ).toMatchObject({ ok: true });
  await fx.receive(command('above', reviewer, '/block @target'));
  expect(fx.replies.at(-1)!.text).toBe(
    'You cannot block or unblock @Ana. / 你不能屏蔽或取消屏蔽 @Ana。',
  );
  expect(await blocks(fx)).toEqual([]);
  expect(fx.runs).toHaveLength(0);
});

it('the owner blocks and unblocks through the Host bridge, and a block removes capabilities', async () => {
  const fx = await setup();
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core });
  const reviewerPairing = pendingFor(fx, reviewer);
  expect(
    fx.core.externalMessaging.pairing.list('ada').find((item) => item.id === reviewerPairing.id)!
      .capabilities,
  ).toContain('review-pairing');
  expect(
    await methods.senderAccess({
      slug: 'ada',
      input: { kind: 'block-sender', bindingId: reviewerPairing.bindingId, actorId: reviewer },
    }),
  ).toMatchObject({ ok: true });
  const [block] = await blocks(fx);
  expect(block).toMatchObject({ actorId: reviewer, blockedBy: 'authenticated-web', revision: 1 });
  expect(pendingFor(fx, reviewer).capabilities).toEqual([]);

  const replies = fx.replies.length;
  await fx.receive(command('blocked-reviewer', reviewer, '/block @target'));
  expect(fx.replies).toHaveLength(replies);

  expect(
    await methods.senderAccess({
      slug: 'ada',
      input: {
        kind: 'unblock-sender',
        bindingId: reviewerPairing.bindingId,
        actorId: reviewer,
        expectedRevision: 1,
      },
    }),
  ).toMatchObject({ ok: true });
  expect(await blocks(fx)).toEqual([]);
  expect(pendingFor(fx, reviewer).capabilities).toContain('review-pairing');

  await methods.senderAccess({
    slug: 'ada',
    input: { kind: 'block-sender', bindingId: reviewerPairing.bindingId, actorId: reviewer },
  });
  const [again] = await blocks(fx);
  expect(again).toMatchObject({ revision: 3 });
  expect(again).not.toHaveProperty('unblockedAt');
  expect(
    await methods.senderAccess({
      slug: 'ada',
      input: {
        kind: 'unblock-sender',
        bindingId: reviewerPairing.bindingId,
        actorId: reviewer,
        expectedRevision: 1,
      },
    }),
  ).toMatchObject({ ok: false });
  expect(await blocks(fx)).toHaveLength(1);
});
