import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { seededAvatarFor } from '../src/bots/avatar-appearance.js';
import { seededBotBanner } from '../src/bots/bot-banner.js';
import { createPersonaBotDeletions } from '../src/bots/deletion.js';
import { botProfileFingerprint } from '../src/bots/profile-snapshot.js';
import { createCore } from '../src/plugin.js';
import { createTobBotProfileOperations } from '../src/tob/cli-bot-profile-operations.js';
import { TobError } from '../src/tob/service.js';
import { createTempRoot } from './helpers.js';

const cores: ReturnType<typeof createCore>[] = [];
const roots: string[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    await core.runtime.close();
    core.externalMessaging.close();
    core.operationalDatabase.close();
  }
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});
function fixture() {
  const root = createTempRoot('tob-profile-cli-');
  roots.push(root);
  const core = createCore({ dshHome: root });
  cores.push(core);
  expect(core.registry.create({ slug: 'research', displayName: 'Research' }).ok).toBe(true);
  core.channels.getOrCreateDm('research');
  const stop = vi.fn(async () => {});
  const dependencies = {
    sessions: [] as string[],
    channels: [] as string[],
    workspaces: [] as string[],
    identities: [] as string[],
    grants: [] as string[],
  };
  const deletions = createPersonaBotDeletions({
    database: core.operationalDatabase,
    registry: core.registry,
    dependencies: () => dependencies,
    allWorkspacePaths: () => [],
    stop,
  });
  const bridge = createBridgeMethods({ ...core, deletions });
  const prepare = createTobBotProfileOperations({
    registry: core.registry,
    bridge: () => bridge,
    isProtectedBot: (slug) => core.tob.isTob(slug),
  });
  const fingerprint = () => botProfileFingerprint(core.registry.get('research')!);
  const run = async (
    command: string,
    args: Record<string, unknown>,
    guard = () => {},
    beforeEffect = () => {},
  ) => {
    const prepared = await prepare(command, args);
    if (!prepared) throw new Error('unsupported fixture command');
    return prepared.run(guard, beforeEffect);
  };
  return { root, core, bridge, prepare, fingerprint, run, deletions, stop, dependencies };
}

describe('scoped Bot profile operations through existing owners', () => {
  it('reads a bounded profile and canonical fingerprint without exposing configuration paths', async () => {
    const f = fixture();
    const record = f.core.registry.get('research')!;
    const show = await f.run('show', { slug: 'research' });
    expect(show).toMatchObject({
      bot: { slug: 'research', displayName: 'Research', paused: false },
      profileFingerprint: f.fingerprint(),
    });
    expect(JSON.stringify(show)).not.toContain(f.root);
    expect(botProfileFingerprint({ ...record, workspaces: [...record.workspaces] })).toBe(
      f.fingerprint(),
    );
    expect(
      botProfileFingerprint(Object.fromEntries(Object.entries(record).reverse()) as typeof record),
    ).toBe(f.fingerprint());
    expect(await f.prepare('unsupported', {})).toBeUndefined();
  });

  it('updates canonical profile through the bridge and refuses stale observed or approved state', async () => {
    const f = fixture();
    const write = vi.spyOn(f.bridge, 'update');
    const expectedProfile = f.fingerprint();
    const args = {
      slug: 'research',
      expectedProfile,
      patch: { displayName: 'New name', description: 'Research assistant', roles: ['research'] },
    };
    const prepared = (await f.prepare('update', args))!;
    expect(prepared.proposal).toMatchObject({
      target: 'research',
      previousValue: { displayName: 'Research' },
      patch: { expectedProfile, changes: args.patch },
    });
    args.patch.displayName = 'Mutated by caller';
    const guard = vi.fn(),
      before = vi.fn();
    expect(await prepared.run(guard, before)).toMatchObject({ bot: { displayName: 'New name' } });
    expect(write).toHaveBeenCalledWith({
      slug: 'research',
      patch: { displayName: 'New name', description: 'Research assistant', roles: ['research'] },
    });
    expect(guard).toHaveBeenCalledTimes(1);
    expect(before).toHaveBeenCalledTimes(1);
    expect(f.core.registry.get('research')?.displayName).toBe('New name');
    await expect(
      f.run('update', { ...args, patch: { displayName: 'Stale' } }),
    ).rejects.toMatchObject({ code: 'stale-profile' });
    const later = (await f.prepare('pause', {
      slug: 'research',
      expectedProfile: f.fingerprint(),
    }))!;
    f.core.registry.update('research', { description: 'Concurrent UI edit' });
    const noEffect = vi.fn();
    expect(() => later.run(() => {}, noEffect)).toThrow('stale-profile');
    expect(noEffect).not.toHaveBeenCalled();
    expect(f.core.registry.get('research')?.paused).not.toBe(true);
  });

  it('preserves source authority and profile-only field restrictions', async () => {
    const f = fixture();
    const expectedProfile = f.fingerprint();
    const operation = (await f.prepare('update', {
      slug: 'research',
      expectedProfile,
      patch: { displayName: 'Denied' },
    }))!;
    const effect = vi.fn();
    expect(() =>
      operation.run(() => {
        throw new TobError('human-dm-required');
      }, effect),
    ).toThrow('human-dm-required');
    expect(effect).not.toHaveBeenCalled();
    for (const patch of [
      { slug: 'tob' },
      { workspaces: ['/private'] },
      { model: 'other' },
      { roles: ['x'.repeat(33)] },
      { description: 'x'.repeat(161) },
      { displayName: '' },
    ])
      await expect(
        f.run('update', { slug: 'research', expectedProfile, patch }),
      ).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(f.run('pause', { slug: 'research' })).rejects.toMatchObject({
      code: 'invalid-input',
    });
    expect(f.core.registry.get('research')?.displayName).toBe('Research');
  });

  it('archives and reactivates through existing bridge behavior', async () => {
    const f = fixture();
    const pause = vi.spyOn(f.bridge, 'pause'),
      resume = vi.spyOn(f.bridge, 'resume');
    expect(
      await f.run('pause', { slug: 'research', expectedProfile: f.fingerprint() }),
    ).toMatchObject({ bot: { paused: true } });
    expect(
      await f.run('resume', { slug: 'research', expectedProfile: f.fingerprint() }),
    ).toMatchObject({ bot: { paused: false } });
    expect(pause).toHaveBeenCalledWith({ slug: 'research' });
    expect(resume).toHaveBeenCalledWith({ slug: 'research' });
  });

  it('uses presentation owners and summarizes image bytes in review instead of raw data', async () => {
    const f = fixture();
    const avatar = 'data:image/png;base64,iVBORw0KGgo=';
    const operation = (await f.prepare('bot-avatar-set', {
      slug: 'research',
      expectedProfile: f.fingerprint(),
      avatar,
    }))!;
    expect(JSON.stringify(operation.proposal)).not.toContain('iVBORw0KGgo=');
    expect(operation.proposal).toMatchObject({
      patch: { changes: { avatar: { present: true, sha256: expect.any(String) } } },
    });
    await operation.run(() => {});
    expect(f.core.registry.get('research')?.avatar).toBe(avatar);
    await f.run('bot-avatar-set', {
      slug: 'research',
      expectedProfile: f.fingerprint(),
      avatar: null,
    });
    await f.run('bot-banner-set', {
      slug: 'research',
      expectedProfile: f.fingerprint(),
      banner: seededBotBanner('Research'),
    });
    await f.run('bot-appearance-set', {
      slug: 'research',
      expectedProfile: f.fingerprint(),
      recipe: seededAvatarFor('Research', undefined),
    });
    await f.run('bot-primary-color-set', {
      slug: 'research',
      expectedProfile: f.fingerprint(),
      primaryColor: { mode: 'custom', color: '#336699' },
    });
    expect(f.core.registry.get('research')?.primaryColor).toMatchObject({
      mode: 'custom',
      color: '#336699',
    });
    await expect(
      f.run('bot-primary-color-set', {
        slug: 'research',
        expectedProfile: f.fingerprint(),
        primaryColor: { mode: 'automatic', retained: '#ffffff' },
      }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
  });

  it('blocks protected Tob lifecycle changes while allowing its editable profile', async () => {
    const f = fixture();
    const home = await f.core.tob.ensure();
    const slug = home.botSlug;
    const expectedProfile = botProfileFingerprint(f.core.registry.get(slug)!);
    await expect(f.run('pause', { slug, expectedProfile })).rejects.toMatchObject({
      code: 'protected-bot',
    });
    for (const command of [
      'bot-delete-preview',
      'bot-delete-memory-folder',
      'bot-delete-confirm',
      'bot-delete-retry',
    ])
      await expect(f.run(command, { slug })).rejects.toMatchObject({ code: 'protected-bot' });
    expect(
      await f.run('update', { slug, expectedProfile, patch: { description: 'My local manager' } }),
    ).toMatchObject({ bot: { description: 'My local manager' } });
  });
});

describe('scoped deletion uses the reviewed owner scope', () => {
  it.each([false, true])(
    'retains the explicit eraseMemory=%s choice and never accepts a supplied path',
    async (eraseMemory) => {
      const f = fixture();
      const memoryDir = f.core.registry.memoryDirFor('research')!;
      writeFileSync(join(memoryDir, 'private.md'), 'Keep unless explicitly erased');
      const preview = f.deletions.preview('research');
      expect(await f.run('bot-delete-memory-folder', { slug: 'research' })).toMatchObject({
        target: { kind: 'directory' },
      });
      await expect(
        f.run('bot-delete-confirm', {
          slug: 'research',
          token: preview.token,
          eraseMemory,
          confirm: true,
          path: '/other',
        }),
      ).rejects.toMatchObject({ code: 'invalid-input' });
      const operation = (await f.prepare('bot-delete-confirm', {
        slug: 'research',
        token: preview.token,
        eraseMemory,
        confirm: true,
      }))!;
      expect(operation.proposal).toMatchObject({ patch: { eraseMemory, memoryDir } });
      expect(await operation.run(() => {})).toMatchObject({
        deletion: { phase: 'complete', eraseMemory, memory: eraseMemory ? 'erased' : 'retained' },
      });
      expect(existsSync(memoryDir)).toBe(!eraseMemory);
    },
  );

  it('requires confirmation and refuses changed deletion dependencies before any effects', async () => {
    const f = fixture();
    const preview = f.deletions.preview('research');
    await expect(
      f.run('bot-delete-confirm', { slug: 'research', token: preview.token, eraseMemory: false }),
    ).rejects.toMatchObject({ code: 'confirmation-required' });
    const operation = (await f.prepare('bot-delete-confirm', {
      slug: 'research',
      token: preview.token,
      eraseMemory: false,
      confirm: true,
    }))!;
    f.dependencies.sessions.push('new-session');
    const effect = vi.fn();
    await expect(operation.run(() => {}, effect)).rejects.toMatchObject({ code: 'stale-setting' });
    expect(effect).not.toHaveBeenCalled();
    expect(f.deletions.get('research')).toBeUndefined();
    expect(f.stop).not.toHaveBeenCalled();
  });

  it('retries only an accepted scope and keeps its Memory choice', async () => {
    const f = fixture();
    await expect(
      f.run('bot-delete-retry', { slug: 'research', confirm: true }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
    f.stop.mockRejectedValueOnce(new Error('private-cleanup-credential'));
    const token = f.deletions.preview('research').token;
    expect(
      await f.run('bot-delete-confirm', {
        slug: 'research',
        token,
        eraseMemory: false,
        confirm: true,
      }),
    ).toMatchObject({ deletion: { phase: 'incomplete', failure: 'cleanup-incomplete' } });
    const retry = (await f.prepare('bot-delete-retry', { slug: 'research', confirm: true }))!;
    expect(retry.proposal).toMatchObject({ patch: { retry: true, eraseMemory: false } });
    expect(JSON.stringify(retry.proposal)).not.toContain('private-cleanup-credential');
    expect(retry.proposal).toMatchObject({
      previousValue: { deletion: { failure: 'cleanup-incomplete' } },
    });
    const preview = await f.run('bot-delete-preview', { slug: 'research' });
    expect(JSON.stringify(preview)).not.toContain('private-cleanup-credential');
    expect(preview).toMatchObject({
      preview: { deletion: { failure: 'cleanup-incomplete', eraseMemory: false } },
    });
    expect(await retry.run(() => {})).toMatchObject({
      deletion: { phase: 'complete', memory: 'retained' },
    });
  });
});
