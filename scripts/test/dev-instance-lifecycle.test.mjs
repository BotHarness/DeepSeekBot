import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  acquireHome,
  matchesHomeProcess,
  verifyStartedHost,
  processIsRunning,
} from '../dev-instance-lifecycle.mjs';
import { pnpmCommand } from '../dev-package-manager.mjs';

const delay = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(predicate) {
  const deadline = Date.now() + 30_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Fixture deadline exceeded');
    await delay(25);
  }
}
function members(pid) {
  return execFileSync('ps', ['-eo', 'pid=,pgid='], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/u).map(Number))
    .filter(([id, group]) => group === pid && id !== pid)
    .map(([id]) => id)
    .filter(processIsRunning);
}
async function stop(child) {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await once(child, 'exit');
  }
  for (const pid of members(child.pid)) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  await until(() => members(child.pid).length === 0);
}
const workerSource = `const server=require('node:net').createServer();server.listen(0,'127.0.0.1',()=>process.send({pid:process.pid,port:server.address().port}));`;
function fixtureHost(respawn = false) {
  const source = `const {spawn}=require('node:child_process');function worker(){const c=spawn(process.execPath,['-e',${JSON.stringify(workerSource)}],{stdio:['ignore','ignore','ignore','ipc']});c.on('message',m=>process.send(m));}worker();${respawn ? "process.on('SIGTERM',()=>{worker();setTimeout(()=>process.exit(0),150)});" : ''}setInterval(()=>{},1000);`;
  const child = spawn(process.execPath, ['-e', source], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  child.ownedProcessGroup = true;
  return child;
}

describe('Home resource ownership across handoff and interruption', () => {
  it.skipIf(process.platform !== 'linux')(
    'distinguishes a Linux zombie from an active process',
    async () => {
      const parent = spawn(
        'python3',
        [
          '-u',
          '-c',
          'import os,time; pid=os.fork(); (os._exit(0) if pid==0 else print(pid,flush=True)); time.sleep(30)',
        ],
        { stdio: ['ignore', 'pipe', 'ignore'] },
      );
      try {
        const [chunk] = await once(parent.stdout, 'data');
        const pid = Number(String(chunk).trim());
        await until(() => !processIsRunning(pid));
        expect(processIsRunning(parent.pid)).toBe(true);
        expect(readFileSync(`/proc/${pid}/stat`, 'utf8')).toMatch(/\) Z /u);
      } finally {
        if (parent.exitCode === null && parent.signalCode === null) {
          parent.kill();
          await once(parent, 'exit');
        }
      }
    },
  );
  it.each(['ax-cli', 'packaged-cli'])(
    'admits another Windows Home for %s while protecting its own',
    (runtime) => {
      const entry = [
        [
          2147483000,
          `node.exe "C:\\QA A\\${runtime}\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js"`,
        ],
      ];
      expect(matchesHomeProcess(entry, 'C:\\QA B', true)).toBe(false);
      expect(matchesHomeProcess(entry, 'c:\\qa a\\', true)).toBe(true);
    },
  );
  it('runs preparation only through a recorded command process', async () => {
    const home = mkdtempSync(join(tmpdir(), 'bh-prepare-'));
    const lease = acquireHome(home);
    try {
      const result = await lease.run(
        process.execPath,
        [
          '-e',
          `const fs=require('node:fs');const record=JSON.parse(fs.readFileSync(${JSON.stringify(join(home, '.botharness-host.json'))},'utf8'));console.log(record.resources.some(r=>r.pid===process.ppid));`,
        ],
        { cwd: home },
      );
      expect(result.trim()).toBe('true');
      await expect(
        lease.run(process.execPath, [
          '-e',
          "process.stderr.write('fixture failure');process.exit(7)",
        ]),
      ).rejects.toThrow('fixture failure');
    } finally {
      lease.release();
      rmSync(home, { recursive: true, force: true });
    }
  });
  it.skipIf(process.platform === 'win32')(
    'does not hang on pipes inherited by an abandoned preparation descendant',
    async () => {
      const home = mkdtempSync(join(tmpdir(), 'bh-prepare-orphan-'));
      const lease = acquireHome(home);
      try {
        await expect(
          lease.run(process.execPath, [
            '-e',
            "require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'}).unref()",
          ]),
        ).rejects.toThrow('Preparation left running descendants');
      } finally {
        const resources = JSON.parse(
          readFileSync(join(home, '.botharness-host.json'), 'utf8'),
        ).resources;
        for (const resource of resources) {
          for (const pid of members(resource.pid)) {
            try {
              process.kill(pid, 'SIGTERM');
            } catch {}
          }
          await until(() => members(resource.pid).length === 0);
        }
        lease.release();
        rmSync(home, { recursive: true, force: true });
      }
    },
  );
  it.skipIf(process.platform === 'win32')(
    'refuses Home reuse after a successful Host exits with live descendants',
    async () => {
      const home = mkdtempSync(join(tmpdir(), 'bh-handoff-'));
      const child = fixtureHost();
      let lease;
      try {
        await once(child, 'message');
        lease = acquireHome(home);
        lease.started(child, 'fixture.log');
        await verifyStartedHost(child, async () => ({ ok: true }));
        lease.release();
        lease = undefined;
        child.kill();
        await once(child, 'exit');
        expect(members(child.pid).length).toBeGreaterThan(0);
        expect(() => acquireHome(home)).toThrow('in use');
        await stop(child);
        const next = acquireHome(home);
        next.release();
      } finally {
        await stop(child);
        lease?.release();
        rmSync(home, { recursive: true, force: true });
      }
    },
  );
  it.skipIf(process.platform === 'win32')(
    'rescans descendants created by shutdown handlers',
    async () => {
      const child = fixtureHost(true);
      try {
        await once(child, 'message');
        await expect(
          verifyStartedHost(child, async () => {
            throw new Error('probe failed');
          }),
        ).rejects.toThrow('probe failed');
        expect(child.cleanupIncomplete).toBe(false);
        expect(members(child.pid)).toEqual([]);
      } finally {
        await stop(child);
      }
    },
  );
  it.skipIf(process.platform === 'win32')(
    'blocks reuse after interrupting a real offline pnpm installation',
    async () => {
      const home = mkdtempSync(join(tmpdir(), 'bh-install-interruption-'));
      writeFileSync(
        join(home, 'package.json'),
        JSON.stringify({
          name: 'bh-install-interruption',
          private: true,
          scripts: { postinstall: 'node slow-install.cjs' },
        }),
      );
      writeFileSync(
        join(home, 'slow-install.cjs'),
        "const fs=require('node:fs');fs.writeFileSync('install-ready',String(process.pid));const timer=setInterval(()=>{if(fs.existsSync('install-release'))clearInterval(timer)},25);",
      );
      const [command, args] = pnpmCommand(['install', '--offline']);
      const module = new URL('../dev-instance-lifecycle.mjs', import.meta.url).href;
      const code = `import {acquireHome} from ${JSON.stringify(module)};const lease=acquireHome(${JSON.stringify(home)});await lease.run(${JSON.stringify(command)},${JSON.stringify(args)},{cwd:${JSON.stringify(home)}});lease.release();`;
      const launcher = spawn(process.execPath, ['--input-type=module', '-e', code], {
        stdio: 'ignore',
      });
      let resources = [];
      try {
        await until(() => existsSync(join(home, 'install-ready')));
        resources = JSON.parse(readFileSync(join(home, '.botharness-host.json'), 'utf8')).resources;
        expect(resources.length).toBe(1);
        launcher.kill('SIGKILL');
        await once(launcher, 'exit');
        expect(members(resources[0].pid).length).toBeGreaterThan(0);
        expect(() => acquireHome(home)).toThrow('in use');
        writeFileSync(join(home, 'install-release'), 'done');
        await until(() => {
          try {
            if (processIsRunning(resources[0].pid)) return false;
            return members(resources[0].pid).length === 0;
          } catch {
            return members(resources[0].pid).length === 0;
          }
        });
        const next = acquireHome(home);
        next.release();
      } finally {
        writeFileSync(join(home, 'install-release'), 'done');
        if (launcher.exitCode === null && launcher.signalCode === null) {
          launcher.kill();
          await once(launcher, 'exit');
        }
        const ownerPath = join(home, '.botharness-host.json');
        if (existsSync(ownerPath))
          resources = JSON.parse(readFileSync(ownerPath, 'utf8')).resources ?? resources;
        for (const resource of resources) {
          for (const pid of [resource.pid, ...members(resource.pid)]) {
            try {
              process.kill(pid, 'SIGTERM');
            } catch (error) {
              if (error.code !== 'ESRCH') throw error;
            }
          }
          await until(() => {
            try {
              if (processIsRunning(resource.pid)) return false;
              return members(resource.pid).length === 0;
            } catch {
              return members(resource.pid).length === 0;
            }
          });
        }
        rmSync(home, { recursive: true, force: true });
      }
    },
    45_000,
  );
});
