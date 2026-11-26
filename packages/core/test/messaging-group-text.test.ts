import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { afterEach, expect, it } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { parseGroupCommand } from '../src/messaging/interactions/role-text.js';
import { effectivePairingPermissions } from '../src/messaging/permissions/index.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { fixture, cleanup } from './messaging-default-traffic-fixtures.js';
import {
  channelMessage,
  ids,
  pendingFor,
  reviewerSetup,
  type Fixture,
} from './messaging-pairing-text-fixtures.js';

afterEach(cleanup);

const { applicant, reviewer } = ids.slack;
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

async function setup(delegable: ('approve' | 'reject' | 'review-pairing')[]) {
  const fx = await fixture('slack');
  await reviewerSetup(fx, 'slack', ['review-pairing'], delegable);
  await fx.receive(channelMessage('slack', 'blocked', applicant, 'question'));
  await fx.receive(channelMessage('slack', 'approve', reviewer, '同意', anchor, false));
  await fx.settle();
  const person = pendingFor(fx, applicant);
  expect(person.status).toBe('approved');
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core });
  const create = async (name: string, allow: 'approve'[], deny: 'approve'[] = []) =>
    expect(
      await methods.senderAccess({
        slug: 'ada',
        input: {
          kind: 'create-group',
          bindingId: person.bindingId,
          name,
          allow,
          deny,
          memberIds: [],
        },
      }),
    ).toMatchObject({ ok: true });
  return { fx, person, create };
}

const group = async (fx: Fixture, name: string) =>
  (await fx.core.externalMessaging.snapshot('ada')).permissionGroups!.find(
    (item) => item.name === name,
  )!;

const effective = (fx: Fixture) =>
  attachOperationalModule(fx.core.operationalDatabase, 'test').read((db) =>
    effectivePairingPermissions(db, 'ada', pendingFor(fx, applicant).bindingId, applicant),
  );

it('parses group commands in both languages', () => {
  expect(parseGroupCommand('/group')).toEqual({});
  expect(parseGroupCommand('/group add Approvers')).toEqual({ action: 'add', group: 'Approvers' });
  expect(parseGroupCommand('／权限组 移出 审批组')).toEqual({ action: 'remove', group: '审批组' });
  expect(parseGroupCommand('/group add')).toEqual({ action: 'add' });
  expect(parseGroupCommand('/group join Approvers')).toBeUndefined();
  expect(parseGroupCommand('/groups')).toBeUndefined();
});

it('a reviewer adds and removes a paired person from a permission group, without a Bot turn', async () => {
  const { fx, person, create } = await setup(['approve']);
  await create('Approvers', ['approve']);
  expect(effective(fx).capabilities).not.toContain('approve');

  await fx.receive(command('add', reviewer, '/group add @target approvers'));
  expect(fx.replies.at(-1)!.text).toBe(
    '@Ana is now in Approvers. / @Ana 已加入权限组「Approvers」。',
  );
  expect((await group(fx, 'Approvers')).memberIds).toEqual([person.id]);
  expect(effective(fx).capabilities).toContain('approve');

  await fx.receive(command('again', reviewer, '/权限组 加入 @target Approvers'));
  expect(fx.replies.at(-1)!.text).toContain('already in Approvers');

  await fx.receive(command('remove', reviewer, '/权限组 移出 @target Approvers'));
  expect(fx.replies.at(-1)!.text).toContain('已移出权限组「Approvers」');
  expect((await group(fx, 'Approvers')).memberIds).toEqual([]);
  expect(effective(fx).capabilities).not.toContain('approve');

  await fx.receive(command('list', reviewer, '/权限组'));
  await fx.settle();
  expect(fx.replies.map((reply) => reply.text)).toContain(
    [
      'Permission groups you can change / 可修改的权限组: Approvers',
      'Add or remove a paired person with "/group add @name <group>" or "/group remove @name <group>". / 用「/权限组 加入 @某人 <权限组>」或「/权限组 移出 @某人 <权限组>」修改成员。',
    ].join('\n\n'),
  );
  expect(fx.runs).toHaveLength(0);
  expect(fx.admissions()).toEqual([]);
});

it('refuses groups outside the delegation, unknown groups, oneself and non-reviewers', async () => {
  const { fx, create } = await setup([]);
  await create('Approvers', ['approve']);
  await create('Hold', [], ['approve']);
  await create('Plain', []);
  const before = await group(fx, 'Approvers');

  await fx.receive(command('outside', reviewer, '/group add @target Approvers'));
  expect(fx.replies.at(-1)!.text).toBe(
    'You cannot change the permission group "Approvers". / 你不能修改权限组「Approvers」。',
  );
  await fx.receive(command('deny', reviewer, '/group remove @target Hold'));
  expect(fx.replies.at(-1)!.text).toContain('cannot change the permission group "Hold"');
  await fx.receive(command('unknown', reviewer, '/group add @target Nobody'));
  expect(fx.replies.at(-1)!.text).toContain('Permission group "Nobody" was not found');
  await fx.receive(command('missing', reviewer, '/group add @target'));
  expect(fx.replies.at(-1)!.text).toContain('Mention exactly one person and one permission group');
  await fx.receive(command('self', reviewer, '/group add @target Plain', reviewer));
  expect(fx.replies.at(-1)!.text).toContain('cannot change your own permission groups');
  await fx.receive(command('member', applicant, '/group add @target Plain', reviewer));
  expect(fx.replies.at(-1)!.text).toContain('can change permission groups');

  expect((await group(fx, 'Approvers')).revision).toBe(before.revision);
  expect((await group(fx, 'Plain')).memberIds).toEqual([]);
  expect(fx.runs).toHaveLength(0);
});

it('the Host refuses an IM reviewer group edit beyond one membership change', async () => {
  const { fx, person, create } = await setup(['approve']);
  await create('Approvers', ['approve']);
  const approvers = await group(fx, 'Approvers');
  const { changeSenderAccess } = await import('../src/messaging/permissions/index.js');
  const attempt =
    (input: Partial<{ name: string; allow: ('approve' | 'reject')[] }>, id = approvers.id) =>
    () =>
      attachOperationalModule(fx.core.operationalDatabase, 'test').transaction((db) =>
        changeSenderAccess(
          db,
          'ada',
          {
            kind: 'edit-group',
            id,
            expectedRevision: approvers.revision,
            name: approvers.name,
            allow: ['approve'],
            deny: [],
            memberIds: [person.id],
            ...input,
          },
          { bindingId: person.bindingId, actorId: reviewer },
        ),
      );
  const refused = (code: string) =>
    expect.objectContaining({ cause: expect.objectContaining({ code }) });
  expect(attempt({ name: 'Renamed' })).toThrow(refused('pairing-unauthorized'));
  expect(attempt({ allow: ['approve', 'reject'] })).toThrow(refused('pairing-unauthorized'));
  expect(attempt({})).not.toThrow();
});
