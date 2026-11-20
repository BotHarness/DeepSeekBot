import { afterEach, expect, it } from 'vitest';
import {
  fingerprint,
  dm,
  mention,
  fixture,
  cleanup,
} from './messaging-default-traffic-fixtures.js';

afterEach(cleanup);

it('WeChat inherits future defaults, preserves overrides and authority, and restores inheritance across restart', async () => {
  const fx = await fixture('weixin', [
    { targetId: 'owner', name: 'QR paired owner', kind: 'user', route: { toUserId: 'oc_owner' } },
  ]);
  const identity = async () => (await fx.core.externalMessaging.snapshot('ada')).identities![0]!;
  const defaults = async (identityEnabled: boolean, typingEnabled: boolean) => {
    const {
      revision,
      changedAt: _at,
      ...preferences
    } = fx.core.externalMessaging.defaults('weixin');
    await fx.core.externalMessaging.setDefaults({
      ...preferences,
      expectedRevision: revision,
      identityEnabled,
      typingEnabled,
    });
    await fx.settle();
  };
  const fresh = (id: string) => dm(id, { at: new Date(Date.now() + 1000).toISOString() });
  expect(await identity()).toMatchObject({
    enabledInheritance: 'inherit',
    typingInheritance: 'inherit',
    typingEnabled: true,
  });
  await fx.receive(fresh('inherited'));
  expect(fx.admissions()).toHaveLength(1);
  const entries = fx.entries();
  await defaults(false, false);
  expect(await identity()).toMatchObject({ enabled: false, typingEnabled: false });
  expect(fx.entries()).toEqual(entries);
  await fx.update({ enabled: true, typingEnabled: true });
  expect(await identity()).toMatchObject({
    enabled: true,
    enabledInheritance: 'custom',
    typingEnabled: true,
    typingInheritance: 'custom',
  });
  await fx.receive(fresh('custom'));
  await defaults(true, false);
  expect(await identity()).toMatchObject({
    enabled: true,
    typingEnabled: true,
    typingInheritance: 'custom',
  });
  await fx.update({ inheritEnabled: true, inheritTyping: true });
  expect(await identity()).toMatchObject({
    enabled: true,
    typingEnabled: false,
    enabledInheritance: 'inherit',
    typingInheritance: 'inherit',
  });
  await defaults(false, false);
  await defaults(true, true);
  await fx.restart();
  expect(await identity()).toMatchObject({
    enabled: true,
    typingEnabled: true,
    enabledInheritance: 'inherit',
    typingInheritance: 'inherit',
  });
  await fx.receive(dm('old-disabled-time'));
  await fx.receive(fresh('restored'));
  await fx.receive(
    dm('stranger-after-defaults', {
      conversation: { kind: 'dm', id: 'oc_stranger' },
      reply: {
        messageId: 'om-stranger-after-defaults',
        conversationId: 'oc_stranger',
        actorId: 'ou_owner',
      },
    }),
  );
  await fx.receive(mention('unsupported-group'));
  expect(fx.admissions()).toEqual([
    { reason: 'human-dm', messageId: 'om-inherited' },
    { reason: 'human-dm', messageId: 'om-custom' },
    { reason: 'human-dm', messageId: 'om-restored' },
  ]);
  expect(fx.entries()).toEqual(entries);
  await fx.core.externalMessaging.reply('ada', fx.sourceId('om-restored'), '912 restored owner');
  expect(fx.replies.at(-1)?.route).toMatchObject({
    conversationId: 'oc_owner',
    messageId: 'om-restored',
  });
});

it('WeChat resumes only future owner DMs before any conversation Grant exists', async () => {
  const fx = await fixture('weixin', [
    { targetId: 'owner', name: 'QR paired owner', kind: 'user', route: { toUserId: 'oc_owner' } },
  ]);
  for (const identityEnabled of [false, true]) {
    const {
      revision,
      changedAt: _at,
      ...preferences
    } = fx.core.externalMessaging.defaults('weixin');
    await fx.core.externalMessaging.setDefaults({
      ...preferences,
      expectedRevision: revision,
      identityEnabled,
    });
    await fx.settle();
  }
  expect(fx.entries()).toEqual([]);
  await fx.restart();
  await fx.receive(dm('old-before-first-grant'));
  expect(fx.entries()).toEqual([]);
  expect(fx.admissions()).toEqual([]);
  await fx.receive(dm('fresh-first-grant', { at: new Date(Date.now() + 1000).toISOString() }));
  expect(fx.admissions()).toEqual([{ reason: 'human-dm', messageId: 'om-fresh-first-grant' }]);
});

it.each(['implicit', 'explicit'] as const)(
  'WeChat explicit identity resume fences an existing %s Grant',
  async (origin) => {
    const fx = await fixture('weixin', [
      { targetId: 'owner', name: 'QR paired owner', kind: 'user', route: { toUserId: 'oc_owner' } },
    ]);
    if (origin === 'explicit') {
      const targets = await fx.core.externalMessaging.targets('dsh-im/weixin', 'lark-app');
      const grant = await fx.core.externalMessaging.authorize({
        botSlug: 'ada',
        providerId: 'dsh-im/weixin',
        accountRef: 'lark-app',
        targetRef: 'owner',
        fingerprint,
        targetDigest: targets[0]!.digest,
      });
      await fx.core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
      await fx.settle();
    }
    await fx.receive(dm('before-explicit-pause'));
    expect(fx.admissions()).toHaveLength(1);
    const entries = fx.entries();
    await fx.update({ enabled: false });
    await fx.update({ inheritEnabled: true });
    await fx.restart();
    await fx.receive(dm('late-explicit-pause'));
    await fx.receive(
      dm('fresh-explicit-resume', { at: new Date(Date.now() + 1000).toISOString() }),
    );
    expect(fx.admissions()).toEqual([
      { reason: 'human-dm', messageId: 'om-before-explicit-pause' },
      { reason: 'human-dm', messageId: 'om-fresh-explicit-resume' },
    ]);
    expect(fx.entries()).toEqual(entries);
  },
);

it('a bound WeChat app admits only its paired owner DM', async () => {
  const fx = await fixture('weixin', [
    { targetId: 'owner', name: 'QR paired owner', kind: 'user', route: { toUserId: 'oc_owner' } },
  ]);
  await fx.receive(
    dm('stranger', {
      conversation: { kind: 'dm', id: 'oc_stranger' },
      reply: { messageId: 'om-stranger', conversationId: 'oc_stranger', actorId: 'ou_owner' },
    }),
  );
  await fx.receive(mention('group'));
  expect(fx.entries()).toEqual([]);
  await fx.receive(dm('1'));
  expect(fx.entries()).toEqual([
    { origin: 'implicit', kind: 'dm', conversation: 'oc_owner', revoked_at: null },
  ]);
  expect(fx.admissions()).toEqual([{ reason: 'human-dm', messageId: 'om-1' }]);
  await fx.core.externalMessaging.reply('ada', fx.sourceId('om-1'), 'Hi owner');
  await fx.settle();
  expect(fx.replies).toHaveLength(1);
});
