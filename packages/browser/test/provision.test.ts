import { describe, expect, it } from 'vitest';

import {
  BROWSER_FAILURE_KINDS,
  aptInstallCommand,
  checkDiskSpace,
  classifyInstallError,
  detectMissingSystemLibs,
  diagnoseStartupExit,
  diskSpaceFailure,
  freeBytesFor,
  installFailure,
  isBrowserFailureKind,
  missingBinaryFailure,
  missingFromSonames,
  missingLibsFailure,
  missingLibsOfBinary,
  parseLdconfigSonames,
  parseLddMissing,
  spawnFailure,
  startupTimeoutFailure,
  toBrowserErrorBody,
  LINUX_CHROME_LIB_REQUIREMENTS,
  PROVISION_MIN_FREE_BYTES,
  BrowserProvisionError,
} from '../src/runtime/provision.js';

const FULL_LDCONFIG = [...LINUX_CHROME_LIB_REQUIREMENTS]
  .map((entry) => `\t${entry.soname} (libc6,x86-64) => /lib/x86_64-linux-gnu/${entry.soname}`)
  .join('\n');

describe('failure kinds', () => {
  it('accepts only the contracted codes', () => {
    expect(BROWSER_FAILURE_KINDS).toHaveLength(10);
    expect(isBrowserFailureKind('provision-no-network')).toBe(true);
    expect(isBrowserFailureKind('startup-crashed')).toBe(true);
    expect(isBrowserFailureKind('code 127')).toBe(false);
    expect(isBrowserFailureKind(undefined)).toBe(false);
  });

  it('serializes provision errors with code and detail, and plain errors raw', () => {
    expect(
      toBrowserErrorBody(new BrowserProvisionError('provision-no-network', 'msg', 'raw')),
    ).toEqual({
      ok: false,
      error: 'msg',
      code: 'provision-no-network',
      detail: 'raw',
    });
    expect(toBrowserErrorBody(new Error('boom'))).toEqual({ ok: false, error: 'boom' });
    expect(toBrowserErrorBody('nope')).toEqual({ ok: false, error: 'nope' });
  });
});

describe('install failure classification', () => {
  it.each([
    [
      Object.assign(new Error('request to https://x failed'), { code: 'ENOTFOUND' }),
      'provision-no-network',
    ],
    [new Error('getaddrinfo EAI_AGAIN storage.googleapis.com'), 'provision-no-network'],
    [new Error('fetch failed'), 'provision-no-network'],
    [new Error('self signed certificate in chain'), 'provision-no-network'],
    [
      Object.assign(new Error('no space left on device'), { code: 'ENOSPC' }),
      'provision-no-disk-space',
    ],
    [new Error('ENOSPC: no space left on device, write'), 'provision-no-disk-space'],
    [Object.assign(new Error('mkdir denied'), { code: 'EACCES' }), 'provision-no-permission'],
    [Object.assign(new Error('not permitted'), { code: 'EPERM' }), 'provision-no-permission'],
    [new Error('EACCES: permission denied, mkdir'), 'provision-no-permission'],
    [new Error('read-only file system'), 'provision-no-permission'],
    [new Error('weird puppet failure'), 'provision-failed'],
  ])('classifies %s as %s', (error, kind) => {
    expect(classifyInstallError(error)).toBe(kind);
  });

  it('maps each cause to a plain message without the raw exception', () => {
    const network = installFailure(new Error('fetch failed'), '/cache');
    expect(network.code).toBe('provision-no-network');
    expect(network.message).toMatch(/offline/i);
    expect(network.message).not.toMatch(/fetch failed/);
    expect(network.detail).toBe('fetch failed');

    const disk = installFailure(Object.assign(new Error('x'), { code: 'ENOSPC' }), '/cache');
    expect(disk.code).toBe('provision-no-disk-space');
    expect(disk.message).toMatch(/500 MB/);

    const permission = installFailure(new Error('EACCES: permission denied'), '/cache');
    expect(permission.code).toBe('provision-no-permission');
    expect(permission.message).toContain('/cache');

    const unknown = installFailure(new Error('???'), '/cache');
    expect(unknown.code).toBe('provision-failed');
    expect(unknown.detail).toBe('???');
  });
});

describe('disk precheck', () => {
  const roomy = {
    fs: { statfsSync: () => ({ bavail: 1_000_000, bsize: 4096 }) },
    exists: () => true,
  };

  it('passes when free space covers the ~500MB need', () => {
    expect(PROVISION_MIN_FREE_BYTES).toBe(500 * 1024 * 1024);
    expect(checkDiskSpace('/cache', PROVISION_MIN_FREE_BYTES, roomy)).toEqual({ ok: true });
  });

  it('fails plainly with the free amount when short', () => {
    const tight = {
      fs: { statfsSync: () => ({ bavail: 10, bsize: 4096 }) },
      exists: () => true,
    };
    const result = checkDiskSpace('/cache', PROVISION_MIN_FREE_BYTES, tight);
    expect(result).toEqual({ ok: false, availableBytes: 40960 });
    if (result.ok) throw new Error('expected a short disk');
    const failure = diskSpaceFailure('/cache', result.availableBytes);
    expect(failure.code).toBe('provision-no-disk-space');
    expect(failure.message).toMatch(/500 MB/);
    expect(failure.message).toMatch(/0 MB/);
  });

  it('walks up to the nearest existing ancestor and fails open when unknowable', () => {
    const seen: string[] = [];
    const deps = {
      fs: {
        statfsSync: (path: string) => {
          seen.push(path);
          return { bavail: 1_000_000, bsize: 4096 };
        },
      },
      exists: (path: string) => path === '/cache',
    };
    expect(freeBytesFor('/cache/missing/nested', deps)).toBe(1_000_000 * 4096);
    expect(seen).toEqual(['/cache']);
    expect(
      checkDiskSpace('/cache', PROVISION_MIN_FREE_BYTES, {
        fs: {
          statfsSync: () => {
            throw new Error('statfs unavailable');
          },
        },
        exists: () => true,
      }),
    ).toEqual({ ok: true });
  });
});

describe('linux library pre-flight', () => {
  it('parses ldconfig output and reports only the missing sonames', () => {
    const cached = parseLdconfigSonames(
      '\tlibatk-1.0.so.0 (libc6,x86-64) => /lib/libatk-1.0.so.0\nnot a cache line\n',
    );
    expect(cached.has('libatk-1.0.so.0')).toBe(true);
    const missing = missingFromSonames(cached);
    expect(missing.map((entry) => entry.soname)).not.toContain('libatk-1.0.so.0');
    expect(missing.length).toBe(LINUX_CHROME_LIB_REQUIREMENTS.length - 1);
  });

  it('parses ldd not-found lines without duplicates', () => {
    expect(
      parseLddMissing(
        '\tlibatk-1.0.so.0 => not found\n\tlibc.so.6 => /lib/libc.so.6 (0x42)\n\tlibatk-1.0.so.0 => not found\nlinux-vdso.so.1 (0x00007fff)\n',
      ),
    ).toEqual(['libatk-1.0.so.0']);
  });

  it('builds one deduped Ubuntu install command', () => {
    const command = aptInstallCommand([
      { soname: 'a', packages: ['libx11-6', 'libnss3'] },
      { soname: 'b', packages: ['libnss3'] },
    ]);
    expect(command).toBe('sudo apt install -y libnss3 libx11-6');
  });

  it('skips non-Linux platforms and unavailable loaders', () => {
    expect(detectMissingSystemLibs('darwin', { run: () => FULL_LDCONFIG })).toEqual([]);
    expect(
      detectMissingSystemLibs('linux', {
        run: () => {
          throw new Error('no ldconfig');
        },
      }),
    ).toEqual([]);
    expect(missingLibsOfBinary('/bin/chrome', { run: () => FULL_LDCONFIG })).toEqual([]);
    expect(
      missingLibsOfBinary('/bin/chrome', {
        run: () => {
          throw new Error('no ldd');
        },
      }),
    ).toEqual([]);
  });

  it('detects a minimal-server gap before any download', () => {
    const missing = detectMissingSystemLibs('linux', {
      run: (command) => {
        expect(command).toBe('ldconfig');
        return '\tlibc.so.6 (libc6,x86-64) => /lib/libc.so.6\n';
      },
    });
    expect(missing.length).toBe(LINUX_CHROME_LIB_REQUIREMENTS.length);
    const failure = missingLibsFailure(
      missing.map((entry) => entry.soname),
      { beforeDownload: true },
    );
    expect(failure.code).toBe('provision-missing-libs');
    expect(failure.message).toMatch(/nothing was downloaded/);
    expect(failure.detail).toContain('sudo apt install -y');
    expect(failure.detail).toContain('libatk-1.0.so.0');
  });

  it('diagnoses a post-launch exit with the same library guidance', () => {
    const failure = missingLibsFailure(['libatk-1.0.so.0', 'libcups.so.2'], { exitCode: 127 });
    expect(failure.code).toBe('provision-missing-libs');
    expect(failure.message).toMatch(/cannot start/);
    expect(failure.detail).toContain('exit code 127');
    expect(failure.detail).toContain('libatk1.0-0t64');
  });
});

describe('startup exit diagnosis', () => {
  it('names missing libraries instead of the bare exit code', () => {
    const failure = diagnoseStartupExit({
      binary: '/cache/chrome',
      code: 127,
      stderr: '',
      platform: 'linux',
      missingLibs: ['libatk-1.0.so.0'],
    });
    expect(failure.code).toBe('provision-missing-libs');
    expect(failure.detail).toContain('exit code 127');
  });

  it('detects a sandbox refusal from stderr', () => {
    const failure = diagnoseStartupExit({
      binary: '/usr/bin/google-chrome',
      code: 1,
      stderr: '[42:42] Running as root without --no-sandbox is not supported.',
      platform: 'linux',
      missingLibs: [],
    });
    expect(failure.code).toBe('startup-sandbox');
    expect(failure.message).toMatch(/regular user/);
    expect(failure.message).not.toMatch(/headless/);
  });

  it('points a Linux sandbox crash at the AppArmor userns profile, not headless', () => {
    const failure = diagnoseStartupExit({
      binary: '/home/h/.dsh/browser/chrome-linux64/chrome',
      code: 133,
      stderr: '[1:1:FATAL:zygote_host_impl_linux.cc(127)] No usable sandbox!',
      platform: 'linux',
      missingLibs: [],
    });
    expect(failure.code).toBe('startup-sandbox');
    expect(failure.message).toMatch(/AppArmor/);
    expect(failure.message).not.toMatch(/headless|no-sandbox/);
    expect(failure.detail).toContain(
      'profile botharness-chrome "/home/h/.dsh/browser/chrome-linux64/chrome" flags=(unconfined) {',
    );
    expect(failure.detail).toContain('  userns,');
    expect(failure.detail).toContain('No usable sandbox!');
  });

  it('keeps AppArmor advice off non-Linux sandbox failures', () => {
    const failure = diagnoseStartupExit({
      binary: '/Applications/Chrome',
      code: 1,
      stderr: 'sandbox initialization failed',
      platform: 'darwin',
    });
    expect(failure.code).toBe('startup-sandbox');
    expect(failure.message).not.toMatch(/AppArmor|headless/);
  });

  it('keeps a bounded stderr tail for unexplained crashes', () => {
    const failure = diagnoseStartupExit({
      binary: '/usr/bin/google-chrome',
      code: 1,
      stderr: `x${'y'.repeat(900)}`,
      platform: 'linux',
      missingLibs: [],
    });
    expect(failure.code).toBe('startup-crashed');
    expect(failure.message).toContain('code 1');
    expect(failure.detail?.length).toBeLessThanOrEqual(500);
    const empty = diagnoseStartupExit({ binary: '/b', code: null, stderr: '', platform: 'darwin' });
    expect(empty.detail).toBe('exit code unknown');
  });

  it('reports timeouts and missing binaries with actions', () => {
    const timeout = startupTimeoutFailure(20_000);
    expect(timeout.code).toBe('startup-timeout');
    expect(timeout.message).toContain('20s');
    expect(missingBinaryFailure('/opt/missing').code).toBe('startup-missing-binary');
    expect(missingBinaryFailure('/opt/missing').message).toContain('/opt/missing');
    expect(missingBinaryFailure('').message).toMatch(/No Chrome, Edge, or Chromium/);
  });

  it('maps spawn refusals to antivirus-or-permissions guidance', () => {
    const gone = spawnFailure(
      Object.assign(new Error('spawn /cache/chrome ENOENT'), { code: 'ENOENT' }),
      '/cache/chrome',
    );
    expect(gone.code).toBe('startup-spawn-failed');
    expect(gone.message).toMatch(/antivirus/);
    expect(gone.message).toContain('/cache/chrome');
    expect(gone.detail).toContain('ENOENT');
    const denied = spawnFailure(
      Object.assign(new Error('spawn EACCES'), { code: 'EACCES' }),
      '/cache/chrome',
    );
    expect(denied.code).toBe('startup-spawn-failed');
    expect(denied.message).toMatch(/permissions/);
  });
});
