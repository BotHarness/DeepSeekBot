import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../android-qa.ps1', import.meta.url));
const dirs = [];
const powershell = process.platform === 'win32' ? 'pwsh.exe' : 'pwsh';
const available =
  process.platform === 'win32' &&
  spawnSync(powershell, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major']).status === 0;
const run = (root, ...args) =>
  spawnSync(powershell, ['-NoProfile', '-File', script, ...args, '-QueueRoot', root], {
    encoding: 'utf8',
    timeout: 15000,
  });
const claim = ['claim', '-Owner', 'test-task', '-Batch', 'batch-1', '-Serial', 'emulator-5580'];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!available)('Windows Android QA lease', () => {
  function setup() {
    const root = mkdtempSync(join(tmpdir(), 'bh-android-qa-'));
    dirs.push(root);
    expect(run(root, 'init').status).toBe(0);
    return root;
  }

  it('initializes without replacing configuration or another request', () => {
    const root = setup();
    writeFileSync(join(root, 'queue.md'), 'existing request');
    writeFileSync(join(root, 'config.json'), '{"sdk":"D:/existing-sdk"}');
    expect(run(root, 'init').status).toBe(0);
    expect(readFileSync(join(root, 'queue.md'), 'utf8')).toBe('existing request');
    expect(JSON.parse(readFileSync(join(root, 'config.json'), 'utf8')).sdk).toBe('D:/existing-sdk');
  });

  it('admits exactly one concurrent runner and preserves its lease', async () => {
    const root = setup();
    const start = () =>
      new Promise((done) => {
        const child = spawn(
          powershell,
          ['-NoProfile', '-File', script, ...claim, '-QueueRoot', root],
          { stdio: 'ignore' },
        );
        child.on('error', () => done(-1));
        child.on('close', done);
      });
    const codes = await Promise.all([start(), start()]);
    expect(codes.filter((code) => code === 0)).toHaveLength(1);
    const status = JSON.parse(run(root, 'status').stdout);
    expect(status.active.serial).toBe('emulator-5580');
    expect(status.active.worktree).toBe(resolve(script, '../..'));
  }, 20000);

  it('refuses another owner, batch, device and worktree; matching release permits re-claim', () => {
    const root = setup();
    expect(run(root, ...claim).status).toBe(0);
    expect(run(root, 'release', '-Owner', 'other', '-Batch', 'batch-1').status).not.toBe(0);
    expect(run(root, 'release', '-Owner', 'test-task', '-Batch', 'other').status).not.toBe(0);
    expect(
      run(root, 'install', '-Owner', 'test-task', '-Batch', 'batch-1', '-Serial', 'other-device')
        .status,
    ).not.toBe(0);
    const lease = JSON.parse(readFileSync(join(root, 'active.json'), 'utf8'));
    writeFileSync(
      join(root, 'active.json'),
      JSON.stringify({ ...lease, worktree: join(root, 'other-checkout') }),
    );
    expect(run(root, 'release', '-Owner', 'test-task', '-Batch', 'batch-1').status).not.toBe(0);
    writeFileSync(join(root, 'active.json'), JSON.stringify(lease));
    expect(run(root, 'release', '-Owner', 'test-task', '-Batch', 'batch-1').status).toBe(0);
    expect(run(root, ...claim).status).toBe(0);
  }, 30000);
});
