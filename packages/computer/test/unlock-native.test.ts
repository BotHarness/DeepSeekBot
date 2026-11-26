import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';

it.runIf(process.platform === 'darwin')(
  'rejects helper key changes, replay and unsafe lock surfaces and submits at most once in native code',
  () => {
    const directory = mkdtempSync(join(tmpdir(), 'computer-unlock-test-'));
    const cwd = fileURLToPath(new URL('../../../', import.meta.url));
    const executable = join(directory, 'unlock-tests');
    try {
      execFileSync(
        'xcrun',
        [
          'swiftc',
          '-swift-version',
          '5',
          'apps/mobile/modules/computer-unlock/ios/UnlockWire.swift',
          'packages/computer/native/unlock/MacScreenUnlock.swift',
          'packages/computer/native/unlock/MacSystemAccount.swift',
          'packages/computer/native/unlock/MacUnlockIdentity.swift',
          'packages/computer/native/unlock/MacUnlockServer.swift',
          'packages/computer/test/native/UnlockTests.swift',
          '-o',
          executable,
        ],
        { cwd, stdio: 'pipe', shell: false, windowsHide: true, timeout: 30_000 },
      );
      execFileSync(executable, [], {
        cwd,
        stdio: 'pipe',
        shell: false,
        windowsHide: true,
        timeout: 5_000,
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
  45_000,
);
