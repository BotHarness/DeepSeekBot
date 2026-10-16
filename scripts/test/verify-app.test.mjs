import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { collectObservation, parseVerifyArgs, verifyPaths } from '../verify-app.mjs';

describe('verify-app arguments', () => {
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
