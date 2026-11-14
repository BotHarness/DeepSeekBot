import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { registerBridge } from '../src/bridge/rpc.js';
import { Context } from '@deepseek-ai/cordis';
import { createTempRoot } from './helpers.js';

it('exposes only qualified WeChat defaults through the public RPC', async () => {
  const core = createCore({ dshHome: createTempRoot('bh-wechat-defaults-rpc-') });
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core });
  const service = registerBridge(
    new Context().extend({ invocation: { peer: { principal: { kind: 'owner' } } } }),
    () => methods,
  );
  try {
    const original = await service.messagingDefaults();
    const { revision, changedAt: _at, ...preferences } = await service.messagingDefaults('weixin');
    expect(preferences).toMatchObject({
      collection: 'all',
      wake: 'immediate',
      identityEnabled: true,
      typingEnabled: true,
      newConversations: 'auto',
    });
    await service.messagingDefaultsSet({
      ...preferences,
      expectedRevision: revision,
      typingEnabled: false,
    });
    expect(await service.messagingDefaults('weixin')).toMatchObject({
      revision: 1,
      typingEnabled: false,
    });
    expect(await service.messagingDefaults()).toEqual(original);
    for (const unsupported of [
      { collection: 'mentions' },
      { wake: 'mentions' },
      { wake: 'digest' },
      { newConversations: 'ask' },
    ])
      expect(
        await methods.messagingDefaultsSet({ ...preferences, expectedRevision: 1, ...unsupported }),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    await expect(
      service.messagingDefaultsSet({ ...preferences, expectedRevision: 0 }),
    ).rejects.toMatchObject({ code: 'defaults-stale' });
  } finally {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it.each(['slack', 'discord', 'qq'] as const)(
  '%s reads and saves qualified defaults through the public RPC without crossing platform revisions',
  async (platform) => {
    const core = createCore({ dshHome: createTempRoot('bh-platform-defaults-') });
    const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core });
    const service = registerBridge(
      new Context().extend({ invocation: { peer: { principal: { kind: 'owner' } } } }),
      () => methods,
    );
    try {
      const lark = await service.messagingDefaults();
      const slack = await service.messagingDefaults(platform);
      expect(slack).toMatchObject({ platform, revision: 0, collection: 'mentions' });
      const { revision, changedAt: _at, ...preferences } = slack;
      const saved = await service.messagingDefaultsSet({
        ...preferences,
        expectedRevision: revision,
        collection: 'all',
        count: 2,
      });
      expect(saved).toMatchObject({ platform, revision: 1, collection: 'all', count: 2 });
      expect(await service.messagingDefaults()).toEqual(lark);
      expect(await service.messagingDefaults(platform)).toEqual(saved);
      await expect(
        service.messagingDefaultsSet({ ...preferences, expectedRevision: revision, count: 9 }),
      ).rejects.toMatchObject({ code: 'defaults-stale' });
      expect(await methods.messagingDefaults({ platform: 'unknown' })).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      });
      expect(await methods.messagingDefaults({ platform: 'slack', extra: true })).toMatchObject({
        ok: false,
      });
      expect(
        await methods.messagingDefaultsSet({
          ...preferences,
          platform: 'unknown',
          expectedRevision: 0,
        }),
      ).toMatchObject({ ok: false });
    } finally {
      core.externalMessaging.close();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  },
);
