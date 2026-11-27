import { setImmediate } from 'node:timers/promises';
import { expect, it, onTestFinished, vi } from 'vitest';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { humanContext, OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import {
  MessagingError,
  type MessagingAccount,
  type MessagingProvider,
} from '../src/messaging/provider.js';
import { createCore } from '../src/plugin.js';
import { deferred } from './deferred.js';
import { createTempRoot } from './helpers.js';

it('lists active and offline App Bindings for the Host Owner within the existing Bot settings boundary', async () => {
  const core = createCore({
    dshHome: createTempRoot('team-im-connections-'),
    agents: {
      async runOrchestrator() {},
      async runAssignment() {},
      requestAssignment() {
        throw new Error('unexpected-assignment');
      },
      async close() {},
    },
  });
  onTestFinished(async () => {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  });
  const owner = OWNER_HUMAN_CONTEXT;
  const alice = humanContext('alice');
  const methods = createBridgeMethodsForHumans(core);
  const database = attachOperationalModule(core.operationalDatabase, 'team');
  database.transaction((db) => {
    db.prepare("INSERT INTO humans VALUES ('alice', 'alice', 'active', ?)").run(
      new Date().toISOString(),
    );
    db.prepare("INSERT INTO human_roles VALUES ('alice', 'member')").run();
    db.prepare('UPDATE team_settings SET enabled = 1').run();
  });
  for (const [slug, human] of [
    ['owner-bot', owner],
    ['alice-bot', alice],
    ['revoked-bot', owner],
  ] as const) {
    core.team.spaces.ensureAccount(human.humanId);
    expect(
      core.registry.create({ slug, displayName: slug, ownerHumanId: human.humanId }),
    ).toMatchObject({ ok: true });
  }
  const accounts = new Map<string, MessagingAccount>();
  const readAccount = async (ref: string) => {
    const account = accounts.get(ref);
    if (!account) throw new MessagingError('rebind-required');
    return account;
  };
  const inspectAccount = vi.fn(readAccount);
  const provider: MessagingProvider = {
    id: 'qa/im',
    accounts: async () => [...accounts.values()],
    inspectAccount,
    targets: async () => [],
    async inspect() {
      throw new Error('The binding inventory has no conversation targets');
    },
    async send() {
      throw new Error('The binding inventory does not send messages');
    },
  };
  const disconnectProvider = core.externalMessaging.register(provider);
  await setImmediate();
  const bind = async (botSlug: string, platform: string, fingerprint: string) => {
    const ref = `${platform}-app`;
    accounts.set(ref, { ref, platform, name: ref, fingerprint, connected: true });
    return core.externalMessaging.identity(botSlug, {
      kind: 'bind',
      providerId: provider.id,
      accountRef: ref,
      fingerprint,
    });
  };
  const owned = await bind('owner-bot', 'discord', 'a'.repeat(64));
  const offline = await bind('alice-bot', 'slack', 'b'.repeat(64));
  const revoked = await bind('revoked-bot', 'feishu', 'c'.repeat(64));
  await core.externalMessaging.identity(revoked.botSlug, {
    kind: 'unbind',
    id: revoked.id,
    expectedRevision: revoked.revision,
  });
  accounts.delete(offline.accountRef);
  inspectAccount.mockClear();

  for (const human of [alice, { ...owner, caller: 'bot' }] as const) {
    expect(await methods(human).messagingConnections({})).toMatchObject({
      ok: false,
      error: { code: 'permission-required' },
    });
  }
  expect(await methods(owner).messagingConnections({ mode: 'unknown' })).toMatchObject({
    ok: false,
    error: { code: 'invalid-input' },
  });
  const saved = await methods(owner).messagingConnections({ mode: 'saved' });
  expect(saved).toMatchObject({ ok: true, value: { checks: 'pending' } });
  expect(inspectAccount).not.toHaveBeenCalled();

  const status = await methods(owner).messagingConnections({});
  expect(status).toEqual({
    ok: true,
    value: {
      checks: 'complete',
      bindings: [
        {
          id: offline.id,
          botSlug: offline.botSlug,
          botName: 'alice-bot',
          canOpenSettings: false,
          providerId: provider.id,
          platform: 'slack',
          accountRef: 'slack-app',
          name: 'slack-app',
          enabled: true,
          availability: 'rebind-required',
          reception: 'unavailable',
        },
        {
          id: owned.id,
          botSlug: owned.botSlug,
          botName: 'owner-bot',
          canOpenSettings: true,
          providerId: provider.id,
          platform: 'discord',
          accountRef: 'discord-app',
          name: 'discord-app',
          enabled: true,
          availability: 'available',
          reception: 'unavailable',
        },
      ],
    },
  });
  expect(await methods(owner).messagingSnapshot({ slug: offline.botSlug })).toMatchObject({
    ok: false,
    error: { code: 'bot-not-found' },
  });

  const inspectionStarted = deferred<void>();
  const releaseInspection = deferred<void>();
  inspectAccount.mockImplementation(async (ref) => {
    if (ref === offline.accountRef) {
      inspectionStarted.resolve();
      await releaseInspection.promise;
    }
    return readAccount(ref);
  });
  const pending = methods(owner).messagingConnections({ mode: 'status' });
  await inspectionStarted.promise;
  await setImmediate();
  disconnectProvider();
  releaseInspection.resolve();
  expect(await pending).toMatchObject({
    ok: true,
    value: {
      checks: 'complete',
      bindings: expect.arrayContaining([
        expect.objectContaining({ id: owned.id, availability: 'unavailable' }),
      ]),
    },
  });
});
