import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { buildShellIsolationProbe } from '../e2e-team-security.mjs';

const run = promisify(execFile);
const probeName = 'b2-probe-fixture.cjs';

it('keeps B2 discovery off recursive filesystem scans', () => {
  const home = join('fixtures', 'test profile');
  const account = join(home, 'spaces', 'bob', 'bob-account.md');
  const probe = buildShellIsolationProbe({
    home,
    foreignFiles: [account],
    account,
    own: join(home, 'own.txt'),
    outside: join(home, 'spaces', 'bob', 'outside.txt'),
    port: '12345',
  });
  expect(probe).not.toMatch(/^(?:find\s|grep\s+-[^\s]*r)/mu);
});

it('reports synthetic reads, discovery, writes, environment presence and loopback in one short result', async () => {
  const home = await mkdtemp(join(tmpdir(), 'm15 B2-'));
  const server = createServer((socket) => socket.end());
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const member = join(home, "other member's space");
    await mkdir(member);
    const account = join(member, 'bob-account.md');
    const host = join(home, 'host-fixture.txt');
    const own = join(home, 'own.txt');
    const outside = join(member, 'outside.txt');
    const probe = join(home, probeName);
    await writeFile(account, 'FAKE_ACCOUNT');
    await writeFile(host, 'FAKE_HOST_DATA');
    await writeFile(outside, 'preserve existing file');
    await writeFile(
      probe,
      buildShellIsolationProbe({
        foreignFiles: [account, host],
        account,
        own,
        outside,
        port: server.address().port,
      }),
    );
    const { stdout } = await run(process.execPath, [probe], {
      env: { B2_TEST_SECRET: 'FAKE_SECRET_VALUE' },
      timeout: 3000,
      shell: false,
      windowsHide: true,
    });
    expect(stdout.trim()).toBe(
      `B2_PROBE ${JSON.stringify({
        ownWrite: 'ok',
        reads: ['ok', 'ok'],
        discovery: 'listed',
        outsideWrite: 'EEXIST',
        secretEnv: 1,
        hostApi: 'connected',
      })}`,
    );
    expect(await readFile(own, 'utf8')).toBe('OWN_OK');
    expect(await readFile(outside, 'utf8')).toBe('preserve existing file');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(home, { recursive: true, force: true });
  }
});
