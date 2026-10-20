import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyPendingDataReset,
  createDataReset,
  DATA_RESET_MARKER,
  DataResetError,
} from '../src/data-reset/reset.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function write(path: string, text = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'data-reset-'));
  roots.push(root);
  const home = join(root, 'home');
  const dshHome = join(home, '.dsh');
  write(join(dshHome, '.credentials.yaml'), 'deepseek: secret');
  write(join(dshHome, 'settings.yaml'));
  write(join(dshHome, 'botharness', 'botharness.db'), 'database');
  write(join(dshHome, 'botharness', 'bots', 'ada', 'memory', 'SOUL.md'));
  write(join(dshHome, 'botharness', 'attachments', 'a.png'));
  write(join(dshHome, 'botharness', 'chosen', 'memory', 'SOUL.md'));
  write(join(dshHome, 'integrations', 'dsh-feishu', 'config.json'));
  write(join(dshHome, 'integrations', 'someone-else', 'config.json'));
  write(join(home, '.botharness', 'cua-driver', 'cua-driver'));
  write(join(home, 'Desktop', 'BotHarness Exports', 'shot.png'));
  return { home, dshHome, chosen: join(dshHome, 'botharness', 'chosen', 'memory') };
}

function reset(
  paths: ReturnType<typeof fixture>,
  overrides: Partial<Parameters<typeof createDataReset>[0]> = {},
) {
  const exits: Array<() => void> = [];
  const restart = vi.fn();
  const stopWriting = vi.fn();
  const service = createDataReset({
    dshHome: paths.dshHome,
    home: paths.home,
    bots: () => ({ count: 2, chosenMemoryDirs: [paths.chosen] }),
    restarter: () => ({ restart }),
    stopWriting,
    onExit: (listener) => exits.push(listener),
    ...overrides,
  });
  return { service, exits, restart, stopWriting };
}

describe('data reset', () => {
  it('previews every removed folder and what stays', () => {
    const paths = fixture();
    const preview = reset(paths).service.preview();
    expect(preview.bots).toBe(2);
    expect(preview.restartable).toBe(true);
    expect(preview.targets.map((target) => [target.kind, target.path])).toEqual([
      ['data', join(paths.dshHome, 'botharness')],
      ['im-settings', join(paths.dshHome, 'integrations', 'dsh-feishu')],
      ['local-tools', join(paths.home, '.botharness')],
    ]);
    expect(preview.targets[0]).toMatchObject({ files: 3 });
    expect(preview.kept).toEqual([
      { kind: 'credentials', path: join(paths.dshHome, '.credentials.yaml') },
      { kind: 'memory', path: paths.chosen },
      { kind: 'exports', path: join(paths.home, 'Desktop', 'BotHarness Exports') },
    ]);
  });

  it('refuses a wrong, expired or outdated preview token', () => {
    const paths = fixture();
    let now = new Date('2026-10-20T10:00:00Z');
    let chosen = [paths.chosen];
    const { service, stopWriting } = reset(paths, {
      now: () => now,
      bots: () => ({ count: 2, chosenMemoryDirs: chosen }),
    });
    expect(() => service.confirm('nope')).toThrow(DataResetError);
    const expired = service.preview().token;
    now = new Date('2026-10-20T10:11:00Z');
    expect(() => service.confirm(expired)).toThrow(/expired/);
    const outdated = service.preview().token;
    chosen = [];
    expect(() => service.confirm(outdated)).toThrow(/changed/);
    expect(stopWriting).not.toHaveBeenCalled();
    expect(existsSync(join(paths.dshHome, DATA_RESET_MARKER))).toBe(false);
  });

  it('stops writing, restarts and removes the data when the old Host exits', () => {
    const paths = fixture();
    const { service, exits, restart, stopWriting } = reset(paths);
    expect(service.confirm(service.preview().token)).toEqual({ status: 'restarting' });
    expect(stopWriting).toHaveBeenCalledOnce();
    expect(restart).toHaveBeenCalledOnce();
    expect(existsSync(join(paths.dshHome, DATA_RESET_MARKER))).toBe(true);
    expect(() => service.preview()).toThrow(/already/);
    for (const exit of exits) exit();
    expect(existsSync(join(paths.dshHome, 'botharness', 'botharness.db'))).toBe(false);
    expect(existsSync(join(paths.dshHome, 'botharness', 'bots'))).toBe(false);
    expect(existsSync(join(paths.dshHome, 'integrations', 'dsh-feishu'))).toBe(false);
    expect(existsSync(join(paths.home, '.botharness'))).toBe(false);
    expect(existsSync(join(paths.dshHome, DATA_RESET_MARKER))).toBe(false);
    expect(readFileSync(join(paths.dshHome, '.credentials.yaml'), 'utf8')).toBe('deepseek: secret');
    expect(existsSync(join(paths.chosen, 'SOUL.md'))).toBe(true);
    expect(existsSync(join(paths.dshHome, 'integrations', 'someone-else', 'config.json'))).toBe(
      true,
    );
    expect(existsSync(join(paths.dshHome, 'settings.yaml'))).toBe(true);
    expect(existsSync(join(paths.home, 'Desktop', 'BotHarness Exports', 'shot.png'))).toBe(true);
  });

  it('finishes at the next Host start when the Host cannot restart itself', () => {
    const paths = fixture();
    const { service } = reset(paths, { restarter: () => undefined });
    const preview = service.preview();
    expect(preview.restartable).toBe(false);
    expect(service.confirm(preview.token)).toEqual({
      status: 'restart-required',
      reason: 'restart-unavailable',
    });
    expect(existsSync(join(paths.dshHome, 'botharness', 'botharness.db'))).toBe(true);
    const log = vi.fn();
    expect(applyPendingDataReset({ dshHome: paths.dshHome, home: paths.home, log })).toEqual({
      applied: true,
      failed: [],
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('data-reset phase=applied'));
    expect(existsSync(join(paths.dshHome, 'botharness', 'botharness.db'))).toBe(false);
    expect(existsSync(join(paths.chosen, 'SOUL.md'))).toBe(true);
    expect(applyPendingDataReset({ dshHome: paths.dshHome, home: paths.home }).applied).toBe(false);
  });

  it('ignores a malformed marker instead of guessing what to remove', () => {
    const paths = fixture();
    writeFileSync(join(paths.dshHome, DATA_RESET_MARKER), '{"keep":"nope"}');
    expect(applyPendingDataReset({ dshHome: paths.dshHome, home: paths.home }).applied).toBe(false);
    expect(existsSync(join(paths.dshHome, 'botharness', 'botharness.db'))).toBe(true);
  });
});
