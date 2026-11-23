import { bridgeMethodInventory } from './bridge-method-inventory.js';
import { OWNER_HUMAN_CONTEXT, humanContext } from '../src/humans/context.js';
import { registryDatabase } from './registry-fixture.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_NAMESPACE, BRIDGE_SERVICE_KEY } from '../src/bridge/rpc.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createBotSourcePolicyStore } from '../src/runtime/source-policy.js';
import { roots, setup, parameterNames } from './support/bridge-rpc.js';

afterEach(() => {
  for (const root of roots.splice(0)) {
    registryDatabase(root).close();
    rmSync(root, { recursive: true, force: true });
  }
});

describe('bridge typert service', () => {
  it.each([true, false])(
    'forwards the Owner password sign-out choice %s',
    async (signOutOthers) => {
      const { service, methods } = setup();
      const set = vi.spyOn(methods, 'teamOwnerPasswordSet');
      await expect(
        service.teamOwnerPasswordSet(
          'next-owner-password',
          'current-owner-password',
          signOutOthers,
        ),
      ).rejects.toMatchObject({ code: 'unavailable' });
      expect(set).toHaveBeenCalledWith({
        password: 'next-owner-password',
        current: 'current-owner-password',
        signOutOthers,
      });
    },
  );

  it('reuses one method table per Human across RPC calls', () => {
    const { service, methods, methodsForHuman } = setup();
    const identity = vi.spyOn(methods, 'humanIdentity');
    expect(service.humanIdentity().humanId).toBe(OWNER_HUMAN_CONTEXT.humanId);
    expect(service.humanIdentity().humanId).toBe(OWNER_HUMAN_CONTEXT.humanId);
    expect(identity).toHaveBeenCalledTimes(2);
    const ownerAgain = methodsForHuman(humanContext(OWNER_HUMAN_CONTEXT.humanId));
    expect(ownerAgain).toBe(methods);
    expect(ownerAgain.voiceDictation).toBe(methods.voiceDictation);
    const second = humanContext('human-test-b');
    const secondMethods = methodsForHuman(second);
    expect(secondMethods).not.toBe(methods);
    expect(secondMethods.voiceDictation).not.toBe(methods.voiceDictation);
    expect(methodsForHuman(humanContext(second.humanId))).toBe(secondMethods);
    expect(secondMethods.humanIdentity({})).toMatchObject({
      ok: true,
      value: { humanId: second.humanId },
    });
  });

  it('declares every remote method with plain identifier parameters', () => {
    const { service } = setup();
    const prototype = Object.getPrototypeOf(service) as Record<string, unknown>;
    const descriptor = prototype['@deepseek-ai/dsh-typert-protocol/remote-methods'] as {
      methods: { method: string }[];
    };
    const offenders = descriptor.methods
      .map((entry) => entry.method)
      .filter((name) => {
        const source = Function.prototype.toString.call(prototype[name]);
        const open = source.indexOf('(');
        const close = source.indexOf(')', open + 1);
        return source
          .slice(open + 1, close)
          .split(',')
          .map((part) => part.trim())
          .some((part) => part !== '' && !/^[A-Za-z_$][\w$]*$/u.test(part));
      });
    expect(offenders).toEqual([]);
  });

  it('registers under the gateway service key with the botharness namespace', () => {
    const { service } = setup();

    expect(service.name).toBe(BRIDGE_SERVICE_KEY);
    expect(service.typertRemote.service).toBe(service);
    expect(service.typertRemote.serviceKey).toBe(BRIDGE_SERVICE_KEY);
    expect(service.typertRemote.namespace).toBe(BRIDGE_NAMESPACE);
  });

  it('marks every bridge endpoint for typert claims', () => {
    const { service } = setup();

    expect(remoteMethods(service).map((marker) => marker.exportName ?? marker.method)).toEqual(
      bridgeMethodInventory,
    );
  });

  it('marks the live stream methods whose final parameter is the injected signal', () => {
    const { service } = setup();

    expect(remoteMethods(service).filter((marker) => marker.mode === 'stream')).toEqual([
      { method: 'followRoster', mode: 'stream', invocation: { kind: 'direct' } },
      { method: 'followActivity', mode: 'stream', invocation: { kind: 'direct' } },
      { method: 'followChannel', mode: 'stream', invocation: { kind: 'direct' } },
      { method: 'followCompanion', mode: 'stream', invocation: { kind: 'direct' } },
    ]);
    expect(parameterNames(service.followRoster)).toEqual(['signal']);
    expect(parameterNames(service.followActivity)).toEqual(['signal']);
    expect(parameterNames(service.followChannel)).toEqual([
      'channelId',
      'limit',
      'drafts',
      'signal',
    ]);
    expect(parameterNames(service.channelJournalPage)).toEqual([
      'channelId',
      'through',
      'before',
      'limit',
    ]);
    expect(parameterNames(service.channelFilesPage)).toEqual(['channelId', 'before', 'limit']);
    expect(parameterNames(service.channelChanges)).toEqual([
      'channelId',
      'sinceSeq',
      'epoch',
      'limit',
    ]);
    expect(parameterNames(service.followCompanion)).toEqual(['resume', 'lastEventId', 'signal']);
    expect(parameterNames(service.botToolRun)).toEqual([
      'slug',
      'tool',
      'args',
      'sessionId',
      'sourceEventId',
    ]);
    expect(parameterNames(service.memoryMove)).toEqual(['slug', 'location']);
  });

  it('reads parameter names from every form the SRC resolver accepts', () => {
    expect(parameterNames(function (alpha: string, beta: number) {})).toEqual(['alpha', 'beta']);
    expect(parameterNames((alpha: string, ...rest: string[]) => alpha)).toEqual(['alpha', 'rest']);
    expect(parameterNames(function (alpha = 1, beta = 2) {})).toEqual(['alpha', 'beta']);
  });

  it('keeps every method signature parseable by the gateway SRC resolver', () => {
    const { service } = setup();

    expect(parameterNames(service.list)).toEqual(['query', 'administration']);
    expect(parameterNames(service.get)).toEqual(['slug']);
    expect(parameterNames(service.create)).toEqual([
      'displayName',
      'roles',
      'persona',
      'description',
      'model',
      'preset',
      'workspaces',
      'avatar',
      'memoryLocation',
      'coreMemory',
      'operationKey',
    ]);
    expect(parameterNames(service.update)).toEqual(['slug', 'patch', 'expectedProfile']);
    expect(parameterNames(service.pause)).toEqual(['slug']);
    expect(parameterNames(service.resume)).toEqual(['slug']);
    expect(parameterNames(service.createLookup)).toEqual([
      'operationKey',
      'displayName',
      'roles',
      'persona',
      'description',
      'model',
      'preset',
      'workspaces',
      'avatar',
      'memoryLocation',
      'coreMemory',
    ]);
    expect(parameterNames(service.createFromGit)).toEqual([
      'displayName',
      'gitUrl',
      'roles',
      'description',
      'origin',
      'operationKey',
      'expectedCommit',
      'listingId',
    ]);
    expect(parameterNames(service.botImportPreview)).toEqual(['gitUrl']);
    expect(parameterNames(service.botImportLookup)).toEqual([
      'operationKey',
      'gitUrl',
      'expectedCommit',
      'displayName',
      'roles',
      'description',
    ]);
    expect(parameterNames(service.marketplaceList)).toEqual(['query']);
    expect(parameterNames(service.marketplaceTopics)).toEqual([]);
    expect(parameterNames(service.marketplaceSections)).toEqual(['lang']);
    expect(parameterNames(service.marketplaceDigests)).toEqual(['lang']);
    expect(parameterNames(service.marketplaceDigest)).toEqual(['day', 'lang']);
    expect(parameterNames(service.marketplaceFileView)).toEqual(['id', 'path']);
    expect(parameterNames(service.marketplaceDetail)).toEqual(['id', 'lang']);
    expect(parameterNames(service.marketplaceSubmit)).toEqual(['url', 'altcha']);
    expect(parameterNames(service.marketplaceChallenge)).toEqual([]);
    expect(parameterNames(service.marketplaceReport)).toEqual(['id', 'altcha', 'reason']);
    expect(parameterNames(service.marketplaceInstall)).toEqual([
      'id',
      'reviewId',
      'operationKey',
      'source',
    ]);
    expect(parameterNames(service.releaseInfo)).toEqual(['since']);
    expect(parameterNames(service.releaseUpdate)).toEqual(['force']);
    expect(parameterNames(service.channelReact)).toEqual([
      'channelId',
      'messageId',
      'emoji',
      'active',
    ]);
    expect(parameterNames(service.channelSearch)).toEqual(['channelId', 'text', 'cursor', 'limit']);
    expect(parameterNames(service.messageSearch)).toEqual(['text', 'cursor', 'limit']);
    expect(parameterNames(service.releaseInstall)).toEqual(['version', 'requestId']);
    expect(parameterNames(service.pluginInstall)).toEqual(['name', 'version', 'requestId']);
    expect(parameterNames(service.updateRun)).toEqual(['id']);
    expect(parameterNames(service.updateCancel)).toEqual(['id']);
    expect(parameterNames(service.releaseRestart)).toEqual([]);
    expect(parameterNames(service.telemetryStatus)).toEqual([]);
    expect(parameterNames(service.telemetrySet)).toEqual(['enabled']);
    expect(parameterNames(service.gitStatus)).toEqual([]);
    expect(parameterNames(service.scheduleList)).toEqual(['slug']);
    expect(parameterNames(service.scheduleCreate)).toEqual(['slug', 'input']);
    expect(parameterNames(service.scheduleUpdate)).toEqual(['slug', 'id', 'change']);
    expect(parameterNames(service.scheduleDelete)).toEqual(['slug', 'id']);
    expect(parameterNames(service.scheduleHistory)).toEqual(['slug', 'id']);
    expect(parameterNames(service.scheduleRunNow)).toEqual(['slug', 'id']);
    expect(parameterNames(service.schedulePreview)).toEqual(['trigger']);
    expect(parameterNames(service.messagingDefaults)).toEqual(['platform']);
    expect(parameterNames(service.channels)).toEqual([]);
    expect(parameterNames(service.channelDm)).toEqual(['slug', 'displayName']);
    expect(parameterNames(service.channelGet)).toEqual(['channelId']);
    expect(parameterNames(service.channelCreate)).toEqual(['name', 'members', 'operationKey']);
    expect(parameterNames(service.channelGroupInvite)).toEqual([
      'channelId',
      'botSlug',
      'operationKey',
      'expectedChannel',
    ]);
    expect(parameterNames(service.channelRename)).toEqual(['channelId', 'name', 'expectedChannel']);
    expect(parameterNames(service.channelMessages)).toEqual(['channelId', 'before', 'limit']);
    expect(parameterNames(service.channelTimeline)).toEqual([
      'channelId',
      'direction',
      'cursor',
      'around',
      'limit',
      'olderLimit',
      'newerLimit',
    ]);
    expect(parameterNames(service.channelSend)).toEqual([
      'channelId',
      'body',
      'replyTo',
      'attachments',
      'messageId',
      'memorySwitchTarget',
      'mentions',
      'channelRefs',
      'grantRequestResolution',
      'assignmentReply',
      'allBotMention',
      'genuiReply',
      'skillInvocations',
      'quotes',
    ]);
    expect(parameterNames(service.channelSkillCatalog)).toEqual(['channelId']);
    expect(parameterNames(service.botAttention)).toEqual(['slug', 'limit', 'cursor', 'state']);
    expect(parameterNames(service.humanAssignmentContext)).toEqual([
      'slug',
      'sessionId',
      'sourceEventId',
    ]);
    expect(parameterNames(service.assignments)).toEqual([
      'slug',
      'query',
      'activity',
      'includeArchived',
      'limit',
      'cursor',
    ]);
    expect(parameterNames(service.assignment)).toEqual(['slug', 'sessionId']);
    expect(parameterNames(service.sessions)).toEqual(['slug', 'includeTitles']);
    expect(parameterNames(service.sessionOwner)).toEqual(['sessionId']);
    expect(parameterNames(service.rosterGet)).toEqual([]);
    expect(parameterNames(service.sectionCreate)).toEqual(['name']);
    expect(parameterNames(service.sectionRename)).toEqual(['sectionId', 'name']);
    expect(parameterNames(service.sectionRemove)).toEqual(['sectionId']);
    expect(parameterNames(service.channelAssign)).toEqual(['channelId', 'sectionId', 'index']);
    expect(parameterNames(service.sectionReorder)).toEqual(['order']);
    expect(parameterNames(service.topReorder)).toEqual(['order']);
    expect(parameterNames(service.pinsSet)).toEqual(['pins']);
    expect(parameterNames(service.hiddenSet)).toEqual(['hidden']);
    expect(parameterNames(service.channelMuteSet)).toEqual(['channelId', 'muted']);
    expect(parameterNames(service.rosterBatch)).toEqual(['action', 'channelIds', 'sectionId']);
  });

  it.each(['human-dm', 'bot-dm', 'group-mention'] as const)(
    'sets and restores %s delivery through the public bridge',
    (sourceClass) => {
      const home = mkdtempSync(join(tmpdir(), 'botharness-delivery-rpc-'));
      roots.push(home);
      const database = mountOperationalDatabase({
        dshHome: home,
        schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
      });
      try {
        const policy = createBotSourcePolicyStore(
          attachOperationalModule(database, 'delivery-rpc'),
        );
        const { service } = setup(policy);
        service.create('Ada');
        expect(parameterNames(service.botSourcePolicySet)).toEqual([
          'slug',
          'wake',
          'sourceClass',
          'digestCount',
          'digestIntervalSeconds',
          'delivery',
        ]);
        expect(
          service.botSourcePolicySet('ada', 'immediate', sourceClass, undefined, undefined, 'turn')
            .policy,
        ).toMatchObject({
          sourceClass,
          delivery: 'turn',
          revision: 2,
          lastActor: { kind: 'human' },
          overrideActive: true,
        });
        expect(policy.list('ada').find((row) => row.sourceClass === sourceClass)?.delivery).toBe(
          'turn',
        );
        expect(service.botSourcePolicyReset('ada', sourceClass).policy).toMatchObject({
          sourceClass,
          delivery: 'steer',
          revision: 3,
          lastActor: { kind: 'human' },
          overrideActive: false,
        });
      } finally {
        database.close();
      }
    },
  );

  it('dispatches named arguments into the read model', async () => {
    const { service, registry } = setup();

    const created = service.create('Ada', ['研究'], '# Ada\n');
    expect(created.bot).toMatchObject({ slug: 'ada', displayName: 'Ada', roles: ['研究'] });
    expect(registry.get('ada')).toBeDefined();
    expect(service.get('ada').bot.slug).toBe('ada');
    expect(service.list('ada').bots.map((bot) => bot.slug)).toEqual(['ada']);
    expect(service.pause('ada').bot.paused).toBe(true);
    expect(service.resume('ada').bot.paused).toBeUndefined();

    const dm = service.channelDm('ada', 'Ada');
    expect(dm.channel.id).toBe('dm-ada');
    const renamed = service.channelRename('dm-ada', 'Ada Lovelace');
    expect(renamed.channel.name).toBe('Ada Lovelace');
    expect(renamed.bot?.displayName).toBe('Ada Lovelace');
    expect((await service.channels()).channels.map((channel) => channel.id)).toEqual(['dm-ada']);
    const sent = await service.channelSend('dm-ada', 'hello');
    expect(sent.message.body).toBe('hello');
    expect((await service.channels()).channels[0]?.latestMessage?.body).toBe('hello');
    expect(service.channelMessages('dm-ada').messages[0]?.body).toBe('hello');
    expect(service.assignments('ada').assignments).toEqual([]);
    expect(service.sessions('ada').sessions).toEqual([]);
    expect(service.sessionOwner('unknown').owner).toBeNull();
  });

  it('throws RemoteError failures so the gateway keeps code and message on the wire', () => {
    const { service } = setup();

    try {
      service.get('missing');
      expect.unreachable('service.get should throw');
    } catch (error) {
      expect(error).toMatchObject({
        name: 'RemoteError',
        isDSHRemoteError: true,
        code: 'not-found',
        message: 'unknown PersonaBot: missing',
        details: {},
      });
    }
  });
});
