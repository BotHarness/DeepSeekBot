import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { afterEach, expect, it } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import {
  capabilityNamed,
  parsePermissionCommand,
} from '../src/messaging/interactions/role-text.js';
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

const { applicant, reviewer, channel } = ids.slack;
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

async function pairApplicant(fx: Fixture) {
  await fx.receive(channelMessage('slack', 'blocked', applicant, 'question'));
  await fx.receive(channelMessage('slack', 'approve', reviewer, '同意', anchor, false));
  await fx.settle();
  expect(pendingFor(fx, applicant).status).toBe('approved');
}

const effective = (fx: Fixture) =>
  attachOperationalModule(fx.core.operationalDatabase, 'test').read((db) =>
    effectivePairingPermissions(db, 'ada', pendingFor(fx, applicant).bindingId, applicant),
  );

it('parses permission commands and capability names in both languages', () => {
  expect(parsePermissionCommand('/grant approve')).toEqual({
    action: 'grant',
    capability: 'approve',
  });
  expect(parsePermissionCommand(' /收回 批准 ')).toEqual({ action: 'revoke', capability: '批准' });
  expect(parsePermissionCommand('／授予')).toEqual({ action: 'grant' });
  expect(parsePermissionCommand('/granted approve')).toBeUndefined();
  expect(parsePermissionCommand('grant approve')).toBeUndefined();
  expect(capabilityNamed('Approve')).toBe('approve');
  expect(capabilityNamed('审核配对')).toBe('review-pairing');
  expect(capabilityNamed('answer')).toBeUndefined();
});

it('a reviewer grants and revokes one permission for a paired person, without a Bot turn', async () => {
  const fx = await fixture('slack');
  await reviewerSetup(fx, 'slack', ['review-pairing'], ['approve']);
  await pairApplicant(fx);
  const person = pendingFor(fx, applicant);
  expect(effective(fx).capabilities).not.toContain('approve');
  const shared = () =>
    fx.core.externalMessaging.pairing.assert('ada', person.bindingId, applicant, 'approve');
  expect(shared).toThrow(expect.objectContaining({ code: 'pairing-unauthorized' }));

  await fx.receive(command('grant', reviewer, '/grant @target approve'));
  expect(effective(fx).capabilities).toContain('approve');
  expect(pendingFor(fx, applicant).permissionExceptions).toMatchObject({
    allow: ['approve'],
    deny: [],
  });
  expect(shared()).toMatchObject({ id: person.id });
  expect(fx.replies.at(-1)).toMatchObject({
    route: expect.objectContaining({ conversationId: channel }),
    text: '@Ana can now approve. / @Ana 现在拥有「approve」权限。',
  });

  await fx.receive(command('again', reviewer, '/授予 @target 批准'));
  expect(fx.replies.at(-1)!.text).toContain('can already approve');

  await fx.receive(command('revoke', reviewer, '/收回 @target 批准'));
  expect(effective(fx).capabilities).not.toContain('approve');
  expect(pendingFor(fx, applicant).permissionExceptions).toMatchObject({ allow: [], deny: [] });
  expect(shared).toThrow(expect.objectContaining({ code: 'pairing-unauthorized' }));
  expect(fx.runs).toHaveLength(0);
  expect(fx.admissions()).toEqual([]);
});

it('revoking a permission the Role grants adds a personal deny, and granting removes it', async () => {
  const fx = await fixture('slack');
  await reviewerSetup(fx, 'slack', ['review-pairing'], ['approve']);
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core });
  const colleague = (await fx.core.externalMessaging.snapshot('ada')).roles!.find(
    (role) => role.name === 'Colleague',
  )!;
  expect(
    await methods.senderAccess({
      slug: 'ada',
      input: {
        kind: 'edit-role',
        id: colleague.id,
        expectedRevision: colleague.revision,
        name: colleague.name,
        behavior: colleague.behavior,
        capabilities: ['approve'],
      },
    }),
  ).toMatchObject({ ok: true });
  await pairApplicant(fx);
  expect(effective(fx).capabilities).toContain('approve');

  await fx.receive(command('revoke', reviewer, '/revoke @target approve'));
  expect(effective(fx).capabilities).not.toContain('approve');
  expect(pendingFor(fx, applicant).permissionExceptions).toMatchObject({
    allow: [],
    deny: ['approve'],
  });

  await fx.receive(command('grant', reviewer, '/grant @target approve'));
  expect(effective(fx).capabilities).toContain('approve');
  expect(pendingFor(fx, applicant).permissionExceptions).toMatchObject({ allow: [], deny: [] });
  expect(fx.runs).toHaveLength(0);
});

it('a revoke under a group Deny still holds after the group Deny is removed', async () => {
  const fx = await fixture('slack');
  await reviewerSetup(fx, 'slack', ['review-pairing'], ['approve']);
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core });
  const colleague = (await fx.core.externalMessaging.snapshot('ada')).roles!.find(
    (role) => role.name === 'Colleague',
  )!;
  await methods.senderAccess({
    slug: 'ada',
    input: {
      kind: 'edit-role',
      id: colleague.id,
      expectedRevision: colleague.revision,
      name: colleague.name,
      behavior: colleague.behavior,
      capabilities: ['approve'],
    },
  });
  await pairApplicant(fx);
  const person = pendingFor(fx, applicant);
  expect(
    await methods.senderAccess({
      slug: 'ada',
      input: {
        kind: 'create-group',
        bindingId: person.bindingId,
        name: 'Hold',
        allow: [],
        deny: ['approve'],
        memberIds: [person.id],
      },
    }),
  ).toMatchObject({ ok: true });
  expect(effective(fx).capabilities).not.toContain('approve');

  await fx.receive(command('grant', reviewer, '/grant @target approve'));
  expect(pendingFor(fx, applicant).permissionExceptions?.allow ?? []).toEqual([]);

  await fx.receive(command('revoke', reviewer, '/revoke @target approve'));
  expect(pendingFor(fx, applicant).permissionExceptions).toMatchObject({ deny: ['approve'] });
  await fx.receive(command('again', reviewer, '/revoke @target approve'));
  expect(fx.replies.at(-1)!.text).toContain('already');

  const hold = (await fx.core.externalMessaging.snapshot('ada')).permissionGroups!.find(
    (group) => group.name === 'Hold',
  )!;
  expect(
    await methods.senderAccess({
      slug: 'ada',
      input: { kind: 'delete-group', id: hold.id, expectedRevision: hold.revision },
    }),
  ).toMatchObject({ ok: true });
  expect(effective(fx).capabilities).not.toContain('approve');
  expect(fx.runs).toHaveLength(0);
});

it('refuses outside the delegation, for oneself, for unknown names and for non-reviewers', async () => {
  const fx = await fixture('slack');
  await reviewerSetup(fx, 'slack', ['review-pairing'], ['approve']);
  await pairApplicant(fx);
  const before = pendingFor(fx, applicant);

  await fx.receive(command('reject', reviewer, '/grant @target reject'));
  expect(fx.replies.at(-1)!.text).toBe(
    'You cannot grant or revoke "reject". / 你不能授予或收回「reject」。',
  );
  await fx.receive(command('unknown', reviewer, '/grant @target fly'));
  expect(fx.replies.at(-1)!.text).toContain('Permission "fly" was not found');
  await fx.receive(command('missing', reviewer, '/grant @target'));
  expect(fx.replies.at(-1)!.text).toContain('Mention exactly one person and one permission');
  await fx.receive(command('self', reviewer, '/grant @target approve', reviewer));
  expect(fx.replies.at(-1)!.text).toContain('cannot change your own permissions');
  await fx.receive(command('member', applicant, '/grant @target approve', reviewer));
  expect(fx.replies.at(-1)!.text).toContain('can change permissions');

  expect(pendingFor(fx, applicant).revision).toBe(before.revision);
  expect(effective(fx).capabilities).not.toContain('approve');
  expect(fx.runs).toHaveLength(0);
});

it('the Host refuses an IM reviewer exception outside the delegation even when called directly', async () => {
  const fx = await fixture('slack');
  await reviewerSetup(fx, 'slack', ['review-pairing'], ['approve']);
  await pairApplicant(fx);
  const person = pendingFor(fx, applicant);
  const { changeSenderAccess } = await import('../src/messaging/permissions/index.js');
  const attempt = (allow: ('approve' | 'reject')[]) => () =>
    attachOperationalModule(fx.core.operationalDatabase, 'test').transaction((db) =>
      changeSenderAccess(
        db,
        'ada',
        {
          kind: 'person-permissions',
          id: person.id,
          expectedRevision: person.revision,
          allow,
          deny: [],
        },
        { bindingId: person.bindingId, actorId: reviewer },
      ),
    );
  expect(attempt(['reject'])).toThrow(
    expect.objectContaining({
      cause: expect.objectContaining({ code: 'pairing-delegation-denied' }),
    }),
  );
  expect(attempt(['approve'])).not.toThrow();
});
