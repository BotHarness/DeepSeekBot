import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  collectObservation,
  parseVerifyArgs,
  verifyPaths,
  inspectInstanceRuntime,
} from '../verify-app.mjs';

describe('verify-app arguments', () => {
  it('forwards explicit runtime selection independently of the build pin', () => {
    expect(parseVerifyArgs(['launch', '--dsh-version', '0.2.1-rc.99']).dshVersion).toBe(
      '0.2.1-rc.99',
    );
    expect(() => parseVerifyArgs(['launch', '--dsh-version', 'latest'])).toThrow('API floor');
  });
  it('keeps shot actions in the order given', () => {
    const options = parseVerifyArgs([
      'shot',
      'dm-reply',
      '--name',
      'task-1',
      '--bot-mode',
      '--fill',
      'Message DeepSeek Bot=a=b',
      '--press',
      'Enter',
      '--click-text',
      'Welcome',
      '--right-click',
      'DeepSeek Bot',
      '--wait-text',
      '42',
      '--size',
      '390x844',
      '--theme',
      'dark',
    ]);
    expect(options).toMatchObject({
      command: 'shot',
      name: 'task-1',
      positional: ['dm-reply'],
      botMode: true,
      theme: 'dark',
      width: 390,
      height: 844,
      waitTexts: ['42'],
      actions: [
        { kind: 'fill', name: 'Message DeepSeek Bot', text: 'a=b' },
        { kind: 'press', name: 'Enter' },
        { kind: 'click-text', name: 'Welcome' },
        { kind: 'right-click', name: 'DeepSeek Bot' },
      ],
    });
  });

  it('refuses names that would escape the state directory', () => {
    expect(() => parseVerifyArgs(['launch', '--name', '../x'])).toThrow('--name');
  });

  it('refuses unknown options and malformed values', () => {
    expect(() => parseVerifyArgs(['shot', 'x', '--clik', 'Send'])).toThrow('unknown option --clik');
    expect(() => parseVerifyArgs(['shot', 'x', '--fill', 'no-separator'])).toThrow('--fill');
    expect(() => parseVerifyArgs(['shot', 'x', '--size', 'wide'])).toThrow('--size');
  });
});

describe('verify-app paths', () => {
  it('keeps state in the worktree and the Host home in the temp dir', () => {
    const dir = join('/repo', '.humanlayer', 'verify', 'task-1');
    expect(verifyPaths('task-1', '/repo')).toEqual({
      dir,
      instance: join(dir, 'instance.json'),
      evidence: join(dir, 'evidence'),
      home: join(tmpdir(), 'bh-verify-task-1'),
    });
  });
});

describe('named Host observation', () => {
  const observe = (ok, attempts) =>
    collectObservation({
      health: async () => ({ ok }),
      diagnostics: async () => ({ version: 1, attempts }),
    });

  it('keeps healthy HTTP separate from absent, stale, closed and starting Client evidence', async () => {
    for (const attempts of [[], ...['stale', 'closed', 'starting'].map((state) => [{ state }])])
      expect(await observe(true, attempts)).toMatchObject({ state: 'incomplete', exitCode: 2 });
  });

  it('reports a Client failure and preserves failures before a newer ready document', async () => {
    expect(await observe(true, [{ state: 'failed' }])).toMatchObject({
      state: 'failed',
      exitCode: 1,
    });
    expect(
      await observe(true, [
        { attempt: 'failed', startedAt: 1, state: 'failed' },
        { attempt: 'ready', startedAt: 2, state: 'shell-ready' },
      ]),
    ).toMatchObject({
      state: 'shell-observed',
      exitCode: 0,
      client: { earlierFailures: ['failed'] },
      verification: expect.stringContaining('unverified'),
    });
  });

  it('does not let a ready Client hide a failed Host check', async () => {
    expect(await observe(false, [{ state: 'shell-ready' }])).toMatchObject({
      state: 'failed',
      exitCode: 1,
    });
  });

  it('keeps partial evidence and never echoes credential-bearing reader errors', async () => {
    const result = await collectObservation({
      health: async () => ({ ok: true }),
      diagnostics: async () => {
        throw new Error('http://localhost/?token=private');
      },
    });
    expect(result).toMatchObject({
      state: 'incomplete',
      host: { ok: true },
      client: { state: 'unavailable' },
    });
    expect(JSON.stringify(result)).not.toContain('private');
    expect(
      await collectObservation({
        health: async () => {
          throw new Error('private');
        },
        diagnostics: async () => ({ version: 1, attempts: [] }),
      }),
    ).toMatchObject({
      state: 'failed',
      host: { reason: 'health-check-unavailable' },
      client: { state: 'unobserved' },
    });
  });
});

describe('actual launched runtime diagnostics', () => {
  it.each(['0.2.0-rc.2', '0.2.1-rc.99'])(
    'checks selected %s rather than the workspace SDK',
    (version) => {
      const root = mkdtempSync(join(tmpdir(), 'verify-runtime-'));
      try {
        const path = join(root, 'node_modules/@deepseek-ai/dsh');
        mkdirSync(path, { recursive: true });
        writeFileSync(join(path, 'package.json'), JSON.stringify({ version }));
        const instance = { runtime: root, worktree: '/different-sdk', dshVersion: version };
        expect(inspectInstanceRuntime(instance)).toEqual({
          dshVersion: version,
          dshVersionSupported: true,
          dshVersionMatches: true,
        });
        writeFileSync(join(path, 'package.json'), JSON.stringify({ version: '0.2.2-rc.1' }));
        expect(inspectInstanceRuntime(instance).dshVersionMatches).toBe(false);
        expect(inspectInstanceRuntime({ worktree: root }).dshVersionError).toContain(
          'not recorded',
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
