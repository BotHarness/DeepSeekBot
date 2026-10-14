import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseVerifyArgs, verifyPaths } from '../verify-app.mjs';

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
