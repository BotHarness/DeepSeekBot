import { afterEach, expect, it } from 'vitest';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { botSourceBlocks, sourceBlocked } from '../src/messaging/permissions/index.js';
import { toolApprovalRequired, toolEffects } from '../src/workspaces/tool-effects.js';
import { fixture, cleanup } from './messaging-default-traffic-fixtures.js';
import {
  channelMessage,
  directMessage,
  ids,
  pendingFor,
  reviewerSetup,
  type Fixture,
} from './messaging-pairing-text-fixtures.js';

afterEach(cleanup);

const { applicant, reviewer, channel } = ids.slack;
const owner = 'UQAOWNER';
const anchor = { threadId: 'om-first', rootId: 'om-first' };

async function setup() {
  const fx = await fixture('slack');
  await reviewerSetup(fx, 'slack', ['review-pairing'], ['approve']);
  await fx.receive(channelMessage('slack', 'first', applicant, 'question'));
  await fx.receive(channelMessage('slack', 'approve', reviewer, '同意', anchor, false));
  await fx.settle();
  expect(pendingFor(fx, applicant).status).toBe('approved');
  await fx.receive(channelMessage('slack', 'asked', applicant, 'question again'));
  await fx.receive({ ...directMessage('slack', 'pair', owner, '/pair') });
  const management = fx.core.externalMessaging.pairing
    .list('ada')
    .find((item) => item.actorId === owner)!;
  await fx.core.externalMessaging.reviewPairing('ada', {
    kind: 'approve',
    id: management.id,
    expectedRevision: management.revision,
    capabilities: ['approve'],
  });
  return fx;
}

const blocked = (fx: Fixture, actorId: string, kind: 'dm' | 'group' = 'group') =>
  attachOperationalModule(fx.core.operationalDatabase, 'test').read((db) =>
    sourceBlocked(db, 'ada', {
      fingerprint: fx.identity.fingerprint,
      actor: { kind: 'user', id: actorId },
      conversation: { kind, id: kind === 'group' ? channel : 'DQAREV' },
    }),
  );

it('the Bot blocks a conversation, drops everyone in it except the Owner, and unblocks it', async () => {
  const fx = await setup();
  const admitted = fx.admissions().length;
  const sourceEventId = fx.sourceId('om-asked');
  const preview = fx.core.externalMessaging.sourceBlocks('ada', {
    action: 'preview',
    scope: 'conversation',
    sourceEventId,
  });
  expect(preview).toEqual({
    target: {
      scope: 'conversation',
      name: channel,
      conversationKind: 'group',
      app: expect.any(String),
    },
  });
  expect(blocked(fx, applicant)).toBe(false);
  expect(() =>
    fx.core.externalMessaging.sourceBlocks('ada', {
      action: 'block',
      scope: 'conversation',
      sourceEventId,
      targetName: 'Someone else',
      app: (preview as { target: { app: string } }).target.app,
    }),
  ).toThrow('source-block-mismatch');
  const result = fx.core.externalMessaging.sourceBlocks('ada', {
    action: 'block',
    scope: 'conversation',
    sourceEventId,
    targetName: channel,
    app: (preview as { target: { app: string } }).target.app,
  });
  expect(result).toMatchObject({
    block: { scope: 'conversation', conversationKind: 'group', blockedBy: 'bot', revision: 1 },
  });
  expect(blocked(fx, applicant)).toBe(true);
  expect(blocked(fx, owner)).toBe(false);
  expect(blocked(fx, applicant, 'dm')).toBe(false);

  const replies = fx.replies.length;
  await fx.receive(channelMessage('slack', 'while', applicant, 'second'));
  await fx.receive(channelMessage('slack', 'command', applicant, '/grant'));
  expect(fx.admissions()).toHaveLength(admitted);
  expect(fx.replies).toHaveLength(replies);

  const snapshot = await fx.core.externalMessaging.snapshot('ada');
  expect(snapshot.conversationBlocks).toEqual([
    expect.objectContaining({ conversation: { kind: 'group', id: channel }, blockedBy: 'bot' }),
  ]);
  const list = fx.core.externalMessaging.sourceBlocks('ada', { action: 'list' });
  expect(list).toEqual({ blocks: [expect.objectContaining({ scope: 'conversation' })] });
  const [block] = (list as { blocks: { blockId: string; name: string; revision: number }[] })
    .blocks;
  const unblock = { action: 'unblock' as const, blockId: block!.blockId, targetName: block!.name };
  expect(() =>
    fx.core.externalMessaging.sourceBlocks('ada', { ...unblock, expectedRevision: 9 }),
  ).toThrow('sender-block-stale');
  expect(() =>
    fx.core.externalMessaging.sourceBlocks('ada', { ...unblock, targetName: 'Other' }),
  ).toThrow('source-block-mismatch');
  expect(
    fx.core.externalMessaging.sourceBlocks('ada', {
      ...unblock,
      expectedRevision: block!.revision,
    }),
  ).toEqual({ unblocked: true });
  expect(blocked(fx, applicant)).toBe(false);
  await fx.receive(channelMessage('slack', 'after', applicant, 'third'));
  expect(fx.admissions().length).toBeGreaterThan(admitted);
});

it('the Bot blocks one person, but never the Owner or a DM with the Owner', async () => {
  const fx = await setup();
  expect(
    fx.core.externalMessaging.sourceBlocks('ada', {
      action: 'block',
      scope: 'sender',
      sourceEventId: fx.sourceId('om-asked'),
      targetName: applicant,
      app: fx.identity.name,
    }),
  ).toMatchObject({ block: { scope: 'sender', name: applicant, blockedBy: 'bot' } });
  expect(blocked(fx, applicant, 'dm')).toBe(true);

  const ownerSource = {
    fingerprint: fx.identity.fingerprint,
    actor: { kind: 'user', id: owner },
    conversation: { kind: 'dm' as const, id: 'DQAREV' },
  };
  const database = attachOperationalModule(fx.core.operationalDatabase, 'test');
  for (const scope of ['sender', 'conversation'] as const)
    expect(() =>
      database.read((db) => botSourceBlocks(db, 'ada', { action: 'preview', scope }, ownerSource)),
    ).toThrow('sender-block-owner');

  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core });
  expect(
    await methods.senderAccess({
      slug: 'ada',
      input: { kind: 'block-sender', bindingId: fx.identity.id, actorId: owner },
    }),
  ).toMatchObject({ ok: false });
  expect(blocked(fx, owner, 'dm')).toBe(false);
});

it('the Host blocks and unblocks a conversation through sender access', async () => {
  const fx = await setup();
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core });
  const conversation = { kind: 'group' as const, id: channel };
  expect(
    await methods.senderAccess({
      slug: 'ada',
      input: { kind: 'block-conversation', bindingId: fx.identity.id, conversation, name: 'QA' },
    }),
  ).toMatchObject({ ok: true });
  expect(blocked(fx, applicant)).toBe(true);
  expect(
    await methods.senderAccess({
      slug: 'ada',
      input: { kind: 'unblock-conversation', bindingId: fx.identity.id, conversation },
    }),
  ).toMatchObject({ ok: true });
  expect(blocked(fx, applicant)).toBe(false);
});

it('blocking asks the Human first, listing does not', () => {
  const block = { action: 'block', source_event_id: 'e', target_name: 'QA', app: 'Slack' };
  expect(toolEffects('bridge_source_block', block)).toMatchObject({ authority: 'management' });
  const unblock = { action: 'unblock', block_id: 'b', target_name: 'QA' };
  expect(toolApprovalRequired('bridge_source_block', unblock, false)).toBe(true);
  for (const incomplete of [
    { action: 'block', source_event_id: 'e' },
    { action: 'block', source_event_id: 'e', target_name: 'QA' },
    { action: 'unblock', block_id: 'b' },
  ])
    expect(toolApprovalRequired('bridge_source_block', incomplete, false)).toBe(false);
  expect(toolEffects('bridge_source_block', { action: 'list' })).toEqual({
    changes: 'none',
    reach: 'local',
    personalData: true,
  });
  expect(toolApprovalRequired('bridge_source_block', { action: 'list' }, false)).toBe(false);
  expect(toolApprovalRequired('bridge_source_block', { action: 'preview' }, false)).toBe(false);
});
