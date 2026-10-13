import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createPersonaBotDeletions,
  type PersonaBotDeletionDependencies,
} from '../src/bots/deletion.js';
import { seededAvatarFor } from '../src/bots/avatar-appearance.js';
import { fallbackPrimaryColor, resolveBotPrimaryColor } from '../src/bots/primary-color.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';

const cores: ReturnType<typeof createCore>[] = [];
const homes: string[] = [];
function fixture() {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'bh896-test-')));
  homes.push(home);
  const core = createCore({ dshHome: home });
  cores.push(core);
  const dependencies: PersonaBotDeletionDependencies = {
    sessions: [],
    workspaces: [],
    grants: [],
    identities: [],
    channels: [],
  };
  const stop = vi.fn(async (): Promise<void> => undefined);
  let workspaces: string[] = [];
  const options = {
    database: core.operationalDatabase,
    registry: core.registry,
    dependencies: () => dependencies,
    allWorkspacePaths: () => workspaces,
    stop,
  };
  const deletion = createPersonaBotDeletions(options);
  function create(slug = 'a', memoryDir?: string) {
    expect(
      core.registry.create({
        slug,
        displayName: 'Same name',
        persona: '# Soul\n',
        ...(memoryDir === undefined ? {} : { memoryDir }),
      }).ok,
    ).toBe(true);
    return core.registry.memoryDirFor(slug)!;
  }
  return {
    home,
    core,
    deletion,
    options,
    create,
    stop,
    dependencies,
    workspace: (path: string) => {
      workspaces = [path];
    },
  };
}
afterEach(async () => {
  for (const core of cores.splice(0)) {
    await core.runtime.close();
    core.externalMessaging.close();
    core.operationalDatabase.close();
  }
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

describe('confirmed terminal PersonaBot deletion', () => {
  it('retains all Memory bytes/Git and history, blocks identity reuse and late control after cold restart', async () => {
    const f = fixture();
    const path = f.create();
    writeFileSync(join(path, 'uncommitted.md'), 'private draft');
    const channel = f.core.channels.getOrCreateDm('a', 'Same name');
    if (channel === undefined) throw new Error('fixture DM unavailable');
    await f.core.channels.appendMessageOnce(channel.id, {
      id: 'history',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'Keep attribution',
    });
    f.core.ownership.claim({
      sessionId: 'old-session',
      botSlug: 'a',
      rootRole: 'orchestrator',
      at: new Date().toISOString(),
    });
    const workspace = join(f.home, 'workspace');
    f.core.registry.update('a', { workspaces: [workspace] });
    expect(f.core.registry.findByWorkspace(workspace)?.slug).toBe('a');
    const preview = f.deletion.preview('a');
    expect(preview.eraseAvailable).toBe(true);
    expect(await f.deletion.confirm('a', preview.token, false)).toMatchObject({
      phase: 'complete',
      memory: 'retained',
      memoryDir: path,
    });
    expect(readFileSync(join(path, 'uncommitted.md'), 'utf8')).toBe('private draft');
    expect(
      execFileSync('git', ['-C', path, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    ).not.toBe('');
    expect(f.core.registry.get('a')).toBeUndefined();
    expect(f.core.registry.findByWorkspace(workspace)).toBeUndefined();
    expect(f.core.registry.getHistorical('a')?.displayName).toBe('Same name');
    expect(f.core.registry.create({ slug: 'a', displayName: 'new' })).toEqual({
      ok: false,
      reason: 'duplicate',
    });
    expect(f.core.registry.setPaused('a', false)).toEqual({ ok: false, reason: 'not-found' });
    const historical = f.core.registry.getHistorical('a');
    expect(f.core.registry.setStandingLimits('a', { soul: 1000, coreMemory: 1000 })).toEqual({
      ok: false,
      reason: 'not-found',
    });
    expect(
      f.core.registry.setModelPlan(
        'a',
        {
          orchestrator: { provider: 'test', model: 'model' },
          assignmentDefault: { provider: 'test', model: 'model' },
          assignmentModels: [],
        },
        0,
      ),
    ).toEqual({ ok: false, reason: 'not-found' });
    expect(f.core.registry.getHistorical('a')).toEqual(historical);
    expect(f.core.channels.latestMessage(channel.id)?.body).toBe('Keep attribution');
    expect(f.core.ownership.resolve('old-session')?.botSlug).toBe('a');
    await f.core.runtime.close();
    f.core.externalMessaging.close();
    f.core.operationalDatabase.close();
    cores.splice(cores.indexOf(f.core), 1);
    const restarted = createCore({ dshHome: f.home });
    cores.push(restarted);
    expect(restarted.registry.get('a')).toBeUndefined();
    expect(restarted.deletions.get('a')).toMatchObject({ memory: 'retained', memoryDir: path });
    expect(restarted.registry.create({ slug: 'replacement', displayName: 'Same name' }).ok).toBe(
      true,
    );
    expect(restarted.registry.get('replacement')?.browserAccess).toBeUndefined();
  });
  it('fences authority synchronously and drains execution before removing even one Memory file', async () => {
    const f = fixture();
    const path = f.create();
    let release!: () => void;
    const drain = {
      promise: new Promise<void>((resolve) => {
        release = resolve;
      }),
      resolve: () => release(),
    };
    f.stop.mockImplementation(() => drain.promise);
    const deleted = f.deletion.confirm('a', f.deletion.preview('a').token, true);
    expect(f.core.registry.get('a')).toBeUndefined();
    expect(existsSync(path)).toBe(true);
    await Promise.resolve();
    expect(f.stop).toHaveBeenCalledWith('a');
    drain.resolve();
    expect(await deleted).toMatchObject({ phase: 'complete', memory: 'erased' });
    expect(existsSync(path)).toBe(false);
    expect(f.core.registry.getHistorical('a')).toBeDefined();
  });
  it('erases a newly created custom repository without deleting its parent or a Workspace', async () => {
    const f = fixture();
    const path = join(f.home, 'custom-memory');
    const sibling = join(f.home, 'workspace.md');
    writeFileSync(sibling, 'keep');
    f.create('a', path);
    expect(await f.deletion.confirm('a', f.deletion.preview('a').token, true)).toMatchObject({
      phase: 'complete',
      memory: 'erased',
    });
    expect(existsSync(path)).toBe(false);
    expect(readFileSync(sibling, 'utf8')).toBe('keep');
  });
  it('refuses shared custom roots but permits deletion retaining both owners’ Memory', async () => {
    const f = fixture();
    const path = join(f.home, 'shared');
    f.create('a', path);
    f.create('b', path);
    const preview = f.deletion.preview('a');
    expect(preview.eraseAvailable).toBe(false);
    await expect(f.deletion.confirm('a', preview.token, true)).rejects.toThrow('overlaps');
    expect(f.core.registry.get('a')).toBeDefined();
    await f.deletion.confirm('a', preview.token, false);
    expect(existsSync(path)).toBe(true);
    expect(f.core.registry.get('b')).toBeDefined();
  });
  it('refuses pre-existing unproven custom directories, Workspace overlap and escaping symlinks', () => {
    const f = fixture();
    const external = join(f.home, 'existing');
    mkdirSync(external);
    f.create('a', external);
    expect(f.deletion.preview('a').eraseAvailable).toBe(false);
    const path = f.create('b');
    f.workspace(join(path, 'nested-workspace'));
    expect(f.deletion.preview('b').refusal).toContain('Workspace');
    f.workspace(join(f.home, 'other'));
    symlinkSync(f.home, join(path, 'escape'));
    expect(f.deletion.preview('b').refusal).toContain('symbolic link');
  });
  it('refuses stale dependency/name/path previews without disabling the Bot', async () => {
    const f = fixture();
    const path = f.create();
    const preview = f.deletion.preview('a');
    f.dependencies.sessions.push('new-session');
    await expect(f.deletion.confirm('a', preview.token, false)).rejects.toThrow('scope changed');
    const changed = f.deletion.preview('a');
    f.core.registry.update('a', { displayName: 'Changed' });
    await expect(f.deletion.confirm('a', changed.token, true)).rejects.toThrow('scope changed');
    const latest = f.deletion.preview('a');
    renameSync(path, `${path}-saved`);
    mkdirSync(path);
    execFileSync('git', ['init', path]);
    await expect(f.deletion.confirm('a', latest.token, true)).rejects.toThrow('scope changed');
    expect(f.core.registry.get('a')).toBeDefined();
    expect(existsSync(`${path}-saved`)).toBe(true);
  });
  it('persists incomplete cleanup and retries partial removal without switching repository identity', async () => {
    const f = fixture();
    const path = f.create();
    const interrupted = createPersonaBotDeletions({
      ...f.options,
      removeMemory: (target) => {
        rmSync(join(target, '.git'), { recursive: true });
        throw new Error('injected disk refusal');
      },
    });
    const state = await interrupted.confirm('a', interrupted.preview('a').token, true);
    expect(state).toMatchObject({
      phase: 'incomplete',
      memory: 'pending',
      cleanupAccepted: true,
      failure: 'injected disk refusal',
    });
    expect(f.core.registry.get('a')).toBeUndefined();
    const retry = createPersonaBotDeletions(f.options);
    expect(await retry.retry('a')).toMatchObject({ phase: 'complete', memory: 'erased' });
    expect(await retry.retry('a')).toMatchObject({ phase: 'complete', memory: 'erased' });
    expect(existsSync(path)).toBe(false);
  });
  it('never treats a missing repository before accepted cleanup as erased', async () => {
    const f = fixture();
    const path = f.create();
    f.stop.mockImplementation(async () => {
      renameSync(path, `${path}-saved`);
    });
    const state = await f.deletion.confirm('a', f.deletion.preview('a').token, true);
    expect(state).toMatchObject({ phase: 'incomplete', memory: 'pending' });
    expect(existsSync(`${path}-saved`)).toBe(true);
  });
  it('refuses path replacement after a cleanup failure and keeps the durable original locator', async () => {
    const f = fixture();
    const path = f.create();
    const refusal = createPersonaBotDeletions({
      ...f.options,
      removeMemory: () => {
        throw new Error('refused');
      },
    });
    await refusal.confirm('a', refusal.preview('a').token, true);
    renameSync(path, `${path}-saved`);
    mkdirSync(path);
    execFileSync('git', ['init', path]);
    expect(await f.deletion.retry('a')).toMatchObject({ phase: 'incomplete', memoryDir: path });
    expect(existsSync(path)).toBe(true);
    expect(existsSync(`${path}-saved`)).toBe(true);
  });
  it('refuses Memory erasure inside protected Host storage even for a newly created repository', async () => {
    const f = fixture();
    const path = join(f.home, 'botharness', 'browser');
    f.create('a', path);
    writeFileSync(join(path, 'shared-browser-profile.json'), 'shared provider data');
    const reviewed = f.core.deletions.preview('a');
    expect(reviewed.eraseAvailable).toBe(false);
    expect(reviewed.refusal).toContain('protected Host storage');
    await expect(f.core.deletions.confirm('a', reviewed.token, true)).rejects.toThrow(
      'protected Host storage',
    );
    expect(existsSync(join(path, 'shared-browser-profile.json'))).toBe(true);
    expect(await f.core.deletions.confirm('a', reviewed.token, false)).toMatchObject({
      phase: 'complete',
      memory: 'retained',
    });
  });

  it('erases the Bot’s private accounts while stopping and retries an incomplete erase', async () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'bh1521-test-')));
    homes.push(home);
    const erase = vi.fn(async (_slug: string): Promise<unknown> => {
      throw new Error('Private account authority is unavailable');
    });
    const core = createCore({ dshHome: home, erasePrivateAccounts: erase });
    cores.push(core);
    expect(
      core.registry.create({ slug: 'a', displayName: 'Same name', persona: '# Soul\n' }).ok,
    ).toBe(true);
    const reviewed = core.deletions.preview('a');
    expect(await core.deletions.confirm('a', reviewed.token, false)).toMatchObject({
      phase: 'incomplete',
      failure: 'Private account authority is unavailable',
    });
    erase.mockResolvedValueOnce(2);
    expect(await core.deletions.retry('a')).toMatchObject({ phase: 'complete' });
    expect(erase.mock.calls.map(([slug]) => slug)).toEqual(['a', 'a']);
  });

  it('folder inspection never creates a missing directory or accepts deletion', () => {
    const f = fixture();
    const path = f.create();
    expect(f.deletion.folder('a')).toEqual({ kind: 'directory', path, relativePath: '.' });
    expect(f.deletion.get('a')).toBeUndefined();
    rmSync(path, { recursive: true });
    expect(() => f.deletion.folder('a')).toThrow();
    expect(existsSync(path)).toBe(false);
    expect(f.core.registry.get('a')).toBeDefined();
  });
  it('uses the production bridge to keep history readable while rejecting deleted DM input and restart', async () => {
    const f = fixture();
    f.create();
    const methods = createBridgeMethods({ ...f.core, deletions: f.core.deletions });
    const channel = f.core.channels.getOrCreateDm('a', 'Same name');
    if (channel === undefined) throw new Error('fixture DM unavailable');
    const reviewed = f.core.deletions.preview('a');
    expect(
      await methods.deletionConfirm({ slug: 'a', token: reviewed.token, eraseMemory: false }),
    ).toMatchObject({ ok: true, value: { deletion: { phase: 'complete' } } });
    expect(methods.list({})).toMatchObject({
      ok: true,
      value: { bots: [{ slug: 'a', deleted: true }] },
    });
    expect(methods.sessions({ slug: 'a' })).toMatchObject({ ok: true });
    expect(methods.assignments({ slug: 'a' })).toMatchObject({ ok: true });
    expect(methods.botAttention({ slug: 'a' })).toMatchObject({ ok: true });
    expect(methods.resume({ slug: 'a' })).toMatchObject({ ok: false });
    expect(
      await methods.channelSend({ channelId: channel.id, body: 'late delivery' }),
    ).toMatchObject({ ok: false });
    expect(f.core.channels.latestMessage(channel.id)).toBeUndefined();
  });
  it('retains the last resolved Bot Primary Color for deleted Bots while live Bots keep following theirs', async () => {
    const image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZFsAAAAASUVORK5CYII=';
    const f = fixture();
    const recipe = { ...seededAvatarFor('Same name', undefined), hairColor: '#3fc1b8' };
    for (const slug of ['custom', 'hair', 'image', 'seeded', 'legacy', 'live']) f.create(slug);
    expect(f.core.registry.setPrimaryColor('custom', { mode: 'custom', color: '#1d1b22' }).ok).toBe(
      true,
    );
    expect(f.core.registry.setAppearance('hair', recipe).ok).toBe(true);
    expect(f.core.registry.update('image', { avatar: image }).ok).toBe(true);
    expect(f.core.registry.setAppearance('live', recipe).ok).toBe(true);
    const seeded = resolveBotPrimaryColor(f.core.registry.get('seeded')!).color;
    const methods = createBridgeMethods({ ...f.core, deletions: f.core.deletions });
    const listed = (source = methods) => {
      const result = source.list({});
      if (!result.ok) throw new Error('list failed');
      return Object.fromEntries(result.value.bots.map((bot) => [bot.slug, bot]));
    };
    const at = Date.now();
    for (const slug of ['custom', 'live']) {
      f.core.ownership.claim({
        sessionId: `usage-${slug}`,
        botSlug: slug,
        rootRole: 'orchestrator',
        provenance: 'created',
        at: new Date(at).toISOString(),
      });
      f.core.usage!.handleSessionEvent(`usage-${slug}`, {
        type: 'assistant/message',
        seq: 1,
        time: at,
        data: {
          message: { source: { provider: 'actual', model: 'used' } },
          usage: { inputTokens: 7, outputTokens: 0, totalTokens: 7 },
        },
      });
    }
    const usageRows = (source = methods) => {
      const result = source.overviewUsage({ period: 'today' });
      if (!result.ok) throw new Error(result.error.message);
      return Object.fromEntries(result.value.bots.map((bot) => [bot.slug, bot]));
    };
    expect(usageRows()['custom']).toMatchObject({
      current: true,
      primaryColor: '#1d1b22',
      totalTokens: 7,
    });
    const before = listed();
    expect(before['custom']!.primaryColor).toEqual({ mode: 'custom', color: '#1d1b22' });
    expect(before['hair']!.primaryColor).toBeUndefined();

    for (const slug of ['custom', 'hair', 'image', 'seeded', 'legacy']) {
      const reviewed = f.core.deletions.preview(slug);
      expect(
        await methods.deletionConfirm({ slug, token: reviewed.token, eraseMemory: false }),
      ).toMatchObject({ ok: true, value: { deletion: { phase: 'complete' } } });
    }
    attachOperationalModule(f.core.operationalDatabase, 'bot-registry').transaction(
      (database) => {
        const row = database.prepare('SELECT body FROM persona_bots WHERE slug = ?').get('legacy');
        const body = JSON.parse(String(row!['body'])) as Record<string, unknown>;
        delete body['primaryColor'];
        database
          .prepare('UPDATE persona_bots SET body = ? WHERE slug = ?')
          .run(JSON.stringify(body), 'legacy');
      },
      ['bot-registry'],
    );

    const expected = {
      custom: { mode: 'custom', color: '#1d1b22', retained: '#1d1b22' },
      hair: { mode: 'automatic', retained: '#3fc1b8' },
      image: { mode: 'automatic', retained: fallbackPrimaryColor('image') },
      seeded: { mode: 'automatic', retained: seeded },
      legacy: { mode: 'automatic', retained: fallbackPrimaryColor('legacy') },
    };
    const check = (bots: ReturnType<typeof listed>): void => {
      for (const [slug, policy] of Object.entries(expected)) {
        expect(bots[slug], slug).toMatchObject({ deleted: true, primaryColor: policy });
        expect(resolveBotPrimaryColor(bots[slug]!)).toMatchObject({
          source: 'retained',
          color: policy.retained,
        });
      }
      expect(bots['live']!.deleted).toBeUndefined();
      expect(bots['live']!.primaryColor).toBeUndefined();
    };
    check(listed());
    expect(usageRows()['custom']).toMatchObject({
      current: false,
      displayName: 'Same name',
      primaryColor: '#1d1b22',
      totalTokens: 7,
    });
    expect(usageRows()['live']).toMatchObject({ current: true, primaryColor: '#3fc1b8' });
    expect(f.core.registry.getHistorical('legacy')?.primaryColor).toBeUndefined();
    expect(f.core.registry.retainedRecordBody('custom')).toBeUndefined();
    expect(f.core.registry.setPrimaryColor('hair', { mode: 'custom', color: '#000000' }).ok).toBe(
      false,
    );

    expect(f.core.registry.setAppearance('live', { ...recipe, hairColor: '#c4452f' }).ok).toBe(
      true,
    );
    expect(resolveBotPrimaryColor(listed()['live']!)).toMatchObject({
      source: 'hair',
      color: '#c4452f',
    });

    await f.core.runtime.close();
    f.core.externalMessaging.close();
    f.core.operationalDatabase.close();
    cores.splice(cores.indexOf(f.core), 1);
    const restarted = createCore({ dshHome: f.home });
    cores.push(restarted);
    const again = createBridgeMethods({ ...restarted, deletions: restarted.deletions });
    check(listed(again));
    expect(usageRows(again)['custom']).toMatchObject({
      current: false,
      primaryColor: '#1d1b22',
      totalTokens: 7,
    });
  });

  it('keeps a retained color inert if the Bot is still live', () => {
    const f = fixture();
    f.create('kept');
    const body = f.core.registry.retainedRecordBody('kept')!;
    attachOperationalModule(f.core.operationalDatabase, 'bot-registry').transaction(
      (database) => {
        database.prepare('UPDATE persona_bots SET body = ? WHERE slug = ?').run(body, 'kept');
      },
      ['bot-registry'],
    );
    expect(f.core.registry.get('kept')?.primaryColor?.retained).toBeDefined();
    const methods = createBridgeMethods({ ...f.core, deletions: f.core.deletions });
    const result = methods.list({});
    if (!result.ok) throw new Error('list failed');
    expect(result.value.bots[0]!.primaryColor).toBeUndefined();
    expect(f.core.registry.setPrimaryColor('kept', { mode: 'custom', color: '#abcdef' }).ok).toBe(
      true,
    );
    expect(f.core.registry.get('kept')?.primaryColor).toEqual({ mode: 'custom', color: '#abcdef' });
  });
});
