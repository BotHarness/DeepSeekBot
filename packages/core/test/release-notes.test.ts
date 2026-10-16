import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  absolutizeLedgerLinks,
  pairReleaseLedgers,
  parseReleaseNotes,
  selectReleaseNotes,
} from '../src/release/notes.js';
import {
  createReleaseService,
  installedRelease,
  type ReleaseInstaller,
  type ReleaseInstallerResult,
} from '../src/release/service.js';
import { compareVersions, isReleaseVersion } from '../src/release/version.js';
import { createProcessRestarter, type ReleaseRestarter } from '../src/release/restart.js';
import { hostReleaseActivity } from '../src/release/activity.js';

const english = `# DeepSeekBot Changelog

## [Unreleased]

Nothing yet.

## [1.1.0] - 2026-10-20

Bot mode shows what changed.

### Added

- Added the changelog dialog ([#1](https://github.com/BotHarness/BotHarness/issues/1), [guide](docs/guide.md)).

### Fixed

- Fixed one thing ([#2](https://github.com/BotHarness/BotHarness/issues/2)).

## [1.0.1] - 2026-10-05

First stable release.

### Added

- Added PersonaBots ([#3](https://github.com/BotHarness/BotHarness/issues/3)).

## [Development] - 2026-09-20

Development history.

### Added

- Old work ([#4](https://github.com/BotHarness/BotHarness/issues/4)).
`;

const chinese = `# DeepSeekBot 更新日志

## [Unreleased]

暂无。

## [1.1.0] - 2026-10-20

Bot 模式会显示更新内容。

### Added

- 增加更新日志弹窗（[#1](https://github.com/BotHarness/BotHarness/issues/1)，[指南](docs/guide.md)）。

### Fixed

- 修复一处问题（[#2](https://github.com/BotHarness/BotHarness/issues/2)）。

## [1.0.1] - 2026-10-05

首个正式版本。

### Added

- 增加 PersonaBot（[#3](https://github.com/BotHarness/BotHarness/issues/3)）。
`;

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200 });
}

describe('release versions', () => {
  it('orders releases and prereleases by SemVer precedence', () => {
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
    expect(compareVersions('1.0.0-rc.2', '1.0.0-rc.10')).toBe(-1);
    expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBe(-1);
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
    expect(isReleaseVersion('1.0.1')).toBe(true);
    expect(isReleaseVersion('0.0.0')).toBe(false);
    expect(isReleaseVersion('Unreleased')).toBe(false);
  });
});

describe('release notes', () => {
  it('pairs both ledgers by version and skips Unreleased and Development', () => {
    const notes = pairReleaseLedgers(english, chinese);
    expect(notes.map((note) => note.version)).toEqual(['1.1.0', '1.0.1']);
    expect(notes[0]?.summary).toEqual({
      en: 'Bot mode shows what changed.',
      zh: 'Bot 模式会显示更新内容。',
    });
    expect(notes[0]?.sections.map((section) => section.name)).toEqual(['Added', 'Fixed']);
    expect(notes[0]?.sections[0]?.entries[0]?.zh).toContain('增加更新日志弹窗');
    expect(notes[0]?.sections[0]?.entries[0]?.en).toContain(
      '(https://github.com/BotHarness/BotHarness/blob/main/docs/guide.md)',
    );
  });

  it('falls back to English when the Chinese ledger lacks a release', () => {
    const notes = pairReleaseLedgers(english, '# 更新日志\n');
    expect(notes[1]?.summary.zh).toBe('First stable release.');
    expect(notes[1]?.sections[0]?.entries[0]?.zh).toContain('Added PersonaBots');
  });

  it('keeps absolute and anchor links unchanged', () => {
    expect(absolutizeLedgerLinks('[a](https://x.test/a) [b](#b) [c](./docs/c.md)')).toBe(
      '[a](https://x.test/a) [b](#b) [c](https://github.com/BotHarness/BotHarness/blob/main/docs/c.md)',
    );
  });

  it('selects the releases after the last seen version up to the installed one', () => {
    const notes = pairReleaseLedgers(english, chinese);
    expect(
      selectReleaseNotes(notes, { after: '1.0.1', through: '1.1.0' }).map((n) => n.version),
    ).toEqual(['1.1.0']);
    expect(
      selectReleaseNotes(notes, { after: '1.0.0', through: '1.0.1' }).map((n) => n.version),
    ).toEqual(['1.0.1']);
    expect(selectReleaseNotes(notes, { after: '1.1.0', through: '1.1.0' })).toEqual([]);
  });

  it('round-trips the bridge payload and rejects malformed notes', () => {
    const notes = pairReleaseLedgers(english, chinese);
    expect(parseReleaseNotes(JSON.parse(JSON.stringify(notes)))).toEqual(notes);
    expect(parseReleaseNotes([{ version: '1.0.0' }])).toBeUndefined();
    expect(parseReleaseNotes({})).toBeUndefined();
  });

  it('parses the repository ledgers into at least the current release', () => {
    const notes = pairReleaseLedgers(
      readFileSync(new URL('../../../CHANGELOG.md', import.meta.url), 'utf8'),
      readFileSync(new URL('../../../CHANGELOG.zh.md', import.meta.url), 'utf8'),
    );
    expect(notes.some((note) => note.version === '1.0.1')).toBe(true);
    for (const note of notes) {
      expect(note.summary.zh.length).toBeGreaterThan(0);
      expect(note.sections.length).toBeGreaterThan(0);
    }
  });
});

describe('release service', () => {
  const ledgers = () => ({ english, chinese });
  const homes: string[] = [];
  const home = () => {
    const path = mkdtempSync(join(tmpdir(), 'release-choice-'));
    homes.push(path);
    return path;
  };
  afterEach(() =>
    homes.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })),
  );

  it('persists explicit Beta selection only for this Host and leaves without a downgrade', async () => {
    const options = {
      dataDir: home(),
      version: () => '1.2.0-beta.1',
      ledgers,
      registries: ['https://registry.test'],
      noteSources: [],
      fetchImpl: vi.fn(async () =>
        jsonResponse({ latest: '1.1.0', beta: '1.2.0-beta.2', next: '1.3.0-nightly.1' }),
      ),
    };
    const service = createReleaseService(options);
    expect(service.channel()).toEqual({ channel: 'stable', writable: true });
    await service.update();
    expect(service.setChannel('beta')).toEqual({ status: 'saved', channel: 'beta' });
    expect(await service.update()).toMatchObject({ status: 'available', latest: '1.2.0-beta.2' });
    expect(createReleaseService(options).channel().channel).toBe('beta');
    expect(createReleaseService({ ...options, dataDir: home() }).channel().channel).toBe('stable');
    expect(service.setChannel('stable')).toEqual({ status: 'saved', channel: 'stable' });
    expect(await service.update()).toEqual({
      status: 'current',
      current: '1.2.0-beta.1',
      latest: '1.1.0',
    });
    expect(createReleaseService(options).channel().channel).toBe('stable');
  });

  it('grants one Beta prompt per version across concurrent readers and Host restarts', async () => {
    const options = {
      dataDir: home(),
      version: () => '1.0.1',
      ledgers,
      activity: () => 'idle' as const,
      registries: ['https://registry.test'],
      noteSources: [],
      fetchImpl: vi.fn(async () => jsonResponse({ latest: '1.1.0' })),
    };
    const service = createReleaseService(options);
    service.setChannel('beta');
    expect(await service.update()).toMatchObject({ status: 'available', latest: '1.1.0' });
    const results = await Promise.all([service.claimPrompt('1.1.0'), service.claimPrompt('1.1.0')]);
    expect(results).toEqual([
      { status: 'claimed' },
      { status: 'suppressed', reason: 'already-prompted' },
    ]);
    expect(await createReleaseService(options).claimPrompt('1.1.0')).toEqual({
      status: 'suppressed',
      reason: 'already-prompted',
    });
    expect(await service.update()).toMatchObject({ status: 'available', latest: '1.1.0' });
  });

  it('does not consume a reminder while stable, busy or unable to check activity', async () => {
    let activity: 'idle' | 'busy' | 'unknown' = 'busy';
    const service = createReleaseService({
      dataDir: home(),
      version: () => '1.0.1',
      ledgers,
      activity: () => activity,
      registries: ['https://registry.test'],
      noteSources: [],
      fetchImpl: async () => jsonResponse({ latest: '1.1.0' }),
    });
    expect(await service.claimPrompt('1.1.0')).toEqual({
      status: 'suppressed',
      reason: 'not-beta',
    });
    service.setChannel('beta');
    expect(await service.claimPrompt('1.1.0')).toEqual({ status: 'suppressed', reason: 'busy' });
    activity = 'unknown';
    expect(await service.claimPrompt('1.1.0')).toEqual({
      status: 'failed',
      reason: 'activity-unavailable',
    });
    activity = 'idle';
    expect(await service.claimPrompt('garbage')).toEqual({
      status: 'failed',
      reason: 'invalid-version',
    });
    expect(await service.claimPrompt('1.9.0')).toEqual({
      status: 'suppressed',
      reason: 'no-update',
    });
    expect(await service.claimPrompt('1.1.0')).toEqual({ status: 'claimed' });
  });

  it('suppresses stale prompts after leaving Beta while discovery is in flight', async () => {
    let resolveTags!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      resolveTags = resolve;
    });
    const service = createReleaseService({
      dataDir: home(),
      version: () => '1.0.1',
      ledgers,
      activity: () => 'idle',
      registries: ['https://registry.test'],
      noteSources: [],
      fetchImpl: async () => (await response).clone(),
    });
    service.setChannel('beta');
    const pendingPrompt = service.claimPrompt('1.2.0-beta.1');
    await Promise.resolve();
    service.setChannel('stable');
    resolveTags(jsonResponse({ latest: '1.1.0', beta: '1.2.0-beta.1' }));
    expect(await pendingPrompt).toEqual({ status: 'suppressed', reason: 'changed' });
    service.setChannel('beta');
    expect(await service.claimPrompt('1.2.0-beta.1')).toEqual({ status: 'claimed' });
  });

  it('keeps a Profile-local high-water mark across tag rollback and leaving/rejoining Beta', async () => {
    const dataDir = home();
    const make = (latest: string, directory = dataDir) =>
      createReleaseService({
        dataDir: directory,
        version: () => '1.0.1',
        ledgers,
        activity: () => 'idle',
        registries: ['https://registry.test'],
        noteSources: [],
        fetchImpl: async () => jsonResponse({ latest }),
      });
    const first = make('1.1.0');
    first.setChannel('beta');
    expect(await first.claimPrompt('1.1.0')).toEqual({ status: 'claimed' });
    const next = make('1.2.0');
    expect(await next.claimPrompt('1.2.0')).toEqual({ status: 'claimed' });
    next.setChannel('stable');
    next.setChannel('beta');
    expect(await next.claimPrompt('1.2.0')).toEqual({
      status: 'suppressed',
      reason: 'already-prompted',
    });
    expect(await make('1.1.0').claimPrompt('1.1.0')).toEqual({
      status: 'suppressed',
      reason: 'already-prompted',
    });
    const independent = make('1.1.0', home());
    independent.setChannel('beta');
    expect(await independent.claimPrompt('1.1.0')).toEqual({ status: 'claimed' });
  });

  it('fails closed on damaged or unwritable reminder storage without disabling manual checks', async () => {
    const dataDir = home();
    const service = createReleaseService({
      dataDir,
      version: () => '1.0.1',
      ledgers,
      activity: () => 'idle',
      registries: ['https://registry.test'],
      noteSources: [],
      fetchImpl: async () => jsonResponse({ latest: '1.1.0' }),
    });
    service.setChannel('beta');
    writeFileSync(join(dataDir, 'release-prompt.json'), '{broken');
    expect(await service.claimPrompt('1.1.0')).toEqual({
      status: 'failed',
      reason: 'storage-unavailable',
    });
    expect(await service.update()).toMatchObject({ status: 'available' });
    rmSync(dataDir, { recursive: true });
    writeFileSync(dataDir, 'not a directory');
    expect(await service.claimPrompt('1.1.0')).toEqual({
      status: 'failed',
      reason: 'storage-unavailable',
    });
  });

  it('does not infer Beta enrollment from an installed prerelease', async () => {
    const service = createReleaseService({
      version: () => '1.2.0-beta.1',
      ledgers,
      registries: ['https://registry.test'],
      noteSources: [],
      fetchImpl: vi.fn(async () =>
        jsonResponse({ latest: '1.1.0', next: '1.3.0-beta.1', beta: '1.2.0-beta.2' }),
      ),
    });
    expect(await service.update()).toEqual({
      status: 'current',
      current: '1.2.0-beta.1',
      latest: '1.1.0',
    });
  });

  it('defaults malformed preference to stable and rejects prerelease latest as a stable candidate', async () => {
    const dataDir = home();
    writeFileSync(join(dataDir, 'release-channel.json'), '{bad json');
    const service = createReleaseService({
      dataDir,
      version: () => '1.1.0',
      ledgers,
      registries: ['https://registry.test'],
      noteSources: [],
      fetchImpl: vi.fn(async () =>
        jsonResponse({ latest: '1.2.0-beta.1', next: '1.3.0-nightly.1' }),
      ),
    });
    expect(service.channel().channel).toBe('stable');
    expect(await service.update()).toEqual({ status: 'unavailable', current: '1.1.0' });
    expect(service.setChannel('beta')).toEqual({ status: 'saved', channel: 'beta' });
    expect(await service.update()).toEqual({ status: 'unavailable', current: '1.1.0' });
  });

  it('discards an in-flight Beta check after leaving while release notes load', async () => {
    let finishNotes: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => {
      finishNotes = resolve;
    });
    let notesStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      notesStarted = resolve;
    });
    const service = createReleaseService({
      dataDir: home(),
      version: () => '1.1.0',
      ledgers,
      registries: ['https://registry.test'],
      noteSources: [() => 'https://notes.test/'],
      fetchImpl: vi.fn(async (input: string | URL | Request) => {
        if (String(input).endsWith('/dist-tags'))
          return jsonResponse({ latest: '1.1.0', beta: '1.2.0-beta.1' });
        notesStarted?.();
        await waiting;
        return new Response('', { status: 404 });
      }),
    });
    service.setChannel('beta');
    const checking = service.update();
    await started;
    service.setChannel('stable');
    const secondCheck = service.update();
    finishNotes?.();
    expect(await checking).toEqual({ status: 'current', current: '1.1.0', latest: '1.1.0' });
    expect(await secondCheck).toEqual({ status: 'current', current: '1.1.0', latest: '1.1.0' });
    expect(await service.update()).toEqual({
      status: 'current',
      current: '1.1.0',
      latest: '1.1.0',
    });
  });

  it('returns only the installed release on first open and the gap afterwards', () => {
    const service = createReleaseService({ version: () => '1.1.0', ledgers });
    expect(service.info().releases.map((note) => note.version)).toEqual(['1.1.0']);
    expect(service.info('1.0.0').releases.map((note) => note.version)).toEqual(['1.1.0', '1.0.1']);
    expect(service.info('1.1.0').releases).toEqual([]);
  });

  it('treats a source build as a development version without notes or checks', async () => {
    const fetchImpl = vi.fn();
    const service = createReleaseService({ version: () => '0.0.0', ledgers, fetchImpl });
    expect(service.info()).toEqual({ version: '0.0.0', releases: [] });
    expect(await service.update()).toEqual({ status: 'development', current: '0.0.0' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports a newer npm release with its notes from the published package', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === 'https://registry.test/-/package/deepseekbot/dist-tags')
        return jsonResponse({ latest: '1.1.0', next: '1.1.0' });
      if (url === 'https://notes.test/1.1.0/CHANGELOG.md') return new Response(english);
      if (url === 'https://notes.test/1.1.0/CHANGELOG.zh.md') return new Response(chinese);
      return new Response('', { status: 404 });
    });
    const service = createReleaseService({
      version: () => '1.0.1',
      ledgers,
      fetchImpl: fetchImpl as typeof fetch,
      registries: ['https://registry.test'],
      noteSources: [(version) => `https://notes.test/${version}/`],
    });
    const update = await service.update();
    expect(update).toMatchObject({ status: 'available', current: '1.0.1', latest: '1.1.0' });
    expect(update.status === 'available' && update.releases.map((note) => note.version)).toEqual([
      '1.1.0',
    ]);
    await service.update();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('falls through registries and reports up to date or unavailable', async () => {
    const reachable = vi.fn(async (input: string | URL | Request) =>
      String(input).startsWith('https://down.test')
        ? Promise.reject(new Error('offline'))
        : jsonResponse({ latest: '1.0.1' }),
    );
    const current = createReleaseService({
      version: () => '1.0.1',
      ledgers,
      fetchImpl: reachable as typeof fetch,
      registries: ['https://down.test', 'https://mirror.test'],
    });
    expect(await current.update()).toEqual({
      status: 'current',
      current: '1.0.1',
      latest: '1.0.1',
    });

    let clock = 0;
    const offline = vi.fn(async () => Promise.reject(new Error('offline')));
    const unavailable = createReleaseService({
      version: () => '1.0.1',
      ledgers,
      fetchImpl: offline as typeof fetch,
      registries: ['https://down.test'],
      now: () => clock,
    });
    expect(await unavailable.update()).toEqual({ status: 'unavailable', current: '1.0.1' });
    clock = 6 * 60 * 1000;
    await unavailable.update();
    expect(offline).toHaveBeenCalledTimes(2);
  });

  const newerRelease = vi.fn(async (input: string | URL | Request) =>
    String(input).endsWith('/dist-tags')
      ? jsonResponse({ latest: '1.1.0' })
      : new Response('', { status: 404 }),
  );

  function installer(
    result: ReleaseInstallerResult | Error,
    bundles: { name: string; installed: boolean; version?: string }[] = [
      { name: 'deepseekbot', installed: true },
    ],
  ) {
    return {
      listBundles: vi.fn(async () => bundles),
      installBundle: vi.fn(async () => {
        if (result instanceof Error) throw result;
        return result;
      }),
    };
  }

  function installable(
    manager: ReleaseInstaller | undefined,
    version = '1.0.1',
    restarter?: ReleaseRestarter,
    activity: () => 'idle' | 'busy' | 'unknown' = () => 'idle',
    log?: (message: string) => void,
  ) {
    return createReleaseService({
      version: () => version,
      ledgers,
      fetchImpl: newerRelease as typeof fetch,
      registries: ['https://registry.test'],
      noteSources: [],
      installer: () => manager,
      restarter: () => restarter,
      activity,
      ...(log === undefined ? {} : { log }),
    });
  }

  it('refuses installation and restart while the Host is busy without touching the profile', async () => {
    const manager = installer({ application: 'restart-required' }, [
      { name: 'deepseekbot', installed: true, version: '1.1.0' },
    ]);
    const restarter = { restart: vi.fn() };
    const logs: string[] = [];
    const service = installable(
      manager,
      '1.0.1',
      restarter,
      () => 'busy',
      (message) => logs.push(message),
    );
    expect(await service.install('1.2.0')).toEqual({ status: 'failed', reason: 'busy' });
    expect(await service.restart()).toEqual({ status: 'failed', reason: 'busy' });
    expect(manager.installBundle).not.toHaveBeenCalled();
    expect(restarter.restart).not.toHaveBeenCalled();
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatch(
      /^release-change initiator=explicit-request operation=install phase=admission outcome=refused reason=busy durationMs=\d+$/u,
    );
    expect(logs[1]).toContain('operation=restart phase=admission outcome=refused reason=busy');
  });

  it('requires Beta choice for prerelease installation and refuses choice changes during installation', async () => {
    let finishInstall: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => {
      finishInstall = resolve;
    });
    const manager = {
      listBundles: async () => [{ name: 'deepseekbot', installed: true }],
      installBundle: vi.fn(async () => {
        await waiting;
        return { application: 'restart-required' };
      }),
    };
    const service = createReleaseService({
      dataDir: home(),
      version: () => '1.1.0',
      ledgers,
      activity: () => 'idle',
      installer: () => manager,
    });
    expect(await service.install('1.2.0-beta.1')).toEqual({
      status: 'failed',
      reason: 'beta-not-enabled',
    });
    expect(manager.installBundle).not.toHaveBeenCalled();
    service.setChannel('beta');
    const installing = service.install('1.2.0-beta.1');
    expect(service.setChannel('stable')).toEqual({ status: 'failed', reason: 'busy' });
    finishInstall?.();
    expect(await installing).toMatchObject({ status: 'installed', installed: '1.2.0-beta.1' });
    expect(service.setChannel('stable')).toEqual({ status: 'saved', channel: 'stable' });
    expect(await service.update()).toMatchObject({
      status: 'restart-required',
      installed: '1.2.0-beta.1',
    });
  });

  it('does not report saved consent when persistence is unavailable', () => {
    const service = createReleaseService({ version: () => '1.1.0', ledgers });
    expect(service.setChannel('beta')).toEqual({ status: 'failed', reason: 'storage-unavailable' });
    expect(service.channel()).toEqual({ channel: 'stable', writable: false });
    const path = join(home(), 'file');
    writeFileSync(path, 'not a directory');
    const failed = createReleaseService({ dataDir: path, version: () => '1.1.0', ledgers });
    expect(failed.setChannel('beta')).toEqual({ status: 'failed', reason: 'storage-unavailable' });
    expect(failed.channel().channel).toBe('stable');
  });

  it('restarts DSH only when an installed update is waiting and the launcher allows it', async () => {
    const restarter = { restart: vi.fn() };
    const fresh = installer({ application: 'restart-required' });
    expect(await installable(fresh, '1.0.1', restarter).restart()).toEqual({
      status: 'failed',
      reason: 'not-pending',
    });
    expect(await installable(fresh).restart()).toEqual({ status: 'failed', reason: 'unavailable' });
    expect(restarter.restart).not.toHaveBeenCalled();

    const service = installable(fresh, '1.0.1', restarter);
    expect(await service.install('1.1.0')).toMatchObject({ restartable: true });
    expect(await service.update()).toMatchObject({ restartable: true });
    expect(await service.restart()).toEqual({ status: 'restarting' });
    expect(restarter.restart).toHaveBeenCalledTimes(1);

    const staged = installer({ application: 'restart-required' }, [
      { name: 'deepseekbot', installed: true, version: '1.1.0' },
    ]);
    expect(await installable(staged, '1.0.1', restarter).restart()).toEqual({
      status: 'restarting',
    });
  });

  it.each(['install', 'restart'] as const)(
    'rechecks activity after async %s preflight',
    async (operation) => {
      let busy = false;
      const manager = installer({ application: 'restart-required' });
      manager.listBundles.mockImplementation(async () => {
        busy = true;
        return [{ name: 'deepseekbot', installed: true, version: '1.1.0' }];
      });
      const restarter = { restart: vi.fn() };
      const service = installable(manager, '1.0.1', restarter, () => (busy ? 'busy' : 'idle'));
      const result =
        operation === 'install' ? await service.install('1.2.0') : await service.restart();
      expect(result).toEqual({ status: 'failed', reason: 'busy' });
      expect(manager.installBundle).not.toHaveBeenCalled();
      expect(restarter.restart).not.toHaveBeenCalled();
    },
  );

  it('refuses unknown or failed activity checks without exposing probe errors', async () => {
    for (const activity of [
      undefined,
      () => 'unknown' as const,
      () => {
        throw new Error('private path');
      },
    ]) {
      const manager = installer({ application: 'restart-required' });
      const restarter = { restart: vi.fn() };
      const service = createReleaseService({
        version: () => '1.0.1',
        ledgers,
        installer: () => manager,
        restarter: () => restarter,
        ...(activity === undefined ? {} : { activity }),
      });
      expect(await service.install('1.1.0')).toEqual({
        status: 'failed',
        reason: 'activity-unavailable',
      });
      expect(await service.restart()).toEqual({ status: 'failed', reason: 'activity-unavailable' });
      expect(manager.installBundle).not.toHaveBeenCalled();
      expect(restarter.restart).not.toHaveBeenCalled();
    }
  });

  it.each([
    'running-agent',
    'maintenance',
    'queued-input',
    'owned-job',
    'unowned-job',
    'stopping-job',
    'missing-jobs',
  ])('refuses %s through the Host release service', async (scenario) => {
    const manager = installer({ application: 'restart-required' });
    const service = installable(manager, '1.0.1', undefined, () =>
      hostReleaseActivity({
        agents: [
          {
            id: 'session-1',
            status: scenario === 'running-agent' ? 'running' : 'idle',
            inbox: { nextTurn: scenario === 'queued-input' ? [{}] : [], nextStep: [] },
            runMaintenance: (task) => {
              if (scenario === 'maintenance') throw new Error('already has active work');
              return task();
            },
          },
        ],
        jobs:
          scenario === 'missing-jobs'
            ? undefined
            : {
                list: (owner) =>
                  scenario === 'owned-job' && owner === 'session-1'
                    ? [{ status: 'running' }]
                    : scenario === 'unowned-job' && owner === undefined
                      ? [{ status: 'running' }]
                      : scenario === 'stopping-job'
                        ? [{ status: 'stopping' }]
                        : [],
              },
      }),
    );
    expect(await service.install('1.1.0')).toEqual({
      status: 'failed',
      reason: scenario === 'missing-jobs' ? 'activity-unavailable' : 'busy',
    });
    expect(manager.installBundle).not.toHaveBeenCalled();
  });

  it('refuses work arriving during the restart delay and allows only an explicit retry', async () => {
    let busy = false;
    const timers: (() => void)[] = [];
    const exit = vi.fn();
    const restarter = createProcessRestarter({
      exit,
      host: {
        argv: ['node', 'dsh', 'web'],
        execArgv: [],
        execPath: 'node',
        env: {},
        cwd: () => '/',
        once: vi.fn(),
        prependListener: vi.fn(),
      },
      setTimer: (callback) => {
        timers.push(callback);
        return { unref: () => undefined };
      },
    });
    const manager = installer({ application: 'restart-required' }, [
      { name: 'deepseekbot', installed: true, version: '1.1.0' },
    ]);
    const service = installable(manager, '1.0.1', restarter, () => (busy ? 'busy' : 'idle'));
    const restarting = service.restart();
    await vi.waitFor(() => expect(timers).toHaveLength(1));
    expect(await service.install('1.2.0')).toEqual({ status: 'failed', reason: 'busy' });
    busy = true;
    timers.shift()!();
    expect(await restarting).toEqual({ status: 'failed', reason: 'busy' });
    expect(exit).not.toHaveBeenCalled();
    busy = false;
    expect(timers).toHaveLength(0);
    expect(await service.update()).toMatchObject({ status: 'restart-required' });
    const retry = service.restart();
    await vi.waitFor(() => expect(timers).toHaveLength(1));
    busy = true;
    timers.shift()!();
    expect(await retry).toEqual({ status: 'failed', reason: 'busy' });
    expect(exit).not.toHaveBeenCalled();
    busy = false;
    const idleRetry = service.restart();
    await vi.waitFor(() => expect(timers).toHaveLength(1));
    timers.shift()!();
    expect(await idleRetry).toEqual({ status: 'restarting' });
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('admits truly idle Agents and settled Jobs without its no-op checks blocking the next phase', async () => {
    let occupied = false;
    const agent = {
      id: 'idle-session',
      status: 'idle',
      inbox: { nextTurn: [], nextStep: [] },
      runMaintenance: (task: () => Promise<void>) => {
        if (occupied) throw new Error('already has active work');
        occupied = true;
        return task().finally(() => {
          occupied = false;
        });
      },
    };
    const manager = installer({ application: 'restart-required' });
    const service = installable(manager, '1.0.1', { restart: vi.fn() }, () =>
      hostReleaseActivity({
        agents: [agent],
        jobs: { list: () => [{ status: 'completed' }, { status: 'killed' }, { status: 'failed' }] },
      }),
    );
    expect(await service.install('1.1.0')).toMatchObject({ status: 'installed' });
    expect(await service.restart()).toEqual({ status: 'restarting' });
  });

  it('offers one-click install only when the Plugin Manager holds the deepseekbot bundle', async () => {
    expect(
      await installable(installer({ application: 'restart-required' })).update(),
    ).toMatchObject({ status: 'available', latest: '1.1.0', installable: true });
    expect(await installable(undefined).update()).toMatchObject({ installable: false });
    expect(
      await installable(
        installer({ application: 'restart-required' }, [{ name: 'other', installed: true }]),
      ).update(),
    ).toMatchObject({ installable: false });
  });

  it('keeps release mutations blocked after restart is accepted while the Host drains', async () => {
    const manager = installer({ application: 'restart-required' }, [
      { name: 'deepseekbot', installed: true, version: '1.1.0' },
    ]);
    const service = installable(manager, '1.0.1', { restart: vi.fn() });
    expect(await service.restart()).toEqual({ status: 'restarting' });
    expect(await service.install('1.2.0')).toEqual({ status: 'failed', reason: 'busy' });
    expect(await service.restart()).toEqual({ status: 'failed', reason: 'busy' });
    expect(manager.installBundle).not.toHaveBeenCalled();
  });

  it('installs the newer release through the Plugin Manager and then asks for a restart', async () => {
    const manager = installer({ application: 'restart-required' });
    const service = installable(manager);
    expect(await service.install('1.1.0')).toEqual({
      status: 'installed',
      current: '1.0.1',
      installed: '1.1.0',
      restartable: false,
    });
    expect(manager.installBundle).toHaveBeenCalledWith('deepseekbot@1.1.0');
    expect(await service.update()).toEqual({
      status: 'restart-required',
      current: '1.0.1',
      installed: '1.1.0',
      restartable: false,
    });
  });

  it('asks for a restart when the profile already holds a newer deepseekbot than the running one', async () => {
    const manager = installer({ application: 'restart-required' }, [
      { name: 'deepseekbot', installed: true, version: '1.1.0' },
    ]);
    expect(await installable(manager).update()).toEqual({
      status: 'restart-required',
      current: '1.0.1',
      installed: '1.1.0',
      restartable: false,
    });
    expect(await installable(manager, '1.1.0').update()).toMatchObject({ status: 'current' });
  });

  it('refuses versions that are not newer and builds without the Plugin Manager', async () => {
    const manager = installer({ application: 'restart-required' });
    expect(await installable(manager).install('1.0.1')).toEqual({
      status: 'failed',
      reason: 'invalid-version',
    });
    expect(await installable(manager).install('latest')).toMatchObject({
      reason: 'invalid-version',
    });
    expect(await installable(undefined).install('1.1.0')).toEqual({
      status: 'failed',
      reason: 'unavailable',
    });
    expect(await installable(manager, '0.0.0').install('1.1.0')).toMatchObject({
      reason: 'unavailable',
    });
    expect(manager.installBundle).not.toHaveBeenCalled();
  });

  it('maps Plugin Manager failures to a reason with the diagnostic and log', async () => {
    const outcome = (result: ReleaseInstallerResult | Error) =>
      installable(installer(result)).install('1.1.0');
    expect(
      await outcome({
        application: 'failed',
        error: { code: 'operation-error', diagnostic: 'ERR_PNPM_FETCH' },
        packageResult: { kind: 'network', output: 'fetch failed', logPath: '/logs/1.log' },
      }),
    ).toEqual({
      status: 'failed',
      reason: 'network',
      diagnostic: 'ERR_PNPM_FETCH',
      logPath: '/logs/1.log',
    });
    expect(
      await outcome({ application: 'failed', error: { code: 'incompatible-version' } }),
    ).toEqual({ status: 'failed', reason: 'incompatible' });
    expect(
      await outcome({
        application: 'failed',
        error: { code: 'operation-error' },
        packageResult: { kind: 'build-blocked', output: 'blocked' },
      }),
    ).toMatchObject({ reason: 'build-blocked', diagnostic: 'blocked' });
    expect(await outcome(new Error('lock timeout'))).toMatchObject({
      reason: 'failed',
      diagnostic: 'Error: lock timeout',
    });
  });

  it('joins a second install request while one is running', async () => {
    let finish: (value: ReleaseInstallerResult) => void = () => undefined;
    const manager = {
      listBundles: vi.fn(async () => [{ name: 'deepseekbot', installed: true }]),
      installBundle: vi.fn(
        () =>
          new Promise<ReleaseInstallerResult>((resolve) => {
            finish = resolve;
          }),
      ),
    };
    const service = installable(manager);
    const first = service.install('1.1.0');
    const second = service.install('1.1.0');
    await vi.waitFor(() => {
      expect(manager.installBundle).toHaveBeenCalledTimes(1);
    });
    expect(await service.restart()).toEqual({ status: 'failed', reason: 'busy' });
    finish({ application: 'restart-required' });
    expect(await first).toEqual(await second);
  });

  it('reads the installed version and ledgers next to the module', () => {
    const release = installedRelease(new URL('../src/plugin.ts', import.meta.url).href);
    expect(release.version()).toBe('0.0.0');
    expect(release.ledgers()?.english).toContain('# DeepSeekBot Changelog');
    expect(release.ledgers()?.chinese).toContain('# DeepSeekBot 更新日志');
  });
});
