import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { createTempRoot } from './helpers.js';
import { VoiceProviders } from '../src/voice/providers.js';

const alice = humanContext('alice');
const bob = humanContext('bob');
const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0).reverse()) {
    core.schedules.close();
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

function fixture() {
  const home = createTempRoot('team-bot-memory-');
  const core = createCore({ dshHome: home });
  cores.push(core);
  const db = attachOperationalModule(core.operationalDatabase, 'memory-test');
  db.transaction((db) => {
    for (const human of [alice, bob]) {
      db.prepare("INSERT INTO humans VALUES (?, ?, 'active', 'before')").run(
        human.humanId,
        human.humanId,
      );
      db.prepare("INSERT INTO human_roles VALUES (?, 'member')").run(human.humanId);
    }
    db.prepare('UPDATE team_settings SET enabled = 1').run();
  });
  for (const human of [owner, alice, bob]) {
    core.spaces.ensureAccount(human.humanId);
    const slug = human.humanId + '-bot';
    expect(core.registry.create({ slug, displayName: slug, ownerHumanId: human.humanId }).ok).toBe(
      true,
    );
    core.channels.getOrCreateDm(human, slug, slug);
  }
  const bridge = createBridgeMethodsForHumans(core);
  return { core, home, db, bridge, member: bridge(alice), channelId: 'dm-alice-bot' };
}

describe('members manage their own Bot Memory', () => {
  it('keeps public Bot Memory management principal-only after another member opens a DM', () => {
    const f = fixture();
    f.core.team.bots.setVisibility(owner, 'alice-bot', {
      kind: 'public',
      audience: { kind: 'everyone' },
    });
    const participantDm = f.core.team.bots.dm(bob, 'alice-bot')!;
    const scope = { channelId: f.channelId };
    const snapshot = f.member.memorySnapshot(scope);
    if (!snapshot.ok || !snapshot.value.snapshot.head) throw new Error('missing-head');
    expect(
      f.member.memorySave({
        ...scope,
        path: 'public.md',
        body: 'principal edit',
        expectedHead: snapshot.value.snapshot.head,
        editId: randomUUID(),
      }),
    ).toMatchObject({ ok: true });
    expect(f.member.memoryFile({ ...scope, path: 'public.md' })).toMatchObject({
      ok: true,
      value: { file: { body: 'principal edit' } },
    });
    expect(
      f.bridge(bob).memoryFile({ channelId: participantDm.id, path: 'public.md' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'not-found' },
    });
    expect(f.bridge(bob).memoryFileTarget({ slug: 'alice-bot', path: 'public.md' })).toMatchObject({
      ok: false,
      error: { code: 'bot-not-found' },
    });
    expect(f.bridge(owner).memoryFile({ ...scope, path: 'public.md' })).toMatchObject({
      ok: false,
      error: { code: 'channel-not-found' },
    });
  });

  it('lists configured voice choices without credentials and binds only an owned Bot', async () => {
    const f = fixture();
    const ctx = new Context();
    const fiber = ctx.plugin(LocalCredentialProvider, {
      path: join(f.home, 'voice-test-credentials.yaml'),
      watch: false,
    });
    await fiber.await();
    try {
      const voiceProviders = new VoiceProviders({
        database: attachOperationalModule(f.core.operationalDatabase, 'voice-test'),
        credentials: () => ctx.credentials,
      });
      const bridge = createBridgeMethodsForHumans({ ...f.core, voiceProviders });
      const secret = 'synthetic-4200-provider-key';
      const added = await bridge(owner).voiceProviderAdd({
        preset: 'custom',
        name: 'Configured voice',
        baseUrl: 'https://voice.invalid/v1',
        model: 'test-model',
        key: secret,
      });
      if (!added.ok) throw new Error(added.error.code);
      const id = added.value.provider.id;
      const choices = bridge(alice).voiceProviders({ slug: 'alice-bot' });
      expect(choices).toMatchObject({
        ok: true,
        value: { providers: [expect.objectContaining({ id, keySet: true })] },
      });
      expect(JSON.stringify(choices)).not.toContain(secret);
      expect(bridge(alice).botVoiceSet({ slug: 'alice-bot', providerId: id })).toMatchObject({
        ok: true,
      });
      expect(bridge(alice).botAsrSet({ slug: 'alice-bot', providerId: null })).toMatchObject({
        ok: true,
      });
      expect(bridge(alice).botVoiceSet({ slug: 'bob-bot', providerId: id })).toMatchObject({
        ok: false,
        error: { code: 'bot-not-found' },
      });
      for (const method of [
        'voiceProviderAdd',
        'voiceProviderRemove',
        'voiceProviderTest',
      ] as const)
        expect(await bridge(alice)[method]({ id, key: secret })).toMatchObject({
          ok: false,
          error: { code: 'permission-required' },
        });
    } finally {
      await fiber.dispose();
    }
  });

  it('saves, reads, versions and restores through the same bridge as Owner', async () => {
    const f = fixture();
    for (const human of [owner, alice]) {
      const bridge = f.bridge(human);
      const slug = human.humanId + '-bot';
      const scope = { channelId: 'dm-' + slug };
      const snapshot = bridge.memorySnapshot(scope);
      if (!snapshot.ok) throw new Error(snapshot.error.code);
      if (snapshot.value.snapshot.head === null) throw new Error('missing-head');
      const save = (body: string, expectedHead: string) =>
        bridge.memorySave({ ...scope, path: 'own.md', body, expectedHead, editId: randomUUID() });
      const first = save('version one', snapshot.value.snapshot.head);
      if (!first.ok) throw new Error(first.error.code);
      const second = save('version two', first.value.commit.sha);
      if (!second.ok) throw new Error(second.error.code);
      expect(bridge.memoryFile({ ...scope, path: 'own.md' })).toMatchObject({
        ok: true,
        value: { file: { body: 'version two' } },
      });
      expect(bridge.memoryHistory(scope)).toMatchObject({
        ok: true,
        value: {
          commits: expect.arrayContaining([
            expect.objectContaining({ sha: first.value.commit.sha }),
          ]),
        },
      });
      expect(bridge.memoryDiff({ ...scope, sha: first.value.commit.sha })).toMatchObject({
        ok: true,
      });
      expect(bridge.memoryGitGraph(scope)).toMatchObject({ ok: true });
      expect(bridge.memoryGitCommitDiff({ ...scope, sha: first.value.commit.sha })).toMatchObject({
        ok: true,
      });
      expect(bridge.memoryWorkingChanges(scope)).toMatchObject({ ok: true });
      writeFileSync(join(f.core.registry.memoryDirFor(slug)!, 'scratch.md'), 'Untracked');
      expect(
        bridge.memoryWorkingDiff({ ...scope, path: 'scratch.md', kind: 'untracked' }),
      ).toMatchObject({ ok: true });
      expect(bridge.memoryFileTarget({ slug, path: 'own.md' })).toMatchObject({ ok: true });
      const named = bridge.memoryNameVersion({
        ...scope,
        sha: first.value.commit.sha,
        name: 'First',
      });
      if (!named.ok) throw new Error(named.error.code);
      expect(bridge.memoryVersions(scope)).toMatchObject({ ok: true });
      expect(
        bridge.memoryRemoveVersionName({ ...scope, tag: named.value.version.tag }),
      ).toMatchObject({ ok: true });
      expect(
        bridge.memoryRestoreCommit({
          ...scope,
          sha: first.value.commit.sha,
          expectedHead: second.value.commit.sha,
          restoreId: randomUUID(),
        }),
      ).toMatchObject({ ok: true });
      expect(bridge.memoryFile({ ...scope, path: 'own.md' })).toMatchObject({
        ok: true,
        value: { file: { body: 'version one' } },
      });
      const checkpoints = bridge.memoryRecoveryHistory(scope);
      if (!checkpoints.ok) throw new Error(checkpoints.error.code);
      expect(checkpoints.value.checkpoints.length).toBeGreaterThan(0);
    }
    expect(f.core.registry.memoryDirFor('alice-bot')).toBe(
      join(f.home, 'spaces/alice/bots/alice-bot/memory'),
    );
    await f.core.team.setOwnerPassword(owner, 'Memory-test-2026!');
    await f.core.team.setMode(owner, false);
    expect(f.member.memorySnapshot({ channelId: f.channelId })).toMatchObject({
      ok: false,
      error: { code: 'member-suspended' },
    });
    await f.core.team.setMode(owner, true);
    expect(f.member.memoryFile({ channelId: f.channelId, path: 'own.md' })).toMatchObject({
      ok: true,
      value: { file: { body: 'version one' } },
    });
    expect(readFileSync(join(f.home, 'spaces/alice/bots/alice-bot/memory/own.md'), 'utf8')).toBe(
      'version one',
    );
  });

  it('reads bounded version-bound image bytes only for the current principal', () => {
    const f = fixture();
    const bytes = readFileSync(new URL('./fixtures/memory-images/green.png', import.meta.url));
    writeFileSync(join(f.core.registry.memoryDirFor('alice-bot')!, 'image.png'), bytes);
    const input = {
      slug: 'alice-bot',
      path: 'image.png',
      source: 'worktree',
      revision: createHash('sha256').update(bytes).digest('hex'),
    };
    expect(f.member.memoryImage(input)).toEqual({
      ok: true,
      value: { mime: 'image/png', dataBase64: bytes.toString('base64') },
    });
    expect(f.bridge(bob).memoryImage(input)).toMatchObject({
      ok: false,
      error: { code: 'bot-not-found' },
    });
    expect(f.member.memoryImage({ ...input, revision: '0'.repeat(64) })).toMatchObject({
      ok: false,
      error: { code: 'memory-image-stale' },
    });
  });

  it('keeps own-Bot settings, Session metadata and workspaces operable', async () => {
    const f = fixture();
    const slug = 'alice-bot';
    const scope = { channelId: f.channelId };
    for (const method of ['promptParts', 'promptPresets', 'approvalTemplates'] as const)
      expect(await f.member[method]({ slug }), method).toMatchObject({ ok: true });
    expect(f.member.botPrompt({ slug })).toMatchObject({ ok: true });
    expect(f.member.botPromptSet({ slug, parts: {}, limits: {} })).toMatchObject({ ok: true });
    expect(f.member.botApprovalTemplateSet({ slug, template: null })).toMatchObject({ ok: true });
    for (const method of ['computerAccessSet', 'browserAccessSet'] as const)
      expect(f.member[method]({ slug, enabled: false })).toMatchObject({ ok: true });
    expect(f.member.browserProfileSet({ slug, profile: 'own-profile' })).toMatchObject({
      ok: true,
    });
    expect(f.member.botSourcePolicies({ slug })).toMatchObject({ ok: true });
    f.core.ownership.claim({
      sessionId: 'alice-session',
      botSlug: slug,
      rootRole: 'orchestrator',
      at: 'before',
    });
    f.core.ownership.claim({
      sessionId: 'bob-session',
      botSlug: 'bob-bot',
      rootRole: 'orchestrator',
      at: 'before',
    });
    expect(f.member.sessions({ slug })).toMatchObject({
      ok: true,
      value: { sessions: [expect.objectContaining({ sessionId: 'alice-session' })] },
    });
    expect(f.member.sessionOwner({ sessionId: 'alice-session' })).toMatchObject({
      ok: true,
      value: { owner: { botSlug: slug } },
    });
    expect(f.member.sessionOwner({ sessionId: 'bob-session' })).toEqual({
      ok: true,
      value: { owner: null },
    });
    expect(f.member.assignments({ slug })).toMatchObject({ ok: true });
    expect(f.member.grants({ slug })).toMatchObject({ ok: true });
    const granted = await f.member.grantCreate({ slug, workspaceId: 'spaces/alice' });
    if (!granted.ok) throw new Error(granted.error.code);
    expect(f.member.workspaceFileTarget({ slug, grantId: granted.value.grant.id })).toMatchObject({
      ok: true,
      value: { target: { path: join(f.home, 'spaces/alice/files') } },
    });
    expect(await f.member.grantCreate({ slug, workspaceId: 'spaces/bob' })).toMatchObject({
      ok: false,
      error: { code: 'grant-foreign-space' },
    });

    expect(f.member.workspaceOptions({})).toMatchObject({
      ok: true,
      value: {
        workspaces: [expect.objectContaining({ path: join(f.home, 'spaces/alice/files') })],
      },
    });
    const forbidden = [
      'botPrompt',
      'botPromptSet',
      'botApprovalTemplateSet',
      'computerAccessSet',
      'browserAccessSet',
      'browserProfileSet',
      'botSourcePolicies',
      'botSourcePolicySet',
      'botSourcePolicyReset',
      'sessions',
      'assignments',
      'assignment',
      'assignmentTimeline',
      'sessionSubagents',
      'sessionArchiveSet',
      'botToolTrace',
      'botTurnInput',
      'profileUsage',
      'profileSessionUsage',
      'profileActivity',
      'workspaceFileTarget',
    ] as const;
    for (const method of forbidden)
      expect(
        await f.member[method]({
          slug: 'bob-bot',
          channelId: 'dm-bob-bot',
          sessionId: 'bob-session',
        }),
        method,
      ).toMatchObject({ ok: false, error: { code: 'bot-not-found' } });
    expect(
      f.member.profileUsage({ ...scope, filter: { start: '2026-11-01', end: '2026-11-01' } }),
    ).toMatchObject({ ok: true });
  });

  it('does not enumerate unrelated Bots to authorize a Memory read', () => {
    const f = fixture();
    const list = vi.spyOn(f.core.registry, 'list');
    const historical = vi.spyOn(f.core.registry, 'listHistorical');
    expect(f.member.memorySnapshot({ channelId: f.channelId })).toMatchObject({ ok: true });
    expect(f.member.memoryHistory({ channelId: f.channelId })).toMatchObject({ ok: true });
    expect(f.bridge(bob).memorySnapshot({ channelId: f.channelId })).toMatchObject({
      ok: false,
      error: { code: 'bot-not-found' },
    });
    expect(list).not.toHaveBeenCalled();
    expect(historical).not.toHaveBeenCalled();
  });

  it('refuses every Memory operation for another principal before parsing operation data', async () => {
    const f = fixture();
    const methods = [
      'memoryImage',
      'memorySnapshot',
      'memoryFile',
      'memoryHistory',
      'memoryDiff',
      'memoryGitGraph',
      'memoryGitCommitDiff',
      'memoryWorkingChanges',
      'memoryWorkingDiff',
      'memoryRecoveryHistory',
      'memoryRestore',
      'memorySave',
      'memoryRestoreCommit',
      'memoryNameVersion',
      'memoryVersions',
      'memoryRemoveVersionName',
      'memoryRepair',
      'memoryFileTarget',
      'memoryMove',
    ] as const;
    for (const slug of ['bob-bot', 'local-human-bot'])
      for (const method of methods)
        expect(await f.member[method]({ slug, channelId: 'dm-' + slug }), method).toMatchObject({
          ok: false,
          error: { code: 'bot-not-found' },
        });
    f.core.team.roles.set(owner, bob.humanId, ['admin']);
    const bridge = f.bridge(bob);
    expect(bridge.memorySnapshot({ channelId: f.channelId })).toMatchObject({
      ok: false,
      error: { code: 'bot-not-found' },
    });
    expect(
      f.member.memorySnapshot({
        channelId: f.channelId,
        humanId: bob.humanId,
        ownerHumanId: bob.humanId,
      }),
    ).toMatchObject({ ok: true });
    expect(f.core.registry.update('alice-bot', { displayName: 'still owned' }).ok).toBe(true);
    f.db.transaction((db) =>
      db
        .prepare(
          "UPDATE persona_bots SET owner_human_id = 'bob', body = json_set(body, '$.ownerHumanId', 'bob') WHERE slug = 'alice-bot'",
        )
        .run(),
    );
    expect(f.member.memorySnapshot({ channelId: f.channelId })).toMatchObject({
      ok: false,
      error: { code: 'bot-not-found' },
    });
  });
});
