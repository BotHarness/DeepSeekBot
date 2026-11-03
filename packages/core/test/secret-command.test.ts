import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  SecretCommandRefusal,
  maskSecrets,
  runSecretCommand,
  secretCommandDenial,
  secretCommandArgs,
  secretCommandBaseEnv,
  secretCommandEnvName,
  secretCommandProgram,
} from '../src/credentials/secret-command.js';

describe('Host-run secret command consumer', () => {
  it('accepts a bare tool name and refuses paths, shells and interpreters', () => {
    expect(secretCommandProgram('gh')).toBe('gh');
    expect(secretCommandProgram('aws-vault.exe')).toBe('aws-vault.exe');
    for (const program of [
      '/usr/bin/gh',
      './gh',
      '..',
      'gh;id',
      'sh',
      'Bash',
      'env',
      'node',
      'python3',
      'pwsh.exe',
      'xargs',
      '',
    ])
      expect(() => secretCommandProgram(program), program).toThrow(SecretCommandRefusal);
  });

  it('refuses environment names that change how a program loads or finds code', () => {
    expect(secretCommandEnvName('GH_TOKEN')).toBe('GH_TOKEN');
    for (const name of [
      'PATH',
      'HOME',
      'LD_PRELOAD',
      'DYLD_INSERT_LIBRARIES',
      'NODE_OPTIONS',
      'BASH_ENV',
      'GIT_SSH_COMMAND',
      'gh_token',
      'A B',
      '',
    ])
      expect(() => secretCommandEnvName(name), name).toThrow(SecretCommandRefusal);
    expect(() => secretCommandArgs(Array.from({ length: 65 }, () => 'x'))).toThrow(
      SecretCommandRefusal,
    );
    expect(() => secretCommandArgs(['a\0b'])).toThrow(SecretCommandRefusal);
  });

  it('names the reason before any approval is asked for', () => {
    const env = [{ name: 'GH_TOKEN', value: '{{token}}' }];
    expect(secretCommandDenial({ program: 'gh', args: ['api', 'user'], env })).toBeUndefined();
    expect(secretCommandDenial({ program: 'sh', args: ['-c', 'echo $GH_TOKEN'], env })).toContain(
      'shell, interpreter or launcher',
    );
    expect(secretCommandDenial({ program: 'gh', args: ['--token', '{{token}}'], env })).toContain(
      'never in arguments',
    );
    expect(
      secretCommandDenial({ program: 'gh', args: [], env: [{ name: 'GH_TOKEN', value: 'plain' }] }),
    ).toContain('placeholder');
    expect(secretCommandDenial({ program: 'gh', args: 'api', env })).toBe(
      'secret_cli arguments are invalid',
    );
  });

  it('starts with a clean environment that keeps only what a tool needs to run', () => {
    const env = secretCommandBaseEnv({
      PATH: '/usr/bin',
      HOME: '/home/owner',
      DEEPSEEK_API_KEY: 'SYNTHETIC-host-key',
      NODE_OPTIONS: '--inspect',
    });
    expect(env['PATH']).toBe('/usr/bin');
    expect(env['DEEPSEEK_API_KEY']).toBeUndefined();
    expect(env['NODE_OPTIONS']).toBeUndefined();
  });

  it('masks a secret in raw, base64, hex and URL-encoded form', () => {
    const secret = 'SYNTHETIC/secret value+1';
    const text = [
      secret,
      Buffer.from(secret).toString('base64'),
      Buffer.from(secret).toString('hex'),
      encodeURIComponent(secret),
      'short',
    ].join(' | ');
    expect(maskSecrets(text, [secret, 'short'])).toBe(
      '[secret] | [secret] | [secret] | [secret] | short',
    );
  });

  it('passes the secret only through the environment and returns masked output', async () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'bh-secret-command-')));
    const script =
      'process.stdout.write(process.env.TOOL_TOKEN + " " + process.cwd() + " " + String(process.env.DEEPSEEK_API_KEY));' +
      'process.stderr.write(Buffer.from(process.env.TOOL_TOKEN).toString("base64"));process.exit(3)';
    const result = await runSecretCommand(
      [process.execPath, '-e', script],
      {
        ...secretCommandBaseEnv({ PATH: process.env['PATH'] }),
        TOOL_TOKEN: 'SYNTHETIC-tool-token',
      },
      cwd,
      ['SYNTHETIC-tool-token'],
      new AbortController().signal,
    );
    expect(result).toEqual({
      consumer: 'command-v1',
      successful: false,
      exitCode: 3,
      stdout: `[secret] ${cwd} undefined`,
      stderr: '[secret]',
      truncated: false,
    });
  });

  it('stops a command that outlives its deadline and reports a missing program', async () => {
    const signal = new AbortController().signal;
    await expect(
      runSecretCommand(
        [process.execPath, '-e', 'setTimeout(() => {}, 60000)'],
        secretCommandBaseEnv(),
        tmpdir(),
        [],
        signal,
        300,
      ),
    ).rejects.toThrow('did not finish within 0.3 seconds');
    await expect(
      runSecretCommand(['bh-no-such-program-1572'], secretCommandBaseEnv(), tmpdir(), [], signal),
    ).rejects.toThrow(SecretCommandRefusal);
  });
});
