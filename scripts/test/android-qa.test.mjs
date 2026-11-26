import { spawnSync, spawn } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../android-qa.mjs', import.meta.url));
const dirs = [];
const run = (root, ...args) =>
  spawnSync(process.execPath, [script, ...args, '-QueueRoot', root], {
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
    shell: false,
  });
const claim = ['claim', '-Owner', 'test-task', '-Batch', 'batch-1', '-Serial', 'emulator-5580'];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

it.skipIf(process.platform === 'win32')(
  'reuses and installs a verified APK across JS-only checkouts and rebuilds when inputs or bytes change',
  () => {
    const mobileRequire = createRequire(new URL('../../apps/mobile/package.json', import.meta.url));
    const expo = dirname(mobileRequire.resolve('expo/package.json'));
    const folder = mkdtempSync(join(tmpdir(), 'bhapk-'));
    dirs.push(folder);
    const queue = join(folder, 'queue');
    const sdk = join(folder, 'sdk');
    const bin = join(folder, 'bin');
    const log = join(folder, 'commands.jsonl');
    const write = (path, contents, mode) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, contents, { mode });
    };
    const executable = (path, body) => write(path, `#!${process.execPath}\n${body}\n`, 0o755);
    const record = `const log = (name, value) => require('node:fs').appendFileSync(
      ${JSON.stringify(log)}, JSON.stringify([name, value]) + '\\n');`;
    executable(
      join(sdk, 'platform-tools', 'adb'),
      `${record}
      const action = process.argv[4];
      const property = process.argv[6];
      if (action === 'get-state') console.log('device');
      if (property === 'ro.kernel.qemu') console.log('1');
      if (property === 'ro.product.cpu.abi') console.log(process.env.TEST_QA_ABI);
      if (action === 'install') log('install', process.argv[6]);`,
    );
    executable(join(sdk, 'cmake', '3.22.1', 'bin', 'ninja'), "console.log('1.12.0');");
    executable(
      join(bin, 'pnpm'),
      `${record}
      log(process.argv.includes('prebuild') ? 'prebuild' : 'metro', process.argv[3]);`,
    );
    const appConfig = (version) =>
      JSON.stringify({ expo: { name: 'QA', slug: 'qa', android: { versionCode: version } } });
    const git = (repo, ...args) => {
      const result = spawnSync('git', ['-C', repo, ...args], {
        encoding: 'utf8',
        windowsHide: true,
        shell: false,
      });
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout.trim();
    };
    const fixture = (name) => {
      const repo = join(folder, name);
      const scripts = join(repo, 'scripts');
      const mobile = join(repo, 'apps', 'mobile');
      mkdirSync(scripts, { recursive: true });
      for (const file of [
        'android-qa.mjs',
        'android-qa-apk-cache.mjs',
        'dev-package-manager.mjs',
      ]) {
        copyFileSync(join(dirname(script), file), join(scripts, file));
      }
      write(join(repo, '.gitignore'), 'node_modules/\n/apps/mobile/android/\n');
      write(join(repo, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
      write(join(mobile, 'package.json'), '{"name":"qa","dependencies":{"expo":"58.0.26"}}');
      write(join(mobile, 'app.json'), appConfig(1));
      write(join(mobile, 'app.js'), `export default "${name}";\n`);
      mkdirSync(join(mobile, 'node_modules'), { recursive: true });
      symlinkSync(expo, join(mobile, 'node_modules', 'expo'), 'dir');
      executable(
        join(mobile, 'android', 'gradlew'),
        `${record}
        const fs = require('node:fs');
        const path = require('node:path');
        const apk = path.join(__dirname, 'app/build/outputs/apk/debug/app-debug.apk');
        const abi = process.argv.find(arg => arg.startsWith('-PreactNativeArchitectures='));
        fs.mkdirSync(path.dirname(apk), { recursive: true });
        fs.writeFileSync(apk, 'fixture apk ' + abi);
        log('gradle', __dirname);`,
      );
      git(repo, 'init', '-q');
      git(repo, 'add', '.');
      git(
        repo,
        '-c',
        'user.name=Android QA',
        '-c',
        'user.email=qa@example.invalid',
        'commit',
        '-qm',
        name,
      );
      return {
        repo,
        mobile,
        commit: git(repo, 'rev-parse', 'HEAD'),
        script: join(scripts, 'android-qa.mjs'),
      };
    };
    const first = fixture('a');
    const second = fixture('b');
    let abi = 'x86_64';
    const command = (fixture, ...args) => {
      const result = spawnSync(process.execPath, [fixture.script, ...args, '-QueueRoot', queue], {
        env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, TEST_QA_ABI: abi },
        encoding: 'utf8',
        windowsHide: true,
        shell: false,
      });
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout;
    };
    const scope = ['-Owner', 'test-task', '-Batch', 'batch-1'];
    const evidence = (file) =>
      JSON.parse(readFileSync(join(queue, 'evidence', 'batch-1', 'emulator', file), 'utf8'));
    const calls = (name) =>
      readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
        .filter(([action]) => action === name);

    command(first, 'init');
    write(
      join(queue, 'config.json'),
      JSON.stringify({
        sdk,
        javaHome: join(folder, 'jdk'),
        nativeRoot: join(folder, 'native'),
        cmakeVersion: '3.22.1',
      }),
    );
    command(first, ...claim);
    command(first, 'build', ...scope);
    const original = evidence('build.json');
    expect(original).toMatchObject({
      builtCommit: first.commit,
      commit: first.commit,
      reused: false,
    });
    command(first, 'release', ...scope);

    command(second, ...claim);
    command(second, 'build', ...scope);
    expect(evidence('build.json')).toMatchObject({
      builtCommit: first.commit,
      commit: second.commit,
      apk: original.apk,
      reused: true,
    });
    expect(calls('prebuild')).toHaveLength(1);
    expect(calls('gradle')).toHaveLength(1);
    command(second, 'install', ...scope);
    command(second, 'metro', ...scope);
    expect(calls('install')).toEqual([['install', original.apk]]);
    expect(evidence('install.json')).toMatchObject({
      builtCommit: first.commit,
      commit: second.commit,
    });
    expect(evidence('metro.json')).toMatchObject({ commit: second.commit, port: 8085 });

    writeFileSync(original.apk, 'corrupt');
    expect(() => command(second, 'install', ...scope)).toThrow('No compatible Android QA APK');
    expect(calls('install')).toHaveLength(1);
    command(second, 'build', ...scope);
    expect(evidence('build.json')).toMatchObject({ builtCommit: second.commit, reused: false });
    expect(readFileSync(original.apk, 'utf8')).toBe(
      'fixture apk -PreactNativeArchitectures=x86_64',
    );

    writeFileSync(join(second.mobile, 'app.json'), appConfig(2));
    command(second, 'build', ...scope);
    expect(evidence('build.json').nativeFingerprint).not.toBe(original.nativeFingerprint);
    expect(evidence('build.json').reused).toBe(false);
    abi = 'arm64-v8a';
    command(second, 'build', ...scope);
    const arm64 = evidence('build.json');
    expect(arm64).toMatchObject({ abi, reused: false });
    write(join(second.mobile, 'android', 'app', 'debug.keystore'), 'other signing key');
    command(second, 'build', ...scope);
    expect(evidence('build.json').signingKeySha256).not.toBe(arm64.signingKeySha256);
    expect(evidence('build.json').reused).toBe(false);
    expect(calls('gradle')).toHaveLength(5);
  },
  60_000,
);

describe('Android QA lease', () => {
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
        const child = spawn(process.execPath, [script, ...claim, '-QueueRoot', root], {
          stdio: 'ignore',
          windowsHide: true,
          shell: false,
        });
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
