import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { afterEach, expect, it } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { parseRoleCommand } from '../src/messaging/interactions/role-text.js';
import { effectivePairingPermissions } from '../src/messaging/permissions/index.js';
import { attachOperationalModule } from '../src/database/owner.js';
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

const { applicant, reviewer, other, channel } = ids.slack;
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

async function approverRole(fx: Fixture) {
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core });
  await methods.senderAccess({
    slug: 'ada',
    input: { kind: 'create-role', name: 'Approver', behavior: 'Can approve actions.' },
  });
  const created = (await fx.core.externalMessaging.snapshot('ada')).roles!.find(
    (role) => role.name === 'Approver',
  )!;
  await methods.senderAccess({
    slug: 'ada',
    input: {
      kind: 'edit-role',
      id: created.id,
      expectedRevision: created.revision,
      name: 'Approver',
      behavior: created.behavior,
      capabilities: ['approve'],
    },
  });
  return (await fx.core.externalMessaging.snapshot('ada')).roles!.find(
    (role) => role.name === 'Approver',
  )!;
}

async function pairApplicant(fx: Fixture) {
  await fx.receive(channelMessage('slack', 'blocked', applicant, 'question'));
  await fx.receive(channelMessage('slack', 'approve', reviewer, '同意 Colleague', anchor, false));
  await fx.settle();
  expect(pendingFor(fx, applicant).status).toBe('approved');
}

const capabilities = (fx: Fixture, bindingId: string, actorId: string) =>
  attachOperationalModule(fx.core.operationalDatabase, 'test').read(
    (db) => effectivePairingPermissions(db, 'ada', bindingId, actorId).capabilities,
  );

it('parses role commands without catching ordinary text', () => {
  expect(parseRoleCommand('/role')).toEqual({});
  expect(parseRoleCommand('/roles')).toEqual({});
  expect(parseRoleCommand(' /角色 Colleague ')).toEqual({ role: 'Colleague' });
  expect(parseRoleCommand('／role Approver')).toEqual({ role: 'Approver' });
  expect(parseRoleCommand('role Approver')).toBeUndefined();
  expect(parseRoleCommand('/roleplay')).toBeUndefined();
  expect(parseRoleCommand('/status')).toBeUndefined();
});

it('a reviewer grants and revokes approve by Role in a channel, without a Bot turn', async () => {
  const fx = await fixture('slack');
  const { colleague } = await reviewerSetup(fx, 'slack', ['review-pairing'], ['approve']);
  const approver = await approverRole(fx);
  await pairApplicant(fx);
  const person = pendingFor(fx, applicant);
  expect(person.roleId).toBe(colleague.id);
  expect(capabilities(fx, person.bindingId, applicant)).not.toContain('approve');

  await fx.receive(command('grant', reviewer, '/role @target Approver'));
  expect(pendingFor(fx, applicant)).toMatchObject({
    roleId: approver.id,
    reviewedBy: 'paired-reviewer',
    reviewerActorId: reviewer,
  });
  expect(capabilities(fx, person.bindingId, applicant)).toContain('approve');
  expect(fx.replies.at(-1)).toMatchObject({
    route: expect.objectContaining({ conversationId: channel }),
    text: 'Updated the Role of @Ana. / 已更新 @Ana 的角色。',
  });

  await fx.receive(command('revoke', reviewer, '/角色 @target Colleague'));
  expect(pendingFor(fx, applicant).roleId).toBe(colleague.id);
  expect(capabilities(fx, person.bindingId, applicant)).not.toContain('approve');
  expect(fx.runs).toHaveLength(0);
  expect(fx.admissions()).toEqual([]);
});

it('refuses people who cannot review pairing and Roles outside the reviewer delegation', async () => {
  const fx = await fixture('slack');
  await reviewerSetup(fx, 'slack', ['review-pairing']);
  const approver = await approverRole(fx);
  await pairApplicant(fx);
  const before = pendingFor(fx, applicant);

  await fx.receive(command('self-grant', applicant, '/role @target Approver'));
  expect(fx.replies.at(-1)!.text).toContain('Only people allowed to review pairing');
  await fx.receive(command('denied', reviewer, '/role @target Approver'));
  expect(fx.replies.at(-1)!.text).toBe(
    'You cannot assign the Role "Approver". / 你不能分配角色「Approver」。',
  );
  await fx.receive(command('unpaired', reviewer, '/role @target Colleague', other));
  expect(fx.replies.at(-1)!.text).toContain('is not paired with this Bot');
  await fx.receive(command('reviewer-self', reviewer, '/role @target Colleague', reviewer));
  expect(fx.replies.at(-1)!.text).toContain('cannot change your own Role');
  expect(pendingFor(fx, applicant)).toMatchObject({
    roleId: before.roleId,
    revision: before.revision,
  });
  expect(approver.capabilities).toEqual(['approve']);
  expect(fx.runs).toHaveLength(0);
});

it('Role lists and a person Role go to the reviewer privately from a channel', async () => {
  const fx = await fixture('slack');
  await reviewerSetup(fx, 'slack', ['review-pairing'], ['approve']);
  await approverRole(fx);
  await pairApplicant(fx);

  await fx.receive(command('list', reviewer, '/roles'));
  await fx.settle();
  const [list, notice] = fx.replies.slice(-2);
  expect(list!.route.conversationId).toBe('DQAREV');
  expect(list!.text).toContain('Roles you can assign / 可分配的角色: Colleague, Approver');
  expect(notice!.route.conversationId).toBe(channel);
  expect(notice!.text).toBe('Sent to you privately. / 已私信发给你。');

  await fx.receive(command('show', reviewer, '/role @target'));
  await fx.settle();
  const [shown, shownNotice] = fx.replies.slice(-2);
  expect(shown!.route.conversationId).toBe('DQAREV');
  expect(shown!.text).toContain('@Ana: Role Colleague');
  expect(shownNotice!.text).not.toContain('Colleague');

  await fx.receive(command('unknown', reviewer, '/role @target Nobody'));
  await fx.settle();
  expect(fx.replies.at(-1)!.text).toContain('可分配的角色已私信发给你');
  expect(fx.runs).toHaveLength(0);
});

it('a DM command answers inline, and ordinary channel text still reaches the Bot', async () => {
  const fx = await fixture('slack');
  await reviewerSetup(fx, 'slack', ['review-pairing'], ['approve']);
  await approverRole(fx);
  await pairApplicant(fx);
  await fx.receive(directMessage('slack', 'dm-list', reviewer, '/roles'));
  await fx.settle();
  expect(fx.replies.at(-1)).toMatchObject({
    route: expect.objectContaining({ conversationId: 'DQAREV' }),
    text: expect.stringContaining('Colleague, Approver'),
  });
  await fx.receive(channelMessage('slack', 'chat', applicant, 'what role do I have?'));
  expect(fx.runs).toHaveLength(1);
});

it('reads Lark style mention keys that share a prefix with the Bot mention', async () => {
  const fx = await fixture('slack');
  await reviewerSetup(fx, 'slack', ['review-pairing'], ['approve']);
  const approver = await approverRole(fx);
  await pairApplicant(fx);
  const event = channelMessage('slack', 'lark-keys', reviewer, 'placeholder');
  await fx.receive({
    ...event,
    text: '@_user_1 /role @_user_10 Approver',
    mentions: [
      { id: 'bot', key: '@_user_1' },
      { id: applicant, key: '@_user_10', name: 'Ana' },
    ],
  });
  expect(pendingFor(fx, applicant).roleId).toBe(approver.id);
  expect(fx.runs).toHaveLength(0);
});
