import { createServer as httpServer } from 'node:http';
import { statSync } from 'node:fs';
import { cookieFor, rpc } from '../verify-app.mjs';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once, EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { acquireHome, matchesHomeProcess, verifyStartedHost } from '../dev-instance-lifecycle.mjs';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { dshCommand, describeRuntime, verifyPluginLayer } from '../dev-instance.mjs';
import { assertDshVersion } from '../dsh-compatibility.mjs';
import { qualifiedImProvider } from '../dev-im-provider.mjs';

describe('development CLI admission', () => {
  it.each([
    '0.2.0-rc.1',
    '0.2.0',
    '0.2.1-rc.2',
    '0.2.1-rc.3',
    '0.2.1-rc.99',
    '0.2.2-rc.1',
    '0.3.0-rc.1',
    '1.0.0-rc.1',
  ])('launches installed %s independently of the SDK pin', (version) => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-admission-'));
    try {
      const cli = join(root, 'node_modules/@deepseek-ai/dsh');
      mkdirSync(join(cli, 'lib'), { recursive: true });
      writeFileSync(join(cli, 'lib/bin.js'), '');
      writeFileSync(join(cli, 'package.json'), JSON.stringify({ version }));
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ devDependencies: { '@deepseek-ai/dsh': '0.2.1-rc.3' } }),
      );
      expect(dshCommand(root)).toEqual([process.execPath, join(cli, 'lib/bin.js')]);
      expect(describeRuntime({ worktree: root, imProvider: true })).toEqual({
        runtime: root,
        dshVersion: version,
        imProvider: { source: qualifiedImProvider.source, upstreamReleased: false },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it.each(['0.1.9', 'latest', undefined])(
    'rejects missing or below-floor version %s',
    (version) => {
      expect(() => assertDshVersion(version)).toThrow('API floor');
    },
  );
});

describe('development Home ownership and startup failure', () => {
  it('blocks concurrent preparation and a live Host, then allows a stopped Home', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-home-lease-'));
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
    });
    try {
      const lease = acquireHome(home);
      expect(() => acquireHome(home)).toThrow('already in progress');
      lease.started(child, 'test.log');
      lease.release();
      expect(() => acquireHome(home)).toThrow('in use');
      await expect(
        verifyStartedHost(child, async () => {
          throw new Error('API timeout');
        }),
      ).rejects.toThrow('API timeout');
      expect(child.signalCode).toBe('SIGTERM');
      const next = acquireHome(home);
      next.release();
      expect(existsSync(join(home, '.botharness-host.json'))).toBe(false);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        await once(child, 'exit');
      }
      rmSync(home, { recursive: true, force: true });
    }
  });
  it.each(['token timeout', 'login failure', 'API timeout', 'unhealthy API'])(
    'waits for Host exit on %s',
    async (reason) => {
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        stdio: 'ignore',
      });
      try {
        await expect(
          verifyStartedHost(child, async () => {
            throw new Error(reason);
          }),
        ).rejects.toThrow(reason);
        expect(child.signalCode).toBe('SIGTERM');
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill();
          await once(child, 'exit');
        }
      }
    },
  );
  it('fails closed for a legacy Windows Host whose Home is absent from the command line', () => {
    expect(
      matchesHomeProcess(
        [[987654, 'node C:\\repo\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js --profile web']],
        'C:\\home',
        true,
      ),
    ).toBe(true);
    expect(matchesHomeProcess([[987654, 'node unrelated.js']], 'C:\\home', true)).toBe(false);
  });
  it('recovers a launch lock after its launcher exits', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-interrupted-'));
    const module = new URL('../dev-instance-lifecycle.mjs', import.meta.url).href;
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { acquireHome } from ${JSON.stringify(module)}; acquireHome(${JSON.stringify(home)});`,
      ],
      { stdio: 'ignore' },
    );
    try {
      await once(child, 'exit');
      expect(child.exitCode).toBe(0);
      const lease = acquireHome(home);
      lease.release();
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        await once(child, 'exit');
      }
      rmSync(home, { recursive: true, force: true });
    }
  });
  it('retains a blocked Home when descendant discovery or cleanup is incomplete', () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-unknown-cleanup-'));
    try {
      const lease = acquireHome(home);
      const child = { pid: 2147483647, exitCode: 1, signalCode: null, cleanupIncomplete: true };
      lease.started(child, 'retained.log');
      lease.release();
      expect(() => acquireHome(home)).toThrow('cleanup is unresolved');
      expect(existsSync(join(home, '.botharness-host.json'))).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
  it('does not mistake a failed termination for process exit', async () => {
    const child = new EventEmitter();
    Object.assign(child, {
      pid: 2147483647,
      exitCode: null,
      signalCode: null,
      kill() {
        this.emit('error', new Error('kill refused'));
        return false;
      },
    });
    await expect(
      verifyStartedHost(
        child,
        async () => {
          throw new Error('probe failed');
        },
        10,
      ),
    ).rejects.toThrow('cleanup incomplete');
  });
  it.each([false, true])(
    'releases descendant ports when Host early-exit is %s',
    async (earlyExit) => {
      const source = `const { spawn } = require('node:child_process'); const child = spawn(process.execPath, ['-e', "const server=require('node:net').createServer(); server.listen(0,'127.0.0.1',()=>process.send({port:server.address().port,pid:process.pid}));"], {stdio:['ignore','ignore','ignore','ipc']}); child.on('message', value=>process.send(value)); setInterval(()=>{},1000);`;
      const child = spawn(process.execPath, ['-e', source], {
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });
      child.ownedProcessGroup = process.platform !== 'win32';
      let descendant;
      try {
        [descendant] = await once(child, 'message');
        if (earlyExit) {
          child.kill();
          await once(child, 'exit');
        }
        await expect(
          verifyStartedHost(child, async () => {
            throw new Error('probe failed');
          }),
        ).rejects.toThrow('probe failed');
        expect(() => process.kill(descendant.pid, 0)).toThrow();
        const server = createServer();
        try {
          await new Promise((done, reject) => {
            server.once('error', reject);
            server.listen(descendant.port, '127.0.0.1', done);
          });
        } finally {
          await new Promise((done) => server.close(done));
        }
      } finally {
        if (descendant) {
          try {
            process.kill(descendant.pid, 'SIGTERM');
          } catch {}
        }
        if (child.exitCode === null && child.signalCode === null) {
          child.kill();
          await once(child, 'exit');
        }
      }
    },
  );
  it('reports early exit instead of waiting for the token deadline', async () => {
    const child = spawn(process.execPath, ['-e', 'process.exit(1)'], { stdio: 'ignore' });
    await expect(
      verifyStartedHost(child, async (check) => {
        await once(child, 'exit');
        check();
      }),
    ).rejects.toThrow('exited before');
  });
});

describe('launcher authentication handoff', () => {
  it('persists a private cookie usable by the independent verifier', async () => {
    const home = mkdtempSync(join(tmpdir(), 'bh-cookie-handoff-'));
    const jar = join(tmpdir(), `dsh-${home.split(/[\\/]/u).at(-1)}.cookies`);
    const server = httpServer((request, response) => {
      if (request.url.startsWith('/?token=')) {
        response.setHeader('set-cookie', 'dsh-test=session; HttpOnly');
        response.end();
      } else {
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            result: { ok: request.headers.cookie === 'dsh-test=session', value: { bots: [] } },
          }),
        );
      }
    });
    try {
      await new Promise((done) => server.listen(0, '127.0.0.1', done));
      const url = `http://127.0.0.1:${server.address().port}/?token=fixture`;
      expect(await verifyPluginLayer(url, { home })).toMatchObject({ ok: true });
      expect(cookieFor(home)).toBe('dsh-test=session');
      if (process.platform !== 'win32') expect(statSync(jar).mode & 0o777).toBe(0o600);
      await expect(rpc({ url, home }, 'botharness/list')).resolves.toBeDefined();
    } finally {
      await new Promise((done) => server.close(done));
      rmSync(jar, { force: true });
      rmSync(home, { recursive: true, force: true });
    }
  });
});

it('keeps authentication separate for two Homes with the same basename', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bh-cookie-isolation-'));
  const basename = root.split(/[\\/]/u).at(-1);
  const homes = [join(root, 'a', basename), join(root, 'b', basename)];
  for (const home of homes) mkdirSync(home, { recursive: true });
  const server = httpServer((request, response) => {
    if (request.url.startsWith('/?token='))
      response.setHeader('set-cookie', `dsh-test=${request.url.split('=')[1]}; HttpOnly`);
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ result: { ok: true } }));
  });
  try {
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    for (let i = 0; i < homes.length; i++)
      await verifyPluginLayer(`http://127.0.0.1:${server.address().port}/?token=session${i}`, {
        home: homes[i],
      });
    expect(cookieFor(homes[0])).toBe('dsh-test=session0');
    expect(cookieFor(homes[1])).toBe('dsh-test=session1');
  } finally {
    await new Promise((done) => server.close(done));
    rmSync(root, { recursive: true, force: true });
    rmSync(join(tmpdir(), `dsh-${basename}.cookies`), { force: true });
  }
});
