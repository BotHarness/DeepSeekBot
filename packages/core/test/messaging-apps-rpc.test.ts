import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { expect, it } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { registerBridge } from '../src/bridge/rpc.js';
import type { MessagingApp, OutboundMessaging } from '../src/messaging/outbound.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

const apps = [
  { providerId: 'dsh-im', platform: 'feishu', ref: 'cli_a', name: 'Lark A', boundBotSlug: 'ada' },
  { providerId: 'dsh-im', platform: 'qq', ref: 'qq_b', name: 'QQ B' },
] as unknown as MessagingApp[];

it('lists every App, its PersonaBot and the App setups without naming a Bot', async () => {
  const core = createCore({ dshHome: createTempRoot('bh-messaging-apps-rpc-') });
  trackTestOwner(core.operationalDatabase);
  const setups = [{ providerId: 'dsh-im', platform: 'feishu' }];
  const externalMessaging = {
    apps: async () => apps,
    setups: async () => setups,
  } as unknown as Partial<OutboundMessaging>;
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, {
    ...core,
    externalMessaging: externalMessaging as OutboundMessaging,
  });
  const service = registerBridge(
    new Context().extend({ invocation: { peer: { principal: { kind: 'owner' } } } }),
    () => methods,
  );
  expect(await service.messagingApps()).toEqual({ apps, setups });
});

it('reports messaging as unavailable when no Provider is present', async () => {
  const core = createCore({ dshHome: createTempRoot('bh-messaging-apps-none-') });
  trackTestOwner(core.operationalDatabase);
  const { externalMessaging: _present, ...withoutMessaging } = core;
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, withoutMessaging);
  expect(await methods.messagingApps()).toMatchObject({
    ok: false,
    error: { code: 'messaging-unavailable' },
  });
});
