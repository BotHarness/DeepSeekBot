import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { linuxWorkspaceArgs, quoteShellArgument } from '../src/credentials/linux-execution.js';
import { createTempRoot } from './helpers.js';
import {
  ProtectedExecution,
  PRIVATE_COMMAND_IMAGE,
} from '../src/credentials/protected-execution.js';

describe('Linux workspace authority', () => {
  it.skipIf(process.env.BOTHARNESS_PRIVATE_DOCKER_QA !== '1')(
    'persists authorized files while denying Host credentials, Git hooks, socket and environment',
    async () => {
      const parent = createTempRoot('bh-private-mounted-');
      const home = join(parent, 'home');
      const root = join(parent, 'workspace');
      mkdirSync(home);
      mkdirSync(root);
      chmodSync(root, 0o777);
      mkdirSync(join(root, '.git'));
      const canary = 'SYNTHETIC-host-authority-canary-1380';
      const privateFile = join(home, '.credentials.yaml');
      writeFileSync(privateFile, canary);
      chmodSync(privateFile, 0o600);
      const execution = new ProtectedExecution(() => undefined);
      const name = 'botharness-private-command-' + randomUUID();
      const cleanup = execution.trackContainer(name);
      const args = linuxWorkspaceArgs(name, root, root, home);
      args.push(
        '--entrypoint',
        '/bin/bash',
        PRIVATE_COMMAND_IMAGE,
        '-c',
        `printf 'mounted-proof' > proof.txt; cat proof.txt; pwd; id; env; if test -e ${quoteShellArgument(privateFile)}; then cat ${quoteShellArgument(privateFile)} | base64; else echo host-file-unavailable; fi; if test -e /var/run/docker.sock; then echo docker-socket-exposed; else echo docker-socket-unavailable; fi; if touch .git/host-hook 2>/dev/null; then echo host-git-writable; else echo host-git-protected; fi`,
      );
      try {
        const { stdout } = await promisify(execFile)('docker', args, {
          windowsHide: true,
          timeout: 30_000,
          maxBuffer: 16_000,
          env: { ...process.env, DEEPSEEK_API_KEY: canary },
        });
        expect(stdout).toContain('mounted-proof');
        expect(readFileSync(join(root, 'proof.txt'), 'utf8')).toBe('mounted-proof');
        expect(stdout).toContain('/workspace');
        expect(stdout).toContain('uid=65534');
        expect(stdout).toContain('host-file-unavailable');
        expect(stdout).toContain('docker-socket-unavailable');
        expect(stdout).toContain('host-git-protected');
        expect(stdout).not.toContain(canary);
        expect(stdout).not.toContain(Buffer.from(canary).toString('base64'));
        expect(stdout).not.toContain('DEEPSEEK_API_KEY');
      } finally {
        await cleanup();
        await execution.close();
      }
    },
    60_000,
  );
  it('mounts a canonical authorized subtree, protects Host-managed Git and rejects an ancestor of the credential home', () => {
    const parent = createTempRoot('bh-private-linux-');
    const home = join(parent, 'home');
    const root = join(parent, 'workspace');
    const nested = join(root, 'nested');
    mkdirSync(home);
    mkdirSync(nested, { recursive: true });
    mkdirSync(join(root, '.git'));
    const args = linuxWorkspaceArgs('probe', root, nested, home);
    expect(args).toContain('/workspace/nested');
    expect(args).toContain(`type=bind,src=${root},dst=/workspace`);
    expect(args).toContain(`type=bind,src=${join(root, '.git')},dst=/workspace/.git,readonly`);
    expect(args.join(' ')).not.toContain(home);
    expect(args).not.toContain('--env');
    expect(() => linuxWorkspaceArgs('probe', parent, root, home)).toThrow('Host authority');
    expect(() => linuxWorkspaceArgs('probe', root, home, home)).toThrow('Host authority');
    mkdirSync(join(home, 'profiles'));
    expect(() =>
      linuxWorkspaceArgs('probe', join(home, 'profiles'), join(home, 'profiles'), home),
    ).toThrow('Host authority');
    expect(() => linuxWorkspaceArgs('probe', process.cwd(), process.cwd(), home)).toThrow(
      'Host authority',
    );
    const cache = join(home, 'private-cache');
    mkdirSync(cache);
    expect(() => linuxWorkspaceArgs('probe', cache, cache, home)).toThrow('Host authority');
    const memory = join(home, 'botharness', 'bots', 'bot-probe', 'memory');
    mkdirSync(memory, { recursive: true });
    expect(linuxWorkspaceArgs('probe', memory, memory, home)).toContain('/workspace');
    const second = join(parent, 'worktree');
    mkdirSync(second);
    writeFileSync(join(second, '.git'), 'gitdir: ' + join(home, '.git'));
    expect(() => linuxWorkspaceArgs('probe', second, second, home)).toThrow('canonical directory');
  });
  it('quotes command arguments without Host command substitution', () => {
    expect(quoteShellArgument("a'$(whoami)\n;b")).toBe("'a'\\''$(whoami)\n;b'");
    expect(() => quoteShellArgument('\0')).toThrow('Invalid');
  });
});
